# Spec: Itinerary Agent

## Overview

An in-app conversational AI agent that helps users create, explore, and modify trip itineraries. The agent adapts its behavior based on context (no trip open vs. viewing a trip) and the user's relationship to the itinerary (author vs. viewer).

**Stack summary:**
- **Frontend:** React (existing app) — thin client, renders chat UI and streams tokens
- **Backend:** Python service — owns all AI logic, LangGraph graphs, Gemini calls, web search
- **AI model:** Gemini `gemini-2.0-flash-lite` via `google-genai` Python SDK (cheapest Gemini model)
- **Orchestration:** LangGraph (`langgraph` Python package) — state machines for creation fan-out and conversation flows
- **Search:** Google Search grounding built into Gemini API (no extra key)

---

## User-Facing Behavior

### Mode 1 — Creation (no trip selected)

Triggered from the Dashboard when no itinerary is open.

The agent asks guided questions (destination, dates, number of travelers, interests, budget level, preferred pace) and generates a complete itinerary JSON. Output is saved locally and synced to Firestore via the existing pipeline.

Generation uses a **parallel fan-out graph**: an orchestrator node produces the trip skeleton, then N part-agent nodes run concurrently — each web-searching its own cities — and a merge node assembles the final JSON.

On completion the agent registers the trip in the registry with `author` set to the current user's email.

### Mode 2 — Exploration (inside a trip, user is not the author)

Triggered from the trip view when `user.email !== itinerary.author`.

The agent can:
- Answer questions about the itinerary (logistics, activities, costs) — with live web search for current data (hours, prices, reviews)
- Suggest modifications in plain language
- When the user approves changes, **propose a duplicate** with the modifications and a new label (`"Ruta Oeste — My Version"`), then offer to save it as their own trip

The original itinerary is never modified. The duplicate is owned by the current user.

### Mode 3 — Edit (inside a trip, user is the author)

Triggered when `user.email === itinerary.author`.

The agent can do everything in Mode 2 plus apply changes directly to the current itinerary. Before writing it shows a structured diff and asks for confirmation. On confirmation it increments `version` and saves via `source: "agent_edit"`.

---

## Entry Points

| Location | Component | Trigger |
|----------|-----------|---------|
| Dashboard (no trip open) | `Dashboard.jsx` | Floating action button "Plan a trip with AI" |
| Trip view (any user) | `App.jsx` | Floating chat button (bottom-right) |

`<ItineraryAgent />` receives `itinerary` (nullable), `user`, and `canEdit` as props and derives the mode internally.

---

## Architecture

```
┌─────────────────────────────────┐     SSE / REST     ┌──────────────────────────────────────┐
│         React Frontend          │ ◄────────────────► │        Python Backend                │
│                                 │                    │                                      │
│  ItineraryAgent.jsx             │                    │  main.py  (FastAPI app)               │
│  ItineraryAgentChat.jsx         │                    │  graphs/                             │
│  ItineraryAgentDiff.jsx         │                    │    creation_graph.py                 │
│  utils/agentClient.js           │                    │    conversation_graph.py             │
│    └─ fetch/EventSource calls   │                    │  nodes/                              │
│                                 │                    │    orchestrator.py                   │
└─────────────────────────────────┘                    │    part_agent.py                     │
                                                       │    merge.py                          │
                                                       │    patch_proposer.py                 │
                                                       │  tools/                              │
                                                       │    wikimedia.py                      │
                                                       │  auth.py  (Firebase token verify)    │
                                                       └──────────────────────────────────────┘
                                                                        │
                                                              Gemini API (google-genai)
                                                              Google Search grounding
```

---

## Backend — Python Service

### Framework

**FastAPI** — async, streaming-friendly, easy SSE support.

```
backend/
  main.py                 # FastAPI app, route definitions
  graphs/
    creation_graph.py     # LangGraph StateGraph for itinerary creation
    conversation_graph.py # LangGraph StateGraph for Q&A / patch proposal
  nodes/
    orchestrator.py       # Plans trip skeleton (part titles, day ranges, colors)
    part_agent.py         # Generates one part's days with web search
    merge.py              # Assembles skeleton + part results into final JSON
    patch_proposer.py     # Proposes <patch> block from a user change request
  tools/
    wikimedia.py          # fetchWikimediaImage — MediaWiki API calls
  auth.py                 # Verify Firebase ID token on every request
  config.py               # Env vars, model name, Gemini client singleton
  requirements.txt
```

