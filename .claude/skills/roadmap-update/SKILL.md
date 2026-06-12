---
name: roadmap-update
description: Place a feature request onto specs/roadmap.md. Decides whether it's already shipped, overlaps with an existing item, belongs as a roadmap bullet, or warrants a full spec — then updates the right files.
---

# Roadmap Update

Use when the user describes a feature idea ("we should add X", "what about doing Y", "users keep asking for Z") and wants it triaged onto the roadmap. Do **not** start implementing — this skill only updates documentation.

## Inputs

- Feature description from the user. If they didn't include one, ask for it in one short sentence plus the user-facing problem it solves.

## Step 1 — Read the current state

Read in this order (all required, no shortcuts):

1. `specs/roadmap.md` — the index of shipped / in-progress / pending.
2. `specs/as-built.md` — authoritative source for what's actually built.
3. `specs/ui-ux-proposals.md` — the other large pool of pending ideas.
4. The spec files in `specs/` referenced by roadmap.md's pending section.

## Step 2 — Categorize

Match the request against one of these buckets and tell the user which bucket and why:

| Bucket | Action |
|--------|--------|
| **Already shipped** (covered in as-built.md or roadmap's ✅ section) | No file changes. Point the user to the relevant section. |
| **Already pending** (matches an existing 📋 item exactly) | No file changes. Point at the existing entry. |
| **Variant / extension of a pending item** | Add a sub-bullet or short note inside the existing entry, linking back to the request. Don't duplicate. |
| **Already explicitly out of scope** (in roadmap's 💭 section or a spec's "Out of scope") | Tell the user it was previously deferred and *why*. Don't reopen unilaterally — ask if they want to override the prior decision. |
| **Genuinely new** | Continue to Step 3. |

A request can also be a UI/UX polish item (matches the tone of `ui-ux-proposals.md`) vs a functional feature (matches the tone of the proposal specs). Use the right home.

## Step 3 — Decide placement (only for genuinely new)

Ask the user (use `AskUserQuestion`) which of these fits, with a recommendation:

- **Roadmap bullet only** — small, well-understood, doesn't need its own design doc. Add as a one-line item under the most appropriate section in `specs/roadmap.md`. Suitable for most UI/UX-tier polish.
- **Full proposal spec** — has its own data model, multiple UI surfaces, or non-trivial scope. Create `specs/<slug>.md` using the structure of `specs/file-tags.md` (Status / Context / Data Model / UI / Scope / Risks / Related specs). Then link it from `specs/roadmap.md`.

Recommend "full spec" only when the feature has at least one of: new Firestore collection, schema change, multiple new components, cross-cutting interaction with several existing features. Otherwise prefer "roadmap bullet only".

## Step 4 — Update files

For a **roadmap bullet**: append under the most relevant section in `specs/roadmap.md` (📋 Pending — proposal specs, or 📋 Pending — UI/UX proposals → tier). Keep to one line. If it's a UI/UX-tier item, mention which tier (1/2/3) so it's promotable later.

For a **full spec**:

1. Create `specs/<slug>.md`. Status line: `Pending review — proposal.` Body must include Context (with the user-facing problem), Data Model (or "No data-model change"), UI, Scope, Risks, Related specs.
2. Add a row to the proposal-specs table in `specs/roadmap.md` with effort hint (S / M / L) and one-line headline.
3. Re-evaluate the "Suggested ordering" line in roadmap.md — does the new spec belong somewhere in the sequence? Update if so; leave if not.

## Step 5 — Cross-references

If the new item touches the same data as an existing pending spec (e.g. another `logistics[]` extension, another new per-trip collection), add it to that spec's "Related specs" section. Don't leave silos.

## Step 6 — Report

End with a single short paragraph: which bucket, what file(s) changed, and what the next action is (typically: "ready to implement when you are" or "needs more design before picking up").

## Don'ts

- **Don't implement code.** This skill only edits files in `specs/`.
- **Don't promote a UI/UX-proposals.md section** to its own spec as a side effect. That's a separate decision (see `ship-feature` workflow if it's about to be built).
- **Don't reopen items in 💭 Considered, deferred / out of scope** without explicit user override.
- **Don't write a spec longer than `file-tags.md`** unless the design genuinely warrants it. Roadmap bullets are usually correct.
