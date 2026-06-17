from __future__ import annotations

from fastapi import APIRouter, Depends

from app.models.schemas import (
    AdminProfile,
    CardResponse,
    CreateGameRequest,
    RegisterPlayerRequest,
    StartGameRequest,
    UpdateGameSettingsRequest,
)
from app.routes.auth import require_admin_token
from app.services.bingo_logic import generate_bingo_card
from app.services.game_manager import game_manager


router = APIRouter()


@router.post("/create-game")
async def create_game(payload: CreateGameRequest, admin: AdminProfile = Depends(require_admin_token)):
    return await game_manager.create_game(
        admin.display_name,
        payload.contribution_amount,
        payload.commission_percent,
        payload.currency,
        payload.winning_line_target,
        payload.allowed_line_patterns,
        payload.allow_full_house,
    )


@router.post("/game/{game_id}/players")
async def register_player(
    game_id: str,
    payload: RegisterPlayerRequest,
    admin: AdminProfile = Depends(require_admin_token),
):
    return await game_manager.register_player(game_id, payload.player_name, payload.phone_number)


@router.put("/game/{game_id}/settings")
async def update_game_settings(
    game_id: str,
    payload: UpdateGameSettingsRequest,
    admin: AdminProfile = Depends(require_admin_token),
):
    return await game_manager.update_game_settings(game_id, payload)


@router.post("/game/{game_id}/start")
async def start_game(
    game_id: str,
    payload: StartGameRequest,
    admin: AdminProfile = Depends(require_admin_token),
):
    return await game_manager.start_game(game_id, payload.admin_id)


@router.get("/game/{game_id}")
async def get_game(game_id: str):
    return await game_manager.get_game(game_id)


@router.get("/game/{game_id}/player/{player_id}")
async def get_player_snapshot(game_id: str, player_id: str):
    return await game_manager.get_player_snapshot(game_id, player_id)


@router.get("/admin/analytics")
async def get_admin_analytics(admin: AdminProfile = Depends(require_admin_token)):
    return await game_manager.get_admin_analytics()


@router.get("/card", response_model=CardResponse)
async def get_card():
    return CardResponse(card=generate_bingo_card())
