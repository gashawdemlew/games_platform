import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import type {
  AdminAnalyticsResponse,
  GameFinance,
  GameRecordRow,
  GameState,
  LinePattern,
  PlayerState,
  PlayerSummary,
  WinnerInfo,
} from "../types.js";
import { ConnectionManager } from "../websocket/connectionManager.js";
import { checkWin, generateBingoCard, markCard } from "./bingoLogic.js";
import { createInitialRemainingNumbers, loadGameFromDb, loadRecoverableGames } from "./gameStore.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

class AsyncLock {
  private chain: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chain;
    this.chain = previous.then(() => wait);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class GameManager {
  games = new Map<string, GameState>();
  private drawTasks = new Map<string, Promise<void>>();
  connectionManager = new ConnectionManager();
  private lock = new AsyncLock();
  countdownSeconds = 5;
  drawIntervalSeconds = 3;

  async recoverActiveGames(): Promise<void> {
    const games = await loadRecoverableGames();
    for (const game of games) {
      this.games.set(game.game_id, game);
      if (game.status === "countdown" || game.status === "active") {
        await this.ensureGameLoop(game.game_id);
      }
    }
  }

  async createGame(
    adminName: string,
    contributionAmount: number,
    commissionPercent: number,
    currency: string,
    winningLineTarget = 1,
    allowedLinePatterns: LinePattern[] | null = null,
    allowFullHouse = true,
  ) {
    return this.lock.run(async () => {
      const gameId = shortId();
      const adminId = shortId();
      const resolvedPatterns = allowedLinePatterns ?? ["horizontal", "vertical", "diagonal"];
      const remainingNumbers = createInitialRemainingNumbers();
      const gameRecord = await this.createGameRecords(
        gameId,
        adminId,
        adminName,
        contributionAmount,
        commissionPercent,
        currency,
        winningLineTarget,
        resolvedPatterns,
        allowFullHouse,
        remainingNumbers,
      );

      const game: GameState = {
        game_id: gameId,
        database_id: gameRecord.id,
        admin_id: adminId,
        admin_name: adminName,
        status: "waiting",
        currency,
        contribution_amount: roundMoney(contributionAmount),
        commission_percent: roundMoney(commissionPercent),
        countdown: this.countdownSeconds,
        draw_interval_seconds: this.drawIntervalSeconds,
        drawn_numbers: [],
        remaining_numbers: remainingNumbers,
        players: {},
        winners: [],
        winning_line_target: Math.max(1, winningLineTarget),
        allowed_line_patterns: resolvedPatterns,
        allow_full_house: allowFullHouse,
        started_at: null,
        finished_at: null,
      };
      this.games.set(gameId, game);
      await this.syncGameState(game);

      return {
        game_id: gameId,
        admin_id: adminId,
        admin_name: adminName,
        status: game.status,
        draw_interval_seconds: game.draw_interval_seconds,
        countdown: game.countdown,
        admin_url: `/game/${gameId}?adminId=${adminId}`,
        finance: this.buildFinance(game),
      };
    });
  }

  async updateGameSettings(
    gameId: string,
    payload: {
      admin_id: string;
      contribution_amount: number;
      commission_percent: number;
      currency: string;
      winning_line_target: number;
      allowed_line_patterns: LinePattern[];
      allow_full_house: boolean;
    },
  ) {
    await this.lock.run(async () => {
      const game = await this.resolveGame(gameId);
      if (game.admin_id !== payload.admin_id) {
        throw Object.assign(new Error("Only the admin can update this game"), { statusCode: 403 });
      }
      if (game.status !== "waiting") {
        throw Object.assign(new Error("Settings can only be changed before the game starts"), {
          statusCode: 400,
        });
      }

      game.contribution_amount = roundMoney(payload.contribution_amount);
      game.commission_percent = roundMoney(payload.commission_percent);
      game.currency = payload.currency;
      game.winning_line_target = Math.max(1, payload.winning_line_target);
      game.allowed_line_patterns = payload.allowed_line_patterns ?? [
        "horizontal",
        "vertical",
        "diagonal",
      ];
      game.allow_full_house = payload.allow_full_house;
      await this.syncGameState(game);
    });
    return this.getGame(gameId);
  }

  async registerPlayer(gameId: string, playerName: string, phoneNumber: string) {
    let game!: GameState;
    let player!: PlayerState;

    await this.lock.run(async () => {
      game = await this.resolveGame(gameId);
      if (game.status !== "waiting") {
        throw Object.assign(new Error("Players can only be registered before the game starts"), {
          statusCode: 400,
        });
      }
      if (Object.values(game.players).some((p) => p.player_name === playerName)) {
        throw Object.assign(new Error("Player name already registered in this game"), {
          statusCode: 400,
        });
      }
      if (Object.values(game.players).some((p) => p.phone_number === phoneNumber)) {
        throw Object.assign(new Error("Phone number already registered in this game"), {
          statusCode: 400,
        });
      }

      const playerId = shortId();
      player = {
        player_id: playerId,
        player_name: playerName,
        phone_number: phoneNumber,
        card: generateBingoCard(),
        winner: false,
        pattern: null,
      };
      game.players[playerId] = player;
      await this.createPlayerRecord(gameId, playerId, playerName, phoneNumber, player.card);
      await this.syncGameState(game);
    });

    await this.connectionManager.broadcast(gameId, {
      type: "player_joined",
      player_count: Object.keys(game.players).length,
      players: this.serializePlayers(game),
    });

    return {
      game_id: gameId,
      status: game.status,
      player_id: player.player_id,
      player_name: player.player_name,
      phone_number: player.phone_number,
      card: player.card,
      draw_interval_seconds: game.draw_interval_seconds,
      countdown: game.countdown,
      player_url: `/game/${gameId}?playerId=${player.player_id}`,
      whatsapp_share_url: this.buildWhatsappShareUrl(gameId, player.player_id, player.player_name),
      websocket_path: `/ws/game/${gameId}?player_id=${player.player_id}`,
    };
  }

  async startGame(gameId: string, adminId: string) {
    await this.lock.run(async () => {
      const game = await this.resolveGame(gameId);
      if (game.admin_id !== adminId) {
        throw Object.assign(new Error("Only the admin can start this game"), { statusCode: 403 });
      }
      if (game.status !== "waiting") {
        throw Object.assign(new Error("Game has already started"), { statusCode: 400 });
      }
      if (Object.keys(game.players).length === 0) {
        throw Object.assign(new Error("Register at least one player before starting"), {
          statusCode: 400,
        });
      }
    });
    await this.ensureGameLoop(gameId);
    return this.getGame(gameId);
  }

  async getGame(gameId: string) {
    const game = await this.resolveGame(gameId);
    return {
      game_id: game.game_id,
      admin_id: game.admin_id,
      admin_name: game.admin_name,
      status: game.status,
      countdown: game.countdown,
      draw_interval_seconds: game.draw_interval_seconds,
      drawn_numbers: game.drawn_numbers,
      winners: game.winners,
      player_count: Object.keys(game.players).length,
      players: this.serializePlayers(game),
      finance: this.buildFinance(game, game.winners.length || undefined),
      winning_line_target: game.winning_line_target,
      allowed_line_patterns: game.allowed_line_patterns,
      allow_full_house: game.allow_full_house,
      started_at: game.started_at,
      finished_at: game.finished_at,
    };
  }

  async getPlayerSnapshot(gameId: string, playerId: string) {
    const game = await this.resolveGame(gameId);
    if (game.status === "finished") {
      throw Object.assign(new Error("Player link expired because this game has ended"), {
        statusCode: 410,
      });
    }
    const player = game.players[playerId];
    if (!player) {
      throw Object.assign(new Error("Player not found"), { statusCode: 404 });
    }

    return {
      game_id: game.game_id,
      admin_id: game.admin_id,
      admin_name: game.admin_name,
      status: game.status,
      countdown: game.countdown,
      draw_interval_seconds: game.draw_interval_seconds,
      drawn_numbers: game.drawn_numbers,
      winners: game.winners,
      player_count: Object.keys(game.players).length,
      player,
      finance: this.buildFinance(game, game.winners.length || undefined),
    };
  }

  async getAdminAnalytics(): Promise<AdminAnalyticsResponse> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);

