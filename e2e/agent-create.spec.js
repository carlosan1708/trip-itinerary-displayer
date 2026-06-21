import { test, expect } from '@playwright/test'
import { setupAdminAuth } from './helpers.js'

// Create-from-chat: typing "create a trip…" into the assistant on the dashboard
// (no itinerary loaded) runs the generator and shows a full preview behind a
// Save / Discard bar — instead of answering with a wall of text.

const GENERATED = {
  version: 1,
  author: 'admin@test.com',
  label: 'England — 2 days',
  title: 'England — 2 days',
  subtitle: 'A 2-day escape',
  stats: ['2 days', 'Bath', '2 travelers'],
  parts: [
    {
      id: 1, emoji: '🏛️', title: 'Historic Bath', color: '#6A1B9A', daysRange: 'Days 1 – 2',
      days: [
        { dayNumber: 1, date: 'Day 1', location: 'Bath', subtitle: 'Roman heritage',
          logistics: [{ type: 'train', label: 'Train', value: 'London → Bath' }],
          activities: ['Roman Baths', 'Bath Abbey'], tips: [], warnings: [], links: [], images: [] },
        { dayNumber: 2, date: 'Day 2', location: 'Bath', subtitle: 'Georgian Bath',
          logistics: [{ type: 'stay', label: 'Stay', value: 'City centre B&B' }],
          activities: ['Royal Crescent'], tips: [], warnings: [], links: [], images: [] },
      ],
    },
  ],
}

function mockCreate(page, itinerary = GENERATED) {
  return page.route('**/agent/create', async (route) => {
    const body =
      'event: progress\ndata: {"text":"Structure planned"}\n\n' +
      'event: progress\ndata: {"text":"Days generated"}\n\n' +
      `event: done\ndata: ${JSON.stringify({ itinerary })}\n\n`
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
}

// /agent/chat must NOT be called for a create request — assert by failing if hit.
function failIfChat(page) {
  return page.route('**/agent/chat', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: 'event: done\ndata: {"response":"WALL OF TEXT"}\n\n' })
  })
}

async function openAgentAndCreate(page, prompt = 'create a random 2 day trip in England') {
  await page.goto('/')
  await page.getByTestId('folder-my').waitFor({ timeout: 8000 })
  await page.getByTestId('agent-fab').click()
  await expect(page.getByTestId('agent-input')).toBeVisible()
  await page.getByTestId('agent-input').fill(prompt)
  await page.getByTestId('agent-send-btn').click()
}

