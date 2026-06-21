"""
Unit tests for chat.py — pure Python logic, no external calls.
"""
import sys
import os
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chat import (
    _detect_intent, _build_contents, _extract_sources,
    _empty_response_reason, _build_systems, _COPY_RESPONSE, run_conversation,
    _parse_edit_response,
)
import json as _json


class TestParseEditResponse:
    def test_extracts_patch_explanation_and_warning(self):
        raw = _json.dumps({"patch": {"a": 1}, "explanation": "ok", "warning": "Beijing is far"})
        out = _parse_edit_response(raw)
        assert out == {"response": "ok", "patch": {"a": 1}, "warning": "Beijing is far"}

    def test_warning_absent_is_none(self):
        out = _parse_edit_response(_json.dumps({"patch": {}, "explanation": "ok"}))
        assert out["warning"] is None

    def test_empty_warning_is_none(self):
        out = _parse_edit_response(_json.dumps({"patch": {}, "explanation": "ok", "warning": "  "}))
        assert out["warning"] is None

    def test_strips_code_fences(self):
        out = _parse_edit_response('```json\n{"patch":{},"explanation":"x"}\n```')
        assert out["response"] == "x"

    def test_malformed_json_falls_back(self):
        out = _parse_edit_response("not json")
        assert out["patch"] == {}
        assert out["warning"] is None
        assert "Error processing suggestion" in out["response"]

    def test_none_input_falls_back(self):
        out = _parse_edit_response(None)
        assert out["patch"] == {}


class TestDetectIntent:
    def test_copy_spanish(self):
        assert _detect_intent("quiero una copia del itinerario", "edit") == "copy"

    def test_copy_english(self):
        assert _detect_intent("make a copy for me", "edit") == "copy"

    def test_copy_in_explore_mode(self):
        # copy is allowed in explore mode too
        assert _detect_intent("duplicate this", "explore") == "copy"

    def test_edit_in_edit_mode(self):
        assert _detect_intent("cambia el día 3 a Montreal", "edit") == "edit"

    def test_edit_blocked_in_explore_mode(self):
        # non-authors cannot edit — edit intent downgrades to qa
        assert _detect_intent("cambia el día 3 a Montreal", "explore") == "qa"

    def test_qa_question(self):
        assert _detect_intent("qué tiempo hace en Vancouver en septiembre?", "edit") == "qa"

    def test_qa_fallback(self):
        assert _detect_intent("tell me about Banff", "edit") == "qa"

    def test_empty_message(self):
        assert _detect_intent("", "edit") == "qa"

    def test_add_marker_edit_mode(self):
        assert _detect_intent("añade una visita al CN Tower", "edit") == "edit"

    def test_add_marker_explore_mode(self):
        assert _detect_intent("añade una visita al CN Tower", "explore") == "qa"

    # Verbless / "I want ... to include ..." phrasings must register as edits
    # in edit mode — these previously fell through to QA and dumped prose
    # instead of producing a patch (regression: preview refinement).
    def test_want_include_phrasing_edit_mode(self):
        assert _detect_intent("I want one day to include Guanacaste", "edit") == "edit"

    def test_include_phrasing_edit_mode(self):
        assert _detect_intent("include a beach day in the trip", "edit") == "edit"

    def test_id_like_phrasing_edit_mode(self):
        assert _detect_intent("I'd like to spend day 2 in Montreal", "edit") == "edit"

    def test_spanish_quiero_incluya_edit_mode(self):
        assert _detect_intent("quiero que el día 1 incluya Guanacaste", "edit") == "edit"

    def test_want_include_blocked_in_explore_mode(self):
        # still downgrades to qa for non-authors
        assert _detect_intent("I want one day to include Guanacaste", "explore") == "qa"

    # Copy detection still wins even though "quiero" is now an edit marker.
    def test_copy_beats_edit_marker(self):
        assert _detect_intent("quiero una copia del itinerario", "edit") == "copy"

    # Reduce / shorten phrasings must register as edits (they map to day removals).
    def test_i_asked_for_n_days_edit_mode(self):
        assert _detect_intent("I asked for 2 day", "edit") == "edit"

    def test_make_it_n_days_edit_mode(self):
        assert _detect_intent("make it 2 days", "edit") == "edit"

    def test_drop_last_day_edit_mode(self):
        assert _detect_intent("drop the last day", "edit") == "edit"

    def test_only_n_days_edit_mode(self):
        assert _detect_intent("only 2 days please", "edit") == "edit"

    def test_reduce_blocked_in_explore_mode(self):
        assert _detect_intent("make it 2 days", "explore") == "qa"


