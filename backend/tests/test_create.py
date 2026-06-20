"""
Unit tests for create.py — pure Python helpers plus the run_creation
streaming runner (Gemini calls patched out).
"""
import sys
import os
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from create import _params_text, _strip_fence, _merge, _msg, run_creation


def _params(**overrides):
    base = {
        "destination": "Canada",
        "dates": "Sep 12 – Sep 30, 2026",
        "num_days": 18,
        "travelers": 2,
        "interests": ["hiking", "food"],
        "budget": "mid",
        "pace": "moderate",
        "language": "en",
    }
    base.update(overrides)
    return base


class TestParamsText:
    def test_includes_all_fields(self):
        text = _params_text(_params())
        assert "Destination: Canada" in text
        assert "Days: 18" in text
        assert "Travelers: 2" in text
        assert "Budget: mid" in text
        assert "Pace: moderate" in text

    def test_joins_interests_with_commas(self):
        assert "Interests: hiking, food" in _params_text(_params())

    def test_handles_missing_interests(self):
        text = _params_text(_params(interests=[]))
        assert "Interests: \n" in text

    def test_defaults_language_to_es(self):
        p = _params()
        del p["language"]
        assert "Language: es" in _params_text(p)


class TestStripFence:
    def test_passes_through_plain_json(self):
        assert _strip_fence('{"a": 1}') == '{"a": 1}'

    def test_strips_json_fence(self):
        assert _strip_fence('```json\n{"a": 1}\n```') == '{"a": 1}'

    def test_strips_bare_fence(self):
        assert _strip_fence('```\n{"a": 1}\n```') == '{"a": 1}'

    def test_strips_leading_and_trailing_whitespace(self):
        assert _strip_fence('   {"a": 1}   ') == '{"a": 1}'

    def test_handles_fence_with_no_newline(self):
        # "```" with no newline → slice off the first 3 chars, drop trailing fence
        assert _strip_fence('```{"a":1}```') == '{"a":1}'


class TestMerge:
    def _skeleton(self):
        return {
            "label": "West", "title": "Canada", "subtitle": "Sep 2026",
            "stats": ["18 días"],
            "parts": [
                {"id": 1, "emoji": "🏔️", "title": "BC", "color": "#08c", "daysRange": "1–4"},
                {"id": 2, "emoji": "🦌", "title": "AB", "color": "#0a0", "daysRange": "5–7"},
            ],
        }

    def test_attaches_days_by_string_key(self):
        result = _merge(self._skeleton(), {"1": [{"dayNumber": 1}], "2": []}, "u@test.com")
        assert result["parts"][0]["days"] == [{"dayNumber": 1}]
        assert result["parts"][1]["days"] == []

    def test_falls_back_to_int_key(self):
        result = _merge(self._skeleton(), {1: [{"dayNumber": 1}]}, "u@test.com")
        assert result["parts"][0]["days"] == [{"dayNumber": 1}]

    def test_missing_part_days_defaults_to_empty_list(self):
        result = _merge(self._skeleton(), {}, "u@test.com")
        assert result["parts"][0]["days"] == []
        assert result["parts"][1]["days"] == []

    def test_sets_version_and_author(self):
        result = _merge(self._skeleton(), {}, "author@test.com")
        assert result["version"] == 1
        assert result["author"] == "author@test.com"

    def test_carries_through_skeleton_metadata(self):
        result = _merge(self._skeleton(), {}, "u@test.com")
        assert result["label"] == "West"
        assert result["title"] == "Canada"
        assert result["stats"] == ["18 días"]


class TestMsg:
    def test_english_message(self):
        assert _msg("en", "skeleton_done") == "Structure planned"

    def test_spanish_message(self):
        assert _msg("es", "days_done") == "Días generados"

    def test_unknown_language_falls_back_to_english(self):
        assert _msg("fr", "skeleton_done") == "Structure planned"


@pytest.mark.asyncio
class TestRunCreation:
    async def _collect(self, params, json_side_effect):
        with patch("create._gemini_json", AsyncMock(side_effect=json_side_effect)):
            return [evt async for evt in run_creation(params, "u@test.com")]

    async def test_success_emits_two_progress_then_done(self):
        skeleton = {
            "label": "L", "title": "T", "subtitle": "S", "stats": [],
            "parts": [{"id": 1, "emoji": "🏔️", "title": "BC", "color": "#08c", "daysRange": "1–2"}],
        }
        days = {"1": [{"dayNumber": 1, "location": "Vancouver"}]}
        events = await self._collect(_params(), [skeleton, days])

        kinds = [e["event"] for e in events]
        assert kinds == ["progress", "progress", "done"]
        itinerary = events[-1]["data"]["itinerary"]
        assert itinerary["title"] == "T"
        assert itinerary["parts"][0]["days"][0]["location"] == "Vancouver"

    async def test_failure_emits_error_event(self):
        events = await self._collect(_params(), Exception("gemini down"))
        assert events[-1]["event"] == "error"
        assert "Could not generate" in events[-1]["data"]["message"]

    async def test_failure_uses_localized_message(self):
        events = await self._collect(_params(language="es"), Exception("boom"))
        assert events[-1]["event"] == "error"
        assert "No se pudo" in events[-1]["data"]["message"]