    const weeklyBuckets: Date[] = [];
    for (let index = 6; index >= 0; index -= 1) {
      const day = new Date(todayStart);
      day.setDate(day.getDate() - index);
      weeklyBuckets.push(day);
    }

    const monthlyBucketKeys: Array<[number, number]> = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const anchor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      monthlyBucketKeys.push([anchor.getFullYear(), anchor.getMonth() + 1]);
    }

    const gamesResult = await pool.query<GameRecordRow>("SELECT * FROM games");
    const games = gamesResult.rows;

    let dailyCommission = 0;
    let weeklyCommission = 0;
    let monthlyCommission = 0;
    let dailyGames = 0;
    let weeklyGames = 0;
    let monthlyGames = 0;

    const weeklyRollup = new Map(
      weeklyBuckets.map((day) => [
        day.toISOString().slice(0, 10),
        { commission: 0, games: 0 },
      ]),
    );
    const monthlyRollup = new Map(
      monthlyBucketKeys.map((key) => [`${key[0]}-${key[1]}`, { commission: 0, games: 0 }]),
    );

    const recentFinishedGames: AdminAnalyticsResponse["recent_finished_games"] = [];

    for (const game of games) {
      const createdAt = game.created_at ? new Date(game.created_at) : now;
      const finishedAt = game.finished_at ? new Date(game.finished_at) : createdAt;

      if (createdAt >= todayStart) dailyGames += 1;
      if (createdAt >= weekStart) weeklyGames += 1;
      if (createdAt >= monthStart) monthlyGames += 1;

      if (game.status === "finished") {
        const commissionValue = roundMoney(game.commission_amount ?? 0);
        if (finishedAt >= todayStart) dailyCommission += commissionValue;
        if (finishedAt >= weekStart) weeklyCommission += commissionValue;
        if (finishedAt >= monthStart) monthlyCommission += commissionValue;

        const finishedKey = finishedAt.toISOString().slice(0, 10);
        if (weeklyRollup.has(finishedKey)) {
          const bucket = weeklyRollup.get(finishedKey)!;
          bucket.commission += commissionValue;
          bucket.games += 1;
        }

        const monthKey = `${finishedAt.getFullYear()}-${finishedAt.getMonth() + 1}`;
        if (monthlyRollup.has(monthKey)) {
          const bucket = monthlyRollup.get(monthKey)!;
          bucket.commission += commissionValue;
          bucket.games += 1;
        }

        const normalizedWinners: WinnerInfo[] = (game.winners ?? []).map((winner) => {
          const w = winner as WinnerInfo;
          return {
            player_id: w.player_id ?? "",
            player_name: w.player_name ?? "Unknown",
            phone_number: w.phone_number ?? "",
            pattern: w.pattern ?? "horizontal",
            payout_amount: Number(w.payout_amount ?? 0),
          };
        });

        recentFinishedGames.push({
          game_id: game.session_code,
          started_at: game.started_at,
          finished_at: game.finished_at,
          winner_count: game.winner_count ?? normalizedWinners.length,
          winners: normalizedWinners,
          finance: {
            currency: game.currency,
            contribution_amount: roundMoney(game.contribution_amount ?? 0),
            commission_percent: roundMoney(game.commission_percent ?? 0),
            total_collected: roundMoney(game.total_collected ?? 0),
            commission_amount: roundMoney(game.commission_amount ?? 0),
            prize_pool_amount: roundMoney(game.prize_pool_amount ?? 0),
            payout_per_winner: roundMoney(game.payout_per_winner ?? 0),
          },
        });
      }
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyTrend = weeklyBuckets.map((day) => {
      const key = day.toISOString().slice(0, 10);
      const bucket = weeklyRollup.get(key)!;
      return {
        label: dayNames[day.getDay()]!,
        commission_amount: roundMoney(bucket.commission),
        game_count: bucket.games,
      };
    });

    const monthlyTrend = monthlyBucketKeys.map(([year, month]) => {
      const key = `${year}-${month}`;
      const bucket = monthlyRollup.get(key)!;
      return {
        label: `${year}-${String(month).padStart(2, "0")}`,
        commission_amount: roundMoney(bucket.commission),
        game_count: bucket.games,
      };
    });

    recentFinishedGames.sort(
      (a, b) =>
        new Date(b.finished_at ?? 0).getTime() - new Date(a.finished_at ?? 0).getTime(),
    );

    return {
      daily_commission: roundMoney(dailyCommission),
      weekly_commission: roundMoney(weeklyCommission),
      monthly_commission: roundMoney(monthlyCommission),
      daily_games: dailyGames,
      weekly_games: weeklyGames,
      monthly_games: monthlyGames,
      weekly_trend: weeklyTrend,
      monthly_trend: monthlyTrend,
      recent_finished_games: recentFinishedGames.slice(0, 8),
    };
  }

  async getPlayer(gameId: string, playerId: string): Promise<PlayerState> {
    const game = await this.resolveGame(gameId);
    const player = game.players[playerId];
    if (!player) {
      throw Object.assign(new Error("Player not found"), { statusCode: 404 });
    }
    return player;
  }

  async ensureGameLoop(gameId: string): Promise<void> {
    await this.lock.run(async () => {
      const game = await this.resolveGame(gameId);
      if (game.status === "finished") return;
      if (!this.drawTasks.has(gameId)) {
        const task = this.runGame(gameId).finally(() => {
          this.drawTasks.delete(gameId);
        });
        this.drawTasks.set(gameId, task);
      }
    });
  }

  private async runGame(gameId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (!game) return;

    if (game.status === "waiting" || game.status === "countdown") {
      if (game.status === "waiting") {
        game.status = "countdown";
        game.countdown = this.countdownSeconds;
        await this.syncGameState(game);
      }

      while (game.countdown > 0 && game.status === "countdown") {
        await this.connectionManager.broadcast(gameId, {
          type: "countdown",
          countdown: game.countdown,
          player_count: Object.keys(game.players).length,
        });
        await sleep(1000);
        game.countdown -= 1;
        await this.syncGameState(game);
      }

      game.status = "active";
      game.countdown = 0;
      const startedAt = game.started_at ?? new Date();
      await this.syncGameState(game, startedAt);
      await this.connectionManager.broadcast(gameId, {
        type: "game_started",
        drawn_numbers: game.drawn_numbers,
        player_count: Object.keys(game.players).length,
      });
    }

    while (game.remaining_numbers.length > 0 && game.status === "active") {
      await sleep(game.draw_interval_seconds * 1000);
      const number = game.remaining_numbers.shift()!;
      game.drawn_numbers.push(number);

      const newWinners: WinnerInfo[] = [];
      for (const player of Object.values(game.players)) {
        markCard(player.card, number);
        const result = checkWin(
          player.card,
          game.winning_line_target,
          game.allowed_line_patterns,
          game.allow_full_house,
        );
        if (result.winner && !player.winner && result.pattern) {
          player.winner = true;
          player.pattern = result.pattern;
          newWinners.push({
            player_id: player.player_id,
            player_name: player.player_name,
            phone_number: player.phone_number,
            pattern: result.pattern,
            payout_amount: 0,
          });
        }
        await this.syncPlayerState(player);
      }

      if (newWinners.length > 0) {
        const payoutAmount = this.calculatePayoutPerWinner(game, newWinners.length);
        game.winners = newWinners.map((winner) => ({
          ...winner,
          payout_amount: payoutAmount,
        }));
      }

      await this.syncGameState(game);

      await this.connectionManager.broadcast(gameId, {
        type: "draw",
        number,
        drawn_numbers: game.drawn_numbers,
        last_number: number,
        winners: game.winners,
        new_winners: newWinners,
        player_count: Object.keys(game.players).length,
      });

      if (newWinners.length > 0) {
        await this.connectionManager.broadcast(gameId, {
          type: "winner",
          winners: game.winners,
          finance: this.buildFinance(game, game.winners.length),
        });
        break;
      }
    }

    game.status = "finished";
    game.finished_at = new Date();
    await this.syncGameState(game, undefined, game.finished_at);
    await this.connectionManager.broadcast(gameId, {
      type: "game_over",
      drawn_numbers: game.drawn_numbers,
      winners: game.winners,
      finance: this.buildFinance(game, game.winners.length || undefined),
    });
  }

  private async resolveGame(gameId: string): Promise<GameState> {
    const cached = this.games.get(gameId);
    if (cached) return cached;

    const loaded = await loadGameFromDb(gameId);
    if (!loaded) {
      throw Object.assign(new Error("Game not found"), { statusCode: 404 });
    }

    this.games.set(gameId, loaded);
    return loaded;
  }

  private getGameOrThrow(gameId: string): GameState {
    const game = this.games.get(gameId);
    if (!game) {
      throw Object.assign(new Error("Game not found"), { statusCode: 404 });
    }
    return game;
  }

  private serializePlayers(game: GameState): PlayerSummary[] {
    return Object.values(game.players).map((player) => ({
      player_id: player.player_id,
      player_name: player.player_name,
      phone_number: player.phone_number,
      winner: player.winner,
      pattern: player.pattern,
    }));
  }

  buildFinance(game: GameState, winnerCount?: number): GameFinance {
    const totalCollected = roundMoney(Object.keys(game.players).length * game.contribution_amount);
    const commissionAmount = roundMoney(totalCollected * (game.commission_percent / 100));
    const prizePoolAmount = roundMoney(totalCollected - commissionAmount);
    const payoutPerWinner =
      winnerCount && winnerCount > 0 ? roundMoney(prizePoolAmount / winnerCount) : 0;
    return {
      currency: game.currency,
      contribution_amount: roundMoney(game.contribution_amount),
      commission_percent: roundMoney(game.commission_percent),
      total_collected: totalCollected,
      commission_amount: commissionAmount,
      prize_pool_amount: prizePoolAmount,
      payout_per_winner: payoutPerWinner,
    };
  }

  private calculatePayoutPerWinner(game: GameState, winnerCount: number): number {
    return this.buildFinance(game, winnerCount).payout_per_winner;
  }

  private buildWhatsappShareUrl(gameId: string, playerId: string, playerName: string): string {
    const message = `Hello ${playerName}, your Bingo card is ready. Open your private card here: /game/${gameId}?playerId=${playerId}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  private async createGameRecords(
    gameId: string,
    adminId: string,
    adminName: string,
    contributionAmount: number,
    commissionPercent: number,
    currency: string,
    winningLineTarget: number,
    allowedLinePatterns: LinePattern[],
    allowFullHouse: boolean,
    remainingNumbers: number[],
  ) {
    const dbId = randomUUID();
    const result = await pool.query<{ id: string }>(
      `INSERT INTO games (
        id, session_code, admin_id, admin_name, status, currency, contribution_amount, commission_percent,
        total_collected, commission_amount, prize_pool_amount, payout_per_winner, winner_count,
        winning_line_target, allowed_line_patterns, allow_full_house, drawn_numbers, remaining_numbers,
        winners, countdown, draw_interval_seconds
      ) VALUES ($1,$2,$3,$4,'waiting',$5,$6,$7,0,0,0,0,0,$8,$9,$10,'[]'::jsonb,$11,'[]'::jsonb,$12,$13)
      RETURNING id`,
      [
        dbId,
        gameId,
        adminId,
        adminName,
        currency,
        roundMoney(contributionAmount),
        roundMoney(commissionPercent),
        Math.max(1, winningLineTarget),
        JSON.stringify(allowedLinePatterns),
        allowFullHouse,
        JSON.stringify(remainingNumbers),
        this.countdownSeconds,
        this.drawIntervalSeconds,
      ],
    );
    return result.rows[0]!;
  }

  private async createPlayerRecord(
    sessionCode: string,
    playerId: string,
    playerName: string,
    phoneNumber: string,
    card: unknown,
  ) {
    const gameResult = await pool.query<{ id: string }>(
      "SELECT id FROM games WHERE session_code = $1",
      [sessionCode],
    );
    const game = gameResult.rows[0];
    if (!game) {
      throw Object.assign(new Error("Game not found in database"), { statusCode: 404 });
    }

    const userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, username) VALUES ($1, $2)`,
      [userId, `${playerName}-${playerId}`],
    );

    const cardId = randomUUID();
    await pool.query(
      `INSERT INTO cards (id, game_id, user_id, player_id, player_name, phone_number, numbers, winner)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
      [cardId, game.id, userId, playerId, playerName, phoneNumber, JSON.stringify(card)],
    );
  }

  private async syncGameState(
    game: GameState,
    startedAt?: Date,
    finishedAt?: Date,
  ): Promise<void> {
    const finance = this.buildFinance(game, game.winners.length || undefined);
    const result = await pool.query(
      `UPDATE games SET
        admin_id = $2, admin_name = $3, status = $4, currency = $5, contribution_amount = $6,
        commission_percent = $7, total_collected = $8, commission_amount = $9,
        prize_pool_amount = $10, payout_per_winner = $11, winner_count = $12,
        winning_line_target = $13, allowed_line_patterns = $14, allow_full_house = $15,
        drawn_numbers = $16, remaining_numbers = $17, winners = $18,
        countdown = $19, draw_interval_seconds = $20,
        started_at = COALESCE($21, started_at),
        finished_at = COALESCE($22, finished_at)
      WHERE session_code = $1`,
      [
        game.game_id,
        game.admin_id,
        game.admin_name,
        game.status,
        game.currency,
        game.contribution_amount,
        game.commission_percent,
        finance.total_collected,
        finance.commission_amount,
        finance.prize_pool_amount,
        finance.payout_per_winner,
        game.winners.length,
        game.winning_line_target,
        JSON.stringify(game.allowed_line_patterns),
        game.allow_full_house,
        JSON.stringify(game.drawn_numbers),
        JSON.stringify(game.remaining_numbers),
        JSON.stringify(game.winners),
        game.countdown,
        game.draw_interval_seconds,
        startedAt ?? null,
        finishedAt ?? null,
      ],
    );

    if (startedAt) {
      game.started_at = startedAt;
    }
    if (finishedAt) {
      game.finished_at = finishedAt;
    }

    void result;
  }

  private async syncPlayerState(player: PlayerState): Promise<void> {
    await pool.query(
      `UPDATE cards SET numbers = $2, player_name = $3, phone_number = $4, winner = $5, pattern = $6, updated_at = NOW()
       WHERE player_id = $1`,
      [
        player.player_id,
        JSON.stringify(player.card),
        player.player_name,
        player.phone_number,
        player.winner,
        player.pattern,
      ],
    );
  }
}

export const gameManager = new GameManager();
