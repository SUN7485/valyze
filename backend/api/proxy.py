"""
Anthropic API Proxy — forwards Claude API requests from the browser
through the backend to avoid CORS issues and browser security restrictions.

Used by the valyze-extractor (browser-based SPA) to make Anthropic API calls
without exposing the API key in the Network tab and without CORS issues.

Endpoint: POST /api/proxy
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api", tags=["proxy"])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MAX_TIMEOUT_SECONDS = 300  # 5 minutes


@router.post("/proxy")
async def proxy_anthropic(request: Request):
    """
    Forward a request to the Anthropic Messages API.
    The client sends the same body + x-api-key header that would normally
    go directly to api.anthropic.com. This endpoint strips out
    dangerous-direct-browser-access headers and forwards cleanly.
    """
    # Extract the API key from the incoming request headers
    api_key = request.headers.get("x-api-key", "")

    if not api_key.startswith("sk-ant-"):
        raise HTTPException(status_code=401, detail="Missing or invalid Anthropic API key")

    # Read the request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Build forward headers (strip browser-specific ones Anthropic doesn't expect)
    forward_headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": request.headers.get("anthropic-version", "2023-06-01"),
    }

    # Forward the request using httpx (async-compatible HTTP client)
    try:
        async with httpx.AsyncClient(timeout=MAX_TIMEOUT_SECONDS) as client:
            response = await client.post(
                ANTHROPIC_API_URL,
                headers=forward_headers,
                json=body,
            )

        # Return Anthropic's response back to the client (status + body)
        return response.json(), response.status_code

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Anthropic API request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Anthropic API connection failed: {str(e)}")