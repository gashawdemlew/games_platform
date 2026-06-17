from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from app.db import SessionLocal
from app.models.database import BingoCardRecord, GameRecord, UserRecord
from app.models.schemas import (
    AdminAnalyticsResponse,
    AnalyticsBucket,
    CreateGameResponse,
    GameFinance,
    GameResponse,
    GameState,
    PlayerSnapshotResponse,
    PlayerSummary,
    PlayerState,
    RecentGameSummary,
    RegisterPlayerResponse,
    UpdateGameSettingsRequest,
    WinnerInfo,
)
from app.services.bingo_logic import check_win, generate_bingo_card, generate_draw_sequence, mark_card
from app.websocket.manager import ConnectionManager


class GameManager:
    def __init__(self) -> None:
        self.games: dict[str, GameState] = {}
        self.draw_tasks: dict[str, asyncio.Task] = {}
        self.connection_manager = ConnectionManager()
        self.lock = asyncio.Lock()
        self.countdown_seconds = 5
        self.draw_interval_seconds = 3

    async def create_game(
        self,
        admin_name: str,
        contribution_amount: float,
        commission_percent: float,
        currency: str,
        winning_line_target: int = 1,
        allowed_line_patterns: list[str] | None = None,
        allow_full_house: bool = True,
    ) -> CreateGameResponse:
        async with self.lock:
            game_id = uuid4().hex[:8]
            admin_id = uuid4().hex[:8]
            resolved_patterns = allowed_line_patterns or ["horizontal", "vertical", "diagonal"]
            game_record = self._create_game_records(
                game_id=game_id,
                admin_name=admin_name,
                contribution_amount=contribution_amount,
                commission_percent=commission_percent,
                currency=currency,
                winning_line_target=winning_line_target,
                allowed_line_patterns=resolved_patterns,
                allow_full_house=allow_full_house,
            )

            game = GameState(
                game_id=game_id,
                database_id=str(game_record.id),
                admin_id=admin_id,
                admin_name=admin_name,
                status="waiting",
                currency=currency,
                contribution_amount=round(contribution_amount, 2),
                commission_percent=round(commission_percent, 2),
                countdown=self.countdown_seconds,
                draw_interval_seconds=self.draw_interval_seconds,
                remaining_numbers=generate_draw_sequence(),
                players={},
                winning_line_target=max(1, int(winning_line_target)),
                allowed_line_patterns=resolved_patterns,
                allow_full_house=allow_full_house,
            )
            self.games[game_id] = game

        return CreateGameResponse(
            game_id=game_id,
            admin_id=admin_id,
            admin_name=admin_name,
            status=game.status,
            draw_interval_seconds=game.draw_interval_seconds,
            countdown=game.countdown,
            admin_url=f"/game/{game_id}?adminId={admin_id}",
            finance=self._build_finance(game),
        )

    async def update_game_settings(self, game_id: str, payload: UpdateGameSettingsRequest) -> GameResponse:
        async with self.lock:
            game = self.games.get(game_id)
            if game is None:
                raise HTTPException(status_code=404, detail="Game not found")
            if game.admin_id != payload.admin_id:
                raise HTTPException(status_code=403, detail="Only the admin can update this game")
            if game.status != "waiting":
                raise HTTPException(status_code=400, detail="Settings can only be changed before the game starts")

            game.contribution_amount = round(payload.contribution_amount, 2)
            game.commission_percent = round(payload.commission_percent, 2)
            game.currency = payload.currency
            game.winning_line_target = max(1, int(payload.winning_line_target))
            game.allowed_line_patterns = payload.allowed_line_patterns or ["horizontal", "vertical", "diagonal"]
            game.allow_full_house = payload.allow_full_house
            self._sync_game_state(game)

        return await self.get_game(game_id)

    async def register_player(self, game_id: str, player_name: str, phone_number: str) -> RegisterPlayerResponse:
        async with self.lock:
            game = self.games.get(game_id)
            if game is None:
                raise HTTPException(status_code=404, detail="Game not found")
            if game.status != "waiting":
                raise HTTPException(status_code=400, detail="Players can only be registered before the game starts")
            if any(player.player_name == player_name for player in game.players.values()):
                raise HTTPException(status_code=400, detail="Player name already registered in this game")
            if any(player.phone_number == phone_number for player in game.players.values()):
                raise HTTPException(status_code=400, detail="Phone number already registered in this game")

            player_id = uuid4().hex[:8]
            player = PlayerState(
                player_id=player_id,
                player_name=player_name,
                phone_number=phone_number,
                card=generate_bingo_card(),
            )
            game.players[player_id] = player
            self._create_player_record(
                session_code=game_id,
                player_id=player_id,
                player_name=player_name,
                phone_number=phone_number,
                card=player.card.model_dump(),
            )
            self._sync_game_state(game)

        await self.connection_manager.broadcast(
            game_id,
            {
                "type": "player_joined",
                "player_count": len(game.players),
                "players": self._serialize_players(game),
            },
        )

        return RegisterPlayerResponse(
            game_id=game_id,
            status=game.status,
            player_id=player_id,
            player_name=player_name,
            phone_number=phone_number,
            card=player.card,
            draw_interval_seconds=game.draw_interval_seconds,
            countdown=game.countdown,
            player_url=f"/game/{game_id}?playerId={player_id}",
            whatsapp_share_url=self._build_whatsapp_share_url(game_id, player_id, player_name),
            websocket_path=f"/ws/game/{game_id}?player_id={player_id}",
        )

    async def start_game(self, game_id: str, admin_id: str) -> GameResponse:
        async with self.lock:
            game = self.games.get(game_id)
            if game is None:
                raise HTTPException(status_code=404, detail="Game not found")
            if game.admin_id != admin_id:
                raise HTTPException(status_code=403, detail="Only the admin can start this game")
            if game.status != "waiting":
                raise HTTPException(status_code=400, detail="Game has already started")
            if not game.players:
                raise HTTPException(status_code=400, detail="Register at least one player before starting")

        await self.ensure_game_loop(game_id)
        return await self.get_game(game_id)

    async def get_game(self, game_id: str) -> GameResponse:
        game = self.games.get(game_id)
        if game is None:
            raise HTTPException(status_code=404, detail="Game not found")

        return GameResponse(
            game_id=game.game_id,
            admin_id=game.admin_id,
            admin_name=game.admin_name,
            status=game.status,
            countdown=game.countdown,
            draw_interval_seconds=game.draw_interval_seconds,
            drawn_numbers=game.drawn_numbers,
            winners=game.winners,
            player_count=len(game.players),
            players=self._serialize_players(game),
            finance=self._build_finance(game, len(game.winners) or None),
            winning_line_target=game.winning_line_target,
            allowed_line_patterns=game.allowed_line_patterns,
            allow_full_house=game.allow_full_house,
            started_at=game.started_at,
            finished_at=game.finished_at,
        )

    async def get_player_snapshot(self, game_id: str, player_id: str) -> PlayerSnapshotResponse:
        game = self.games.get(game_id)
        if game is None:
            raise HTTPException(status_code=404, detail="Game not found")
        if game.status == "finished":
            raise HTTPException(status_code=410, detail="Player link expired because this game has ended")

        player = game.players.get(player_id)
        if player is None:
            raise HTTPException(status_code=404, detail="Player not found")

        return PlayerSnapshotResponse(
            game_id=game.game_id,
            admin_id=game.admin_id,
            admin_name=game.admin_name,
            status=game.status,
            countdown=game.countdown,
            draw_interval_seconds=game.draw_interval_seconds,
            drawn_numbers=game.drawn_numbers,
            winners=game.winners,
            player_count=len(game.players),
            player=player,
            finance=self._build_finance(game, len(game.winners) or None),
        )

    async def get_admin_analytics(self) -> AdminAnalyticsResponse:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=6)
        month_start = now - timedelta(days=29)
        weekly_buckets = [(today_start - timedelta(days=index)).date() for index in range(6, -1, -1)]
        monthly_bucket_keys: list[tuple[int, int]] = []
        for offset in range(5, -1, -1):
            anchor = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month = anchor.month - offset
            year = anchor.year
            while month <= 0:
                month += 12
                year -= 1
            monthly_bucket_keys.append((year, month))

        with SessionLocal() as db:
            games = db.execute(select(GameRecord)).scalars().all()

        daily_commission = weekly_commission = monthly_commission = 0.0
        daily_games = weekly_games = monthly_games = 0
        weekly_rollup: dict[object, dict[str, float | int]] = {
            key: {"commission": 0.0, "games": 0} for key in weekly_buckets
        }
        monthly_rollup: dict[tuple[int, int], dict[str, float | int]] = {
            key: {"commission": 0.0, "games": 0} for key in monthly_bucket_keys
        }
        recent_finished_games: list[RecentGameSummary] = []

        for game in games:
            created_at = game.created_at.replace(tzinfo=timezone.utc) if game.created_at else now
            finished_at = (
                game.finished_at.replace(tzinfo=timezone.utc)
                if game.finished_at is not None
                else created_at
            )

            if created_at >= today_start:
                daily_games += 1
            if created_at >= week_start:
                weekly_games += 1
            if created_at >= month_start:
                monthly_games += 1

            if game.status == "finished":
                commission_value = round(game.commission_amount or 0.0, 2)
                if finished_at >= today_start:
                    daily_commission += commission_value
                if finished_at >= week_start:
                    weekly_commission += commission_value
                if finished_at >= month_start:
                    monthly_commission += commission_value

                finished_date = finished_at.date()
                if finished_date in weekly_rollup:
                    weekly_rollup[finished_date]["commission"] += commission_value
                    weekly_rollup[finished_date]["games"] += 1

                month_key = (finished_at.year, finished_at.month)
                if month_key in monthly_rollup:
                    monthly_rollup[month_key]["commission"] += commission_value
                    monthly_rollup[month_key]["games"] += 1

                normalized_winners = []
                for winner in (game.winners or []):
                    if isinstance(winner, dict):
                        normalized_winners.append(
                            WinnerInfo(
                                player_id=winner.get("player_id", ""),
                                player_name=winner.get("player_name", "Unknown"),
                                phone_number=winner.get("phone_number", ""),
                                pattern=winner.get("pattern", "horizontal"),
                                payout_amount=float(winner.get("payout_amount", 0.0) or 0.0),
                            )
                        )

                recent_finished_games.append(
                    RecentGameSummary(
                        game_id=game.session_code,
                        started_at=game.started_at,
                        finished_at=game.finished_at,
                        winner_count=game.winner_count or len(game.winners or []),
                        winners=normalized_winners,
                        finance=GameFinance(
                            currency=game.currency,
                            contribution_amount=round(game.contribution_amount or 0.0, 2),
                            commission_percent=round(game.commission_percent or 0.0, 2),
                            total_collected=round(game.total_collected or 0.0, 2),
                            commission_amount=round(game.commission_amount or 0.0, 2),
                            prize_pool_amount=round(game.prize_pool_amount or 0.0, 2),
                            payout_per_winner=round(game.payout_per_winner or 0.0, 2),
                        ),
                    )
                )

        weekly_trend = [
            AnalyticsBucket(
                label=day.strftime("%a"),
                commission_amount=round(float(weekly_rollup[day]["commission"]), 2),
                game_count=int(weekly_rollup[day]["games"]),
            )
            for day in weekly_buckets
        ]
        monthly_trend = [
            AnalyticsBucket(
                label=f"{year}-{month:02d}",
                commission_amount=round(float(monthly_rollup[(year, month)]["commission"]), 2),
                game_count=int(monthly_rollup[(year, month)]["games"]),
            )
            for year, month in monthly_bucket_keys
        ]

        return AdminAnalyticsResponse(
            daily_commission=round(daily_commission, 2),
            weekly_commission=round(weekly_commission, 2),
            monthly_commission=round(monthly_commission, 2),
            daily_games=daily_games,
            weekly_games=weekly_games,
            monthly_games=monthly_games,
            weekly_trend=weekly_trend,
            monthly_trend=monthly_trend,
            recent_finished_games=sorted(
                recent_finished_games,
                key=lambda item: item.finished_at or datetime.min.replace(tzinfo=None),
                reverse=True,
            )[:8],
        )

    def get_player(self, game_id: str, player_id: str) -> PlayerState:
        game = self.games.get(game_id)
        if game is None:
            raise HTTPException(status_code=404, detail="Game not found")

        player = game.players.get(player_id)
        if player is None:
            raise HTTPException(status_code=404, detail="Player not found")
        return player

    async def ensure_game_loop(self, game_id: str) -> None:
        async with self.lock:
            game = self.games.get(game_id)
            if game is None:
                raise HTTPException(status_code=404, detail="Game not found")
            if game.status == "finished":
                return

            current_task = self.draw_tasks.get(game_id)
            if current_task is None or current_task.done():
                self.draw_tasks[game_id] = asyncio.create_task(self._run_game(game_id))

    async def _run_game(self, game_id: str) -> None:
        game = self.games[game_id]
        if game.status == "waiting":
            game.status = "countdown"
            self._sync_game_state(game)
            for remaining in range(self.countdown_seconds, 0, -1):
                game.countdown = remaining
                await self.connection_manager.broadcast(
                    game_id,
                    {
                        "type": "countdown",
                        "countdown": remaining,
                        "player_count": len(game.players),
                    },
                )
                await asyncio.sleep(1)

        game.status = "active"
        game.countdown = 0
        self._sync_game_state(game, started_at=datetime.utcnow())
        await self.connection_manager.broadcast(
            game_id,
            {
                "type": "game_started",
                "drawn_numbers": game.drawn_numbers,
                "player_count": len(game.players),
            },
        )

        while game.remaining_numbers and game.status == "active":
            await asyncio.sleep(game.draw_interval_seconds)
            number = game.remaining_numbers.pop(0)
            game.drawn_numbers.append(number)

            new_winners: list[WinnerInfo] = []
            for player in game.players.values():
                mark_card(player.card, number)
                result = check_win(
                    player.card,
                    winning_line_target=game.winning_line_target,
                    allowed_line_patterns=game.allowed_line_patterns,
                    allow_full_house=game.allow_full_house,
                )
                if result.winner and not player.winner and result.pattern is not None:
                    player.winner = True
                    player.pattern = result.pattern
                    winner = WinnerInfo(
                        player_id=player.player_id,
                        player_name=player.player_name,
                        phone_number=player.phone_number,
                        pattern=result.pattern,
                    )
                    new_winners.append(winner)
                self._sync_player_state(game_id, player)

            if new_winners:
                payout_amount = self._calculate_payout_per_winner(game, len(new_winners))
                game.winners = [
                    WinnerInfo(
                        player_id=winner.player_id,
                        player_name=winner.player_name,
                        phone_number=winner.phone_number,
                        pattern=winner.pattern,
                        payout_amount=payout_amount,
                    )
                    for winner in new_winners
                ]

            self._sync_game_state(game)

            await self.connection_manager.broadcast(
                game_id,
                {
                    "type": "draw",
                    "number": number,
                    "drawn_numbers": game.drawn_numbers,
                    "last_number": number,
                    "winners": [winner.model_dump() for winner in game.winners],
                    "new_winners": [winner.model_dump() for winner in new_winners],
                    "player_count": len(game.players),
                },
            )

            if new_winners:
                await self.connection_manager.broadcast(
                    game_id,
                    {
                        "type": "winner",
                        "winners": [winner.model_dump() for winner in game.winners],
                        "finance": self._build_finance(game, len(game.winners)).model_dump(),
                    },
                )
                break

        game.status = "finished"
        game.finished_at = datetime.utcnow()
        self._sync_game_state(game, finished_at=datetime.utcnow())
        await self.connection_manager.broadcast(
            game_id,
            {
                "type": "game_over",
                "drawn_numbers": game.drawn_numbers,
                "winners": [winner.model_dump() for winner in game.winners],
                "finance": self._build_finance(game, len(game.winners) or None).model_dump(),
            },
        )

    def _create_game_records(
        self,
        game_id: str,
        admin_name: str,
        contribution_amount: float,
        commission_percent: float,
        currency: str,
        winning_line_target: int,
        allowed_line_patterns: list[str],
        allow_full_house: bool,
    ):
        with SessionLocal() as db:
            game = GameRecord(
                session_code=game_id,
                admin_name=admin_name,
                status="waiting",
                currency=currency,
                contribution_amount=round(contribution_amount, 2),
                commission_percent=round(commission_percent, 2),
                total_collected=0.0,
                commission_amount=0.0,
                prize_pool_amount=0.0,
                payout_per_winner=0.0,
                winner_count=0,
                winning_line_target=max(1, int(winning_line_target)),
                allowed_line_patterns=allowed_line_patterns,
                allow_full_house=allow_full_house,
                drawn_numbers=[],
                winners=[],
            )
            db.add(game)
            db.commit()
            db.refresh(game)
            return game

    def _create_player_record(
        self,
        session_code: str,
        player_id: str,
        player_name: str,
        phone_number: str,
        card: dict,
    ) -> None:
        with SessionLocal() as db:
            game = db.execute(
                select(GameRecord).where(GameRecord.session_code == session_code)
            ).scalar_one_or_none()
            if game is None:
                raise HTTPException(status_code=404, detail="Game not found in database")

            user = UserRecord(username=f"{player_name}-{player_id}")
            db.add(user)
            db.flush()
            card_record = BingoCardRecord(
                game_id=game.id,
                user_id=user.id,
                player_id=player_id,
                player_name=player_name,
                phone_number=phone_number,
                numbers=card,
                winner=False,
                pattern=None,
            )
            db.add(card_record)
            db.commit()

    def _sync_game_state(self, game: GameState, started_at: datetime | None = None, finished_at: datetime | None = None) -> None:
        with SessionLocal() as db:
            record = db.execute(
                select(GameRecord).where(GameRecord.session_code == game.game_id)
            ).scalar_one_or_none()
            if record is None:
                return

            finance = self._build_finance(game, len(game.winners) or None)
            record.admin_name = game.admin_name
            record.status = game.status
            record.currency = game.currency
            record.contribution_amount = game.contribution_amount
            record.commission_percent = game.commission_percent
            record.total_collected = finance.total_collected
            record.commission_amount = finance.commission_amount
            record.prize_pool_amount = finance.prize_pool_amount
            record.payout_per_winner = finance.payout_per_winner
            record.winner_count = len(game.winners)
            record.winning_line_target = game.winning_line_target
            record.allowed_line_patterns = game.allowed_line_patterns
            record.allow_full_house = game.allow_full_house
            record.drawn_numbers = game.drawn_numbers
            record.winners = [winner.model_dump() for winner in game.winners]
            if started_at is not None and record.started_at is None:
                record.started_at = started_at
                game.started_at = started_at
            if finished_at is not None:
                record.finished_at = finished_at
                game.finished_at = finished_at
            db.commit()

    def _sync_player_state(self, game_id: str, player: PlayerState) -> None:
        with SessionLocal() as db:
            record = db.execute(
                select(BingoCardRecord).where(BingoCardRecord.player_id == player.player_id)
            ).scalar_one_or_none()
            if record is None:
                return

            record.numbers = player.card.model_dump()
            record.player_name = player.player_name
            record.phone_number = player.phone_number
            record.winner = player.winner
            record.pattern = player.pattern
            db.commit()

    def _serialize_players(self, game: GameState) -> list[PlayerSummary]:
        return [
            PlayerSummary(
                player_id=player.player_id,
                player_name=player.player_name,
                phone_number=player.phone_number,
                winner=player.winner,
                pattern=player.pattern,
            )
            for player in game.players.values()
        ]

    def _build_finance(self, game: GameState, winner_count: int | None = None) -> GameFinance:
        total_collected = round(len(game.players) * game.contribution_amount, 2)
        commission_amount = round(total_collected * (game.commission_percent / 100), 2)
        prize_pool_amount = round(total_collected - commission_amount, 2)
        payout_per_winner = (
            round(prize_pool_amount / winner_count, 2)
            if winner_count and winner_count > 0
            else 0.0
        )
        return GameFinance(
            currency=game.currency,
            contribution_amount=round(game.contribution_amount, 2),
            commission_percent=round(game.commission_percent, 2),
            total_collected=total_collected,
            commission_amount=commission_amount,
            prize_pool_amount=prize_pool_amount,
            payout_per_winner=payout_per_winner,
        )

    def _calculate_payout_per_winner(self, game: GameState, winner_count: int) -> float:
        return self._build_finance(game, winner_count).payout_per_winner

    def _build_whatsapp_share_url(self, game_id: str, player_id: str, player_name: str) -> str:
        message = (
            f"Hello {player_name}, your Bingo card is ready. "
            f"Open your private card here: /game/{game_id}?playerId={player_id}"
        )
        return f"https://wa.me/?text={message.replace(' ', '%20')}"


game_manager = GameManager()
