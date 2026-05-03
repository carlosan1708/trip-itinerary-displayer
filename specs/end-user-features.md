# Spec: End-User Feature Proposals

## Status
Pending review — forward-looking proposals organized by trip lifecycle. Each feature is independently scoped.

## Context

Today the app is excellent at **displaying** an itinerary and **collaborating** around it (files, notes, agent edits). It is less invested in the *traveler's actual day-to-day use*: deciding what to pack, knowing what's next, logging expenses on the move — or, on the other end, helping a brand-new user get from "empty dashboard" to "real first itinerary" without round-tripping through ChatGPT.

This spec proposes features for the person *using* a finished itinerary — not for the person editing one. Scope is intentionally functional (what the user can do) rather than visual (covered in [ui-ux-proposals.md](ui-ux-proposals.md)).

Items below are grouped by **itinerary lifecycle phase**:

1. **Plan & Prep** — weeks/days before departure
2. **Live the Trip** — during the trip itself
3. **Start a New Trip** — getting from zero to a first itinerary (pre-Phase-1 chronologically; listed here because it's a different audience: brand-new users)
4. **Smart context** — cross-cutting helpers

Where a proposal overlaps with [ui-ux-proposals.md](ui-ux-proposals.md), I cross-reference instead of restating.

---

## Phase 1 — Plan & Prep

### 1.1 Reservation / booking status tracker

**User story**

> "I'm 3 weeks out. Did I actually book the Banff hotel? Did I pay the deposit? When do I need to reconfirm?"

**What's missing**

`logistics` rows ([as-built.md](as-built.md) — `flight | drive | stay | train`) only carry `label` + `value`. There is no status, no confirmation number, no booking deadline. Travelers fall back to email inboxes.

**Proposal**

Extend each logistics item with optional fields:

```js
{
  type: "stay",
  label: "Fairmont Banff Springs",
  value: "Sep 18 – Sep 20",
  status: "booked",          // "planned" | "booked" | "paid" | "confirmed" | "cancelled"
  confirmation: "ABC-12345",
  bookedAt: "2026-04-01",
  reminderAt: "2026-09-15",  // surface a reminder N days before
  cost: { amount: 480, currency: "CAD" }
}
```

UI:

- Status chip on each logistics row in [DayCard.jsx](../src/components/DayCard.jsx) (color-coded).
- A trip-level **"Bookings"** drawer (header action) listing every logistics row across days, grouped by status. "Not yet booked" surfaces at the top.
- Optional client-side reminders on next app open if `reminderAt < today`.

**Scope**

- Schema: extend `day.logistics[]` items (additive — old items have no `status`, treated as "planned").
- New `BookingsPanel.jsx` (drawer, like `AllFilesPanel`).
- Edit-mode UI: inline status dropdown + small "details" expander on each logistics row.
- E2E: set status, see chip; open Bookings drawer, see grouped list.

**Risks**

- Reminders are easy to over-engineer. v1 = passive (chip turns red after `reminderAt`). No push notifications until 2.4.

---

### 1.2 Packing & pre-departure checklist

**User story**

> "Did I pack the adapter? Did the passport renewal come back? Have I done the visa form?"

**What's missing**

There is no checklist anywhere. Files cover documents (after the fact); notes are conversational. Neither tracks "is this done."

**Proposal**

A trip-level `checklist` with items optionally tied to a category:

```js
trips/{gatewayTripId}/checklist/{itemId}: {
  tripId,
  text,
  done: false,
  category: "pack" | "documents" | "bookings" | "other",
  ownerEmail?,            // who's responsible (optional — multi-user trips)
  dueOffsetDays?,         // -7 = "1 week before departure"
  createdAt, doneAt?
}
```

UI:

- New "Checklist" drawer (header action, beside Files/Map). Tabs by category.
- "Templates" button: applies a starter template (international travel, hiking, family-with-kids) — strings come from i18n.
- Shows progress bar: `12 / 18 done`.

**Scope**

- New collection + Firestore rules (auth + on allowlist).
- New components: `ChecklistPanel.jsx`, `ChecklistTemplate.jsx`.
- E2E: add item, mark done, apply template.

**Cross-refs**

- See also [ui-ux-proposals.md §3.3](ui-ux-proposals.md) (proposed checklist + expenses together). This proposal can subsume the checklist half of that one.

---

### 1.3 Pre-departure essentials countdown

**User story**

> "We leave in 12 days. What still needs to happen?"

**Proposal**

A small **"Pre-departure"** panel that surfaces only when `today` is within N days of trip start (extracted from `subtitle` or first day's `date`). Shows:

- Countdown: "12 days until departure"
- Open checklist items with `category: "documents" | "bookings"`
- Logistics rows where `status != "confirmed"` and the day is in the first ~3 days of the trip
- Passport expiry alert if user has set their expiry (see 1.4)

Self-dismisses once the trip starts (replaced by 2.1's Today view).

**Scope**

- New `PreDepartureBanner.jsx` mounted in [App.jsx](../src/App.jsx) when a trip is open.
- Pure aggregation over already-available data (1.1 + 1.2).
- E2E: stub trip start date 5 days out → banner shows, dismisses on entry.

**Risks**

- Date parsing from `subtitle` is fragile. Either (a) introduce explicit `startDate` / `endDate` on the itinerary doc, or (b) parse first-day date and ignore if parse fails. Prefer (a).

---

### 1.4 Traveler profile

**User story**

> "Same details apply to every trip I plan: passport number, allergies, insurance policy, emergency contact."

**What's missing**

Every trip would re-collect the same info today. Nothing personal exists at the user level.

**Proposal**

A per-user document at `users/{email}` (gated by self-write):

```js
{
  passportNumber?,
  passportExpiry?,
  insurancePolicy?,
  bloodType?,
  allergies?: string[],
  emergencyContact?: { name, phone, relation },
  homeCurrency?: "USD",
  homeTimezone?: "America/Costa_Rica",
}
```

UI: small "Profile" item in the header dropdown. Used by:

- 1.3 (passport expiry warning)
- 2.5 (emergency contacts panel)
- 4.1 / 4.2 (currency / timezone defaults)

**Scope**

- New `UserProfileDialog.jsx`.
- New Firestore collection + rules (write only own doc; readable only by self).
- E2E: open profile, set field, reopen → field persists.

**Risks**

- Personal data sensitivity. Document explicitly that this stays in the user's own Firestore doc and is never shared with co-travelers (unless we later add explicit "share emergency info").

---

## Phase 2 — Live the Trip

### 2.1 "Today" view — the killer during-trip feature

**User story**

> "It's 9am in Vancouver. Just open the app and tell me what we're doing today and what's next."

**What's missing**

Opening a trip lands you at Day 1, collapsed. On Day 8, you scroll past 7 days, expand the right one, and read the whole accordion to find what's at 2pm.

**Proposal**

When the current date is within `[startDate, endDate]` of the active trip:

- Header gains a prominent **"Today"** button (also auto-focused on app open).
- "Today" lands on a focused view: today's day card expanded, all others collapsed, scroll-positioned at the top of today.
- A **"What's next"** ribbon appears above the day card if the day has time-anchored entries: `Next: 14:00 — Helicopter tour (in 2h 15m)`. Requires optional `time` on activities (additive — see 2.2).
- A small "Tomorrow" preview chip below the day shows the next morning's first item.

**Scope**

- Requires explicit `startDate` / `endDate` on the itinerary doc (also unlocks 1.3, 4.3).
- Optional `time?: "HH:mm"` field on activities and logistics. Backwards-compatible.
- New `TodayBanner.jsx`.
- E2E: stub today as Day 5 of the trip → "Today" lands on Day 5 expanded.

**Risks**

- Without time anchors, "what's next" degrades to just showing today's activity list. That's still useful.

---

### 2.2 Activity completion / progress

**User story**

> "We did the gondola but skipped the museum. Let me check those off so the rest of the family knows."

**What's missing**

Activities are static text. No state for "done", "skipped", "in progress."

**Proposal**

Per-user, per-activity completion at `trips/{gatewayTripId}/progress/{userEmail}`:

```js
{
  email,
  completed: { "5:0": true, "5:1": false, ... }   // dayNumber:activityIndex
}
```

(Per-user, because travel groups disagree on what counts as "done"; aggregate to a group view by intersecting / unioning.)

UI:

- Each activity in [DayCard.jsx](../src/components/DayCard.jsx) gets a small checkbox (visible only when `today >= day.date` — no checking off Day 14 from Day 1).
- Day card summary shows a thin progress bar.
- Trip header chip: `12/47 activities done`.
- "Group view" toggle: shows ✅ if everyone in the trip has marked it done; partial dot otherwise.

**Scope**

- New collection + rules.
- Add checkboxes to `DayCard` activities.
- E2E: mark activity done → progress chip updates.

**Risks**

- Index-based keys break if activities are reordered in edit mode. Consider a stable per-activity ID (currently activities are bare strings — would need to wrap as `{ id, text }` or hash the text). v1: index-based, accept that edits invalidate completion.

---

### 2.3 Expense logger

**User story**

> "I just spent CAD 80 on dinner. Carlos paid. Log it before I forget."

**Proposal**

See [ui-ux-proposals.md §3.3](ui-ux-proposals.md). Functional augmentation here:

- Quick-add modal: amount, currency, category (food / transit / lodging / activity / other), who paid, optional note.
- Auto-converts to user's `homeCurrency` (1.4) using cached daily rate (4.1).
- Shows day total under the day badge: `CAD 240 · USD 178`.
- "Settle up" view at trip level: who owes whom (per-pair net).

**Scope**

- Cross-ref `ui-ux-proposals.md §3.3`.
- Adds: `paidBy`, `splitWith[]`, `category`, `homeCurrencyAmount` (denormalized at write time).

---

### 2.4 Reminders & light notifications

**User story**

> "Remind me 2 hours before our flight tomorrow. And tell me when the hotel check-in opens."

**What's missing**

No reminders anywhere. The whole app is pull-only.

**Proposal**

Two channels, in order of complexity:

1. **In-app reminder badge**: on app load, scan time-anchored items in the next 24h. Show a small badge on Header → on click, lists upcoming items.
2. **Browser notifications** (PWA, opt-in): when the app is installed (see [ui-ux-proposals.md cross-cutting — PWA]), schedule local notifications via the Notifications API for the next session. No backend push needed.

Reminder rules:

- Auto-generated: 2h before any `flight`, 30 min before any `train`, on day-start for any logistics with `time`.
- User-added: from a checklist item or any logistics row → "Remind me at HH:mm".

**Scope**

- v1 = in-app only. Stored in `localStorage` per user; cleared after the moment passes.
- v2 = Notifications API integration after PWA install.
- E2E: stub `now` to 30 min before a `flight` time → badge shows.

**Risks**

- Time zones. Always store and compare in the trip's destination time zone, not the user's device. See 4.2.

---

### 2.5 Quick contacts / emergency panel

**User story**

> "Our hotel reservation has a typo and check-in is in an hour. What's their number?"

**What's missing**

Phone numbers, addresses, and emergency contacts are buried in note text or PDFs in `DayFiles`. Hard to find under stress.

**Proposal**

A header action **"Contacts"** opens a drawer with:

- **Hotel & transit**: pulled from logistics rows that have `phone` and/or `address` (new optional fields). Tap-to-call (mobile `tel:` link).
- **Emergency**: country-specific (911, 112, etc. — derived from a country field on the trip), local consulate of the user's home country, user's emergency contact from profile (1.4), travel insurance hotline.
- **Pinned**: anything the user explicitly pinned ("the guide we hired").

**Scope**

- Extends `logistics` items with optional `phone`, `address` (renderable as `tel:` / `geo:` / map link).
- New `ContactsPanel.jsx` (drawer).
- Static lookup table for emergency numbers per country code (~250 lines, no API).
- E2E: open contacts → see hotel phone tap-to-call link.

---

## Phase 3 — Start a New Trip

### 3.1 In-app conversational trip builder

**User story**

> "I want to plan a 10-day trip to Japan. Just talk to me — don't make me write JSON or copy a prompt to ChatGPT."

**What's missing**

The current Add Trip dialog ([Dashboard.jsx:678–848](../src/components/Dashboard.jsx#L678-L848)) offers three paths: upload a JSON file, paste JSON, or copy a long prompt to take to ChatGPT and paste the result back. Only the third works without existing JSON, and it forces the user to leave the app and round-trip through an external tool.

Meanwhile [ItineraryAgent.jsx](../src/components/ItineraryAgent.jsx) already runs an in-app conversation against the Claude API for *editing* trips and, via `onDuplicateCreated`, can spawn new ones from existing.

**Proposal**

Add a fourth option to the Add Trip dialog: **"Build with AI"**.

- Opens (or focuses) the existing ItineraryAgent panel in a "new trip" mode.
- The agent runs the same question script that the copy-paste prompt encodes (name, dates, parts, days, etc.), one question at a time, in chat form.
- On completion, the agent writes the JSON itself and creates the trip directly into the chosen folder — no file handling, no JSON visible to the user.
- The destination folder selected in the dialog is passed through.
- The pasted-prompt path stays as a power-user / no-Claude-budget fallback.

**Scope**

- Agent gains a `mode: "edit" | "create"` prop. Already partially expressed today by `itinerary={null}` + `canEdit={false}` on the dashboard.
- Wire a new "Build with AI" button in the Add Trip dialog to open the agent in `create` mode with the target folder pre-selected.
- Reuse the agent's existing JSON-emission and trip-creation pipeline.
- E2E: open Add Trip → click Build with AI → mocked agent yields canned JSON → trip appears in the chosen folder.

**Risks**

- Cost. Each new-trip conversation is meaningfully more API tokens than an edit. Either gate behind admin-only initially or rate-limit per user.
- Backend availability. Fall back gracefully to the existing copy-prompt flow with a "AI is unavailable, use this prompt instead" hand-off.

---

### 3.2 Trip starter templates

**User story**

> "I'm planning a long-weekend city break. I don't want a blank canvas — give me a sensible 4-day skeleton I can edit."

**What's missing**

Every new trip starts from zero (or from a copy of an existing one — but that requires having one). The agent and the prompt produce *content*; what's often more useful is *structure* — "4 days, Part 1 = arrival, Part 2 = main, Part 3 = depart" — with empty days the user fills in themselves.

**Proposal**

A small bundled library of **template skeletons** by trip category:

- `city-break-3d`, `city-break-5d`, `road-trip-7d`, `beach-week`, `ski-week`, `hike-expedition-10d`, `family-with-kids-7d`, `business-quick-trip`
- Each is a hand-curated JSON with parts, day count, and suggested logistics types (e.g. road trip = drive-heavy; ski-week = stay-anchored). Content fields (`activities`, `tips`, etc.) are **empty arrays** — the structure, not the substance.

UI:

- New **"Templates"** tab inside the Add Trip dialog (alongside Upload / Paste / AI).
- Tile grid: emoji + name + duration + 1-line description.
- Selecting a template + entering a name + folder creates the trip immediately, ready to edit (or hand off to 3.1's agent for fleshing out).
- Templates live in `src/data/templates/*.json` — versioned in source, not Firestore.

**Scope**

- New directory: `src/data/templates/`.
- New `TemplateGrid.jsx` rendered inside the existing Add Trip dialog.
- Template names and descriptions routed through i18n.
- E2E: open Add Trip → Templates tab → pick a template → trip created with the expected day count.

**Risks**

- Templates rot. Keep them content-free (skeletons only) so they don't need updating for "best restaurant in Tokyo 2027" or similar.

---

### 3.3 First-run experience

**User story**

> "I just signed in. The dashboard is empty. What now?"

**What's missing**

A new user with zero accessible trips lands on a sparse dashboard: header, AI banner, search bar, and a single dashed "Add destination" button at the bottom ([Dashboard.jsx:651–659](../src/components/Dashboard.jsx#L651-L659)). The "no trips found" copy ([Dashboard.jsx:485](../src/components/Dashboard.jsx#L485)) doesn't guide.

**Proposal**

When `registry.length === 0` (no folders), replace the sparse area with a structured first-run panel:

- Heading + one-line pitch ("Plan your first trip in two minutes").
- Three large CTAs side-by-side, each tied to one of:
  1. **Build with AI** (3.1)
  2. **Pick a template** (3.2)
  3. **Paste my own JSON** (existing Add Trip path)
- Optional: an **"Explore a sample trip"** link that opens a curated read-only demo itinerary (no folder created — closes back to the dashboard) so users see what a finished result looks like before committing.
- Auto-dismisses once the user creates their first trip; never re-appears.

**Scope**

- New `EmptyDashboard.jsx` rendered conditionally from [Dashboard.jsx](../src/components/Dashboard.jsx).
- Sample trip JSON bundled at `src/data/sample-trip.json` — loaded into a transient view by passing it directly to the existing trip render path (not stored in Firestore).
- All copy through i18n.
- E2E: stub registry empty → assert three CTAs present; click "Pick a template" → templates dialog opens.

**Risks**

- The sample trip becomes the de facto demo for screenshots and onboarding. Keep it small (3–5 days), polished, and updated when the schema evolves.

---

## Phase 4 — Smart context (cross-cutting)

### 4.1 Currency conversion

**User story**

> "Is CAD 240 a lot? What's that in USD?"

**Proposal**

- One free daily fetch from a public FX API (e.g., `open.er-api.com` — no key, free) at app load. Cached in `localStorage` for 24h.
- Hooked into:
  - **Stats line** in header — secondary "= USD ~ X" line under cost-bearing chips
  - **Expense entries** (2.3) — auto-converts to home currency (1.4) at write time, stored denormalized
  - **A standalone converter** (small popover from the header chip) for ad-hoc lookups
- Currency taxonomy: drop-down of the most-used 30 currencies; free-text fallback.

**Scope**

- New `src/utils/fx.js` (fetch + cache).
- Tiny converter component.
- No backend changes (the FX call is from the browser).
- E2E: stub fetch with a fixed rate; assert conversion appears.

**Risks**

- API outage breaks conversion. Cache last-known rate and show "(rate from <date>)".

---

### 4.2 Time zones

**User story**

> "I told my mom I'd call when I land — but in *her* time, not Vancouver's."

**What's missing**

Everything is naive local time. No notion of "destination TZ" vs "home TZ."

**Proposal**

- Trip doc: optional `timezone` field (e.g., `"America/Vancouver"`) — auto-suggested from the first day's location via a small static `country/city → IANA` lookup, editable.
- Header chip while a trip is open: `🇨🇦 Sat 14:32 · 🏠 16:32`. Click toggles which is primary.
- All time-anchored entries (activities, logistics, reminders 2.4) interpret as **destination TZ** by default.
- Profile (1.4) holds `homeTimezone` for the second clock.

**Scope**

- New `src/utils/tz.js` (uses native `Intl.DateTimeFormat` — no library).
- Header chip.
- E2E: set destination TZ, set home TZ in profile, assert both clocks render with correct offset.

**Risks**

- IANA name input is technical. Use a curated dropdown of common destinations rather than free text.

---

### 4.3 Weather forecast per day

**User story**

> "Is the Lake Louise hike worth it on Day 8 or should we shuffle?"

**Proposal**

- For days within the next 14 days (forecast horizon), call a free weather API (open-meteo.com — no key) using the day's geocoded `coords` (from [ui-ux-proposals.md §3.2 Map]).
- Render a tiny weather chip on the day card summary: `☀️ 22° · 0%`.
- On the day card detail, a one-line forecast: "Sunny, high 22°C, light wind, 0% rain."
- Beyond 14 days, show seasonal averages (static lookup) with a `~` prefix to indicate uncertainty.

**Scope**

- Depends on day-level coordinates (drives [ui-ux-proposals.md §3.2 Map] forward — geocoding utility shared).
- New `src/utils/weather.js`.
- Day card weather chip + detail line.
- E2E: stub weather response → chip + line render.

**Risks**

- Travelers may make plans based on a bad forecast and complain. Always show "as of <date>" and link to the source.

---

## Out of scope (intentional non-goals)

To keep the surface manageable, these are explicitly *not* proposed here. Surface them later if needed:

- **Booking integrations** (Booking.com, Skyscanner). High value but high integration burden + commercial relationships.
- **Real-time flight tracking**. Useful but requires a paid API.
- **Restaurant reservations**. OpenTable etc. not worth the integration weight.
- **Multi-currency settle-up algorithms** (Splitwise-grade). Stop at per-pair net in 2.3.
- **Group voting / polls on alternatives**. Real but low frequency. Notes already work.
- **AI "what should we do today"**. Already partially covered by the existing agent; a focused "free time finder" can come later as an agent prompt.

---

## How to use this spec

1. Pick a feature whose user story matches a real next ask.
2. Promote to its own spec at `specs/<feature-slug>.md`, copying the structure of [file-tags.md](file-tags.md).
3. Cross-reference [ui-ux-proposals.md](ui-ux-proposals.md) for any presentation-layer pieces.
4. Update [as-built.md](as-built.md) when shipped.
5. Move the section to a "Shipped" tail or strike it from this file so this stays a forward-looking document.
