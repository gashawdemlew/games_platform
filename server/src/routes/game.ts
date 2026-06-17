import type { FastifyInstance } from "fastify";
import { generateBingoCard } from "../services/bingoLogic.js";
import { gameManager } from "../services/gameManager.js";
import type { LinePattern } from "../types.js";
import { getAdminFromRequest } from "./auth.js";

export async function registerGameRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      contribution_amount: number;
      commission_percent: number;
      currency: string;
      winning_line_target: number;
      allowed_line_patterns: LinePattern[];
      allow_full_house: boolean;
    };
  }>("/create-game", async (request) => {
    const admin = await getAdminFromRequest(request.headers.authorization);
    return gameManager.createGame(
      admin.display_name,
      request.body.contribution_amount ?? 100,
      request.body.commission_percent ?? 15,
      request.body.currency ?? "ETB",
      request.body.winning_line_target ?? 1,
      request.body.allowed_line_patterns,
      request.body.allow_full_house ?? true,
    );
  });

  app.post<{ Params: { game_id: string }; Body: { player_name: string; phone_number: string } }>(
    "/game/:game_id/players",
    async (request) => {
      await getAdminFromRequest(request.headers.authorization);
      return gameManager.registerPlayer(
        request.params.game_id,
        request.body.player_name ?? "Guest",
        request.body.phone_number,
      );
    },
  );

  app.put<{
    Params: { game_id: string };
    Body: {
      admin_id: string;
      contribution_amount: number;
      commission_percent: number;
      currency: string;
      winning_line_target: number;
      allowed_line_patterns: LinePattern[];
      allow_full_house: boolean;
    };
  }>("/game/:game_id/settings", async (request) => {
    await getAdminFromRequest(request.headers.authorization);
    return gameManager.updateGameSettings(request.params.game_id, request.body);
  });

  app.post<{ Params: { game_id: string }; Body: { admin_id: string } }>(
    "/game/:game_id/start",
    async (request) => {
      await getAdminFromRequest(request.headers.authorization);
      return gameManager.startGame(request.params.game_id, request.body.admin_id);
    },
  );

  app.get<{ Params: { game_id: string } }>("/game/:game_id", async (request) => {
    return gameManager.getGame(request.params.game_id);
  });

  app.get<{ Params: { game_id: string; player_id: string } }>(
    "/game/:game_id/player/:player_id",
    async (request) => {
      return gameManager.getPlayerSnapshot(request.params.game_id, request.params.player_id);
    },
  );

  app.get("/admin/analytics", async (request) => {
    await getAdminFromRequest(request.headers.authorization);
    return gameManager.getAdminAnalytics();
  });

  app.get("/card", async () => ({ card: generateBingoCard() }));
}
