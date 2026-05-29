import { useState, useRef, useEffect } from 'react'
import {
  Box, Button, Chip, IconButton, LinearProgress, Stack,
  TextField, Typography, Fade,
} from '@mui/material'
import ArrowBackIcon  from '@mui/icons-material/ArrowBack'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { streamCreate } from '../utils/agentClient'
import { useT, useLang } from '../i18n'

// ── Question definitions ────────────────────────────────────────────────────

function useQuestions() {
  const t = useT()
  return [
    {
      id: 'destination',
      question: t('wizDestination'),
      hint: t('wizDestinationHint'),
      type: 'text',
    },
    {
      id: 'dates',
      question: t('wizDates'),
      hint: t('wizDatesHint'),
      type: 'text',
    },
    {
      id: 'num_days',
      question: t('wizDays'),
      hint: t('wizDaysHint'),
      type: 'number',
    },
    {
      id: 'travelers',
      question: t('wizTravelers'),
      hint: t('wizTravelersHint'),
      type: 'text',
    },
    {
      id: 'budget',
      question: t('wizBudget'),
      type: 'chips',
      options: [
        { label: t('wizBudgetLow'),  value: 'budget' },
        { label: t('wizBudgetMid'),  value: 'mid' },
        { label: t('wizBudgetHigh'), value: 'luxury' },
      ],
    },
    {
      id: 'pace',
      question: t('wizPace'),
      type: 'chips',
      options: [
        { label: t('wizPaceRelaxed'),  value: 'relaxed' },
        { label: t('wizPaceBalanced'), value: 'moderate' },
        { label: t('wizPacePacked'),   value: 'packed' },
      ],
    },
    {
      id: 'interests',
      question: t('wizInterests'),
      hint: t('wizInterestsHint'),
      type: 'text',
    },
    {
      id: 'transport',
      question: t('wizTransport'),
      hint: t('wizTransportHint'),
      type: 'text',
    },
    {
      id: 'highlights',
      question: t('wizHighlights'),
      hint: t('wizHighlightsHint'),
      type: 'text',
    },
    {
      id: 'notes',
      question: t('wizNotes'),
      hint: t('wizNotesHint'),
      type: 'text',
      optional: true,
    },
  ]
}

// ── Main component ──────────────────────────────────────────────────────────

