import { describe, it, expect } from 'vitest'
import { applyPatch, describePatch, diffPatch, diffList, patchForDay, removeDayFromPatch } from './itineraryPatch'

// A small but representative itinerary used across the patch tests.
function baseItinerary() {
  return {
    title: 'Canada 2026',
    subtitle: 'West coast',
    parts: [
      {
        id: 1,
        title: 'British Columbia',
        emoji: '🏔️',
        days: [
          { dayNumber: 1, date: 'Sep 12', location: 'Vancouver', activities: ['Stanley Park'], tips: ['Bring a jacket'] },
          { dayNumber: 2, date: 'Sep 13', location: 'Whistler', activities: ['Peak 2 Peak'], warnings: [] },
        ],
      },
      {
        id: 2,
        title: 'Alberta',
        emoji: '🦌',
        days: [
          { dayNumber: 3, date: 'Sep 14', location: 'Banff', activities: ['Lake Louise'] },
        ],
      },
    ],
  }
}

describe('applyPatch', () => {
  it('does not mutate the original itinerary', () => {
    const original = baseItinerary()
    const snapshot = structuredClone(original)
    applyPatch(original, { parts: [{ id: 1, days: [{ dayNumber: 1, location: 'Victoria' }] }] })
    expect(original).toEqual(snapshot)
  })

  it('returns a new object reference', () => {
    const original = baseItinerary()
    const result = applyPatch(original, {})
    expect(result).not.toBe(original)
    expect(result).toEqual(original)
  })

  it('updates a top-level scalar field', () => {
    const result = applyPatch(baseItinerary(), { title: 'Canada Reloaded' })
    expect(result.title).toBe('Canada Reloaded')
    expect(result.subtitle).toBe('West coast')
  })

  it('updates a single day field, leaving siblings untouched', () => {
    const result = applyPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, location: 'Victoria' }] }],
    })
    const day1 = result.parts[0].days[0]
    expect(day1.location).toBe('Victoria')
    expect(day1.activities).toEqual(['Stanley Park']) // unchanged
    expect(result.parts[0].days[1].location).toBe('Whistler') // sibling unchanged
  })

  it('replaces an array field in full when present in the patch', () => {
    const result = applyPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, activities: ['New plan'] }] }],
    })
    expect(result.parts[0].days[0].activities).toEqual(['New plan'])
  })

  it('updates a part-level field without touching its days', () => {
    const result = applyPatch(baseItinerary(), { parts: [{ id: 1, title: 'BC' }] })
    expect(result.parts[0].title).toBe('BC')
    expect(result.parts[0].days).toHaveLength(2)
  })

  it('ignores patch parts whose id does not exist', () => {
    const result = applyPatch(baseItinerary(), { parts: [{ id: 99, title: 'Ghost' }] })
    expect(result.parts).toHaveLength(2)
    expect(result.parts.map(p => p.id)).toEqual([1, 2])
  })

  it('ignores patch days whose dayNumber does not exist', () => {
    const result = applyPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 42, location: 'Nowhere' }] }],
    })
    expect(result.parts[0].days).toHaveLength(2)
  })

  it('never overwrites part id or day dayNumber', () => {
    const result = applyPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, dayNumber_typo: 5 }] }],
    })
    expect(result.parts[0].id).toBe(1)
    expect(result.parts[0].days[0].dayNumber).toBe(1)
  })

  it('handles patching multiple parts and multiple days at once', () => {
    const result = applyPatch(baseItinerary(), {
      parts: [
        { id: 1, days: [{ dayNumber: 2, location: 'Squamish' }] },
        { id: 2, title: 'Alberta Rockies', days: [{ dayNumber: 3, tips: ['Watch for elk'] }] },
      ],
    })
    expect(result.parts[0].days[1].location).toBe('Squamish')
    expect(result.parts[1].title).toBe('Alberta Rockies')
    expect(result.parts[1].days[0].tips).toEqual(['Watch for elk'])
  })

  it('tolerates an itinerary with no parts array', () => {
    const result = applyPatch({ title: 'X' }, { parts: [{ id: 1, title: 'Y' }] })
    expect(result.parts).toEqual([])
  })

  it('tolerates a part with no days array', () => {
    const itin = { parts: [{ id: 1, title: 'P' }] }
    const result = applyPatch(itin, { parts: [{ id: 1, days: [{ dayNumber: 1, location: 'X' }] }] })
    expect(result.parts[0].days).toEqual([])
  })

  it('applies an empty patch as a no-op clone', () => {
    const original = baseItinerary()
    expect(applyPatch(original, {})).toEqual(original)
  })
})

