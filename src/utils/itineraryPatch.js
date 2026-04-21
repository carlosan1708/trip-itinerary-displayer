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
