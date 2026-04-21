import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { Box, Button, Typography } from '@mui/material'
import BlockIcon from '@mui/icons-material/Block'
import { useT } from '../i18n'

export default function AccessDenied({ email }) {
  const t = useT()
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 2, px: 3, textAlign: 'center',
      background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
    }}>
      <Box sx={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 4,
        background: 'linear-gradient(90deg, #2E7D32, #AD1457, #0277BD)',
      }} />

      <BlockIcon sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 72 }} />

      <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700 }}>
        {t('accessDenied')}
      </Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 340 }}>
        <strong style={{ color: 'rgba(255,255,255,0.75)' }}>{email}</strong>{' '}
        {t('notInvited')}
      </Typography>

      <Button
        variant="outlined"
        onClick={() => signOut(auth)}
        sx={{ mt: 2, color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)',
          '&:hover': { borderColor: 'rgba(255,255,255,0.5)' } }}
      >
        {t('signOut')}
      </Button>
    </Box>
  )
}