### Key Dependencies

```
fastapi
uvicorn[standard]
langgraph
google-genai
firebase-admin          # For token verification
python-dotenv
```

### Auth

Every backend request must include `Authorization: Bearer <firebase_id_token>`. `auth.py` calls `firebase_admin.auth.verify_id_token(token)` and extracts `email`. If verification fails → 401. The verified email is threaded through graph state so nodes can enforce author checks server-side.

### Deployment

**Firebase Functions 2nd gen** — fully serverless (scale-to-zero), same Firebase deploy pipeline, zero infra.

```python
# main.py
from firebase_functions import https_fn, options

@https_fn.on_request(
    region="us-central1",
    memory=options.MemoryOption.MB_512,
    timeout_sec=300,       # enough for the full creation fan-out
)
def agent(req):
    return fastapi_handler(req)
```

**Cold-start UX:** Python cold starts are typically 2–4 s. The frontend shows a `"Connecting…"` skeleton state in the chat panel until the first SSE token arrives — so the user sees activity rather than a frozen button.

Deploy: `firebase deploy --only functions`. Local dev: `uvicorn backend.main:app --reload`.

---

## LangGraph Graphs

All graphs use `langgraph.graph.StateGraph` with typed state dicts (plain Python `TypedDict`).

### Creation Graph (`creation_graph.py`)

```
START → orchestrator → [fan-out] → part_agent × N → [fan-in] → merge → END
```

State:

```python
class CreationState(TypedDict):
    user_params: dict          # destination, dates, travelers, interests, etc.
    skeleton: dict             # output of orchestrator node
    part_results: list[dict]   # one entry per part-agent, filled in parallel
    itinerary: dict            # final merged JSON (output of merge node)
    progress: list[str]        # status messages streamed to the client
```

Fan-out/fan-in uses LangGraph's `Send` API — the orchestrator node emits one `Send("part_agent", part_state)` per part, letting LangGraph execute them concurrently. The merge node waits for all and assembles the itinerary.

### Conversation Graph (`conversation_graph.py`)

```
START → classify → [branch]
          ├─ "qa"      → answer_with_search → END
          └─ "edit"    → patch_proposer → END
```

`classify` is a lightweight model call that labels the user message as `"qa"` or `"edit"`. This routes to either a grounded Q&A response or a `<patch>` block response.

State:

```python
class ConversationState(TypedDict):
    messages: list[dict]       # full chat history (OpenAI-style role/content)
    itinerary: dict            # current trip JSON (read-only for non-authors)
    mode: str                  # "explore" | "edit"
    user_email: str
    intent: str                # "qa" | "edit" (set by classify node)
    response: str              # agent text output
    patch: dict | None         # parsed patch block (if intent == "edit")
    grounding_sources: list    # from groundingMetadata, passed to frontend
```

---

## Gemini Integration

**SDK:** `google-genai` (Python)  
**Model:** `gemini-2.0-flash-lite` for all nodes

```python
# config.py
from google import genai
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
MODEL = "gemini-2.0-flash-lite"
```

**Google Search grounding** (enabled on all non-orchestrator calls):

```python
from google.genai import types

response = client.models.generate_content(
    model=MODEL,
    contents=messages,
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        system_instruction=system_prompt,
    ),
)
```

**Streaming** (for Q&A and patch proposal nodes):

```python
for chunk in client.models.generate_content_stream(model=MODEL, contents=messages, config=...):
    yield chunk.text
```

The FastAPI route wraps this in an SSE response:

```python
from fastapi.responses import StreamingResponse

@app.post("/agent/chat")
async def chat(req: ChatRequest, user=Depends(verify_token)):
    return StreamingResponse(stream_graph(req, user), media_type="text/event-stream")
```

---

## Wikimedia Tool

`tools/wikimedia.py` is a Python async function exposed to the Gemini model as a **function declaration**:

