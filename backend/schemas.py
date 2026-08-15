"""
Patch validation for the itinerary agent.

`sanitize_patch` is the security boundary for agent-proposed edits. A patch comes
back from the model as free-form JSON; before it is ever applied we drop any
field the agent is not allowed to touch (author, version, access lists, unknown
keys), enforce enums (logistics.type) and safe URLs, and report exactly what was
rejected. It never raises: a bad field is stripped, not fatal, so one
hallucinated key can't discard an otherwise-good edit.

The allowlists here are the source of truth for "what an agent may change" and
mirror the client-side allowlist in src/utils/itineraryPatch.js — keep them in
sync.
"""
from __future__ import annotations

from typing import Any

# Top-level itinerary fields a patch may set. `parts` is handled structurally.
ALLOWED_TOP_FIELDS = {"label", "title", "subtitle", "stats", "parts"}

# Part fields. `id` is match-only (never changed) but must be allowed to appear
# so the merge can locate the part; `_delete` is the removal marker.
ALLOWED_PART_FIELDS = {
    "id", "emoji", "title", "color", "daysRange", "locations", "days", "_delete",
}

# Day fields. `dayNumber` is match-only; `_delete` is the removal marker.
ALLOWED_DAY_FIELDS = {
    "dayNumber", "date", "location", "subtitle", "logistics",
    "activities", "tips", "warnings", "links", "images", "_delete",
}

# Fields an agent must never set at any level. Listed explicitly (rather than
# just "not in the allowlist") so a rejection carries a security-relevant label.
PROTECTED_FIELDS = {
    "author", "version", "permissions", "access", "allowed_users",
    "owner", "ownerEmail", "roles", "createdAt", "updatedAt",
}

LOGISTICS_TYPES = {"flight", "drive", "stay", "train"}

# Sentinel the edit prompt uses when it wants an image but has no real URL.
_IMAGE_SENTINEL = "NEEDS_IMAGE"


def sanitize_patch(patch: Any) -> tuple[dict, list[str]]:
    """Return (clean_patch, rejections).

    `clean_patch` contains only allowlisted fields with valid enums/URLs and is
    safe to apply. `rejections` lists every field that was dropped and why.
    Never raises — a malformed patch returns ({}, [reason]).
    """
    if patch is None:
        return {}, []
    if not isinstance(patch, dict):
        return {}, [f"patch must be an object, got {type(patch).__name__}"]

    clean: dict[str, Any] = {}
    rejections: list[str] = []

    for key, value in patch.items():
        if key == "parts":
            if not isinstance(value, list):
                rejections.append("parts must be an array")
                continue
            clean["parts"] = _sanitize_parts(value, rejections)
            continue
        if key in PROTECTED_FIELDS:
            rejections.append(f"rejected protected field '{key}'")
            continue
        if key not in ALLOWED_TOP_FIELDS:
            rejections.append(f"rejected unknown field '{key}'")
            continue
        clean[key] = value

    return clean, rejections


def _sanitize_parts(parts: list, rejections: list[str]) -> list:
    clean_parts: list[dict] = []
    for idx, part in enumerate(parts):
        if not isinstance(part, dict):
            rejections.append(f"parts[{idx}] is not an object")
            continue
        clean_part: dict[str, Any] = {}
        for key, value in part.items():
            if key == "days":
                if not isinstance(value, list):
                    rejections.append(f"parts[{idx}].days must be an array")
                    continue
                clean_part["days"] = _sanitize_days(value, idx, rejections)
                continue
            if key in PROTECTED_FIELDS:
                rejections.append(f"rejected protected field 'parts[{idx}].{key}'")
                continue
            if key not in ALLOWED_PART_FIELDS:
                rejections.append(f"rejected unknown field 'parts[{idx}].{key}'")
                continue
            clean_part[key] = value
        clean_parts.append(clean_part)
    return clean_parts


def _sanitize_days(days: list, part_idx: int, rejections: list[str]) -> list:
    clean_days: list[dict] = []
    for jdx, day in enumerate(days):
        if not isinstance(day, dict):
            rejections.append(f"parts[{part_idx}].days[{jdx}] is not an object")
            continue
        clean_day: dict[str, Any] = {}
        for key, value in day.items():
            if key in PROTECTED_FIELDS:
                rejections.append(
                    f"rejected protected field 'parts[{part_idx}].days[{jdx}].{key}'"
                )
                continue
            if key not in ALLOWED_DAY_FIELDS:
                rejections.append(
                    f"rejected unknown field 'parts[{part_idx}].days[{jdx}].{key}'"
                )
                continue
            if key == "logistics":
                clean_day[key] = _sanitize_logistics(value, part_idx, jdx, rejections)
            elif key == "links":
                clean_day[key] = _sanitize_links(value, part_idx, jdx, rejections)
            else:
                clean_day[key] = value
        clean_days.append(clean_day)
    return clean_days


def _sanitize_logistics(value, part_idx, day_idx, rejections) -> list:
    if not isinstance(value, list):
        rejections.append(f"parts[{part_idx}].days[{day_idx}].logistics must be an array")
        return []
    out = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        t = entry.get("type")
        if t is not None and t not in LOGISTICS_TYPES:
            rejections.append(
                f"dropped logistics with invalid type '{t}' (parts[{part_idx}].days[{day_idx}])"
            )
            continue
        out.append(entry)
    return out


def _sanitize_links(value, part_idx, day_idx, rejections) -> list:
    if not isinstance(value, list):
        rejections.append(f"parts[{part_idx}].days[{day_idx}].links must be an array")
        return []
    out = []
    for link in value:
        if not isinstance(link, dict):
            continue
        if not _is_safe_url(link.get("url")):
            rejections.append(
                f"dropped link with unsafe url (parts[{part_idx}].days[{day_idx}])"
            )
            continue
        out.append(link)
    return out


def _is_safe_url(url: Any) -> bool:
    """Only https:// URLs (or the image sentinel) survive. Blocks http, data:,
    javascript:, and any other scheme an agent might emit."""
    if not isinstance(url, str):
        return False
    u = url.strip()
    return u == _IMAGE_SENTINEL or u.lower().startswith("https://")
