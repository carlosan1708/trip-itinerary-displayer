# As-Built Spec: Trip Itinerary Displayer

Documents what has been built as of April 2026.

---

## Overview

A React + Vite SPA for displaying and collaborating on a shared travel itinerary (Canada 2026).
Features Firebase Auth (Google Sign-in), Firestore for real-time data, role-based access control,
an inline itinerary editor, an AI agent for itinerary generation, and a multi-trip dashboard.

---

## Authentication & Access Control

**How it works**

- Google Sign-in via Firebase Auth (`LoginScreen.jsx`).
- On sign-in, the app calls `POST /auth/set-admin-claim` (Python backend at `backend/main.py`) to
  sync the admin custom claim onto the Firebase ID token.
- `VITE_ADMIN_EMAIL` env var determines which email receives the admin claim.
- Access gate: every user must have a document at
  `trips/{GATEWAY_TRIP_ID}/allowed_users/{email}` to view any trip.
  Admin is auto-added on first sign-in; other users must be whitelisted explicitly.
- Three auth states drive the root render: loading → `LoginScreen` → `AccessDenied` → app.

**Relevant files**

- `src/App.jsx:63–105` — auth listener, admin claim fetch, allowed-user check, language resolution
- `src/components/LoginScreen.jsx`
- `src/components/AccessDenied.jsx`
- `backend/main.py` — FastAPI backend that sets admin claims

---

## Demo Mode (anonymous "try it" sandbox)

**How it works**

- `LoginScreen.jsx` offers a **"Try the demo"** button. Clicking it renders a
  **Cloudflare Turnstile** widget (`TurnstileWidget.jsx`). On a valid token the
  client calls `POST /demo/start` (backend verifies the token with Cloudflare's
  siteverify), then `signInAnonymouslyDemo()` (Firebase Anonymous Auth).
- Anonymous users have `email === null`. `App.jsx` gives them a **synthetic
  identity** `demo:{uid}` (set as `user.email`) so all author/viewer/notes logic
  keyed on email works unchanged, plus `isDemo: true`. They skip the admin-claim
  fetch and the `allowed_users` whitelist entirely.
- **Isolated namespace**: demo users operate against `VITE_DEMO_TRIP_ID`
  (`demo-gateway`) instead of the real `VITE_TRIP_ID`. The real Canada data is
  never readable or writable by anonymous users. Seed the sample trip with
  `npm run seed:demo` (`scripts/seed-demo.mjs`).
- **Limits** (per anonymous uid):
  - **2 trips** (`VITE_DEMO_MAX_TRIPS`) — enforced client-side in `Dashboard.jsx`
    / `App.jsx` (create, copy, agent-duplicate paths) and bounded by Firestore
    rules (an anon user may only write trips whose id is `demo-{uid}-*`).
  - **100 AI interactions** (`DEMO_MAX_AI_CALLS`) — enforced server-side in
    `backend/demo.py` (`require_user_or_demo_quota`), counting against
    `demo_quota/{uid}` in Firestore. Over the cap → HTTP 429
    `{ code: "demo_limit_reached" }`, which `agentClient.js` turns into the
    `demoAiLimit` "contact me" message.
- **Bot defense**: Turnstile gates the door (each demo entry costs one solved
  challenge); the AI cap bounds cost per identity; `demo_quota` is Admin-SDK-only
  so a visitor can't reset their own count.
- The Dashboard shows a **demo banner** stating the limits and a single
  "My Trips" folder that includes the seeded sample trip plus the user's own.

**Relevant files**

- `src/components/LoginScreen.jsx`, `src/components/TurnstileWidget.jsx`
- `src/App.jsx` — `isDemo` detection, synthetic identity, gateway selection
- `src/components/Dashboard.jsx` — demo banner, trip cap, demo folder
- `src/utils/agentClient.js` — `DEMO_LIMIT_ERROR` handling
- `backend/demo.py`, `backend/main.py` — `/demo/start`, quota dependency
- `firestore.rules` — `isDemoUser()`, `ownsDemoTrip()`, demo namespace access
- `scripts/seed-demo.mjs` — seeds the sample trip + demo registry

