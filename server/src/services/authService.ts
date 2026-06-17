import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import type { AdminProfile } from "../types.js";

const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET ?? "bingo-admin-secret-change-me";
const TOKEN_TTL_HOURS = Number(process.env.ADMIN_TOKEN_TTL_HOURS ?? "12");
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin12345";
const DEFAULT_ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME ?? "Floor Manager";

export function hashPassword(password: string, salt?: string): string {
  const saltValue = salt ?? crypto.randomBytes(16).toString("hex");
  const digest = crypto.pbkdf2Sync(password, saltValue, 120000, 32, "sha256").toString("hex");
  return `${saltValue}$${digest}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, storedHash] = passwordHash.split("$", 2);
  const candidate = hashPassword(password, salt);
  const expected = `${salt}$${storedHash}`;
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

function signPayload(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("hex");
  return `${body.toString("base64url")}.${signature}`;
}

function decodeToken(token: string): Record<string, string> {
  try {
    const [encodedPayload, signature] = token.split(".", 2);
    const body = Buffer.from(encodedPayload!, "base64url");
    const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature!), Buffer.from(expected))) {
      throw new Error("Invalid token signature");
    }
    const payload = JSON.parse(body.toString("utf-8")) as Record<string, string>;
    if (new Date(payload.exp!) < new Date()) {
      throw new Error("Expired");
    }
    return payload;
  } catch {
    const err = new Error("Invalid admin token") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
}

function issueAdminToken(admin: { id: string; username: string; display_name: string }): string {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
  return signPayload({
    sub: admin.id,
    username: admin.username,
    display_name: admin.display_name,
    exp: expiresAt.toISOString(),
  });
}

export async function ensureDefaultAdmin(): Promise<void> {
  const existing = await pool.query(
    "SELECT id FROM admin_users WHERE username = $1",
    [DEFAULT_ADMIN_USERNAME],
  );
  if (existing.rowCount === 0) {
    await pool.query(
      `INSERT INTO admin_users (id, username, password_hash, display_name, is_active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [
        randomUUID(),
        DEFAULT_ADMIN_USERNAME,
        hashPassword(DEFAULT_ADMIN_PASSWORD),
        DEFAULT_ADMIN_DISPLAY_NAME,
      ],
    );
  }
}

export async function authenticateAdmin(
  username: string,
  password: string,
): Promise<{ token: string; admin: AdminProfile }> {
  const result = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    password_hash: string;
    is_active: boolean;
  }>("SELECT * FROM admin_users WHERE username = $1", [username]);

  const admin = result.rows[0];
  if (!admin || !admin.is_active || !verifyPassword(password, admin.password_hash)) {
    const err = new Error("Invalid username or password") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return {
    token: issueAdminToken(admin),
    admin: {
      id: admin.id,
      username: admin.username,
      display_name: admin.display_name,
    },
  };
}

export async function getAdminFromToken(token: string): Promise<AdminProfile> {
  const payload = decodeToken(token);
  const result = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    is_active: boolean;
  }>("SELECT * FROM admin_users WHERE id = $1", [payload.sub]);

  const admin = result.rows[0];
  if (!admin || !admin.is_active) {
    const err = new Error("Admin account unavailable") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  return {
    id: admin.id,
    username: admin.username,
    display_name: admin.display_name,
  };
}

export async function listAdminUsers() {
  const result = await pool.query(
    `SELECT id, username, display_name, is_active, created_at
     FROM admin_users ORDER BY created_at DESC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    is_active: row.is_active,
    created_at: row.created_at,
  }));
}

export async function createAdminUser(
  username: string,
  password: string,
  displayName: string,
  isActive = true,
) {
  if (password.length < 8) {
    const err = new Error("Password must be at least 8 characters") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const existing = await pool.query("SELECT id FROM admin_users WHERE username = $1", [username]);
  if (existing.rowCount && existing.rowCount > 0) {
    const err = new Error("Username already exists") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const inserted = await pool.query(
    `INSERT INTO admin_users (id, username, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, display_name, is_active, created_at`,
    [randomUUID(), username, hashPassword(password), displayName || "Admin", isActive],
  );
  return inserted.rows[0]!;
}

export async function updateAdminUser(
  adminId: string,
  displayName: string | null | undefined,
  password: string | null | undefined,
  isActive: boolean | null | undefined,
) {
  const existing = await pool.query("SELECT * FROM admin_users WHERE id = $1", [adminId]);
  const admin = existing.rows[0];
  if (!admin) {
    const err = new Error("Admin user not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (password != null) {
    if (password.length < 8) {
      const err = new Error("Password must be at least 8 characters") as Error & {
        statusCode: number;
      };
      err.statusCode = 400;
      throw err;
    }
    admin.password_hash = hashPassword(password);
  }
  if (displayName != null && displayName.trim()) {
    admin.display_name = displayName.trim();
  }
  if (isActive != null) {
    admin.is_active = isActive;
  }

  const updated = await pool.query(
    `UPDATE admin_users
     SET display_name = $2, password_hash = $3, is_active = $4
     WHERE id = $1
     RETURNING id, username, display_name, is_active, created_at`,
    [adminId, admin.display_name, admin.password_hash, admin.is_active],
  );
  return updated.rows[0]!;
}
