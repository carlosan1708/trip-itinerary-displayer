"""
Tests for schemas.sanitize_patch — the security boundary for agent-proposed
itinerary edits. Written test-first (TDD): every case names a concrete attack or
malformation the sanitizer must neutralise without ever raising.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from schemas import sanitize_patch


class TestProtectedTopLevelFields:
    def test_strips_author(self):
        clean, rejected = sanitize_patch({"author": "attacker@evil.com", "label": "X"})
        assert "author" not in clean
        assert clean == {"label": "X"}
        assert any("author" in r for r in rejected)

    def test_strips_version(self):
        clean, rejected = sanitize_patch({"version": 999, "title": "T"})
        assert "version" not in clean
        assert clean == {"title": "T"}
        assert any("version" in r for r in rejected)

    def test_strips_access_control_fields(self):
        clean, rejected = sanitize_patch(
            {"permissions": {"x": 1}, "allowed_users": ["a"], "owner": "b", "label": "L"}
        )
        assert clean == {"label": "L"}
        assert len(rejected) == 3

    def test_keeps_allowed_top_level_fields(self):
        patch = {"label": "L", "title": "T", "subtitle": "S", "stats": ["1 day"]}
        clean, rejected = sanitize_patch(patch)
        assert clean == patch
        assert rejected == []


class TestUnknownFields:
    def test_strips_unknown_top_level_field(self):
        clean, rejected = sanitize_patch({"label": "L", "evilField": 1})
        assert clean == {"label": "L"}
        assert any("evilField" in r for r in rejected)

    def test_strips_unknown_part_field(self):
        clean, rejected = sanitize_patch(
            {"parts": [{"id": 1, "hacked": True, "title": "P"}]}
        )
        assert clean["parts"][0] == {"id": 1, "title": "P"}
        assert any("hacked" in r for r in rejected)

    def test_strips_unknown_day_field(self):
        clean, rejected = sanitize_patch(
            {"parts": [{"id": 1, "days": [{"dayNumber": 1, "malware": "x", "location": "Paris"}]}]}
        )
        assert clean["parts"][0]["days"][0] == {"dayNumber": 1, "location": "Paris"}
        assert any("malware" in r for r in rejected)


class TestProtectedNestedFields:
    def test_strips_author_inside_part(self):
        clean, rejected = sanitize_patch({"parts": [{"id": 1, "author": "x", "title": "P"}]})
        assert "author" not in clean["parts"][0]
        assert any("author" in r for r in rejected)

    def test_part_id_is_preserved_for_matching(self):
        # `id` is match-only but must survive so the merge can locate the part.
        clean, _ = sanitize_patch({"parts": [{"id": 3, "title": "P"}]})
        assert clean["parts"][0]["id"] == 3

    def test_day_number_is_preserved_for_matching(self):
        clean, _ = sanitize_patch({"parts": [{"id": 1, "days": [{"dayNumber": 2, "location": "X"}]}]})
        assert clean["parts"][0]["days"][0]["dayNumber"] == 2

    def test_delete_marker_survives_on_part_and_day(self):
        clean, _ = sanitize_patch(
            {"parts": [{"id": 1, "_delete": True}, {"id": 2, "days": [{"dayNumber": 3, "_delete": True}]}]}
        )
        assert clean["parts"][0]["_delete"] is True
        assert clean["parts"][1]["days"][0]["_delete"] is True


class TestLogisticsEnum:
    def test_valid_logistics_type_survives(self):
        patch = {"parts": [{"id": 1, "days": [{"dayNumber": 1, "logistics": [
            {"type": "flight", "label": "Flight", "value": "SJO-YVR"}]}]}]}
        clean, rejected = sanitize_patch(patch)
        assert clean["parts"][0]["days"][0]["logistics"] == patch["parts"][0]["days"][0]["logistics"]
        assert rejected == []

    def test_invalid_logistics_type_dropped(self):
        patch = {"parts": [{"id": 1, "days": [{"dayNumber": 1, "logistics": [
            {"type": "teleport", "label": "?", "value": "?"},
            {"type": "drive", "label": "Drive", "value": "2h"}]}]}]}
        clean, rejected = sanitize_patch(patch)
        logistics = clean["parts"][0]["days"][0]["logistics"]
        assert len(logistics) == 1
        assert logistics[0]["type"] == "drive"
        assert any("teleport" in r for r in rejected)


class TestSafeUrls:
    def test_https_link_survives(self):
        patch = {"parts": [{"id": 1, "days": [{"dayNumber": 1, "links": [
            {"label": "Site", "url": "https://example.com"}]}]}]}
        clean, rejected = sanitize_patch(patch)
        assert len(clean["parts"][0]["days"][0]["links"]) == 1
        assert rejected == []

    def test_javascript_url_dropped(self):
        patch = {"parts": [{"id": 1, "days": [{"dayNumber": 1, "links": [
            {"label": "x", "url": "javascript:alert(1)"}]}]}]}
        clean, rejected = sanitize_patch(patch)
        assert clean["parts"][0]["days"][0]["links"] == []
        assert any("unsafe url" in r for r in rejected)

    def test_http_url_dropped(self):
        patch = {"parts": [{"id": 1, "days": [{"dayNumber": 1, "links": [
            {"label": "x", "url": "http://insecure.com"}]}]}]}
        clean, _ = sanitize_patch(patch)
        assert clean["parts"][0]["days"][0]["links"] == []

    def test_needs_image_sentinel_allowed(self):
        patch = {"parts": [{"id": 1, "days": [{"dayNumber": 1, "images": [
            {"url": "NEEDS_IMAGE"}]}]}]}
        # images aren't URL-checked the same way as links, but the sentinel must
        # never be rejected as unsafe anywhere it appears.
        clean, rejected = sanitize_patch(patch)
        assert rejected == []


class TestMalformedNeverRaises:
    def test_none_returns_empty(self):
        clean, rejected = sanitize_patch(None)
        assert clean == {}
        assert rejected == []

    def test_non_dict_patch_reports_and_returns_empty(self):
        clean, rejected = sanitize_patch(["not", "a", "dict"])
        assert clean == {}
        assert rejected

    def test_parts_not_a_list_is_reported(self):
        clean, rejected = sanitize_patch({"parts": "nope", "label": "L"})
        assert clean == {"label": "L"}
        assert any("parts" in r for r in rejected)

    def test_non_dict_part_is_skipped(self):
        clean, rejected = sanitize_patch({"parts": [42, {"id": 1, "title": "P"}]})
        assert len(clean["parts"]) == 1
        assert clean["parts"][0] == {"id": 1, "title": "P"}

    def test_empty_patch_is_clean(self):
        clean, rejected = sanitize_patch({})
        assert clean == {}
        assert rejected == []


class TestRealisticEdit:
    def test_legit_activity_edit_passes_untouched(self):
        patch = {"parts": [{"id": 2, "days": [
            {"dayNumber": 5, "activities": ["Visit Stanley Park", "Bike the seawall"]}]}]}
        clean, rejected = sanitize_patch(patch)
        assert clean == patch
        assert rejected == []

    def test_mixed_legit_and_malicious_keeps_legit_drops_bad(self):
        patch = {
            "author": "attacker@evil.com",
            "label": "Ruta Oeste",
            "parts": [{"id": 1, "days": [
                {"dayNumber": 1, "location": "Vancouver", "secretFlag": True}]}],
        }
        clean, rejected = sanitize_patch(patch)
        assert "author" not in clean
        assert clean["label"] == "Ruta Oeste"
        assert clean["parts"][0]["days"][0] == {"dayNumber": 1, "location": "Vancouver"}
        assert len(rejected) == 2
