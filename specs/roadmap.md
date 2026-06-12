# Roadmap

Single-page status of what's built, what's mid-flight, and what's still on the table.
Authoritative architecture detail lives in [as-built.md](as-built.md); each pending item links to its own spec.

Legend: ✅ shipped · 🚧 in progress / partial · 📋 spec written, not built · 💭 proposal, no dedicated spec

---

## ✅ Shipped

### Core platform
- Auth & access control (Google sign-in, admin custom claim, per-trip allow-list) — [as-built.md § Authentication](as-built.md)
- Multi-trip dashboard with folders, favorites, search, hide-trip — [Dashboard.jsx](../src/components/Dashboard.jsx)
- Itinerary data model (parts → days → logistics / activities / tips / warnings / links / images) — [as-built.md § Itinerary Data Model](as-built.md)
- Inline edit mode (gated on `itinerary.author === user.email`) — [as-built.md § Inline Edit Mode](as-built.md)
- Version history (snapshot per save, restore) — [as-built.md § Version History](as-built.md)
- Raw-JSON editor (admin-only) — [TripEditorModal.jsx](../src/components/TripEditorModal.jsx)
- AI itinerary agent (chat, diff, progress, duplicate) — [as-built.md § AI Itinerary Agent](as-built.md)
- Admin panel (whitelist + per-user / app-default language) — [AdminPanel.jsx](../src/components/AdminPanel.jsx)
- Internationalisation (en/es, `useT()`, per-user override) — [src/i18n/](../src/i18n/)
- PDF export — [src/utils/generatePdf.jsx](../src/utils/generatePdf.jsx)

### Day-level collaboration
- Files per day with **tags** (suggestions, free-form, per-day filter) — [DayFiles.jsx](../src/components/DayFiles.jsx)
  > Spec [file-tags.md](file-tags.md) still says "Pending implementation" — drift; either flip status or delete the file.
- Notes per day (own-only edit/delete, admin override) — [DayNotes.jsx](../src/components/DayNotes.jsx)
- Cross-day file overview — [AllFilesPanel.jsx](../src/components/AllFilesPanel.jsx)

### Onboarding (recently shipped)
- First-run empty dashboard with three CTAs — [EmptyDashboard.jsx](../src/components/EmptyDashboard.jsx)
- Tabbed Add Trip dialog (Templates / Upload / Paste / Build with AI) — [AddTripDialog.jsx](../src/components/AddTripDialog.jsx)
- Bundled trip-skeleton templates — [src/data/templates/](../src/data/templates/)
- Build-with-AI wiring (folder routing through agent) — [as-built.md § Add Trip Dialog](as-built.md)

### Trip sharing
- Per-trip viewer list (restrict a trip to a subset of allowed users) — [TripShareDialog.jsx](../src/components/TripShareDialog.jsx)
  > No dedicated spec exists. Worth backfilling a one-pager into `specs/`.

### Traveler profile (just shipped)
- Per-user `users/{email}` doc, opened from Header & Dashboard — [as-built.md § Traveler Profile](as-built.md), spec: [traveler-profile.md](traveler-profile.md)

---

## 🚧 In progress / partial

- **Onboarding — agent writes JSON itself** ([onboarding.md](onboarding.md), out-of-scope notes). Today the agent still emits a chat-driven patch flow; the prompt-script work to have it output a complete JSON without confirmation is a backend follow-up.
- **Spec drift cleanup**. Two shipped features (file-tags, per-trip viewers) have stale or absent specs. Quick win to bring docs back in line.

---

## 📋 Pending — proposal specs

Each is independently scoped and ready to pick up.

| Spec | Effort | Headline |
|------|--------|----------|
| [traveler-profile.md](traveler-profile.md) | — | ✅ shipped |
| [activity-progress.md](activity-progress.md) | S–M | Per-user checkbox per activity, group view, header chip `12/47 done` |
| [packing-checklist.md](packing-checklist.md) | M | Per-trip checklist drawer with category tabs + starter templates |
| [expenses.md](expenses.md) | M | Quick-add expense modal, day totals, settle-up, FX conversion utility |
| [booking-and-contacts.md](booking-and-contacts.md) | M–L | Extend `logistics[]` with `status` / `confirmation` / `phone` / `address`; new Bookings + Contacts drawers |
| [today-view.md](today-view.md) | L | `startDate`/`endDate`/`time` schema, pre-departure banner, Today view, reminders badge, dual-clock TZ chip |

**Suggested ordering** if picking up sequentially: `activity-progress` → `packing-checklist` → `expenses` → `booking-and-contacts` → `today-view`. Earlier ones are smaller and self-contained; `today-view` ties together schema additions and benefits from the others being in place.

---

## 📋 Pending — UI/UX proposals

From [ui-ux-proposals.md](ui-ux-proposals.md). None have dedicated specs yet — promote when picked up.

### Tier 1 — quick wins
- §1.1 Day jump-bar / expand-all / `#day-N` deep links
- §1.2 In-trip search (across activities, tips, files, notes)
- §1.3 Sync-status indicator + write wrapper
- §1.4 Replace `window.confirm` with themed `<ConfirmDialog>`

### Tier 2 — foundations
- §2.1 Hoist file/notes `onSnapshot` from per-day to app level (perf foundation)
- §2.2 AllFilesPanel filter / search / preview / author column
- §2.3 Co-authors / editors per trip (`itinerary.editors[]` + rule update)

### Tier 3 — new capabilities
- §3.1 Public read-only share link (token route, Firestore rule)
- §3.2 Map view per trip (depends on `day.coords` + geocoding utility)
- §3.4 Presence + last-edited per day

### Cross-cutting
- Accessibility audit (`aria-label` sweep, contrast)
- Dark mode (theme is ready; backgrounds hard-coded)
- PWA install + offline cache + Notifications API (unblocks reminders v2)

---

## 💭 Considered, deferred / out of scope

These were proposed and explicitly *not* picked up; documented to avoid re-litigating:

- **Booking integrations** (Booking.com, Skyscanner) — high commercial overhead.
- **Real-time flight tracking** — paid API.
- **Restaurant reservations** (OpenTable etc.) — integration weight not worth it.
- **Splitwise-grade settle-up** — stop at per-pair net in [expenses.md](expenses.md).
- **Group voting / polls on alternatives** — notes already work.
- **AI "what should we do today" / free-time finder** — covered by existing agent if needed.
- **Weather chip per day** — was a separate spec, dropped because it depends on the unspecced Map feature. Revive when Map ships.

---

## How to use this file

- When a spec ships, move its bullet from 📋 to ✅ and link to the relevant `as-built.md` section (and remove the spec file or flip its Status to "Shipped").
- When you pick up a UI/UX proposal, promote it from this file to its own `specs/<slug>.md` (copy [file-tags.md](file-tags.md) structure).
- Keep the "Suggested ordering" honest — re-evaluate after each ship; cross-spec dependencies shift quickly.