export default function TripPlannerWizard({ onComplete, onCancel }) {
  const t        = useT()
  const lang     = useLang()
  const questions = useQuestions()

  const [step, setStep]       = useState(0)
  const [answers, setAnswers] = useState({})
  const [input, setInput]     = useState('')
  const [visible, setVisible] = useState(true)

  // generation phase
  const [generating, setGenerating]   = useState(false)
  const [progressLog, setProgressLog] = useState([])
  const [genError, setGenError]       = useState('')
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  const q = questions[step]
  const isLast = step === questions.length - 1
  const progress = ((step) / questions.length) * 100

  useEffect(() => {
    if (!generating) inputRef.current?.focus()
  }, [step, generating])

  // cleanup on unmount
  useEffect(() => () => abortRef.current?.(), [])

  function currentValue() {
    return answers[q.id] ?? ''
  }

  function canAdvance() {
    const val = input.trim() || currentValue()
    if (q.optional) return true
    return val.length > 0
  }

  function commitAndAdvance() {
    const val = input.trim() || currentValue()
    const next = { ...answers, [q.id]: val }
    setAnswers(next)
    setInput('')

    if (isLast) {
      generate(next)
    } else {
      setVisible(false)
      setTimeout(() => { setStep(s => s + 1); setVisible(true) }, 180)
    }
  }

  function goBack() {
    if (step === 0) return
    setVisible(false)
    setTimeout(() => {
      setStep(s => s - 1)
      setInput('')
      setVisible(true)
    }, 180)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && canAdvance()) {
      e.preventDefault()
      commitAndAdvance()
    }
  }

  function generate(finalAnswers) {
    setGenerating(true)
    setProgressLog([])
    setGenError('')

    const interests = [
      finalAnswers.interests,
      finalAnswers.transport,
      finalAnswers.highlights,
      finalAnswers.notes,
    ].filter(Boolean)

    const travelersMatch = String(finalAnswers.travelers || '').match(/\d+/)
    const travelersInt = travelersMatch
      ? parseInt(travelersMatch[0], 10)
      : /couple|pareja/i.test(finalAnswers.travelers || '') ? 2
      : /solo|alone/i.test(finalAnswers.travelers || '')   ? 1
      : 2

    const params = {
      destination: finalAnswers.destination,
      dates:       finalAnswers.dates,
      num_days:    parseInt(finalAnswers.num_days, 10) || 7,
      travelers:   travelersInt,
      budget:      finalAnswers.budget,
      pace:        finalAnswers.pace,
      interests,
      language:    lang,
    }

    abortRef.current = streamCreate(
      params,
      (text) => setProgressLog(prev => [...prev, text]),
      (itinerary) => {
        setGenerating(false)
        const name = itinerary.label || itinerary.title || finalAnswers.destination
        onComplete(name, itinerary)
      },
      (err) => {
        setGenerating(false)
        setGenError(err)
      },
    )
  }

  // ── Generation screen ───────────────────────────────────────────────────
  if (generating || genError) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Box sx={{
          width: 56, height: 56, borderRadius: '50%', mx: 'auto', mb: 2,
          background: 'linear-gradient(135deg, #B71C1C 0%, #7B1FA2 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: generating ? 'spin 2s linear infinite' : 'none',
          '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        }}>
          <AutoAwesomeIcon sx={{ color: '#fff', fontSize: 26 }} />
        </Box>

        <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
          {genError ? t('wizGenError') : t('wizGenerating')}
        </Typography>

        {!genError && (
          <Typography variant="body2" color="text.secondary" mb={3}>
            {t('wizGenHint')}
          </Typography>
        )}

        {genError && (
          <Typography variant="body2" color="error" mb={2}>{genError}</Typography>
        )}

        {progressLog.length > 0 && (
          <Stack spacing={0.75} alignItems="center" mb={2}>
            {progressLog.map((msg, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                <Typography variant="caption" color="text.secondary">{msg}</Typography>
              </Box>
            ))}
          </Stack>
        )}

        {generating && <LinearProgress sx={{ borderRadius: 1, mx: 4 }} />}

        {genError && (
          <Stack direction="row" spacing={1} justifyContent="center" mt={2}>
            <Button size="small" onClick={onCancel}>{t('cancel')}</Button>
            <Button size="small" variant="contained" onClick={() => generate(answers)}>
              {t('wizRetry')}
            </Button>
          </Stack>
        )}
      </Box>
    )
  }

  // ── Q&A screen ──────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Progress */}
      <Box sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t('wizStep', { current: step + 1, total: questions.length })}
          </Typography>
          {q.optional && (
            <Typography variant="caption" color="text.secondary">{t('wizOptional')}</Typography>
          )}
        </Box>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ borderRadius: 1, height: 4, bgcolor: 'grey.100',
            '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #B71C1C, #7B1FA2)' } }}
        />
      </Box>

      {/* Previous answers summary */}
      {step > 0 && (
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {questions.slice(0, step).map(pq => {
            const val = answers[pq.id]
            if (!val) return null
            return (
              <Chip
                key={pq.id}
                label={`${val}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.7rem', maxWidth: 180, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
              />
            )
          })}
        </Box>
      )}

      {/* Current question */}
      <Fade in={visible} timeout={200}>
        <Box>
          <Typography variant="h6" fontWeight={700} mb={0.5} sx={{ lineHeight: 1.3 }}>
            {q.question}
          </Typography>

          {q.type === 'chips' ? (
            <Stack direction="row" flexWrap="wrap" gap={1} mt={1.5} mb={2}>
              {q.options.map(opt => {
                const selected = (answers[q.id] || input) === opt.value
                return (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    clickable
                    color={selected ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    onClick={() => {
                      setInput(opt.value)
                      setAnswers(a => ({ ...a, [q.id]: opt.value }))
                    }}
                    sx={{ fontSize: '0.85rem', px: 0.5 }}
                  />
                )
              })}
            </Stack>
          ) : (
            <TextField
              inputRef={inputRef}
              size="small"
              fullWidth
              placeholder={q.hint}
              type={q.type === 'number' ? 'number' : 'text'}
              value={input !== '' ? input : (answers[q.id] ?? '')}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              sx={{ mt: 1.5, mb: 2 }}
              inputProps={{ min: q.type === 'number' ? 1 : undefined }}
            />
          )}
        </Box>
      </Fade>

      {/* Navigation */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mt={1}>
        <IconButton size="small" onClick={goBack} disabled={step === 0}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>

        <Button
          variant="contained"
          size="small"
          disabled={!canAdvance()}
          onClick={commitAndAdvance}
          startIcon={isLast ? <AutoAwesomeIcon sx={{ fontSize: '16px !important' }} /> : null}
          sx={isLast ? {
            background: 'linear-gradient(135deg, #B71C1C 0%, #7B1FA2 100%)',
            px: 2.5,
          } : {}}
        >
          {isLast ? t('wizGenerate') : t('wizNext')}
        </Button>
      </Stack>
    </Box>
  )
}
