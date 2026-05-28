import { useState, useRef, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, Box, TextField, Button, Stack, Typography, Alert,
  Collapse, IconButton, Tooltip, Chip,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import TemplateGrid from './TemplateGrid'
import TripPlannerWizard from './TripPlannerWizard'
import { useT } from '../i18n'

const TABS = ['templates', 'ai', 'upload', 'paste']

export default function AddTripDialog({ open, onClose, onCreate, onOpenAgent, initialTab = 'templates' }) {
  const t = useT()
  const [tab, setTab] = useState(initialTab)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pickedTemplate, setPickedTemplate] = useState(null)

  const [pasteJson, setPasteJson] = useState('')
  const [pasteError, setPasteError] = useState('')
  const uploadedDataRef = useRef(null)
  const uploadFileRef = useRef(null)
  const [uploadFilename, setUploadFilename] = useState('')

  const [showLegacyPrompt, setShowLegacyPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const promptRef = useRef(null)

  useEffect(() => {
    if (open) {
      setTab(initialTab)
    } else {
      setName('')
      setError('')
      setPickedTemplate(null)
      setPasteJson('')
      setPasteError('')
      setUploadFilename('')
      uploadedDataRef.current = null
      setShowLegacyPrompt(false)
    }
  }, [open, initialTab])

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        uploadedDataRef.current = data
        setUploadFilename(file.name)
        setError('')
        if (!name) setName(data.label || data.title || file.name.replace('.json', ''))
      } catch {
        setError(t('invalidJsonFile'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handlePasteChange(text) {
    setPasteJson(text)
    setPasteError('')
    if (!text.trim()) { uploadedDataRef.current = null; return }
    try {
      const data = JSON.parse(text)
      uploadedDataRef.current = data
      if (!name) setName(data.label || data.title || '')
    } catch {
      uploadedDataRef.current = null
      setPasteError(t('invalidJsonPaste'))
    }
  }

  function pickTemplate(tpl) {
    setPickedTemplate(tpl)
    if (!name) setName(t(tpl.nameKey))
  }

  function confirm() {
    if (!name.trim()) { setError(t('nameEmpty')); return }
    let data = null
    if (tab === 'templates') {
      if (!pickedTemplate) { setError(t('pickTemplateFirst')); return }
      data = pickedTemplate.build(name.trim())
    } else if (tab === 'paste') {
      if (pasteError) return
      data = uploadedDataRef.current
    } else if (tab === 'upload') {
      data = uploadedDataRef.current
    }
    onCreate(name.trim(), data)
  }

  function handleBuildWithAi() {
    onOpenAgent()
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { maxHeight: '90vh' } }}>
      <DialogTitle>{t('addTripTitle')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>

        {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}

        {tab !== 'ai' && (
          <TextField
            label={t('itineraryNameLabel')}
            size="small"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            fullWidth
            autoFocus
          />
        )}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.78rem', textTransform: 'none', py: 0.5 } }}
        >
          <Tab value="templates" label={t('tabTemplates')} data-testid="addtrip-tab-templates" />
          <Tab value="ai" label={t('tabBuildAi')} data-testid="addtrip-tab-ai" />
          <Tab value="upload" label={t('tabUpload')} data-testid="addtrip-tab-upload" />
          <Tab value="paste" label={t('tabPaste')} data-testid="addtrip-tab-paste" />
        </Tabs>

        <Box sx={{ minHeight: 200 }}>
          {tab === 'templates' && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
                {t('templatesHelp')}
              </Typography>
              <TemplateGrid onPick={pickTemplate} />
              {pickedTemplate && (
                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  <Typography variant="caption" color="success.main">
                    {t('templatePicked', { name: t(pickedTemplate.nameKey) })}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {tab === 'ai' && (
            <TripPlannerWizard
              onComplete={(tripName, itinerary) => {
                onCreate(tripName, itinerary)
              }}
              onCancel={onClose}
            />
          )}

          {tab === 'upload' && (
            <Stack spacing={1.5} alignItems="flex-start">
              <Typography variant="caption" color="text.secondary">{t('uploadHelp')}</Typography>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => uploadFileRef.current?.click()}
                size="small"
              >
                {uploadFilename ? t('fileLoaded') : t('uploadFileBtn')}
              </Button>
              {uploadFilename && (
                <Chip size="small" label={uploadFilename} />
              )}
              <input
                ref={uploadFileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleFileChange}
              />
            </Stack>
          )}

          {tab === 'paste' && (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">{t('pasteHelp')}</Typography>
              <TextField
                multiline
                minRows={6}
                maxRows={12}
                fullWidth
                size="small"
                placeholder='{ "version": 1, "title": "My trip", ... }'
                value={pasteJson}
                onChange={e => handlePasteChange(e.target.value)}
                error={!!pasteError}
                helperText={pasteError || (uploadedDataRef.current && pasteJson ? t('jsonValid') : '')}
                FormHelperTextProps={{ sx: { color: !pasteError && uploadedDataRef.current && pasteJson ? 'success.main' : undefined } }}
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
              />
            </Stack>
          )}
        </Box>

      </DialogContent>
      {tab !== 'ai' && (
        <DialogActions>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="contained" onClick={confirm} data-testid="addtrip-confirm">{t('add')}</Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
