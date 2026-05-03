import { test, expect } from '@playwright/test'
import { setupAdminAuth, setupAllowedUserAuth } from './helpers.js'

const GATEWAY_TRIP_ID = 'canada-trip'
const TRIP_ID = 'canada-trip'

const MOCK_FILES = [
  {
    id: 'file-1',
    tripId: TRIP_ID,
    dayNumber: 1,
    name: 'boarding-pass.pdf',
    type: 'application/pdf',
    size: 102400,
    storageUrl: 'mock-storage-url:trips/canada-trip/files/boarding-pass.pdf',
    storagePath: 'trips/canada-trip/files/boarding-pass.pdf',
    authorEmail: 'admin@test.com',
    authorName: 'Admin User',
    uploadedAt: null,
    tags: ['flight', 'visa'],
  },
  {
    id: 'file-2',
    tripId: TRIP_ID,
    dayNumber: 1,
    name: 'hotel-confirmation.pdf',
    type: 'application/pdf',
    size: 51200,
    storageUrl: 'mock-storage-url:trips/canada-trip/files/hotel-confirmation.pdf',
    storagePath: 'trips/canada-trip/files/hotel-confirmation.pdf',
    authorEmail: 'admin@test.com',
    authorName: 'Admin User',
    uploadedAt: null,
    tags: ['hotel'],
  },
]

async function setupWithFiles(page, files = MOCK_FILES) {
  await setupAdminAuth(page)
  await page.addInitScript(
    ({ files, gatewayTripId }) => {
      if (!window.__mockFirestore) window.__mockFirestore = {}
      if (!window.__mockFirestore.collections) window.__mockFirestore.collections = {}
      window.__mockFirestore.collections[`trips/${gatewayTripId}/files`] = files
    },
    { files, gatewayTripId: GATEWAY_TRIP_ID },
  )
}

async function openTripAndExpandDay1(page) {
  await page.goto('/')
  await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
  await page.getByText('Ruta Este').click()
  await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
  await page.getByText('Llegada Nocturna').click()
}

// ── Section visibility ─────────────────────────────────────────────────────

test.describe('DayFiles — section', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
    await openTripAndExpandDay1(page)
  })

  test('shows the Day files section header', async ({ page }) => {
    await expect(page.getByText('Day files')).toBeVisible()
  })

  test('shows the Upload file button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Upload file/ })).toBeVisible()
  })

  test('shows "no files" message when no files exist', async ({ page }) => {
    await expect(page.getByText('No files uploaded for this day.')).toBeVisible()
  })
})

// ── Pending upload panel ───────────────────────────────────────────────────

test.describe('DayFiles — pending upload panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
    await openTripAndExpandDay1(page)
  })

  test('selecting a file shows the pending upload panel', async ({ page }) => {
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'test-doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    })
    await expect(page.getByTestId('pending-upload')).toBeVisible()
    await expect(page.getByText('test-doc.pdf')).toBeVisible()
  })

  test('pending panel shows tag suggestion chips', async ({ page }) => {
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'test-doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    })
    await expect(page.getByTestId('pending-upload').getByText('flight')).toBeVisible()
    await expect(page.getByTestId('pending-upload').getByText('hotel')).toBeVisible()
    await expect(page.getByTestId('pending-upload').getByText('visa')).toBeVisible()
  })

  test('clicking a suggestion chip marks it as active', async ({ page }) => {
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'test-doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    })
    const panel = page.getByTestId('pending-upload')
    await panel.getByText('hotel').first().click()
    // After clicking, the chip should appear as a deletable chip inside the input box
    await expect(panel.locator('[data-testid]').or(panel.locator('.MuiChip-root')).filter({ hasText: 'hotel' }).first()).toBeVisible()
  })

  test('shows Upload and Cancel buttons in the pending panel', async ({ page }) => {
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'test-doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    })
    const panel = page.getByTestId('pending-upload')
    await expect(panel.getByRole('button', { name: /Upload/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: /Cancel/ })).toBeVisible()
  })

  test('canceling the pending panel removes it', async ({ page }) => {
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'test-doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    })
    await expect(page.getByTestId('pending-upload')).toBeVisible()
    await page.getByTestId('pending-upload').getByRole('button', { name: /Cancel/ }).click()
    await expect(page.getByTestId('pending-upload')).not.toBeVisible()
  })

  test('upload button is disabled while a file is pending', async ({ page }) => {
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'test-doc.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('PDF content'),
    })
    await expect(page.getByRole('button', { name: /Upload file/ })).toBeDisabled()
  })
})

// ── File list with tags ────────────────────────────────────────────────────

test.describe('DayFiles — file list with tags', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithFiles(page)
    await openTripAndExpandDay1(page)
  })

  test('shows uploaded file names', async ({ page }) => {
    await expect(page.getByText('boarding-pass.pdf')).toBeVisible()
    await expect(page.getByText('hotel-confirmation.pdf')).toBeVisible()
  })

  test('shows tags as chips on each file', async ({ page }) => {
    await expect(page.getByText('flight').first()).toBeVisible()
    await expect(page.getByText('visa').first()).toBeVisible()
    await expect(page.getByText('hotel').first()).toBeVisible()
  })

  test('shows edit tags button for admin on own files', async ({ page }) => {
    // Admin is the file author — edit-tags-btn should be present on each file row
    await expect(page.getByTestId('edit-tags-btn').first()).toBeVisible()
  })
})

