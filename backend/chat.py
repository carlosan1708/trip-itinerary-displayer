"""
Single-call chat handler — no LangGraph, no classify API call.
Intent detection via keyword heuristic (zero extra API calls).

Chat path:  heuristic → QA (stream) | edit (JSON) | copy (instant)
"""
import json
import logging
from typing import AsyncIterator
from google.genai import types
from config import gemini_client, MODEL

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_QA_SYSTEM_TEMPLATE = """You are a knowledgeable travel assistant. Answer the user's question about
the trip itinerary. Use Google Search to provide current, accurate information — opening hours,
ticket prices, transport options, weather, visa requirements, etc.
Keep answers concise and practical. Always respond in {language_instruction}."""

_EDIT_SYSTEM_TEMPLATE = """You are a trip itinerary editor. The user wants to modify an existing itinerary.
Produce a minimal RFC 7396 merge-patch that applies only the requested changes.

Rules:
- Match parts by "id" and days by "dayNumber" — never change those values
- Arrays (activities, tips, warnings, links, images) are replaced in full when included in the patch
- Omit fields that should remain unchanged
- logistics.type must be one of: flight, drive, stay, train
- For new or changed images, use only URLs already present in the itinerary or set "url": "NEEDS_IMAGE"
- To ADD a day, include a day with a new "dayNumber" and its full content
- To REMOVE a day, include {{"dayNumber": N, "_delete": true}} — the app renumbers the remaining days. To shorten a trip from M to N days, delete the highest-numbered days
- To REMOVE a whole part, include {{"id": N, "_delete": true}}
- Use the full conversation history to understand context — if rejected before, propose something different
- If the request is geographically or logistically implausible for this trip
  (e.g. adding a day on another continent with no time to travel there, or a
  change that contradicts the trip's destination/dates), STILL produce the
  best-effort patch, but set a short "warning" describing the problem and what
  the traveler should consider (flights, extra days, visas). Leave "warning"
  out or empty when the change is coherent.
- The "explanation" and "warning" fields must be written in {language_instruction}
- Respond with ONLY a JSON object (no markdown):
  {{"patch": {{...merge-patch...}}, "explanation": "<brief plain-text summary>", "warning": "<concern or empty>"}}"""

_LANGUAGE_LABELS = {"en": "English", "es": "Spanish"}

def _build_systems(language: str) -> tuple[str, str]:
    label = _LANGUAGE_LABELS.get(language, "English")
    instruction = label
    return (
        _QA_SYSTEM_TEMPLATE.format(language_instruction=instruction),
        _EDIT_SYSTEM_TEMPLATE.format(language_instruction=instruction),
    )

_COPY_RESPONSE = {
    "en": "Here is your copy unchanged. Use the **My Version** button to save it as your own itinerary.",
    "es": "Aquí tienes tu copia sin cambios. Usa el botón **Mi versión** para guardarla como tu propio itinerario.",
}

# ---------------------------------------------------------------------------
# Intent detection (zero API calls)
# ---------------------------------------------------------------------------

_EDIT_MARKERS = {
    "cambia", "añade", "agrega", "elimina", "quita", "modifica", "actualiza", "reemplaza",
    "mueve", "extiende", "acorta", "borra", "pon", "cambiemos", "agreguemos",
    "incluye", "incluir", "quiero", "quisiera", "me gustaría", "haz que", "que incluya",
    "en lugar de", "sustituye", "reorganiza", "ajusta",
    "change", "add", "remove", "update", "modify", "replace", "edit", "delete",
    "swap", "move", "rearrange", "extend", "shorten", "let's add", "let's change",
    "include", "i want", "i'd like", "i would like", "make it", "make one",
    "instead of", "turn", "set", "should be", "can you add", "can you change",
    "spend", "visit", "go to",
    # Reduce / shorten phrasings — "I asked for 2 days", "make it 2 days",
    # "drop the last day", "only 2 days"
    "i asked for", "i said", "drop", "reduce", "fewer", "less days",
    "only", "just", "too many", "too long", "cut",
}
_COPY_MARKERS = {
    "copia", "duplicar", "mi versión", "mi version", "fork",
    "copy", "duplicate", "my version", "my copy",
}


def _detect_intent(last_user_msg: str, mode: str) -> str:
    lower = last_user_msg.lower()
    if any(m in lower for m in _COPY_MARKERS):
        return "copy"
    if mode == "edit" and any(m in lower for m in _EDIT_MARKERS):
        return "edit"
    return "qa"


# ---------------------------------------------------------------------------
# Content builders
# ---------------------------------------------------------------------------

