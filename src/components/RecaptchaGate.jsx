import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? ''
const ACTION = 'demo_start'
const SCRIPT_SRC = `https://www.google.com/recaptcha/enterprise.js?render=${SITE_KEY}`

let scriptPromise = null
function loadRecaptchaScript() {
  if (window.grecaptcha?.enterprise) return Promise.resolve()
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
 * Invisible reCAPTCHA Enterprise gate. On mount it requests a score-based
 * assessment token for the `demo_start` action and hands it to onVerify(token).
 * The backend (/demo/start) creates an assessment via the reCAPTCHA Enterprise
 * API and checks the score + action before allowing anonymous sign-in.
 *
 * E2E hook: if window.__recaptchaBypassToken is set, the gate skips Google
 * entirely and resolves with that token. The mocked /demo/start in tests
 * accepts it; real verification still runs in dev/prod where it's never set.
 */
export default function RecaptchaGate({ onVerify, onError }) {
  const ref = useRef(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__recaptchaBypassToken) {
      onVerify(window.__recaptchaBypassToken)
      return
    }

    let cancelled = false
    loadRecaptchaScript()
      .then(() => new Promise((resolve) => window.grecaptcha.enterprise.ready(resolve)))
      .then(() => {
        if (cancelled) return
        return window.grecaptcha.enterprise.execute(SITE_KEY, { action: ACTION })
      })
      .then((token) => {
        if (cancelled || !token) return
        onVerify(token)
      })
      .catch(() => onError?.())

    return () => { cancelled = true }
  }, [onVerify, onError])

  // reCAPTCHA Enterprise (score mode) is invisible; render a small spacer so
  // the layout doesn't jump while the token is being fetched.
  return <Box ref={ref} data-testid="recaptcha-gate" sx={{ minHeight: 8 }} />
}