describe('describePatch', () => {
  it('returns an empty list for an empty patch', () => {
    expect(describePatch(baseItinerary(), {})).toEqual([])
  })

  it('describes a single day change with its changed fields', () => {
    const changes = describePatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, location: 'Victoria', activities: ['x'] }] }],
    })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      partTitle: 'British Columbia',
      dayNumber: 1,
      date: 'Sep 12',
      location: 'Victoria',
    })
    expect(changes[0].changedFields).toEqual(expect.arrayContaining(['location', 'activities']))
    expect(changes[0].changedFields).not.toContain('dayNumber')
  })

  it('falls back to the existing location when the patch omits it', () => {
    const changes = describePatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 2, activities: ['x'] }] }],
    })
    expect(changes[0].location).toBe('Whistler')
  })

  it('emits a part-level change descriptor with dayNumber null', () => {
    const changes = describePatch(baseItinerary(), {
      parts: [{ id: 1, title: 'BC', emoji: '🌲' }],
    })
    expect(changes).toHaveLength(1)
    expect(changes[0].dayNumber).toBeNull()
    expect(changes[0].changedFields).toEqual(expect.arrayContaining(['title', 'emoji']))
  })

  it('combines day-level and part-level changes', () => {
    const changes = describePatch(baseItinerary(), {
      parts: [{ id: 1, title: 'BC', days: [{ dayNumber: 1, location: 'Victoria' }] }],
    })
    expect(changes).toHaveLength(2)
    const dayChange = changes.find(c => c.dayNumber === 1)
    const partChange = changes.find(c => c.dayNumber === null)
    expect(dayChange.location).toBe('Victoria')
    expect(partChange.changedFields).toEqual(['title'])
  })

  it('ignores patch parts that do not exist in the itinerary', () => {
    expect(describePatch(baseItinerary(), { parts: [{ id: 99, title: 'Ghost' }] })).toEqual([])
  })

  it('tolerates an itinerary with no parts', () => {
    expect(describePatch({}, { parts: [{ id: 1, days: [{ dayNumber: 1, location: 'x' }] }] })).toEqual([])
  })

  it('handles a part-only patch with no days key', () => {
    const changes = describePatch(baseItinerary(), { parts: [{ id: 2, emoji: '🏕️' }] })
    expect(changes).toHaveLength(1)
    expect(changes[0].changedFields).toEqual(['emoji'])
  })
})

describe('diffPatch', () => {
  it('returns empty buckets for an empty patch', () => {
    const d = diffPatch(baseItinerary(), {})
    expect(d).toMatchObject({ days: [], parts: [], dayCount: 0, partCount: 0, total: 0 })
  })

  it('captures before/after values for a changed day field', () => {
    const d = diffPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, location: 'Victoria' }] }],
    })
    expect(d.dayCount).toBe(1)
    expect(d.days[0]).toMatchObject({ partId: 1, dayNumber: 1 })
    expect(d.days[0].fields).toEqual([{ field: 'location', before: 'Vancouver', after: 'Victoria' }])
  })

  it('skips fields whose value is unchanged', () => {
    const d = diffPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, location: 'Vancouver', activities: ['Beach'] }] }],
    })
    // location is identical → only activities should appear
    expect(d.days[0].fields.map(f => f.field)).toEqual(['activities'])
  })

  it('omits a day entirely when nothing actually changed', () => {
    const d = diffPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, location: 'Vancouver' }] }],
    })
    expect(d.days).toEqual([])
    expect(d.total).toBe(0)
  })

  it('compares arrays by value, not reference', () => {
    const d = diffPatch(baseItinerary(), {
      parts: [{ id: 1, days: [{ dayNumber: 1, activities: ['Stanley Park'] }] }],
    })
    // identical array contents → no change recorded
    expect(d.days).toEqual([])
  })

  it('records part-level field changes separately', () => {
    const d = diffPatch(baseItinerary(), { parts: [{ id: 1, title: 'BC' }] })
    expect(d.partCount).toBe(1)
    expect(d.parts[0]).toMatchObject({ partId: 1, partTitle: 'British Columbia' })
    expect(d.parts[0].fields).toEqual([{ field: 'title', before: 'British Columbia', after: 'BC' }])
  })

  it('combines day and part totals', () => {
    const d = diffPatch(baseItinerary(), {
      parts: [{ id: 1, title: 'BC', days: [{ dayNumber: 2, location: 'Squamish' }] }],
    })
    expect(d.total).toBe(2)
    expect(d.dayCount).toBe(1)
    expect(d.partCount).toBe(1)
  })

  it('ignores unknown parts and days', () => {
    const d = diffPatch(baseItinerary(), {
      parts: [{ id: 99, days: [{ dayNumber: 1, location: 'X' }] }],
    })
    expect(d.total).toBe(0)
  })

  it('tolerates a null itinerary', () => {
    expect(diffPatch(null, { parts: [{ id: 1, title: 'X' }] }).total).toBe(0)
  })
})

