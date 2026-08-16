import { test, expect } from '@playwright/test'
import { setupAllowedUserAuth } from './helpers.js'

// P0 regression guard. user@test.com is a whitelisted VIEWER of canada-trip
// (the itinerary's author is admin@test.com), so canEdit = false. Before the
// fix, the agent downgraded every viewer edit request to Q&A and the promised
// "modified personal copy" was unreachable. Now the backend returns a patch
// tagged policy 'duplicate_only', and the viewer is offered "My version".

const PATCH = {
  parts: [
    { id: 1, days: [{ dayNumber: 2, activities: ['Visita Bow Falls', 'Coffee tour (2h)'] }] },
  ],
}

// A viewer-scoped agent response: a real patch, but flagged duplicate-only.
function mockDuplicateOnlyPatch(page) {
  return page.route('**/agent/chat', async (route) => {
    const body =
      `event: done\ndata: ${JSON.stringify({
        response: 'Puedo proponer este cambio para tu propia copia.',
        patch: PATCH,
        policy: 'duplicate_only',
        sources: [],
      })}\n\n`
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
  })
}

async function askAsViewer(page, prompt = 'añade un coffee tour al día 2') {
  await page.goto('/')
  await page.getByText('Ruta Este').click()
  await page.getByText('Itinerario Canadá').waitFor({ timeout: 8000 })
  await page.getByTestId('agent-fab').click()
  await expect(page.getByTestId('agent-input')).toBeVisible()
  await page.getByTestId('agent-input').fill(prompt)
  await page.getByTestId('agent-send-btn').click()
}

const myVersionBtn = (page) => page.getByRole('button', { name: /Mi versión|My version/i })

test.describe('AI Agent — viewer modification becomes a duplicate', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllowedUserAuth(page)
  })

  test('viewer is offered "My version" (duplicate) — not inline apply', async ({ page }) => {
    await mockDuplicateOnlyPatch(page)
    await askAsViewer(page)

    // The proposed-changes diff card renders in the chat.
    await expect(page.getByText(/Cambios propuestos|Proposed changes/i)).toBeVisible({ timeout: 8000 })
    // The viewer's only action is to save a personal copy.
    await expect(myVersionBtn(page)).toBeVisible()
    // No inline "Apply changes" button and no sticky review bar — those are the
    // author-only in-place edit path.
    await expect(page.getByTestId('apply-changes-btn')).toHaveCount(0)
    await expect(page.getByTestId('agent-review-bar')).toHaveCount(0)
  })

  test('clicking "My version" consumes the proposal and confirms the copy', async ({ page }) => {
    await mockDuplicateOnlyPatch(page)
    await askAsViewer(page)
    await expect(myVersionBtn(page)).toBeVisible({ timeout: 8000 })

    await myVersionBtn(page).click()

    // The diff card is consumed (its button disappears) and a confirmation
    // message is appended to the chat.
    await expect(myVersionBtn(page)).toHaveCount(0)
    await expect(page.getByText(/copia|copy|versión|version/i).last()).toBeVisible()
  })
})
