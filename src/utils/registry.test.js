import { describe, it, expect, beforeEach } from 'vitest'
import {
  getRegistry, saveRegistry,
  getFavorites, saveFavorites,
  getTripData, saveTripData, deleteTripData,
  slugify,
} from './registry'

beforeEach(() => localStorage.clear())

describe('getRegistry / saveRegistry', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(getRegistry()).toEqual([])
  })

  it('round-trips a flat list of trips', () => {
    const trips = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
    saveRegistry(trips)
    expect(getRegistry()).toEqual(trips)
  })

  it('flattens legacy folder-shaped data on read (backward compatibility)', () => {
    const legacy = [
      { id: 'f1', label: 'Mine', trips: [{ id: 'a' }, { id: 'b' }] },
      { id: 'f2', label: 'All', trips: [{ id: 'c' }] },
    ]
    localStorage.setItem('trips-registry', JSON.stringify(legacy))
    expect(getRegistry()).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  })

  it('tolerates legacy folders with a missing trips array', () => {
    const legacy = [{ id: 'f1', label: 'Mine', trips: [{ id: 'a' }] }, { id: 'f2', label: 'Empty' }]
    localStorage.setItem('trips-registry', JSON.stringify(legacy))
    expect(getRegistry()).toEqual([{ id: 'a' }])
  })

  it('returns [] for non-array stored JSON', () => {
    localStorage.setItem('trips-registry', JSON.stringify({ not: 'an array' }))
    expect(getRegistry()).toEqual([])
  })

  it('returns [] for corrupt (non-JSON) storage', () => {
    localStorage.setItem('trips-registry', '{ broken json')
    expect(getRegistry()).toEqual([])
  })

  it('does not mistake a flat trip with a trips field for a folder list', () => {
    // First element has no `trips` array → treated as flat.
    const flat = [{ id: 'a', trips: undefined }, { id: 'b' }]
    saveRegistry(flat)
    expect(getRegistry()).toEqual(flat)
  })
})

describe('getFavorites / saveFavorites', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(getFavorites()).toEqual([])
  })

  it('round-trips favorites', () => {
    saveFavorites(['a', 'b'])
    expect(getFavorites()).toEqual(['a', 'b'])
  })
})

describe('trip data storage', () => {
  it('returns null for an unknown trip', () => {
    expect(getTripData('nope')).toBeNull()
  })

  it('saves and reads trip data', () => {
    const data = { title: 'Trip', parts: [] }
    saveTripData('t1', data)
    expect(getTripData('t1')).toEqual(data)
  })

  it('deletes trip data', () => {
    saveTripData('t1', { title: 'Trip' })
    deleteTripData('t1')
    expect(getTripData('t1')).toBeNull()
  })

  it('keys trip data per id', () => {
    saveTripData('a', { x: 1 })
    saveTripData('b', { x: 2 })
    expect(getTripData('a')).toEqual({ x: 1 })
    expect(getTripData('b')).toEqual({ x: 2 })
    deleteTripData('a')
    expect(getTripData('a')).toBeNull()
    expect(getTripData('b')).toEqual({ x: 2 })
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Canada West Coast')).toBe('canada-west-coast')
  })

  it('collapses multiple spaces into a single hyphen', () => {
    expect(slugify('a   b')).toBe('a-b')
  })

  it('strips non-alphanumeric characters', () => {
    // Accent chars and '&' are dropped; the spaces around '&' collapse to hyphens.
    expect(slugify('Montréal & Québec!')).toBe('montral--qubec')
  })

  it('keeps existing hyphens and digits', () => {
    expect(slugify('Trip-2026 Plan')).toBe('trip-2026-plan')
  })

  it('returns an empty string for punctuation-only input', () => {
    expect(slugify('!!!')).toBe('')
  })
})
