# Spec: Activity Completion / Progress

## Status
Pending review — proposal.

## Context

> "We did the gondola but skipped the museum. Let me check those off so the rest of the family knows."

Activities are static text. No state for "done", "skipped", "in progress."

---

## Data Model

Per-user, per-activity completion. Per-user (not per-trip) because travel groups disagree on what counts as "done"; aggregate to a group view by intersecting / unioning.

```js
trips/{gatewayTripId}/progress/{userEmail}: {
  email,
  completed: { "5:0": true, "5:1": false, ... }   // dayNumber:activityIndex
}
```

---

## UI

- Each activity in [DayCard.jsx](../src/components/DayCard.jsx) gets a small checkbox, visible only when `today >= day.date` (no checking off Day 14 from Day 1).
- Day card summary shows a thin progress bar.
- Trip header chip: `12/47 activities done`.
- "Group view" toggle: shows a check mark if everyone in the trip has marked it done; partial dot otherwise.

---

## Scope

- New `progress/` collection + Firestore rules (write only own doc; readable by anyone on the trip allow-list).
- Add checkboxes to `DayCard` activities behind the date guard.
- Header chip + group-view toggle.
- E2E: mark activity done → progress chip updates; group toggle reflects multi-user state.

---

## Risks

- Index-based keys break if activities are reordered in edit mode. Consider a stable per-activity ID (currently activities are bare strings — would need to wrap as `{ id, text }` or hash the text). v1: index-based, accept that edits invalidate completion.

---

## Out of scope

- **Group voting / polls on alternatives** — real but low frequency. Notes already work for that.

---

## Related specs

- [today-view.md](today-view.md) — uses the same date-guard logic to decide which day is "current".
