import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import EditNoteIcon from '@mui/icons-material/EditNote'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CloseIcon from '@mui/icons-material/Close'
import { useT } from '../i18n'

const FIELD_KEYS = {
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

const FIELD_COLORS = {
  activities: '#2E7D32',
  logistics: '#0277BD',
  tips: '#F57C00',
  warnings: '#c62828',
  images: '#7B1FA2',
  links: '#00838F',
}

export default function ItineraryAgentDiff({ changes, canEdit, onApply, onDuplicate, onDismiss }) {
  const t = useT()
  return (
    <Box
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Box sx={{
          width: 6, height: 6, borderRadius: '50%', mr: 1.25, flexShrink: 0,
          bgcolor: '#81c784',
          boxShadow: '0 0 6px #81c784',
        }} />
        <Typography variant="caption" fontWeight={700} sx={{ color: 'rgba(255,255,255,0.9)', flex: 1, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10.5 }}>
          {t('agentDiffTitle')}
        </Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', mr: 1, fontSize: 11 }}>
          {changes.length === 0
            ? t('agentDiffNoChanges')
            : t(changes.length === 1 ? 'agentDiffDayCount' : 'agentDiffDayCountPlural', { count: changes.length })}
        </Typography>
        <Box
          component="span"
          onClick={onDismiss}
          sx={{ cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', '&:hover': { color: 'rgba(255,255,255,0.7)' } }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </Box>
      </Stack>

      {/* Change list */}
      <Stack>
        {changes.map((c, i) => (
          <Box
            key={i}
            sx={{
              px: 2, py: 1.25,
              borderBottom: i < changes.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
          >
            <Stack direction="row" alignItems="baseline" spacing={1} mb={0.75} flexWrap="wrap" useFlexGap>
              {c.dayNumber && (
                <Typography variant="caption" sx={{
                  fontWeight: 700, color: '#fff',
                  bgcolor: 'rgba(255,255,255,0.1)', px: 1, py: 0.25, borderRadius: 1, fontSize: 11,
                }}>
                  {t('agentDiffDayLabel', { n: c.dayNumber })}
                </Typography>
              )}
              {!c.dayNumber && (
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  {c.partTitle}
                </Typography>
              )}
              {c.date && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                  {c.date}
                </Typography>
              )}
              {c.location && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                  · {c.location}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {c.changedFields.map(f => (
                <Chip
                  key={f}
                  label={FIELD_KEYS[f] ? t(FIELD_KEYS[f]) : f}
                  size="small"
                  sx={{
                    fontSize: 10, height: 18,
                    bgcolor: FIELD_COLORS[f] ? `${FIELD_COLORS[f]}30` : 'rgba(255,255,255,0.08)',
                    color: FIELD_COLORS[f] || 'rgba(255,255,255,0.6)',
                    border: `1px solid ${FIELD_COLORS[f] ? `${FIELD_COLORS[f]}60` : 'rgba(255,255,255,0.12)'}`,
                  }}
                />
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>

      {/* Actions */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)', justifyContent: 'flex-end' }}
      >
        <Button
          size="small"
          onClick={onDuplicate}
          startIcon={<ContentCopyIcon sx={{ fontSize: '14px !important' }} />}
          sx={{
            color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'none',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 2, px: 1.5,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.07)', color: '#fff', borderColor: 'rgba(255,255,255,0.35)' },
          }}
        >
          {t('agentDiffMyVersion')}
        </Button>
        {canEdit && changes.length > 0 && (
          <Button
            size="small"
            onClick={onApply}
            startIcon={<EditNoteIcon sx={{ fontSize: '14px !important' }} />}
            data-testid="apply-changes-btn"
            sx={{
              fontSize: 12, textTransform: 'none', borderRadius: 2, px: 1.5,
              background: 'linear-gradient(135deg, #2E7D32, #1b5e20)',
              color: '#fff',
              boxShadow: '0 2px 10px rgba(46,125,50,0.35)',
              '&:hover': { background: 'linear-gradient(135deg, #388e3c, #2E7D32)', boxShadow: '0 3px 14px rgba(46,125,50,0.5)' },
            }}
          >
            {t('agentDiffApply')}
          </Button>
        )}
      </Stack>
    </Box>
  )
}
