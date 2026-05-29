"""
Two-call itinerary creation — skeleton + all days in one shot.
No LangGraph, no per-part parallel agents, no Wikimedia agentic loops.

Before:  1 orchestrator call + N × (up to 10 part-agent iterations) + merge
After:   2 Gemini calls total, pure-Python merge
"""
import json
import logging
from typing import AsyncIterator
from google.genai import types
from config import gemini_client, MODEL

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_SKELETON_PROMPT = """You are a trip planning assistant. Given trip parameters, produce a JSON skeleton
that defines the high-level structure of the itinerary.

Respond with ONLY a valid JSON object (no markdown, no explanation):
{
  "label": "<short trip name, e.g. 'Ruta Oeste'>",
  "title": "<full title, e.g. 'Itinerario Canadá'>",
  "subtitle": "<date range and route, e.g. 'Sep 12 – Sep 30, 2026'>",
  "stats": ["<N días>", "<N provincias/states>", "<N ciudades>", "<origin> → <destination>"],
  "parts": [
    {
      "id": 1,
      "emoji": "<single emoji>",
      "title": "<part title>",
      "color": "<hex color>",
      "daysRange": "<e.g. 'Días 1 – 4'>",
      "locations": ["<city1>", "<city2>"]
    }
  ]
}

Rules:
- Use the trip's language (Spanish for "es", English for "en", etc.)
- Assign a distinct hex color per part (travel palette: blues, greens, oranges, purples)
- Keep parts to 2–5 total; each part covers a geographic region
- locations array drives which cities the days will cover — be specific"""

_DAYS_PROMPT = """You are a trip planning assistant. Generate day-by-day content for ALL parts of this trip.

Return ONLY a valid JSON object where keys are part IDs (as strings) and values are arrays of day objects.
No markdown, no explanation — just the JSON object.

Day object format:
{
  "dayNumber": 1,
  "date": "<e.g. 'Sáb 12 Sep'>",
  "location": "<primary city>",
  "subtitle": "<one-line day theme>",
  "logistics": [
    { "type": "flight|drive|stay|train", "label": "<label>", "value": "<detail>" }
  ],
  "activities": ["<rich description with distances, costs, insider tips>"],
  "tips": ["<practical tip>"],
  "warnings": [],
  "links": [{ "label": "<name>", "url": "<https://...>" }],
  "images": []
}

Rules:
- Root keys are the part "id" as a string (e.g. "1", "2", "3")
- Generate ALL days for every part based on the daysRange
- logistics.type must be exactly one of: flight, drive, stay, train
- Use the same language as the trip skeleton
- Activities should be rich and specific (landmarks, costs in local currency, practical tips)"""

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _params_text(p: dict) -> str:
    return (
        f"Destination: {p['destination']}\n"
        f"Dates: {p['dates']}\n"
        f"Days: {p['num_days']}\n"
        f"Travelers: {p['travelers']}\n"
        f"Interests: {', '.join(p.get('interests', []))}\n"
        f"Budget: {p['budget']}\n"
        f"Pace: {p['pace']}\n"
        f"Language: {p.get('language', 'es')}\n"
    )


def _strip_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0].strip()
    return text


async def _gemini_json(system_prompt: str, user_message: str) -> dict | list:
    """Single async Gemini call, returns parsed JSON."""
    response = await gemini_client.aio.models.generate_content(
        model=MODEL,
        contents=user_message,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
        ),
    )
    return json.loads(_strip_fence(response.text or "{}"))


def _merge(skeleton: dict, days_by_part: dict, user_email: str) -> dict:
    parts = []
    for part in skeleton["parts"]:
        part_id = str(part["id"])
        days = days_by_part.get(part_id, days_by_part.get(part["id"], []))
        parts.append({
            "id": part["id"],
            "emoji": part["emoji"],
            "title": part["title"],
            "color": part["color"],
            "daysRange": part["daysRange"],
            "days": days,
        })
    return {
        "version": 1,
        "author": user_email,
        "label": skeleton["label"],
        "title": skeleton["title"],
        "subtitle": skeleton["subtitle"],
        "stats": skeleton["stats"],
        "parts": parts,
    }


# ---------------------------------------------------------------------------
# Public runner
# ---------------------------------------------------------------------------

_MESSAGES = {
    "en": {
        "skeleton_done": "Structure planned",
        "days_done":     "Days generated",
        "creation_failed": "Could not generate the itinerary. Please try again.",
    },
    "es": {
        "skeleton_done": "Estructura planificada",
        "days_done":     "Días generados",
        "creation_failed": "No se pudo generar el itinerario. Intenta de nuevo.",
    },
}


def _msg(lang: str, key: str) -> str:
    return _MESSAGES.get(lang, _MESSAGES["en"]).get(key, _MESSAGES["en"][key])


async def run_creation(user_params: dict, user_email: str) -> AsyncIterator[dict]:
    """
    Yields SSE event dicts:
      { "event": "progress", "data": { "text": "..." } }
      { "event": "done",     "data": { "itinerary": {...} } }
      { "event": "error",    "data": { "message": "..." } }
    """
    params = _params_text(user_params)
    lang   = user_params.get("language", "en")

    try:
        # Call 1 — skeleton (structure only, fast)
        skeleton = await _gemini_json(_SKELETON_PROMPT, params)
        yield {"event": "progress", "data": {"text": _msg(lang, "skeleton_done")}}

        # Call 2 — all days for all parts in one shot
        days_user_msg = (
            f"Trip skeleton:\n{json.dumps(skeleton, ensure_ascii=False, indent=2)}\n\n"
            f"Trip parameters:\n{params}\n\n"
            "Generate day content for ALL parts listed above."
        )
        days_by_part = await _gemini_json(_DAYS_PROMPT, days_user_msg)
        yield {"event": "progress", "data": {"text": _msg(lang, "days_done")}}

        # Merge — pure Python, no API call
        itinerary = _merge(skeleton, days_by_part, user_email)
        yield {"event": "done", "data": {"itinerary": itinerary}}

    except Exception as exc:
        logger.exception("Creation failed")
        yield {"event": "error", "data": {"message": _msg(lang, "creation_failed")}}
