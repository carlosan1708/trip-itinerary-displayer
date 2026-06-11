"""Tests for demo mode: Turnstile verification + per-uid AI quota."""
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


@pytest.mark.asyncio
async def test_verify_turnstile_success():
    resp = MagicMock()
    resp.json.return_value = {"success": True}
    client = AsyncMock()
    client.post.return_value = resp
    with patch.object(demo, "_TURNSTILE_SECRET", "secret"), \
         patch("demo.httpx.AsyncClient") as ac:
        ac.return_value.__aenter__.return_value = client
        assert await demo.verify_turnstile("tok") is True


@pytest.mark.asyncio
async def test_verify_turnstile_fails_closed_without_secret():
    with patch.object(demo, "_TURNSTILE_SECRET", ""):
        assert await demo.verify_turnstile("tok") is False


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
