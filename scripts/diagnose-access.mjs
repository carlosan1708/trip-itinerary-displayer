#!/usr/bin/env node
// scripts/diagnose-access.mjs — Print enough Firestore + Auth state to
// figure out why a user is seeing "restricted access" when trying to view
// another user's trips.
//
// Checks:
//   1) Admin claim on the configured ADMIN_EMAIL account.
//   2) The list of emails in trips/<gateway>/allowed_users.
//   3) The list of trip docs under trips/ that have a /data/itinerary doc.
//   4) For each non-gateway trip, who's in its allowed_users.
//
// Usage: node scripts/diagnose-access.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../')
for (const envFile of ['.env']) {
  try {
    const raw = readFileSync(resolve(ROOT, envFile), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] = m[2].trim()
    }
  } catch { /* optional */ }
}

const PROJECT_ID  = process.env.VITE_FIREBASE_PROJECT_ID
const GATEWAY     = process.env.VITE_TRIP_ID
const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL
const CRED_PATH   = process.env.GOOGLE_APPLICATION_CREDENTIALS

initializeApp({ credential: cert(CRED_PATH), projectId: PROJECT_ID })
const db   = getFirestore()
const auth = getAuth()

console.log(`\nProject:       ${PROJECT_ID}`)
console.log(`Gateway trip:  ${GATEWAY}`)
console.log(`Admin email:   ${ADMIN_EMAIL}\n`)

// 1. Admin claim
try {
  const user = await auth.getUserByEmail(ADMIN_EMAIL)
  console.log(`[1] Admin user found: ${user.email} (uid: ${user.uid})`)
  console.log(`    Custom claims: ${JSON.stringify(user.customClaims || {})}`)
} catch (err) {
  console.log(`[1] Admin user '${ADMIN_EMAIL}' NOT FOUND in Firebase Auth: ${err.code}`)
  // Try the same email with the dot removed (gmail normalizes)
  const noDot = ADMIN_EMAIL.replace(/\.(?=[^@]*@)/, '')
  if (noDot !== ADMIN_EMAIL) {
    try {
      const alt = await auth.getUserByEmail(noDot)
      console.log(`    But '${noDot}' DOES exist (uid: ${alt.uid}, claims: ${JSON.stringify(alt.customClaims || {})})`)
      console.log(`    → MISMATCH: env has the dot, Firebase has it without. Update VITE_ADMIN_EMAIL + backend ADMIN_EMAIL.`)
    } catch { /* nothing */ }
  }
}

// 2. Gateway allowed_users
const allowedSnap = await db.collection(`trips/${GATEWAY}/allowed_users`).get()
console.log(`\n[2] Emails in trips/${GATEWAY}/allowed_users (${allowedSnap.size}):`)
allowedSnap.docs.forEach(d => console.log(`    - ${d.id}`))

// 3. All trip ids with data
const trips = await db.collection('trips').listDocuments()
console.log(`\n[3] All trip IDs under trips/ (${trips.length}):`)
for (const tref of trips) {
  const data = await db.doc(`${tref.path}/data/itinerary`).get()
  const author = data.exists ? (data.data().author || '?') : '(no /data/itinerary)'
  console.log(`    - ${tref.id}   author: ${author}`)
}

// 4. Per-trip allowed_users summary
console.log(`\n[4] Per-trip allowed_users:`)
for (const tref of trips) {
  if (tref.id === GATEWAY) continue
  const users = await tref.collection('allowed_users').get()
  console.log(`    trips/${tref.id}/allowed_users:  ${users.docs.map(d => d.id).join(', ') || '(none)'}`)
}

console.log('')
