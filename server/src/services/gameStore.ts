import { pool } from "../db.js";
import type { BingoCard, GameState, LinePattern, PlayerState } from "../types.js";
import { generateDrawSequence } from "./bingoLogic.js";

interface GameRow {
  id: string;
  session_code: string;
  admin_id: string | null;
  admin_name: string;
  status: string;
  currency: string;
  contribution_amount: number;
  commission_percent: number;
  winning_line_target: number;
  allowed_line_patterns: string[];
  allow_full_house: boolean;
  drawn_numbers: number[];
  remaining_numbers: number[] | null;
  winners: GameState["winners"];
  countdown: number | null;
  draw_interval_seconds: number | null;
  started_at: Date | null;
  finished_at: Date | null;
}

interface CardRow {
  player_id: string;
  player_name: string;
  phone_number: string;
  numbers: BingoCard;
  winner: boolean;
  pattern: string | null;
}

function allNumbers(): number[] {
  return Array.from({ length: 75 }, (_, index) => index + 1);
}

function rebuildRemainingNumbers(drawn: number[], stored: number[] | null): number[] {
  if (stored && stored.length > 0) {
    return stored;
  }
  const drawnSet = new Set(drawn);
  return allNumbers().filter((value) => !drawnSet.has(value));
}

export async function loadGameFromDb(gameId: string): Promise<GameState | null> {
  const gameResult = await pool.query<GameRow>(
    `SELECT id, session_code, admin_id, admin_name, status, currency, contribution_amount,
            commission_percent, winning_line_target, allowed_line_patterns, allow_full_house,
            drawn_numbers, remaining_numbers, winners, countdown, draw_interval_seconds,
            started_at, finished_at
     FROM games WHERE session_code = $1`,
    [gameId],
  );

  const row = gameResult.rows[0];
  if (!row) return null;

  const cardsResult = await pool.query<CardRow>(
    `SELECT player_id, player_name, phone_number, numbers, winner, pattern
     FROM cards WHERE game_id = $1`,
    [row.id],
  );

  const players: Record<string, PlayerState> = {};
  for (const card of cardsResult.rows) {
    players[card.player_id] = {
      player_id: card.player_id,
      player_name: card.player_name,
      phone_number: card.phone_number,
      card: card.numbers,
      winner: card.winner,
      pattern: card.pattern,
    };
  }

  const drawnNumbers = row.drawn_numbers ?? [];
  const remainingNumbers = rebuildRemainingNumbers(drawnNumbers, row.remaining_numbers);

  return {
    game_id: row.session_code,
    database_id: row.id,
    admin_id: row.admin_id ?? "unknown",
    admin_name: row.admin_name,
    status: row.status as GameState["status"],
    currency: row.currency,
    contribution_amount: row.contribution_amount,
    commission_percent: row.commission_percent,
    countdown: row.countdown ?? 5,
    draw_interval_seconds: row.draw_interval_seconds ?? 3,
    drawn_numbers: drawnNumbers,
    remaining_numbers: remainingNumbers,
    players,
    winners: (row.winners ?? []) as GameState["winners"],
    winning_line_target: row.winning_line_target,
    allowed_line_patterns: (row.allowed_line_patterns ?? [
      "horizontal",
      "vertical",
      "diagonal",
    ]) as LinePattern[],
    allow_full_house: row.allow_full_house,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

export async function loadRecoverableGames(): Promise<GameState[]> {
  const gameResult = await pool.query<GameRow>(
    `SELECT id, session_code, admin_id, admin_name, status, currency, contribution_amount,
            commission_percent, winning_line_target, allowed_line_patterns, allow_full_house,
            drawn_numbers, remaining_numbers, winners, countdown, draw_interval_seconds,
            started_at, finished_at
     FROM games
     WHERE status IN ('waiting', 'countdown', 'active')`,
  );

  const games: GameState[] = [];
  for (const row of gameResult.rows) {
    const game = await loadGameFromDb(row.session_code);
    if (game) games.push(game);
  }
  return games;
}

export function createInitialRemainingNumbers(): number[] {
  return generateDrawSequence();
}
