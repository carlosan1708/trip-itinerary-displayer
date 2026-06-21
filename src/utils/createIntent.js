// Client-side detection + parameter extraction for "create a new trip"
// requests typed into the assistant chat when no itinerary is loaded.
//
// When matched, the agent runs the real generator (/agent/create) and shows a
// full preview behind a Save/Discard bar — instead of answering with prose.

// Phrase markers that strongly imply "build a trip" on their own. Bare create
// verbs (make/plan/build/…) are intentionally NOT here — they're handled by the
// CREATE_VERBS path below, which requires a place and filters edit fillers.
const CREATE_MARKERS = [
  // English
  'trip to', 'itinerary', 'days in', 'day trip', 'weekend in', 'getaway to',
  // Spanish
  'itinerario', 'viaje a', 'viaje de', 'días en', 'escapada a',
]

const TRIP_NOUNS = ['trip', 'itinerary', 'viaje', 'itinerario', 'escapada', 'vacation', 'holiday', 'vacaciones', 'getaway', 'tour']

// Pure-question / informational openers. When a message clearly reads as a
// question (and has no create verb), we keep it on the chat/QA path instead of
// generating a trip.
const QUESTION_OPENERS = [
  'what', 'whats', "what's", 'how', 'when', 'where', 'why', 'which', 'who',
  'is ', 'are ', 'do ', 'does ', 'can ', 'should ', 'tell me', 'explain',
  'qué', 'que ', 'cómo', 'como ', 'cuándo', 'cuando', 'dónde', 'donde',
  'por qué', 'porque', 'cuál', 'cual', 'cuánto', 'cuanto',
]

/**
 * True when the message reads as a request to build a brand-new itinerary.
 *
 * This runs ONLY when no itinerary is loaded (dashboard), where "make me a
 * trip" is the dominant intent — so we're permissive: a create verb, a trip
 * noun, OR a day-count phrase all qualify. We only bail out for messages that
 * clearly read as a standalone question with no create signal.
 */
// Strong create verbs: only count as a create signal when paired with a place
// or trip/day signal — "make"/"plan" alone ("make it shorter") shouldn't fire.
const CREATE_VERBS = ['create', 'plan', 'build', 'generate', 'design', 'make',
  'crea', 'crear', 'planifica', 'planea', 'planear', 'arma', 'armar', 'genera', 'haz']

export function detectCreateIntent(message) {
  if (!message) return false
  const lower = message.toLowerCase().trim()
  if (!lower) return false

  // A clear question is never a create request, regardless of other signals.
  const isQuestion = lower.endsWith('?') || QUESTION_OPENERS.some(q => lower.startsWith(q))
  if (isQuestion) return false

  const hasMarker   = CREATE_MARKERS.some(m => lower.includes(m))
  const hasTripNoun = TRIP_NOUNS.some(n => lower.includes(n))
  const hasDayCount = /\b\d+\s*(day|days|día|días|dia|dias|noche|noches|night|nights)\b/.test(lower)
  const hasVerb     = CREATE_VERBS.some(v => new RegExp(`\\b${v}\\b`).test(lower))

  // Trip noun or a day/night count is a create signal on the dashboard.
  if (hasTripNoun || hasDayCount) return true

  // A marker phrase like "trip to" / "weekend in" / "viaje a" is enough.
  if (hasMarker) return true

  // A bare create verb needs a place to act on — at least one remaining word
  // that isn't the verb, a stopword, or an edit-target filler (so "plan japan"
  // → place "japan" fires, but "make it shorter" does not).
  if (hasVerb) {
    const rest = lower.replace(new RegExp(`\\b(${CREATE_VERBS.join('|')})\\b`, 'g'), ' ')
    const words = rest.split(/\s+/).filter(w => w && !STOPWORDS.has(w) && !EDIT_FILLER.has(w))
    return words.length > 0
  }

  return false
}

