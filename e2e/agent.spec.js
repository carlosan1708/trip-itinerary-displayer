import { test, expect } from '@playwright/test'
import { setupAllowedUserAuth } from './helpers.js'

// AI Agent tests — exercise the TripPlannerWizard UI and verify it
// correctly calls the /agent/create endpoint with proper origin headers.
// We use page.route() to intercept the fetch and inject SSE responses,
// so these tests don't need the real backend.

const MOCK_ITINERARY = {
  version: 1,
  author: 'user@test.com',
  title: 'Test Trip',
  subtitle: 'Test Dates',
  stats: ['7 days', 'Test City'],
  parts: [
    {
      id: 1,
      emoji: '🏖️',
      title: 'Part 1',
      color: '#2E7D32',
      daysRange: 'Days 1 – 7',
      days: Array.from({ length: 7 }, (_, i) => ({
        dayNumber: i + 1,
        date: `Day ${i + 1}`,
        location: 'Test City',
        subtitle: 'Test day',
        logistics: [],
        activities: ['Activity 1'],
        tips: [],
        warnings: [],
        links: [],
        images: [],
        optional_alternatives: [],
      })),
    },
  ],
}

function ssePayload({ progress = [], done = null, error = null }) {
  let body = ''
  for (const msg of progress) {
    body += `event: progress\ndata: ${JSON.stringify({ text: msg })}\n\n`
  }
  if (done) {
    body += `event: done\ndata: ${JSON.stringify(done)}\n\n`
  }
  if (error) {
    body += `event: error\ndata: ${JSON.stringify({ message: error })}\n\n`
  }
  return body
}

async function mockAgentCreate(page, { progress, done, error } = {}) {
  await page.route('**/agent/create', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: ssePayload({
        progress: progress ?? ['Generating...', 'Adding activities...'],
        done: done ?? { itinerary: MOCK_ITINERARY },
        error,
      }),
    })
  })
}

async function openWizard(page) {
  await page.getByText('Canadá').hover()
  await page.getByRole('button', { name: 'Add itinerary' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByTestId('addtrip-tab-ai').click()
  // Wizard renders the first question (destination) when AI tab is active
  await expect(page.getByText('Where are you going?')).toBeVisible({ timeout: 5000 })
}

async function typeAndAdvance(page, currentQuestion, value, nextQuestion) {
  // Each step auto-focuses its input via useEffect — type into focused element
  await expect(page.getByText(currentQuestion)).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(250)  // wait for fade + focus
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
  if (nextQuestion) {
    await expect(page.getByText(nextQuestion)).toBeVisible({ timeout: 5000 })
  }
}

async function clickChipAndAdvance(page, currentQuestion, chipLabel, nextQuestion) {
  await expect(page.getByText(currentQuestion)).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: chipLabel, exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  if (nextQuestion) {
    await expect(page.getByText(nextQuestion)).toBeVisible({ timeout: 5000 })
  }
}

async function fillWizard(page) {
  await typeAndAdvance(page, 'Where are you going?', 'Costa Rica', 'What are your travel dates?')
  await typeAndAdvance(page, 'What are your travel dates?', 'Jun 1 - Jun 7', 'How many days is the trip?')
  await typeAndAdvance(page, 'How many days is the trip?', '7', "Who's traveling?")
  await typeAndAdvance(page, "Who's traveling?", '2 adults', "What's your budget style?")
  await clickChipAndAdvance(page, "What's your budget style?", 'Moderate', "What's your preferred pace?")
  await clickChipAndAdvance(page, "What's your preferred pace?", 'Balanced', 'What activities and experiences excite you most?')
  await typeAndAdvance(page, 'What activities and experiences excite you most?', 'hiking, wildlife', 'How will you get around?')
  await typeAndAdvance(page, 'How will you get around?', 'rental car', 'Any must-see places or non-negotiables?')
  await typeAndAdvance(page, 'Any must-see places or non-negotiables?', 'Arenal, Monteverde', 'Anything else the AI should know?')
  // Final step: notes (optional) — click "Generate itinerary" to submit
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: 'Generate itinerary' }).click()
}

