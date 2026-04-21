import { test, expect } from '@playwright/test'
import { setupAdminAuth, setupAllowedUserAuth } from './helpers.js'

// Inject app-settings/config doc into the mock Firestore to simulate a saved language.
async function setupWithLanguage(page, setupFn, language) {
  await setupFn(page)
  await page.addInitScript((lang) => {
    if (!window.__mockFirestore) window.__mockFirestore = { docs: {} }
    if (!window.__mockFirestore.docs) window.__mockFirestore.docs = {}
    window.__mockFirestore.docs['app-settings/config'] = { language: lang }
  }, language)
}

// ── Default language (English) ────────────────────────────────────────────────

test.describe('i18n — default language is English', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByRole('heading', { name: /My Trips/i }).waitFor({ timeout: 5000 })
  })

  test('dashboard heading is in English', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /My Trips/i })).toBeVisible()
  })

  test('search placeholder is in English', async ({ page }) => {
    await expect(page.getByPlaceholder('Search trip...')).toBeVisible()
  })

  test('sign-out button is in English', async ({ page }) => {
    await expect(page.getByText('Sign Out').first()).toBeVisible()
  })

  test('Favorites chip is in English', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Favorites/i })).toBeVisible()
  })

  test('Add destination button is in English', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Add destination/i })).toBeVisible()
  })
})

// ── Spanish language (via Firestore app-settings) ─────────────────────────────

test.describe('i18n — Spanish language from Firestore config', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithLanguage(page, setupAllowedUserAuth, 'es')
    await page.goto('/')
    await page.getByRole('heading', { name: /Mis Viajes/i }).waitFor({ timeout: 5000 })
  })

  test('dashboard heading is in Spanish', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Mis Viajes/i })).toBeVisible()
  })

  test('search placeholder is in Spanish', async ({ page }) => {
    await expect(page.getByPlaceholder('Buscar viaje...')).toBeVisible()
  })

  test('Favorites chip is in Spanish', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Favoritos/i })).toBeVisible()
  })

  test('Add destination button is in Spanish', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Agregar destino/i })).toBeVisible()
  })
})

// ── Admin panel language switcher ─────────────────────────────────────────────

test.describe('i18n — admin panel language switcher', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByRole('button', { name: /Manage access/i }).waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: /Manage access/i }).click()
    await page.getByRole('dialog').waitFor()
  })

  test('language section is visible in admin panel', async ({ page }) => {
    await expect(page.getByText('Language', { exact: false })).toBeVisible()
  })

  test('EN toggle button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible()
  })

  test('ES toggle button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Español' })).toBeVisible()
  })

  test('English toggle button is selected by default', async ({ page }) => {
    // The EN toggle should have aria-pressed="true" when language is English
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
  })
})

// When Spanish is pre-loaded via Firestore, the admin panel reflects it
test.describe('i18n — admin panel with Spanish pre-loaded', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithLanguage(page, setupAdminAuth, 'es')
    await page.goto('/')
    // In Spanish the Tooltip title becomes "Gestionar accesos"
    await page.getByRole('button', { name: /Gestionar accesos/i }).waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: /Gestionar accesos/i }).click()
    await page.getByRole('dialog').waitFor()
  })

  test('admin panel title is in Spanish when Spanish is pre-loaded', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Gestionar accesos/i })).toBeVisible()
  })

  test('Español toggle is selected when Spanish is pre-loaded', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true')
  })
})

// ── Language switcher is NOT visible for non-admin ────────────────────────────

test.describe('i18n — language switcher hidden from non-admin', () => {
  test('non-admin user does not see the Access/admin panel button', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /Manage access/i })).not.toBeVisible()
  })
})
