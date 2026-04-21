import { useState, useRef } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Divider, Alert, Stack, IconButton, Tooltip,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CloseIcon from '@mui/icons-material/Close'
import { useT } from '../i18n'

export default function TripEditorModal({ open, trip, folderId, onSave, onClose, initialJson }) {
  const t = useT()
  const [meta, setMeta] = useState({
    label:    trip?.label    ?? '',
    subtitle: trip?.subtitle ?? '',
    dates:    trip?.dates    ?? '',
    duration: trip?.duration ?? '',
  })
  const [jsonText, setJsonText]   = useState('')
  const [jsonError, setJsonError] = useState('')
  const [loaded, setLoaded]       = useState(false)
  const fileRef = useRef()

  if (open && trip && !loaded) {
    const data = initialJson ?? null
    setJsonText(data ? JSON.stringify(data, null, 2) : '{}')
    setMeta({
      label:    trip.label    ?? '',
      subtitle: trip.subtitle ?? '',
      dates:    trip.dates    ?? '',
      duration: trip.duration ?? '',
    })
    setLoaded(true)
  }

  function handleClose() {
    setLoaded(false)
    setJsonError('')
    onClose()
  }

  function handleSave() {
    let parsed = null
    if (jsonText.trim() && jsonText.trim() !== '{}') {
      try {
        parsed = JSON.parse(jsonText)
      } catch {
        setJsonError(t('jsonSyntaxError'))
        return
      }
    }
    setJsonError('')
    onSave(folderId, trip.id, meta, parsed)
    setLoaded(false)
    onClose()
  }

  function handleDownload() {
    let content = jsonText
    try { content = JSON.stringify(JSON.parse(jsonText), null, 2) } catch {}
    const blob = new Blob([content], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `${trip?.id ?? 'itinerary'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        setJsonText(JSON.stringify(parsed, null, 2))
        setMeta(m => ({
          label:    m.label    || parsed.title    || '',
          subtitle: m.subtitle || parsed.subtitle || '',
          dates:    m.dates    || parsed.subtitle || '',
          duration: m.duration || parsed.stats?.[0] || '',
        }))
        setJsonError('')
      } catch {
        setJsonError(t('jsonFileError'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {t('editTripTitle', { label: trip?.label })}
        </Typography>
        <Tooltip title={t('downloadJsonTooltip')}>
          <IconButton size="small" onClick={handleDownload}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('uploadJsonTooltip')}>
          <IconButton size="small" onClick={() => fileRef.current.click()}>
            <UploadFileIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={handleClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleFileUpload} />
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="overline" color="text.secondary">{t('metadataSection')}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label={t('nameField')} size="small" fullWidth value={meta.label}
            onChange={e => setMeta(m => ({ ...m, label: e.target.value }))} />
          <TextField label={t('subtitleRouteField')} size="small" fullWidth value={meta.subtitle}
            onChange={e => setMeta(m => ({ ...m, subtitle: e.target.value }))} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label={t('datesField')} size="small" fullWidth value={meta.dates}
            onChange={e => setMeta(m => ({ ...m, dates: e.target.value }))} />
          <TextField label={t('durationField')} size="small" fullWidth value={meta.duration}
            onChange={e => setMeta(m => ({ ...m, duration: e.target.value }))} />
        </Stack>

        <Divider />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="overline" color="text.secondary">{t('itineraryJsonSection')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('editOrDownloadHint')}
          </Typography>
        </Box>

        {jsonError && <Alert severity="error" sx={{ py: 0.5 }}>{jsonError}</Alert>}

        <TextField
          multiline
          fullWidth
          minRows={12}
          maxRows={24}
          value={jsonText}
          onChange={e => { setJsonText(e.target.value); setJsonError('') }}
          InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.78rem' } }}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>{t('cancel')}</Button>
        <Button variant="contained" onClick={handleSave}>{t('save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