describe('diffList', () => {
  it('classifies added, removed, and kept items', () => {
    const { added, removed, kept } = diffList(['a', 'b', 'c'], ['b', 'c', 'd'])
    expect(removed).toEqual(['a'])
    expect(added).toEqual(['d'])
    expect(kept).toEqual(['b', 'c'])
  })

  it('treats a scalar as a single-item list', () => {
    const { added } = diffList(null, 'only')
    expect(added).toEqual(['only'])
  })

  it('returns empty buckets for identical lists', () => {
    const { added, removed } = diffList(['x'], ['x'])
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })

  it('compares object items by value', () => {
    const before = [{ label: 'A', url: 'a' }]
    const after = [{ label: 'A', url: 'a' }, { label: 'B', url: 'b' }]
    const { added, kept } = diffList(before, after)
    expect(added).toEqual([{ label: 'B', url: 'b' }])
    expect(kept).toEqual([{ label: 'A', url: 'a' }])
  })

  it('handles null/undefined inputs', () => {
    expect(diffList(null, null)).toEqual({ added: [], removed: [], kept: [] })
  })
})

describe('patchForDay', () => {
  const patch = {
    parts: [
      { id: 1, days: [{ dayNumber: 1, location: 'A' }, { dayNumber: 2, location: 'B' }] },
      { id: 2, days: [{ dayNumber: 3, location: 'C' }] },
    ],
  }

  it('extracts a single day sub-patch', () => {
    expect(patchForDay(patch, 1, 2)).toEqual({ parts: [{ id: 1, days: [{ dayNumber: 2, location: 'B' }] }] })
  })

  it('returns an empty patch for an unknown part', () => {
    expect(patchForDay(patch, 9, 1)).toEqual({ parts: [] })
  })

  it('returns an empty patch for an unknown day', () => {
    expect(patchForDay(patch, 1, 99)).toEqual({ parts: [] })
  })
})

describe('removeDayFromPatch', () => {
  it('removes one day but keeps the rest', () => {
    const patch = { parts: [{ id: 1, days: [{ dayNumber: 1 }, { dayNumber: 2 }] }] }
    expect(removeDayFromPatch(patch, 1, 1)).toEqual({ parts: [{ id: 1, days: [{ dayNumber: 2 }] }] })
  })

  it('drops a part that becomes empty', () => {
    const patch = { parts: [{ id: 1, days: [{ dayNumber: 1 }] }, { id: 2, days: [{ dayNumber: 2 }] }] }
    expect(removeDayFromPatch(patch, 1, 1)).toEqual({ parts: [{ id: 2, days: [{ dayNumber: 2 }] }] })
  })

  it('returns null when nothing is left', () => {
    const patch = { parts: [{ id: 1, days: [{ dayNumber: 1 }] }] }
    expect(removeDayFromPatch(patch, 1, 1)).toBeNull()
  })

  it('keeps a part that still has non-day fields', () => {
    const patch = { parts: [{ id: 1, title: 'X', days: [{ dayNumber: 1 }] }] }
    expect(removeDayFromPatch(patch, 1, 1)).toEqual({ parts: [{ id: 1, title: 'X', days: [] }] })
  })

  it('leaves other parts untouched', () => {
    const patch = { parts: [{ id: 1, days: [{ dayNumber: 1 }] }, { id: 2, title: 'keep' }] }
    expect(removeDayFromPatch(patch, 1, 1)).toEqual({ parts: [{ id: 2, title: 'keep' }] })
  })
})
