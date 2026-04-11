import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import {
  Box, Button, Typography, Paper, CircularProgress,
} from '@mui/material'
import GoogleIcon from '@mui/icons-material/Google'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'

export default function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      setError('No se pudo iniciar sesión. Intenta de nuevo.')
      setLoading(false)
    }
  }

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
        🍁 Itinerario Canadá
      </Typography>
      <Typography sx={{
        color: 'rgba(255,255,255,0.5)', mb: 5,
        letterSpacing: 2, textTransform: 'uppercase', fontSize: '0.85rem',
      }}>
        Sep 12 – Sep 30, 2026
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
          Acceso Privado
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Solo usuarios autorizados pueden ver este itinerario.
        </Typography>

        <Button
          fullWidth
          variant="contained"
          size="large"
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <GoogleIcon />}
          onClick={handleLogin}
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
          {loading ? 'Entrando...' : 'Continuar con Google'}
        </Button>

        {error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 2 }}>
            {error}
          </Typography>
        )}
      </Paper>
    </Box>
  )
}
