import { test, expect } from '@playwright/test'
import { setupAdminAuth, setupAllowedUserAuth } from './helpers.js'

// ── Dashboard renders for allowed users ────────────────────────────────────

test.describe('Dashboard — allowed user', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
  })

  test('shows "My Trips" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /My Trips/i })).toBeVisible({ timeout: 5000 })
  })

  test('shows the My Trips folder', async ({ page }) => {
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })
  })

  test('shows trips inside the My Trips folder', async ({ page }) => {
    await expect(page.getByText('Ruta Este')).toBeVisible({ timeout: 5000 })
  })

  test('shows sign-out button', async ({ page }) => {
    await expect(page.getByText('Sign Out').first()).toBeVisible({ timeout: 5000 })
  })

  test('does NOT show admin panel button for regular user', async ({ page }) => {
    // Admin-only "Manage access" button should not appear for a regular user
    await expect(page.getByRole('button', { name: /Manage access/i })).not.toBeVisible()
  })
})

// ── Dashboard — admin-specific features ────────────────────────────────────

test.describe('Dashboard — admin user', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
  })

  test('shows admin panel button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Manage access/i })).toBeVisible({ timeout: 5000 })
  })
})

// ── Search / filter ─────────────────────────────────────────────────────────

test.describe('Dashboard — search', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByRole('heading', { name: /My Trips/i }).waitFor({ timeout: 5000 })
  })

  test('filters trips by search query', async ({ page }) => {
    await page.getByPlaceholder('Search trip...').fill('Ruta Oeste')
    await expect(page.getByText('Ruta Oeste')).toBeVisible()
    await expect(page.getByText('Ruta Este')).not.toBeVisible()
  })

  test('shows no results message for unmatched query', async ({ page }) => {
    await page.getByPlaceholder('Search trip...').fill('zzz-not-existing-zzz')
    await expect(page.getByText(/No trips found/i)).toBeVisible()
  })

  test('clearing search restores all trips', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search trip...')
    await searchInput.fill('Ruta Oeste')
    await expect(page.getByText('Ruta Este')).not.toBeVisible()
    await searchInput.fill('')
    await expect(page.getByText('Ruta Este')).toBeVisible()
  })
})

// ── Folder expand / collapse ────────────────────────────────────────────────

test.describe('Dashboard — folder expand / collapse', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByTestId('folder-my').waitFor({ timeout: 5000 })
  })

  test('trips are visible when folder is expanded (default)', async ({ page }) => {
    await expect(page.getByText('Ruta Este')).toBeVisible()
  })

  test('clicking folder header collapses its trips', async ({ page }) => {
    await page.getByTestId('folder-my').getByText(/My Trips/).click()
    await expect(page.getByText('Ruta Este')).not.toBeVisible()
  })

  test('clicking folder header again re-expands it', async ({ page }) => {
    const header = page.getByTestId('folder-my').getByText(/My Trips/)
    await header.click()
    await expect(page.getByText('Ruta Este')).not.toBeVisible()
    await header.click()
    await expect(page.getByText('Ruta Este')).toBeVisible()
  })
})

// ── Favorites ───────────────────────────────────────────────────────────────

test.describe('Dashboard — favorites', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
  })

  test('toggling the Favorites chip hides non-favorite trips', async ({ page }) => {
    // No favorites set → toggling Favorites filter should show no trips
    await page.getByRole('button', { name: /Favorites/i }).click()
    await expect(page.getByText(/No trips found/i)).toBeVisible()
  })
})

// Add-folder tests removed: folders are now computed by user role
// (My Trips / All Trips), no longer a data entity to create.

// ── Copy trip ────────────────────────────────────────────────────────────────

test.describe('Dashboard — copy trip', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
  })

  test('copy button is present in trip actions', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Copy itinerary' }).first()).toBeAttached()
  })

  test('opens copy dialog when clicking copy button', async ({ page }) => {
    await page.getByText('Ruta Este').hover()
    await page.getByRole('button', { name: 'Copy itinerary' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Copy itinerary' })).toBeVisible()
  })

  test('copy dialog pre-fills name with "Copy of {trip.label}"', async ({ page }) => {
    await page.getByText('Ruta Este').hover()
    await page.getByRole('button', { name: 'Copy itinerary' }).first().click()
    await expect(page.getByLabel('New itinerary name')).toHaveValue('Copy of Ruta Este')
  })

  test('Copy button is disabled when name is empty', async ({ page }) => {
    await page.getByText('Ruta Este').hover()
    await page.getByRole('button', { name: 'Copy itinerary' }).first().click()
    await page.getByLabel('New itinerary name').fill('')
    await expect(page.getByRole('button', { name: 'Copy' })).toBeDisabled()
  })

  test('confirming copy adds the new trip to the list', async ({ page }) => {
    await page.getByText('Ruta Este').hover()
    await page.getByRole('button', { name: 'Copy itinerary' }).first().click()
    await page.getByLabel('New itinerary name').fill('Mi Ruta Personalizada')
    await page.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByText('Mi Ruta Personalizada')).toBeVisible()
  })

  test('copy dialog can be cancelled', async ({ page }) => {
    await page.getByText('Ruta Este').hover()
    await page.getByRole('button', { name: 'Copy itinerary' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
