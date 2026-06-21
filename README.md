<div align="center">

# ✈️ Trip Itinerary Displayer

**An AI-powered travel itinerary platform — generate, edit and collaborate on trips with an LLM agent.**

A full-stack SPA where an LLM agent drafts and edits day-by-day itineraries via **structured output** and a **human-in-the-loop review** flow — on top of Google auth, real-time Firestore sync and per-trip access control.

*A portfolio build by [Carlos Rodríguez](https://github.com/carlosan1708) demonstrating production AI-feature engineering: structured LLM output, human-in-the-loop review, streaming, and abuse/cost controls.*

[**🌐 Live demo →  mi-itinerario.web.app**](https://mi-itinerario.web.app)

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![MUI](https://img.shields.io/badge/MUI-5-007FFF?logo=mui&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![Playwright](https://img.shields.io/badge/Tests-Playwright-2EAD33?logo=playwright&logoColor=white)

</div>

---

## 🧠 AI engineering highlights

The interesting engineering here is the AI system, not the CRUD. Highlights:

- **Two purpose-built LLM pipelines** — `create` (from-scratch itinerary generation) and `chat` (in-trip edit / Q&A), each with its own system prompt and output contract ([`backend/create.py`](backend/create.py), [`backend/chat.py`](backend/chat.py)).
- **Structured-output edit protocol** — the model never edits prose. It returns an **RFC 7396-style merge-patch** that's applied deterministically client-side ([`src/utils/itineraryPatch.js`](src/utils/itineraryPatch.js)): add / remove / modify days and parts, with `_delete` markers and automatic day renumbering.
- **Human-in-the-loop review** — every AI change is a *proposed* diff surfaced inline on the itinerary (sticky review bar + per-day accept / reject) before it touches stored data. No silent writes.
- **Zero-extra-call intent routing** — a heuristic classifier routes each turn to *edit / Q&A / copy* without a separate LLM classification call; edit mode defaults to editing unless the message is clearly a question, so natural phrasings ("make it 2 days", "start from Costa Rica") produce a patch instead of a wall of prose.
- **Output hardening & guardrails** — `normalizeItinerary` repairs malformed model output (missing ids/colors, empty placeholder days) so a bad generation can't break the UI; an implausibility guardrail makes the model **warn** (e.g. "adding Beijing to a Rio trip needs an international flight") instead of silently producing nonsense.
- **End-to-end streaming** — Server-Sent Events from FastAPI through a custom SSE client ([`src/utils/agentClient.js`](src/utils/agentClient.js)), with a direct Cloud Run URL in prod to bypass CDN response buffering.
- **Abuse & cost controls for a public demo** — a reCAPTCHA Enterprise gate plus a per-user AI-call quota guard *before* any anonymous LLM usage, so the public demo can't be turned into a free Gemini proxy.

**How an AI edit flows:**

```
user message
  → intent route (edit / QA / copy, no extra LLM call)
  → Gemini (structured JSON: { patch, explanation, warning? })
  → applyPatch + normalizeItinerary   (deterministic, hardened)
  → inline diff review (accept / reject per day)
  → versioned write to Firestore
```

The model is Gemini, called through the FastAPI proxy so keys stay server-side and the provider is swappable.

---

## 🤖 Using the AI

Two authenticated endpoints, both **streaming Server-Sent Events**. Every request needs a Firebase ID token (`Authorization: Bearer <token>`) and must come from the allowed origin.

### `POST /agent/create` — generate an itinerary from scratch

Request:

```json
{
  "destination": "Costa Rica",
  "dates": "Jun 1 - Jun 7",
  "num_days": 7,
  "travelers": 2,
  "interests": ["hiking", "wildlife"],
  "budget": "mid",                 // budget | mid | luxury
  "pace": "moderate",              // relaxed | moderate | packed
  "language": "en"                 // 2-letter code
}
```

Internally this is a **two-call pipeline** — call 1 drafts the skeleton (parts/structure, fast), call 2 fills every day in one shot — so the user sees structure quickly while content streams.

SSE events:

```
event: progress   data: { "text": "Structure planned" }
event: progress   data: { "text": "Days generated" }
event: done       data: { "itinerary": { ...full itinerary JSON... } }
event: error      data: { "message": "..." }
```

### `POST /agent/chat` — in-trip assistant (edit / Q&A)

Request:

```json
{
  "messages": [{ "role": "user", "content": "make it 2 days" }],
  "itinerary": { ...current itinerary... },   // omit when none is loaded
  "mode": "edit",                              // edit | explore (explore never writes)
  "language": "en"
}
```

The turn is routed to one of three handlers **without an extra LLM call**:

| Intent | When | Response |
|--------|------|----------|
| `edit` | `mode: "edit"` and the message isn't a clear question | `{ patch, explanation, warning? }` |
| `qa` | a question (or `explore` mode) | streamed text + optional sources |
| `copy` | "make a copy" / "my version" | instant, no model call |

An **edit** turn returns a merge-patch, never prose:

```jsonc
// done event → data:
{
  "response": "Removed day 3 to shorten the trip.",
  "patch": {
    "parts": [
      { "id": 1, "days": [
        { "dayNumber": 2, "activities": ["Updated activity"] },  // modify
        { "dayNumber": 5, "location": "Tofino", "subtitle": "Day trip" },  // add (new dayNumber)
        { "dayNumber": 3, "_delete": true }                       // remove
      ] }
    ]
  },
  "warning": "Adding Beijing to a Rio trip needs an international flight and extra days."
}
```

The patch is applied client-side by [`itineraryPatch.js`](src/utils/itineraryPatch.js) (`applyPatch` → `normalizeItinerary`), shown as an inline diff, and only written to Firestore once the user accepts. Match rules: parts by `id`, days by `dayNumber`; a new `dayNumber` is an add, `_delete: true` is a removal, days renumber automatically.

### Calling it directly

```bash
curl -N https://<agent-url>/agent/chat \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Origin: https://mi-itinerario.web.app" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"add a coffee tour to day 2"}],"itinerary":{...},"mode":"edit","language":"en"}'
```

Rate limits: `chat` 30/min, `create` 5/min (per IP). Demo (anonymous) users also pass a per-user AI-call quota before the model is touched.

---

## ✨ Features

|  | Feature | Description |
|--|---------|-------------|
| 🤖 | **AI trip planner** | Describe your trip in one sentence and the agent drafts a full day-by-day itinerary you can edit. |
| 💬 | **In-trip AI assistant** | Ask questions or request changes; the agent proposes a diff you approve before applying. |
| 👥 | **Role-based access** | Every user sees **My Trips**; admins also get **All Trips**. Per-trip viewer whitelists keep trips private. |
| 📅 | **Editable day cards** | Accordion per day with flights, drives, stays, activities, tips, warnings, links and images. |
| 📎 | **Files & notes per day** | Attach boarding passes / confirmations and leave shared notes on any day. |
| 🕓 | **Version history** | Every publish snapshots the itinerary; admins can restore any version. |
| 🧳 | **Traveler profile** | Private per-user profile (passport, insurance, emergency contact) stored only in your account. |
| 📄 | **PDF export** | One-click export of the full itinerary to a print-ready PDF. |
| 🌐 | **i18n (EN / ES)** | Every string is localized; language is per-user and remembered. |

---

## 📸 Showcase

### AI trip planner — from a few answers to a full itinerary
The wizard asks a handful of questions, then the agent drafts a day-by-day plan you can edit.

![AI trip planner](docs/media/ai-planner.gif)

### In-trip AI assistant
Open any trip, ask for a change, and the assistant replies with a proposed diff you can apply.

![AI assistant](docs/media/ai-assistant.gif)

### My Trips / All Trips (role-based dashboard)
Regular users see only their own trips; admins also get an **All Trips** folder and can open any of them.

![Dashboard](docs/media/dashboard.gif)

### Day details — logistics, files & shared notes
Each day expands into flights/drives/stays, activities, tips, attached files and group notes.

![Day details](docs/media/edit-versions.gif)

---

## 🛠 Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18 + Material-UI v5 |
| Build | Vite 5 |
| Auth | Firebase Auth (Google Sign-In) |
| Database | Firestore (real-time) |
| Files | Firebase Storage |
| Hosting | Firebase Hosting |
| AI backend | Python (FastAPI) + Gemini API, on Cloud Run |
| Sync script | Node.js + Firebase Admin SDK |
| Tests | Playwright (E2E) |

---

## 🚀 Quick start

```bash
npm install
cp .env.example .env        # fill in the values (see below)
npm run dev                 # → http://localhost:5173
```

> The AI agent needs the backend running. Without it, the rest of the app
> (login, dashboard, editing, files) works just the same. See [Backend](#-backend-ai-agent).

### Requirements

- Node.js 18+ · npm 9+
- Python 3.11+ (only for the AI backend)

### Environment variables

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_EMAIL=you@email.com
VITE_TRIP_ID=canada-trip          # ID of the "gateway" trip in Firestore
VITE_AGENT_URL=                   # AI backend URL in prod (empty in dev → proxied to :8000)

# Sync script (Node + Admin SDK)
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json
```

- Firebase credentials → **Firebase Console → Project settings → General → Your apps**.
- `service-account.json` → **Project settings → Service accounts → Generate new private key** (keep it **out of the repo**).

---

## 📋 Commands

```bash
npm run dev           # Dev server (:5173)
npm run dev:test      # Test mode with Firebase mocked (:5174)
npm run build         # Production build → dist/
npm run preview       # Preview the local build

npm run sync:status   # Local version vs Firestore
npm run sync:upload   # Push local if local version > cloud
npm run sync:download # Pull cloud if cloud version > local

npm run test          # Unit tests (Vitest)
npm run test:coverage # Unit tests with coverage report
npm run test:e2e      # E2E tests (Playwright)
```

Deploy: in Claude Code run `/deploy` (sync → build → `firebase deploy` + Cloud Run).

---

## 🧪 Tests

Three layers:

- **Unit (Vitest)** — pure logic in `src/utils/` and `src/i18n/` (`*.test.{js,jsx}`), run in jsdom with Firebase aliased to the in-repo mocks. Fast, no browser.
- **E2E (Playwright)** in `e2e/` — full user flows. In test mode, Firebase is replaced by mocks; auth and Firestore state is controlled via `window.__mockAuth` / `window.__mockFirestore` (see `e2e/helpers.js`).
- **Backend (pytest)** in `backend/tests/` — request validation, auth, demo quota, and the AI runners with Gemini patched out.

```bash
# Unit
npm run test                  # all unit tests
npm run test:watch            # watch mode
npm run test:coverage         # with coverage

# E2E
npx playwright install        # browsers (first time only)
npm run test:e2e              # all tests
npx playwright test e2e/folders.spec.js   # a single file
npx playwright show-report    # HTML report of the last run

# Backend
cd backend && python -m pytest -q
```

---

## 🏗 Architecture

```
src/
  components/        # one component per file (no barrel index)
    Dashboard.jsx           # Trip list; My Trips / All Trips folders by role
    DayCard.jsx             # Per-day card (editable accordion)
    DayFiles.jsx            # Per-day file attachments (Storage)
    DayNotes.jsx            # Per-day shared notes
    ItineraryAgent.jsx      # AI agent drawer (chat + diff)
    TripPlannerWizard.jsx   # Step-by-step AI creation wizard
    UserProfileDialog.jsx   # Traveler profile (private per user)
    AdminPanel.jsx          # Access management
    VersionHistoryModal.jsx # Version history (admin)
    ...
  utils/
    registry.js             # Flat trip list; folders computed by role
    agentClient.js          # SSE client for the AI backend
    itineraryPatch.js       # Apply / describe agent diffs
    generatePdf.jsx         # PDF export
  i18n/                # en.js / es.js + provider + useT()
  App.jsx              # Root: auth, registry/trip routing, sync
  firebase.js          # Firebase init

backend/             # FastAPI: chat.py, create.py, auth.py (Cloud Run)
scripts/sync-data.mjs   # Local ↔ Firestore sync (Admin SDK)
firestore.rules         # Security rules
```

---

## 🔐 Access control

- Only users in `trips/{GATEWAY_TRIP_ID}/allowed_users/{email}` can sign in.
- The admin (`VITE_ADMIN_EMAIL`) gets automatic access and manages users from the **Access** panel.
- Each trip has a `viewers[]` list: a regular user only sees trips they created or where they're
  listed in `viewers`. Admins see everything.
- Firestore rules block any unauthorized access at the server level.

---

## 🗂 Firestore structure

```
trips/{tripId}/
  data/itinerary            # Active itinerary (full JSON)
  registry/main             # Flat { trips: [...] } list (only on the gateway trip)
  versions/{auto-id}        # Snapshot per publish (version, savedAt, savedBy, source, data)
  allowed_users/{email}     # Users with access to the trip
  notes/{noteId}            # Per-day notes
  files/{fileId}            # File attachment metadata
users/{email}               # Traveler profile (private, self-only)
```

---

## 🔄 Versioning

Every JSON has `"version": N`. The rule is simple: **the higher number wins**.

| Situation | Result |
|-----------|--------|
| Local v5 > Cloud v4 | Push local + snapshot |
| Local v3 < Cloud v10 | Use Firestore, ignore local |
| Local v4 = Cloud v4 | No change |

Publish local: bump `"version"` and run `npm run sync:upload`. Pull cloud: `npm run sync:download`.
Admins can restore any version from the **Versions** button.

---

## 📐 Itinerary data

```json
{
  "version": 4,
  "title": "Itinerario Canadá",
  "subtitle": "Sep 12 – Sep 30, 2026",
  "stats": ["19 días", "3 provincias", "5 ciudades", "SJO → YYZ"],
  "parts": [
    {
      "id": 1, "emoji": "🏔️", "title": "Las Rocosas",
      "color": "#2E7D32", "daysRange": "Días 1 – 7",
      "days": [
        {
          "dayNumber": 1, "date": "Sáb 12 Sep", "location": "Calgary", "subtitle": "Llegada",
          "logistics": [{ "type": "flight", "label": "Vuelo", "value": "SJO → YYC" }],
          "activities": ["..."], "tips": ["..."], "warnings": ["..."],
          "links": [{ "label": "Name", "url": "https://..." }],
          "images": [{ "url": "https://...", "caption": "..." }]
        }
      ]
    }
  ]
}
```

> The JSON above keeps Spanish field values because itinerary content is user-authored in any
> language. Only the structural keys are fixed. Valid logistics types: `flight`, `drive`, `stay`, `train`.

---

## 🤖 Backend (AI agent)

A Python (FastAPI) service that generates and edits itineraries with Gemini. In production it runs on Cloud Run.

```
backend/
  main.py          # FastAPI entry point + CORS / origin guard
  chat.py          # /agent/chat   — in-trip assistant (proposes diffs)
  create.py        # /agent/create — from-scratch creation (SSE streaming)
  auth.py          # Firebase token verification + admin claim
  requirements.txt # Dependencies
  Dockerfile       # Cloud Run build
```

### Run it locally

```bash
cd backend
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                # fill in the variables
uvicorn main:app --reload                           # → http://localhost:8000
```

The frontend (Vite) proxies `/agent/**`, `/auth/**` and `/health` to `localhost:8000` in dev.

---

## 🔥 Firebase rules

After editing `firestore.rules` or `storage.rules`, deploy them separately:

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
```
