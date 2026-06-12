#!/usr/bin/env node
// scripts/create-test-user.mjs — Creates/updates the email+password test user in Firebase Auth
// and adds them to the allowed_users list so they can log in immediately.
//
// Usage: node scripts/create-test-user.mjs
//
// Reads from .env: VITE_TEST_EMAIL, VITE_TEST_PASSWORD, VITE_FIREBASE_PROJECT_ID,
//                  VITE_TRIP_ID, GOOGLE_APPLICATION_CREDENTIALS (or FIREBASE_SERVICE_ACCOUNT)

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth }             from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { readFileSync }   from 'fs'
import { resolve }        from 'path'
import { fileURLToPath }       from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../')

// Load .env (same approach as sync-data.mjs)
for (const envFile of ['.env', '.env.local']) {
  try {
    const raw = readFileSync(resolve(ROOT, envFile), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] = m[2].trim()
    }
  } catch { /* optional */ }
}

const PROJECT_ID  = process.env.VITE_FIREBASE_PROJECT_ID
const TRIP_ID     = process.env.VITE_TRIP_ID
const TEST_EMAIL  = process.env.VITE_TEST_EMAIL
const TEST_PASS   = process.env.VITE_TEST_PASSWORD

if (!PROJECT_ID || !TRIP_ID || !TEST_EMAIL || !TEST_PASS) {
  console.error('Missing required env vars: VITE_FIREBASE_PROJECT_ID, VITE_TRIP_ID, VITE_TEST_EMAIL, VITE_TEST_PASSWORD')
  process.exit(1)
}

// Resolve service account credential
let credential
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credential = cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
} else {
  console.error('No Firebase Admin credential found. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT.')
  process.exit(1)
}

initializeApp({ credential, projectId: PROJECT_ID })
const adminAuth = getAuth()
const db        = getFirestore()

async function run() {
  // Create or update the user in Firebase Auth
  let uid
  try {
    const existing = await adminAuth.getUserByEmail(TEST_EMAIL)
    await adminAuth.updateUser(existing.uid, { password: TEST_PASS })
    uid = existing.uid
    console.log(`Updated existing user: ${TEST_EMAIL} (uid: ${uid})`)
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const created = await adminAuth.createUser({ email: TEST_EMAIL, password: TEST_PASS })
      uid = created.uid
      console.log(`Created new user: ${TEST_EMAIL} (uid: ${uid})`)
    } else {
      throw err
    }
  }

  // Add to allowed_users so the access check passes
  const userRef = db.doc(`trips/${TRIP_ID}/allowed_users/${TEST_EMAIL}`)
  const snap    = await userRef.get()
  if (!snap.exists) {
    await userRef.set({ email: TEST_EMAIL, addedAt: FieldValue.serverTimestamp(), addedBy: 'create-test-user script' })
    console.log(`Added ${TEST_EMAIL} to allowed_users for trip "${TRIP_ID}"`)
  } else {
    console.log(`${TEST_EMAIL} already in allowed_users — skipped`)
  }

  console.log('\nDone. You can now log in with:')
  console.log(`  Email:    ${TEST_EMAIL}`)
  console.log(`  Password: ${TEST_PASS}`)
}

run().catch(err => { console.error(err); process.exit(1) })