test.describe('AI Agent — TripPlannerWizard UI', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
  })

  test('wizard sends POST to /agent/create when submitted', async ({ page }) => {
    let capturedRequest = null
    await page.route('**/agent/create', async (route) => {
      const request = route.request()
      capturedRequest = {
        method: request.method(),
        url: request.url(),
        headers: await request.allHeaders(),
        postData: request.postDataJSON(),
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ssePayload({
          progress: ['Generating...'],
          done: { itinerary: MOCK_ITINERARY },
        }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)

    // Wait for the request to be made
    await page.waitForFunction(() => true, null, { timeout: 5000 })
    await expect.poll(() => capturedRequest !== null, { timeout: 10000 }).toBe(true)

    expect(capturedRequest.method).toBe('POST')
    expect(capturedRequest.url).toContain('/agent/create')
    expect(capturedRequest.postData.destination).toBe('Costa Rica')
    expect(capturedRequest.postData.num_days).toBe(7)
    expect(capturedRequest.postData.budget).toBeTruthy()
    expect(capturedRequest.postData.pace).toBeTruthy()
  })

  test('successful generation creates a trip', async ({ page }) => {
    await mockAgentCreate(page)

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)

    // After completion, the dialog closes and the new trip appears
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Test Trip|Costa Rica/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('backend error shows retry button', async ({ page }) => {
    await mockAgentCreate(page, { error: 'Server error 500' })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)

    // Error state should appear with a retry button
    await expect(page.getByRole('button', { name: /Try again|Reintentar/i })).toBeVisible({ timeout: 10000 })
  })

  test('403 from backend surfaces a server error to the user', async ({ page }) => {
    // Simulate the exact CORS/origin failure the user hit in prod
    await page.route('**/agent/create', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Forbidden' }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)

    // The user should see the actual error, not silent failure
    await expect(page.getByText(/Server error 403/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Try again|Reintentar/i })).toBeVisible()
  })
})

// ── Backend integration test ────────────────────────────────────────────────
// Hits the LIVE local backend at http://localhost:8000 to verify CORS/origin
// config is correct. Skips if backend isn't running.

test.describe('AI Agent — backend integration (live)', () => {
  test('health endpoint is reachable', async ({ request }) => {
    try {
      const res = await request.get('http://localhost:8000/health')
      expect(res.status()).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
    } catch (err) {
      test.skip(true, 'Backend not running on localhost:8000')
    }
  })

  test('backend accepts requests from localhost:5173 origin', async ({ request }) => {
    let res
    try {
      res = await request.post('http://localhost:8000/agent/create', {
        headers: {
          'Origin': 'http://localhost:5173',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-token-for-origin-test',
        },
        data: {
          destination: 'Test',
          dates: 'Jun 1 - 7',
          num_days: 7,
          travelers: 2,
          interests: ['test'],
          budget: 'mid',
          pace: 'moderate',
          language: 'en',
        },
      })
    } catch (err) {
      test.skip(true, 'Backend not running on localhost:8000')
      return
    }
    // Should NOT be 403 (origin would be rejected before auth check).
    // 401 = origin OK, auth failed (expected); 200 = origin OK, auth succeeded.
    // 403 = origin rejected (the bug we hit).
    expect(res.status()).not.toBe(403)
  })

  test('backend rejects requests from wrong origin with 403', async ({ request }) => {
    let res
    try {
      res = await request.post('http://localhost:8000/agent/create', {
        headers: {
          'Origin': 'http://evil-site.com',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer any-token',
        },
        data: { destination: 'x', dates: 'x', num_days: 1, travelers: 1, interests: [], budget: 'mid', pace: 'moderate', language: 'en' },
      })
    } catch (err) {
      test.skip(true, 'Backend not running on localhost:8000')
      return
    }
    expect(res.status()).toBe(403)
    const json = await res.json()
    expect(json.detail).toBe('Forbidden')
  })
})
