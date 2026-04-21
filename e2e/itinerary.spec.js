import { test, expect } from '@playwright/test'
import { setupAdminAuth, setupAllowedUserAuth } from './helpers.js'

// Navigate to the itinerary view by clicking a trip from the dashboard.
// "Ruta Este" = canada-trip (gateway trip), loads from mock Firestore.
async function openTrip(page, tripLabel = 'Ruta Este') {
  await page.getByText(tripLabel).click()
  await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
}

// Helper: click the AccordionSummary for a specific day by its subtitle text.
// The subtitle only appears in the summary header, so it is always a unique selector.
async function expandDay(page, subtitle) {
  await page.getByText(subtitle).click()
}


// ── Itinerary view renders ─────────────────────────────────────────────────

test.describe('Itinerary view — renders', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
  })

  test('shows the itinerary title', async ({ page }) => {
    await expect(page.getByText('Itinerario Canadá')).toBeVisible()
  })

  test('shows the part section title', async ({ page }) => {
    await expect(page.getByText('Las Rocosas')).toBeVisible()
  })

  test('shows day cards in the list', async ({ page }) => {
    // Use .first() because location text may also appear hidden inside collapsed details
    await expect(page.getByText('Calgary').first()).toBeVisible()
    await expect(page.getByText('Exploración Inicial')).toBeVisible() // Day 2 subtitle
  })

  test('shows back button', async ({ page }) => {
    // Back button text is "My Trips" (with ArrowBackIcon)
    await expect(page.getByRole('button', { name: 'My Trips' })).toBeVisible()
  })
})

// ── DayCard expand / collapse ──────────────────────────────────────────────

test.describe('Itinerary view — DayCard accordion', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
  })

  test('day details are hidden before expanding', async ({ page }) => {
    // Activity text is inside the accordion details — not visible when collapsed
    await expect(page.getByText('Aterrizaje en YYC').first()).not.toBeVisible()
  })

  test('expanding a day card shows its activities', async ({ page }) => {
    await expandDay(page, 'Llegada Nocturna') // Day 1 subtitle
    await expect(page.getByText('Aterrizaje en YYC').first()).toBeVisible()
    await expect(page.getByText('Check-in y descanso').first()).toBeVisible()
  })

  test('expanding a day card shows logistics', async ({ page }) => {
    await expandDay(page, 'Llegada Nocturna')
    await expect(page.getByText(/SJO → YYC/).first()).toBeVisible()
    await expect(page.getByText(/Hotel Centro Calgary/).first()).toBeVisible()
  })

  test('expanding a day card shows tips', async ({ page }) => {
    await expandDay(page, 'Llegada Nocturna')
    await expect(page.getByText('Recuerda el adaptador de voltaje')).toBeVisible()
  })

  test('expanding a day card shows links', async ({ page }) => {
    await expandDay(page, 'Llegada Nocturna')
    await expect(page.getByText('Calgary Tower')).toBeVisible()
  })

  test('expanding day 2 shows its warning', async ({ page }) => {
    await expandDay(page, 'Exploración Inicial') // Day 2 subtitle — unique
    await expect(page.getByText('Lleva ropa de abrigo')).toBeVisible()
  })
})

// ── Back navigation ────────────────────────────────────────────────────────

test.describe('Itinerary view — navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
  })

  test('back button returns to the dashboard', async ({ page }) => {
    await page.getByRole('button', { name: 'My Trips' }).click()
    await expect(page.getByRole('heading', { name: /My Trips/i })).toBeVisible()
  })
})

// ── Edit mode (author only) ────────────────────────────────────────────────

test.describe('Itinerary view — edit mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
  })

  test('edit toggle button is visible for admin', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Edit/ })).toBeVisible()
  })

  test('activating edit mode expands all day cards with edit fields', async ({ page }) => {
    await page.getByRole('button', { name: /Edit/ }).click()
    await expect(page.getByLabel('Location').first()).toBeVisible()
  })
})

test.describe('Itinerary view — author-only access', () => {
  test('edit button is NOT visible for a non-author user', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
    await expect(page.getByRole('button', { name: /Edit/ })).not.toBeVisible()
  })
})

// ── Version history (author access) ───────────────────────────────────────

test.describe('Itinerary view — version history', () => {
  test('Versions button is visible for the itinerary author', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
    await expect(page.getByRole('button', { name: /Versions/ })).toBeVisible()
  })

  test('Versions button is NOT visible for non-author users', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
    await expect(page.getByRole('button', { name: /Versions/ })).not.toBeVisible()
  })

  test('clicking Versions opens the version history modal', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
    await page.getByRole('button', { name: /Versions/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Version history')).toBeVisible()
  })
})
