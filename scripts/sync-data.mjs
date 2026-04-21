#!/usr/bin/env node
// scripts/sync-data.mjs — Sincroniza todos los JSONs de src/data/ ↔ Firestore
// Uso: npm run sync:status | sync:upload | sync:download

import { initializeApp, cert }         from 'firebase-admin/app'
import { getFirestore, FieldValue }    from 'firebase-admin/firestore'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs'
import { resolve, basename, extname }  from 'path'

const ROOT      = resolve(import.meta.dirname, '..')
const DATA_ROOT = resolve(ROOT, 'src/data')

// Cargar .env y luego .env.local (este último sobrescribe)
for (const envFile of ['.env', '.env.local']) {
  try {
    const raw = readFileSync(resolve(ROOT, envFile), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] = m[2].trim()
    }
  } catch { /* archivo opcional */ }
}

const PROJECT_ID      = process.env.VITE_FIREBASE_PROJECT_ID
const GATEWAY_TRIP_ID = process.env.VITE_TRIP_ID
const SAVED_BY        = process.env.VITE_ADMIN_EMAIL ?? 'script'
const mode            = process.argv.find(a => a.startsWith('--')) ?? '--status'

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
function registryRef()       { return db.doc(`trips/${GATEWAY_TRIP_ID}/registry/main`) }

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

// Devuelve lista de { tripId, filePath } para trips en el registry de Firestore
// que no tienen archivo local. Solo usa el registry — nunca lista la colección entera
// para evitar descargar trips borrados intencionalmente.
async function findCloudOnlyTrips() {
  const regSnap = await registryRef().get()
  if (!regSnap.exists) return []

  const missing = []
  const folders = regSnap.data().folders ?? []
  for (const folder of folders) {
    const folderDir = resolve(DATA_ROOT, folder.id)
    for (const trip of (folder.trips ?? [])) {
      if (trip.id === GATEWAY_TRIP_ID) continue  // gateway trip no es un archivo local
      const filePath = resolve(folderDir, `${trip.id}.json`)
      if (!existsSync(filePath)) missing.push({ tripId: trip.id, filePath })
    }
  }
  return missing
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

// Bidireccional: siempre gana la versión más nueva
async function syncNewest(filePath) {
  const tripId = tripIdFromPath(filePath)
  const local  = readLocal(filePath)
  const remote = await getRemote(tripId)
  const rv     = remote?.version ?? -1
  const lv     = local.version

  if (rv === lv) {
    console.log(`  ✅  ${shortPath(filePath)}  v${lv} — en sync`)
    return
  }

  if (lv > rv) {
    await itinRef(tripId).set(local)
    await saveSnapshot(tripId, local, 'local_push')
    console.log(`  ⬆️  ${shortPath(filePath)}  local v${lv} > cloud v${rv} → subido ✅`)
  } else {
    writeFileSync(filePath, JSON.stringify(remote, null, 2) + '\n', 'utf8')
    console.log(`  ⬇️  ${shortPath(filePath)}  cloud v${rv} > local v${lv} → bajado ✅`)
  }
}

// ── Push registry local → Firestore ──────────────────────────────────
async function pushRegistry() {
  const raw     = readFileSync(resolve(ROOT, 'src/data/trips-registry.js'), 'utf8')
  const match   = raw.match(/export const tripsRegistry = (\[[\s\S]*\])/)
  if (!match) { console.error('❌  No se pudo parsear trips-registry.js'); process.exit(1) }
  const folders = JSON.parse(match[1])
  const total   = folders.flatMap(f => f.trips).length
  await registryRef().set({ folders })
  console.log(`\n📋  Registry subido a Firestore (${total} trips) ✅\n`)
}

// ── Pull registry Firestore → local ──────────────────────────────────
async function pullRegistry() {
  const snap = await registryRef().get()
  if (!snap.exists) {
    console.error('❌  No existe registry en Firestore')
    process.exit(1)
  }
  const { folders } = snap.data()
  const total  = folders.flatMap(f => f.trips).length
  const js     = `export const tripsRegistry = ${JSON.stringify(folders, null, 2)}\n`
  writeFileSync(resolve(ROOT, 'src/data/trips-registry.js'), js, 'utf8')
  console.log(`\n📋  Registry bajado de Firestore (${total} trips) → src/data/trips-registry.js ✅\n`)
}

// ── Main ──────────────────────────────────────────────────────────────
if (mode === '--pull-registry') {
  await pullRegistry()
  process.exit(0)
}
if (mode === '--push-registry') {
  await pushRegistry()
  process.exit(0)
}

const handlers = {
  '--status':   syncStatus,
  '--upload':   syncUpload,
  '--download': syncDownload,
  '--sync':     syncNewest,
}

const fn = handlers[mode]
if (!fn) {
  console.error(`❌  Modo inválido: "${mode}". Usá --status | --upload | --download | --sync | --pull-registry`)
  process.exit(1)
}

// Descubrir trips en cloud que no existen localmente
const cloudOnly = await findCloudOnlyTrips()
if (cloudOnly.length > 0) {
  if (mode === '--status') {
    console.log(`\n☁️   ${cloudOnly.length} trip(s) en cloud sin archivo local:\n`)
    for (const { tripId } of cloudOnly) {
      console.log(`  🆕  ${tripId}  (usá sync:download o sync para bajarlo)`)
    }
  } else if (mode !== '--upload') {
    console.log(`\n☁️   ${cloudOnly.length} trip(s) nuevo(s) encontrado(s) en cloud:\n`)
    for (const { tripId, filePath } of cloudOnly) {
      const remote = await getRemote(tripId)
      if (!remote) {
        console.log(`  ⚠️  ${tripId}  sin datos en cloud — omitido`)
        continue
      }
      mkdirSync(resolve(filePath, '..'), { recursive: true })
      writeFileSync(filePath, JSON.stringify(remote, null, 2) + '\n', 'utf8')
      console.log(`  ⬇️  ${shortPath(filePath)}  cloud v${remote.version} → creado localmente ✅`)
    }
  }
}

const files = findTripFiles(DATA_ROOT)
if (files.length === 0) {
  console.error(`❌  No se encontraron archivos JSON en ${shortPath(DATA_ROOT)}`)
  process.exit(1)
}

console.log(`\n🗂️  ${files.length} archivo(s) locales en ${shortPath(DATA_ROOT)}/\n`)
for (const file of files) {
  await fn(file)
}
console.log()
