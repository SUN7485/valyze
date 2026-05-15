"""
Security module for Valyze Credit Backend.
Provides authentication, authorization, and security utilities.
"""

import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-super-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

# Security scheme
security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Token Models
# ---------------------------------------------------------------------------

class TokenData(BaseModel):
    user_id: Optional[str] = None
    analyst_id: Optional[str] = None
    email: Optional[str] = None


class UserPayload(BaseModel):
    user_id: str
    analyst_id: Optional[str] = None
    email: Optional[str] = None
    role: str = "analyst"


# ---------------------------------------------------------------------------
# JWT Utilities
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[TokenData]:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        analyst_id: str = payload.get("analyst_id")
        email: str = payload.get("email")
        
        if user_id is None:
            return None
            
        return TokenData(user_id=user_id, analyst_id=analyst_id, email=email)
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Authentication Dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> UserPayload:
    """
    Get current authenticated user from JWT token.
    Raises 401 if not authenticated.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    token_data = verify_token(token)
    
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return UserPayload(
        user_id=token_data.user_id,
        analyst_id=token_data.analyst_id,
        email=token_data.email,
    )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[UserPayload]:
    """
    Get current user if authenticated, otherwise return None.
    Use for endpoints that work with or without auth.
    """
    if credentials is None:
        return None
    
    token = credentials.credentials
    token_data = verify_token(token)
    
    if token_data is None:
        return None
    
    return UserPayload(
        user_id=token_data.user_id,
        analyst_id=token_data.analyst_id,
        email=token_data.email,
    )


# ---------------------------------------------------------------------------
# Authorization Helpers
# ---------------------------------------------------------------------------

def validate_report_id(report_id: str) -> bool:
    """Validate report ID format to prevent injection attacks."""
    if not report_id:
        return False
    # Allow UUID format or alphanumeric with dashes/underscores
    pattern = re.compile(r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$|^[a-zA-Z0-9_-]{1,100}$')
    return bool(pattern.match(report_id))


def sanitize_input(value: Any, max_length: int = 1000) -> Any:
    """Sanitize user input to prevent injection attacks."""
    if value is None:
        return None
    
    if isinstance(value, str):
        # Remove null bytes and limit length
        value = value.replace('\x00', '')[:max_length]
        # Basic XSS prevention (more comprehensive validation should happen at frontend)
        value = value.replace('<script>', '&lt;script&gt;').replace('</script>', '&lt;/script&gt;')
    
    return value


# ---------------------------------------------------------------------------
# Rate Limiting (simple in-memory implementation)
# ---------------------------------------------------------------------------

_rate_limit_store: Dict[str, list] = {}

def check_rate_limit(identifier: str, max_requests: int = 100, window_seconds: int = 60) -> bool:
    """
    Simple rate limiting check.
    Returns True if request is allowed, False if rate limited.
    """
    now = datetime.now(timezone.utc).timestamp()
    window_start = now - window_seconds
    
    if identifier not in _rate_limit_store:
        _rate_limit_store[identifier] = []
    
    # Clean old entries
    _rate_limit_store[identifier] = [ts for ts in _rate_limit_store[identifier] if ts > window_start]
    
    if len(_rate_limit_store[identifier]) >= max_requests:
        return False
    
    _rate_limit_store[identifier].append(now)
    return True


def get_rate_limit_dependency(max_requests: int = 100, window_seconds: int = 60):
    """Create a rate limiting dependency for FastAPI routes."""
    async def rate_limit_checker(request: Request, current_user: UserPayload = Depends(get_current_user)):
        identifier = f"{current_user.user_id}:{request.url.path}"
        if not check_rate_limit(identifier, max_requests, window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Max {max_requests} requests per {window_seconds} seconds.",
            )
        return current_user
    return rate_limit_checker


# ---------------------------------------------------------------------------
# Config Validation
# ---------------------------------------------------------------------------

def validate_environment() -> tuple[bool, list[str]]:
    """
    Validate that all required environment variables are set.
    Returns (is_valid, list_of_missing_vars).
    """
    required_vars = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
        "JWT_SECRET_KEY",
    ]
    
    missing = []
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)
    
    # Warn about weak JWT key in development
    warnings = []
    jwt_key = os.getenv("JWT_SECRET_KEY", "")
    if jwt_key in ["your-super-secret-key-change-in-production", "secret", "test"]:
        warnings.append("JWT_SECRET_KEY is using default value - change in production!")
    
    if len(jwt_key) < 32:
        warnings.append("JWT_SECRET_KEY should be at least 32 characters long")
    
    return len(missing) == 0, missing, warnings


def require_valid_config():
    """Raise exception if environment is not properly configured."""
    is_valid, missing, warnings = validate_environment()
    
    for warning in warnings:
        print(f"[WARNING] {warning}")
    
    if not is_valid:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}. "
            "Please create a .env file with all required values."
        )
    
    return True
