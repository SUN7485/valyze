"""
Database setup forValyze Credit report Backend.

Provides async SQLAlchemy engine, session management,
table definitions, and FastAPI dependency injection.
"""

import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./antigravity.db")

engine = create_async_engine(DATABASE_URL, echo=False)

async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# Base model
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Table definitions
# ---------------------------------------------------------------------------

class ReportRow(Base):
    """Stores the full report state as JSON alongside status metadata."""

    __tablename__ = "reports"

    id = Column(String, primary_key=True)
    status = Column(String, nullable=False, default="uploading")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
    report_json = Column(Text, nullable=True)
    extraction_stats_json = Column(Text, nullable=True)


class UploadedFileRow(Base):
    """Tracks individual uploaded files linked to a report."""

    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(String, ForeignKey("reports.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    language = Column(String, nullable=True)
    pages = Column(Integer, nullable=True)
    processed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Dependency injection
# ---------------------------------------------------------------------------

async def get_db():
    """FastAPI dependency that yields an async database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

async def init_db():
    """Create all tables if they don't already exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
