import { useEffect, useRef } from 'react'
import {
  Box, Chip, IconButton, InputBase, Stack, Tooltip, Typography,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import LanguageIcon from '@mui/icons-material/Language'
import ItineraryAgentDiff from './ItineraryAgentDiff'
import ItineraryAgentProgress from './ItineraryAgentProgress'

export default function ItineraryAgentChat({
  messages,
  input,
  onInputChange,
  onSubmit,
  loading,
  canEdit,
  itinerary,
  onApplyPatch,
  onDuplicateWithPatch,
  onDismissPatch,
  progressSteps,
  progressCurrent,
}) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <Stack sx={{ height: '100%', overflow: 'hidden' }}>

      {/* Message list */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2, scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>

        {messages.length === 0 && (
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Box sx={{
              display: 'inline-flex', p: 2, borderRadius: '50%', mb: 2,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <Box component="span" sx={{ fontSize: 28 }}>✨</Box>
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', px: 2, lineHeight: 1.6 }}>
              {itinerary
                ? 'Pregunta sobre el itinerario o pide cambios…'
                : 'Describe el viaje que quieres planear y lo creo para ti.'}
            </Typography>
          </Box>
        )}

        {messages.map((msg, i) => (
          <Box key={i} sx={{ mb: 2.5 }}>
            <Stack direction="row" justifyContent={msg.role === 'user' ? 'flex-end' : 'flex-start'}>
              {msg.role === 'assistant' && (
                <Box sx={{
                  width: 26, height: 26, borderRadius: '50%', mr: 1, mt: 0.25, flexShrink: 0,
                  background: 'linear-gradient(135deg, #B71C1C, #7B1FA2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Box component="span" sx={{ fontSize: 12 }}>✨</Box>
                </Box>
              )}

              <Box
                sx={{
                  maxWidth: '78%',
                  px: 1.75, py: 1.25,
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  ...(msg.role === 'user' ? {
                    background: 'linear-gradient(135deg, #B71C1C 0%, #c62828 100%)',
                    color: '#fff',
                    boxShadow: '0 2px 12px rgba(183,28,28,0.3)',
                  } : {
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(8px)',
                  }),
                }}
              >
                {msg.streaming && !msg.content
                  ? <ThinkingDots />
                  : (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13.5 }}>
                      {msg.content || '…'}
                      {msg.streaming && <BlinkingCursor />}
                    </Typography>
                  )
                }
              </Box>
            </Stack>

            {/* Sources */}
            {msg.sources?.length > 0 && (
              <Box sx={{ ml: 4.5, mt: 0.75 }}>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
                  <LanguageIcon sx={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', mr: 0.25 }} />
                  {msg.sources.map((s, j) => (
                    <Chip
                      key={j}
                      label={s.title}
                      size="small"
                      component="a"
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      clickable
                      icon={<OpenInNewIcon sx={{ fontSize: '10px !important' }} />}
                      sx={{
                        fontSize: 10, height: 20,
                        bgcolor: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.5)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        maxWidth: 160,
                        '& .MuiChip-icon': { color: 'rgba(255,255,255,0.35)' },
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' },
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Diff card */}
            {msg.patch !== null && msg.patch !== undefined && msg.changes !== null && msg.changes !== undefined && (
              <Box sx={{ ml: msg.role === 'assistant' ? 4.5 : 0, mt: 1 }}>
                <ItineraryAgentDiff
                  changes={msg.changes}
                  canEdit={canEdit}
                  onApply={() => onApplyPatch(msg.patch)}
                  onDuplicate={() => onDuplicateWithPatch(msg.patch)}
                  onDismiss={() => onDismissPatch(i)}
                />
              </Box>
            )}
          </Box>
        ))}

        {/* Creation progress */}
        {progressSteps?.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <ItineraryAgentProgress steps={progressSteps} currentStep={progressCurrent} />
          </Box>
        )}

        <div ref={bottomRef} />
      </Box>

      {/* Input bar */}
      <Box sx={{
        px: 2, py: 1.5,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.2)',
        backdropFilter: 'blur(8px)',
      }}>
        <Stack
          direction="row"
          alignItems="flex-end"
          spacing={1}
          sx={{
            bgcolor: 'rgba(255,255,255,0.07)',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.12)',
            px: 2, py: 0.75,
            transition: 'border-color 0.2s',
            '&:focus-within': { borderColor: 'rgba(255,255,255,0.3)' },
          }}
        >
          <InputBase
            fullWidth
            multiline
            maxRows={4}
            placeholder="Escribe un mensaje…"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!loading && input.trim()) onSubmit()
              }
            }}
            sx={{
              fontSize: 13.5,
              color: '#fff',
              '& .MuiInputBase-input': {
                color: '#fff',
                '&::placeholder': { color: 'rgba(255,255,255,0.3)', opacity: 1 },
              },
            }}
            inputProps={{ 'data-testid': 'agent-input' }}
          />
          <Tooltip title="Enviar (Enter)">
            <span>
              <IconButton
                size="small"
                onClick={onSubmit}
                disabled={loading || !input.trim()}
                data-testid="agent-send-btn"
                sx={{
                  color: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.2)',
                  bgcolor: input.trim() && !loading ? 'rgba(183,28,28,0.7)' : 'transparent',
                  borderRadius: 2,
                  p: 0.75,
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: 'rgba(183,28,28,0.9)' },
                  '&.Mui-disabled': { color: 'rgba(255,255,255,0.2)' },
                }}
              >
                <SendIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, mt: 0.5, display: 'block', textAlign: 'center' }}>
          Shift+Enter para nueva línea · los cambios siempre requieren confirmación
        </Typography>
      </Box>
    </Stack>
  )
}

function BlinkingCursor() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block', width: 7, height: '0.85em',
        bgcolor: 'rgba(255,255,255,0.7)', ml: 0.25, verticalAlign: 'text-bottom',
        borderRadius: 0.5,
        animation: 'blink 1s step-end infinite',
        '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } },
      }}
    />
  )
}

function ThinkingDots() {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ py: 0.25 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 7, height: 7, borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.5)',
            animation: 'thinking-bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
            '@keyframes thinking-bounce': {
              '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: 0.4 },
              '40%':           { transform: 'scale(1)',   opacity: 1 },
            },
          }}
        />
      ))}
    </Stack>
  )
}
