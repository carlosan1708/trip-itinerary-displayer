/**
 * Apply an RFC 7396 merge-patch to an itinerary.
 *
 * Parts are matched by `id`, days by `dayNumber`.
 * Arrays within a day (activities, tips, etc.) are replaced in full when present in the patch.
 * Fields absent from the patch are left unchanged.
 *
 * Returns a new itinerary object (does not mutate the original).
 */
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

function _mergeParts(existingParts, patchParts) {
  const partMap = new Map(existingParts.map(p => [p.id, structuredClone(p)]))

  for (const patchPart of patchParts) {
    const existing = partMap.get(patchPart.id)
    if (!existing) continue

    for (const [key, value] of Object.entries(patchPart)) {
      if (key === 'days') {
        existing.days = _mergeDays(existing.days || [], value)
      } else if (key !== 'id') {
        existing[key] = value
      }
    }
    partMap.set(patchPart.id, existing)
  }

  return existingParts.map(p => partMap.get(p.id) || p)
}

function _mergeDays(existingDays, patchDays) {
  const dayMap = new Map(existingDays.map(d => [d.dayNumber, structuredClone(d)]))

  for (const patchDay of patchDays) {
    const existing = dayMap.get(patchDay.dayNumber)
    if (!existing) continue

    for (const [key, value] of Object.entries(patchDay)) {
      if (key !== 'dayNumber') {
        existing[key] = value
      }
    }
    dayMap.set(patchDay.dayNumber, existing)
  }

  return existingDays.map(d => dayMap.get(d.dayNumber) || d)
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
    if (!part) continue

    const dayMap = new Map((part.days || []).map(d => [d.dayNumber, d]))

    for (const patchDay of patchPart.days || []) {
      const day = dayMap.get(patchDay.dayNumber)
      const changedFields = Object.keys(patchDay).filter(k => k !== 'dayNumber')
      changes.push({
        partTitle: part.title,
        dayNumber: patchDay.dayNumber,
        date: day?.date || '',
        location: patchDay.location || day?.location || '',
        changedFields,
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
    if (!part) continue

    const dayMap = new Map((part.days || []).map(d => [d.dayNumber, d]))

    for (const patchDay of patchPart.days || []) {
      const day = dayMap.get(patchDay.dayNumber)
      if (!day) continue
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
