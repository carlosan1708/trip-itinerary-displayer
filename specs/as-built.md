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

## Multi-Trip Dashboard

**How it works**

- `Dashboard.jsx` is shown when no trip is selected.
- Trip registry is stored in `trips/{GATEWAY_TRIP_ID}/registry/main` (Firestore) and mirrored to
  `localStorage` via `src/utils/registry.js`.
- Registry structure: `{ folders: [{ id, label, trips: [{ id, label, duration, dates }] }] }`.
- Users can browse folders, favorite trips (persisted to `localStorage`), and open any trip.
- Admins can create folders, add trips (JSON upload or editor), rename, delete, and reorder.

**Relevant files**

- `src/components/Dashboard.jsx`
- `src/utils/registry.js`

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
trips/{GATEWAY_TRIP_ID}/
  allowed_users/{email}                      # access whitelist + per-user lang
  registry/main                              # folder/trip list
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

---

## Testing

- Playwright E2E tests in `e2e/`.
- Test mode swaps Firebase for mocks via `src/__mocks__/` — controlled through
  `window.__mockAuth` and `window.__mockFirestore` (see `e2e/helpers.js`).
