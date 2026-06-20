"""
Patch heavy/external dependencies before any backend module is imported.
Must run before test collection touches chat.py, main.py, auth.py, etc.
"""
import os
import sys
from unittest.mock import MagicMock

# Required env vars
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("ADMIN_EMAIL", "admin@test.com")
os.environ.setdefault("FRONTEND_ORIGIN", "http://localhost:5173")

# ── Firebase Admin ──────────────────────────────────────────────────────────
_fa = MagicMock()
_fa._apps = {"[DEFAULT]": MagicMock()}   # non-empty → _init_firebase skips initialize_app
sys.modules.setdefault("firebase_admin", _fa)
sys.modules.setdefault("firebase_admin.auth", MagicMock())
sys.modules.setdefault("firebase_admin.credentials", MagicMock())

# ── Firebase Functions + WSGI bridge ────────────────────────────────────────
sys.modules.setdefault("firebase_functions", MagicMock())
sys.modules.setdefault("firebase_functions.https_fn", MagicMock())
sys.modules.setdefault("firebase_functions.options", MagicMock())
sys.modules.setdefault("a2wsgi", MagicMock())

# ── Gemini / google-genai ────────────────────────────────────────────────────
# Patch at the package level; individual tests mock gemini_client where needed
_genai = MagicMock()
_genai.Client.return_value = MagicMock()
sys.modules.setdefault("google.genai", _genai)
sys.modules.setdefault("google.genai.types", MagicMock())

# ── SlowAPI ──────────────────────────────────────────────────────────────────
# RateLimitExceeded must be a real Exception subclass or FastAPI middleware
# will crash with "issubclass() arg 1 must be a class".
class _RateLimitExceeded(Exception):
    pass

_slowapi_errors = MagicMock()
_slowapi_errors.RateLimitExceeded = _RateLimitExceeded

# limiter.limit(...) must return an identity decorator, otherwise the route
# handler is replaced by a MagicMock with a (*args, **kwargs) signature and
# FastAPI reports spurious 422s for "missing args/kwargs" query params.
_limiter_instance = MagicMock()
_limiter_instance.limit.return_value = lambda fn: fn

_slowapi = MagicMock()
_slowapi.Limiter.return_value = _limiter_instance
_slowapi._rate_limit_exceeded_handler = MagicMock()
sys.modules.setdefault("slowapi", _slowapi)
sys.modules.setdefault("slowapi.errors", _slowapi_errors)
sys.modules.setdefault("slowapi.util", MagicMock())
