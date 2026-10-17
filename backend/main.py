"""FastAPI backend for the Clinic Front Desk Agent.

Exposes exactly one evaluation endpoint: POST /agent/run
All other routes return 404.
CORS is configured for the frontend origin only.
"""

from __future__ import annotations

import os
from pathlib import Path

# Load .env from the backend directory if present (local development only)
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
except ImportError:
    pass  # python-dotenv not installed; rely on environment variables directly

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from agent import run_conversation

app = FastAPI(
    title="Clinic Front Desk Agent",
    docs_url=None,   # Disable /docs
    redoc_url=None,  # Disable /redoc
    openapi_url=None,  # Disable /openapi.json
)

# CORS: only permit the frontend origins
FRONTEND_ORIGINS = os.environ.get(
    "FRONTEND_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.post("/agent/run")
async def agent_run(request: Request) -> JSONResponse:
    """
    POST /agent/run

    Request body: { "conversation_id": str, "today": str, "turns": [str, ...] }
    Response: Full conversation outcome per schema.md
    """
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid JSON request body"},
        )

    try:
        result = run_conversation(payload)
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={"error": str(exc)},
        )
    except RuntimeError as exc:
        # API key missing, SDK not installed, etc.
        return JSONResponse(
            status_code=503,
            content={"error": str(exc)},
        )
    except Exception as exc:
        # Unexpected error — do not expose internal details
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error. Check backend logs."},
        )

    return JSONResponse(content=result)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
