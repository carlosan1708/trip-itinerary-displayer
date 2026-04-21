"""
Unit tests for chat.py — pure Python logic, no external calls.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chat import _detect_intent, _build_contents, _extract_sources


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
        from unittest.mock import MagicMock
        response = MagicMock()
        response.candidates = []
        sources = _extract_sources(response)
        assert sources == []
