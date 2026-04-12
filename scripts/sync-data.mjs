#!/usr/bin/env node
// scripts/sync-data.mjs — Sincroniza todos los JSONs de src/data/ ↔ Firestore
// Uso: npm run sync:status | sync:upload | sync:download

import { initializeApp, cert }         from 'firebase-admin/app'
import { getFirestore, FieldValue }    from 'firebase-admin/firestore'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, basename, extname }  from 'path'

const ROOT      = resolve(import.meta.dirname, '..')
const DATA_ROOT = resolve(ROOT, 'src/data')

// Cargar .env.local si existe (sobrescribe .env)
try {
  const localEnv = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
  for (const line of localEnv.split('\n')) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
} catch { /* .env.local es opcional */ }

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID
const SAVED_BY   = process.env.VITE_ADMIN_EMAIL ?? 'script'
const mode       = process.argv.find(a => a.startsWith('--')) ?? '--status'

// ── Validaciones iniciales ────────────────────────────────────────────
if (!PROJECT_ID) {
  console.error('❌  Falta VITE_FIREBASE_PROJECT_ID en .env')
  process.exit(1)
}

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
const saJson = process.env.FIREBASE_SERVICE_ACCOUNT

if (!saPath && !saJson) {
  console.error('❌  Credenciales de servicio no configuradas.')
  console.error('    Opción A: GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json')
  console.error('    Opción B: FIREBASE_SERVICE_ACCOUNT=<json-en-una-linea>')
  process.exit(1)
}

// ── Firebase Admin Init ───────────────────────────────────────────────
const credential = saPath
  ? cert(JSON.parse(readFileSync(saPath, 'utf8')))
  : cert(JSON.parse(saJson))

initializeApp({ credential, projectId: PROJECT_ID })
const db = getFirestore()

// ── Descubrir todos los JSONs bajo src/data/ ─────────────────────────
function findTripFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...findTripFiles(full))
    } else if (extname(entry) === '.json') {
      results.push(full)
    }
  }
  return results
}

function tripIdFromPath(filePath) {
  return basename(filePath, '.json')
}

function shortPath(p) {
  return p.replace(ROOT + '/', '')
}

// ── Firestore helpers ─────────────────────────────────────────────────
function itinRef(tripId)     { return db.doc(`trips/${tripId}/data/itinerary`) }
function versionsRef(tripId) { return db.collection(`trips/${tripId}/versions`) }

function readLocal(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    console.error(`❌  No se pudo leer: ${filePath}`)
    process.exit(1)
  }
}

async function getRemote(tripId) {
  const snap = await itinRef(tripId).get()
  return snap.exists ? snap.data() : null
}

async function saveSnapshot(tripId, data, source) {
  await versionsRef(tripId).add({
    version: data.version ?? 0,
    savedAt: FieldValue.serverTimestamp(),
    savedBy: SAVED_BY,
    source,
    data,
  })
}

// ── Lógica por viaje ─────────────────────────────────────────────────
async function syncStatus(filePath) {
  const tripId = tripIdFromPath(filePath)
  const local  = readLocal(filePath)
  const remote = await getRemote(tripId)
  const rv     = remote?.version

  const arrow =
    rv == null          ? '⚠️  cloud vacío'
    : local.version > rv ? '⬆️  local más nuevo'
    : local.version < rv ? '⬇️  cloud más nuevo'
    :                       '✅  en sync'

  console.log(`  ${arrow.padEnd(22)}  ${shortPath(filePath)}  (local v${local.version} / cloud ${rv ?? '—'})`)
}

async function syncUpload(filePath) {
  const tripId = tripIdFromPath(filePath)
  const local  = readLocal(filePath)
  const remote = await getRemote(tripId)
  const rv     = remote?.version ?? -1

  if (remote !== null && local.version <= rv) {
    console.log(`  ⏭️  ${shortPath(filePath)}  local v${local.version} ≤ cloud v${rv} — sin cambios`)
    return
  }

  await itinRef(tripId).set(local)
  await saveSnapshot(tripId, local, 'local_push')
  console.log(`  ⬆️  ${shortPath(filePath)}  v${local.version} → cloud ✅`)
}

async function syncDownload(filePath) {
  const tripId = tripIdFromPath(filePath)
  const remote = await getRemote(tripId)

  if (!remote) {
    console.log(`  ⚠️  ${shortPath(filePath)}  cloud vacío — nada que descargar`)
    return
  }

  const local = readLocal(filePath)
  const rv    = remote.version

  if (rv <= local.version) {
    console.log(`  ⏭️  ${shortPath(filePath)}  cloud v${rv} ≤ local v${local.version} — sin cambios`)
    return
  }

  writeFileSync(filePath, JSON.stringify(remote, null, 2) + '\n', 'utf8')
  console.log(`  ⬇️  ${shortPath(filePath)}  cloud v${rv} → local ✅`)
}

// ── Main ──────────────────────────────────────────────────────────────
const handlers = {
  '--status':   syncStatus,
  '--upload':   syncUpload,
  '--download': syncDownload,
}

const fn = handlers[mode]
if (!fn) {
  console.error(`❌  Modo inválido: "${mode}". Usá --status | --upload | --download`)
  process.exit(1)
}

const files = findTripFiles(DATA_ROOT)
if (files.length === 0) {
  console.error(`❌  No se encontraron archivos JSON en ${shortPath(DATA_ROOT)}`)
  process.exit(1)
}

console.log(`\n🗂️  Encontrados ${files.length} archivos en ${shortPath(DATA_ROOT)}/\n`)
for (const file of files) {
  await fn(file)
}
console.log()
