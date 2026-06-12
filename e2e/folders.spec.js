import { test, expect } from '@playwright/test'
import {
  setupAllowedUserAuth,
  setupAdminWithMixedTrips,
  setupUserWithOthersTrips,
} from './helpers.js'

// ── Role-based folder view ───────────────────────────────────────────────────
// After dropping real folders, the dashboard computes folders by role:
//   - everyone sees "My Trips" (trips they authored)
//   - admin additionally sees "All Trips" (every other author's trips)

test.describe('Folders — regular user', () => {
  test('sees only the My Trips folder, no All Trips', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('folder-all')).not.toBeVisible()
  })

  test('My Trips contains the trips they authored', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })
    // Both mock trips are authored by the user
    await expect(page.getByText('Ruta Este')).toBeVisible()
    await expect(page.getByText('Ruta Oeste')).toBeVisible()
  })

  test('does NOT see trips authored by other users', async ({ page }) => {
    await setupUserWithOthersTrips(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('My Own Trip')).toBeVisible()
    // Another user's private trip must not leak in
    await expect(page.getByText('Secret Other Trip')).not.toBeVisible()
    // And there's no All Trips folder for a non-admin
    await expect(page.getByTestId('folder-all')).not.toBeVisible()
  })
})

test.describe('Folders — admin user', () => {
  test('sees both My Trips and All Trips folders', async ({ page }) => {
    await setupAdminWithMixedTrips(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('folder-all')).toBeVisible()
  })

  test('My Trips shows admin-authored trips; All Trips shows the rest', async ({ page }) => {
    await setupAdminWithMixedTrips(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })

    // Admin authored "Ruta Este" → My Trips
    await expect(page.getByTestId('folder-my').getByText('Ruta Este')).toBeVisible()
    // Others' trips → All Trips
    await expect(page.getByTestId('folder-all').getByText('Japan Adventure')).toBeVisible()
    await expect(page.getByTestId('folder-all').getByText('Patagonia Trek')).toBeVisible()
    // Cross-check they aren't in the wrong folder
    await expect(page.getByTestId('folder-my').getByText('Japan Adventure')).not.toBeVisible()
    await expect(page.getByTestId('folder-all').getByText('Ruta Este')).not.toBeVisible()
  })

  test('admin can open another user\'s trip from All Trips', async ({ page }) => {
    await setupAdminWithMixedTrips(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-all')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('folder-all').getByText('Japan Adventure').click()
    // Trip view opens (back-to-dashboard button appears)
    await expect(page.getByRole('button', { name: 'My Trips' })).toBeVisible({ timeout: 5000 })
  })

  test('Add itinerary button only appears on My Trips, not All Trips', async ({ page }) => {
    await setupAdminWithMixedTrips(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })

    // My Trips folder has the + add button
    await page.getByTestId('folder-my').hover()
    await expect(page.getByTestId('folder-my').getByRole('button', { name: 'Add itinerary' })).toBeVisible()

    // All Trips folder does not
    await page.getByTestId('folder-all').hover()
    await expect(page.getByTestId('folder-all').getByRole('button', { name: 'Add itinerary' })).not.toBeVisible()
  })
})

test.describe('Folders — admin trip management', () => {
  test('admin sees a delete button on another user\'s trip in All Trips', async ({ page }) => {
    await setupAdminWithMixedTrips(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-all')).toBeVisible({ timeout: 5000 })

    // Hover a non-authored trip row; the delete (error) button should be present
    const row = page.getByTestId('folder-all').locator('div', { hasText: 'Japan Adventure' }).first()
    await row.hover()
    // Admin override: delete is available even though admin isn't the author
    await expect(page.getByTestId('folder-all').getByRole('button', { name: /Delete/i }).first()).toBeVisible()
  })

  test('admin does NOT see Edit on another user\'s trip (author-only)', async ({ page }) => {
    await setupAdminWithMixedTrips(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-all')).toBeVisible({ timeout: 5000 })

    const row = page.getByTestId('folder-all').locator('div', { hasText: 'Japan Adventure' }).first()
    await row.hover()
    // Edit is author-gated; admin is not the author → no Edit button on this row
    await expect(page.getByTestId('folder-all').getByRole('button', { name: /^Edit/i })).not.toBeVisible()
  })

  test('admin deleting another user\'s trip removes it from the list', async ({ page }) => {
    await setupAdminWithMixedTrips(page)
    // Auto-accept the confirm() dialog
    page.on('dialog', d => d.accept())
    await page.goto('/')
    await expect(page.getByTestId('folder-all')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Japan Adventure')).toBeVisible()

    const row = page.getByTestId('folder-all').locator('div', { hasText: 'Japan Adventure' }).first()
    await row.hover()
    await page.getByTestId('folder-all').getByRole('button', { name: /Delete/i }).first().click()

    await expect(page.getByText('Japan Adventure')).not.toBeVisible({ timeout: 5000 })
    // The other trip is untouched
    await expect(page.getByText('Patagonia Trek')).toBeVisible()
  })
})

test.describe('Folders — viewer privacy via share dialog', () => {
  test('author can open the manage-viewers dialog on their own trip', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await expect(page.getByTestId('folder-my')).toBeVisible({ timeout: 5000 })

    await page.getByText('Ruta Este').hover()
    await page.getByTestId('folder-my').getByRole('button', { name: 'Manage viewers' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
