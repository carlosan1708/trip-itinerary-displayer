# Trip Itinerary Displayer — Claude Guidelines

## Project Overview
React + Vite SPA for a shared travel itinerary (Canada 2026). Firebase Auth (Google), Firestore real-time sync, Firebase Storage for files, role-based access. Python FastAPI backend (`backend/`) handles admin custom claims and proxies the Anthropic Claude API for the in-app itinerary agent. Hosted on Firebase Hosting.

## Where to Look First
Before exploring the code, read these — they save context:
- **[specs/as-built.md](specs/as-built.md)** — authoritative architecture reference: auth, dashboard, data model, day cards, edit mode, version history, files, notes, AI agent, admin panel, i18n, PDF, Firestore collections. Keep this in sync when behavior changes.
- **[specs/](specs/)** — pending feature specs (e.g. `file-tags.md`). Treat as the source of truth for unfinished work.
- **[.claude/skills/](.claude/skills/)** — project-specific slash commands.

## Tech Stack
- **React 18** (JSX, no TypeScript) + **Vite 5**
- **Material-UI v5** (`@mui/material`) + Emotion — all UI
- **Firebase 12** — Auth, Firestore, Storage, Hosting
- **Python FastAPI** backend (`backend/`) — admin claims + Claude API proxy
- **Playwright** for E2E
- **npm** package manager

## Commands
```bash
npm run dev              # Dev server on :5173
npm run dev:test         # Test-mode dev server on :5174 (mocks Firebase)
npm run build            # Production build → dist/
npm run test:e2e         # Playwright E2E
npm run sync             # Bidirectional Firestore ↔ local sync (uses .env)
firebase deploy          # Hosting + rules (requires firebase-tools)
```

## Architecture (high level — see `specs/as-built.md` for details)
```
src/
  components/     # One file per component; no barrel index files
  utils/          # registry.js, agentClient.js, itineraryPatch.js, parseText.jsx, generatePdf.jsx
  i18n/           # en.js / es.js + I18nProvider + useT()
  __mocks__/      # firebase-firestore.js, firebase-storage.js — used in test mode
  data/           # Bundled itinerary seed JSON
  firebase.js     # Firebase init + db, auth, storage, provider exports
  theme.js        # MUI theme
  App.jsx         # Root: auth state, registry/trip routing, sync logic
backend/          # FastAPI: auth.py (admin claims), chat.py (Claude proxy), create.py
e2e/              # Playwright specs + helpers.js (mock control via window.__mockAuth/__mockFirestore)
specs/            # As-built + pending feature specs
scripts/sync-data.mjs  # CLI sync used by npm run sync:*
```

## Code Conventions
- **JavaScript JSX only** — do not introduce TypeScript
- **MUI components** for all UI — no Tailwind, no inline styles, no other CSS frameworks
- **sx prop** for one-off styles; `theme.js` for palette/typography changes
- Component files use `.jsx` extension
- No barrel exports — import components by their file path
- Firebase env vars accessed via `import.meta.env.VITE_*`
- All user-facing strings go through `useT()` — never hardcode English or Spanish in components

## Firebase / Security Rules
- **Firestore rules** in `firestore.rules` — admin + per-trip whitelisted users (via `trips/{GATEWAY_TRIP_ID}/allowed_users/{email}`)
- **Storage rules** in `storage.rules` — `trips/{tripId}/files/**` requires auth
- Admin email comes from `VITE_ADMIN_EMAIL` env var — never hardcode it
- After editing `firestore.rules`: `firebase deploy --only firestore:rules` (or `/deploy-rules`)
- After editing `storage.rules`: `firebase deploy --only storage`

## Environment Variables
Project uses **`.env`** (not `.env.local`) for credentials. `.env.example` documents all required vars:
- `VITE_FIREBASE_*` — Firebase project credentials
- `VITE_ADMIN_EMAIL` — email that gets admin privileges
- `VITE_TRIP_ID` — Firestore key for the gateway/main trip
- `GOOGLE_APPLICATION_CREDENTIALS` — service account path (used by `scripts/sync-data.mjs` and backend)

## Skills
Built-in:
- `/simplify` — review changes for quality, reuse, efficiency
- `/update-config` — configure hooks, permissions, settings.json

Project-specific (`.claude/skills/`):
- `/deploy` — build + deploy hosting (user-invoked only)
- `/deploy-rules` — deploy Firestore rules only (user-invoked only)
- `/add-user` — guide through whitelisting a user via the Admin Panel
- `/plan-trip` — guided trip planning + JSON generation
- `/sync` — full bidirectional Firestore ↔ local sync (registry pulled first, then newest-version-wins on data)
- `/sync-download`, `/sync-upload` — one-way variants
- `/roadmap-update` — triage a feature request onto `specs/roadmap.md` (decides shipped vs duplicate vs new bullet vs new spec, then edits)
- `/ship-feature` — sync docs after a spec is implemented (update `as-built.md`, flip Status to Shipped, move from Pending to Shipped in `roadmap.md`)

## Testing
- **Unit (Vitest)** in `src/**/*.test.{js,jsx}` — `npm run test`. Pure logic in `src/utils/` + `src/i18n/`, jsdom env, Firebase aliased to `src/__mocks__/` (config: `vitest.config.js`, `vitest.setup.js`). Add a unit test for any new pure helper.
- **Backend (pytest)** in `backend/tests/` — `cd backend && python -m pytest -q`. Gemini/Firebase/slowapi patched in `tests/conftest.py`.
- Playwright E2E in `e2e/` — `npm run test:e2e`
- **When adding/modifying a feature in `src/`, you MUST add or update E2E tests in `e2e/` as part of the same task. A feature is not done until it has tests.**
- Tests passing = task done. If a change breaks a test (including `e2e/` or config files), fix it — do not delete tests.
- Test mode swaps Firebase for mocks in `src/__mocks__/`; control auth/Firestore via `window.__mockAuth` and `window.__mockFirestore` (see `e2e/helpers.js`). The Storage mock is a stateless stub — uploads/downloads succeed but no real bytes flow.

## Do / Don't
- **Do** keep components small and single-purpose
- **Do** use MUI `Box`, `Stack`, `Typography` instead of raw `div`/`p`
- **Do** update `specs/as-built.md` when you change observable behavior
- **Don't** commit `.env` files
- **Don't** add new npm dependencies without a clear need — bundle is already sizeable
- **Don't** bypass Firestore or Storage security rules for convenience
- **Don't** hardcode the admin email or any UI string
