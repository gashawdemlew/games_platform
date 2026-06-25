# Bingo Game Platform

Production-ready MVP for a 75-ball Bingo game with:

- **Node.js** (Fastify + TypeScript) API and WebSocket server
- React client (Vite)
- WebSocket real-time updates
- PostgreSQL persistence for users, games, and cards
- Menu-based admin console for dashboard, setup, trends, and admin-user management
- Link expiration for player share URLs after game completion

## Project Structure

```text
server/          # Fastify + TypeScript API & WebSocket
client/          # React + Vite frontend
sql/schema.sql   # PostgreSQL reference schema
package.json     # Root scripts (dev, build, start)
```

## Prerequisites

- Node.js 20+
- PostgreSQL (local, **Neon**, Supabase, or any hosted Postgres)

Copy `.env.example` to `.env` and set your connection string:

```bash
cp .env.example .env
```

**Neon example** (from Neon Dashboard → Connection string):

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb
```

SSL is enabled automatically when the host contains `neon.tech` or `supabase.co`.

## Install

```bash
npm run install:all
```

## Development

Runs API on **8088** and Vite on **5173** (API proxied through Vite — same origin, no CORS):

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Default admin: `admin` / `admin12345` (override with `ADMIN_USERNAME`, `ADMIN_PASSWORD`).

## Production

```bash
npm run build
npm start
```

Serves the built React app and API on port **8088** (set `PORT` to change).

## Production reliability

The server now persists live game runtime state in Postgres:

- `admin_id`, `remaining_numbers`, `countdown`, `draw_interval_seconds`
- player cards in `cards`
- on startup, **waiting / countdown / active** games are reloaded and draw loops resume

This helps survive Render restarts and deploys. WebSocket clients still reconnect after a restart.

## Deploy on Render + Neon

1. Create a **Neon** project and copy the Postgres connection string.
2. Push this repo to GitHub.
3. In Render, create a **Web Service** (or use `render.yaml`).
4. Set environment variables:
   - `DATABASE_URL` = your Neon connection string
   - `ADMIN_TOKEN_SECRET` = long random string
   - `ADMIN_PASSWORD` = strong password
   - `NODE_ENV` = `production`
5. Build command: `npm run install:all && npm run build`
6. Start command: `npm start`

### Can you use Render **free** tier?

**Yes for testing**, with limits:

| Free tier behavior | Impact on Bingo |
|--------------------|-----------------|
| Service sleeps after ~15 min idle | Live games pause; draws resume from DB after wake |
| Cold start (~30s+) | Players must refresh/reconnect WebSocket |
| Single instance | Required (do not scale to multiple instances yet) |
| 750 hrs/month | Enough for demos |

For real production bingo nights, use **Render Starter ($7/mo)** or similar so the app stays always-on and WebSockets stay connected.

**Security:** never commit `.env` or share DB passwords in chat. Rotate credentials if exposed.

## Gameplay Flow

1. An admin creates a game lobby from the home page.
2. The admin registers every player before the draw starts.
3. Each player is registered with name and phone number.
4. The admin can share the private player link through WhatsApp, copied link, or QR code.
5. The admin sets entry contribution and service commission for the game.
6. The admin starts the game once the roster is ready.
7. WebSocket updates stream countdown, draws, and winner events to player views.
8. When one or more players hit Bingo on the same draw, the game stops and the prize pool is split equally after commission deduction.
9. Shared player links expire automatically once the game status is finished.

## API Summary

- `POST /create-game`
- `POST /game/{game_id}/players`
- `PUT /game/{game_id}/settings`
- `POST /game/{game_id}/start`
- `GET /game/{game_id}`
- `GET /game/{game_id}/player/{player_id}`
- `GET /admin/analytics`
- `GET /auth/admin-users`
- `POST /auth/admin-users`
- `PUT /auth/admin-users/{admin_user_id}`
- `POST /auth/login`
- `GET /card`
- `WS /ws/game/{game_id}?player_id={player_id}`

## Environment Variables

| Variable | Default |
|----------|---------|
| `DATABASE_URL` | `postgresql://gashawdemlew@localhost/bingo_db` |
| `PORT` | `8088` |
| `ADMIN_TOKEN_SECRET` | (change in production) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin12345` |

## PostgreSQL Schema

See [sql/schema.sql](sql/schema.sql).

## Legacy Python Backend

The previous FastAPI backend under `app/` is superseded by `server/`. You can remove `app/` and `requirements.txt` once you have verified the Node stack.
