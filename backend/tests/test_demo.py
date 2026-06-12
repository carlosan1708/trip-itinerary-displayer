"""Tests for demo mode: reCAPTCHA Enterprise verification + per-uid AI quota."""
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

# Ensure firebase_admin.firestore is importable (conftest mocks firebase_admin).
_firestore_mock = MagicMock()
sys.modules.setdefault("firebase_admin.firestore", _firestore_mock)

import demo  # noqa: E402


def _anon_token(uid="anon-1"):
    return {"uid": uid, "firebase": {"sign_in_provider": "anonymous"}}


def _google_token(email="user@test.com"):
    return {"uid": "u1", "email": email, "firebase": {"sign_in_provider": "google.com"}}


def test_is_demo_user_true_for_anonymous():
    assert demo.is_demo_user(_anon_token()) is True


def test_is_demo_user_false_for_google():
    assert demo.is_demo_user(_google_token()) is False


def _recaptcha_configured():
    """Patch the three required reCAPTCHA settings to non-empty values."""
    return (
        patch.object(demo, "_RECAPTCHA_PROJECT", "proj"),
        patch.object(demo, "_RECAPTCHA_API_KEY", "key"),
        patch.object(demo, "_RECAPTCHA_SITE_KEY", "site"),
    )


@pytest.mark.asyncio
async def test_verify_recaptcha_success():
    resp = MagicMock()
    resp.json.return_value = {
        "tokenProperties": {"valid": True, "action": "demo_start"},
        "riskAnalysis": {"score": 0.9},
    }
    client = AsyncMock()
    client.post.return_value = resp
    p1, p2, p3 = _recaptcha_configured()
    with p1, p2, p3, patch.object(demo, "_RECAPTCHA_MIN_SCORE", 0.5), \
         patch("demo.httpx.AsyncClient") as ac:
        ac.return_value.__aenter__.return_value = client
        assert await demo.verify_recaptcha("tok") is True


@pytest.mark.asyncio
async def test_verify_recaptcha_rejects_low_score():
    resp = MagicMock()
    resp.json.return_value = {
        "tokenProperties": {"valid": True, "action": "demo_start"},
        "riskAnalysis": {"score": 0.1},
    }
    client = AsyncMock()
    client.post.return_value = resp
    p1, p2, p3 = _recaptcha_configured()
    with p1, p2, p3, patch.object(demo, "_RECAPTCHA_MIN_SCORE", 0.5), \
         patch("demo.httpx.AsyncClient") as ac:
        ac.return_value.__aenter__.return_value = client
        assert await demo.verify_recaptcha("tok") is False


@pytest.mark.asyncio
async def test_verify_recaptcha_rejects_action_mismatch():
    resp = MagicMock()
    resp.json.return_value = {
        "tokenProperties": {"valid": True, "action": "something_else"},
        "riskAnalysis": {"score": 0.9},
    }
    client = AsyncMock()
    client.post.return_value = resp
    p1, p2, p3 = _recaptcha_configured()
    with p1, p2, p3, patch("demo.httpx.AsyncClient") as ac:
        ac.return_value.__aenter__.return_value = client
        assert await demo.verify_recaptcha("tok") is False


@pytest.mark.asyncio
async def test_verify_recaptcha_fails_closed_without_config():
    with patch.object(demo, "_RECAPTCHA_API_KEY", ""):
        assert await demo.verify_recaptcha("tok") is False


@pytest.mark.asyncio
async def test_non_demo_user_bypasses_quota():
    user = _google_token()
    # Should return unchanged without touching Firestore.
    assert await demo.require_user_or_demo_quota(user) == user


@pytest.mark.asyncio
async def test_demo_user_under_limit_increments_and_passes():
    user = _anon_token()
    with patch.object(demo, "_read_ai_calls", AsyncMock(return_value=5)), \
         patch.object(demo, "_increment_ai_calls", AsyncMock()) as inc, \
         patch.object(demo, "_MAX_AI_CALLS", 100):
        result = await demo.require_user_or_demo_quota(user)
    assert result == user
    inc.assert_awaited_once()


@pytest.mark.asyncio
async def test_demo_user_over_limit_raises_429():
    user = _anon_token()
    with patch.object(demo, "_read_ai_calls", AsyncMock(return_value=100)), \
         patch.object(demo, "_increment_ai_calls", AsyncMock()) as inc, \
         patch.object(demo, "_MAX_AI_CALLS", 100):
        with pytest.raises(HTTPException) as exc:
            await demo.require_user_or_demo_quota(user)
    assert exc.value.status_code == 429
    assert exc.value.detail["code"] == "demo_limit_reached"
    inc.assert_not_awaited()
