import { test, expect } from '@playwright/test'
import { setupAllowedUserAuth, setupUserWithNotes } from './helpers.js'

const USER_EMAIL = 'user@test.com'

async function openTrip(page) {
  await page.getByText('Ruta Este').click()
  await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
}

// Day 1's subtitle in MOCK_ITINERARY. Expanding it reveals the Group notes section.
async function expandDay1(page) {
  await page.getByText('Llegada Nocturna').click()
}

test.describe('Day notes — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
    await expandDay1(page)
  })

  test('shows the Group notes section header on an expanded day', async ({ page }) => {
    await expect(page.getByText('Group notes')).toBeVisible()
  })

  test('shows the empty-state message when there are no notes', async ({ page }) => {
    await expect(page.getByText('No notes yet — be the first.')).toBeVisible()
  })

  test('shows the note input with placeholder', async ({ page }) => {
    await expect(page.getByPlaceholder('Write a note...')).toBeVisible()
  })

  test('send button is disabled until text is entered', async ({ page }) => {
    // The notes send button sits in the same row as the note input; scope to
    // it (and exclude the AI agent's send button, which shares the icon).
    const send = page.locator('button:has([data-testid="SendIcon"]):not([data-testid="agent-send-btn"])').first()
    await expect(send).toBeDisabled()
    await page.getByPlaceholder('Write a note...').fill('Remember sunscreen')
    await expect(send).toBeEnabled()
  })

  test('send button re-disables when input is cleared', async ({ page }) => {
    const input = page.getByPlaceholder('Write a note...')
    // The notes send button sits in the same row as the note input; scope to
    // it (and exclude the AI agent's send button, which shares the icon).
    const send = page.locator('button:has([data-testid="SendIcon"]):not([data-testid="agent-send-btn"])').first()
    await input.fill('temp')
    await expect(send).toBeEnabled()
    await input.fill('')
    await expect(send).toBeDisabled()
  })
})

test.describe('Day notes — pre-seeded notes', () => {
  const NOTES = [
    { id: 'n1', tripId: 'canada-trip', dayNumber: 1, text: 'Bring the voltage adapter', authorEmail: USER_EMAIL, authorName: 'Regular User' },
    { id: 'n2', tripId: 'canada-trip', dayNumber: 1, text: 'Hotel check-in is after 3pm', authorEmail: 'friend@test.com', authorName: 'Travel Friend' },
    { id: 'n3', tripId: 'canada-trip', dayNumber: 2, text: 'This note belongs to day 2', authorEmail: USER_EMAIL, authorName: 'Regular User' },
  ]

  test.beforeEach(async ({ page }) => {
    await setupUserWithNotes(page, NOTES)
    await page.goto('/')
    await page.getByText('Ruta Este').waitFor({ timeout: 5000 })
    await openTrip(page)
    await expandDay1(page)
  })

  test('renders notes for the expanded day', async ({ page }) => {
    await expect(page.getByText('Bring the voltage adapter')).toBeVisible()
    await expect(page.getByText('Hotel check-in is after 3pm')).toBeVisible()
  })

  test('does not render notes belonging to other days', async ({ page }) => {
    await expect(page.getByText('This note belongs to day 2')).not.toBeVisible()
  })

  test('labels the current user\'s own note as "You"', async ({ page }) => {
    await expect(page.getByText('You', { exact: true })).toBeVisible()
  })

  test('shows another user\'s display name on their note', async ({ page }) => {
    await expect(page.getByText('Travel Friend')).toBeVisible()
  })

  test('hides the empty-state message when notes exist', async ({ page }) => {
    await expect(page.getByText('No notes yet — be the first.')).not.toBeVisible()
  })
})
