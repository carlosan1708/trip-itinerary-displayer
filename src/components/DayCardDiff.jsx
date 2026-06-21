import { Box, Button, Stack, Typography } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import { diffList } from '../utils/itineraryPatch'
import { useT } from '../i18n'

// Field name → i18n label. Falls back to the raw field key.
const FIELD_LABELS = {
  activities: 'agentDiffFieldActivities',
  logistics:  'agentDiffFieldLogistics',
  tips:       'agentDiffFieldTips',
  warnings:   'agentDiffFieldWarnings',
  links:      'agentDiffFieldLinks',
  images:     'agentDiffFieldImages',
  subtitle:   'agentDiffFieldSubtitle',
  location:   'agentDiffFieldLocation',
  date:       'agentDiffFieldDate',
}

// Fields that are arrays of items → rendered as added/removed lists.
const LIST_FIELDS = new Set(['activities', 'tips', 'warnings', 'links', 'images', 'logistics'])

function itemText(item) {
  if (item == null) return ''
  if (typeof item === 'string') return item
  // logistics: { type, label, value }; links: { label, url }; images: { url, caption }
  if (item.label && item.value) return `${item.label}: ${item.value}`
  if (item.label && item.url) return `${item.label} (${item.url})`
  if (item.caption) return item.caption
  if (item.url) return item.url
  return JSON.stringify(item)
}

/**
 * Inline "proposed change" banner shown at the top of an affected day card.
 * Renders the real before/after content for each changed field, with
 * Accept / Reject for this day. Used by DayCard when a pending agent patch
 * touches that day.
 */
export default function DayCardDiff({ dayDiff, onAccept, onReject }) {
  const t = useT()
  if (!dayDiff?.fields?.length) return null

  return (
    <Box
      data-testid="day-card-diff"
      sx={{
        mb: 2, borderRadius: 2, overflow: 'hidden',
        border: '1px solid rgba(123,31,162,0.35)',
        background: 'linear-gradient(180deg, rgba(123,31,162,0.06), rgba(46,125,50,0.05))',
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1}
        sx={{ px: 1.75, py: 1, background: 'rgba(123,31,162,0.08)', borderBottom: '1px solid rgba(123,31,162,0.18)' }}>
        <AutoAwesomeIcon sx={{ fontSize: 15, color: '#7B1FA2' }} />
        <Typography variant="caption" fontWeight={700}
          sx={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6A1B9A', fontSize: 10.5 }}>
          {t('agentInlineProposed')}
        </Typography>
      </Stack>

      {/* Field-by-field before/after */}
      <Box sx={{ px: 1.75, py: 1.25 }}>
        {dayDiff.fields.map((f, i) => (
          <Box key={f.field} sx={{ mb: i < dayDiff.fields.length - 1 ? 1.5 : 0 }}>
            <Typography variant="caption" fontWeight={700}
              sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
              {FIELD_LABELS[f.field] ? t(FIELD_LABELS[f.field]) : f.field}
            </Typography>
            {LIST_FIELDS.has(f.field)
              ? <ListFieldDiff before={f.before} after={f.after} />
              : <ScalarFieldDiff before={f.before} after={f.after} />}
          </Box>
        ))}
      </Box>

      {/* Actions */}
      <Stack direction="row" spacing={1} justifyContent="flex-end"
        sx={{ px: 1.75, py: 1, borderTop: '1px solid rgba(123,31,162,0.14)' }}>
        <Button
          size="small"
          onClick={onReject}
          data-testid="day-diff-reject"
          startIcon={<CloseIcon sx={{ fontSize: '15px !important' }} />}
          sx={{ textTransform: 'none', fontSize: 12, color: 'text.secondary',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}
        >
          {t('agentInlineReject')}
        </Button>
        {onAccept && (
          <Button
            size="small"
            variant="contained"
            onClick={onAccept}
            data-testid="day-diff-accept"
            startIcon={<CheckIcon sx={{ fontSize: '15px !important' }} />}
            sx={{ textTransform: 'none', fontSize: 12, boxShadow: 'none',
              background: 'linear-gradient(135deg, #2E7D32, #1b5e20)',
              '&:hover': { background: 'linear-gradient(135deg, #388e3c, #2E7D32)' } }}
          >
            {t('agentInlineAccept')}
          </Button>
        )}
      </Stack>
    </Box>
  )
}

function ScalarFieldDiff({ before, after }) {
  return (
    <Stack spacing={0.25} sx={{ mt: 0.25 }}>
      {before != null && before !== '' && (
        <DiffLine kind="removed" text={String(before)} />
      )}
      <DiffLine kind="added" text={String(after ?? '')} />
    </Stack>
  )
}

function ListFieldDiff({ before, after }) {
  const { added, removed } = diffList(before, after)
  if (!added.length && !removed.length) return null
  return (
    <Stack spacing={0.25} sx={{ mt: 0.25 }}>
      {removed.map((item, i) => <DiffLine key={`r${i}`} kind="removed" text={itemText(item)} />)}
      {added.map((item, i) => <DiffLine key={`a${i}`} kind="added" text={itemText(item)} />)}
    </Stack>
  )
}

function DiffLine({ kind, text }) {
  const removed = kind === 'removed'
  return (
    <Stack direction="row" spacing={0.75} alignItems="flex-start">
      {removed
        ? <RemoveIcon sx={{ fontSize: 14, color: '#c62828', mt: '2px', flexShrink: 0 }} />
        : <AddIcon sx={{ fontSize: 14, color: '#2E7D32', mt: '2px', flexShrink: 0 }} />}
      <Typography variant="body2"
        sx={{
          fontSize: 13, lineHeight: 1.45,
          color: removed ? 'rgba(0,0,0,0.45)' : 'text.primary',
          textDecoration: removed ? 'line-through' : 'none',
          bgcolor: removed ? 'rgba(198,40,40,0.06)' : 'rgba(46,125,50,0.08)',
          borderRadius: 0.75, px: 0.75, py: 0.25, wordBreak: 'break-word',
        }}>
        {text}
      </Typography>
    </Stack>
  )
}
