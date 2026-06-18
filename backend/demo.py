"""
Demo mode: reCAPTCHA Enterprise verification + per-user AI quota.

Demo visitors sign in with Firebase Anonymous Auth after passing an invisible
reCAPTCHA Enterprise assessment (verified here in /demo/start via the
reCAPTCHA Enterprise REST API). Their AI interactions are capped server-side
in Firestore so bots cannot bypass the limit with a client patch.
"""
import asyncio
import logging
import os

import httpx
from fastapi import Depends, HTTPException
from firebase_admin import firestore

from auth import verify_token

logger = logging.getLogger(__name__)

# reCAPTCHA Enterprise config. Verification calls the createAssessment REST API
# authenticated with an API key (RECAPTCHA_API_KEY) scoped to reCAPTCHA only.
_RECAPTCHA_PROJECT = (
    os.environ.get("RECAPTCHA_PROJECT_ID")
    or os.environ.get("FIREBASE_PROJECT_ID")
    or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
)
_RECAPTCHA_API_KEY = os.environ.get("RECAPTCHA_API_KEY", "")
_RECAPTCHA_SITE_KEY = os.environ.get("RECAPTCHA_SITE_KEY", "")
_RECAPTCHA_ACTION = "demo_start"
_RECAPTCHA_MIN_SCORE = float(os.environ.get("RECAPTCHA_MIN_SCORE", "0.5"))
_MAX_AI_CALLS = int(os.environ.get("DEMO_MAX_AI_CALLS", "100"))

# Firestore path for per-anon-uid quota counters.
_QUOTA_COLLECTION = "demo_quota"


def is_demo_user(decoded: dict) -> bool:
    """True for Firebase Anonymous Auth tokens."""
    return decoded.get("firebase", {}).get("sign_in_provider") == "anonymous"


async def verify_recaptcha(token: str, remote_ip: str | None = None) -> bool:
    """
    Verify a reCAPTCHA Enterprise token by creating an assessment.
    Returns True only when the token is valid, the action matches, and the
    risk score is at or above the configured threshold.
    """
    if not (_RECAPTCHA_PROJECT and _RECAPTCHA_API_KEY and _RECAPTCHA_SITE_KEY):
        # Misconfiguration — fail closed rather than letting bots in.
        return False

    url = (
        f"https://recaptchaenterprise.googleapis.com/v1/"
        f"projects/{_RECAPTCHA_PROJECT}/assessments?key={_RECAPTCHA_API_KEY}"
    )
    event = {"token": token, "siteKey": _RECAPTCHA_SITE_KEY, "expectedAction": _RECAPTCHA_ACTION}
    if remote_ip:
        event["userIpAddress"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"event": event})
        body = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("recaptcha: request failed: %s", exc)
        return False

    if "error" in body:
        logger.warning("recaptcha: API error: %s", body.get("error"))
        return False

    token_props = body.get("tokenProperties", {})
    score = body.get("riskAnalysis", {}).get("score", 0.0)
    if not token_props.get("valid"):
        logger.warning(
            "recaptcha: invalid token (reason=%s, action=%s)",
            token_props.get("invalidReason"), token_props.get("action"),
        )
        return False
    if token_props.get("action") != _RECAPTCHA_ACTION:
        logger.warning(
            "recaptcha: action mismatch (got=%s, expected=%s)",
            token_props.get("action"), _RECAPTCHA_ACTION,
        )
        return False
    if float(score) < _RECAPTCHA_MIN_SCORE:
        logger.warning("recaptcha: low score %.2f < %.2f", float(score), _RECAPTCHA_MIN_SCORE)
        return False
    return True


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
