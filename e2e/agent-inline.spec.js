import { test, expect } from '@playwright/test'
import { setupAdminAuth } from './helpers.js'

// MOCK_ITINERARY.author is the admin, and canEdit = (itinerary.author ===
// user.email). So the admin can edit → the agent surfaces proposed changes
// inline on the itinerary (review bar + day cards) instead of a chat diff card.

// A patch that adds an activity to Day 2 (Banff) of part 1.
const DAY2_PATCH = {
  parts: [
    { id: 1, days: [{ dayNumber: 2, activities: ['Visita Bow Falls', 'Paseo por Banff Avenue', 'Coffee plantation tour (2h)'] }] },
  ],
}

// A patch touching two days, for the review-bar multi-day case.
const MULTI_PATCH = {
  parts: [
    { id: 1, days: [
      { dayNumber: 1, location: 'Calgary Downtown' },
      { dayNumber: 2, activities: ['Visita Bow Falls', 'Paseo por Banff Avenue', 'Coffee plantation tour (2h)'] },
    ] },
  ],
}

function mockChatWithPatch(page, patch, response = 'I proposed a change.') {
  return page.route('**/agent/chat', async (route) => {
    const body =
      `event: token\ndata: ${JSON.stringify({ text: response })}\n\n` +
      `event: done\ndata: ${JSON.stringify({ response, patch })}\n\n`
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
}

async function openTripAndSend(page, prompt = 'Add a coffee tour to day 2') {
  await page.goto('/')
  await page.getByText('Ruta Este').click()
  await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
  await page.getByTestId('agent-fab').click()
  await expect(page.getByTestId('agent-input')).toBeVisible()
  await page.getByTestId('agent-input').fill(prompt)
  await page.getByTestId('agent-send-btn').click()
}

test.describe('AI Agent — inline review', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
  })

  test('a proposed patch shows the sticky review bar', async ({ page }) => {
    await mockChatWithPatch(page, DAY2_PATCH)
    await openTripAndSend(page)
    await expect(page.getByTestId('agent-review-bar')).toBeVisible({ timeout: 8000 })
  })

  test('the affected day card shows a Proposed badge and inline diff', async ({ page }) => {
    await mockChatWithPatch(page, DAY2_PATCH)
    await openTripAndSend(page)
    await expect(page.getByTestId('day-proposed-badge')).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId('day-card-diff')).toBeVisible()
    // The newly added activity appears as an added line in the diff
    await expect(page.getByText('Coffee plantation tour (2h)').first()).toBeVisible()
  })

  test('the chat shows an inline-review hint instead of a diff card', async ({ page }) => {
    await mockChatWithPatch(page, DAY2_PATCH)
    await openTripAndSend(page)
    await expect(page.getByTestId('agent-inline-hint')).toBeVisible({ timeout: 8000 })
  })

  test('Accept all applies the change and clears the review bar', async ({ page }) => {
    await mockChatWithPatch(page, DAY2_PATCH)
    await openTripAndSend(page)
    await page.getByTestId('review-accept-all').click()
    await expect(page.getByTestId('agent-review-bar')).not.toBeVisible()
    await expect(page.getByTestId('day-proposed-badge')).not.toBeVisible()
    // The applied activity is now part of the day content (in the expanded card)
    await expect(page.getByText('Coffee plantation tour (2h)').first()).toBeVisible()
  })

  test('Reject all dismisses the change without applying it', async ({ page }) => {
    await mockChatWithPatch(page, DAY2_PATCH)
    await openTripAndSend(page)
    await expect(page.getByTestId('day-card-diff')).toBeVisible({ timeout: 8000 })
    await page.getByTestId('review-reject-all').click()
    await expect(page.getByTestId('agent-review-bar')).not.toBeVisible()
    await expect(page.getByTestId('day-card-diff')).not.toBeVisible()
  })

  test('per-day Reject removes just that day from the review', async ({ page }) => {
    await mockChatWithPatch(page, MULTI_PATCH)
    await openTripAndSend(page)
    await expect(page.getByTestId('agent-review-bar')).toBeVisible({ timeout: 8000 })
    // Two day cards carry a proposed badge
    await expect(page.getByTestId('day-proposed-badge')).toHaveCount(2)
    // Reject the first day's diff
    await page.getByTestId('day-diff-reject').first().click()
    await expect(page.getByTestId('day-proposed-badge')).toHaveCount(1)
    // Review bar still present (one day remains)
    await expect(page.getByTestId('agent-review-bar')).toBeVisible()
  })

  test('per-day Accept applies one day and leaves the rest pending', async ({ page }) => {
    await mockChatWithPatch(page, MULTI_PATCH)
    await openTripAndSend(page)
    await expect(page.getByTestId('day-proposed-badge')).toHaveCount(2, { timeout: 8000 })
    await page.getByTestId('day-diff-accept').first().click()
    await expect(page.getByTestId('day-proposed-badge')).toHaveCount(1)
    await expect(page.getByTestId('agent-review-bar')).toBeVisible()
  })
})
