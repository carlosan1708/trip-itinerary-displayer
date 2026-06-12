import { useState, useCallback } from 'react'
import { signInWithPopup, signInWithEmailAndPassword } from 'firebase/auth'
import { auth, googleProvider, signInAnonymouslyDemo } from '../firebase'
import {
  Box, Button, Typography, Paper, CircularProgress, TextField, Divider, Collapse, Link,
} from '@mui/material'
import GoogleIcon from '@mui/icons-material/Google'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined'
import RecaptchaGate from './RecaptchaGate'
import { useT } from '../i18n'

const DEMO_START_URL = (import.meta.env.VITE_AGENT_URL?.replace(/\/$/, '') ?? '') + '/demo/start'

const DEV_EMAIL    = import.meta.env.VITE_TEST_EMAIL    ?? ''
const DEV_PASSWORD = import.meta.env.VITE_TEST_PASSWORD ?? ''

export default function LoginScreen() {
  const t = useT()
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [showEmail, setShowEmail]   = useState(false)
  const [email, setEmail]           = useState(DEV_EMAIL)
  const [password, setPassword]     = useState(DEV_PASSWORD)
  const [demoStage, setDemoStage]   = useState('idle') // idle | challenge | verifying

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch {
      setError(t('loginError'))
      setLoading(false)
    }
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      setError(t('loginError'))
      setLoading(false)
    }
  }

  // Demo: run the invisible reCAPTCHA gate. On a token, verify server-side
  // then sign in anonymously. Only after /demo/start succeeds do we create an
  // anonymous identity, so bots can't mint demo users without a valid score.
  const handleDemoVerify = useCallback(async (token) => {
    setDemoStage('verifying')
    setError(null)
    try {
      const res = await fetch(DEMO_START_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) throw new Error('verify failed')
      await signInAnonymouslyDemo()
      // onAuthStateChanged in App.jsx takes over from here.
    } catch {
      setError(t('demoError'))
      setDemoStage('idle')
    }
  }, [t])

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
        px: 3,
      }}
    >
      {/* Rainbow top bar */}
      <Box sx={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 4,
        background: 'linear-gradient(90deg, #2E7D32, #AD1457, #0277BD)',
      }} />

      <Typography variant="h3" sx={{ color: '#fff', fontWeight: 700, mb: 1, textAlign: 'center' }}>
        {t('loginTitle')}
      </Typography>
      <Typography sx={{
        color: 'rgba(255,255,255,0.5)', mb: 5,
        letterSpacing: 2, textTransform: 'uppercase', fontSize: '0.85rem',
      }}>
        {t('loginSubtitle')}
      </Typography>

      <Paper elevation={8} sx={{ p: 4, borderRadius: 3, textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: '50%',
          bgcolor: '#f0f4ff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', mx: 'auto', mb: 2,
        }}>
          <LockOutlinedIcon sx={{ color: '#3367D6' }} />
        </Box>

        <Typography variant="h6" fontWeight={700} mb={0.5}>
          {t('privateAccess')}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          {t('authorizedOnly')}
        </Typography>

        <Button
          fullWidth
          variant="contained"
          size="large"
          startIcon={loading && !showEmail ? <CircularProgress size={18} color="inherit" /> : <GoogleIcon />}
          onClick={handleGoogleLogin}
          disabled={loading}
          sx={{
            bgcolor: '#4285F4',
            '&:hover': { bgcolor: '#3367D6' },
            borderRadius: 2,
            py: 1.5,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '1rem',
          }}
        >
          {loading && !showEmail ? t('signingIn') : t('continueGoogle')}
        </Button>

        <Divider sx={{ my: 2 }}>
          <Typography variant="caption" color="text.secondary">{t('orSignInWith')}</Typography>
        </Divider>

        <Link
          component="button"
          variant="body2"
          onClick={() => setShowEmail(s => !s)}
          sx={{ mb: 1, display: 'block', textAlign: 'center' }}
        >
          {showEmail ? t('hideEmailForm') : t('signInWithEmail')}
        </Link>

        <Collapse in={showEmail}>
          <Box component="form" onSubmit={handleEmailLogin} sx={{ mt: 1, textAlign: 'left' }}>
            <TextField
              label={t('emailLabel')}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
              autoComplete="email"
              inputProps={{ 'data-testid': 'email-input' }}
            />
            <TextField
              label={t('passwordLabel')}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              autoComplete="current-password"
              inputProps={{ 'data-testid': 'password-input' }}
            />
            <Button
              type="submit"
              fullWidth
              variant="outlined"
              disabled={loading || !email || !password}
              data-testid="email-signin-btn"
            >
              {loading && showEmail ? t('signingIn') : t('signInBtn')}
            </Button>
          </Box>
        </Collapse>

        <Divider sx={{ my: 2 }}>
          <Typography variant="caption" color="text.secondary">{t('orTryDemo')}</Typography>
        </Divider>

        {demoStage === 'idle' && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<ExploreOutlinedIcon />}
            onClick={() => setDemoStage('challenge')}
            data-testid="try-demo-btn"
            sx={{ borderRadius: 2, py: 1.25, textTransform: 'none', fontWeight: 600 }}
          >
            {t('tryDemo')}
          </Button>
        )}

        {demoStage !== 'idle' && (
          <Box sx={{ mt: 1 }}>
            {demoStage === 'verifying' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 1.5 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">{t('demoStarting')}</Typography>
              </Box>
            ) : (
              <RecaptchaGate onVerify={handleDemoVerify} onError={() => { setError(t('demoError')); setDemoStage('idle') }} />
            )}
          </Box>
        )}

        {error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 2 }}>
            {error}
          </Typography>
        )}
      </Paper>
    </Box>
  )
}
