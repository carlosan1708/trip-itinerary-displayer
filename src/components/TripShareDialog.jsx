import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, IconButton, Box, Chip, Stack, Alert,
} from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import CloseIcon    from '@mui/icons-material/Close'
import LockIcon     from '@mui/icons-material/Lock'
import PublicIcon   from '@mui/icons-material/Public'
import { useT }    from '../i18n'

export default function TripShareDialog({ open, trip, authorEmail, onSave, onClose }) {
  const t = useT()

  // undefined means "open to all" (legacy). We track this explicitly so the user
  // can choose to lock the trip or keep it open.
  const isLegacyOpen = trip?.viewers === undefined
  const [restricted, setRestricted] = useState(!isLegacyOpen)
  const [viewers, setViewers]       = useState(() => trip?.viewers ?? [])
  const [input, setInput]           = useState('')
  const [error, setError]           = useState('')

  function addViewer() {
    const email = input.trim().toLowerCase()
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { setError(t('invalidEmail')); return }
    if (email === authorEmail) { setError(t('shareAlreadyAuthor')); return }
    if (viewers.includes(email)) { setError(t('shareAlreadyAdded')); return }
    setViewers(v => [...v, email])
    setInput('')
    setError('')
  }

  function removeViewer(email) {
    setViewers(v => v.filter(e => e !== email))
  }

  function handleSave() {
    let finalViewers = viewers
    if (restricted && input.trim()) {
      const email = input.trim().toLowerCase()
      if (
        email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) &&
        email !== authorEmail &&
        !viewers.includes(email)
      ) {
        finalViewers = [...viewers, email]
      }
    }
    onSave(restricted ? finalViewers : undefined)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {restricted ? <LockIcon fontSize="small" sx={{ color: 'text.secondary' }} /> : <PublicIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
        {t('shareTripTitle')}
      </DialogTitle>

      <DialogContent sx={{ pt: '8px !important' }}>

        {/* Open / Restricted toggle */}
        <Stack direction="row" spacing={1} mb={2}>
          <Button
            size="small"
            variant={!restricted ? 'contained' : 'outlined'}
            startIcon={<PublicIcon sx={{ fontSize: '16px !important' }} />}
            onClick={() => setRestricted(false)}
          >
            {t('shareOpenLabel')}
          </Button>
          <Button
            size="small"
            variant={restricted ? 'contained' : 'outlined'}
            startIcon={<LockIcon sx={{ fontSize: '16px !important' }} />}
            onClick={() => setRestricted(true)}
          >
            {t('shareRestrictedLabel')}
          </Button>
        </Stack>

        {!restricted && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('shareOpenHelp')}
          </Alert>
        )}

        {restricted && (
          <>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              {t('shareTripHelp')}
            </Typography>

            {/* Author row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Chip label={authorEmail} size="small" color="primary" variant="outlined" />
              <Typography variant="caption" color="text.secondary">{t('shareOwnerLabel')}</Typography>
            </Box>

            {/* Invited viewers */}
            {viewers.length > 0 && (
              <Stack direction="row" flexWrap="wrap" gap={0.75} mb={2}>
                {viewers.map(email => (
                  <Chip
                    key={email}
                    label={email}
                    size="small"
                    onDelete={() => removeViewer(email)}
                    deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                  />
                ))}
              </Stack>
            )}

            {viewers.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                {t('shareNoViewers')}
              </Typography>
            )}

            {/* Add email */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <TextField
                size="small"
                label={t('shareEmailLabel')}
                value={input}
                onChange={e => { setInput(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && addViewer()}
                error={!!error}
                helperText={error}
                fullWidth
                autoComplete="off"
              />
              <IconButton onClick={addViewer} color="primary" sx={{ mt: 0.5 }}>
                <PersonAddIcon />
              </IconButton>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" onClick={handleSave}>{t('save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
