# Spec: Onboarding & New Trip Creation

## Status
In progress — covers three onboarding gaps: a conversational AI trip builder, bundled starter templates, and a structured first-run experience for new users.

## Context

The current Add Trip dialog forces three paths: upload JSON, paste JSON, or copy a long prompt to ChatGPT and round-trip the JSON back. Only the third works without prior JSON, and it leaves the app. A new user with no trips lands on a near-empty Dashboard — the only clear next action is a single dashed "Add destination" button.

This spec replaces the dialog with a tabbed UI, adds a bundled template library, and gates the empty Dashboard behind a structured first-run panel.

---

## 3.2 Trip starter templates (foundational — built first)

### Data model

Templates are bundled JSON skeletons in source code, not stored in Firestore. Each template is a function that returns a fresh itinerary object with the standard schema (matches [as-built.md](as-built.md) — `version`, `title`, `subtitle`, `stats`, `parts[]` with `days[]`).

Templates are **content-empty** by design: `activities`, `tips`, `warnings`, `links`, `images` are all `[]`. Only the structural skeleton is bundled — names, day count, parts, suggested logistics types. This keeps templates from rotting (no "best Tokyo restaurant 2027").

### Bundled templates

| ID | Emoji | Days | Parts |
|----|-------|------|-------|
| `city-break-3d` | 🏙️ | 3 | 1 |
| `road-trip-7d` | 🚗 | 7 | 2 |
| `beach-week` | 🏖️ | 7 | 1 |
| `family-with-kids-7d` | 👨‍👩‍👧 | 7 | 2 |
| `ski-week` | ⛷️ | 7 | 1 |

### Files

- `src/data/templates/templates.js` — exports `templates` array; each entry has `{ id, emoji, nameKey, descKey, days, build() }`.
- `src/components/TemplateGrid.jsx` — tile grid; calls `onPick(template)` when a tile is clicked.

---

## 3.1 In-app conversational trip builder

### Approach

Reuse the existing [ItineraryAgent.jsx](../src/components/ItineraryAgent.jsx) panel — it already accepts `itinerary={null}` and shows "Describe el viaje que quieres planear y lo creo para ti." The integration is UI-only:

- Add a **"Build with AI"** action to the Add Trip dialog and to the empty-dashboard CTAs.
- Clicking it closes the dialog and opens the agent drawer.
- A new `targetFolderId` prop on `ItineraryAgent` lets `onDuplicateCreated` route the new trip into the right folder (when invoked from a folder's add-trip action).

### Out of scope (explicit)

The spec's vision of "agent writes JSON itself, no JSON visible" requires backend prompt-script work that is out of scope here. v1 ships the discoverability + folder-routing changes. The agent's existing chat → patch → duplicate flow remains the actual creation pipeline. Document as a follow-up if backend work is greenlit.

---

## 3.3 First-run experience

### Trigger

When `registry.length === 0` after the initial cloud sync completes, replace the trip-list / search bar / "Add destination" footer with a dedicated `EmptyDashboard.jsx` panel.

### Layout

- Heading + one-line pitch.
- Three large CTAs side-by-side:
  1. **Build with AI** → opens ItineraryAgent
  2. **Pick a template** → opens template picker dialog
  3. **Paste my own JSON** → opens existing Add Trip dialog (no folder pre-selected → defaults to a freshly-created "My Trips" folder, or picks the first folder)
- Auto-dismisses once any folder exists.

### Folder bootstrap

Templates and the conversational builder both need a folder to land in. When creating from EmptyDashboard:

- If no folder exists, create a default folder `{ id: 'my-trips', label: 'My Trips', emoji: '✈️', trips: [] }` first.
- Then proceed with the chosen flow.

### Sample trip

Spec mentions an "Explore a sample trip" link. **Deferred** — listed as a follow-up to keep this PR scoped. Adding it requires a transient render path in App.jsx; the three CTAs above already cover the primary onboarding goal.

---

## Add Trip dialog — tabbed redesign

The existing dialog (Dashboard.jsx:678–848) is flat: name field, upload/paste row, and a collapsible AI-prompt block. Refactor into a tabbed dialog (`AddTripDialog.jsx`):

| Tab | Content |
|-----|---------|
| **Templates** | `TemplateGrid` |
| **Upload** | File upload button (existing) |
| **Paste** | JSON textarea (existing) |
| **Build with AI** | Short pitch + button that closes dialog and opens ItineraryAgent. Keeps the existing copy-prompt fallback below as a "no-Claude-budget" path. |

Name field stays at the top of the dialog (above the tabs).

---

## Files to change / create

| File | Change |
|------|--------|
| `src/data/templates/templates.js` | NEW — template registry + skeleton builders |
| `src/components/TemplateGrid.jsx` | NEW — tile grid, pick callback |
| `src/components/AddTripDialog.jsx` | NEW — extracted tabbed dialog |
| `src/components/EmptyDashboard.jsx` | NEW — first-run panel |
| `src/components/Dashboard.jsx` | Use new components; show EmptyDashboard when `registry.length === 0`; bootstrap default folder |
| `src/components/ItineraryAgent.jsx` | Add `targetFolderId` prop; surface via `onDuplicateCreated` |
| `src/App.jsx` | Update `handleAgentDuplicate` to honor `targetFolderId` when set |
| `src/i18n/en.js`, `src/i18n/es.js` | Add keys for tabs, templates, empty-state, build-with-AI |
| `e2e/onboarding.spec.js` | NEW — tests for templates, empty state, build-with-AI button |
| `specs/as-built.md` | Document templates + first-run + tabbed Add Trip dialog |

---

## Permissions / security

- Templates ship in source; no Firestore impact.
- Trip creation from any path goes through the same `updateRegistry` + `saveTripData` + Firestore `setDoc` pipeline already used by paste/upload.
- No new collections, no rules changes.
