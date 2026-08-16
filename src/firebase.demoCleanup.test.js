import { describe, it, expect } from 'vitest'
import { ownDemoTrips } from './firebase'

// ownDemoTrips must select ONLY the calling demo user's own trips — never the
// shared sample or another demo user's trips — so sign-out cleanup can delete
// them safely.
describe('ownDemoTrips', () => {
  const uid = 'abc123'
  const trips = [
    { id: 'demo-abc123-1', author: 'demo:abc123', label: 'Mine A' },
    { id: 'demo-abc123-2', author: 'demo:abc123', label: 'Mine B' },
    { id: 'demo-sample', author: 'demo-sample', label: 'Read-only sample' },
    { id: 'demo-other-9', author: 'demo:other', label: "Another demo user's" },
    { id: 'real-trip', author: 'someone@example.com', label: 'Real user trip' },
  ]

  it('selects only trips authored by demo:{uid}', () => {
    const mine = ownDemoTrips(trips, uid)
    expect(mine.map(t => t.id)).toEqual(['demo-abc123-1', 'demo-abc123-2'])
  })

  it('excludes the read-only sample and other demo users', () => {
    const ids = ownDemoTrips(trips, uid).map(t => t.id)
    expect(ids).not.toContain('demo-sample')
    expect(ids).not.toContain('demo-other-9')
  })

  it('excludes real (email-authored) trips', () => {
    expect(ownDemoTrips(trips, uid).map(t => t.id)).not.toContain('real-trip')
  })

  it('also matches by id prefix when author differs', () => {
    // A trip with the uid-scoped id but a stale/missing author still counts.
    const t = [{ id: `demo-${uid}-x`, author: undefined }]
    expect(ownDemoTrips(t, uid)).toHaveLength(1)
  })

  it('returns empty for a missing uid or empty list', () => {
    expect(ownDemoTrips(trips, undefined)).toEqual([])
    expect(ownDemoTrips(trips, '')).toEqual([])
    expect(ownDemoTrips(null, uid)).toEqual([])
    expect(ownDemoTrips([], uid)).toEqual([])
  })
})
