# Trip Itinerary Displayer — Claude Guidelines

## Project Overview
React + Vite SPA that displays a shared travel itinerary (Canada 2026) with Firebase Auth (Google Sign-in), Firestore for data sync, and role-based access control. Hosted on Firebase Hosting.

## Tech Stack
- **React 18** (JSX, no TypeScript)
- **Vite 5** — dev server and build
- **Material-UI v5** (`@mui/material`) + Emotion — all UI components and styling
- **Firebase 12** — Auth, Firestore, Hosting
- **npm** — package manager

## Commands
```bash
npm run dev       # Start dev server (localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
firebase deploy   # Deploy to Firebase Hosting (requires firebase-tools)
```

## Architecture
```
src/
  components/     # One file per component; no barrel index files
  utils/          # parseText.jsx — parses itinerary text format
  firebase.js     # Firebase app init + exports (db, auth, provider)
  theme.js        # MUI theme (green/red palette)
  App.jsx         # Root component — auth state, routing logic, data loading
  main.jsx        # ReactDOM.createRoot entry point
```

## Code Conventions
- **JavaScript JSX only** — do not introduce TypeScript
- **MUI components** for all UI — do not add Tailwind, inline styles, or other CSS frameworks
- **sx prop** for one-off styles; `theme.js` for palette/typography changes
- Component files use `.jsx` extension
- No default barrel exports — import components by their file path
- Firebase env vars are accessed via `import.meta.env.VITE_*`

## Firebase / Security Rules
- Firestore rules in `firestore.rules` restrict access to admin + per-trip whitelisted users
- Admin email comes from `VITE_ADMIN_EMAIL` env var — never hardcode it in source
- Do not expose Firebase config beyond what `.env.example` already documents
- After editing `firestore.rules`, deploy rules separately: `firebase deploy --only firestore:rules`

## Environment Variables
Copy `.env.example` → `.env.local` (git-ignored). Required vars:
- `VITE_FIREBASE_*` — Firebase project credentials
- `VITE_ADMIN_EMAIL` — email that gets admin privileges
- `VITE_TRIP_ID` — Firestore document key for the active trip

## Data Flow
1. Itinerary JSON is bundled locally in `src/`
2. On load, `App.jsx` syncs with Firestore (`/trips/{TRIP_ID}/data/`)
3. Admin can push updated itinerary data to Firestore via the Admin Panel
4. Access control list lives in `/trips/{TRIP_ID}/allowed_users/`

## Skills
Built-in:
- `/simplify` — review code changes for quality, reuse, and efficiency
- `/update-config` — configure hooks, permissions, and settings.json

Project-specific (`.claude/skills/`):
- `/deploy` — build + deploy to Firebase Hosting (user-invoked only)
- `/deploy-rules` — deploy Firestore rules only (user-invoked only)
- `/add-user` — guide through whitelisting a user via the Admin Panel
- `/plan-trip` — guided trip planning: asks questions, generates itinerary JSON with correct Wikimedia image URLs, saves and syncs

## Testing
- Playwright E2E tests live in `e2e/` — run with `npm run test:e2e`
- **When adding or modifying a feature in `src/`, you MUST add or update E2E tests in `e2e/` as part of the same task. A feature is not done until it has tests.**
- Tests passing = task done. If a change breaks a test (including changes to `e2e/` or config files), fix it before finishing — do not delete tests
- Test mode swaps Firebase for mocks in `src/__mocks__/` — auth and Firestore state controlled via `window.__mockAuth` / `window.__mockFirestore` (see `e2e/helpers.js`)

## Do / Don't
- **Do** keep components small and single-purpose
- **Do** use MUI `Box`, `Stack`, `Typography` instead of raw `div`/`p`
- **Don't** commit `.env` or `.env.local` files
- **Don't** add new npm dependencies without a clear need — the bundle is already sizeable
- **Don't** bypass Firestore security rules for convenience
