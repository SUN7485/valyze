"""
Local development server.

Runs the exact app that production serves (api/index.py, the Vercel entry point),
so routers, auth guards and CORS behave the same locally as they do deployed.
The only local addition is serving files written to UPLOAD_DIR.

    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Health: GET /health · API docs: /docs
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi.staticfiles import StaticFiles  # noqa: E402

from api.index import app  # noqa: E402

if not os.getenv("VERCEL"):
    upload_dir = Path(os.getenv("UPLOAD_DIR", "uploads"))
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

__all__ = ["app"]