class TestBuildContents:
    def test_injects_itinerary_into_first_user_turn(self):
        messages = [{"role": "user", "content": "Hello"}]
        itinerary = {"title": "Canada"}
        contents = _build_contents(messages, itinerary)
        assert len(contents) == 1
        assert "Canada" in contents[0]["parts"][0]["text"]
        assert "Hello" in contents[0]["parts"][0]["text"]

    def test_no_injection_without_itinerary(self):
        messages = [{"role": "user", "content": "Hello"}]
        contents = _build_contents(messages, None)
        assert contents[0]["parts"][0]["text"] == "Hello"

    def test_assistant_role_becomes_model(self):
        messages = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello"},
        ]
        contents = _build_contents(messages, None)
        assert contents[0]["role"] == "user"
        assert contents[1]["role"] == "model"

    def test_itinerary_only_in_first_turn(self):
        messages = [
            {"role": "user", "content": "first"},
            {"role": "user", "content": "second"},
        ]
        contents = _build_contents(messages, {"title": "Trip"})
        assert "Trip" in contents[0]["parts"][0]["text"]
        assert "Trip" not in contents[1]["parts"][0]["text"]

    def test_extract_sources_no_grounding(self):
        response = MagicMock()
        response.candidates = []
        sources = _extract_sources(response)
        assert sources == []


class TestExtractSources:
    def _response_with_chunks(self, chunks):
        web_chunks = []
        for c in chunks:
            web = SimpleNamespace(**c) if c is not None else None
            web_chunks.append(SimpleNamespace(web=web))
        meta = SimpleNamespace(grounding_chunks=web_chunks)
        candidate = SimpleNamespace(grounding_metadata=meta)
        return SimpleNamespace(candidates=[candidate])

    def test_extracts_title_and_url(self):
        resp = self._response_with_chunks([{"title": "Banff", "uri": "https://banff.ca"}])
        assert _extract_sources(resp) == [{"title": "Banff", "url": "https://banff.ca"}]

    def test_falls_back_to_uri_when_title_missing(self):
        resp = self._response_with_chunks([{"title": "", "uri": "https://x.com"}])
        assert _extract_sources(resp) == [{"title": "https://x.com", "url": "https://x.com"}]

    def test_skips_chunks_without_a_uri(self):
        resp = self._response_with_chunks([{"title": "No link", "uri": ""}])
        assert _extract_sources(resp) == []

    def test_skips_chunks_without_web(self):
        resp = self._response_with_chunks([None])
        assert _extract_sources(resp) == []

    def test_tolerates_none_grounding_chunks(self):
        meta = SimpleNamespace(grounding_chunks=None)
        candidate = SimpleNamespace(grounding_metadata=meta)
        resp = SimpleNamespace(candidates=[candidate])
        assert _extract_sources(resp) == []


class TestEmptyResponseReason:
    def _chunk(self, reason_name):
        finish = SimpleNamespace(name=reason_name)
        return SimpleNamespace(candidates=[SimpleNamespace(finish_reason=finish)])

    def test_none_chunk(self):
        assert "network" in _empty_response_reason(None).lower()

    def test_safety_block(self):
        assert "safety" in _empty_response_reason(self._chunk("SAFETY")).lower()

    def test_max_tokens(self):
        assert "token limit" in _empty_response_reason(self._chunk("MAX_TOKENS")).lower()

    def test_unexpected_reason(self):
        msg = _empty_response_reason(self._chunk("RECITATION"))
        assert "RECITATION" in msg

    def test_normal_stop_is_generic_empty(self):
        assert _empty_response_reason(self._chunk("STOP")) == "Empty response from model."

    def test_malformed_chunk_is_generic_empty(self):
        assert _empty_response_reason(object()) == "Empty response from model."


class TestBuildSystems:
    def test_english_label(self):
        qa, edit = _build_systems("en")
        assert "English" in qa
        assert "English" in edit

    def test_spanish_label(self):
        qa, edit = _build_systems("es")
        assert "Spanish" in qa
        assert "Spanish" in edit

    def test_unknown_language_defaults_to_english(self):
        qa, _ = _build_systems("xx")
        assert "English" in qa

    def test_edit_prompt_documents_delete_marker(self):
        _, edit = _build_systems("en")
        assert "_delete" in edit

    def test_edit_prompt_asks_for_warning_on_implausible_requests(self):
        _, edit = _build_systems("en")
        assert "warning" in edit
        assert "implausible" in edit.lower()


@pytest.mark.asyncio
class TestRunConversationCopy:
    async def _collect(self, **kwargs):
        return [evt async for evt in run_conversation(**kwargs)]

    async def test_copy_intent_returns_instant_done_without_api(self):
        events = await self._collect(
            messages=[{"role": "user", "content": "make a copy"}],
            itinerary={"title": "X"},
            mode="explore",
            user_email="u@test.com",
            language="en",
        )
        assert len(events) == 1
        assert events[0]["event"] == "done"
        assert events[0]["data"]["response"] == _COPY_RESPONSE["en"]
        assert events[0]["data"]["patch"] == {}

    async def test_copy_intent_uses_spanish_response(self):
        events = await self._collect(
            messages=[{"role": "user", "content": "quiero una copia"}],
            itinerary=None,
            mode="explore",
            user_email="u@test.com",
            language="es",
        )
        assert events[0]["data"]["response"] == _COPY_RESPONSE["es"]