// Words that are edit/modify targets, not destinations — block a bare create
// verb from firing on commands like "make it shorter / longer / better".
const EDIT_FILLER = new Set([
  'it', 'this', 'that', 'shorter', 'longer', 'better', 'cheaper', 'bigger',
  'smaller', 'simpler', 'faster', 'slower', 'sense', 'esto', 'eso', 'más', 'mas',
  'menos', 'corto', 'corta', 'largo', 'larga', 'mejor', 'barato',
])

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'in', 'on', 'at', 'of', 'for', 'and', 'random', 'please',
  'me', 'my', 'us', 'some', 'somewhere', 'anywhere', 'place',
  'solo', 'alone', 'couple', 'honeymoon', 'family', 'friends', 'people', 'travelers', 'traveller', 'travellers',
  'pareja', 'solos', 'familia', 'amigos', 'personas', 'viajeros',
  'create', 'plan', 'build', 'make', 'generate', 'design', 'trip', 'day', 'days',
  'night', 'nights', 'noche', 'noches',
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

  // Day count: "2 day", "5-day", "for 3 days", "3 días", "5 nights" (nights+1)
  const dayMatch = text.match(/(\d+)\s*[- ]?\s*(day|days|día|días|dia|dias)\b/i)
  const nightMatch = text.match(/(\d+)\s*[- ]?\s*(night|nights|noche|noches)\b/i)
  const numDays = dayMatch
    ? clamp(parseInt(dayMatch[1], 10), 1, 60)
    : nightMatch
      ? clamp(parseInt(nightMatch[1], 10) + 1, 1, 60)  // N nights ≈ N+1 days
      : 3

  // Traveler count: "for 2 people", "2 travelers", "pareja", "solo"
  let travelers = 2
  const travMatch = text.match(/(\d+)\s*(people|travel|adult|persona|viajero|adulto)/i)
  if (travMatch) travelers = clamp(parseInt(travMatch[1], 10), 1, 20)
  else if (/\b(solo|alone|sólo)\b/i.test(text)) travelers = 1
  else if (/\b(couple|pareja|honeymoon|luna de miel)\b/i.test(text)) travelers = 2

  const isEs = language === 'es'
  const destination =
    (extractDestination(text) || '').trim() ||
    (isEs ? 'destino sorpresa' : 'a surprise destination')

  // The backend requires non-empty `dates` (min_length=1). Use any dates found
  // in the message, otherwise a "flexible" placeholder — never an empty string.
  const dates = extractDates(text) || (isEs ? 'fechas flexibles' : 'flexible dates')

  return {
    destination,
    dates,
    num_days: numDays,
    travelers,
    interests: [],
    budget: 'mid',
    pace: 'moderate',
    language: /^[a-z]{2}$/.test(language) ? language : 'en',
  }
}

// Best-effort date phrase extraction: month names, ISO dates, or "<n>-<n>"
// ranges. Returns '' when nothing date-like is found (caller supplies a default).
function extractDates(text) {
  const months = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|ene|abr|ago|dic|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)'
  const patterns = [
    new RegExp(`\\b${months}[a-z]*\\.?\\s*\\d{1,2}(?:\\s*[-–to]+\\s*(?:${months}[a-z]*\\.?\\s*)?\\d{1,2})?(?:,?\\s*\\d{4})?`, 'i'),
    /\b\d{4}-\d{2}-\d{2}(?:\s*(?:to|-|–)\s*\d{4}-\d{2}-\d{2})?/i,
    /\bnext\s+(?:week|month|summer|spring|winter|fall|weekend)\b/i,
    /\b(?:la\s+)?(?:semana|mes)\s+que\s+viene\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[0].trim()
  }
  return ''
}

// Pull the place name out: prefer text after a location preposition, else the
// leftover words once stopwords and day phrases are removed.
function extractDestination(text) {
  const prep = text.match(/\b(?:in|to|on|at|of|for|into|around|across|through|en|a|al|para|por|hacia|sobre)\s+([A-Za-zÀ-ÿ'’.\- ]+?)(?:\s+(?:for|with|over|during|por|con|durante)\b.*)?$/i)
  if (prep && prep[1]) {
    const cleaned = cleanPlace(prep[1])
    if (cleaned) return cleaned
  }
  // Fallback: drop day/night phrases + stopwords, keep the rest.
  const withoutDays = text.replace(/\b\d+\s*[- ]?\s*(day|days|día|días|dia|dias|night|nights|noche|noches)\b/gi, ' ')
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
