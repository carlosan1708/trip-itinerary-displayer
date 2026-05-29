#!/usr/bin/env node
// scripts/wipe-canada-folder.mjs — One-shot cleanup: removes the legacy
// "Canadá" folder (id: 'canada') from the gateway Firestore registry.
// Only touches the folder entry; preserves any other folders the user has
// added. Trip data documents (trips/<id>/data/itinerary) are left alone —
// they're harmless once not referenced from the registry.
//
// Usage:  node scripts/wipe-canada-folder.mjs
// Reads:  GOOGLE_APPLICATION_CREDENTIALS, VITE_FIREBASE_PROJECT_ID, VITE_TRIP_ID
// Effect: trips/<VITE_TRIP_ID>/registry/main folders array → filters out id='canada'

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../')

// Load .env into process.env
for (const envFile of ['.env']) {
  try {
    const raw = readFileSync(resolve(ROOT, envFile), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] = m[2].trim()
    }
  } catch { /* optional */ }
}

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID
const TRIP_ID    = process.env.VITE_TRIP_ID
const CRED_PATH  = process.env.GOOGLE_APPLICATION_CREDENTIALS

if (!PROJECT_ID || !TRIP_ID) {
  console.error('Missing VITE_FIREBASE_PROJECT_ID or VITE_TRIP_ID in .env')
  process.exit(1)
}
if (!CRED_PATH) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS not set in .env')
  process.exit(1)
}

initializeApp({ credential: cert(CRED_PATH), projectId: PROJECT_ID })
const db = getFirestore()

async function run() {
  const ref  = db.doc(`trips/${TRIP_ID}/registry/main`)
  const snap = await ref.get()
  if (!snap.exists) {
    console.log(`No registry at trips/${TRIP_ID}/registry/main — nothing to do.`)
    return
  }

  const folders = snap.data().folders || []
  const filtered = folders.filter(f => f.id !== 'canada')

  if (folders.length === filtered.length) {
    console.log(`No 'canada' folder found in registry — nothing to remove (${folders.length} folders remain).`)
    return
  }

  await ref.set({ folders: filtered }, { merge: true })
  console.log(`Removed 'canada' folder. Registry now has ${filtered.length} folder(s) (was ${folders.length}).`)
}

run().catch(err => { console.error(err); process.exit(1) })
