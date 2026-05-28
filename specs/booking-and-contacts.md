# Spec: Booking Status & Quick Contacts

## Status
Pending review — proposal. Bookings and Contacts both extend `day.logistics[]` items with optional fields and both surface as header drawers, so they share a schema migration and ship as one initiative.

## Context

> "I'm 3 weeks out. Did I actually book the Banff hotel? Did I pay the deposit? When do I need to reconfirm?"
>
> "Our hotel reservation has a typo and check-in is in an hour. What's their number?"

`day.logistics` rows ([as-built.md](as-built.md) — `flight | drive | stay | train`) carry only `label` + `value`. There is no booking status, no confirmation number, no booking deadline, no phone number, no address. Travelers fall back to email inboxes when prepping and to PDFs / note text when stressed in-trip.

---

## Data Model Change

Extend each `logistics` item additively. Existing items with no new fields are treated as `status: "planned"` with no contact info.

```js
{
  type: "stay",
  label: "Fairmont Banff Springs",
  value: "Sep 18 – Sep 20",

  // Booking
  status: "booked",          // "planned" | "booked" | "paid" | "confirmed" | "cancelled"
  confirmation: "ABC-12345",
  bookedAt: "2026-04-01",
  reminderAt: "2026-09-15",
  cost: { amount: 480, currency: "CAD" },

  // Contacts
  phone: "+1-403-762-2211",
  address: "405 Spray Ave, Banff, AB"
}
```

---

## UI — Bookings drawer

- Status chip on each logistics row in [DayCard.jsx](../src/components/DayCard.jsx), color-coded.
- Header action **"Bookings"** opens a `BookingsPanel.jsx` drawer (modeled on `AllFilesPanel`) listing every logistics row across days, grouped by status. "Not yet booked" surfaces at the top.
- Edit-mode UI: inline status dropdown + small "details" expander on each logistics row for confirmation / cost.
- Passive reminder: chip turns red when `reminderAt < today`. No push notifications (see [today-view.md](today-view.md) for the upcoming-items badge).

## UI — Contacts drawer

Header action **"Contacts"** opens `ContactsPanel.jsx` with three sections:

- **Hotel & transit**: pulled from logistics rows that have `phone` and/or `address`. Tap-to-call (`tel:`) on mobile.
- **Emergency**: country-specific (911, 112, etc.) derived from a country field on the trip; local consulate of the user's home country; user's emergency contact from [traveler-profile.md](traveler-profile.md); travel insurance hotline.
- **Pinned**: anything the user explicitly pinned ("the guide we hired").

Static lookup table for emergency numbers per country code (~250 lines, no API).

---

## Scope

- Schema: extend `day.logistics[]` items (additive).
- New `BookingsPanel.jsx` and `ContactsPanel.jsx` drawers.
- Edit-mode dropdown + expander on each logistics row.
- Static `src/data/emergency-numbers.js` table.
- E2E: set status, see chip; open Bookings drawer, see grouped list; open Contacts, see hotel `tel:` link.

---

## Risks

- Reminders are easy to over-engineer. v1 = passive (chip color). Active reminders covered by [today-view.md](today-view.md).

---

## Out of scope

These are explicit non-goals for this spec:

- **Booking integrations** (Booking.com, Skyscanner). High value but high integration burden + commercial relationships.
- **Real-time flight tracking**. Useful but requires a paid API.
- **Restaurant reservations** (OpenTable etc.). Not worth the integration weight.

---

## Related specs

- [today-view.md](today-view.md) — consumes `reminderAt` for the upcoming-items badge and surfaces unconfirmed logistics in the pre-departure banner.
- [traveler-profile.md](traveler-profile.md) — provides the user's emergency contact.