---

## Multi-Trip Dashboard

**How it works**

- `Dashboard.jsx` is shown when no trip is selected.
- Trip registry is stored in `trips/{GATEWAY_TRIP_ID}/registry/main` (Firestore) and mirrored to
  `localStorage` via `src/utils/registry.js`.
- Registry structure: a **flat list** of trips — `{ trips: [{ id, label, subtitle, dates, duration,
  author, viewers[] }] }`. (Legacy `{ folders: [...] }` docs are flattened on read for compat.)
- **Folders are computed by role at render time**, not stored:
  - every user sees a **My Trips** folder listing trips they authored;
  - admins additionally see an **All Trips** folder listing every other author's trips.
- A trip is visible to a non-admin only if `viewers` includes their email (or `viewers` is absent —
  legacy "open" trips). Admins see everything (`isAdmin` short-circuits `canSeeTrip`).
- Users can favorite trips (persisted to `localStorage`) and open any visible trip.
- Trip actions are role-gated: Edit/Upload require authorship; **Delete is allowed for the author
  or any admin**; Share (manage viewers) is author-or-admin. Deleting also removes the cloud
  `trips/{id}/data/itinerary` doc.
- **First-run experience**: when the synced registry is empty, `EmptyDashboard.jsx` replaces the
  trip list with a panel offering a free-text "describe your trip" input (seeds the AI wizard) plus
  two secondary CTAs (Build with AI / Paste my own JSON).

**Relevant files**

- `src/components/Dashboard.jsx`
- `src/components/EmptyDashboard.jsx`
- `src/utils/registry.js`

---

## Add Trip Dialog

**How it works**

- `AddTripDialog.jsx` is a tabbed modal opened from the My Trips folder's "+" action or from
  `EmptyDashboard`. Defaults to the Build with AI tab.
- Three tabs:
  - **Build with AI** — renders the `TripPlannerWizard` inline; on completion `onCreate(name,
    itinerary)` adds the trip.
  - **Upload** — file picker for previously-exported JSON.
  - **Paste** — JSON textarea with live validation.
- The dialog accepts an `initialTab` prop so EmptyDashboard CTAs deep-link to the right tab.
- On confirm, `onCreate(name, jsonData)` creates a trip with id `trip-<slug>-<ts>`, `author` =
  current user, and `viewers: [author]` (private by default), then writes the registry + the
  `trips/{id}/data/itinerary` doc.

**Build-with-AI wiring**

- `App.jsx` exposes `onBuildWithAi(_folderId, seedText)` which sets `agentInitialPrompt` and clicks
  the agent FAB; the drawer pre-fills its chat input with the seed text.
- `handleAgentDuplicate` appends the new trip to the flat registry with `viewers: [author]`.
- The conversational prompt-script that auto-emits final JSON without a confirmation step remains a
  follow-up (see [onboarding.md](onboarding.md) — out-of-scope notes).

**Relevant files**

- `src/components/AddTripDialog.jsx`
- `src/components/TripPlannerWizard.jsx`

---

## Itinerary Data Model

Itinerary JSON is stored in `trips/{tripId}/data/itinerary` in Firestore and cached in
`localStorage` under `trip-data-{tripId}`.

```json
{
  "version": 3,
  "author": "email@example.com",
  "title": "Itinerario Canadá",
  "label": "Ruta Oeste",
  "subtitle": "Sep 12 – Sep 30, 2026",
  "stats": ["19 días", "3 provincias", "5 ciudades", "SJO → YVR"],
  "parts": [
    {
      "id": 1,
      "emoji": "🌊",
      "title": "Part title",
      "color": "#0277BD",
      "daysRange": "Días 1 – 4",
      "days": [
        {
          "dayNumber": 1,
          "date": "Sáb 12 Sep",
          "location": "Vancouver",
          "subtitle": "Llegada al Pacífico",
          "logistics": [{ "type": "flight|stay|drive|train", "label": "...", "value": "..." }],
          "activities": ["..."],
          "tips": ["..."],
          "warnings": ["..."],
          "links": [{ "label": "...", "url": "..." }],
          "images": [{ "url": "...", "caption": "..." }],
          "optional_alternative": "...",
          "optional_high_intensity": ["..."]
        }
      ]
    }
  ]
}
```

