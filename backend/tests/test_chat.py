"""
Unit tests for chat.py — pure Python logic, no external calls.
"""
import sys
import os
from types import SimpleNamespace
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import chat as chat_module
from chat import (
    _detect_intent, _build_contents, _extract_sources,
    _empty_response_reason, _build_systems, _COPY_RESPONSE, run_conversation,
    _parse_edit_response, POLICY_APPLY, POLICY_DUPLICATE,
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
    """Structured intent contract: answer | propose_patch | copy.

    Detection is SYMMETRIC — it no longer takes a mode and no longer downgrades
    a viewer's edit request to Q&A. Ownership is applied later as a policy on the
    proposed patch, not by suppressing the patch. This is the P0 fix: a viewer
    asking to modify the trip now gets a propose_patch (→ offered as a duplicate).
    """

    # ── copy wins ──
    def test_copy_spanish(self):
        assert _detect_intent("quiero una copia del itinerario") == "copy"

    def test_copy_english(self):
        assert _detect_intent("make a copy for me") == "copy"

    def test_duplicate_is_copy(self):
        assert _detect_intent("duplicate this") == "copy"

    def test_copy_beats_edit_marker(self):
        # "quiero" is an edit marker, but copy detection wins.
        assert _detect_intent("quiero una copia del itinerario") == "copy"

    # ── questions → answer ──
    def test_question_is_answer(self):
        assert _detect_intent("qué tiempo hace en Vancouver en septiembre?") == "answer"

    def test_question_opener_is_answer(self):
        assert _detect_intent("tell me about Banff") == "answer"

    def test_empty_is_answer(self):
        assert _detect_intent("") == "answer"

    def test_various_questions_are_answers(self):
        assert _detect_intent("what's the weather in Tokyo?") == "answer"
        assert _detect_intent("how much is a JR pass") == "answer"
        assert _detect_intent("is it safe at night") == "answer"
        assert _detect_intent("do you know what visa I need") == "answer"

    # ── edit requests → propose_patch (for everyone) ──
    def test_edit_marker_is_propose_patch(self):
        assert _detect_intent("cambia el día 3 a Montreal") == "propose_patch"

    def test_add_marker_is_propose_patch(self):
        assert _detect_intent("añade una visita al CN Tower") == "propose_patch"

    def test_non_question_is_propose_patch(self):
        # A verbless fragment reads as an edit instruction, not a question.
        assert _detect_intent("from costa rica") == "propose_patch"
        assert _detect_intent("start it from costa rica") == "propose_patch"
        assert _detect_intent("a beach somewhere warm") == "propose_patch"

    def test_want_include_phrasing_is_propose_patch(self):
        assert _detect_intent("I want one day to include Guanacaste") == "propose_patch"
        assert _detect_intent("include a beach day in the trip") == "propose_patch"
        assert _detect_intent("I'd like to spend day 2 in Montreal") == "propose_patch"
        assert _detect_intent("quiero que el día 1 incluya Guanacaste") == "propose_patch"

    def test_reduce_phrasings_are_propose_patch(self):
        assert _detect_intent("I asked for 2 day") == "propose_patch"
        assert _detect_intent("make it 2 days") == "propose_patch"
        assert _detect_intent("drop the last day") == "propose_patch"
        assert _detect_intent("only 2 days please") == "propose_patch"

    def test_explicit_edit_marker_overrides_question_shape(self):
        # "can you add ...?" is phrased as a question but the edit marker wins.
        assert _detect_intent("can you add a beach day?") == "propose_patch"

    # ── the P0 regression guard: detection does not depend on ownership ──
    def test_viewer_edit_request_still_proposes_patch(self):
        # Same message, whether or not the caller owns the trip: always a patch.
        # (Ownership becomes a policy on the patch, tested in TestProposePatchPolicy.)
        assert _detect_intent("cambia el día 3 a Montreal") == "propose_patch"
        assert _detect_intent("make it 2 days") == "propose_patch"


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
            is_owner=False,
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
            is_owner=False,
            language="es",
        )
        assert events[0]["data"]["response"] == _COPY_RESPONSE["es"]


@pytest.mark.asyncio
class TestProposePatchPolicy:
    """The propose_patch path attaches a server-derived policy and never emits an
    unsanitised patch. Ownership is decided by `is_owner` (from the authenticated
    identity vs the itinerary author), not by the client."""

    _ITIN = {"title": "T", "author": "owner@x.com", "parts": []}

    async def _run(self, is_owner, patch_json):
        fake = SimpleNamespace(text=patch_json)
        with patch.object(
            chat_module.gemini_client.aio.models,
            "generate_content",
            new=AsyncMock(return_value=fake),
        ):
            return [
                evt async for evt in run_conversation(
                    messages=[{"role": "user", "content": "cambia el día 3 a Montreal"}],
                    itinerary=self._ITIN,
                    is_owner=is_owner,
                    language="en",
                )
            ]

    def _done(self, events):
        done = [e for e in events if e["event"] == "done"]
        assert done, f"no done event in {events}"
        return done[0]["data"]

    async def test_owner_gets_apply_allowed_policy(self):
        events = await self._run(True, '{"patch": {"label": "New"}, "explanation": "ok"}')
        assert self._done(events)["policy"] == POLICY_APPLY

    async def test_viewer_gets_duplicate_only_policy(self):
        # The P0 fix: a viewer's modification request is honoured as a patch, but
        # can only be applied to a personal copy.
        events = await self._run(False, '{"patch": {"label": "New"}, "explanation": "ok"}')
        assert self._done(events)["policy"] == POLICY_DUPLICATE

    async def test_protected_field_is_stripped_before_emit(self):
        events = await self._run(
            True, '{"patch": {"author": "evil@x.com", "label": "New"}, "explanation": "ok"}'
        )
        data = self._done(events)
        assert "author" not in data["patch"]
        assert data["patch"] == {"label": "New"}
        assert data["rejected"]  # the drop is reported

    async def test_clean_patch_reports_no_rejections(self):
        events = await self._run(True, '{"patch": {"label": "New"}, "explanation": "ok"}')
        assert self._done(events)["rejected"] == []
