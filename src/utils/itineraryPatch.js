/**
 * Apply an RFC 7396 merge-patch to an itinerary.
 *
 * Parts are matched by `id`, days by `dayNumber`.
 * Arrays within a day (activities, tips, etc.) are replaced in full when present in the patch.
 * Fields absent from the patch are left unchanged.
 *
 * Returns a new itinerary object (does not mutate the original).
 */
// Marker an agent patch sets on a part/day object to request its removal,
// e.g. { id: 1, days: [{ dayNumber: 3, _delete: true }] } drops Day 3.
export const DELETE_MARKER = '_delete'

/**
 * The real day count, derived from the itinerary structure (all days across all
 * parts). Use this for the "N days" UI chip instead of the model-authored
 * `stats[0]`, which drifts out of sync across agent edits.
 */
export function countDays(itinerary) {
  return (itinerary?.parts || []).reduce((n, p) => n + (p.days?.length || 0), 0)
}

export function applyPatch(itinerary, patch) {
  const result = structuredClone(itinerary)

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'parts') {
      result.parts = _mergeParts(result.parts || [], value)
    } else {
      result[key] = value
    }
  }

  return result
}

// Fallback palette for parts the model added without a color (matches the
// travel palette used by the generator: blues, greens, oranges, purples).
const PART_COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#4527A0']

/**
 * Make an agent-edited itinerary structurally safe to render. Conservative —
 * only repairs what would break the UI, leaves valid data alone:
 *  - drops completely-empty placeholder days (the "blank card" bug) and any
 *    part left with no days (the "PART UNDEFINED" bug)
 *  - fills a missing part id (next free), color, title, and emoji
 *  - recomputes each part's daysRange from its actual days
 * By default renumbers days sequentially 1..N across all parts (so removals
 * leave no gaps); pass { renumber: false } to keep dayNumbers stable — used by
 * incremental per-day accept, where renumbering would shift the numbers that
 * other still-pending patch entries point at.
 * Pure; returns a new object. Apply at the edit/preview boundary, not inside
 * applyPatch (which must stay a faithful merge).
 */
export function normalizeItinerary(itinerary, { renumber = true } = {}) {
  if (!itinerary || !Array.isArray(itinerary.parts)) return itinerary

  const result = structuredClone(itinerary)
  const usedIds = new Set(
    result.parts.map(p => p?.id).filter(id => id !== undefined && id !== null),
  )
  let nextId = 1
  const freshId = () => {
    while (usedIds.has(nextId)) nextId++
    usedIds.add(nextId)
    return nextId
  }

  let globalDay = 0
  const parts = []
  result.parts.forEach((part, idx) => {
    if (!part || typeof part !== 'object') return

    // Drop only truly-empty placeholder days; keep sparse-but-real ones.
    const days = (part.days || []).filter(_dayHasContent)
    if (days.length === 0) return  // drop an empty part entirely

    if (renumber) days.forEach(d => { d.dayNumber = ++globalDay })

    const id = (part.id === undefined || part.id === null) ? freshId() : part.id
    const nums = days.map(d => d.dayNumber).filter(n => typeof n === 'number')
    const lo = nums.length ? Math.min(...nums) : null
    const hi = nums.length ? Math.max(...nums) : null
    const daysRange = lo == null ? (part.daysRange || '')
      : lo === hi ? `Day ${lo}` : `Days ${lo} – ${hi}`

    parts.push({
      ...part,
      id,
      color: part.color || PART_COLORS[idx % PART_COLORS.length],
      title: part.title || `Part ${id}`,
      emoji: part.emoji || '📍',
      daysRange,
      days,
    })
  })

  result.parts = parts
  return result
}

// A day is dropped only when it carries no content at all (an empty placeholder
// the model emitted). A bare dayNumber alone does NOT count as content.
function _dayHasContent(day) {
  if (!day || typeof day !== 'object') return false
  return Object.entries(day).some(([k, v]) => {
    if (k === 'dayNumber' || k === DELETE_MARKER) return false
    if (Array.isArray(v)) return v.length > 0
    return v != null && v.toString().trim() !== ''
  })
}

function _isDelete(obj) {
  return obj && obj[DELETE_MARKER] === true
}

function _mergeParts(existingParts, patchParts) {
  const partMap = new Map(existingParts.map(p => [p.id, structuredClone(p)]))
  const removed = new Set()
  const appended = []

  for (const patchPart of patchParts) {
    const existing = partMap.get(patchPart.id)
    if (_isDelete(patchPart)) {
      if (existing) removed.add(patchPart.id)
      continue
    }
    if (!existing) {
      // A part not present in the itinerary is an addition — keep it whole.
      appended.push(structuredClone(patchPart))
      continue
    }

    for (const [key, value] of Object.entries(patchPart)) {
      if (key === 'days') {
        existing.days = _mergeDays(existing.days || [], value)
      } else if (key !== 'id') {
        existing[key] = value
      }
    }
    partMap.set(patchPart.id, existing)
  }

  return [
    ...existingParts.filter(p => !removed.has(p.id)).map(p => partMap.get(p.id) || p),
    ...appended,
  ]
}

