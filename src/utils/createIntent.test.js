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
      budget: 'mid', pace: 'moderate', interests: [], dates: '',
    })
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
})