test.describe('AI Agent — create from chat', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
  })

  test('a create request shows the new-trip preview, not a chat wall of text', async ({ page }) => {
    await failIfChat(page)
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('England — 2 days').first()).toBeVisible()
    await expect(page.getByText('WALL OF TEXT')).not.toBeVisible()
  })

  test('a verbless phrasing ("2 day random costa rica") also triggers the preview', async ({ page }) => {
    await failIfChat(page)
    await mockCreate(page)
    await openAgentAndCreate(page, '2 day random costa rica')
    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('WALL OF TEXT')).not.toBeVisible()
  })

  test('the preview renders the generated day cards', async ({ page }) => {
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-bar')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Historic Bath')).toBeVisible()
    await expect(page.getByText('Roman heritage')).toBeVisible()
    await expect(page.getByText('Georgian Bath')).toBeVisible()
  })

  test('the chat shows a review hint instead of the itinerary text', async ({ page }) => {
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('agent-newtrip-hint')).toBeVisible({ timeout: 10000 })
  })

  test('Discard drops the preview and returns to the dashboard', async ({ page }) => {
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('new-trip-discard').click()
    await expect(page.getByTestId('new-trip-preview')).not.toBeVisible()
    await expect(page.getByTestId('folder-my')).toBeVisible()
  })

  test('Save adds the trip and opens it', async ({ page }) => {
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-save')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('new-trip-save').click()
    // The new trip opens in the itinerary view (back button + title visible)
    await expect(page.getByRole('button', { name: 'My Trips' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('England — 2 days').first()).toBeVisible()
  })

  test('the create payload is accepted by the live backend (no 422)', async ({ page, request }) => {
    // Catches schema drift: the chat-create payload must satisfy the backend
    // CreateRequest (e.g. dates min_length=1). This is the test that would have
    // caught the "dates: ''" → 422 bug.
    let captured = null
    await page.route('**/agent/create', async (route) => {
      captured = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: done\ndata: ${JSON.stringify({ itinerary: GENERATED })}\n\n` })
    })

    await openAgentAndCreate(page, 'random 3 day trip costa rica')
    await expect.poll(() => captured !== null, { timeout: 10000 }).toBe(true)

    // Sanity on the payload shape before hitting the backend.
    expect(typeof captured.dates).toBe('string')
    expect(captured.dates.length).toBeGreaterThanOrEqual(1)
    expect(captured.destination.length).toBeGreaterThanOrEqual(1)

    let res
    try {
      res = await request.post('http://localhost:8000/agent/create', {
        headers: { 'Origin': 'http://localhost:5173', 'Content-Type': 'application/json', 'Authorization': 'Bearer test' },
        data: captured,
      })
    } catch { test.skip(true, 'Backend not running on localhost:8000'); return }

    if (res.status() === 422) {
      const body = await res.json()
      throw new Error(`Backend rejected create payload with 422: ${JSON.stringify(body.detail, null, 2)}`)
    }
    expect(res.status()).not.toBe(422)
  })

  test('refining a pending preview applies the change in the UI, not as prose', async ({ page }) => {
    // Regression: while a preview is pending (no trip saved yet), an edit
    // request ("I want one day to include Guanacaste") must patch the preview
    // inline. Previously it fell through to QA and dumped a wall of text.
    let chatPayload = null
    await page.route('**/agent/chat', async (route) => {
      chatPayload = route.request().postDataJSON()
      // Backend returns a merge-patch that changes day 2's location.
      const patch = { parts: [{ id: 1, days: [{ dayNumber: 2, location: 'Guanacaste' }] }] }
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: done\ndata: ${JSON.stringify({ response: 'Updated day 2.', patch })}\n\n` })
    })
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Georgian Bath')).toBeVisible()

    // Now refine the pending preview.
    await page.getByTestId('agent-input').fill('I want one day to include Guanacaste')
    await page.getByTestId('agent-send-btn').click()

    // The preview updates in place (day 2 now in Guanacaste); still no wall of text.
    // Target the day-card heading, not the user's chat message which echoes the word.
    await expect(page.getByRole('heading', { name: 'Guanacaste' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('new-trip-preview')).toBeVisible()
    // The edit went through the chat endpoint in edit mode against the preview.
    expect(chatPayload.mode).toBe('edit')
    expect(chatPayload.itinerary).toBeTruthy()
  })

  test('"add a day" to a pending preview shows the new day in the UI', async ({ page }) => {
    // Regression: applyPatch silently dropped days whose dayNumber was not
    // already present, so "add 1 more day" produced an explanation but the
    // preview kept only its original days. The new day must actually appear.
    await page.route('**/agent/chat', async (route) => {
      // Backend adds a brand-new Day 3 to the existing part.
      const patch = { parts: [{ id: 1, days: [
        { dayNumber: 3, date: 'Day 3', location: 'Bristol', subtitle: 'Day trip',
          logistics: [], activities: ['SS Great Britain'], tips: [], warnings: [], links: [], images: [] },
      ] }] }
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: done\ndata: ${JSON.stringify({ response: 'Added a third day.', patch })}\n\n` })
    })
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })
    // Original preview has Days 1-2 only.
    await expect(page.getByText('Day 3')).not.toBeVisible()

    await page.getByTestId('agent-input').fill('add 1 more day')
    await page.getByTestId('agent-send-btn').click()

    // The new Day 3 now renders in the preview.
    await expect(page.getByText('Day 3')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Bristol')).toBeVisible()
    await expect(page.getByTestId('new-trip-preview')).toBeVisible()
  })

  test('"make it shorter" removes a day from a pending preview', async ({ page }) => {
    // Reducing the trip length deletes the highest day(s) via a _delete patch;
    // the preview must drop that day, not keep it or dump prose.
    await page.route('**/agent/chat', async (route) => {
      // GENERATED has Days 1-2; pretend the preview is a 2-day trip the user
      // wants down to 1 day → delete day 2.
      const patch = { parts: [{ id: 1, days: [{ dayNumber: 2, _delete: true }] }] }
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: done\ndata: ${JSON.stringify({ response: 'Removed day 2.', patch })}\n\n` })
    })
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Georgian Bath')).toBeVisible()  // day 2 subtitle

    await page.getByTestId('agent-input').fill('make it 1 day, I asked for shorter')
    await page.getByTestId('agent-send-btn').click()

    // Day 2 (Georgian Bath) is gone; day 1 remains; preview still shown.
    await expect(page.getByText('Georgian Bath')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Roman heritage')).toBeVisible()  // day 1 subtitle
    await expect(page.getByTestId('new-trip-preview')).toBeVisible()
  })

  test('an implausible edit applies the patch but shows a warning in chat', async ({ page }) => {
    // The agent should not silently produce a nonsensical itinerary: it applies
    // the best-effort patch AND surfaces a warning (e.g. adding another continent).
    await page.route('**/agent/chat', async (route) => {
      const patch = { parts: [{ id: 1, days: [
        { dayNumber: 3, date: 'Day 3', location: 'Beijing', subtitle: 'Great Wall',
          logistics: [], activities: ['Great Wall'], tips: [], warnings: [], links: [], images: [] },
      ] }] }
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: done\ndata: ${JSON.stringify({
          response: 'Added a day in Beijing.',
          patch,
          warning: 'Beijing is on another continent — you would need an international flight and extra travel days.',
        })}\n\n` })
    })
    await mockCreate(page)
    await openAgentAndCreate(page)
    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('agent-input').fill('add one day in china')
    await page.getByTestId('agent-send-btn').click()

    // Warning is shown, and the patch still applied (Beijing day appears).
    await expect(page.getByTestId('agent-warning')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('agent-warning')).toContainText(/another continent/i)
    await expect(page.getByText('Great Wall')).toBeVisible()
  })

  test('a plain question does NOT trigger the create preview', async ({ page }) => {
    let chatHit = false
    await page.route('**/agent/chat', async (route) => {
      chatHit = true
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: 'event: token\ndata: {"text":"Bath is lovely."}\n\nevent: done\ndata: {"response":"Bath is lovely."}\n\n' })
    })
    await mockCreate(page)
    await openAgentAndCreate(page, 'what is the weather like in Bath?')
    await expect(page.getByText('Bath is lovely.')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('new-trip-preview')).not.toBeVisible()
    expect(chatHit).toBe(true)
  })
})
