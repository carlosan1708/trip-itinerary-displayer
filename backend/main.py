import json
import logging
import os
from typing import Literal

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from auth import verify_token, set_admin_claim
from chat import run_conversation
from create import run_creation
from demo import require_user_or_demo_quota, verify_turnstile

logger = logging.getLogger(__name__)

_ALLOWED_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

# ---------------------------------------------------------------------------
# Rate limiter — keyed by IP address
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Itinerary Agent API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[_ALLOWED_ORIGIN],
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def enforce_origin(request: Request, call_next):
    if request.url.path == "/health" or request.method == "OPTIONS":
        return await call_next(request)
    origin = request.headers.get("origin", "")
    if origin != _ALLOWED_ORIGIN:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class _Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    messages: list[_Message] = Field(min_length=1, max_length=50)
    itinerary: dict | None = None
    mode: Literal["explore", "edit"] = "explore"
    language: str = Field(default="en", pattern=r"^[a-z]{2}$")

    def messages_as_dicts(self) -> list[dict]:
        return [m.model_dump() for m in self.messages]


class DemoStartRequest(BaseModel):
    token: str = Field(min_length=1, max_length=4096)


class CreateRequest(BaseModel):
    destination: str = Field(min_length=1, max_length=200)
    dates: str = Field(min_length=1, max_length=100)
    num_days: int = Field(ge=1, le=60)
    travelers: int = Field(ge=1, le=20)
    interests: list[str] = Field(max_length=20)
    budget: Literal["budget", "mid", "luxury"]
    pace: Literal["relaxed", "moderate", "packed"]
    language: str = Field(default="es", pattern=r"^[a-z]{2}$")


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _identity(user: dict) -> str:
    """Stable identity for a request. Anonymous (demo) users have no email,
    so fall back to a synthetic `demo:{uid}` matching the client convention."""
    return user.get("email") or f"demo:{user['uid']}"


async def _stream_conversation(req: ChatRequest, user: dict):
    async for chunk in run_conversation(
        messages=req.messages_as_dicts(),
        itinerary=req.itinerary,
        mode=req.mode,
        user_email=_identity(user),
        language=req.language,
    ):
        yield _sse(chunk["event"], chunk["data"])


async def _stream_creation(req: CreateRequest, user: dict):
    async for chunk in run_creation(
        user_params=req.model_dump(),
        user_email=_identity(user),
    ):
        yield _sse(chunk["event"], chunk["data"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/agent/chat")
@limiter.limit("30/minute")
async def chat(request: Request, req: ChatRequest, user: dict = Depends(require_user_or_demo_quota)):
    return StreamingResponse(
        _stream_conversation(req, user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/agent/create")
@limiter.limit("5/minute")
async def create(request: Request, req: CreateRequest, user: dict = Depends(require_user_or_demo_quota)):
    return StreamingResponse(
        _stream_creation(req, user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/demo/start")
@limiter.limit("10/minute")
async def demo_start(request: Request, req: DemoStartRequest):
    """
    Gate the demo: verify the Cloudflare Turnstile token. The client only
    calls signInAnonymously() after this returns ok, so bots can't mint
    anonymous identities at scale without solving a challenge each time.
    """
    client_ip = request.client.host if request.client else None
    if not await verify_turnstile(req.token, client_ip):
        raise HTTPException(status_code=403, detail="turnstile_failed")
    return {"ok": True}


@app.post("/auth/set-admin-claim")
async def set_admin(request: Request, user: dict = Depends(verify_token)):
    """
    Called once on login. If the authenticated user is the configured admin,
    sets the `admin: true` custom claim on their Firebase account.
    The client must force-refresh the ID token after this call.
    """
    await set_admin_claim(user["uid"], user["email"], user)
    return {"ok": True}


