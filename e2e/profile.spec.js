import { test, expect } from '@playwright/test'
import { setupAllowedUserAuth } from './helpers.js'

const USER_EMAIL = 'user@test.com'

test.describe('Traveler profile dialog', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Canadá').waitFor({ timeout: 5000 })
  })

  test('opens from the dashboard with empty fields when no profile exists', async ({ page }) => {
    await page.getByTestId('dashboard-profile-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Traveler profile|Perfil de viajero/)).toBeVisible()
    // Privacy note should be visible
    await expect(page.getByText(/Stored only in your account|Se guarda solo en tu cuenta/)).toBeVisible()
    // Empty by default
    await expect(page.getByTestId('profile-passport-number')).toHaveValue('')
    await expect(page.getByTestId('profile-home-currency')).toHaveValue('')
  })

  test('saving a value persists across reopens and writes the users/{email} doc', async ({ page }) => {
    await page.getByTestId('dashboard-profile-btn').click()
    await page.getByTestId('profile-passport-number').fill('AB-12345')
    await page.getByTestId('profile-home-currency').fill('usd')   // gets uppercased on save
    await page.getByTestId('profile-passport-expiry').fill('2030-01-15')
    await page.getByTestId('profile-save').click()

    // Dialog closes after successful save
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // The mock writes through window.__mockFirestore.docs — assert the doc shape
    const stored = await page.evaluate(
      (email) => window.__mockFirestore?.docs?.[`users/${email}`],
      USER_EMAIL,
    )
    expect(stored).toMatchObject({
      passportNumber: 'AB-12345',
      passportExpiry: '2030-01-15',
      homeCurrency:   'USD',
    })

    // Reopen — values should reload from Firestore
    await page.getByTestId('dashboard-profile-btn').click()
    await expect(page.getByTestId('profile-passport-number')).toHaveValue('AB-12345')
    await expect(page.getByTestId('profile-home-currency')).toHaveValue('USD')
    await expect(page.getByTestId('profile-passport-expiry')).toHaveValue('2030-01-15')
  })

  test('cancel discards in-flight changes', async ({ page }) => {
    await page.getByTestId('dashboard-profile-btn').click()
    await page.getByTestId('profile-passport-number').fill('SHOULD-NOT-PERSIST')
    await page.getByRole('button', { name: /cancel|cancelar/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const stored = await page.evaluate(
      (email) => window.__mockFirestore?.docs?.[`users/${email}`],
      USER_EMAIL,
    )
    expect(stored).toBeUndefined()
  })

  test('opens from the in-trip header menu and reflects values saved from the dashboard', async ({ page }) => {
    // Save a value from the dashboard first
    await page.getByTestId('dashboard-profile-btn').click()
    await page.getByTestId('profile-home-currency').fill('CAD')
    await page.getByTestId('profile-save').click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Enter a trip — the header (with profile button) becomes available
    await page.getByText('Ruta Este').click()
    await page.getByTestId('header-profile-btn').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('profile-home-currency')).toHaveValue('CAD')
  })
})
