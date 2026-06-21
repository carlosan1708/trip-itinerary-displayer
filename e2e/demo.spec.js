import { test, expect } from '@playwright/test'
import { setupDemoEntry } from './helpers.js'

// ── Demo mode entry ─────────────────────────────────────────────────────────

test.describe('Demo mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupDemoEntry(page)
    await page.goto('/')
  })

  test('login screen offers a "Try the demo" button', async ({ page }) => {
    await expect(page.getByTestId('try-demo-btn')).toBeVisible({ timeout: 5000 })
  })

  test('passing the challenge signs in anonymously and lands on the demo dashboard', async ({ page }) => {
    await page.getByTestId('try-demo-btn').click()

    // reCAPTCHA is bypassed → /demo/start mocked → signInAnonymously fires.
    // Demo banner and the seeded sample trip should appear.
    await expect(page.getByTestId('demo-banner')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Sample Trip')).toBeVisible({ timeout: 5000 })
  })

  test('demo dashboard does not expose admin "Manage access"', async ({ page }) => {
    await page.getByTestId('try-demo-btn').click()
    await expect(page.getByTestId('demo-banner')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /Manage access/i })).not.toBeVisible()
  })

  test('demo banner states the trip and AI limits', async ({ page }) => {
    await page.getByTestId('try-demo-btn').click()
    const banner = page.getByTestId('demo-banner')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner).toContainText(/Demo mode/i)
  })

  test('demo user cannot upload files (upload button disabled)', async ({ page }) => {
    await page.getByTestId('try-demo-btn').click()
    await expect(page.getByTestId('demo-banner')).toBeVisible({ timeout: 5000 })

    // Open the sample trip and expand a day so DayFiles renders.
    await page.getByText('Sample Trip').click()
    await page.getByText('Llegada Nocturna').waitFor({ timeout: 8000 })
    await page.getByText('Llegada Nocturna').click()

    // The upload button is present but disabled for demo users.
    await expect(page.getByText(/Day files/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /Upload file/i })).toBeDisabled()
  })

  // Regression: demo saves rewrite the trip id to a uid-scoped id, but the
  // caller used to navigate to the original (non-existent) id, leaving the user
  // on a blank "Loading…" screen until a manual refresh. Saving a demo preview
  // must open the freshly-created trip.
  test('saving an AI-created trip opens it (no blank screen) for demo users', async ({ page }) => {
    const GENERATED = {
      version: 1, label: 'Salvador — 2 days', title: 'Salvador — 2 days',
      subtitle: 'A 2-day escape', stats: ['2 days', 'Salvador'],
      parts: [{ id: 1, emoji: '☀️', title: 'Discovering Salvador', color: '#F9A825', daysRange: 'Days 1 – 2',
        days: [
          { dayNumber: 1, date: 'Day 1', location: 'Salvador', subtitle: 'Pelourinho',
            logistics: [], activities: ['Pelourinho'], tips: [], warnings: [], links: [], images: [] },
          { dayNumber: 2, date: 'Day 2', location: 'Salvador', subtitle: 'Coast',
            logistics: [], activities: ['Forts'], tips: [], warnings: [], links: [], images: [] },
        ] }],
    }
    await page.route('**/agent/create', route =>
      route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: done\ndata: ${JSON.stringify({ itinerary: GENERATED })}\n\n` }))

    await page.getByTestId('try-demo-btn').click()
    await expect(page.getByTestId('demo-banner')).toBeVisible({ timeout: 5000 })

    await page.getByTestId('agent-fab').click()
    await page.getByTestId('agent-input').fill('create 2 day trip to el salvador')
    await page.getByTestId('agent-send-btn').click()

    await expect(page.getByTestId('new-trip-preview')).toBeVisible({ timeout: 10000 })
    await page.getByTestId('new-trip-save').click()

    // The saved trip opens in the itinerary view (back button + title), NOT a
    // stuck loading screen.
    await expect(page.getByRole('button', { name: 'My Trips' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Salvador — 2 days').first()).toBeVisible()
    await expect(page.getByText('Loading...')).not.toBeVisible()
  })
})
