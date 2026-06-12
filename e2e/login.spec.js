import { test, expect } from '@playwright/test'
import { setupNoAuth, setupUnauthorizedAuth } from './helpers.js'

// ── Login screen (unauthenticated) ─────────────────────────────────────────

test.describe('Login screen', () => {
  test.beforeEach(async ({ page }) => {
    await setupNoAuth(page)
    await page.goto('/')
  })

  test('shows the app title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /My Trips/i })).toBeVisible()
  })

  test('shows the subtitle', async ({ page }) => {
    await expect(page.getByText(/Shared Itineraries/i)).toBeVisible()
  })

  test('shows the sign-in button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible()
  })

  test('shows "Private Access" heading', async ({ page }) => {
    await expect(page.getByText('Private Access')).toBeVisible()
  })

  test('shows the access restriction message', async ({ page }) => {
    await expect(page.getByText(/Only authorized users/i)).toBeVisible()
  })
})

// ── Access Denied screen ────────────────────────────────────────────────────

test.describe('Access Denied screen', () => {
  test.beforeEach(async ({ page }) => {
    await setupUnauthorizedAuth(page)
    await page.goto('/')
  })

  test('shows access denied message', async ({ page }) => {
    await expect(page.getByText('Unauthorized Access')).toBeVisible({ timeout: 5000 })
  })

  test('shows the unauthorized user email', async ({ page }) => {
    await expect(page.getByText('stranger@test.com')).toBeVisible({ timeout: 5000 })
  })
})
