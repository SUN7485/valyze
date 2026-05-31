"""
Authentication API — JWT-based login with hardcoded users.
Uses SHA-256 (hashlib) instead of bcrypt to avoid C compilation on Vercel.
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "valyze-secret-change-in-production-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Simple SHA-256 hashing (no bcrypt dependency)
# ---------------------------------------------------------------------------

def _hash(password: str) -> str:
    """SHA-256 hash with a random salt for simple password storage."""
    salt = os.urandom(16).hex()
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{h}"


def _verify(password: str, stored: str) -> bool:
    """Verify password against stored hash."""
    try:
        salt, h = stored.split(":", 1)
        return hashlib.sha256((salt + password).encode()).hexdigest() == h
    except (ValueError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# User Store  (hardcoded)
# ---------------------------------------------------------------------------

USERS = {
    "admin@valyze.com": {
        "id": "usr_001",
        "email": "admin@valyze.com",
        "name": "Admin User",
        "role": "admin",
        "password_hash": _hash("Admin@123"),
    },
    "sarah@valyze.com": {
        "id": "usr_002",
        "email": "sarah@valyze.com",
        "name": "Sarah Al Mansoori",
        "role": "analyst",
        "password_hash": _hash("Sarah@123"),
    },
    "ahmad@valyze.com": {
        "id": "usr_003",
        "email": "ahmad@valyze.com",
        "name": "Ahmad Al Rashid",
        "role": "analyst",
        "password_hash": _hash("Ahmad@123"),
    },
    "omar@valyze.com": {
        "id": "usr_004",
        "email": "omar@valyze.com",
        "name": "Omar Khalil",
        "role": "analyst",
        "password_hash": _hash("Omar@123"),
    },
    "fatima@valyze.com": {
        "id": "usr_005",
        "email": "fatima@valyze.com",
        "name": "Fatima Hassan",
        "role": "reviewer",
        "password_hash": _hash("Fatima@123"),
    },
    "yusuf@valyze.com": {
        "id": "usr_006",
        "email": "yusuf@valyze.com",
        "name": "Yusuf Nasser",
        "role": "viewer",
        "password_hash": _hash("Yusuf@123"),
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    return decode_token(credentials.credentials)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login")
async def login(body: LoginRequest):
    """Authenticate user and return JWT token."""
    user = USERS.get(body.email.lower().strip())
    if not user or not _verify(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = create_token(user)
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return current authenticated user info."""
    return {
        "id": user["sub"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }


@router.post("/verify")
async def verify_token(user: dict = Depends(get_current_user)):
    """Verify that a token is valid."""
    return {"valid": True, "user": user["email"]}