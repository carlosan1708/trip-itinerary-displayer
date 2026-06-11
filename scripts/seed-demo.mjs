#!/usr/bin/env node
// scripts/seed-demo.mjs — Seed the isolated demo namespace: one read-only
// sample itinerary plus the demo gateway registry. Demo (anonymous) visitors
// read this; their own trips are written under demo-{uid}-* ids and never
// touch the real VITE_TRIP_ID data.
//
// Usage: node scripts/seed-demo.mjs

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
} catch { /* optional */ }

const PROJECT_ID   = process.env.VITE_FIREBASE_PROJECT_ID
const DEMO_GATEWAY = process.env.VITE_DEMO_TRIP_ID || process.env.DEMO_TRIP_ID || 'demo-gateway'
const CRED_PATH    = process.env.GOOGLE_APPLICATION_CREDENTIALS

if (!PROJECT_ID || !CRED_PATH) {
  console.error('Missing VITE_FIREBASE_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS in .env')
  process.exit(1)
}

initializeApp({ credential: cert(CRED_PATH), projectId: PROJECT_ID })
const db = getFirestore()

const SAMPLE_TRIP_ID = 'demo-sample'
const SAMPLE = {
  version: 1,
  author: 'demo-sample',          // not a real owner; demo users can only read it
  title: 'Sample Trip — Kyoto',
  label: 'Kyoto in 3 Days',
  subtitle: 'A taste of what you can build',
  stats: ['3 days', '1 city', 'Spring'],
  parts: [
    {
      id: 1,
      emoji: '⛩️',
      title: 'Eastern Kyoto',
      color: '#0277BD',
      daysRange: 'Days 1 – 3',
      days: [
        {
          dayNumber: 1,
          date: 'Day 1',
          location: 'Higashiyama',
          subtitle: 'Temples & old streets',
          logistics: [{ type: 'stay', label: 'Hotel', value: 'Gion ryokan' }],
          activities: ['Kiyomizu-dera at opening', 'Walk Sannenzaka & Ninenzaka', 'Yasaka Shrine at dusk'],
          tips: ['Go early to beat the crowds'],
          warnings: [],
          links: [],
          images: [],
        },
        {
          dayNumber: 2,
          date: 'Day 2',
          location: 'Arashiyama',
          subtitle: 'Bamboo & river',
          logistics: [{ type: 'train', label: 'JR', value: 'Kyoto → Saga-Arashiyama' }],
          activities: ['Bamboo Grove', 'Tenryu-ji garden', 'Boat on the Hozugawa'],
          tips: [],
          warnings: [],
          links: [],
          images: [],
        },
        {
          dayNumber: 3,
          date: 'Day 3',
          location: 'Fushimi',
          subtitle: 'Thousand torii',
          logistics: [],
          activities: ['Fushimi Inari hike', 'Sake district tasting'],
          tips: ['Hike past the first viewpoint — crowds thin out'],
          warnings: [],
          links: [],
          images: [],
        },
      ],
    },
  ],
}

const REGISTRY_ENTRY = {
  id: SAMPLE_TRIP_ID,
  label: SAMPLE.label,
  subtitle: SAMPLE.subtitle,
  dates: SAMPLE.subtitle,
  duration: SAMPLE.stats[0],
  author: 'demo-sample',
  // No `viewers` field → treated as open so every demo user sees it.
}

async function run() {
  await db.doc(`trips/${SAMPLE_TRIP_ID}/data/itinerary`).set(SAMPLE)
  await db.doc(`trips/${DEMO_GATEWAY}/registry/main`).set({ trips: [REGISTRY_ENTRY] })
  console.log(`Seeded demo sample trip "${SAMPLE_TRIP_ID}" and registry under "${DEMO_GATEWAY}".`)
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
