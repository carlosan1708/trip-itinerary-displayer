# Spec: Expense Logger

## Status
Pending review — proposal. Functional augmentation of [ui-ux-proposals.md §3.3](ui-ux-proposals.md). The checklist half of that section is covered by [packing-checklist.md](packing-checklist.md).

## Context

> "I just spent CAD 80 on dinner. Carlos paid. Log it before I forget."
>
> "Is CAD 240 a lot? What's that in USD?"

The app has no concept of money beyond the static `cost` chips on logistics rows, and no currency conversion anywhere.

---

## Data Model

```js
trips/{gatewayTripId}/expenses/{expenseId}: {
  tripId,
  dayNumber,
  amount,
  currency,
  label,
  category: "food" | "transit" | "lodging" | "activity" | "other",
  paidBy,                       // email
  splitWith?: string[],         // emails; absent means "paidBy only"
  homeCurrencyAmount,           // denormalized at write time (see FX rates below)
  createdAt
}
```

---

## UI

- Quick-add modal: amount, currency, category, who paid, optional note.
- Auto-converts to user's `homeCurrency` (from [traveler-profile.md](traveler-profile.md)) using the cached daily FX rate.
- Day total under the day badge: `CAD 240 · USD 178`.
- "Settle up" view at trip level: who owes whom (per-pair net).

## FX rates (shared utility)

A small currency-conversion helper that powers the denormalization above and unlocks ad-hoc conversion elsewhere.

- One free daily fetch from a public FX API (e.g. `open.er-api.com` — no key, free) at app load.
- Cached in `localStorage` for 24h; on outage, fall back to last-known rate and surface "(rate from <date>)".
- Also exposed as a small standalone converter popover from a header chip for ad-hoc lookups.
- Currency taxonomy: drop-down of the most-used 30 currencies; free-text fallback.

---

## Scope

- New `expenses/` collection + Firestore rules.
- New `ExpensesPanel.jsx` (header drawer) + quick-add modal.
- New `src/utils/fx.js` (fetch + cache).
- Day-card total chip + standalone converter popover.
- E2E: add expense, see day total update; settle-up view shows correct per-pair net; stub FX fetch with fixed rate, assert conversion appears.

---

## Out of scope

- **Multi-currency settle-up algorithms (Splitwise-grade)**. Stop at per-pair net.

---

## Related specs

- [traveler-profile.md](traveler-profile.md) — provides `homeCurrency`.
- [ui-ux-proposals.md §3.3](ui-ux-proposals.md) — original combined checklist+expenses proposal.
