#!/usr/bin/env node
// scripts/migrate-registry-to-flat.mjs — One-shot migration that converts
// trips/<gateway>/registry/main from { folders: [{trips:[...]}] } to the
// new flat shape { trips: [...] }. After the dashboard refactor (My Trips
// / All Trips computed by role) there are no real folders to store.
//
// Idempotent: if already flat, no-op.
//
// Usage: node scripts/migrate-registry-to-flat.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../')
try {
  const raw = readFileSync(resolve(ROOT, '.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
} catch {}

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID
const GATEWAY    = process.env.VITE_TRIP_ID
const CRED_PATH  = process.env.GOOGLE_APPLICATION_CREDENTIALS

initializeApp({ credential: cert(CRED_PATH), projectId: PROJECT_ID })
const db = getFirestore()

const ref  = db.doc(`trips/${GATEWAY}/registry/main`)
const snap = await ref.get()

if (!snap.exists) {
  console.log('No registry doc — nothing to migrate.')
  process.exit(0)
}

const data = snap.data()
if (Array.isArray(data.trips) && !data.folders) {
  console.log(`Already flat: ${data.trips.length} trip(s). No change.`)
  process.exit(0)
}

const folders = Array.isArray(data.folders) ? data.folders : []
const trips = folders.flatMap(f => f.trips || [])

await ref.set({ trips })
console.log(`Migrated: ${folders.length} folder(s) → ${trips.length} flat trip(s).`)
