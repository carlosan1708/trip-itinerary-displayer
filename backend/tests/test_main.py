"""
Tests for main.py — FastAPI routes and the Firebase Functions WSGI bridge.
"""
import inspect
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient


# ── Import app (conftest already patched heavy deps) ─────────────────────────

from main import app, _ALLOWED_ORIGIN   # noqa: E402
from auth import verify_token           # noqa: E402  (used for dependency_overrides)

_ORIGIN_HEADERS = {"origin": _ALLOWED_ORIGIN}


# ── WSGI bridge structural test ───────────────────────────────────────────────

_MAIN_SRC = open(os.path.join(os.path.dirname(__file__), "..", "main.py")).read()


class TestArchitecture:
    """Guard against re-introducing the Firebase Functions / WSGI bridge layers."""

    def test_no_firebase_functions(self):
        assert "firebase_functions" not in _MAIN_SRC, \
            "firebase_functions must not be imported — backend runs as plain uvicorn on Cloud Run"

    def test_no_a2wsgi(self):
        assert "a2wsgi" not in _MAIN_SRC, \
            "a2wsgi caused 502s — must not be used"

    def test_no_wsgi_start_response(self):
        assert "start_response" not in _MAIN_SRC, \
            "WSGI start_response pattern must not be present"


# ── FastAPI route tests ───────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_returns_ok(self):
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


class TestOriginEnforcement:
    def test_rejects_missing_origin(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/auth/set-admin-claim")
        assert resp.status_code == 403

    def test_rejects_wrong_origin(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/auth/set-admin-claim", headers={"origin": "https://evil.com"})
        assert resp.status_code == 403

    def test_allows_correct_origin(self):
        app.dependency_overrides[verify_token] = lambda: {"uid": "x", "email": "x@x.com"}
        with patch("main.set_admin_claim", new_callable=AsyncMock):
            client = TestClient(app)
            resp = client.post("/auth/set-admin-claim", headers=_ORIGIN_HEADERS)
        app.dependency_overrides.clear()
        assert resp.status_code == 200

    def test_health_exempt_from_origin_check(self):
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200


class TestSetAdminClaimEndpoint:
    _fake_user = {"uid": "uid-123", "email": "admin@test.com", "admin": False}

    def setup_method(self):
        app.dependency_overrides[verify_token] = lambda: self._fake_user

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_returns_ok_for_valid_token(self):
        with patch("main.set_admin_claim", new_callable=AsyncMock):
            client = TestClient(app)
            resp = client.post("/auth/set-admin-claim", headers=_ORIGIN_HEADERS)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_rejects_missing_token(self):
        app.dependency_overrides.clear()
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/auth/set-admin-claim", headers=_ORIGIN_HEADERS)
        assert resp.status_code in (401, 403, 422)

    def test_set_admin_claim_called_with_correct_args(self):
        mock_claim = AsyncMock()
        with patch("main.set_admin_claim", mock_claim):
            client = TestClient(app)
            client.post("/auth/set-admin-claim", headers=_ORIGIN_HEADERS)
        mock_claim.assert_awaited_once_with(
            self._fake_user["uid"],
            self._fake_user["email"],
            self._fake_user,
        )


class TestChatEndpoint:
    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_rejects_missing_origin(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/chat", json={
            "messages": [{"role": "user", "content": "hello"}],
        })
        assert resp.status_code == 403

    def test_rejects_unauthenticated(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/chat", headers=_ORIGIN_HEADERS, json={
            "messages": [{"role": "user", "content": "hello"}],
        })
        assert resp.status_code in (401, 403, 422)

    def test_rejects_empty_messages(self):
        app.dependency_overrides[verify_token] = lambda: {"uid": "x", "email": "x@x.com"}
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/chat", headers=_ORIGIN_HEADERS, json={"messages": []})
        assert resp.status_code == 422

    def test_rejects_invalid_role(self):
        app.dependency_overrides[verify_token] = lambda: {"uid": "x", "email": "x@x.com"}
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/chat", headers=_ORIGIN_HEADERS, json={
            "messages": [{"role": "system", "content": "hi"}],
        })
        assert resp.status_code == 422

    def test_rejects_bad_language_pattern(self):
        app.dependency_overrides[verify_token] = lambda: {"uid": "x", "email": "x@x.com"}
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/chat", headers=_ORIGIN_HEADERS, json={
            "messages": [{"role": "user", "content": "hi"}],
            "language": "english",
        })
        assert resp.status_code == 422


class TestCreateEndpointValidation:
    _user = {"uid": "x", "email": "x@x.com"}

    def setup_method(self):
        app.dependency_overrides[verify_token] = lambda: self._user

    def teardown_method(self):
        app.dependency_overrides.clear()

    def _payload(self, **overrides):
        base = {
            "destination": "Canada", "dates": "Sep 2026", "num_days": 10,
            "travelers": 2, "interests": ["food"], "budget": "mid", "pace": "moderate",
        }
        base.update(overrides)
        return base

    def test_rejects_missing_origin(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/create", json=self._payload())
        assert resp.status_code == 403

    def test_rejects_num_days_over_max(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/create", headers=_ORIGIN_HEADERS, json=self._payload(num_days=61))
        assert resp.status_code == 422

    def test_rejects_num_days_under_min(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/create", headers=_ORIGIN_HEADERS, json=self._payload(num_days=0))
        assert resp.status_code == 422

    def test_rejects_travelers_over_max(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/create", headers=_ORIGIN_HEADERS, json=self._payload(travelers=21))
        assert resp.status_code == 422

    def test_rejects_invalid_budget(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/create", headers=_ORIGIN_HEADERS, json=self._payload(budget="cheap"))
        assert resp.status_code == 422

    def test_rejects_invalid_pace(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/create", headers=_ORIGIN_HEADERS, json=self._payload(pace="fast"))
        assert resp.status_code == 422


class TestDemoStartEndpoint:
    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_rejects_missing_origin(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/demo/start", json={"token": "abc"})
        assert resp.status_code == 403

    def test_rejects_empty_token(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/demo/start", headers=_ORIGIN_HEADERS, json={"token": ""})
        assert resp.status_code == 422

    def test_returns_403_when_recaptcha_fails(self):
        with patch("main.verify_recaptcha", new_callable=AsyncMock, return_value=False):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post("/demo/start", headers=_ORIGIN_HEADERS, json={"token": "tok"})
        assert resp.status_code == 403

    def test_returns_ok_when_recaptcha_passes(self):
        with patch("main.verify_recaptcha", new_callable=AsyncMock, return_value=True):
            client = TestClient(app)
            resp = client.post("/demo/start", headers=_ORIGIN_HEADERS, json={"token": "tok"})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


class TestIdentityAndSseHelpers:
    def test_identity_prefers_email(self):
        from main import _identity
        assert _identity({"uid": "u1", "email": "a@b.com"}) == "a@b.com"

    def test_identity_falls_back_to_demo_uid(self):
        from main import _identity
        assert _identity({"uid": "anon-1"}) == "demo:anon-1"

    def test_sse_formats_event_and_data(self):
        from main import _sse
        out = _sse("token", {"text": "hi"})
        assert out == 'event: token\ndata: {"text": "hi"}\n\n'

    def test_sse_preserves_unicode(self):
        from main import _sse
        out = _sse("progress", {"text": "Días"})
        assert "Días" in out  # ensure_ascii=False keeps accents readable
