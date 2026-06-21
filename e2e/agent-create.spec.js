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
    await expect(page.getByText('England — 2 days')).toBeVisible()
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
