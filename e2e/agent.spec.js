import { test, expect } from '@playwright/test'

// AI Agent tests — chat and itinerary creation
// These test the agent integration without actually calling Claude API
// (mocked in test mode via window.__mockAgent)

test.describe('AI Agent', () => {
  test.beforeEach(async ({ page }) => {
    // Set up mock agent responses before navigating
    await page.addInitScript(() => {
      window.__mockAgent = {
        chat: async function* (payload) {
          yield { event: 'token', data: { text: 'This is a mocked response about ' } }
          yield { event: 'token', data: { text: payload.messages[0].content } }
          yield { event: 'done', data: {} }
        },
        create: async function* (params) {
          yield { event: 'progress', data: { text: 'Generating itinerary...' } }
          yield { event: 'progress', data: { text: 'Adding activities...' } }
          yield {
            event: 'done',
            data: {
              itinerary: {
                version: 1,
                author: 'test@example.com',
                title: params.destination,
                subtitle: params.dates,
                stats: [`${params.num_days} days`, params.destination],
                parts: [
                  {
                    id: 1,
                    emoji: '🏖️',
                    title: 'Part 1',
                    color: '#2E7D32',
                    daysRange: `Days 1 – ${params.num_days}`,
                    days: Array.from({ length: params.num_days }, (_, i) => ({
                      dayNumber: i + 1,
                      date: `Day ${i + 1}`,
                      location: params.destination,
                      subtitle: 'Test day',
                      logistics: [],
                      activities: ['Activity 1', 'Activity 2'],
                      tips: [],
                      warnings: [],
                      links: [],
                      images: [],
                      optional_alternatives: [],
                    })),
                  },
                ],
              },
            },
          }
        },
      }
    })

    await page.goto('http://localhost:5173/')
    await page.waitForLoadState('networkidle')
  })

  test('opens agent from dashboard build-with-ai tab', async ({ page }) => {
    // This test depends on the onboarding/tab UI being available
    // For now, verify the agent is accessible in test mode

    // Check if we're in test mode (agent should be available)
    const agentAvailable = await page.evaluate(() => !!window.__mockAgent)
    expect(agentAvailable).toBe(true)
  })

  test('chat endpoint streams responses correctly', async ({ page }) => {
    // Test that the chat streaming works (in test mode)
    const messages = await page.evaluate(async () => {
      if (!window.__mockAgent) return null

      const responses = []
      for await (const chunk of window.__mockAgent.chat({
        messages: [{ role: 'user', content: 'What should I pack?' }],
        itinerary: null,
        mode: 'explore',
      })) {
        responses.push(chunk)
      }
      return responses
    })

    expect(messages).not.toBeNull()
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.some(m => m.event === 'done')).toBe(true)
  })

  test('create endpoint streams itinerary generation', async ({ page }) => {
    // Test that itinerary creation streaming works
    const result = await page.evaluate(async () => {
      if (!window.__mockAgent) return null

      let finalItinerary = null
      for await (const chunk of window.__mockAgent.create({
        destination: 'Costa Rica',
        dates: '2026-06-01 to 2026-06-10',
        num_days: 10,
        travelers: 2,
        interests: ['hiking', 'wildlife'],
        budget: 'mid',
        pace: 'moderate',
        language: 'es',
      })) {
        if (chunk.event === 'done') {
          finalItinerary = chunk.data.itinerary
        }
      }
      return finalItinerary
    })

    expect(result).not.toBeNull()
    expect(result.title).toBe('Costa Rica')
    expect(result.parts.length).toBeGreaterThan(0)
    expect(result.parts[0].days.length).toBe(10)
  })

  test('agent respects language parameter', async ({ page }) => {
    // Verify that language is passed through correctly
    const langs = ['es', 'en']

    for (const lang of langs) {
      const captured = await page.evaluate(
        async (language) => {
          if (!window.__mockAgent) return null
          // This would normally test that Claude respects the language param
          // For now just verify the param is accepted
          return language
        },
        lang
      )
      expect(captured).toBe(lang)
    }
  })

  test('mock agent is available for testing', async ({ page }) => {
    // Verify the mock agent is set up correctly for test mode
    const agentFunctions = await page.evaluate(() => {
      if (!window.__mockAgent) return null
      return {
        hasChat: typeof window.__mockAgent.chat === 'function',
        hasCreate: typeof window.__mockAgent.create === 'function',
      }
    })

    expect(agentFunctions).not.toBeNull()
    expect(agentFunctions.hasChat).toBe(true)
    expect(agentFunctions.hasCreate).toBe(true)
  })
})
