/**
 * Firestore security-rules tests (Firebase emulator).
 *
 * These prove the P0 authorization fix in ../firestore.rules: a whitelisted
 * VIEWER can read a trip and create their own duplicate, but can no longer
 * overwrite, delete, or snapshot the AUTHOR's itinerary.
 *
 * NOT run by `npm test` / vitest (which mocks Firestore). Requires the Firestore
 * emulator, which needs Java. Run:
 *
 *   npm i -D @firebase/rules-unit-testing
 *   firebase emulators:exec --only firestore "node --test firestore-tests/rules.test.mjs"
 *
 * See firestore-tests/README.md.
 */
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, setDoc, getDoc, deleteDoc, addDoc, collection } from 'firebase/firestore'

const GATEWAY = 'canada-trip'
const AUTHOR = 'author@example.com'
const VIEWER = 'viewer@example.com'

let env

// Seed helper: write an itinerary as admin (rules bypassed) so tests start from
// a trip that AUTHOR owns and VIEWER is only whitelisted to read.
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    // Whitelist both users on the gateway trip so isGatewayUser() is true.
    await setDoc(doc(db, 'trips', GATEWAY, 'allowed_users', AUTHOR), { email: AUTHOR })
    await setDoc(doc(db, 'trips', GATEWAY, 'allowed_users', VIEWER), { email: VIEWER })
    // The author's live itinerary.
    await setDoc(doc(db, 'trips', GATEWAY, 'data', 'itinerary'), {
      author: AUTHOR, version: 1, title: 'Canada', parts: [],
    })
  })
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
after(async () => { await env?.cleanup() })

function asUser(email) {
  return env.authenticatedContext(email.replace(/[@.]/g, '_'), { email }).firestore()
}

describe('itinerary data writes', () => {
  test('viewer CANNOT overwrite the author\'s itinerary', async () => {
    await env.clearFirestore(); await seed()
    const db = asUser(VIEWER)
    await assertFails(setDoc(doc(db, 'trips', GATEWAY, 'data', 'itinerary'), {
      author: AUTHOR, version: 2, title: 'Hijacked', parts: [],
    }))
  })

  test('viewer CANNOT reattribute the itinerary to themselves', async () => {
    await env.clearFirestore(); await seed()
    const db = asUser(VIEWER)
    await assertFails(setDoc(doc(db, 'trips', GATEWAY, 'data', 'itinerary'), {
      author: VIEWER, version: 2, title: 'Mine now', parts: [],
    }))
  })

  test('author CAN update their own itinerary', async () => {
    await env.clearFirestore(); await seed()
    const db = asUser(AUTHOR)
    await assertSucceeds(setDoc(doc(db, 'trips', GATEWAY, 'data', 'itinerary'), {
      author: AUTHOR, version: 2, title: 'Canada v2', parts: [],
    }))
  })

  test('viewer CAN create their own duplicate trip', async () => {
    await env.clearFirestore(); await seed()
    const db = asUser(VIEWER)
    await assertSucceeds(setDoc(doc(db, 'trips', 'canada-trip-viewer-copy', 'data', 'itinerary'), {
      author: VIEWER, version: 1, title: 'My copy', parts: [],
    }))
  })

  test('viewer CANNOT delete the author\'s itinerary; author CAN', async () => {
    await env.clearFirestore(); await seed()
    await assertFails(deleteDoc(doc(asUser(VIEWER), 'trips', GATEWAY, 'data', 'itinerary')))
    await assertSucceeds(deleteDoc(doc(asUser(AUTHOR), 'trips', GATEWAY, 'data', 'itinerary')))
  })

  test('viewer CAN still read the itinerary', async () => {
    await env.clearFirestore(); await seed()
    await assertSucceeds(getDoc(doc(asUser(VIEWER), 'trips', GATEWAY, 'data', 'itinerary')))
  })
})

describe('version snapshots', () => {
  test('viewer CANNOT snapshot the author\'s trip', async () => {
    await env.clearFirestore(); await seed()
    const db = asUser(VIEWER)
    await assertFails(addDoc(collection(db, 'trips', GATEWAY, 'versions'), {
      version: 2, savedBy: VIEWER, source: 'x',
      data: { author: AUTHOR, version: 2, title: 'x', parts: [] },
    }))
  })

  test('author CAN snapshot their own trip', async () => {
    await env.clearFirestore(); await seed()
    const db = asUser(AUTHOR)
    await assertSucceeds(addDoc(collection(db, 'trips', GATEWAY, 'versions'), {
      version: 2, savedBy: AUTHOR, source: 'author_edit',
      data: { author: AUTHOR, version: 2, title: 'x', parts: [] },
    }))
  })
})