def _build_contents(messages: list[dict], itinerary: dict | None) -> list[dict]:
    contents = []
    for i, msg in enumerate(messages):
        role = "user" if msg["role"] == "user" else "model"
        text = msg["content"]
        if i == 0 and itinerary:
            text = (
                f"Trip context:\n```json\n{json.dumps(itinerary, ensure_ascii=False, indent=2)}\n```\n\n"
                + text
            )
        contents.append({"role": role, "parts": [{"text": text}]})
    return contents


def _parse_edit_response(raw_text: str | None) -> dict:
    """Parse the model's edit JSON into a done-payload (pure, sync-testable).

    Returns { response, patch, warning } — warning is None when absent/empty.
    Falls back to an empty patch + error explanation on malformed JSON.
    """
    try:
        text = (raw_text or "").strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(text)
    except (json.JSONDecodeError, ValueError) as e:
        return {"patch": {}, "response": f"Error processing suggestion: {e}", "warning": None}

    warning = (result.get("warning") or "").strip()
    return {
        "response": result.get("explanation", "Change proposed."),
        "patch": result.get("patch"),
        "warning": warning or None,
    }


def _extract_sources(response) -> list[dict]:
    sources = []
    try:
        meta = response.candidates[0].grounding_metadata
        for chunk in (meta.grounding_chunks or []):
            web = getattr(chunk, "web", None)
            if web and web.uri:
                sources.append({"title": web.title or web.uri, "url": web.uri})
    except (AttributeError, IndexError):
        pass
    return sources


def _empty_response_reason(chunk) -> str:
    if chunk is None:
        return "No response (possible network error or quota exhausted)."
    try:
        candidate = chunk.candidates[0]
        reason = getattr(candidate, "finish_reason", None)
        reason_name = reason.name if hasattr(reason, "name") else str(reason)
        if reason_name == "SAFETY":
            return "Response blocked by safety filter."
        if reason_name == "MAX_TOKENS":
            return "Response reached token limit."
        if reason_name not in (None, "STOP", "FINISH_REASON_UNSPECIFIED"):
            return f"Unexpected finish reason: {reason_name}."
    except (AttributeError, IndexError):
        pass
    return "Empty response from model."


# ---------------------------------------------------------------------------
# Public runner
# ---------------------------------------------------------------------------

async def run_conversation(
    messages: list[dict],
    itinerary: dict | None,
    mode: str,
    user_email: str,
    language: str = "en",
) -> AsyncIterator[dict]:
    """
    Yields SSE event dicts:
      { "event": "token",   "data": { "text": "..." } }   — QA streaming
      { "event": "done",    "data": { "response", "patch", "sources" } }
      { "event": "error",   "data": { "message": "..." } }
    """
    last_user = next(
        (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
    )
    intent = _detect_intent(last_user, mode)

    qa_system, edit_system = _build_systems(language)

    try:
        # ------------------------------------------------------------------
        # COPY — instant, no API call
        # ------------------------------------------------------------------
        if intent == "copy":
            yield {"event": "done", "data": {
                "response": _COPY_RESPONSE.get(language, _COPY_RESPONSE["en"]),
                "patch": {},
                "sources": [],
            }}
            return

        contents = _build_contents(messages, itinerary)

        # ------------------------------------------------------------------
        # QA — stream tokens
        # ------------------------------------------------------------------
        if intent == "qa":
            # Google Search grounding silently returns 0 chunks when the request
            # contains a large itinerary context — only enable it without context.
            tools = [] if itinerary else [types.Tool(google_search=types.GoogleSearch())]
            config = types.GenerateContentConfig(
                system_instruction=qa_system,
                tools=tools,
            )

            full_text = ""
            sources = []
            last_chunk = None

            async for chunk in await gemini_client.aio.models.generate_content_stream(
                model=MODEL, contents=contents, config=config,
            ):
                last_chunk = chunk
                if chunk.text:
                    full_text += chunk.text
                    yield {"event": "token", "data": {"text": chunk.text}}
                chunk_sources = _extract_sources(chunk)
                if chunk_sources:
                    sources = chunk_sources

            if not full_text:
                yield {"event": "error", "data": {"message": _empty_response_reason(last_chunk)}}
                return

            yield {"event": "done", "data": {
                "response": full_text,
                "patch": None,
                "sources": sources,
            }}

        # ------------------------------------------------------------------
        # EDIT — single JSON call
        # ------------------------------------------------------------------
        else:
            response = await gemini_client.aio.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=edit_system,
                    response_mime_type="application/json",
                ),
            )

            done = _parse_edit_response(response.text)
            yield {"event": "done", "data": {
                "response": done["response"],
                "patch": done["patch"],
                "warning": done["warning"],
                "sources": [],
            }}

    except Exception as e:
        logger.error(f"Chat failed: {e}", exc_info=True)
        yield {"event": "error", "data": {"message": f"Unexpected error: {type(e).__name__}: {e}"}}