**Sync logic** (`App.jsx:114–144`): on trip load, local version vs. Firestore version are compared;
the higher version wins. Local-wins causes an automatic push to Firestore.

---

## Itinerary View — Day Cards

**What renders inside `<AccordionDetails>` for each day** (`DayCard.jsx:119–427`):

| Section | Content |
|---------|---------|
| Images | Horizontal scroll strip; single image goes full-width |
| Logistics | Icon + label:value rows (drive / flight / stay / train) |
| Activities | Bulleted list with part color dots |
| Optional alternative | Purple callout box with lightbulb icon |
| High-intensity options | Orange flame-icon list |
| Warnings | MUI `<Alert severity="warning">` per item |
| Tips | Styled info boxes with left border |
| Links | Outlined `<Chip>` components that open in new tab |
| Files | `DayFiles` component (see below) |
| Notes | `DayNotes` component (see below) |

Summary row (always visible) shows day number badge, date, location, subtitle.

---

## Inline Edit Mode

**Who can edit**: only the itinerary `author` field matches `user.email`.

- Toggled via the edit button in `Header.jsx`; saving writes a new Firestore version and bumps
  `itinerary.version`.
- Every text field, array item, logistics row, link, and image URL becomes editable in-place.
- `DayCard.jsx` receives `editMode` prop and conditionally renders `<TextField>` / `<Select>`
  controls instead of display elements.
- Changes propagate via `onDayChange` → `handleDayChange` → `saveItinerary` in `App.jsx`.

---

## Version History

- Every save (edit, local push, restore, agent edit) appends to `trips/{tripId}/versions/`.
- `VersionHistoryModal.jsx` lists snapshots; restoring one increments `version` and writes to
  `trips/{tripId}/data/itinerary`.

---

## JSON Editor

`TripEditorModal.jsx` — a full-screen dialog with a Monaco-like `<textarea>` for raw JSON editing.
Admin-only feature accessible from the Header toolbar.

---

## Collaborative Files (per day)

**Component**: `src/components/DayFiles.jsx`
**Firestore path**: `trips/{gatewayTripId}/files/{fileId}`

Each file document:

```js
{
  tripId, dayNumber,
  name, type, size,
  dataUrl,          // base64 file content
  authorEmail, authorName,
  uploadedAt        // serverTimestamp
}
```

- **Upload**: hidden `<input type="file">` → FileReader → base64 → `addDoc`.
- **Max size**: 700 KB enforced client-side.
- **Real-time**: `onSnapshot` query on `tripId`, client-filtered by `dayNumber`.
- **Download**: programmatic anchor click using the stored `dataUrl`.
- **Delete**: author or admin only.

---

## Collaborative Notes (per day)

**Component**: `src/components/DayNotes.jsx`
**Firestore path**: `trips/{gatewayTripId}/notes/{noteId}`

Each note document:

```js
{
  tripId, dayNumber,
  text,
  authorEmail, authorName,
  createdAt,        // serverTimestamp
  updatedAt         // serverTimestamp (set on edit)
}
```

- **Real-time**: `onSnapshot`, filtered client-side by `dayNumber`.
- **Add**: Enter key or send button.
- **Edit**: own notes only; inline TextField replaces the text row.
- **Delete**: own notes or admin.
- Avatar with deterministic color derived from `authorEmail`.
- Relative timestamps (now / N min / N h / N d).

---

## AI Itinerary Agent

