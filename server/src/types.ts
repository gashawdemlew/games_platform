export type GameStatus = "waiting" | "countdown" | "active" | "finished";
export type LinePattern = "horizontal" | "vertical" | "diagonal";

export interface CardCell {
  letter: string;
  value: number | null;
  is_free: boolean;
  marked: boolean;
}

export interface BingoCard {
  grid: CardCell[][];
}

export interface PlayerState {
  player_id: string;
  player_name: string;
  phone_number: string;
  card: BingoCard;
  winner: boolean;
  pattern: string | null;
}

export interface PlayerSummary {
  player_id: string;
  player_name: string;
  phone_number: string;
  winner: boolean;
  pattern: string | null;
}

export interface WinnerInfo {
  player_id: string;
  player_name: string;
  phone_number: string;
  pattern: string;
  payout_amount: number;
}

export interface GameFinance {
  currency: string;
  contribution_amount: number;
  commission_percent: number;
  total_collected: number;
  commission_amount: number;
  prize_pool_amount: number;
  payout_per_winner: number;
}

export interface GameState {
  game_id: string;
  database_id: string | null;
  admin_id: string;
  admin_name: string;
  status: GameStatus;
  currency: string;
  contribution_amount: number;
  commission_percent: number;
  countdown: number;
  draw_interval_seconds: number;
  drawn_numbers: number[];
  remaining_numbers: number[];
  players: Record<string, PlayerState>;
  winners: WinnerInfo[];
  winning_line_target: number;
  allowed_line_patterns: LinePattern[];
  allow_full_house: boolean;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface AdminProfile {
  id: string;
  username: string;
  display_name: string;
}

export interface AnalyticsBucket {
  label: string;
  commission_amount: number;
  game_count: number;
}

export interface RecentGameSummary {
  game_id: string;
  started_at: Date | null;
  finished_at: Date | null;
  winner_count: number;
  winners: WinnerInfo[];
  finance: GameFinance;
}

export interface AdminAnalyticsResponse {
  daily_commission: number;
  weekly_commission: number;
  monthly_commission: number;
  daily_games: number;
  weekly_games: number;
  monthly_games: number;
  weekly_trend: AnalyticsBucket[];
  monthly_trend: AnalyticsBucket[];
  recent_finished_games: RecentGameSummary[];
}

export interface GameRecordRow {
  id: string;
  session_code: string;
  admin_name: string;
  status: string;
  currency: string;
  contribution_amount: number;
  commission_percent: number;
  total_collected: number;
  commission_amount: number;
  prize_pool_amount: number;
  payout_per_winner: number;
  winner_count: number;
  winning_line_target: number;
  allowed_line_patterns: string[];
  allow_full_house: boolean;
  drawn_numbers: number[];
  winners: WinnerInfo[] | Record<string, unknown>[];
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}
