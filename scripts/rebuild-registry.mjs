#!/usr/bin/env node
// scripts/rebuild-registry.mjs — Scan all trips/<id>/data/itinerary docs and
// rebuild the flat trips/<gateway>/registry/main { trips: [...] } from them.
// Use when the gateway registry has been wiped but the actual trip data is
// still in Firestore. Each rebuilt trip gets viewers: [author] so it stays
// private to its author (admins see everything anyway). The gateway trip
// itself is skipped.
//
// Usage: node scripts/rebuild-registry.mjs

import { initializeApp, cert } from 'firebase-admin/app'
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

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID
const GATEWAY    = process.env.VITE_TRIP_ID
const CRED_PATH  = process.env.GOOGLE_APPLICATION_CREDENTIALS

initializeApp({ credential: cert(CRED_PATH), projectId: PROJECT_ID })
const db = getFirestore()

const ALWAYS_HIDDEN_IDS = new Set(['canada-trip-2', 'canada-trip-3', 'canada-2026'])

async function run() {
  const tripRefs = await db.collection('trips').listDocuments()
  const trips = []

  for (const tref of tripRefs) {
    if (tref.id === GATEWAY) continue
    const snap = await db.doc(`${tref.path}/data/itinerary`).get()
    if (!snap.exists) continue

    const data   = snap.data()
    const label  = data.label    || data.title    || tref.id
    const subtitle = data.subtitle || ''
    const dates  = data.dates    || data.subtitle || ''
    const duration = data.duration || (Array.isArray(data.parts) ? `${data.parts.reduce((n, p) => n + (p.days?.length || 0), 0)} days` : '')
    const author = data.author || null

    // viewers: explicit owner-only by default. canSeeTrip treats undefined
    // as legacy open and shows it to everyone — avoided here. Admin always
    // sees everything via the isAdmin check anyway.
    trips.push({
      id: tref.id,
      label,
      subtitle,
      dates,
      duration,
      author,
      viewers: author ? [author] : [],
      ...(ALWAYS_HIDDEN_IDS.has(tref.id) ? { hidden: true } : {}),
    })
  }

  console.log(`\nRebuilt registry — ${trips.length} trip(s):`)
  trips.forEach(t => console.log(`  - ${t.label}  [${t.id}]  author: ${t.author || '?'}`))

  await db.doc(`trips/${GATEWAY}/registry/main`).set({ trips })
  console.log(`\nWrote trips/${GATEWAY}/registry/main ✅\n`)
}

run().catch(err => { console.error(err); process.exit(1) })