**Component**: `src/components/ItineraryAgent.jsx` + sub-components
  (`ItineraryAgentChat.jsx`, `ItineraryAgentDiff.jsx`, `ItineraryAgentProgress.jsx`)

- Slide-in panel from the right side of the itinerary view.
- Uses the Anthropic Claude API (via the Python backend) to propose itinerary edits.
- Diffs proposed changes against current itinerary before the user accepts.
- Can also duplicate a trip into a new variant via `onDuplicateCreated`.
- Accepts a `language` prop to match the current UI language.

---

## Admin Panel

**Component**: `src/components/AdminPanel.jsx`

- Accessible from the Header for admins only.
- **User whitelist management**: add users by email → writes
  `trips/{GATEWAY_TRIP_ID}/allowed_users/{email}`; remove users (not self).
- **Per-user language**: set `en` or `es` on a user's allowed-user doc.
- **App-level default language**: writes to `doc(db, 'app-settings', 'config')`.

---

## Traveler Profile

**Component**: `src/components/UserProfileDialog.jsx`
**Firestore path**: `users/{email}`

A per-user document that persists info reused across every trip — passport / insurance details, allergies, an emergency contact, and home currency / timezone preferences.

```js
{
  passportNumber, passportExpiry, insurancePolicy,
  bloodType, allergies: string[],
  emergencyContact: { name, phone, relation },
  homeCurrency, homeTimezone
}
```

- Opened from a **Profile** action: in `Header.jsx` (when a trip is open) and as a button beside Sign Out in `Dashboard.jsx`.
- Reads `users/{email}` on dialog open; missing doc → empty fields. Save uses `setDoc(..., { merge: true })`.
- Privacy: Firestore rule `match /users/{email} { allow read, write: if request.auth.token.email == email; }` — the doc is readable and writable only by its owner. Co-travelers cannot see anything in here.
- All labels routed through `useT()` (`profile*` keys in `src/i18n/`).

## Internationalisation

- `src/i18n/` — `en.js` and `es.js` string maps.
- `I18nProvider` + `useT()` hook used throughout components.
- Language priority: `localStorage` > user-assigned (Firestore) > app default (Firestore) > `en`.
- `Header.jsx` exposes a language toggle button.

---

## PDF Export

`src/utils/generatePdf.jsx` — lazy-loaded on demand.
Triggered from Header; renders the full itinerary to a printable PDF.

---

## Firestore Collections Summary

```
app-settings/config                          # default language
demo_quota/{uid}                             # per-demo-user AI call counter (Admin-SDK only)
users/{email}                                # per-user traveler profile (self-only access)
trips/{DEMO_TRIP_ID}/registry/main           # demo registry (anonymous sandbox namespace)
trips/{GATEWAY_TRIP_ID}/
  allowed_users/{email}                      # access whitelist + per-user lang
  registry/main                              # flat { trips: [...] } list
  files/{fileId}                             # all uploaded files (all trips)
  notes/{noteId}                             # all notes (all trips)
trips/{tripId}/
  data/itinerary                             # main itinerary JSON document
  versions/{versionId}                       # snapshot history
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_FIREBASE_*` | Firebase project credentials |
| `VITE_ADMIN_EMAIL` | Email that receives admin claim |
| `VITE_TRIP_ID` | Firestore key for the gateway/main trip |
| `VITE_DEMO_TRIP_ID` | Firestore key for the isolated demo gateway/registry |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (public) |
| `VITE_DEMO_MAX_TRIPS` / `VITE_DEMO_MAX_AI_CALLS` | Demo caps (client UX) |
| `TURNSTILE_SECRET_KEY` | Turnstile secret (backend siteverify) |
| `DEMO_TRIP_ID` / `DEMO_MAX_AI_CALLS` | Backend demo namespace + AI cap |

---

## Testing

- Playwright E2E tests in `e2e/`.
- Test mode swaps Firebase for mocks via `src/__mocks__/` — controlled through
  `window.__mockAuth` and `window.__mockFirestore` (see `e2e/helpers.js`).
