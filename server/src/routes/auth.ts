import type { FastifyInstance } from "fastify";
import {
  authenticateAdmin,
  createAdminUser,
  getAdminFromToken,
  listAdminUsers,
  updateAdminUser,
} from "../services/authService.js";
import type { AdminProfile } from "../types.js";

export async function getAdminFromRequest(
  authorization: string | undefined,
): Promise<AdminProfile> {
  if (!authorization?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing admin authorization"), { statusCode: 401 });
  }
  const token = authorization.slice("Bearer ".length);
  return getAdminFromToken(token);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { username: string; password: string } }>("/auth/login", async (request) => {
    return authenticateAdmin(request.body.username, request.body.password);
  });

  app.get("/auth/me", async (request) => {
    return getAdminFromRequest(request.headers.authorization);
  });

  app.get("/auth/admin-users", async (request) => {
    await getAdminFromRequest(request.headers.authorization);
    return listAdminUsers();
  });

  app.post<{
    Body: { username: string; password: string; display_name: string; is_active: boolean };
  }>("/auth/admin-users", async (request) => {
    await getAdminFromRequest(request.headers.authorization);
    return createAdminUser(
      request.body.username.trim(),
      request.body.password,
      request.body.display_name.trim() || "Admin",
      request.body.is_active,
    );
  });

  app.put<{
    Params: { admin_user_id: string };
    Body: { display_name?: string; password?: string; is_active?: boolean };
  }>("/auth/admin-users/:admin_user_id", async (request) => {
    await getAdminFromRequest(request.headers.authorization);
    return updateAdminUser(
      request.params.admin_user_id,
      request.body.display_name,
      request.body.password,
      request.body.is_active,
    );
  });
}
