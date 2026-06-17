from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException

from app.models.schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminProfile,
    AdminUserCreateRequest,
    AdminUserResponse,
    AdminUserUpdateRequest,
)
from app.services.auth_service import (
    authenticate_admin,
    create_admin_user,
    get_admin_from_token,
    list_admin_users,
    update_admin_user,
)


router = APIRouter(prefix="/auth", tags=["auth"])


def require_admin_token(authorization: str | None = Header(default=None)) -> AdminProfile:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin authorization")
    token = authorization.split(" ", 1)[1]
    profile = get_admin_from_token(token)
    return AdminProfile(**profile)


@router.post("/login", response_model=AdminLoginResponse)
async def login(payload: AdminLoginRequest):
    data = authenticate_admin(payload.username, payload.password)
    return AdminLoginResponse(token=data["token"], admin=AdminProfile(**data["admin"]))


@router.get("/me", response_model=AdminProfile)
async def me(admin: AdminProfile = Depends(require_admin_token)):
    return admin


@router.get("/admin-users", response_model=list[AdminUserResponse])
async def get_admin_users(admin: AdminProfile = Depends(require_admin_token)):
    return [AdminUserResponse(**item) for item in list_admin_users()]


@router.post("/admin-users", response_model=AdminUserResponse)
async def add_admin_user(payload: AdminUserCreateRequest, admin: AdminProfile = Depends(require_admin_token)):
    data = create_admin_user(
        username=payload.username.strip(),
        password=payload.password,
        display_name=payload.display_name.strip() or "Admin",
        is_active=payload.is_active,
    )
    return AdminUserResponse(**data)


@router.put("/admin-users/{admin_user_id}", response_model=AdminUserResponse)
async def edit_admin_user(
    admin_user_id: str,
    payload: AdminUserUpdateRequest,
    admin: AdminProfile = Depends(require_admin_token),
):
    data = update_admin_user(
        admin_id=admin_user_id,
        display_name=payload.display_name,
        password=payload.password,
        is_active=payload.is_active,
    )
    return AdminUserResponse(**data)
