const tripModules = import.meta.glob('../data/**/*.json')

const REGISTRY_KEY  = 'trips-registry'
const FAVORITES_KEY = 'trip-favorites'
const DATA_PREFIX   = 'trip-data-'

export function getRegistry() {
  const s = localStorage.getItem(REGISTRY_KEY)
  return s ? JSON.parse(s) : []
}

export function saveRegistry(registry) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))
}

export function getFavorites() {
  const s = localStorage.getItem(FAVORITES_KEY)
  return s ? JSON.parse(s) : []
}

export function saveFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs))
}

export function getTripData(tripId) {
  const s = localStorage.getItem(DATA_PREFIX + tripId)
  return s ? JSON.parse(s) : null
}

export function saveTripData(tripId, data) {
  localStorage.setItem(DATA_PREFIX + tripId, JSON.stringify(data))
}

export function deleteTripData(tripId) {
  localStorage.removeItem(DATA_PREFIX + tripId)
}

export async function findTripData(tripId) {
  const cached = getTripData(tripId)
  if (cached) return cached
  const key = Object.keys(tripModules).find(k => k.endsWith(`/${tripId}.json`))
  if (!key) return null
  const mod = await tripModules[key]()
  return mod.default ?? null
}

export function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
