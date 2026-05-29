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

  test('shows the empty-dashboard panel with AI + Paste CTAs', async ({ page }) => {
    await expect(page.getByTestId('empty-dashboard')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('empty-cta-ai')).toBeVisible()
    await expect(page.getByTestId('empty-cta-paste')).toBeVisible()
    // Templates feature was removed
    await expect(page.getByTestId('empty-cta-template')).not.toBeVisible()
  })

  test('does NOT show the search bar or trip list when registry is empty', async ({ page }) => {
    await expect(page.getByTestId('empty-dashboard')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('Search trip...')).not.toBeVisible()
  })

  test('clicking "Paste my own JSON" opens the dialog on the Paste tab', async ({ page }) => {
    await page.getByTestId('empty-cta-paste').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByPlaceholder(/version.*title.*My trip/i)).toBeVisible()
  })

  test('describe-trip input is visible and submit is disabled when empty', async ({ page }) => {
    await expect(page.getByTestId('empty-describe-input')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('empty-describe-submit')).toBeDisabled()
  })

  test('typing in the describe-trip input enables the submit button', async ({ page }) => {
    await page.getByTestId('empty-describe-input').fill('7 days in Costa Rica, family of 4, wildlife')
    await expect(page.getByTestId('empty-describe-submit')).toBeEnabled()
  })

  test('submitting the describe-trip input opens the agent with the text pre-filled', async ({ page }) => {
    const seed = '7 days in Costa Rica, family of 4, wildlife'
    await page.getByTestId('empty-describe-input').fill(seed)
    await page.getByTestId('empty-describe-submit').click()

    // The agent drawer should open with the seed text pre-filled in its input
    await expect(page.getByTestId('agent-input')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('agent-input')).toHaveValue(seed)
  })

  test('no "Canadá" folder or canada-trip references leak into a new user', async ({ page }) => {
    // Empty registry → no Canadá folder should appear
    await expect(page.getByTestId('empty-dashboard')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Canadá')).not.toBeVisible()
    await expect(page.getByText(/Ruta (Este|Oeste)/i)).not.toBeVisible()
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

  test('opens with Build with AI tab selected by default', async ({ page }) => {
    await openAddTripDialog(page)
    // AI tab is default; wizard's first question should be visible
    await expect(page.getByText(/Where are you going|¿A dónde van/i)).toBeVisible({ timeout: 5000 })
  })

  test('switching to Build with AI tab shows the wizard first question', async ({ page }) => {
    await openAddTripDialog(page)
    await page.getByTestId('addtrip-tab-ai').click()
    // The AI tab now renders the TripPlannerWizard inline — first question is "Where are you going?"
    await expect(page.getByText(/Where are you going|¿A dónde van/i)).toBeVisible({ timeout: 5000 })
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