```python
async def fetch_wikimedia_image(query: str) -> dict:
    # 1. GET action=query&list=search&srnamespace=6&srsearch={query}
    # 2. GET action=query&titles=File:{filename}&prop=imageinfo&iiprop=url&iiurlwidth=800
    # Returns { url: thumburl, caption: filename_cleaned }
```

Declared in Gemini's `tools` array so part-agent nodes can call it as a tool during generation. The Python backend executes the actual HTTP calls — the model never constructs image URLs itself.

---

## Frontend — React Client

`src/utils/agentClient.js` is a thin wrapper with two methods:

```js
// Streaming chat (SSE)
export function streamChat(payload, onToken, onDone, onError) {
  const es = new EventSource(`${BACKEND_URL}/agent/chat?...`);
  // ... handle message / error / close events
}

// Non-streaming (trip creation progress polling or WebSocket alternative)
export async function createItinerary(params, onProgress) {
  // POST /agent/create, then GET /agent/create/{jobId}/stream for SSE progress
}
```

All requests include `Authorization: Bearer ${await user.getIdToken()}`.

The backend URL is configured via `VITE_BACKEND_URL` (e.g., `https://<region>-<project>.cloudfunctions.net` in production, `http://localhost:8000` in dev).

---

## Frontend Components

```
src/components/
  ItineraryAgent.jsx       # Owns chat state, calls agentClient, handles patch/diff flow
  ItineraryAgentChat.jsx   # Scrollable message list + input bar + Sources chips
  ItineraryAgentDiff.jsx   # Structured diff preview before applying changes
  ItineraryAgentProgress.jsx  # Step-by-step progress during creation fan-out
```

Sources chips display `groundingMetadata` returned by the backend alongside each response.

---

## Itinerary JSON Schema

This is the canonical shape every agent must produce. Any field not listed here must not appear in the final output.

```json
{
  "version": 1,
  "author": "set by app — never by agent",
  "label": "Ruta Oeste",
  "title": "Itinerario Canadá",
  "subtitle": "Sep 12 – Sep 30, 2026",
  "stats": ["19 días", "3 provincias", "5 ciudades", "SJO → YVR"],
  "parts": [
    {
      "id": 1,
      "emoji": "🌊",
      "title": "Vancouver y la Costa del Pacífico",
      "color": "#0277BD",
      "daysRange": "Días 1 – 4",
      "days": [
        {
          "dayNumber": 1,
          "date": "Sáb 12 Sep",
          "location": "Vancouver",
          "subtitle": "Llegada al Pacífico",
          "logistics": [
            { "type": "flight", "label": "Vuelo", "value": "SJO → YVR" },
            { "type": "stay",   "label": "Alojamiento", "value": "Downtown Vancouver — 4 noches" }
          ],
          "activities": ["Activity text…"],
          "tips": ["Tip text…"],
          "warnings": [],
          "links": [{ "label": "Name", "url": "https://…" }],
          "images": [{ "url": "https://upload.wikimedia.org/…/thumb/…", "caption": "Description" }]
        }
      ]
    }
  ]
}
```

**Field rules:**
- `version` and `author` are always injected by the app layer after the agent returns — agents must omit them or their values will be overwritten
- `logistics[].type` must be one of: `"flight"`, `"drive"`, `"stay"`, `"train"`
- `images[].url` must be a Wikimedia Commons pre-cached thumbnail URL obtained via the `fetch_wikimedia_image` tool — never a manually constructed path
- `warnings`, `links`, `tips` may be empty arrays but must be present
- All text should match the language of the conversation (Spanish by default for this app)

**Orchestrator skeleton** (internal intermediate format — never stored):

The orchestrator produces a reduced skeleton to guide part-agents. It adds a `locations` field per part for routing only:

```json
{
  "label": "Ruta Oeste",
  "title": "Itinerario Canadá",
  "subtitle": "Sep 12 – Sep 30, 2026",
  "stats": ["19 días", "3 provincias"],
  "parts": [
    {
      "id": 1,
      "emoji": "🌊",
      "title": "Vancouver y la Costa del Pacífico",
      "color": "#0277BD",
      "daysRange": "Días 1 – 4",
      "locations": ["Vancouver", "Victoria"]
    }
  ]
}
```

