import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Box, Drawer, Fab, IconButton, Stack, Tooltip, Typography, useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'

import ItineraryAgentChat from './ItineraryAgentChat'
import { streamChat, streamCreate, DEMO_LIMIT_ERROR, DEMO_UNAVAILABLE_ERROR } from '../utils/agentClient'
import { applyPatch, describePatch, normalizeItinerary, sanitizePatch } from '../utils/itineraryPatch'
import { detectCreateIntent, parseCreateRequest } from '../utils/createIntent'
import { useT } from '../i18n'

const DRAWER_WIDTH = 420

export default function ItineraryAgent({
  itinerary,
  user,
  canEdit,
  onItineraryChange,
  onProposePatch,
  onProposeNewTrip,
  onDuplicateCreated,
  open: openProp,
  onOpenChange,
  language = 'en',
  initialPrompt = '',
  onInitialPromptConsumed,
}) {
  const t = useT()
  const theme = useTheme()
  // Below md the drawer becomes a full-width overlay (a fixed 420px drawer is
  // wider than a phone). At md+ it stays a persistent side panel, matching the
  // md content inset used by AgentReviewBar / NewTripPreview.
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'))
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

  // Cancel any in-flight stream and clear the loading state. Aborting makes the
  // underlying fetch reject with AbortError, which agentClient swallows — so we
  // reset `loading` here rather than waiting for a terminal event that won't come.
  const abortActive = useCallback(() => {
    abortRef.current?.()
    abortRef.current = null
    setLoading(false)
  }, [])

  // Abort on unmount so a closed/navigated-away assistant never leaves a request
  // running or updates state after teardown.
  useEffect(() => abortActive, [abortActive])

  const handleOpen = () => setOpen(true)
  const handleClose = () => { abortActive(); setOpen(false) }
  const handleClear = () => { abortActive(); setMessages([]) }

  // Map an agent error to user-facing chat content: demo caps get friendly
  // localized copy; everything else surfaces as a plain error.
  const errorContent = (errMsg) =>
    errMsg === DEMO_LIMIT_ERROR ? t('demoAiLimit')
      : errMsg === DEMO_UNAVAILABLE_ERROR ? t('demoUnavailable')
        : `Error: ${errMsg}`

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

    // Create flow: no itinerary loaded + the message reads as "build a trip".
    // Run the real generator and surface a full preview the user can save or
    // discard, instead of answering with prose.
    if (!itinerary && onProposeNewTrip && detectCreateIntent(userText)) {
      setMessages([...newMessages, { role: 'assistant', content: t('agentCreateBuilding'), streaming: true, creating: true }])
      const params = parseCreateRequest(userText, language)
      const abort = streamCreate(
        params,
        (text) => updateLastAssistant(() => ({ content: text })),
        (generated) => {
          setLoading(false)
          updateLastAssistant(() => ({
            content: t('agentCreateReady'),
            streaming: false,
            creating: false,
            proposedNewTrip: true,
          }))
          onProposeNewTrip(generated, params)
        },
        (errMsg) => {
          setLoading(false)
          const content = errorContent(errMsg)
          updateLastAssistant(() => ({ content, streaming: false, creating: false }))
        },
      )
      abortRef.current = abort
      return
    }

    setMessages([...newMessages, { role: 'assistant', content: '', streaming: true }])

    const abort = streamChat(
      { messages: newMessages, itinerary: itinerary || undefined, mode, language },
      (chunk) => updateLastAssistant(msg => ({ content: msg.content + chunk })),
      ({ response, patch, sources, warning, policy }) => {
        setLoading(false)
        // Inline apply (review bar + day cards) is only for a patch the SERVER
        // says this user may apply in place (policy 'apply_allowed'). A viewer's
        // patch ('duplicate_only') falls through to the chat diff card, whose
        // action is "save as my copy" — the modified-personal-copy flow.
        const changes = patch ? describePatch(itinerary || {}, patch) : null
        const inlineReview = !!(
          patch && canEdit && onProposePatch && changes?.length && policy !== 'duplicate_only'
        )
        if (inlineReview) onProposePatch(patch)
        updateLastAssistant(() => ({
          content: response,
          streaming: false,
          patch: inlineReview ? null : (patch || null),
          changes: inlineReview ? null : changes,
          proposedInline: inlineReview,
          warning: warning || null,
          sources: sources || [],
        }))
      },
      (errMsg) => {
        setLoading(false)
        const content = errorContent(errMsg)
        updateLastAssistant(() => ({ content, streaming: false }))
      },
    )
    abortRef.current = abort
  }, [input, loading, messages, itinerary, mode, language, canEdit, onProposePatch, onProposeNewTrip, t])

  const handleApplyPatch = useCallback((patch) => {
    if (!itinerary || !canEdit) return
    const { patch: safe } = sanitizePatch(patch)
    const updated = normalizeItinerary(applyPatch(itinerary, safe))
    updated.version = (itinerary.version || 1) + 1
    onItineraryChange?.(updated, { source: 'agent_edit' })
    setMessages(prev => prev.map(m => m.patch === patch ? { ...m, patch: null, changes: null } : m))
  }, [itinerary, canEdit, onItineraryChange])

  const handleDuplicateWithPatch = useCallback((patch) => {
    if (!user) return
    const { patch: safe } = sanitizePatch(patch)
    const base = itinerary ? normalizeItinerary(applyPatch(itinerary, safe)) : {}
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
        variant={isNarrow ? 'temporary' : 'persistent'}
        open={open}
        onClose={handleClose}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: { xs: '100vw', sm: DRAWER_WIDTH },
            maxWidth: '100vw',
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
