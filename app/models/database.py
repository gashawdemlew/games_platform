from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class UserRecord(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=func.now(),
        nullable=False,
    )

    cards: Mapped[list["BingoCardRecord"]] = relationship(back_populates="user")


class AdminUserRecord(Base):
    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False, default="Admin")
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=func.now(),
        nullable=False,
    )


class GameRecord(Base):
    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    admin_name: Mapped[str] = mapped_column(String(80), nullable=False, default="Admin")
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="ETB")
    contribution_amount: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    commission_percent: Mapped[float] = mapped_column(Float, nullable=False, default=15.0)
    total_collected: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    commission_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    prize_pool_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    payout_per_winner: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    winner_count: Mapped[int] = mapped_column(nullable=False, default=0)
    winning_line_target: Mapped[int] = mapped_column(nullable=False, default=1)
    allowed_line_patterns: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    allow_full_house: Mapped[bool] = mapped_column(nullable=False, default=True)
    drawn_numbers: Mapped[list[int]] = mapped_column(JSONB, default=list, nullable=False)
    winners: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=func.now(),
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    cards: Mapped[list["BingoCardRecord"]] = relationship(back_populates="game", cascade="all, delete-orphan")


class BingoCardRecord(Base):
    __tablename__ = "cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    player_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    player_name: Mapped[str] = mapped_column(String(80), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(30), nullable=False)
    numbers: Mapped[dict] = mapped_column(JSONB, nullable=False)
    pattern: Mapped[str | None] = mapped_column(String(20), nullable=True)
    winner: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    game: Mapped[GameRecord] = relationship(back_populates="cards")
    user: Mapped[UserRecord] = relationship(back_populates="cards")
