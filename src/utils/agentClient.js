import { auth } from '../firebase'

// In prod: direct Cloud Function URL to bypass Firebase Hosting CDN buffering
// (CDN buffers all responses — SSE cannot stream through it).
// In local dev: empty string so Vite proxies /agent/** to localhost:8000.
const RAW_BACKEND_URL = import.meta.env.VITE_AGENT_URL ?? ''

function buildAgentUrl(path) {
  if (!RAW_BACKEND_URL) return `/agent${path}`

  const base = RAW_BACKEND_URL.replace(/\/$/, '')
  return `${base}/agent${path}`
}

async function getAuthHeader() {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

// Sentinel the UI checks to show the "demo limit reached, contact me" message
// instead of a raw server error. The backend returns 429 with a JSON body
// { detail: { code: "demo_limit_reached" } } once a demo user is over quota.
export const DEMO_LIMIT_ERROR = 'DEMO_LIMIT_REACHED'

async function handleErrorResponse(res, onError) {
  const text = await res.text()
  if (res.status === 429 && text.includes('demo_limit_reached')) {
    onError(DEMO_LIMIT_ERROR)
    return
  }
  onError(`Server error ${res.status}: ${text}`)
}

/**
 * Stream a chat turn to the backend.
 *
 * @param {object}   payload          - { messages, itinerary, mode }
 * @param {function} onToken          - called with each streamed text chunk
 * @param {function} onDone           - called with { response, patch, sources }
 * @param {function} onError          - called with error message string
 * @returns {function}                - abort() function to cancel the stream
 */
export function streamChat(payload, onToken, onDone, onError) {
  const controller = new AbortController()

  ;(async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(buildAgentUrl('/chat'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (!res.ok) {
        await handleErrorResponse(res, onError)
        return
      }

      await _readSSE(res.body, { onToken, onDone, onError })
    } catch (err) {
      if (err.name !== 'AbortError') onError(err.message)
    }
  })()

  return () => controller.abort()
}

/**
 * Stream itinerary creation.
 *
 * @param {object}   params           - { destination, dates, num_days, travelers, interests, budget, pace, language }
 * @param {function} onProgress       - called with progress text strings
 * @param {function} onDone           - called with the final itinerary object
 * @param {function} onError          - called with error message string
 * @returns {function}                - abort() function
 */
export function streamCreate(params, onProgress, onDone, onError) {
  const controller = new AbortController()

  ;(async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(buildAgentUrl('/create'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      })

      if (!res.ok) {
        await handleErrorResponse(res, onError)
        return
      }

      await _readSSE(res.body, {
        onProgress,
        onDone: (data) => onDone(data.itinerary),
        onError,
      })
    } catch (err) {
      if (err.name !== 'AbortError') onError(err.message)
    }
  })()

  return () => controller.abort()
}

// ---------------------------------------------------------------------------
// Internal SSE reader
// ---------------------------------------------------------------------------

async function _readSSE(body, handlers) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // `event` must persist across reads: an SSE event's `event:` and `data:`
  // lines can land in different network chunks, and the type set by an earlier
  // chunk has to survive until its `data:` line arrives.
  let event = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()  // keep incomplete last line

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        if (event === 'token')    handlers.onToken?.(data.text)
        if (event === 'progress') handlers.onProgress?.(data.text)
        if (event === 'done')     handlers.onDone?.(data)
        if (event === 'error')    handlers.onError?.(data.message)
        event = null
      }
    }
  }
}
