import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import type { PlayerProfile } from "../types.js";

const PLAYER_TOKEN_SECRET =
  process.env.PLAYER_TOKEN_SECRET ?? process.env.ADMIN_TOKEN_SECRET ?? "bingo-player-secret-change-me";
const PLAYER_TOKEN_TTL_HOURS = Number(process.env.PLAYER_TOKEN_TTL_HOURS ?? "720");

function mapProfile(row: {
  id: string;
  full_name: string;
  phone_number: string;
  created_at: Date;
  updated_at: Date;
}): PlayerProfile {
  return {
    id: row.id,
    full_name: row.full_name,
    phone_number: row.phone_number,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function signPayload(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", PLAYER_TOKEN_SECRET).update(body).digest("hex");
  return `${body.toString("base64url")}.${signature}`;
}

function decodeToken(token: string): Record<string, string> {
  try {
    const [encodedPayload, signature] = token.split(".", 2);
    const body = Buffer.from(encodedPayload!, "base64url");
    const expected = crypto.createHmac("sha256", PLAYER_TOKEN_SECRET).update(body).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature!), Buffer.from(expected))) {
      throw new Error("Invalid token signature");
    }
    const payload = JSON.parse(body.toString("utf-8")) as Record<string, string>;
    if (new Date(payload.exp!) < new Date()) {
      throw new Error("Expired");
    }
    return payload;
  } catch {
    const err = new Error("Invalid player token") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
}

function issuePlayerToken(profile: PlayerProfile): string {
  const expiresAt = new Date(Date.now() + PLAYER_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  return signPayload({
    sub: profile.id,
    phone_number: profile.phone_number,
    full_name: profile.full_name,
    exp: expiresAt.toISOString(),
  });
}

export async function findProfileByPhone(phoneNumber: string): Promise<PlayerProfile | null> {
  const result = await pool.query(
    `SELECT id, full_name, phone_number, created_at, updated_at
     FROM player_profiles WHERE phone_number = $1`,
    [phoneNumber.trim()],
  );
  const row = result.rows[0];
  return row ? mapProfile(row) : null;
}

export async function createPlayerProfile(fullName: string, phoneNumber: string): Promise<PlayerProfile> {
  const existing = await findProfileByPhone(phoneNumber);
  if (existing) {
    throw Object.assign(new Error("A player profile already exists for this phone number"), {
      statusCode: 400,
    });
  }

  const id = randomUUID();
  const result = await pool.query(
    `INSERT INTO player_profiles (id, full_name, phone_number)
     VALUES ($1, $2, $3)
     RETURNING id, full_name, phone_number, created_at, updated_at`,
    [id, fullName.trim(), phoneNumber.trim()],
  );
  return mapProfile(result.rows[0]!);
}

export async function getPlayerProfile(profileId: string): Promise<PlayerProfile | null> {
  const result = await pool.query(
    `SELECT id, full_name, phone_number, created_at, updated_at
     FROM player_profiles WHERE id = $1`,
    [profileId],
  );
  const row = result.rows[0];
  return row ? mapProfile(row) : null;
}

export async function updatePlayerProfile(
  profileId: string,
  fullName: string,
  phoneNumber: string,
): Promise<PlayerProfile> {
  const duplicate = await pool.query(
    `SELECT id FROM player_profiles WHERE phone_number = $1 AND id <> $2`,
    [phoneNumber.trim(), profileId],
  );
  if (duplicate.rowCount && duplicate.rowCount > 0) {
    throw Object.assign(new Error("Phone number is already used by another profile"), { statusCode: 400 });
  }

  const result = await pool.query(
    `UPDATE player_profiles
     SET full_name = $2, phone_number = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING id, full_name, phone_number, created_at, updated_at`,
    [profileId, fullName.trim(), phoneNumber.trim()],
  );
  const row = result.rows[0];
  if (!row) {
    throw Object.assign(new Error("Player profile not found"), { statusCode: 404 });
  }
  return mapProfile(row);
}

export async function establishPlayerSession(
  fullName: string,
  phoneNumber: string,
): Promise<{ token: string; profile: PlayerProfile }> {
  const trimmedPhone = phoneNumber.trim();
  const trimmedName = fullName.trim();

  let profile = await findProfileByPhone(trimmedPhone);
  if (!profile) {
    if (!trimmedName) {
      throw Object.assign(new Error("Full name is required for new player profiles"), { statusCode: 400 });
    }
    profile = await createPlayerProfile(trimmedName, trimmedPhone);
  } else if (trimmedName && trimmedName !== profile.full_name) {
    profile = await updatePlayerProfile(profile.id, trimmedName, trimmedPhone);
  }

  return {
    token: issuePlayerToken(profile),
    profile,
  };
}

export async function getPlayerFromToken(token: string): Promise<PlayerProfile> {
  const payload = decodeToken(token);
  const profile = await getPlayerProfile(payload.sub!);
  if (!profile) {
    throw Object.assign(new Error("Player profile unavailable"), { statusCode: 401 });
  }
  return profile;
}

export function getPlayerFromRequest(authorization: string | undefined): Promise<PlayerProfile> {
  if (!authorization?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing player authorization"), { statusCode: 401 });
  }
  return getPlayerFromToken(authorization.slice("Bearer ".length));
}
