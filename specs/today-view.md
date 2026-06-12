# Spec: "Today" View, Countdown, and Reminders

## Status
Pending review — proposal. Bundles three closely-coupled in-app awareness features: a pre-trip countdown, an in-trip "Today" view, and an upcoming-items reminder badge. All three pivot on the same schema additions (`startDate` / `endDate` on the trip, optional `time` on activities and logistics).

## Context

> "It's 9am in Vancouver. Just open the app and tell me what we're doing today and what's next."
>
> "We leave in 12 days. What still needs to happen?"
>
> "Remind me 2 hours before our flight tomorrow."

Opening a trip lands at Day 1, collapsed. On Day 8, you scroll past 7 days, expand the right one, and read the whole accordion to find what's at 2pm. Before the trip, nothing aggregates "what's still open" as departure approaches. And the whole app is pull-only — there are no reminders.

---

## Schema additions

Two additive changes drive everything in this spec.

```js
// itinerary doc
{
  startDate: "2026-09-15",   // ISO date — replaces inferring from subtitle
  endDate:   "2026-10-04",
  timezone:  "America/Vancouver",   // optional; auto-suggested from first day's location
  ...
}

// each activity / logistics row — optional time anchor
{
  text: "Helicopter tour",
  time: "14:00"   // HH:mm in destination timezone
}
```

Backwards-compatible: rows without `time` render exactly as today.

---

## Pre-departure banner (before the trip)

A small **"Pre-departure"** banner that surfaces only when `today` is within N days of `startDate`:

- Countdown: "12 days until departure"
- Open checklist items with `category: "documents" | "bookings"` (from [packing-checklist.md](packing-checklist.md))
- Logistics rows where `status != "confirmed"` and the day is in the first ~3 days of the trip (from [booking-and-contacts.md](booking-and-contacts.md))
- Passport expiry alert if user has set their expiry (from [traveler-profile.md](traveler-profile.md))

Self-dismisses on `today >= startDate` — replaced by the Today view below.

## Today view (during the trip)

When `today` is within `[startDate, endDate]`:

- Header gains a prominent **"Today"** button (also auto-focused on app open).
- "Today" lands on a focused view: today's day card expanded, all others collapsed, scroll-positioned at the top of today.
- A **"What's next"** ribbon appears above the day card if the day has time-anchored entries: `Next: 14:00 — Helicopter tour (in 2h 15m)`.
- A small "Tomorrow" preview chip below the day shows the next morning's first item.

## Upcoming-items badge (reminders v1)

- On app load, scan time-anchored items in the next 24h.
- Show a small badge on [Header.jsx](../src/components/Header.jsx); on click, list upcoming items.
- Auto-generated rules: 2h before any `flight`; 30 min before any `train`; on day-start for any logistics with `time`.
- User-added: from a checklist item or any logistics row → "Remind me at HH:mm".
- Storage: `localStorage` per user; cleared once the moment passes. No Firestore writes.
- v2 (deferred): browser notifications via the Notifications API once the app is installed as a PWA.

## Time zone handling

- All `time` values are interpreted in the trip's `timezone` (destination), not the user's device.
- Header chip while a trip is open: `🇨🇦 Sat 14:32 · 🏠 16:32`. Click toggles which is primary. Home time uses `homeTimezone` from [traveler-profile.md](traveler-profile.md).
- New `src/utils/tz.js` — uses native `Intl.DateTimeFormat`, no library.
- Static `country/city → IANA` lookup table for auto-suggesting the destination TZ from the first day's location.

---

## Scope

- Add `startDate`, `endDate`, `timezone` to itinerary schema.
- Add optional `time?: "HH:mm"` to activity and logistics items.
- New components: `PreDepartureBanner.jsx`, `TodayBanner.jsx`, `RemindersBadge.jsx`.
- New util: `src/utils/tz.js`, `src/utils/reminders.js`.
- "Today" button + reminders badge + dual-clock chip in [Header.jsx](../src/components/Header.jsx).
- E2E:
  - Stub today as 5 days before `startDate` → pre-departure banner shows; advance to day 1 → banner dismisses, Today view takes over.
  - Stub today as Day 5 of the trip → "Today" lands on Day 5 expanded; "What's next" shows correct upcoming entry.
  - Stub `now` to 30 min before a `flight` time → reminders badge shows.
  - Set destination TZ + home TZ → both clocks render with correct offset.

---

## Risks

- Date parsing from `subtitle` is fragile — that's why we introduce explicit `startDate` / `endDate` rather than inferring.
- Without time anchors, "what's next" degrades to just showing today's activity list. Still useful.
- IANA name input is technical. Use a curated dropdown of common destinations rather than free text.
- Reminder time-zone bugs are easy. Always store and compare in the trip's destination TZ, not the user's device.

---

## Out of scope

- AI "what should we do today" / free-time finder — already partially covered by the existing agent; revisit as an agent prompt later if asked.
- Browser push notifications via a backend — v2 client-side scheduling is enough.

---

## Related specs

- [booking-and-contacts.md](booking-and-contacts.md) — `reminderAt` and `status` on logistics items feed both the pre-departure banner and the reminders badge.
- [packing-checklist.md](packing-checklist.md) — open document/booking items surface in the pre-departure banner.
- [traveler-profile.md](traveler-profile.md) — provides `homeTimezone` and the passport-expiry value.
