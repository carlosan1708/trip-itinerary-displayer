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

from main import app                 # noqa: E402
from auth import verify_token        # noqa: E402  (used for dependency_overrides)


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


class TestSetAdminClaimEndpoint:
    _fake_user = {"uid": "uid-123", "email": "admin@test.com", "admin": False}

    def setup_method(self):
        # Override the FastAPI dependency so routes receive _fake_user
        app.dependency_overrides[verify_token] = lambda: self._fake_user

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_returns_ok_for_valid_token(self):
        with patch("main.set_admin_claim", new_callable=AsyncMock):
            client = TestClient(app)
            resp = client.post("/auth/set-admin-claim")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_rejects_missing_token(self):
        app.dependency_overrides.clear()   # remove override for this test
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/auth/set-admin-claim")
        assert resp.status_code in (401, 403, 422)

    def test_set_admin_claim_called_with_correct_args(self):
        mock_claim = AsyncMock()
        with patch("main.set_admin_claim", mock_claim):
            client = TestClient(app)
            client.post("/auth/set-admin-claim")
        mock_claim.assert_awaited_once_with(
            self._fake_user["uid"],
            self._fake_user["email"],
            self._fake_user,
        )


class TestChatEndpoint:
    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_rejects_unauthenticated(self):
        # No dependency override → real verify_token runs → 403 (no bearer token)
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/chat", json={
            "messages": [{"role": "user", "content": "hello"}],
        })
        assert resp.status_code in (401, 403, 422)

    def test_rejects_empty_messages(self):
        app.dependency_overrides[verify_token] = lambda: {"uid": "x", "email": "x@x.com"}
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/agent/chat", json={"messages": []})
        assert resp.status_code == 422
