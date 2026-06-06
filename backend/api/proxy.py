"""
Anthropic API Proxy — forwards Claude API requests from the browser
through the backend to avoid CORS issues and browser security restrictions.

Used by the valyze-extractor (browser-based SPA) to make Anthropic API calls
without exposing the API key in the Network tab and without CORS issues.

Endpoint: POST /api/proxy
"""

from __future__ import annotations

import gzip
import os
import traceback
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["proxy"])

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MAX_TIMEOUT_SECONDS = 300  # 5 minutes


@router.post("/proxy")
async def proxy_anthropic(request: Request):
    """
    Forward a request to the Anthropic Messages API.
    Supports gzip-compressed request bodies (Content-Encoding: gzip)
    to work around Vercel's request size limits.
    The client sends the same body + x-api-key header that would normally
    go directly to api.anthropic.com. This endpoint strips out
    dangerous-direct-browser-access headers and forwards cleanly.
    """
    # Extract the API key from the incoming request headers
    api_key = request.headers.get("x-api-key", "")

    if not api_key.startswith("sk-ant-"):
        raise HTTPException(status_code=401, detail="Missing or invalid Anthropic API key")

    # Read and optionally decompress the request body
    raw_body = await request.body()
    content_encoding = request.headers.get("content-encoding", "").lower()

    if content_encoding == "gzip":
        try:
            body = gzip.decompress(raw_body).decode("utf-8")
            import json as _json
            body = _json.loads(body)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid gzip-compressed JSON body")
    else:
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
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(MAX_TIMEOUT_SECONDS, connect=30.0)
        ) as client:
            response = await client.post(
                ANTHROPIC_API_URL,
                headers=forward_headers,
                json=body,
            )

        # Return Anthropic's response back to the client (status + body)
        try:
            data = response.json()
        except Exception:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Anthropic returned non-JSON response (HTTP {response.status_code})",
            )

        return JSONResponse(content=data, status_code=response.status_code)

    except HTTPException:
        raise
    except httpx.TimeoutException:
        print("[proxy] ERROR: Anthropic API request timed out")
        raise HTTPException(
            status_code=504,
            detail="Anthropic API request timed out after 5 minutes. Try smaller documents or turn off web search.",
        )
    except httpx.ConnectError as e:
        print(f"[proxy] ERROR: Cannot connect to Anthropic API: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Cannot connect to Anthropic API. The server may be unreachable: {str(e)}",
        )
    except httpx.RequestError as e:
        print(f"[proxy] ERROR: Anthropic API request failed: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail=f"Anthropic API connection failed: {str(e)}",
        )
    except Exception as e:
        print(f"[proxy] ERROR: Unexpected error: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Proxy error: {str(e)}",
        )
