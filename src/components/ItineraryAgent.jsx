import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Box, Drawer, Fab, IconButton, Stack, Tooltip, Typography,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'

import ItineraryAgentChat from './ItineraryAgentChat'
import { streamChat, DEMO_LIMIT_ERROR } from '../utils/agentClient'
import { applyPatch, describePatch } from '../utils/itineraryPatch'
import { useT } from '../i18n'

const DRAWER_WIDTH = 420

export default function ItineraryAgent({
  itinerary,
  user,
  canEdit,
  onItineraryChange,
  onDuplicateCreated,
  open: openProp,
  onOpenChange,
  language = 'en',
  initialPrompt = '',
  onInitialPromptConsumed,
}) {
  const t = useT()
  const [openInternal, setOpenInternal] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(null)

  const controlled = openProp !== undefined
  const open = controlled ? openProp : openInternal
  const setOpen = (val) => controlled ? onOpenChange?.(val) : setOpenInternal(val)

  // When the drawer opens with a seed prompt (from EmptyDashboard input),
  // pre-fill the chat input so the user can edit or send as-is.
  useEffect(() => {
    if (open && initialPrompt) {
      setInput(initialPrompt)
      onInitialPromptConsumed?.()
    }
  }, [open, initialPrompt, onInitialPromptConsumed])

  const mode = canEdit ? 'edit' : 'explore'

  const handleOpen = () => setOpen(true)
  const handleClose = () => setOpen(false)
  const handleClear = () => setMessages([])

  const updateLastAssistant = (updater) =>
    setMessages(prev => {
      const next = [...prev]
      const last = next.findLastIndex(m => m.role === 'assistant')
      if (last >= 0) next[last] = { ...next[last], ...updater(next[last]) }
      return next
    })

  const handleSubmit = useCallback(() => {
    if (!input.trim() || loading) return
    const userText = input.trim()
    setInput('')
    setLoading(true)

    const newMessages = [...messages.filter(m => m.content?.trim()), { role: 'user', content: userText }]
    setMessages([...newMessages, { role: 'assistant', content: '', streaming: true }])

    const abort = streamChat(
      { messages: newMessages, itinerary: itinerary || undefined, mode, language },
      (chunk) => updateLastAssistant(msg => ({ content: msg.content + chunk })),
      ({ response, patch, sources }) => {
        setLoading(false)
        updateLastAssistant(() => ({
          content: response,
          streaming: false,
          patch: patch || null,
          changes: patch ? describePatch(itinerary || {}, patch) : null,
          sources: sources || [],
        }))
      },
      (errMsg) => {
        setLoading(false)
        const content = errMsg === DEMO_LIMIT_ERROR ? t('demoAiLimit') : `Error: ${errMsg}`
        updateLastAssistant(() => ({ content, streaming: false }))
      },
    )
    abortRef.current = abort
  }, [input, loading, messages, itinerary, mode])

  const handleApplyPatch = useCallback((patch) => {
    if (!itinerary || !canEdit) return
    const updated = applyPatch(itinerary, patch)
    updated.version = (itinerary.version || 1) + 1
    onItineraryChange?.(updated, { source: 'agent_edit' })
    setMessages(prev => prev.map(m => m.patch === patch ? { ...m, patch: null, changes: null } : m))
  }, [itinerary, canEdit, onItineraryChange])

  const handleDuplicateWithPatch = useCallback((patch) => {
    if (!user) return
    const base = itinerary ? applyPatch(itinerary, patch) : {}
    const username = user.email.split('@')[0]
    const newId = `${_tripId(itinerary)}-${username}-copy`
    const fallback = t('agentDuplicateFallbackName')
    const suffix = t('agentDuplicateLabelSuffix')
    const duplicate = { ...base, version: 1, author: user.email, label: `${base.label || fallback} — ${suffix}` }
    onDuplicateCreated?.(newId, duplicate)
    setMessages(prev => [
      ...prev.map(m => m.patch === patch ? { ...m, patch: null, changes: null } : m),
      { role: 'assistant', content: t('agentDuplicateConfirm', { label: duplicate.label }) },
    ])
  }, [itinerary, user, onDuplicateCreated, t])

  const handleDismissPatch = useCallback((msgIndex) => {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, patch: null, changes: null } : m))
  }, [])

  const modeLabel = !itinerary
    ? { text: t('agentModeCreate'), color: '#81c784' }
    : canEdit
      ? { text: t('agentModeEdit'), color: '#81c784' }
      : { text: t('agentModeExplore'), color: 'rgba(255,255,255,0.5)' }

  return (
    <>
      {/* FAB */}
      <Fab
        variant="extended"
        onClick={handleOpen}
        data-testid="agent-fab"
        sx={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1200,
          background: 'linear-gradient(135deg, #B71C1C 0%, #7B1FA2 100%)',
          color: '#fff',
          px: 2.5,
          gap: 1,
          boxShadow: '0 4px 20px rgba(183,28,28,0.45)',
          '&:hover': {
            background: 'linear-gradient(135deg, #c62828 0%, #8e24aa 100%)',
            boxShadow: '0 6px 28px rgba(183,28,28,0.6)',
            transform: 'scale(1.04)',
          },
          transition: 'all 0.2s ease',
          '@keyframes pulse-glow': {
            '0%':   { boxShadow: '0 4px 20px rgba(183,28,28,0.45)' },
            '50%':  { boxShadow: '0 4px 32px rgba(183,28,28,0.75), 0 0 0 6px rgba(183,28,28,0.12)' },
            '100%': { boxShadow: '0 4px 20px rgba(183,28,28,0.45)' },
          },
          animation: 'pulse-glow 2.6s ease-in-out infinite',
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 20 }} />
        <Typography variant="button" sx={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: 0.5 }}>
          {t('agentFabLabel')}
        </Typography>
      </Fab>

      {/* Drawer */}
      <Drawer
        anchor="right"
        variant="persistent"
        open={open}
        PaperProps={{
          sx: {
            width: DRAWER_WIDTH,
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(160deg, #0d1b2a 0%, #1a2f4a 60%, #0c2a1a 100%)',
            color: '#fff',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
          },
        }}
      >
        {/* Rainbow accent bar */}
        <Box sx={{
          height: 3, flexShrink: 0,
          background: 'linear-gradient(90deg, #2E7D32, #AD1457, #0277BD)',
        }} />

        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          sx={{ px: 2.5, py: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Box
            sx={{
              width: 32, height: 32, borderRadius: '50%', mr: 1.5,
              background: 'linear-gradient(135deg, #B71C1C, #7B1FA2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 16, color: '#fff' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              {t('agentDrawerTitle')}
            </Typography>
            <Typography variant="caption" sx={{ color: modeLabel.color, fontSize: 11 }}>
              {modeLabel.text}
            </Typography>
          </Box>
          <Tooltip title={t('agentClearTooltip')}>
            <IconButton
              size="small"
              onClick={handleClear}
              sx={{ color: 'rgba(255,255,255,0.45)', mr: 0.5, '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
            >
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton
            size="small"
            onClick={handleClose}
            sx={{ color: 'rgba(255,255,255,0.45)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        {/* Chat */}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ItineraryAgentChat
            messages={messages}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            loading={loading}
            canEdit={canEdit}
            itinerary={itinerary}
            onApplyPatch={handleApplyPatch}
            onDuplicateWithPatch={handleDuplicateWithPatch}
            onDismissPatch={handleDismissPatch}
          />
        </Box>
      </Drawer>
    </>
  )
}

function _tripId(itinerary) {
  return (itinerary?.label || 'trip').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
