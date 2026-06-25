import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { getDatabaseUrl, initDb } from "./db.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerGameRoutes } from "./routes/game.js";
import { registerPlayerRoutes } from "./routes/player.js";
import { gameManager } from "./services/gameManager.js";

const PORT = Number(process.env.PORT ?? "8088");
const HOST = process.env.HOST ?? "0.0.0.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");

function httpError(error: unknown): { statusCode: number; message: string } {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = Number((error as { statusCode: number }).statusCode);
    const message = error instanceof Error ? error.message : "Request failed";
    return { statusCode, message };
  }
  return { statusCode: 500, message: error instanceof Error ? error.message : "Request failed" };
}

async function buildServer() {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, message } = httpError(error);
    reply.status(statusCode).send({ detail: message });
  });

  await app.register(websocket);

  if (process.env.NODE_ENV === "production") {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/",
    });
  }

  app.get("/health", async () => ({
    status: "ok",
    database_url: getDatabaseUrl(),
  }));

  await registerAuthRoutes(app);
  await registerGameRoutes(app);
  await registerPlayerRoutes(app);

  app.get<{ Params: { game_id: string }; Querystring: { player_id: string } }>(
    "/ws/game/:game_id",
    { websocket: true },
    (socket, request) => {
      void (async () => {
      const gameId = request.params.game_id;
      const playerId = request.query.player_id;

      if (!playerId) {
        socket.close(1008, "player_id required");
        return;
      }

      let player;
      try {
        player = await gameManager.getPlayer(gameId, playerId);
      } catch {
        socket.close(1008, "Player not found");
        return;
      }

      const game = gameManager.games.get(gameId);
      if (!game) {
        socket.close(1008, "Game not found");
        return;
      }

      if (player.registration_status !== "approved") {
        socket.close(1008, "Registration not approved");
        return;
      }

      if (game.status === "finished") {
        socket.close(1008, "Game finished");
        return;
      }

      gameManager.connectionManager.add(gameId, socket);

      socket.send(
        JSON.stringify({
          type: "snapshot",
          game_id: gameId,
          admin_id: game.admin_id,
          admin_name: game.admin_name,
          player_id: playerId,
          player_name: player.player_name,
          card: player.card,
          status: game.status,
          countdown: game.countdown,
          draw_interval_seconds: game.draw_interval_seconds,
          drawn_numbers: game.drawn_numbers,
          winners: game.winners,
          player_count: Object.keys(game.players).length,
          finance: gameManager.buildFinance(game, game.winners.length || undefined),
        }),
      );

      if (game.status === "countdown" || game.status === "active") {
        void gameManager.ensureGameLoop(gameId);
      }

      socket.on("close", () => {
        gameManager.connectionManager.remove(gameId, socket);
      });

      socket.on("message", () => {
        // Keep-alive / compatibility with Python server (receive loop).
      });
      })();
    },
  );

  if (process.env.NODE_ENV === "production") {
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== "GET" || request.url.startsWith("/ws")) {
        reply.status(404).send({ detail: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}

async function main() {
  await initDb();
  await gameManager.recoverActiveGames();
  const app = await buildServer();
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Bingo server listening on http://${HOST}:${PORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
