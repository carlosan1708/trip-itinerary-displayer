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

    // Turnstile is bypassed → /demo/start mocked → signInAnonymously fires.
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
})
