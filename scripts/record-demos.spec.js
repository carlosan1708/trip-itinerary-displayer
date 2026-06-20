// scripts/record-demos.spec.js — NOT a test. A Playwright "recorder" that drives
// the app through showcase flows with video on, so we can convert the videos to
// GIFs for the README. Run via scripts/record-demos.sh (sets video + viewport).
//
//   npx playwright test scripts/record-demos.spec.js \
//     --config scripts/record-demos.config.js
//
// Videos land in scripts/.demo-videos/, then record-demos.sh converts them to
// docs/media/*.gif with ffmpeg.

import { test, expect } from '@playwright/test'
import { setupAdminAuthEn, setupAdminWithMixedTripsEn, setupAllowedUserAuthEn } from '../e2e/helpers.js'

// A realistic generated itinerary the mocked /agent/create returns.
const GENERATED = {
  version: 1,
  author: 'user@test.com',
  label: 'Costa Rica — 7 days',
  title: 'Costa Rica — 7 days',
  subtitle: 'Jun 1 – Jun 7, 2026',
  stats: ['7 days', 'Arenal · Monteverde', '2 travelers'],
  parts: [
    {
      id: 1, emoji: '🌋', title: 'Arenal & the cloud forest', color: '#2E7D32',
      daysRange: 'Days 1 – 7',
      days: Array.from({ length: 7 }, (_, i) => ({
        dayNumber: i + 1,
        date: `Jun ${i + 1}`,
        location: i < 4 ? 'La Fortuna' : 'Monteverde',
        subtitle: i === 0 ? 'Arrival & hot springs' : i < 4 ? 'Arenal adventures' : 'Cloud forest',
        logistics: [{ type: 'stay', label: 'Stay', value: i < 4 ? 'Arenal Lodge' : 'Monteverde Inn' }],
        activities: ['Guided hike to the waterfall', 'Wildlife spotting at dusk'],
        tips: ['Bring a rain jacket — afternoon showers are common'],
        warnings: [], links: [], images: [], optional_alternatives: [],
      })),
    },
  ],
}

function sse(payload) {
  let body = ''
  for (const p of payload.progress ?? []) body += `event: progress\ndata: ${JSON.stringify({ text: p })}\n\n`
  if (payload.done) body += `event: done\ndata: ${JSON.stringify(payload.done)}\n\n`
  return body
}

// Slow, human-paced typing/clicks so the GIF is watchable.
async function settle(page, ms = 700) { await page.waitForTimeout(ms) }

// ── 1. AI trip planner ───────────────────────────────────────────────────────
test('demo: ai-planner', async ({ page }) => {
  await setupAllowedUserAuthEn(page)

  // Mock the AI backend with a short streamed "thinking" then the itinerary.
  await page.route('**/agent/create', async (route) => {
    await page.waitForTimeout(1200) // let the "Building…" spinner show
    await route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: sse({ progress: ['Structure planned', 'Days generated'], done: { itinerary: GENERATED } }),
    })
  })

  await page.goto('/')
  await page.getByTestId('folder-my').waitFor({ timeout: 8000 })
  await settle(page)

  // Open Add-trip on My Trips → AI tab (default)
  await page.getByTestId('folder-my').hover()
  await page.getByRole('button', { name: 'Add itinerary' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Where are you going?')).toBeVisible({ timeout: 5000 })
  await settle(page, 900)

  const steps = [
    ['Where are you going?', 'Costa Rica', 'What are your travel dates?'],
    ['What are your travel dates?', 'Jun 1 - Jun 7', 'How many days is the trip?'],
    ['How many days is the trip?', '7', "Who's traveling?"],
    ["Who's traveling?", '2 adults', "What's your budget style?"],
  ]
  for (const [q, val, next] of steps) {
    await expect(page.getByText(q)).toBeVisible()
    await settle(page, 500)
    const input = page.getByRole('dialog').locator('input:visible, textarea:visible').first()
    await input.click()
    await input.pressSequentially(val, { delay: 55 })
    await settle(page, 350)
    await page.keyboard.press('Enter')
    if (next) await expect(page.getByText(next)).toBeVisible({ timeout: 5000 })
  }
  // budget + pace chips
  await expect(page.getByText("What's your budget style?")).toBeVisible()
  await settle(page, 500)
  await page.getByRole('button', { name: 'Moderate', exact: true }).click()
  await settle(page, 300)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText("What's your preferred pace?")).toBeVisible()
  await settle(page, 400)
  await page.getByRole('button', { name: 'Balanced', exact: true }).click()
  await settle(page, 300)
  await page.getByRole('button', { name: 'Next' }).click()

  for (const [q, val, next] of [
    ['What activities and experiences excite you most?', 'hiking, wildlife', 'How will you get around?'],
    ['How will you get around?', 'rental car', 'Any must-see places or non-negotiables?'],
    ['Any must-see places or non-negotiables?', 'Arenal, Monteverde', 'Anything else the AI should know?'],
  ]) {
    await expect(page.getByText(q)).toBeVisible()
    await settle(page, 450)
    const input = page.getByRole('dialog').locator('input:visible, textarea:visible').first()
    await input.click()
    await input.pressSequentially(val, { delay: 45 })
    await settle(page, 300)
    await page.keyboard.press('Enter')
    if (next) await expect(page.getByText(next)).toBeVisible({ timeout: 5000 })
  }

  await settle(page, 500)
  await page.getByRole('button', { name: 'Generate itinerary' }).click()
  // Building… spinner → generated trip appears on the dashboard
  await expect(page.getByText(/Costa Rica/i).first()).toBeVisible({ timeout: 10000 })
  await settle(page, 1800)
})

