"""
Demo mode: Cloudflare Turnstile verification + per-user AI quota.

Demo visitors sign in with Firebase Anonymous Auth after passing a Turnstile
challenge (verified here in /demo/start). Their AI interactions are capped
server-side in Firestore so bots cannot bypass the limit with a client patch.
"""
import asyncio
import os

import httpx
from fastapi import Depends, HTTPException
from firebase_admin import firestore

from auth import verify_token

_TURNSTILE_SECRET = os.environ.get("TURNSTILE_SECRET_KEY", "")
_TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
_MAX_AI_CALLS = int(os.environ.get("DEMO_MAX_AI_CALLS", "100"))

# Firestore path for per-anon-uid quota counters.
_QUOTA_COLLECTION = "demo_quota"


def is_demo_user(decoded: dict) -> bool:
    """True for Firebase Anonymous Auth tokens."""
    return decoded.get("firebase", {}).get("sign_in_provider") == "anonymous"


async def verify_turnstile(token: str, remote_ip: str | None = None) -> bool:
    """Verify a Turnstile token against Cloudflare's siteverify endpoint."""
    if not _TURNSTILE_SECRET:
        # Misconfiguration — fail closed rather than letting bots in.
        return False
    data = {"secret": _TURNSTILE_SECRET, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_TURNSTILE_VERIFY_URL, data=data)
        return bool(resp.json().get("success"))
    except (httpx.HTTPError, ValueError):
        return False


def _quota_doc(uid: str):
    return firestore.client().collection(_QUOTA_COLLECTION).document(uid)


async def _read_ai_calls(uid: str) -> int:
    loop = asyncio.get_event_loop()
    snap = await loop.run_in_executor(None, _quota_doc(uid).get)
    if not snap.exists:
        return 0
    return int(snap.to_dict().get("aiCalls", 0))


async def _increment_ai_calls(uid: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: _quota_doc(uid).set(
            {"aiCalls": firestore.Increment(1)}, merge=True
        ),
    )


async def require_user_or_demo_quota(user: dict = Depends(verify_token)) -> dict:
    """
    Dependency for AI routes. Whitelisted (non-anonymous) users pass through.
    Demo (anonymous) users are checked against the per-uid AI cap; once over
    the limit they get a structured 429 the client turns into a friendly
    "contact me" message. The counter is incremented for each allowed call.
    """
    if not is_demo_user(user):
        return user

    uid = user["uid"]
    used = await _read_ai_calls(uid)
    if used >= _MAX_AI_CALLS:
        raise HTTPException(
            status_code=429,
            detail={"code": "demo_limit_reached", "limit": _MAX_AI_CALLS},
        )
    await _increment_ai_calls(uid)
    return user
