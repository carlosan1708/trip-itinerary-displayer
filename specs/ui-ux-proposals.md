# Spec: UI/UX Proposals — Future Directions

## Status
Pending review — this is a forward-looking proposal document. Each section is independently scoped and can be promoted to its own implementation spec.

## Context

The app has matured well past a single-itinerary viewer:

- Multi-trip dashboard with folders, favorites, copy/duplicate ([Dashboard.jsx](../src/components/Dashboard.jsx))
- Inline JSON editing locked to `itinerary.author` ([App.jsx:280](../src/App.jsx#L280))
- Per-day collaborative files (now with tags) and notes ([DayFiles.jsx](../src/components/DayFiles.jsx), [DayNotes.jsx](../src/components/DayNotes.jsx))
- Cross-day file overview ([AllFilesPanel.jsx](../src/components/AllFilesPanel.jsx))
- AI itinerary agent + version history + i18n + PDF export

The features are there. What's missing is the connective tissue that emerges once people actually live inside the app for a 3-week trip with multiple collaborators. This spec collects those gaps as concrete proposals so they can be picked off when relevant.

Each proposal lists **what's missing**, the **proposal**, **scope boundaries**, and **risks**. None of these are prerequisites for the others — pick the ones that match the next problem you hit.

---

## Tier 1 — Quick wins (high leverage, modest effort)

### 1.1 Day navigation: jump-to-day, expand-all, deep links

**What's missing**

A 19-day itinerary renders 19 collapsed accordions ([DayCard.jsx:91](../src/components/DayCard.jsx#L91)). To find day 12 you scroll, click, scroll, click. There is no:

- "Expand all / collapse all" toggle
- Day index/jump bar
- URL fragment deep-link (`#day-5`)
- Sticky "Day N of M" indicator while scrolling

**Proposal**

- Add a sticky horizontal **day strip** below the header: pills `1 2 3 … 19` colored by part. Clicking scrolls to and expands that day. Active day highlights as the user scrolls (IntersectionObserver).
- Add an **Expand all / Collapse all** toggle to [Header.jsx](../src/components/Header.jsx) actions list (icon: `UnfoldMore` / `UnfoldLess`).
- On mount, if `location.hash` matches `#day-N`, scroll-to and expand that day. Update the hash as the user manually expands one (without polluting history).

**Scope**

- Touches `App.jsx`, `Header.jsx`, `DayCard.jsx`. New small component `DayJumpBar.jsx`.
- No data-model or Firestore changes.
- E2E: jump bar click expands target day; URL fragment expands on load.

**Risks**

- Sticky element competes with the existing header. Keep it slim (32–40 px) and design for collision with edit-mode banner.

---

### 1.2 In-trip search

**What's missing**

The dashboard searches trip *names* ([Dashboard.jsx:336](../src/components/Dashboard.jsx#L336)) but inside an itinerary there is no way to find "the day with the helicopter tip" or "the activity mentioning Banff." Also no search across files (filenames or tags).

**Proposal**

A search affordance in [Header.jsx](../src/components/Header.jsx) (magnifier icon, opens a `Dialog` or top inline `TextField`):

- Live-filters across `day.location`, `day.subtitle`, `activities`, `tips`, `warnings`, `links.label`, file names, file tags, notes text.
- Result list: "Day 12 — Banff · activity · *Helicopter tour over the Bow Valley*". Clicking jumps to the day (uses 1.1's deep-link).
- Highlight matches in-context once expanded.

**Scope**

- New `TripSearch.jsx` component. Pure client-side over already-loaded `itinerary` plus the hoisted files/notes (see 2.1).
- E2E: type a known activity word → result appears → click → day expands.

**Risks**

- Notes/files require listeners running upfront. Defer until 2.1 (hoisted listeners) lands, otherwise you trigger N day-listeners just to search.

---

### 1.3 Sync status indicator

**What's missing**

Every Firestore write swallows errors as `console.warn` ([App.jsx:174](../src/App.jsx#L174), [Dashboard.jsx:117](../src/components/Dashboard.jsx#L117), and many more). When offline or rate-limited, the user sees a successful UI with stale cloud state. Author-edit toggle, agent edits, and registry mutations are all silent on failure.

**Proposal**

- Lightweight `SyncStatus` chip in the header: `Saved · 2s ago` / `Saving…` / `Offline — changes saved locally` / `Sync failed (retry)`.
- Wire all Firestore writes through a tiny helper that bumps a `lastSync` state and surfaces failures to a toast/snackbar.
- Use `navigator.onLine` + `online` / `offline` events for the offline state.

**Scope**

- New `src/utils/sync.js` wrapping `setDoc` / `addDoc` / `updateDoc` with status callback.
- New `SyncStatus.jsx` rendered in the header chip row.
- E2E: stub a Firestore write to throw → assert error chip appears.

**Risks**

- Don't let the indicator nag — debounce "saved" flashes and only surface persistent failures.

---

### 1.4 Replace `window.confirm` with themed dialogs

**What's missing**

`window.confirm(t('confirmDeleteTrip'))` ([Dashboard.jsx:195](../src/components/Dashboard.jsx#L195), [Dashboard.jsx:215](../src/components/Dashboard.jsx#L215)) breaks the visual system, ignores i18n direction, can't be styled, and is jarring on mobile.

**Proposal**

A reusable `<ConfirmDialog>` (MUI `Dialog`) consumed via a tiny `useConfirm()` hook. Returns a Promise<boolean>. Drop-in replacement.

**Scope**

- New `src/components/ConfirmDialog.jsx` and `src/utils/useConfirm.js`.
- Replace `window.confirm` call sites (4 in Dashboard, audit for more).
- E2E: opening the dialog and confirming/cancelling works.

**Risks**

- None significant.

---

## Tier 2 — Foundations (structural, prepare for scale)

### 2.1 Hoist file & note subscriptions to app level

**What's missing**

[DayCard.jsx:38–51](../src/components/DayCard.jsx#L38-L51) opens an `onSnapshot` query **per day component**. For a 19-day itinerary that's 19 simultaneous Firestore listeners just for files, plus 19 for notes ([DayNotes.jsx:48](../src/components/DayNotes.jsx#L48-L60)), plus another in `AllFilesPanel`. Each listener also re-queries the entire `files` collection for the trip and filters client-side.

This is fine today. It will not be fine at 5 trips × 30 days × 2 collections × 100 files. It also makes 1.2 (in-trip search) needlessly expensive.

**Proposal**

- Move the files+notes `onSnapshot` to `App.jsx` (one listener per collection, scoped by `where('tripId', '==', selectedTripId)`).
- Pass down a `filesByDay` / `notesByDay` map (memoized).
- `DayCard`, `DayFiles`, `DayNotes`, `AllFilesPanel` become pure consumers — drop their effects.

**Scope**

- Refactor only — no behavior change visible to the user.
- Existing E2E tests should pass unchanged (good signal of regression).

**Risks**

- Component prop drilling through `PartSection` → `DayCard`. Acceptable given the depth; a context provider is overkill.

---

### 2.2 AllFilesPanel: filter, search, author column

**What's missing**

[AllFilesPanel.jsx](../src/components/AllFilesPanel.jsx) renders a flat list grouped by day. Today it shows tags but you cannot:

- Filter by tag across all days (the per-day filter from `DayFiles` doesn't carry over)
- Search by filename
- See the uploader
- See an upload timestamp
- Preview a file (must download)

**Proposal**

- Add the same tag-chip filter row from `DayFiles` at the top of the panel.
- Add a small search box above the list.
- Each row: filename, size, **uploader name**, **relative date**, tags, action buttons.
- Click on a row opens a lightweight preview drawer for images/PDFs (using `<iframe>` or `<img>`); other types show metadata only with a download CTA.

**Scope**

- Modifies `AllFilesPanel.jsx`. No data-model change (`authorEmail`, `authorName`, `uploadedAt` already on file docs).
- E2E: filter chip narrows list; search narrows list; click on image row opens preview.

**Risks**

- Preview drawer can grow into a "file viewer" sub-feature. Keep v1 minimal: image + PDF embed only.

---

### 2.3 Co-authors / editor list per trip

**What's missing**

[App.jsx:280](../src/App.jsx#L280) gates edit on `user.email === itinerary.author`. This is brittle:

- One person plans, the partner can never fix a typo.
- If the author's email changes (corporate, marriage), the trip is permanently locked.
- Admin can manage the user list but not edit non-owned trips.

**Proposal**

Extend the itinerary doc with `editors: string[]` (emails). Author always implicitly included. UI:

- New "Sharing" section in the trip's edit dropdown — shows the editor list, lets author add/remove emails.
- Admin override: admin can always edit (and a small `"admin override"` badge appears next to the edit button).
- Firestore rule: write allowed if `request.auth.token.email in (author + editors)` or admin claim.

**Scope**

- `itinerary.editors` field (defaults to `[]`).
- New `EditorsDialog.jsx`.
- `firestore.rules` update + redeploy.
- E2E: editor in list can edit; non-listed cannot.

**Risks**

- Concurrent editing races. Out of scope for v1 — last-write-wins is acceptable while the version field bumps. Add a "newer version exists, reload" warning if `setDoc` sees a higher version on read-back.

---

## Tier 3 — New capabilities (predictable next-asks)

### 3.1 Public read-only share link

**What's missing**

The whole app is gated by Google sign-in + whitelist. Sharing an itinerary with a non-Google grandparent or hotel concierge is impossible without adding their email.

**Proposal**

Author can generate a **read-only share token** for a trip:

- Stored at `trips/{tripId}/share/{token}` with `{ createdAt, createdBy, expiresAt? }`.
- Public route `/v/{tripId}?t={token}` renders a stripped-down read-only view (no edit, no files, no notes — or files-yes/notes-no, configurable).
- Firestore rules: a separate read rule allows `get` on the itinerary doc when `resource.data.shareToken == request.query.token` (or via a callable function that issues a short-lived custom token).
- "Share" button in header opens a dialog: copy link, revoke, regenerate.

**Scope**

- New route handling in `App.jsx` (URL parse before auth gate).
- New `ShareDialog.jsx`.
- `firestore.rules` update.
- E2E: generated link loads itinerary in incognito-equivalent (no auth context).

**Risks**

- Token leakage. Mitigations: optional expiry, easy revoke, no PII in shared view (hide emails, notes).

---

### 3.2 Map view

**What's missing**

`day.location` is a free-text field used in titles and badges, but never plotted. Travelers want a visual route.

**Proposal**

A `Map` toggle in the header (next to PDF). Opens a full-screen view:

- Pins per day, colored by part.
- Polyline connecting consecutive days.
- Click a pin → scrolls back to that day card.
- Geocoding cached on the itinerary doc (`day.coords?: [lat, lng]`); fall back to free Nominatim or Mapbox geocode when missing, persist on first lookup.

**Scope**

- Adds one dependency (Leaflet ~40KB or a thin Mapbox-GL setup). Note that CLAUDE.md is wary of new deps — discuss before adding.
- New `MapView.jsx`.
- Geocoding utility that batches misses and updates `itinerary.parts[].days[].coords`.
- E2E: map toggle renders; mocked geocode returns fixed pins.

**Risks**

- Bundle size + an external tile provider. If both are dealbreakers, stub with a "static OpenStreetMap image per day" approach instead.

---

### 3.3 Per-day checklists + lightweight expenses

**What's missing**

Files and notes cover documents and conversation. Two adjacent travel needs aren't met:

- Packing/todo checklists ("rent car", "confirm hotel", "buy travel insurance") that span days.
- Expense tracking (per-day spend, currency, who paid).

**Proposal**

Two new sub-collections in the existing day card:

- `trips/{gatewayTripId}/checklist/{itemId}` — `{ tripId, dayNumber?, text, done, ownerEmail, dueAt? }`. Day-level shown in `DayCard`; trip-wide shown in a new "Checklist" drawer (header action).
- `trips/{gatewayTripId}/expenses/{expenseId}` — `{ tripId, dayNumber, amount, currency, label, paidBy, splitWith[]? }`. Aggregated totals shown in the trip header chip row and in `AllFilesPanel`-style overview.

Both use the same listener-hoisting pattern from 2.1.

**Scope**

- Two new components: `DayChecklist.jsx` (lives next to `DayFiles`/`DayNotes`), `ExpensesPanel.jsx` (header drawer like `AllFilesPanel`).
- Storage: small per-trip — no Storage bucket usage.
- `firestore.rules` update for new collections.
- E2E: add checklist item, mark done; add expense, see total.

**Risks**

- Scope creep. Resist split-tracking, multi-currency conversion, exports. v1 = list and total.

---

### 3.4 Presence + last-edited per day

**What's missing**

When two people open the same trip, neither knows the other is there. Edits silently overwrite. There's no "last edited 4 min ago by Maria" hint per day.

**Proposal**

Two pieces, decoupled:

- **Last-edit metadata**: when `handleDayChange` writes, also write `editedAt: serverTimestamp()` and `editedBy: user.email` onto the day. Render a tiny chip in the day summary.
- **Presence**: write `trips/{tripId}/presence/{uid}` with `{ email, lastSeen }` every 30s while the trip is open; subscribe to that collection; show overlapping avatars in the header.

**Scope**

- Schema: add `editedAt` / `editedBy` per day.
- Presence collection with a TTL cleanup (or filter out `lastSeen > 2 min ago` client-side).
- `firestore.rules` for presence (auth-only write to own doc, anyone in allow-list reads).

**Risks**

- Presence writes every 30s × N concurrent users = quota cost. Cap to one write per minute and use idle-tab detection (`document.visibilityState`).

---

## Cross-cutting suggestions (no separate tier)

These are small enough to fold into other work, not dedicated specs:

- **Accessibility audit pass**. Many `IconButton`s lack `aria-label`. Faded text uses `rgba(255,255,255,0.35)` ([Dashboard.jsx:372](../src/components/Dashboard.jsx#L372)) which is below WCAG AA on the gradient background. Sweep + fix when touching the relevant components.
- **Empty states**. The dashboard with zero folders shows just an "Add destination" button. A friendlier illustration + one-line guidance (and maybe an auto-prompt for the AI agent) would convert better.
- **Dark mode**. Theme is ready; the rest of the app hard-codes `#fff` / `#fafbfd` backgrounds. Defer until at least one user asks, but flag as a known gap.
- **PWA install + offline cache**. Already local-first; adding a manifest + service worker would let the app open on the plane without re-downloading. Single afternoon's work; high perceived value.

---

## How to use this spec

1. Pick a proposal that maps to a real next ask.
2. Promote it to its own spec file under `specs/<proposal-slug>.md`, copying the structure of [file-tags.md](file-tags.md): Status, Context, Data Model, UI, Permissions, Scope Boundaries, Files to Change.
3. Update [as-built.md](as-built.md) when shipped.
4. Strike the proposal from this file (or move to a "Shipped" section) so it stays a forward-looking document.
