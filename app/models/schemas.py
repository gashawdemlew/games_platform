from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

GameStatus = Literal["waiting", "countdown", "active", "finished"]
WinPattern = str


class CardCell(BaseModel):
    letter: str
    value: int | None = None
    is_free: bool = False
    marked: bool = False


class BingoCard(BaseModel):
    grid: list[list[CardCell]]


class PlayerState(BaseModel):
    player_id: str
    player_name: str
    phone_number: str
    card: BingoCard
    winner: bool = False
    pattern: WinPattern | None = None


class PlayerSummary(BaseModel):
    player_id: str
    player_name: str
    phone_number: str
    winner: bool = False
    pattern: WinPattern | None = None


class WinnerInfo(BaseModel):
    player_id: str
    player_name: str
    phone_number: str
    pattern: WinPattern
    payout_amount: float = 0.0


class GameFinance(BaseModel):
    currency: str = "ETB"
    contribution_amount: float = 100.0
    commission_percent: float = 15.0
    total_collected: float = 0.0
    commission_amount: float = 0.0
    prize_pool_amount: float = 0.0
    payout_per_winner: float = 0.0


class GameState(BaseModel):
    game_id: str
    database_id: str | None = None
    admin_id: str
    admin_name: str
    status: GameStatus
    currency: str = "ETB"
    contribution_amount: float = 100.0
    commission_percent: float = 15.0
    countdown: int = 0
    draw_interval_seconds: int = 3
    drawn_numbers: list[int] = Field(default_factory=list)
    remaining_numbers: list[int] = Field(default_factory=list)
    players: dict[str, PlayerState] = Field(default_factory=dict)
    winners: list[WinnerInfo] = Field(default_factory=list)
    winning_line_target: int = 1
    allowed_line_patterns: list[Literal["horizontal", "vertical", "diagonal"]] = Field(
        default_factory=lambda: ["horizontal", "vertical", "diagonal"]
    )
    allow_full_house: bool = True
    started_at: datetime | None = None
    finished_at: datetime | None = None


class CreateGameRequest(BaseModel):
    contribution_amount: float = 100.0
    commission_percent: float = 15.0
    currency: str = "ETB"
    winning_line_target: int = 1
    allowed_line_patterns: list[Literal["horizontal", "vertical", "diagonal"]] = Field(
        default_factory=lambda: ["horizontal", "vertical", "diagonal"]
    )
    allow_full_house: bool = True


class RegisterPlayerRequest(BaseModel):
    player_name: str = "Guest"
    phone_number: str


class StartGameRequest(BaseModel):
    admin_id: str


class UpdateGameSettingsRequest(BaseModel):
    admin_id: str
    contribution_amount: float
    commission_percent: float
    currency: str = "ETB"
    winning_line_target: int = 1
    allowed_line_patterns: list[Literal["horizontal", "vertical", "diagonal"]] = Field(
        default_factory=lambda: ["horizontal", "vertical", "diagonal"]
    )
    allow_full_house: bool = True


class CardResponse(BaseModel):
    card: BingoCard


class RegisterPlayerResponse(BaseModel):
    game_id: str
    status: GameStatus
    player_id: str
    player_name: str
    phone_number: str
    card: BingoCard
    draw_interval_seconds: int
    countdown: int
    player_url: str
    whatsapp_share_url: str
    websocket_path: str


class CreateGameResponse(BaseModel):
    game_id: str
    admin_id: str
    admin_name: str
    status: GameStatus
    draw_interval_seconds: int
    countdown: int
    admin_url: str
    finance: GameFinance


class GameResponse(BaseModel):
    game_id: str
    admin_id: str
    admin_name: str
    status: GameStatus
    countdown: int
    draw_interval_seconds: int
    drawn_numbers: list[int]
    winners: list[WinnerInfo]
    player_count: int
    players: list[PlayerSummary]
    finance: GameFinance
    winning_line_target: int
    allowed_line_patterns: list[Literal["horizontal", "vertical", "diagonal"]]
    allow_full_house: bool
    started_at: datetime | None = None
    finished_at: datetime | None = None


class PlayerSnapshotResponse(BaseModel):
    game_id: str
    admin_id: str
    admin_name: str
    status: GameStatus
    countdown: int
    draw_interval_seconds: int
    drawn_numbers: list[int]
    winners: list[WinnerInfo]
    player_count: int
    player: PlayerState
    finance: GameFinance


class AnalyticsBucket(BaseModel):
    label: str
    commission_amount: float
    game_count: int


class RecentGameSummary(BaseModel):
    game_id: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    winner_count: int
    winners: list[WinnerInfo]
    finance: GameFinance


class AdminAnalyticsResponse(BaseModel):
    daily_commission: float
    weekly_commission: float
    monthly_commission: float
    daily_games: int
    weekly_games: int
    monthly_games: int
    weekly_trend: list[AnalyticsBucket]
    monthly_trend: list[AnalyticsBucket]
    recent_finished_games: list[RecentGameSummary]


class AdminProfile(BaseModel):
    id: str
    username: str
    display_name: str


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    admin: AdminProfile


class WinCheckResponse(BaseModel):
    winner: bool
    pattern: WinPattern | None = None


class AdminUserCreateRequest(BaseModel):
    username: str
    password: str
    display_name: str = "Admin"
    is_active: bool = True


class AdminUserUpdateRequest(BaseModel):
    display_name: str | None = None
    password: str | None = None
    is_active: bool | None = None


class AdminUserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    is_active: bool
    created_at: datetime
