import { test, expect } from '@playwright/test'
import { setupAllowedUserAuth } from './helpers.js'

const GATEWAY_TRIP_ID = 'canada-trip'

/** Set up an allowed user with an EMPTY registry — first-run scenario. */
async function setupEmptyRegistry(page) {
  const userEmail = 'user@test.com'
  await page.addInitScript(
    ({ userEmail, gatewayTripId }) => {
      window.__mockAuth = {
        currentUser: {
          email: userEmail, uid: 'user-uid', displayName: 'Regular User',
          getIdToken: () => Promise.resolve('mock-id-token'),
          getIdTokenResult: () => Promise.resolve({ claims: {} }),
        },
      }
      window.__mockFirestore = {
        docs: {
          [`trips/${gatewayTripId}/allowed_users/${userEmail}`]: { email: userEmail },
          [`trips/${gatewayTripId}/registry/main`]: { folders: [] },
        },
      }
      // Suppress bundled trip-registry seed too
      window.localStorage.setItem('trips-registry', '[]')
    },
    { userEmail, gatewayTripId: GATEWAY_TRIP_ID },
  )
}

// ── First-run experience ───────────────────────────────────────────────────

test.describe('Onboarding — first-run empty dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupEmptyRegistry(page)
    await page.goto('/')
  })

  test('shows the empty-dashboard panel with all three CTAs', async ({ page }) => {
    await expect(page.getByTestId('empty-dashboard')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('empty-cta-ai')).toBeVisible()
    await expect(page.getByTestId('empty-cta-template')).toBeVisible()
    await expect(page.getByTestId('empty-cta-paste')).toBeVisible()
  })

  test('does NOT show the search bar or trip list when registry is empty', async ({ page }) => {
    await expect(page.getByTestId('empty-dashboard')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('Search trip...')).not.toBeVisible()
  })

  test('clicking "Pick a template" opens the dialog on the Templates tab', async ({ page }) => {
    await page.getByTestId('empty-cta-template').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('template-grid')).toBeVisible()
  })

  test('clicking "Paste my own JSON" opens the dialog on the Paste tab', async ({ page }) => {
    await page.getByTestId('empty-cta-paste').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByPlaceholder(/version.*title.*My trip/i)).toBeVisible()
  })
})

// ── Add Trip dialog — tabs ─────────────────────────────────────────────────

test.describe('Onboarding — Add Trip dialog tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
  })

  async function openAddTripDialog(page) {
    // Hover on folder to reveal action buttons; click + on the folder row
    await page.getByText('Canadá').hover()
    await page.getByRole('button', { name: 'Add itinerary' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }

  test('opens with Templates tab selected by default', async ({ page }) => {
    await openAddTripDialog(page)
    await expect(page.getByTestId('template-grid')).toBeVisible()
  })

  test('switching to Build with AI tab shows the AI builder button', async ({ page }) => {
    await openAddTripDialog(page)
    await page.getByTestId('addtrip-tab-ai').click()
    await expect(page.getByTestId('build-with-ai-btn')).toBeVisible()
  })

  test('switching to Paste tab shows the JSON textarea', async ({ page }) => {
    await openAddTripDialog(page)
    await page.getByTestId('addtrip-tab-paste').click()
    await expect(page.getByPlaceholder(/version.*title.*My trip/i)).toBeVisible()
  })

  test('switching to Upload tab shows the upload button', async ({ page }) => {
    await openAddTripDialog(page)
    await page.getByTestId('addtrip-tab-upload').click()
    await expect(page.getByRole('button', { name: /Upload file/i })).toBeVisible()
  })
})

// ── Templates flow ─────────────────────────────────────────────────────────

test.describe('Onboarding — templates', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
  })

  test('selecting a template and confirming creates a trip in the folder', async ({ page }) => {
    await page.getByText('Canadá').hover()
    await page.getByRole('button', { name: 'Add itinerary' }).first().click()
    await expect(page.getByTestId('template-grid')).toBeVisible()
    await page.getByTestId('template-tile-city-break-3d').click()
    // Template selection populates the name field — confirm button should add the trip
    await page.getByTestId('addtrip-confirm').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    // The new trip appears in the list (template name is "City break — 3 days")
    await expect(page.getByText(/City break — 3 days/)).toBeVisible()
  })

  test('confirming with no template selected shows an error', async ({ page }) => {
    await page.getByText('Canadá').hover()
    await page.getByRole('button', { name: 'Add itinerary' }).first().click()
    // Provide a name but skip picking a template
    await page.getByLabel('Itinerary name').fill('Untitled')
    await page.getByTestId('addtrip-confirm').click()
    // Dialog stays open and an alert with the pick-template-first message appears
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Pick a template first/i)).toBeVisible()
  })
})

// ── Build with AI button ───────────────────────────────────────────────────

test.describe('Onboarding — build with AI', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
  })

  test('clicking Build with AI from the dialog closes it and opens the agent', async ({ page }) => {
    await page.getByText('Canadá').hover()
    await page.getByRole('button', { name: 'Add itinerary' }).first().click()
    await page.getByTestId('addtrip-tab-ai').click()
    await page.getByTestId('build-with-ai-btn').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    // Agent FAB is always present; the drawer becomes visible once opened.
    await expect(page.getByText(/Asistente de viaje/)).toBeVisible({ timeout: 3000 })
  })
})
