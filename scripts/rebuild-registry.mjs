#!/usr/bin/env node
// scripts/rebuild-registry.mjs — Scan all trips/<id>/data/itinerary docs and
// rebuild trips/<gateway>/registry/main from them. Use when the gateway
// registry has been wiped but the actual trip data is still in Firestore.
//
// Grouping heuristic: split the trip id on the first '-' (e.g. "canada-foo"
// → folder "canada"). Falls back to a "my-trips" folder for ids with no '-'.
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

const FOLDER_LABELS = {
  canada:   { label: 'Canadá',   emoji: '🍁' },
  'my-trips': { label: 'My Trips', emoji: '✈️' },
  trip:     { label: 'Other',    emoji: '📁' },
}

function folderIdFor(tripId) {
  if (tripId === GATEWAY) return null   // gateway itself isn't a trip card
  if (tripId.startsWith('canada-')) return 'canada'
  if (tripId.startsWith('my-trips-')) return 'my-trips'
  return 'trip'
}

const ALWAYS_HIDDEN_IDS = new Set(['canada-trip-2', 'canada-trip-3', 'canada-2026'])

async function run() {
  const tripRefs = await db.collection('trips').listDocuments()
  const folders = {}

  for (const tref of tripRefs) {
    const fid = folderIdFor(tref.id)
    if (!fid) continue

    const itinRef = db.doc(`${tref.path}/data/itinerary`)
    const snap = await itinRef.get()
    if (!snap.exists) continue

    const data   = snap.data()
    const label  = data.label  || data.title    || tref.id
    const subtitle = data.subtitle || ''
    const dates  = data.dates  || data.subtitle || ''
    const duration = data.duration || (Array.isArray(data.parts) ? `${data.parts.reduce((n, p) => n + (p.days?.length || 0), 0)} days` : '')
    const author = data.author || null

    if (!folders[fid]) {
      folders[fid] = {
        id: fid,
        label: FOLDER_LABELS[fid]?.label || fid,
        emoji: FOLDER_LABELS[fid]?.emoji || '📁',
        trips: [],
      }
    }

    // viewers: explicit owner-only by default. Empty array means "private to
    // author"; canSeeTrip in the dashboard treats `undefined` as legacy open
    // and shows it to everyone — that's exactly what we want to avoid here.
    // Admin always sees everything via isAdmin check anyway.
    folders[fid].trips.push({
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

  const orderedFolders = ['canada', 'my-trips', 'trip']
    .filter(k => folders[k])
    .map(k => folders[k])

  console.log(`\nRebuilt registry — ${orderedFolders.length} folder(s):`)
  for (const f of orderedFolders) {
    console.log(`  ${f.emoji} ${f.label}  (${f.trips.length} trip${f.trips.length === 1 ? '' : 's'})`)
    f.trips.forEach(t => console.log(`     - ${t.label}  [${t.id}]`))
  }

  await db.doc(`trips/${GATEWAY}/registry/main`).set({ folders: orderedFolders })
  console.log(`\nWrote trips/${GATEWAY}/registry/main ✅\n`)
}

run().catch(err => { console.error(err); process.exit(1) })
