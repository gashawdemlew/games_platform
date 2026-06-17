from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select

from app.db import SessionLocal
from app.models.database import AdminUserRecord


TOKEN_SECRET = os.getenv("ADMIN_TOKEN_SECRET", "bingo-admin-secret-change-me")
TOKEN_TTL_HOURS = int(os.getenv("ADMIN_TOKEN_TTL_HOURS", "12"))
DEFAULT_ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin12345")
DEFAULT_ADMIN_DISPLAY_NAME = os.getenv("ADMIN_DISPLAY_NAME", "Floor Manager")


def hash_password(password: str, salt: str | None = None) -> str:
    salt_value = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_value.encode("utf-8"), 120000)
    return f"{salt_value}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt, stored_hash = password_hash.split("$", 1)
    candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, f"{salt}${stored_hash}")


def _sign_payload(payload: dict) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(TOKEN_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return (
        base64.urlsafe_b64encode(body).decode("utf-8").rstrip("=")
        + "."
        + signature
    )


def _decode_token(token: str) -> dict:
    try:
        encoded_payload, signature = token.split(".", 1)
        padded = encoded_payload + "=" * (-len(encoded_payload) % 4)
        body = base64.urlsafe_b64decode(padded.encode("utf-8"))
        expected_signature = hmac.new(TOKEN_SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Invalid token signature")
        payload = json.loads(body.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token") from exc

    expires_at = datetime.fromisoformat(payload["exp"])
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Admin session expired")
    return payload


def issue_admin_token(admin: AdminUserRecord) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)
    payload = {
        "sub": str(admin.id),
        "username": admin.username,
        "display_name": admin.display_name,
        "exp": expires_at.isoformat(),
    }
    return _sign_payload(payload)


def ensure_default_admin() -> None:
    with SessionLocal() as db:
        admin = db.execute(
            select(AdminUserRecord).where(AdminUserRecord.username == DEFAULT_ADMIN_USERNAME)
        ).scalar_one_or_none()
        if admin is None:
            admin = AdminUserRecord(
                username=DEFAULT_ADMIN_USERNAME,
                password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
                display_name=DEFAULT_ADMIN_DISPLAY_NAME,
                is_active=True,
            )
            db.add(admin)
            db.commit()


def authenticate_admin(username: str, password: str) -> dict:
    with SessionLocal() as db:
        admin = db.execute(
            select(AdminUserRecord).where(AdminUserRecord.username == username)
        ).scalar_one_or_none()

        if admin is None or not admin.is_active or not verify_password(password, admin.password_hash):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = issue_admin_token(admin)
        return {
            "token": token,
            "admin": {
                "id": str(admin.id),
                "username": admin.username,
                "display_name": admin.display_name,
            },
        }


def get_admin_from_token(token: str) -> dict:
    payload = _decode_token(token)
    with SessionLocal() as db:
        admin = db.execute(
            select(AdminUserRecord).where(AdminUserRecord.id == payload["sub"])
        ).scalar_one_or_none()
        if admin is None or not admin.is_active:
            raise HTTPException(status_code=401, detail="Admin account unavailable")
        return {
            "id": str(admin.id),
            "username": admin.username,
            "display_name": admin.display_name,
        }


def list_admin_users() -> list[dict]:
    with SessionLocal() as db:
        admins = db.execute(select(AdminUserRecord).order_by(AdminUserRecord.created_at.desc())).scalars().all()
        return [
            {
                "id": str(admin.id),
                "username": admin.username,
                "display_name": admin.display_name,
                "is_active": admin.is_active,
                "created_at": admin.created_at,
            }
            for admin in admins
        ]


def create_admin_user(username: str, password: str, display_name: str, is_active: bool = True) -> dict:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    with SessionLocal() as db:
        existing = db.execute(
            select(AdminUserRecord).where(AdminUserRecord.username == username)
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=400, detail="Username already exists")

        admin = AdminUserRecord(
            username=username,
            password_hash=hash_password(password),
            display_name=display_name or "Admin",
            is_active=is_active,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        return {
            "id": str(admin.id),
            "username": admin.username,
            "display_name": admin.display_name,
            "is_active": admin.is_active,
            "created_at": admin.created_at,
        }


def update_admin_user(admin_id: str, display_name: str | None, password: str | None, is_active: bool | None) -> dict:
    with SessionLocal() as db:
        admin = db.execute(
            select(AdminUserRecord).where(AdminUserRecord.id == admin_id)
        ).scalar_one_or_none()
        if admin is None:
            raise HTTPException(status_code=404, detail="Admin user not found")

        if display_name is not None and display_name.strip():
            admin.display_name = display_name.strip()
        if password is not None:
            if len(password) < 8:
                raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
            admin.password_hash = hash_password(password)
        if is_active is not None:
            admin.is_active = is_active

        db.commit()
        db.refresh(admin)
        return {
            "id": str(admin.id),
            "username": admin.username,
            "display_name": admin.display_name,
            "is_active": admin.is_active,
            "created_at": admin.created_at,
        }
