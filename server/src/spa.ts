import type { FastifyReply } from "fastify";

export function isBrowserNavigation(acceptHeader?: string): boolean {
  const accept = acceptHeader ?? "";
  return accept.includes("text/html");
}

export function sendSpaIndex(reply: FastifyReply) {
  return reply.sendFile("index.html");
}
