import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

let scriptPromise = null
function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return scriptPromise
}

/**
 * Renders an invisible/managed Cloudflare Turnstile challenge.
 * Calls onVerify(token) once the visitor passes, onError() on failure.
 *
 * E2E hook: if window.__turnstileBypassToken is set, the widget skips
 * Cloudflare entirely and immediately resolves with that token. The mocked
 * /demo/start in tests accepts it; real Cloudflare verification still runs
 * in dev/prod where the bypass is never set.
 */
export default function TurnstileWidget({ onVerify, onError }) {
  const ref = useRef(null)
  const widgetIdRef = useRef(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__turnstileBypassToken) {
      onVerify(window.__turnstileBypassToken)
      return
    }

    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (token) => onVerify(token),
          'error-callback': () => onError?.(),
          'expired-callback': () => onError?.(),
        })
      })
      .catch(() => onError?.())

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* noop */ }
      }
    }
  }, [onVerify, onError])

  return <Box ref={ref} data-testid="turnstile-widget" sx={{ display: 'flex', justifyContent: 'center', minHeight: 65 }} />
}
