---
name: ship-feature
description: After a feature is implemented, sync the docs — update as-built.md, flip the spec's Status to Shipped, move its roadmap entry from Pending to Shipped, and add any new Firestore collections to the summary. Run this once code + tests are merged-ready.
---

# Ship Feature

Use after a spec has been implemented and the E2E tests pass. This skill performs the documentation sync; it does **not** run deploys (use `/deploy` for that).

## Inputs

- The spec slug (e.g. `traveler-profile`) or the path to the spec file. If the user didn't say which, list the 📋 Pending specs from `specs/roadmap.md` and ask.

## Step 1 — Read the source material

1. The spec file at `specs/<slug>.md`.
2. The current `specs/as-built.md` and `specs/roadmap.md`.
3. The component(s) and any new collection paths the spec mentions (so the as-built description matches what was actually built, not what was originally proposed — they may have diverged).

## Step 2 — Verify the feature is actually shipped

Before touching docs, confirm:

- The components named in the spec exist in `src/components/`.
- An E2E spec exists in `e2e/` (per CLAUDE.md, "a feature is not done until it has tests").
- The build passes (`npm run build`) and the relevant E2E tests pass.

If any of those is missing, **stop** and tell the user what's still required. Don't mark it shipped.

## Step 3 — Update `specs/as-built.md`

Add a new section that documents the **as-shipped** behavior, not the spec's original proposal. Use the same structural style as existing sections:

```markdown
## <Feature Name>

**Component**: `src/components/<File>.jsx`
**Firestore path**: `<collection>/...` (omit if no Firestore involvement)

<2-4 sentence description of what it does and where it lives in the UI>

- <bullet about each meaningful behavior>
- <bullet about permissions / rules>
- <bullet about i18n keys, if non-trivial>
```

Place the new section in a sensible location relative to the existing flow (auth → dashboard → trip → day → admin → cross-cutting). Don't append blindly to the end if there's a more natural slot.

If the feature added a Firestore collection, also append it to the `## Firestore Collections Summary` block.

## Step 4 — Flip the spec's Status

In `specs/<slug>.md`, replace the Status line with:

```markdown
## Status
Shipped — see [as-built.md § <Section Name>](as-built.md). <one-line note about anything intentionally deferred>
```

If the spec is now fully redundant with as-built (no design decisions or rejected alternatives worth preserving), ask the user whether to **delete the spec file** instead. Default: keep the file with the flipped status — the rationale and "Out of scope" notes have lasting value.

## Step 5 — Update `specs/roadmap.md`

1. Find the entry in the 📋 Pending — proposal specs table (or wherever it lived).
2. In the table row, replace the Effort column with `—` and the Headline column with `✅ shipped`. Leave the link intact so readers can find the (now-shipped) spec.
3. Add a new bullet under ✅ Shipped in the most appropriate area subsection, linking to the new as-built section.
4. Update the "Suggested ordering" line — drop the shipped item.

## Step 6 — Resolve any drift this surfaces

If the implementation diverged from the spec (different field names, deferred sub-features, additional behavior), call this out:

- Update the spec's body to match what shipped (don't preserve outdated proposals — they confuse future readers).
- If sub-features were intentionally deferred, list them in a new "Follow-ups" section at the bottom of the spec.

## Step 7 — Report

End with a short paragraph:
- Which files changed.
- Any deferred sub-features (and whether they need their own roadmap entries — if yes, prompt the user to run `/roadmap-update` for them).
- The deploy command the user needs (`/deploy` for hosting + backend; `/deploy-rules` if `firestore.rules` was touched).

## Don'ts

- **Don't deploy.** Documentation sync only.
- **Don't mark shipped without verifying tests.** The whole point of this skill is to keep `as-built.md` honest.
- **Don't lose "Out of scope" notes** when flipping a spec to Shipped — those decisions have ongoing value.
- **Don't silently remove a spec file.** If it should go, ask first.
