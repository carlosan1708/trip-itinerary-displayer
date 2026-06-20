import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { streamChat, streamCreate, DEMO_LIMIT_ERROR } from './agentClient'

// Build a ReadableStream that emits the given string chunks as Uint8Arrays,
// so we can drive the SSE reader exactly the way the network would.
function streamFromChunks(chunks) {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]))
      } else {
        controller.close()
      }
    },
  })
}

function okResponse(chunks) {
  return { ok: true, status: 200, body: streamFromChunks(chunks) }
}

function errorResponse(status, text) {
  return { ok: false, status, text: () => Promise.resolve(text) }
}

// A minimal authenticated user so getAuthHeader() resolves.
beforeEach(() => {
  globalThis.window = globalThis.window || {}
  window.__mockAuth = {
    currentUser: { getIdToken: () => Promise.resolve('test-token') },
  }
  vi.restoreAllMocks()
})

afterEach(() => {
  if (window.__mockAuth) window.__mockAuth.currentUser = null
})

// streamChat/streamCreate run their work in a detached async IIFE; flush the
// microtask + stream pump queue by awaiting a macrotask a few times.
async function flush() {
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0))
}

describe('streamChat — happy path', () => {
  it('streams token events then a done event', async () => {
    const tokens = []
    let done = null
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([
      'event: token\ndata: {"text":"Hel"}\n\n',
      'event: token\ndata: {"text":"lo"}\n\n',
      'event: done\ndata: {"response":"Hello","patch":null,"sources":[]}\n\n',
    ]))

    streamChat({ messages: [] }, t => tokens.push(t), d => { done = d }, () => {})
    await flush()

    expect(tokens).toEqual(['Hel', 'lo'])
    expect(done).toEqual({ response: 'Hello', patch: null, sources: [] })
  })

  it('reassembles an SSE event split across two network chunks', async () => {
    const tokens = []
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([
      'event: token\nda',
      'ta: {"text":"split"}\n\n',
    ]))
    streamChat({ messages: [] }, t => tokens.push(t), () => {}, () => {})
    await flush()
    expect(tokens).toEqual(['split'])
  })

  it('forwards an SSE error event to onError', async () => {
    let err = null
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([
      'event: error\ndata: {"message":"boom"}\n\n',
    ]))
    streamChat({ messages: [] }, () => {}, () => {}, e => { err = e })
    await flush()
    expect(err).toBe('boom')
  })

  it('sends an Authorization bearer header and JSON content type', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]))
    streamChat({ messages: [{ role: 'user', content: 'hi' }] }, () => {}, () => {}, () => {})
    await flush()
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-token')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: 'user', content: 'hi' }] })
  })
})

describe('streamChat — error responses', () => {
  it('maps a 429 demo_limit_reached body to the DEMO_LIMIT_ERROR sentinel', async () => {
    let err = null
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      errorResponse(429, JSON.stringify({ detail: { code: 'demo_limit_reached' } })),
    )
    streamChat({ messages: [] }, () => {}, () => {}, e => { err = e })
    await flush()
    expect(err).toBe(DEMO_LIMIT_ERROR)
  })

  it('surfaces a generic server error with status and body', async () => {
    let err = null
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse(500, 'kaboom'))
    streamChat({ messages: [] }, () => {}, () => {}, e => { err = e })
    await flush()
    expect(err).toBe('Server error 500: kaboom')
  })

  it('reports a thrown auth error when there is no current user', async () => {
    window.__mockAuth.currentUser = null
    let err = null
    streamChat({ messages: [] }, () => {}, () => {}, e => { err = e })
    await flush()
    expect(err).toBe('Not authenticated')
  })

  it('does not call onError when the request is aborted', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr)
    let err = null
    const abort = streamChat({ messages: [] }, () => {}, () => {}, e => { err = e })
    abort()
    await flush()
    expect(err).toBeNull()
  })
})

describe('streamCreate', () => {
  it('emits progress events and unwraps the itinerary from done', async () => {
    const progress = []
    let itinerary = null
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([
      'event: progress\ndata: {"text":"Structure planned"}\n\n',
      'event: done\ndata: {"itinerary":{"title":"Trip"}}\n\n',
    ]))
    streamCreate({ destination: 'X' }, t => progress.push(t), i => { itinerary = i }, () => {})
    await flush()
    expect(progress).toEqual(['Structure planned'])
    expect(itinerary).toEqual({ title: 'Trip' })
  })

  it('returns an abort function', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]))
    const abort = streamCreate({}, () => {}, () => {}, () => {})
    expect(typeof abort).toBe('function')
  })
})
