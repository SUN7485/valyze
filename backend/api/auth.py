"""
Authentication API for Valyze Credit Backend.
Provides login and token management endpoints.
"""

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from services.auth import (
    create_access_token,
    get_current_user,
    UserPayload,
    SECRET_KEY,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    """Login request model."""
    email: EmailStr
    password: str
    analyst_id: Optional[str] = None


class TokenResponse(BaseModel):
    """Token response model."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    email: str
    analyst_id: Optional[str] = None


class UserResponse(BaseModel):
    """Current user response model."""
    user_id: str
    email: Optional[str] = None
    analyst_id: Optional[str] = None
    role: str


# ---------------------------------------------------------------------------
# Authentication Endpoints
# ---------------------------------------------------------------------------

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    Authenticate user and return JWT token.
    
    For development/team use:
    - Any email/password combination is accepted
    - User ID is generated from email
    - In production, this should validate against a user database
    """
    # Simple validation - in production, check against actual user database
    if not request.email or not request.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required"
        )
    
    # Generate user_id from email (simple hash for demo)
    # In production, this should come from your user database
    import hashlib
    user_id = hashlib.md5(request.email.encode()).hexdigest()
    
    # Create access token
    access_token_expires = timedelta(minutes=60)
    access_token = create_access_token(
        data={
            "sub": user_id,
            "email": request.email,
            "analyst_id": request.analyst_id,
        },
        expires_delta=access_token_expires
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=3600,
        user_id=user_id,
        email=request.email,
        analyst_id=request.analyst_id,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: UserPayload = Depends(get_current_user)):
    """
    Get current authenticated user information.
    Requires valid JWT token in Authorization header.
    """
    return UserResponse(
        user_id=current_user.user_id,
        email=current_user.email,
        analyst_id=current_user.analyst_id,
        role=current_user.role,
    )


@router.post("/refresh")
async def refresh_token(current_user: UserPayload = Depends(get_current_user)):
    """
    Refresh the access token for the current user.
    Requires valid JWT token in Authorization header.
    """
    from datetime import timedelta
    
    access_token_expires = timedelta(minutes=60)
    access_token = create_access_token(
        data={
            "sub": current_user.user_id,
            "email": current_user.email,
            "analyst_id": current_user.analyst_id,
        },
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
    }
