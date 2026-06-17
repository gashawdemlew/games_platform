from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket
import os, sys

cur_dir = os.getcwd()
parent_dir = os.path.realpath(os.path.join(os.path.dirname(cur_dir)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)
    sys.path.append(cur_dir)
sys.path.insert(1, ".")

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, game_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[game_id].append(websocket)

    def disconnect(self, game_id: str, websocket: WebSocket) -> None:
        connections = self.active_connections.get(game_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections and game_id in self.active_connections:
            del self.active_connections[game_id]

    async def broadcast(self, game_id: str, payload: dict) -> None:
        stale_connections: list[WebSocket] = []
        for connection in self.active_connections.get(game_id, []):
            try:
                await connection.send_json(payload)
            except RuntimeError:
                stale_connections.append(connection)

        for stale_connection in stale_connections:
            self.disconnect(game_id, stale_connection)

