# Spec: File Tags in Day Details

## Status
Pending implementation

## Context

Files per day already exist via `DayFiles.jsx`, stored in `trips/{gatewayTripId}/files/{fileId}`.
Tags extend this model additively — no restructuring, no migration.

---

## Data Model Change

Add a `tags: string[]` field to each file document (defaults to `[]` when absent).
Existing files without `tags` are treated as untagged — no backfill needed.

```js
// Firestore: trips/{gatewayTripId}/files/{fileId}
{
  tripId, dayNumber, name, type, size, dataUrl,
  authorEmail, authorName, uploadedAt,
  tags: ["visa", "hotel", "reserva"]   // ← new
}
```

---

## Tag Vocabulary

Tags are free-form strings. No server-side taxonomy. The UI surfaces common suggestions as chips but accepts any value typed by the user.

**Default suggestions**: shown in the active UI language (`useT()`).

| English | Spanish |
|---------|---------|
| `visa` | `visa` |
| `hotel` | `hotel` |
| `flight` | `vuelo` |
| `booking` | `reserva` |
| `insurance` | `seguro` |
| `map` | `mapa` |
| `other` | `otro` |

Suggestion strings come from the i18n files (`en.js` / `es.js`) so no hardcoded Spanish appears in component code.

**Limit**: max 5 tags per file (enforced client-side).

---

## UI — Upload Flow (`DayFiles.jsx`)

When a file is selected, before the upload is confirmed:

1. Show a tag input row below the file name preview.
2. Render suggestion chips for the default list — clicking one toggles it on/off.
3. Allow typing a custom tag; pressing Enter or comma adds it.
4. Tags appear as `<Chip size="small">` items; clicking × removes one.
5. Upload button becomes active once a file is chosen (tags are optional).

---

## UI — File List Display

Each file row (currently: icon + name/size/date + download + delete) gains:

- Tags rendered as `<Chip size="small" variant="outlined">` inline below the filename.
- Author or admin can edit tags post-upload via a pencil icon that toggles an inline tag editor (same chip-based input).

---

## UI — Filtering (within a day's file section)

A filter row appears above the file list **only when the day has files with at least one tag**.

- Shows all tags present in that day's files as clickable chips.
- Selecting a chip filters the visible list to files that include that tag.
- Selecting no chips shows all files.
- This is purely local React state — no Firestore query change (all files for a day are already fetched via the existing `onSnapshot`).

---

## Permissions

| Action | Who |
|--------|-----|
| Add tags at upload | Uploader |
| Edit tags post-upload | File author or admin |
| Filter by tag | All authorized users |

---

## Scope Boundaries

- No global tag management — tags live on individual file docs only.
- No cross-day tag search — filtering is scoped to the open day's `DayFiles` instance.
- No backend changes — `DayFiles.jsx` handles everything client-side.
- `firestore.rules` needs no change — file writes are already gated on auth.
- No new npm packages — MUI `Autocomplete` + `Chip` cover the tag input.

---

## Files to Change

| File | Change |
|------|--------|
| `src/components/DayFiles.jsx` | Tag input at upload, tag display, filter row, inline edit |
| `e2e/files.spec.js` | Tests for tag add, display, filter, and inline edit |
