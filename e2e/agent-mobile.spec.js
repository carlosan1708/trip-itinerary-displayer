import { test, expect } from '@playwright/test'
import { setupAdminAuth } from './helpers.js'

// On mobile the agent drawer is a full-width overlay, so an inline proposed
// change (review bar + day-card diffs on the itinerary) would be hidden behind
// it. The drawer must auto-close on propose to reveal the review.
test.describe('AI Agent — mobile inline review', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await setupAdminAuth(page)
  })

  const PATCH = {
    parts: [{ id: 1, days: [{ dayNumber: 2, activities: ['Visita Bow Falls', 'Coffee tour (2h)'] }] }],
  }

  async function openAndPropose(page) {
    await page.route('**/agent/chat', (route) => route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `event: done\ndata: ${JSON.stringify({ response: 'Propuse un cambio al Día 2.', patch: PATCH, policy: 'apply_allowed' })}\n\n`,
    }))
    await page.goto('/')
    await page.getByText('Ruta Este').click()
    await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
    await page.getByTestId('agent-fab').click()
    await expect(page.getByTestId('agent-input')).toBeVisible()
    await page.getByTestId('agent-input').fill('añade un coffee tour al día 2')
    await page.getByTestId('agent-send-btn').click()
  }

  test('proposing a change auto-closes the drawer and reveals the review bar', async ({ page }) => {
    await openAndPropose(page)
    // Drawer closed → chat input no longer visible.
    await expect(page.getByTestId('agent-input')).toBeHidden({ timeout: 8000 })
    // The on-itinerary review is now visible.
    await expect(page.getByTestId('agent-review-bar')).toBeVisible()
  })

  test('reopening the drawer shows a tappable "see changes" hint that re-reveals the review', async ({ page }) => {
    await openAndPropose(page)
    await expect(page.getByTestId('agent-input')).toBeHidden({ timeout: 8000 })

    // Reopen the drawer; the inline-review hint is present and tappable.
    await page.getByTestId('agent-fab').click()
    const hint = page.getByTestId('agent-inline-hint')
    await expect(hint).toBeVisible()
    await hint.click()

    // Tapping it closes the drawer again to show the changes.
    await expect(page.getByTestId('agent-input')).toBeHidden()
    await expect(page.getByTestId('agent-review-bar')).toBeVisible()
  })
})
