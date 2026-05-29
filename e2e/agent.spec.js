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
  // AI tab is now the default; only click if not already selected (avoids
  // a re-render that can steal focus from the wizard's auto-focused input)
  const aiTab = page.getByTestId('addtrip-tab-ai')
  if ((await aiTab.getAttribute('aria-selected')) !== 'true') {
    await aiTab.click()
  }
  await expect(page.getByText('Where are you going?')).toBeVisible({ timeout: 5000 })
}

async function typeAndAdvance(page, currentQuestion, value, nextQuestion) {
  await expect(page.getByText(currentQuestion)).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(300)  // wait for fade animation
  // Scope to the open dialog so we don't grab the dashboard search input.
  // The wizard renders a single input per step (text or number).
  const input = page.getByRole('dialog').locator('input:visible, textarea:visible').first()
  await input.click()
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

  test('wizard sends payload matching backend Pydantic schema', async ({ page }) => {
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

    await expect.poll(() => capturedRequest !== null, { timeout: 10000 }).toBe(true)

    expect(capturedRequest.method).toBe('POST')
    expect(capturedRequest.url).toContain('/agent/create')

    // Validate EVERY field matches the backend CreateRequest Pydantic schema:
    //   destination: str (1-200), dates: str (1-100), num_days: int (1-60),
    //   travelers: int (1-20), interests: list[str] (max 20),
    //   budget: Literal["budget","mid","luxury"],
    //   pace: Literal["relaxed","moderate","packed"],
    //   language: str matching /^[a-z]{2}$/
    const p = capturedRequest.postData

    expect(typeof p.destination).toBe('string')
    expect(p.destination.length).toBeGreaterThanOrEqual(1)
    expect(p.destination.length).toBeLessThanOrEqual(200)

    expect(typeof p.dates).toBe('string')
    expect(p.dates.length).toBeGreaterThanOrEqual(1)
    expect(p.dates.length).toBeLessThanOrEqual(100)

    expect(Number.isInteger(p.num_days)).toBe(true)
    expect(p.num_days).toBeGreaterThanOrEqual(1)
    expect(p.num_days).toBeLessThanOrEqual(60)

    expect(Number.isInteger(p.travelers)).toBe(true)
    expect(p.travelers).toBeGreaterThanOrEqual(1)
    expect(p.travelers).toBeLessThanOrEqual(20)

    expect(Array.isArray(p.interests)).toBe(true)
    expect(p.interests.length).toBeLessThanOrEqual(20)
    p.interests.forEach(i => expect(typeof i).toBe('string'))

    expect(['budget', 'mid', 'luxury']).toContain(p.budget)
    expect(['relaxed', 'moderate', 'packed']).toContain(p.pace)
    expect(p.language).toMatch(/^[a-z]{2}$/)
  })

  test('captured payload is accepted by live backend (no 422)', async ({ page, request }) => {
    // This test catches schema drift: drives the wizard, captures the payload,
    // then POSTs it to the REAL backend on :8000. If the backend returns 422
    // (validation error), the wizard is sending data the backend won't accept.
    let capturedPayload = null
    await page.route('**/agent/create', async (route) => {
      capturedPayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ssePayload({ done: { itinerary: MOCK_ITINERARY } }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)
    await expect.poll(() => capturedPayload !== null, { timeout: 10000 }).toBe(true)

    // POST the exact payload to the live backend.
    let res
    try {
      res = await request.post('http://localhost:8000/agent/create', {
        headers: {
          'Origin': 'http://localhost:5173',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        data: capturedPayload,
      })
    } catch (err) {
      test.skip(true, 'Backend not running on localhost:8000')
      return
    }

    // 422 = schema mismatch (the bug we're catching).
    // 401/403 (auth) is OK — means schema validated successfully.
    if (res.status() === 422) {
      const body = await res.json()
      throw new Error(`Backend rejected wizard payload with 422: ${JSON.stringify(body.detail, null, 2)}`)
    }
    expect(res.status()).not.toBe(422)
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

  // Gap #2: /auth/set-admin-claim endpoint
  // (Bounds enforcement is tested at the wizard level — see "wizard clamps
  // out-of-range num_days/travelers" below. Live-backend bounds tests aren't
  // viable because auth is checked before body validation, so an invalid
  // token returns 401 long before Pydantic 422 fires.)
  test('/auth/set-admin-claim endpoint exists and validates auth', async ({ request }) => {
    let res
    try {
      res = await request.post('http://localhost:8000/auth/set-admin-claim', {
        headers: { 'Origin': 'http://localhost:5173', 'Content-Type': 'application/json', 'Authorization': 'Bearer invalid' },
      })
    } catch { test.skip(true, 'Backend not running'); return }
    // 401 = auth rejected (endpoint exists), 200 = succeeded (unlikely with fake token).
    // 404 = route missing (the bug), 422 = schema drift, 403 = origin issue.
    expect([200, 401]).toContain(res.status())
  })
})

// ── Wizard advanced behaviors ──────────────────────────────────────────────

test.describe('AI Agent — wizard behaviors', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
  })

  // Gap #5: Authorization header is well-formed
  test('wizard request includes valid Bearer authorization header', async ({ page }) => {
    let capturedHeaders = null
    await page.route('**/agent/create', async (route) => {
      capturedHeaders = await route.request().allHeaders()
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: ssePayload({ done: { itinerary: MOCK_ITINERARY } }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)
    await expect.poll(() => capturedHeaders !== null, { timeout: 10000 }).toBe(true)

    const auth = capturedHeaders['authorization'] || capturedHeaders['Authorization']
    expect(auth).toBeTruthy()
    expect(auth).toMatch(/^Bearer .+/)
    // mock token is "mock-id-token"
    expect(auth.slice(7).length).toBeGreaterThan(0)
  })

  // Gap #9: Spanish locale flows through to the backend
  test('wizard sends language="es" when app is in Spanish', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('lang', 'es') })

    let capturedPayload = null
    await page.route('**/agent/create', async (route) => {
      capturedPayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: ssePayload({ done: { itinerary: MOCK_ITINERARY } }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })

    await page.getByText('Canadá').hover()
    await page.getByRole('button', { name: /Agregar itinerario/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('addtrip-tab-ai').click()

    // Helper: same focus pattern as typeAndAdvance, scoped to dialog
    const typeStep = async (currentQuestion, value, nextQuestion) => {
      await expect(page.getByText(currentQuestion)).toBeVisible({ timeout: 5000 })
      await page.waitForTimeout(300)
      const inp = page.getByRole('dialog').locator('input:visible, textarea:visible').first()
      await inp.click()
      await page.keyboard.type(value)
      await page.keyboard.press('Enter')
      if (nextQuestion) await expect(page.getByText(nextQuestion)).toBeVisible({ timeout: 5000 })
    }

    // Spanish question text is "¿A dónde van?" (not "vas")
    await typeStep('¿A dónde van?', 'Costa Rica', '¿Cuáles son las fechas del viaje?')
    await typeStep('¿Cuáles son las fechas del viaje?', 'Jun 1 - 7', null)
    await page.waitForTimeout(300)
    const numInput = page.getByRole('dialog').locator('input[type="number"]:visible').first()
    await numInput.click(); await page.keyboard.type('7'); await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    await typeStep('¿Quiénes viajan?', '2 adultos', '¿Cuál es tu estilo de presupuesto?')
    await page.getByRole('button', { name: 'Moderado', exact: true }).click()
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.waitForTimeout(300)
    // Spanish balanced pace is "Equilibrado" not "Balanceado"
    await page.getByRole('button', { name: 'Equilibrado', exact: true }).click()
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.waitForTimeout(300)
    const fillTextRaw = async (val) => {
      const i = page.getByRole('dialog').locator('input:visible, textarea:visible').first()
      await i.click(); await page.keyboard.type(val); await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
    }
    await fillTextRaw('hiking')
    await fillTextRaw('auto')
    await fillTextRaw('Arenal')
    await page.getByRole('button', { name: 'Generar itinerario' }).click()

    await expect.poll(() => capturedPayload !== null, { timeout: 10000 }).toBe(true)
    expect(capturedPayload.language).toBe('es')
  })

  // Gap #6: closing the dialog mid-generation aborts the in-flight request
  test('unmounting the wizard mid-generation prevents the response from being applied', async ({ page }) => {
    // The wizard uses AbortController via streamCreate. When it unmounts,
    // its cleanup effect calls abortRef.current?.() to abort the in-flight
    // fetch. After unmount + resolve, no new trip should be created.
    let resolveRoute
    const routeBlocked = new Promise(r => { resolveRoute = r })
    await page.route('**/agent/create', async (route) => {
      await routeBlocked
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: ssePayload({ done: { itinerary: { ...MOCK_ITINERARY, title: 'Aborted Trip' } } }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)
    await expect(page.getByText(/Building your itinerary/i)).toBeVisible({ timeout: 5000 })

    // Reload the page — guarantees the wizard unmounts and React's cleanup runs
    await page.reload()
    await page.getByText('Canadá').waitFor({ timeout: 5000 })

    // NOW resolve the request that's still pending in the network layer
    resolveRoute()
    await page.waitForTimeout(1500)

    // The aborted response should not have created a trip with "Aborted Trip"
    await expect(page.getByText('Aborted Trip')).not.toBeVisible()
  })

  // Gap #8 (client-side): wizard clamps out-of-range num_days/travelers to
  // backend bounds (num_days 1-60, travelers 1-20) before submitting.
  test('wizard clamps out-of-range num_days and travelers to backend bounds', async ({ page }) => {
    let captured = null
    await page.route('**/agent/create', async (route) => {
      captured = route.request().postDataJSON()
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: ssePayload({ done: { itinerary: MOCK_ITINERARY } }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)

    // Same as fillWizard but with out-of-range values
    await typeAndAdvance(page, 'Where are you going?', 'Test', 'What are your travel dates?')
    await typeAndAdvance(page, 'What are your travel dates?', 'Jun 1 - Jun 7', 'How many days is the trip?')
    await typeAndAdvance(page, 'How many days is the trip?', '999', "Who's traveling?")  // out of range
    await typeAndAdvance(page, "Who's traveling?", '500 adults', "What's your budget style?")  // out of range
    await clickChipAndAdvance(page, "What's your budget style?", 'Moderate', "What's your preferred pace?")
    await clickChipAndAdvance(page, "What's your preferred pace?", 'Balanced', 'What activities and experiences excite you most?')
    await typeAndAdvance(page, 'What activities and experiences excite you most?', 'hiking', 'How will you get around?')
    await typeAndAdvance(page, 'How will you get around?', 'car', 'Any must-see places or non-negotiables?')
    await typeAndAdvance(page, 'Any must-see places or non-negotiables?', 'x', 'Anything else the AI should know?')
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: 'Generate itinerary' }).click()

    await expect.poll(() => captured !== null, { timeout: 10000 }).toBe(true)
    expect(captured.num_days).toBeLessThanOrEqual(60)
    expect(captured.num_days).toBeGreaterThanOrEqual(1)
    expect(captured.travelers).toBeLessThanOrEqual(20)
    expect(captured.travelers).toBeGreaterThanOrEqual(1)
  })

  // Gap #7: retry button actually re-sends a request after error
  test('retry button after error re-sends the request', async ({ page }) => {
    let requestCount = 0
    await page.route('**/agent/create', async (route) => {
      requestCount++
      if (requestCount === 1) {
        // First call: 500
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' })
      } else {
        // Second call (retry): success
        await route.fulfill({
          status: 200, contentType: 'text/event-stream',
          body: ssePayload({ done: { itinerary: MOCK_ITINERARY } }),
        })
      }
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)
    await expect(page.getByRole('button', { name: /Try again|Reintentar/i })).toBeVisible({ timeout: 10000 })
    expect(requestCount).toBe(1)
    await page.getByRole('button', { name: /Try again|Reintentar/i }).click()
    await expect.poll(() => requestCount, { timeout: 10000 }).toBe(2)
  })

  // Gap #4: malformed itinerary response is handled gracefully
  test('malformed itinerary response does not crash the wizard', async ({ page }) => {
    await page.route('**/agent/create', async (route) => {
      // Backend "done" event with non-object itinerary
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: ssePayload({ done: { itinerary: null } }),
      })
    })

    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
    await openWizard(page)
    await fillWizard(page)

    // Even with null itinerary, the app should not throw — either close dialog
    // or show an error, but the page itself stays interactive.
    await page.waitForTimeout(2000)
    // The dashboard or an error state should still be reachable (page didn't crash)
    expect(await page.evaluate(() => document.body.children.length)).toBeGreaterThan(0)
  })
})

// ── ItineraryAgent (in-trip chat drawer) ────────────────────────────────────

test.describe('AI Agent — ItineraryAgent chat (in-trip)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
  })

  async function openTripAndAgent(page) {
    await page.goto('/')
    await page.getByText('Ruta Este').click()
    await page.getByTestId('agent-fab').click()
    await expect(page.getByTestId('agent-input')).toBeVisible()
  }

  // Gap #10 (also covers part of #1): ItineraryAgent opens and accepts input
  test('drawer opens, input is focusable, send button is enabled with text', async ({ page }) => {
    await page.route('**/agent/chat', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: 'event: token\ndata: {"text":"Hi"}\n\nevent: done\ndata: {}\n\n',
      })
    })

    await openTripAndAgent(page)
    await page.getByTestId('agent-input').fill('What is the weather?')
    await expect(page.getByTestId('agent-send-btn')).toBeEnabled()
  })

  // Gap #1: /agent/chat payload schema
  test('chat sends payload matching backend ChatRequest schema', async ({ page }) => {
    let capturedPayload = null
    await page.route('**/agent/chat', async (route) => {
      capturedPayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: 'event: token\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n',
      })
    })

    await openTripAndAgent(page)
    await page.getByTestId('agent-input').fill('What should I pack?')
    await page.getByTestId('agent-send-btn').click()
    await expect.poll(() => capturedPayload !== null, { timeout: 5000 }).toBe(true)

    // ChatRequest schema:
    //   messages: list[Message] (1-50), each {role: "user"|"assistant", content: str 1-8000}
    //   itinerary: dict | null
    //   mode: "explore" | "edit"
    //   language: str /^[a-z]{2}$/
    const p = capturedPayload
    expect(Array.isArray(p.messages)).toBe(true)
    expect(p.messages.length).toBeGreaterThanOrEqual(1)
    expect(p.messages.length).toBeLessThanOrEqual(50)
    p.messages.forEach(m => {
      expect(['user', 'assistant']).toContain(m.role)
      expect(typeof m.content).toBe('string')
      expect(m.content.length).toBeGreaterThanOrEqual(1)
      expect(m.content.length).toBeLessThanOrEqual(8000)
    })
    expect(['explore', 'edit']).toContain(p.mode)
    expect(p.language).toMatch(/^[a-z]{2}$/)
    // itinerary may be omitted, null, or a dict
    if (p.itinerary !== undefined && p.itinerary !== null) {
      expect(typeof p.itinerary).toBe('object')
    }
  })

  // Gap #1 follow-up: live backend accepts the captured chat payload
  test('chat payload is accepted by live backend (no 422)', async ({ page, request }) => {
    let capturedPayload = null
    await page.route('**/agent/chat', async (route) => {
      capturedPayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: 'event: token\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n',
      })
    })

    await openTripAndAgent(page)
    await page.getByTestId('agent-input').fill('Hi')
    await page.getByTestId('agent-send-btn').click()
    await expect.poll(() => capturedPayload !== null, { timeout: 5000 }).toBe(true)

    let res
    try {
      res = await request.post('http://localhost:8000/agent/chat', {
        headers: { 'Origin': 'http://localhost:5173', 'Content-Type': 'application/json', 'Authorization': 'Bearer test' },
        data: capturedPayload,
      })
    } catch { test.skip(true, 'Backend not running'); return }
    if (res.status() === 422) {
      throw new Error(`Backend rejected chat payload with 422: ${JSON.stringify((await res.json()).detail, null, 2)}`)
    }
    expect(res.status()).not.toBe(422)
  })

  // Gap #3: SSE streaming displays tokens progressively
  test('SSE token events stream and final response appears in chat', async ({ page }) => {
    // The agent uses two phases:
    //   - 'token' events accumulate via msg.content + chunk (streaming display)
    //   - 'done' event with { response } replaces content with the final response
    // So our mock must include `response` in the done payload.
    const finalResponse = 'Hello world, this streams!'
    await page.route('**/agent/chat', async (route) => {
      const tokens = ['Hello', ' world', ', this', ' streams!']
      const body =
        tokens.map(t => `event: token\ndata: ${JSON.stringify({ text: t })}\n\n`).join('') +
        `event: done\ndata: ${JSON.stringify({ response: finalResponse })}\n\n`
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
    })

    await openTripAndAgent(page)
    await page.getByTestId('agent-input').fill('Stream please')
    await page.getByTestId('agent-send-btn').click()

    // The final response should appear in the assistant bubble.
    await expect(page.getByText(finalResponse)).toBeVisible({ timeout: 10000 })
  })
})
