# Firestore rules tests

Security-rules tests for `../firestore.rules`, run against the **Firestore
emulator**. They prove the P0 authorization fix: a whitelisted viewer can read a
trip and create their own duplicate, but cannot overwrite, delete, or snapshot
the author's itinerary.

These are intentionally **separate from `npm test`** (Vitest mocks Firebase and
never exercises rules) and from Playwright (test mode mocks Firestore too). Rules
can only be validated against the emulator.

## Prerequisites

- **Java 21+** (the Firestore emulator is a JVM process; firebase-tools requires 21+)

## Run

```bash
npm i -D @firebase/rules-unit-testing firebase-tools
npx firebase-tools emulators:exec --only firestore --project demo-test "node --test firestore-tests/rules.test.mjs"
```

Verified: **8/8 pass** against the emulator (`firebase-tools` 15.x, JRE 21).

`emulators:exec` starts the Firestore emulator, runs the command, and shuts it
down. The tests load `firestore.rules` directly, so they always test the current
rules.

## What is covered

| Scenario | Expected |
|----------|----------|
| Viewer overwrites author's itinerary | **denied** |
| Viewer reattributes itinerary to self | **denied** |
| Author updates own itinerary | allowed |
| Viewer creates own duplicate trip | allowed |
| Viewer deletes author's itinerary | **denied** |
| Author deletes own itinerary | allowed |
| Viewer reads itinerary | allowed |
| Viewer snapshots author's trip (`versions`) | **denied** |
| Author snapshots own trip | allowed |

## CI

Add a job that installs Java + `@firebase/rules-unit-testing` and runs the
`emulators:exec` command above. Keep it a required check for changes to
`firestore.rules`.