function _mergeDays(existingDays, patchDays) {
  const dayMap = new Map(existingDays.map(d => [d.dayNumber, structuredClone(d)]))
  const removed = new Set()
  const appended = []

  for (const patchDay of patchDays) {
    const existing = dayMap.get(patchDay.dayNumber)
    if (_isDelete(patchDay)) {
      if (existing) removed.add(patchDay.dayNumber)
      continue
    }
    if (!existing) {
      // A day with a new dayNumber is an addition — keep it whole.
      appended.push(structuredClone(patchDay))
      continue
    }

    for (const [key, value] of Object.entries(patchDay)) {
      if (key !== 'dayNumber') {
        existing[key] = value
      }
    }
    dayMap.set(patchDay.dayNumber, existing)
  }

  // Merge existing (minus removed, preserving order) with appended, then sort by
  // dayNumber so an inserted day lands in the right place. Renumbering is left to
  // normalizeItinerary (global, across parts) so incremental per-day accepts
  // don't shift the dayNumbers that other still-pending patch entries target.
  return [
    ...existingDays.filter(d => !removed.has(d.dayNumber)).map(d => dayMap.get(d.dayNumber) || d),
    ...appended,
  ].sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0))
}

/**
 * Build a human-readable summary of what a patch will change.
 * Returns an array of change descriptor objects for the diff UI.
 *
 * Each item: { partTitle, dayNumber, date, location, changedFields: string[] }
 */
export function describePatch(itinerary, patch) {
  const changes = []
  const partMap = new Map((itinerary.parts || []).map(p => [p.id, p]))

  for (const patchPart of patch.parts || []) {
    const part = partMap.get(patchPart.id)

    // A part flagged for deletion.
    if (_isDelete(patchPart)) {
      if (part) changes.push({ partTitle: part.title, dayNumber: null, changedFields: [], removed: true })
      continue
    }

    // A part not in the itinerary is a whole new part being added.
    if (!part) {
      for (const patchDay of patchPart.days || []) {
        changes.push({
          partTitle: patchPart.title || '',
          dayNumber: patchDay.dayNumber,
          date: patchDay.date || '',
          location: patchDay.location || '',
          changedFields: Object.keys(patchDay).filter(k => k !== 'dayNumber'),
          added: true,
        })
      }
      const newPartFields = Object.keys(patchPart).filter(k => !['id', 'days'].includes(k))
      if (newPartFields.length) {
        changes.push({ partTitle: patchPart.title || '', dayNumber: null, changedFields: newPartFields, added: true })
      }
      continue
    }

    const dayMap = new Map((part.days || []).map(d => [d.dayNumber, d]))

    for (const patchDay of patchPart.days || []) {
      const day = dayMap.get(patchDay.dayNumber)
      if (_isDelete(patchDay)) {
        if (day) {
          changes.push({
            partTitle: part.title,
            dayNumber: patchDay.dayNumber,
            date: day.date || '',
            location: day.location || '',
            changedFields: [],
            removed: true,
          })
        }
        continue
      }
      const changedFields = Object.keys(patchDay).filter(k => k !== 'dayNumber')
      changes.push({
        partTitle: part.title,
        dayNumber: patchDay.dayNumber,
        date: day?.date || patchDay.date || '',
        location: patchDay.location || day?.location || '',
        changedFields,
        added: !day,
      })
    }

    // Part-level field changes (not day-level)
    const partFields = Object.keys(patchPart).filter(k => !['id', 'days'].includes(k))
    if (partFields.length) {
      changes.push({ partTitle: part.title, dayNumber: null, changedFields: partFields })
    }
  }

  return changes
}

/**
 * Build a detailed, field-level before/after diff of a patch, keyed for the
 * inline day-card review UI.
 *
 * Returns:
 *   {
 *     days: [{ partId, dayNumber, fields: [{ field, before, after }] }],
 *     parts: [{ partId, partTitle, fields: [{ field, before, after }] }],
 *     dayCount, partCount, total,
 *   }
 *
 * `before`/`after` carry the raw field values (string, array, or object list)
 * so the UI can render real content — added/removed list items, changed
 * scalars — rather than just field names. Unchanged fields are skipped.
 */
