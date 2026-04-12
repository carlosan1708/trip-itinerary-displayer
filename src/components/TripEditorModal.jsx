import { useState, useRef } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Divider, Alert, Stack, IconButton, Tooltip,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CloseIcon from '@mui/icons-material/Close'
import { findTripData } from '../utils/registry'

export default function TripEditorModal({ open, trip, folderId, onSave, onClose }) {
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

  // Load current JSON when modal opens
  if (open && trip && !loaded) {
    const data = findTripData(trip.id)
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
        setJsonError('JSON inválido — revisa la sintaxis antes de guardar.')
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
        // Auto-fill metadata from JSON if fields are empty
        setMeta(m => ({
          label:    m.label    || parsed.title    || '',
          subtitle: m.subtitle || parsed.subtitle || '',
          dates:    m.dates    || parsed.subtitle || '',
          duration: m.duration || parsed.stats?.[0] || '',
        }))
        setJsonError('')
      } catch {
        setJsonError('El archivo no es un JSON válido.')
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
          Editar: {trip?.label}
        </Typography>
        <Tooltip title="Descargar JSON">
          <IconButton size="small" onClick={handleDownload}>
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Subir JSON">
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
        {/* Metadata */}
        <Typography variant="overline" color="text.secondary">Metadatos</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Nombre" size="small" fullWidth value={meta.label}
            onChange={e => setMeta(m => ({ ...m, label: e.target.value }))} />
          <TextField label="Subtítulo / ruta" size="small" fullWidth value={meta.subtitle}
            onChange={e => setMeta(m => ({ ...m, subtitle: e.target.value }))} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Fechas" size="small" fullWidth value={meta.dates}
            onChange={e => setMeta(m => ({ ...m, dates: e.target.value }))} />
          <TextField label="Duración" size="small" fullWidth value={meta.duration}
            onChange={e => setMeta(m => ({ ...m, duration: e.target.value }))} />
        </Stack>

        <Divider />

        {/* JSON editor */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="overline" color="text.secondary">Itinerario JSON</Typography>
          <Typography variant="caption" color="text.secondary">
            Edita directamente, o descarga → edita → sube
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
        <Button onClick={handleClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSave}>Guardar</Button>
      </DialogActions>
    </Dialog>
  )
}