// ── 2. In-trip AI assistant (propose + apply a change) ───────────────────────
test('demo: ai-assistant', async ({ page }) => {
  await setupAllowedUserAuthEn(page)

  // Mock /agent/chat to stream a reply + a patch the user can apply.
  await page.route('**/agent/chat', async (route) => {
    await page.waitForTimeout(900)
    const response = 'Done — I added a coffee-plantation tour to Day 2 in Banff.'
    // Patch shape matches itineraryPatch.describePatch: { parts: [{ id, days: [...] }] }.
    // The mock itinerary "Canada Itinerary" has part id 1 with days 1 and 2.
    const patch = {
      parts: [
        { id: 1, days: [{ dayNumber: 2, activities: ['Visit Bow Falls', 'Stroll down Banff Avenue', 'Coffee plantation tour (2h)'] }] },
      ],
    }
    const body =
      'event: token\ndata: {"text":"Done — "}\n\n' +
      'event: token\ndata: {"text":"I added a coffee-plantation tour to Day 2."}\n\n' +
      `event: done\ndata: ${JSON.stringify({ response, patch })}\n\n`
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })

  await page.goto('/')
  await page.getByText('Eastern Route').waitFor({ timeout: 8000 })
  await settle(page)
  await page.getByText('Eastern Route').click()
  await page.getByText('Canada Itinerary').waitFor({ timeout: 8000 })
  await settle(page, 900)

  // Open the agent drawer
  await page.getByTestId('agent-fab').click()
  await expect(page.getByTestId('agent-input')).toBeVisible()
  await settle(page, 700)

  const input = page.getByTestId('agent-input')
  await input.click()
  await input.pressSequentially('Add a coffee tour to day 2', { delay: 50 })
  await settle(page, 400)
  await page.getByTestId('agent-send-btn').click()

  // Reply + proposed-changes card appear
  await expect(page.getByText(/coffee/i).first()).toBeVisible({ timeout: 8000 })
  await settle(page, 2200)
})

// ── 3. Dashboard: My Trips + All Trips (admin) ───────────────────────────────
test('demo: dashboard', async ({ page }) => {
  await setupAdminWithMixedTripsEn(page)
  await page.goto('/')
  await page.getByTestId('folder-my').waitFor({ timeout: 8000 })
  await settle(page, 1200)

  // Show both folders, then open a trip from All Trips
  await expect(page.getByTestId('folder-all')).toBeVisible()
  await settle(page, 900)
  await page.getByTestId('folder-all').getByText('Japan Adventure').hover()
  await settle(page, 700)
  await page.getByTestId('folder-all').getByText('Japan Adventure').click()
  await page.getByRole('button', { name: 'My Trips' }).waitFor({ timeout: 8000 })
  await settle(page, 1500)
  // Back to dashboard
  await page.getByRole('button', { name: 'My Trips' }).click()
  await page.getByTestId('folder-my').waitFor({ timeout: 5000 })
  await settle(page, 1200)
})

// ── 4. Edit a day + version history ──────────────────────────────────────────
test('demo: edit-versions', async ({ page }) => {
  await setupAdminAuthEn(page)
  await page.goto('/')
  await page.getByText('Eastern Route').waitFor({ timeout: 8000 })
  await settle(page, 800)
  await page.getByText('Eastern Route').click()
  await page.getByText('Canada Itinerary').waitFor({ timeout: 8000 })
  await settle(page, 900)

  // Expand a day card to show details
  await page.getByText('Overnight Arrival').click()
  await settle(page, 1400)
  await page.getByText('First Exploration').click()
  await settle(page, 1600)
})
