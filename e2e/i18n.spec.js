import { test, expect } from '@playwright/test'
import { setupAdminAuth, setupAllowedUserAuth } from './helpers.js'

// Pre-load a language via localStorage before the page starts.
async function setupWithLanguage(page, setupFn, language) {
  await setupFn(page)
  await page.addInitScript((lang) => {
    localStorage.setItem('lang', lang)
  }, language)
}

// Pre-load a user-assigned language in the allowed_users Firestore doc.
async function setupWithAssignedLang(page, setupFn, language) {
  await setupFn(page)
  await page.addInitScript((lang) => {
    const email = window.__mockAuth?.currentUser?.email
    // __mockAuth may not be set yet — defer to DOMContentLoaded
    window.addEventListener('DOMContentLoaded', () => {
      const email = window.__mockAuth?.currentUser?.email
      if (email && window.__mockFirestore?.docs) {
        const key = `trips/canada-trip/allowed_users/${email}`
        window.__mockFirestore.docs[key] = {
          ...(window.__mockFirestore.docs[key] || {}),
          language: lang,
        }
      }
    })
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

// ── Spanish language (via localStorage) ──────────────────────────────────────

test.describe('i18n — Spanish language from localStorage', () => {
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

// ── Language toggle in dashboard header ──────────────────────────────────────

test.describe('i18n — language toggle in dashboard header', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByRole('heading', { name: /My Trips/i }).waitFor({ timeout: 5000 })
  })

  test('EN toggle button is visible for any user', async ({ page }) => {
    await expect(page.getByTestId('lang-toggle').getByRole('button', { name: 'en' })).toBeVisible()
  })

  test('ES toggle button is visible for any user', async ({ page }) => {
    await expect(page.getByTestId('lang-toggle').getByRole('button', { name: 'es' })).toBeVisible()
  })

  test('EN button is active by default', async ({ page }) => {
    await expect(page.getByTestId('lang-toggle').getByRole('button', { name: 'en' })).toHaveAttribute('aria-pressed', 'true')
  })
})

// ── Spanish pre-loaded reflects in dashboard toggle ───────────────────────────

test.describe('i18n — Spanish pre-loaded via localStorage', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithLanguage(page, setupAllowedUserAuth, 'es')
    await page.goto('/')
    await page.getByRole('heading', { name: /Mis Viajes/i }).waitFor({ timeout: 5000 })
  })

  test('ES toggle button is active when Spanish is pre-loaded', async ({ page }) => {
    await expect(page.getByTestId('lang-toggle').getByRole('button', { name: 'es' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('EN toggle button is inactive when Spanish is pre-loaded', async ({ page }) => {
    await expect(page.getByTestId('lang-toggle').getByRole('button', { name: 'en' })).toHaveAttribute('aria-pressed', 'false')
  })
})

// ── Admin panel — app default language ───────────────────────────────────────

test.describe('i18n — admin panel app default language', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByRole('button', { name: /Manage access/i }).waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: /Manage access/i }).click()
    await page.getByRole('dialog').waitFor()
  })

  test('app default language section is visible', async ({ page }) => {
    await expect(page.getByText(/app default language/i)).toBeVisible()
  })

  test('English toggle is selected by default in app default section', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('Español toggle is visible in app default section', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Español' })).toBeVisible()
  })
})

// ── Admin panel — per-user language assignment ────────────────────────────────

test.describe('i18n — admin panel per-user language', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByRole('button', { name: /Manage access/i }).waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: /Manage access/i }).click()
    await page.getByRole('dialog').waitFor()
  })

  test('user list shows per-user EN language buttons', async ({ page }) => {
    // Each user row has inline en/es buttons
    const enButtons = page.getByRole('button', { name: 'en' })
    await expect(enButtons.first()).toBeVisible()
  })

  test('user list shows per-user ES language buttons', async ({ page }) => {
    const esButtons = page.getByRole('button', { name: 'es' })
    await expect(esButtons.first()).toBeVisible()
  })
})

// ── Admin panel button visibility ─────────────────────────────────────────────

test.describe('i18n — admin panel button visibility', () => {
  test('non-admin user does not see the Manage access button', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /Manage access/i })).not.toBeVisible()
  })

  test('admin user sees the Manage access button', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByRole('button', { name: /Manage access/i }).waitFor({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /Manage access/i })).toBeVisible()
  })
})