export function diffPatch(itinerary, patch) {
  const days = []
  const parts = []
  const partMap = new Map((itinerary?.parts || []).map(p => [p.id, p]))

  for (const patchPart of patch?.parts || []) {
    const part = partMap.get(patchPart.id)

    // Part flagged for deletion: surface each of its days as removed.
    if (_isDelete(patchPart)) {
      if (part) {
        for (const day of part.days || []) {
          days.push({
            partId: part.id, dayNumber: day.dayNumber,
            date: day.date || '', location: day.location ?? '',
            fields: [], removed: true,
          })
        }
      }
      continue
    }

    // Whole new part being added: every day in it is an addition.
    if (!part) {
      for (const patchDay of patchPart.days || []) {
        const fields = Object.entries(patchDay)
          .filter(([field]) => field !== 'dayNumber')
          .map(([field, after]) => ({ field, before: undefined, after }))
        days.push({
          partId: patchPart.id,
          dayNumber: patchDay.dayNumber,
          date: patchDay.date || '',
          location: patchDay.location ?? '',
          fields,
          added: true,
        })
      }
      continue
    }

    const dayMap = new Map((part.days || []).map(d => [d.dayNumber, d]))

    for (const patchDay of patchPart.days || []) {
      const day = dayMap.get(patchDay.dayNumber)
      // Day flagged for deletion.
      if (_isDelete(patchDay)) {
        if (day) {
          days.push({
            partId: part.id, dayNumber: patchDay.dayNumber,
            date: day.date || '', location: day.location ?? '',
            fields: [], removed: true,
          })
        }
        continue
      }
      // New day added to an existing part.
      if (!day) {
        const fields = Object.entries(patchDay)
          .filter(([field]) => field !== 'dayNumber')
          .map(([field, after]) => ({ field, before: undefined, after }))
        days.push({
          partId: part.id,
          dayNumber: patchDay.dayNumber,
          date: patchDay.date || '',
          location: patchDay.location ?? '',
          fields,
          added: true,
        })
        continue
      }
      const fields = []
      for (const [field, after] of Object.entries(patchDay)) {
        if (field === 'dayNumber') continue
        const before = day[field]
        if (_equal(before, after)) continue
        fields.push({ field, before, after })
      }
      if (fields.length) {
        days.push({
          partId: part.id,
          dayNumber: patchDay.dayNumber,
          date: day.date || '',
          location: patchDay.location ?? day.location ?? '',
          fields,
        })
      }
    }

    const partFields = []
    for (const [field, after] of Object.entries(patchPart)) {
      if (field === 'id' || field === 'days') continue
      if (_equal(part[field], after)) continue
      partFields.push({ field, before: part[field], after })
    }
    if (partFields.length) {
      parts.push({ partId: part.id, partTitle: part.title, fields: partFields })
    }
  }

  return {
    days,
    parts,
    dayCount: days.length,
    partCount: parts.length,
    total: days.length + parts.length,
  }
}

function _equal(a, b) {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Split before/after array values into removed / added / kept buckets for
 * rendering list-style diffs (activities, tips, etc.). Comparison is by
 * deep-equality of stringified items.
 */
export function diffList(before, after) {
  const b = _asList(before)
  const a = _asList(after)
  const bKeys = b.map(_itemKey)
  const aKeys = a.map(_itemKey)
  return {
    removed: b.filter((_, i) => !aKeys.includes(bKeys[i])),
    added:   a.filter((_, i) => !bKeys.includes(aKeys[i])),
    kept:    a.filter((_, i) => bKeys.includes(aKeys[i])),
  }
}

function _asList(v) {
  if (Array.isArray(v)) return v
  return v == null ? [] : [v]
}

function _itemKey(item) {
  return typeof item === 'object' ? JSON.stringify(item) : String(item)
}

/**
 * Extract a sub-patch that affects only one day of one part. Used to apply a
 * single day's worth of a larger proposed patch.
 */
export function patchForDay(patch, partId, dayNumber) {
  const part = (patch?.parts || []).find(p => p.id === partId)
  if (!part) return { parts: [] }
  const day = (part.days || []).find(d => d.dayNumber === dayNumber)
  if (!day) return { parts: [] }
  return { parts: [{ id: partId, days: [day] }] }
}

/**
 * Return a copy of the patch with one day removed. If that leaves a part with
 * no days and no other fields, the part is dropped too. Returns null when the
 * patch becomes empty (nothing left to review).
 */
export function removeDayFromPatch(patch, partId, dayNumber) {
  const parts = []
  for (const part of patch?.parts || []) {
    if (part.id !== partId) { parts.push(part); continue }
    const days = (part.days || []).filter(d => d.dayNumber !== dayNumber)
    const otherFields = Object.keys(part).filter(k => k !== 'id' && k !== 'days')
    if (days.length === 0 && otherFields.length === 0) continue // drop empty part
    const next = { ...part }
    if ('days' in next) next.days = days
    parts.push(next)
  }
  if (parts.length === 0) return null
  // If every remaining part has no days and no real fields, treat as empty.
  const anyContent = parts.some(p =>
    (p.days && p.days.length > 0) ||
    Object.keys(p).some(k => k !== 'id' && k !== 'days')
  )
  return anyContent ? { ...patch, parts } : null
}