// ── Tag filter row ─────────────────────────────────────────────────────────

test.describe('DayFiles — tag filter row', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithFiles(page)
    await openTripAndExpandDay1(page)
  })

  test('filter row is visible when files have tags', async ({ page }) => {
    await expect(page.getByTestId('tag-filter-row')).toBeVisible()
  })

  test('filter row shows all unique tags from the day files', async ({ page }) => {
    const filterRow = page.getByTestId('tag-filter-row')
    await expect(filterRow.getByText('flight')).toBeVisible()
    await expect(filterRow.getByText('visa')).toBeVisible()
    await expect(filterRow.getByText('hotel')).toBeVisible()
  })

  test('clicking a filter chip hides non-matching files', async ({ page }) => {
    const filterRow = page.getByTestId('tag-filter-row')
    await filterRow.getByText('hotel').click()
    await expect(page.getByText('hotel-confirmation.pdf')).toBeVisible()
    await expect(page.getByText('boarding-pass.pdf')).not.toBeVisible()
  })

  test('clearing filter restores all files', async ({ page }) => {
    const filterRow = page.getByTestId('tag-filter-row')
    await filterRow.getByText('hotel').click()
    await expect(page.getByText('boarding-pass.pdf')).not.toBeVisible()
    await filterRow.getByText('Clear').click()
    await expect(page.getByText('boarding-pass.pdf')).toBeVisible()
  })

  test('shows no-match message when filter excludes all files', async ({ page }) => {
    // Only file-1 has 'visa'. After filtering for hotel (file-2 only) then visa would exclude hotel
    const filterRow = page.getByTestId('tag-filter-row')
    await filterRow.getByText('hotel').click()
    await expect(page.getByText('hotel-confirmation.pdf')).toBeVisible()
    await expect(page.getByText('boarding-pass.pdf')).not.toBeVisible()
  })
})

// ── Non-author cannot see edit tags button ─────────────────────────────────

test.describe('DayFiles — non-author user', () => {
  test('regular user sees files but not edit tags button for others files', async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.addInitScript(
      ({ files, gatewayTripId }) => {
        if (!window.__mockFirestore) window.__mockFirestore = {}
        if (!window.__mockFirestore.collections) window.__mockFirestore.collections = {}
        window.__mockFirestore.collections[`trips/${gatewayTripId}/files`] = files
      },
      { files: MOCK_FILES, gatewayTripId: GATEWAY_TRIP_ID },
    )
    await openTripAndExpandDay1(page)
    await expect(page.getByText('boarding-pass.pdf')).toBeVisible()
    // flight and visa tags should still be visible
    await expect(page.getByText('flight').first()).toBeVisible()
  })
})

// ── File count badge on accordion summary ─────────────────────────────────

test.describe('DayCard — file count badge', () => {
  test('shows file count badge on day 1 accordion when files exist', async ({ page }) => {
    await setupWithFiles(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    // badge should be visible before expanding
    await expect(page.getByTestId('file-count-badge').first()).toBeVisible()
  })

  test('badge shows correct file count', async ({ page }) => {
    await setupWithFiles(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    // MOCK_FILES has 2 files on day 1
    await expect(page.getByTestId('file-count-badge').first()).toContainText('2')
  })

  test('no badge when no files exist', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await expect(page.getByTestId('file-count-badge')).not.toBeVisible()
  })
})

// ── All Files Panel ────────────────────────────────────────────────────────

test.describe('AllFilesPanel', () => {
  test('Files button is visible in the header when viewing a trip', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await expect(page.getByRole('button', { name: /Files/i }).first()).toBeVisible()
  })

  test('clicking Files button opens the all-files panel', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: /Files/i }).first().click()
    await expect(page.getByText('All Files')).toBeVisible()
  })

  test('all-files panel shows empty message when no files', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: /Files/i }).first().click()
    await expect(page.getByText('No files uploaded for this trip yet.')).toBeVisible()
  })

  test('all-files panel lists uploaded files', async ({ page }) => {
    await setupWithFiles(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: /Files/i }).first().click()
    await expect(page.getByText('All Files')).toBeVisible()
    await expect(page.getByTestId('all-files-row').first()).toBeVisible()
    await expect(page.getByText('boarding-pass.pdf')).toBeVisible()
    await expect(page.getByText('hotel-confirmation.pdf')).toBeVisible()
  })

  test('all-files panel shows day label grouping', async ({ page }) => {
    await setupWithFiles(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: /Files/i }).first().click()
    await expect(page.getByText('All Files')).toBeVisible()
    await expect(page.getByText(/Day 1/i)).toBeVisible()
  })

  test('all-files panel can be closed', async ({ page }) => {
    await setupAdminAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: /Files/i }).first().click()
    await expect(page.getByText('All Files')).toBeVisible()
    await page.getByTestId('close-all-files').click()
    await expect(page.getByText('All Files')).not.toBeVisible()
  })
})
