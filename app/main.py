from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import os, sys

cur_dir = os.getcwd()
parent_dir = os.path.realpath(os.path.join(os.path.dirname(cur_dir)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)
    sys.path.append(cur_dir)
sys.path.insert(1, ".")

from app.routes.auth import router as auth_router
from app.db import get_database_url, init_db
from app.routes.game import router as game_router
from app.services.game_manager import game_manager


app = FastAPI(
    title="Bingo Game API",
    version="1.0.0",
    description="75-ball Bingo MVP with FastAPI, WebSockets, and React client support.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(game_router)


@app.on_event("startup")
async def startup_event() -> None:
    init_db()


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "database_url": get_database_url(),
    }


@app.websocket("/ws/game/{game_id}")
async def game_websocket(
    websocket: WebSocket,
    game_id: str,
    player_id: str = Query(...),
):
    try:
        player = game_manager.get_player(game_id, player_id)
    except HTTPException:
        await websocket.close(code=1008)
        return

    await game_manager.connection_manager.connect(game_id, websocket)
    game = game_manager.games[game_id]
    if game.status == "finished":
        await websocket.close(code=1008)
        game_manager.connection_manager.disconnect(game_id, websocket)
        return

    await websocket.send_json(
        {
            "type": "snapshot",
            "game_id": game_id,
            "admin_id": game.admin_id,
            "admin_name": game.admin_name,
            "player_id": player_id,
            "player_name": player.player_name,
            "card": player.card.model_dump(),
            "status": game.status,
            "countdown": game.countdown,
            "draw_interval_seconds": game.draw_interval_seconds,
            "drawn_numbers": game.drawn_numbers,
            "winners": [winner.model_dump() for winner in game.winners],
            "player_count": len(game.players),
            "finance": game_manager._build_finance(game, len(game.winners) or None).model_dump(),
        }
    )

    if game.status in {"countdown", "active"}:
        await game_manager.ensure_game_loop(game_id)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        game_manager.connection_manager.disconnect(game_id, websocket)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8088)
