import type { FastifyInstance } from "fastify";
import { gameManager } from "../services/gameManager.js";
import {
  establishPlayerSession,
  getPlayerFromRequest,
  updatePlayerProfile,
} from "../services/playerProfileService.js";
import { getAdminFromRequest } from "./auth.js";

export async function registerPlayerRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { full_name: string; phone_number: string } }>("/players/session", async (request) => {
    return establishPlayerSession(request.body.full_name ?? "", request.body.phone_number ?? "");
  });

  app.get("/players/me", async (request) => {
    return getPlayerFromRequest(request.headers.authorization);
  });

  app.put<{ Body: { full_name: string; phone_number: string } }>("/players/me", async (request) => {
    const profile = await getPlayerFromRequest(request.headers.authorization);
    const updated = await updatePlayerProfile(
      profile.id,
      request.body.full_name,
      request.body.phone_number,
    );
    await gameManager.syncProfileToWaitingRegistrations(
      updated.id,
      updated.full_name,
      updated.phone_number,
    );
    return updated;
  });

  app.get("/lobby/open", async () => gameManager.getOpenLobby());

  app.get<{ Params: { game_id: string } }>("/game/:game_id/registration", async (request) => {
    const profile = await getPlayerFromRequest(request.headers.authorization);
    return gameManager.getRegistrationForProfile(request.params.game_id, profile.id);
  });

  app.post<{
    Params: { game_id: string };
    Body: { payment_method: "cash" | "transfer"; receipt_data?: string | null };
  }>("/game/:game_id/self-register", async (request) => {
    const profile = await getPlayerFromRequest(request.headers.authorization);
    return gameManager.selfRegisterPlayer(
      request.params.game_id,
      profile.id,
      request.body.payment_method ?? "cash",
      request.body.receipt_data ?? null,
    );
  });

  app.post<{ Params: { game_id: string; player_id: string }; Body: { admin_id: string } }>(
    "/game/:game_id/registrations/:player_id/approve",
    async (request) => {
      await getAdminFromRequest(request.headers.authorization);
      return gameManager.approveRegistration(
        request.params.game_id,
        request.params.player_id,
        request.body.admin_id,
      );
    },
  );

  app.post<{ Params: { game_id: string; player_id: string }; Body: { admin_id: string } }>(
    "/game/:game_id/registrations/:player_id/reject",
    async (request) => {
      await getAdminFromRequest(request.headers.authorization);
      return gameManager.rejectRegistration(
        request.params.game_id,
        request.params.player_id,
        request.body.admin_id,
      );
    },
  );
}
