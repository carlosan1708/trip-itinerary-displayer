import { describe, it, expect } from 'vitest'
import { detectCreateIntent, parseCreateRequest } from './createIntent'

describe('detectCreateIntent', () => {
  it('matches an English create request', () => {
    expect(detectCreateIntent('create a random 2 day trip in England')).toBe(true)
  })

  it('matches a Spanish create request', () => {
    expect(detectCreateIntent('crea un viaje de 3 días en Japón')).toBe(true)
  })

  it('matches "plan a weekend in Lisbon"', () => {
    expect(detectCreateIntent('plan a weekend trip in Lisbon')).toBe(true)
  })

  it('matches a day-count phrasing without an explicit trip noun', () => {
    expect(detectCreateIntent('build me 5 days in Rome')).toBe(true)
  })

  it('does not match a plain question', () => {
    expect(detectCreateIntent('what should I pack for Bath?')).toBe(false)
  })

  it('does not match a bare verb with no trip context', () => {
    expect(detectCreateIntent('make it shorter')).toBe(false)
  })

  it('returns false for empty input', () => {
    expect(detectCreateIntent('')).toBe(false)
    expect(detectCreateIntent(undefined)).toBe(false)
  })
})

describe('parseCreateRequest', () => {
  it('extracts destination and day count', () => {
    const p = parseCreateRequest('create a random 2 day trip in England')
    expect(p.destination).toBe('England')
    expect(p.num_days).toBe(2)
  })

  it('fills backend-valid defaults', () => {
    const p = parseCreateRequest('plan a trip to Peru')
    expect(p).toMatchObject({
      destination: 'Peru', num_days: 3, travelers: 2,
      budget: 'mid', pace: 'moderate', interests: [],
    })
    // dates must be non-empty (backend CreateRequest requires min_length=1)
    expect(p.dates.length).toBeGreaterThan(0)
  })

  it('clamps day count to backend bounds', () => {
    expect(parseCreateRequest('make a 90 day trip to India').num_days).toBe(60)
  })

  it('parses traveler counts', () => {
    expect(parseCreateRequest('plan a trip to Italy for 4 people').travelers).toBe(4)
  })

  it('treats "solo" as one traveler', () => {
    expect(parseCreateRequest('plan a solo trip to Iceland').travelers).toBe(1)
  })

  it('treats "couple" as two travelers', () => {
    expect(parseCreateRequest('plan a couple trip to Paris').travelers).toBe(2)
  })

  it('handles a Spanish request', () => {
    const p = parseCreateRequest('crea un viaje de 3 días en Japón', 'es')
    expect(p.num_days).toBe(3)
    expect(p.destination.toLowerCase()).toContain('japón')
    expect(p.language).toBe('es')
  })

  it('falls back to a surprise destination when none is given', () => {
    const p = parseCreateRequest('create a random 2 day trip')
    expect(p.destination).toMatch(/surprise/i)
    expect(p.num_days).toBe(2)
  })

  it('normalises an invalid language to en', () => {
    expect(parseCreateRequest('plan a trip to Spain', 'english').language).toBe('en')
  })

  it('extracts a multi-word destination', () => {
    expect(parseCreateRequest('plan a 4 day trip to New Zealand').destination).toBe('New Zealand')
  })

  it('handles the "on <place>" preposition', () => {
    // Real user phrasing that previously leaked the preposition into the name.
    expect(parseCreateRequest('create random itinerary on england').destination).toBe('england')
  })

  it('handles "for <place>" without leaking "me"', () => {
    expect(parseCreateRequest('make me an itinerary for Japan').destination).toBe('Japan')
  })

  it('does not leak a traveler word into the destination', () => {
    expect(parseCreateRequest('plan a solo trip to Iceland').destination).toBe('Iceland')
    expect(parseCreateRequest('plan a couple getaway to Paris').destination).toBe('Paris')
  })

  it('never returns an empty destination', () => {
    for (const m of ['create a trip', 'plan something', 'make an itinerary', 'crea un viaje']) {
      expect(parseCreateRequest(m).destination.length).toBeGreaterThan(0)
    }
  })

  it('extracts dates when the message contains them', () => {
    expect(parseCreateRequest('plan a trip to Rome June 1-7').dates).toMatch(/jun/i)
    expect(parseCreateRequest('trip to Lima next week').dates).toMatch(/next week/i)
  })
})

// Guard: every parsed request must satisfy the backend CreateRequest schema
// (backend/main.py). This is what would have caught the dates='' → 422 bug.
describe('parseCreateRequest satisfies the backend CreateRequest schema', () => {
  // Mirror of backend/main.py CreateRequest constraints.
  function assertValid(p) {
    expect(typeof p.destination).toBe('string')
    expect(p.destination.length).toBeGreaterThanOrEqual(1)
    expect(p.destination.length).toBeLessThanOrEqual(200)
    expect(typeof p.dates).toBe('string')
    expect(p.dates.length).toBeGreaterThanOrEqual(1)   // min_length=1 — the 422 culprit
    expect(p.dates.length).toBeLessThanOrEqual(100)
    expect(Number.isInteger(p.num_days)).toBe(true)
    expect(p.num_days).toBeGreaterThanOrEqual(1)
    expect(p.num_days).toBeLessThanOrEqual(60)
    expect(Number.isInteger(p.travelers)).toBe(true)
    expect(p.travelers).toBeGreaterThanOrEqual(1)
    expect(p.travelers).toBeLessThanOrEqual(20)
    expect(Array.isArray(p.interests)).toBe(true)
    expect(p.interests.length).toBeLessThanOrEqual(20)
    expect(['budget', 'mid', 'luxury']).toContain(p.budget)
    expect(['relaxed', 'moderate', 'packed']).toContain(p.pace)
    expect(p.language).toMatch(/^[a-z]{2}$/)
  }

  const MESSAGES = [
    'random 3 day trip costa rica',           // the exact failing message
    'create a random 2 day trip in England',
    'create random itinerary on england',
    'plan a trip to Peru',
    'make me an itinerary for Japan',
    'plan a 4 day trip to New Zealand',
    'plan a solo trip to Iceland',
    'crea un viaje de 3 días en Japón',
    'create a trip',                          // no destination, no dates, no days
    'plan something',
    'make an itinerary',
    'weekend getaway',
    'trip to Rome June 1-7 for 2 people',
  ]

  for (const m of MESSAGES) {
    it(`"${m}" → valid payload`, () => {
      assertValid(parseCreateRequest(m, /viaje|días|crea/.test(m) ? 'es' : 'en'))
    })
  }
})
