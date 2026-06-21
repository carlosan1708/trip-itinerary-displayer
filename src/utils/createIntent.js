// Client-side detection + parameter extraction for "create a new trip"
// requests typed into the assistant chat when no itinerary is loaded.
//
// When matched, the agent runs the real generator (/agent/create) and shows a
// full preview behind a Save/Discard bar — instead of answering with prose.

const CREATE_MARKERS = [
  // English
  'create', 'plan', 'build', 'make', 'generate', 'design',
  'trip to', 'itinerary', 'days in', 'day trip', 'weekend in', 'vacation', 'holiday',
  // Spanish
  'crea', 'crear', 'planifica', 'planea', 'planear', 'arma', 'armar', 'genera',
  'haz un', 'itinerario', 'viaje a', 'viaje de', 'días en', 'escapada', 'vacaciones',
]

// Words that signal an *edit/question* on an existing trip — if no itinerary is
// loaded these don't apply, but we still avoid false positives on bare verbs.
const TRIP_NOUNS = ['trip', 'itinerary', 'viaje', 'itinerario', 'escapada', 'vacation', 'holiday', 'vacaciones', 'getaway', 'tour']

/**
 * True when the message reads as a request to build a brand-new itinerary.
 * Requires a create verb/marker AND some trip noun or a "<n> day(s)" pattern,
 * so plain questions ("what to do in Bath?") don't trigger generation.
 */
export function detectCreateIntent(message) {
  if (!message) return false
  const lower = message.toLowerCase()
  const hasMarker = CREATE_MARKERS.some(m => lower.includes(m))
  if (!hasMarker) return false
  const hasTripNoun = TRIP_NOUNS.some(n => lower.includes(n))
  const hasDayCount = /\b\d+\s*(day|days|día|días|dia|dias)\b/.test(lower)
  return hasTripNoun || hasDayCount
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'in', 'on', 'at', 'of', 'for', 'and', 'random', 'please',
  'me', 'my', 'us', 'some', 'somewhere', 'anywhere', 'place',
  'solo', 'alone', 'couple', 'honeymoon', 'family', 'friends', 'people', 'travelers', 'traveller', 'travellers',
  'pareja', 'solos', 'familia', 'amigos', 'personas', 'viajeros',
  'create', 'plan', 'build', 'make', 'generate', 'design', 'trip', 'day', 'days',
  'itinerary', 'weekend', 'vacation', 'holiday', 'getaway', 'tour',
  'crea', 'crear', 'un', 'una', 'el', 'la', 'de', 'en', 'para', 'por', 'aleatorio',
  'planifica', 'planea', 'arma', 'genera', 'haz', 'hazme', 'viaje', 'día', 'días', 'dia', 'dias',
  'itinerario', 'escapada', 'vacaciones', 'lugar', 'algún', 'algun',
])

/**
 * Best-effort extraction of generator params from a free-text create request.
 * Always returns a complete, backend-valid CreateRequest-shaped object using
 * sensible defaults for anything the user didn't specify.
 *
 *   "create a random 2 day trip in England"
 *     → { destination: 'England', num_days: 2, dates: '', travelers: 2,
 *         interests: [], budget: 'mid', pace: 'moderate', language }
 */
export function parseCreateRequest(message, language = 'en') {
  const text = String(message || '')

  // Day count: "2 day", "5-day", "for 3 days", "3 días"
  const dayMatch = text.match(/(\d+)\s*[- ]?\s*(day|days|día|días|dia|dias)\b/i)
  const numDays = dayMatch ? clamp(parseInt(dayMatch[1], 10), 1, 60) : 3

  // Traveler count: "for 2 people", "2 travelers", "pareja", "solo"
  let travelers = 2
  const travMatch = text.match(/(\d+)\s*(people|travel|adult|persona|viajero|adulto)/i)
  if (travMatch) travelers = clamp(parseInt(travMatch[1], 10), 1, 20)
  else if (/\b(solo|alone|sólo)\b/i.test(text)) travelers = 1
  else if (/\b(couple|pareja|honeymoon|luna de miel)\b/i.test(text)) travelers = 2

  const destination = extractDestination(text) || (language === 'es' ? 'destino sorpresa' : 'a surprise destination')

  return {
    destination,
    dates: '',
    num_days: numDays,
    travelers,
    interests: [],
    budget: 'mid',
    pace: 'moderate',
    language: /^[a-z]{2}$/.test(language) ? language : 'en',
  }
}

// Pull the place name out: prefer text after a location preposition, else the
// leftover words once stopwords and day phrases are removed.
function extractDestination(text) {
  const prep = text.match(/\b(?:in|to|on|at|of|for|into|around|across|through|en|a|al|para|por|hacia|sobre)\s+([A-Za-zÀ-ÿ'’.\- ]+?)(?:\s+(?:for|with|over|during|por|con|durante)\b.*)?$/i)
  if (prep && prep[1]) {
    const cleaned = cleanPlace(prep[1])
    if (cleaned) return cleaned
  }
  // Fallback: drop day phrases + stopwords, keep the rest.
  const withoutDays = text.replace(/\b\d+\s*[- ]?\s*(day|days|día|días|dia|dias)\b/gi, ' ')
  return cleanPlace(withoutDays)
}

function cleanPlace(s) {
  const words = s
    .replace(/[^A-Za-zÀ-ÿ'’.\- ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !STOPWORDS.has(w.toLowerCase()))
  return words.join(' ').trim()
}

function clamp(n, lo, hi) {
  if (Number.isNaN(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}