`merge.py` builds the final itinerary by combining skeleton parts with part-agent day results, **explicitly dropping `locations`**:

```python
def merge_itinerary(skeleton: dict, part_days: list[list[dict]], user_email: str) -> dict:
    parts = []
    for i, part in enumerate(skeleton["parts"]):
        parts.append({
            "id": part["id"],
            "emoji": part["emoji"],
            "title": part["title"],
            "color": part["color"],
            "daysRange": part["daysRange"],
            "days": part_days[i],   # from part-agent; "locations" is intentionally excluded
        })
    return {
        "version": 1,               # app will set this
        "author": user_email,       # app will set this; kept here for type completeness
        "label": skeleton["label"],
        "title": skeleton["title"],
        "subtitle": skeleton["subtitle"],
        "stats": skeleton["stats"],
        "parts": parts,
    }
```

---

## Patch Format (unchanged)

```json
<patch>
{
  "parts": [
    {
      "id": 1,
      "days": [{ "dayNumber": 3, "activities": ["Updated A", "Updated B"] }]
    }
  ]
}
</patch>
```

The backend parses this out of the model response and returns it as a structured field alongside the human-readable text. The frontend renders the diff card from the structured patch — never from the raw text block.

---

## Permissions & Safety

- The agent never writes to Firestore without explicit user confirmation.
- In Mode 2, the backend hard-blocks any patch from being applied to the source trip; it can only return patch data for a new duplicate.
- `canEdit` is re-checked on the client before saving AND the backend re-checks `user_email === itinerary.author` before returning an apply-able patch.
- `author` and `version` fields are set by the app layer only — the backend strips them from any agent-generated JSON before returning it.

---

## Duplicate Creation Flow (Mode 2)

1. Backend returns `{ response: "...", patch: {...}, sources: [...] }`.
2. Frontend renders diff card.
3. User clicks "Save as my version".
4. Frontend calls `duplicateTrip(itinerary, patch, user)` (existing client-side logic).
5. App navigates to the new trip.

---

## Direct Edit Flow (Mode 3)

1. Same diff review.
2. User clicks "Apply changes".
3. Frontend calls `applyAgentPatch(itinerary, patch, user)`.
4. Saves via `handleSave(itinerary, { source: "agent_edit" })`.

---

## Environment Variables

**Frontend (`.env`):**
```
VITE_BACKEND_URL=http://localhost:8000
```

**Backend (`backend/.env`):**
```
GEMINI_API_KEY=AIza...
GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json
```

No AI key in the browser — all model calls go through the Python backend. The Firebase ID token is the only credential the frontend holds.

---

## E2E Tests (Playwright)

All new tests go in `e2e/agent.spec.js`.

Required coverage:
- **Creation mode**: "Plan a trip with AI" opens the agent; submitting params triggers progress steps; "Save trip" creates a new registry entry
- **Exploration mode**: agent opens on a trip the user doesn't own; Q&A returns answer with Sources chips; patch proposal shows diff card; "Save as my version" creates a duplicate
- **Edit mode**: agent opens on own trip; patch diff shown; "Apply changes" updates itinerary; version increments
- **Permission guard**: non-author has no "Apply changes" button

Tests mock the backend at the network layer (`page.route('/agent/**', ...)`) to inject deterministic responses without hitting the real Python service or Gemini API.

---

## Local Dev Setup

```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Out of Scope (v1)

- Voice input
- Multi-trip comparison
- Collaborative editing
- Sharing a proposed patch with the original author
- Persisting chat history across sessions

---

## Open Questions

1. Should the agent be able to re-order days or only modify content within existing days?
2. Should the duplicate suffix ("— My Version") be localizable?
3. Rate limiting: cap concurrent requests per session to avoid Gemini quota exhaustion?
4. Should Mode 3 support full section/day addition and deletion, or only in-place content edits for v1?
5. How many parallel part-agents before hitting `gemini-2.0-flash-lite` rate limits? (Likely need a concurrency cap of 3–5.)
6. ~~Firebase Functions vs. Cloud Run~~ — **decided: Firebase Functions 2nd gen**, fully serverless (scale-to-zero), cold-start handled via "Connecting…" UI state.
