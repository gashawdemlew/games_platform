import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { ensureDefaultAdmin } from "./services/authService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(projectRoot, "server", ".env") });

const { Pool } = pg;

function normalizeDatabaseUrl(raw: string): string {
  return raw.replace(/^postgresql\+psycopg:/, "postgresql:");
}

function requiresCloudSsl(hostname: string): boolean {
  return hostname.includes("supabase.co") || hostname.includes("neon.tech");
}

function parsePoolConfig(rawUrl: string): { connectionString: string; ssl?: { rejectUnauthorized: boolean } } {
  const normalized = normalizeDatabaseUrl(rawUrl);
  const parsed = new URL(normalized);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("uselibpqcompat");

  const connectionString = parsed.toString();
  const ssl = requiresCloudSsl(parsed.hostname) ? { rejectUnauthorized: false } : undefined;
  return { connectionString, ssl };
}

const rawDatabaseUrl =
  process.env.DATABASE_URL ?? "postgresql://gashawdemlew@localhost/bingo_db";

const poolConfig = parsePoolConfig(rawDatabaseUrl);

export const DATABASE_URL = poolConfig.connectionString;

export const pool = new Pool({
  connectionString: poolConfig.connectionString,
  ssl: poolConfig.ssl,
  max: Number(process.env.PG_POOL_MAX ?? "10"),
});

export function getDatabaseUrl(): string {
  if (process.env.NODE_ENV === "production") {
    try {
      const parsed = new URL(DATABASE_URL);
      return `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
    } catch {
      return "[configured]";
    }
  }
  return DATABASE_URL;
}

export async function verifyDatabaseConnection(): Promise<void> {
  try {
    const parsed = new URL(DATABASE_URL);
    await pool.query("SELECT 1");
    return;
  } catch (error) {
    const parsed = new URL(DATABASE_URL);
    const hostname = parsed.hostname;
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("ENOTFOUND")) {
      throw new Error(
        `Cannot resolve database host "${hostname}". ` +
          "Check DATABASE_URL in the project root .env file. " +
          "Copy the connection string from your Neon or Supabase dashboard.",
      );
    }

    if (message.includes("password authentication failed")) {
      throw new Error(
        "Database password rejected. If your password contains @, #, or %, URL-encode it (e.g. @ → %40).",
      );
    }

    throw new Error(`Database connection failed (${hostname}): ${message}`);
  }
}

export async function initDb(): Promise<void> {
  await verifyDatabaseConnection();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS games (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_code VARCHAR(32) NOT NULL UNIQUE,
      admin_id VARCHAR(32),
      admin_name VARCHAR(80) NOT NULL DEFAULT 'Admin',
      status VARCHAR(20) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
      contribution_amount DOUBLE PRECISION NOT NULL DEFAULT 100,
      commission_percent DOUBLE PRECISION NOT NULL DEFAULT 15,
      total_collected DOUBLE PRECISION NOT NULL DEFAULT 0,
      commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      prize_pool_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      payout_per_winner DOUBLE PRECISION NOT NULL DEFAULT 0,
      winner_count INTEGER NOT NULL DEFAULT 0,
      winning_line_target INTEGER NOT NULL DEFAULT 1,
      allowed_line_patterns JSONB NOT NULL DEFAULT '["horizontal","vertical","diagonal"]'::jsonb,
      allow_full_house BOOLEAN NOT NULL DEFAULT TRUE,
      drawn_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
      remaining_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
      winners JSONB NOT NULL DEFAULT '[]'::jsonb,
      countdown INTEGER NOT NULL DEFAULT 5,
      draw_interval_seconds INTEGER NOT NULL DEFAULT 3,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      started_at TIMESTAMP NULL,
      finished_at TIMESTAMP NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      player_id VARCHAR(32) NOT NULL UNIQUE,
      player_name VARCHAR(80) NOT NULL,
      phone_number VARCHAR(30) NOT NULL,
      numbers JSONB NOT NULL,
      pattern VARCHAR(20) NULL,
      winner BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(80) NOT NULL DEFAULT 'Admin',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS player_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name VARCHAR(80) NOT NULL,
      phone_number VARCHAR(30) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    ALTER TABLE games ADD COLUMN IF NOT EXISTS session_code VARCHAR(32);
    ALTER TABLE games ADD COLUMN IF NOT EXISTS admin_id VARCHAR(32);
    ALTER TABLE games ADD COLUMN IF NOT EXISTS drawn_numbers JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS remaining_numbers JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS winners JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS admin_name VARCHAR(80) NOT NULL DEFAULT 'Admin';
    ALTER TABLE games ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'ETB';
    ALTER TABLE games ADD COLUMN IF NOT EXISTS contribution_amount DOUBLE PRECISION NOT NULL DEFAULT 100;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS commission_percent DOUBLE PRECISION NOT NULL DEFAULT 15;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS total_collected DOUBLE PRECISION NOT NULL DEFAULT 0;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS prize_pool_amount DOUBLE PRECISION NOT NULL DEFAULT 0;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS payout_per_winner DOUBLE PRECISION NOT NULL DEFAULT 0;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS winner_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS winning_line_target INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS allowed_line_patterns JSONB NOT NULL DEFAULT '["horizontal","vertical","diagonal"]'::jsonb;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS allow_full_house BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS countdown INTEGER NOT NULL DEFAULT 5;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS draw_interval_seconds INTEGER NOT NULL DEFAULT 3;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS player_id VARCHAR(32);
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS player_name VARCHAR(80) NOT NULL DEFAULT 'Guest';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30) NOT NULL DEFAULT '';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS pattern VARCHAR(20);
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS winner BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES player_profiles(id) ON DELETE SET NULL;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS registration_status VARCHAR(20) NOT NULL DEFAULT 'approved';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'cash';
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS receipt_data TEXT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_game_profile ON cards(game_id, profile_id) WHERE profile_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_phone ON player_profiles(phone_number);
  `);

  await ensureDefaultAdmin();
}
