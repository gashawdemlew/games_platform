import type { WebSocket } from "ws";

export class ConnectionManager {
  private activeConnections = new Map<string, Set<WebSocket>>();

  add(gameId: string, socket: WebSocket): void {
    if (!this.activeConnections.has(gameId)) {
      this.activeConnections.set(gameId, new Set());
    }
    this.activeConnections.get(gameId)!.add(socket);
  }

  remove(gameId: string, socket: WebSocket): void {
    const connections = this.activeConnections.get(gameId);
    if (!connections) return;
    connections.delete(socket);
    if (connections.size === 0) {
      this.activeConnections.delete(gameId);
    }
  }

  async broadcast(gameId: string, payload: Record<string, unknown>): Promise<void> {
    const connections = this.activeConnections.get(gameId);
    if (!connections) return;

    const message = JSON.stringify(payload);
    for (const connection of [...connections]) {
      if (connection.readyState === connection.OPEN) {
        connection.send(message);
      } else {
        connections.delete(connection);
      }
    }
  }
}
