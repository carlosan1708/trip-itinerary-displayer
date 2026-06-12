# Spec: Packing & Pre-Departure Checklist

## Status
Pending review — proposal.

## Context

> "Did I pack the adapter? Did the passport renewal come back? Have I done the visa form?"

There is no checklist anywhere. Files cover documents (after the fact); notes are conversational. Neither tracks "is this done."

This proposal subsumes the checklist half of [ui-ux-proposals.md §3.3](ui-ux-proposals.md). Expense tracking — the other half of that section — is covered by [expenses.md](expenses.md).

---

## Data Model

New per-trip subcollection.

```js
trips/{gatewayTripId}/checklist/{itemId}: {
  tripId,
  text,
  done: false,
  category: "pack" | "documents" | "bookings" | "other",
  ownerEmail?,            // who's responsible (optional — multi-user trips)
  dueOffsetDays?,         // -7 = "1 week before departure"
  createdAt,
  doneAt?
}
```

---

## UI

- Header action **"Checklist"** opens a drawer (beside Files / Map). Tabs by category.
- Progress bar in the drawer header: `12 / 18 done`.
- "Templates" button applies a starter template (international travel, hiking, family-with-kids). Strings come from i18n.

---

## Scope

- New collection + Firestore rules (auth + on allowlist for the trip).
- New components: `ChecklistPanel.jsx`, `ChecklistTemplate.jsx`.
- Template strings in `src/i18n/en.js` and `es.js`.
- E2E: add item, mark done, apply template.

---

## Related specs

- [today-view.md](today-view.md) — open items with `category: "documents" | "bookings"` surface in the pre-departure banner.
- [traveler-profile.md](traveler-profile.md) — `ownerEmail` resolves against trip allow-list.
