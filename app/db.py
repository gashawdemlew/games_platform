from __future__ import annotations

import os
import os, sys

cur_dir = os.getcwd()
parent_dir = os.path.realpath(os.path.join(os.path.dirname(cur_dir)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)
    sys.path.append(cur_dir)
sys.path.insert(1, ".")

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:Gashu%40000012@db.kdqodovfjkuyorlqitds.supabase.co:5432/postgres?sslmode=require",
    # "postgresql+psycopg://gashawdemlew@localhost/bingo_db",
)

engine = create_engine(DATABASE_URL, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_database_url() -> str:
    return DATABASE_URL


def init_db() -> None:
    from app.models.database import AdminUserRecord, BingoCardRecord, GameRecord, UserRecord  # noqa: F401
    from app.services.auth_service import ensure_default_admin

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS admin_users (
                id UUID PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(80) NOT NULL DEFAULT 'Admin',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
            """
        )
        connection.exec_driver_sql(
            """
            ALTER TABLE games
            ADD COLUMN IF NOT EXISTS admin_name VARCHAR(80) NOT NULL DEFAULT 'Admin',
            ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
            ADD COLUMN IF NOT EXISTS contribution_amount DOUBLE PRECISION NOT NULL DEFAULT 100,
            ADD COLUMN IF NOT EXISTS commission_percent DOUBLE PRECISION NOT NULL DEFAULT 15,
            ADD COLUMN IF NOT EXISTS total_collected DOUBLE PRECISION NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS prize_pool_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS payout_per_winner DOUBLE PRECISION NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS winner_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS winning_line_target INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS allowed_line_patterns JSONB NOT NULL DEFAULT '["horizontal","vertical","diagonal"]'::jsonb,
            ADD COLUMN IF NOT EXISTS allow_full_house BOOLEAN NOT NULL DEFAULT TRUE
            """
        )
        connection.exec_driver_sql(
            """
            ALTER TABLE cards
            ADD COLUMN IF NOT EXISTS player_name VARCHAR(80) NOT NULL DEFAULT 'Guest',
            ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30) NOT NULL DEFAULT ''
            """
        )
    ensure_default_admin()
