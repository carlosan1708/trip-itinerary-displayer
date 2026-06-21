import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { useT } from '../i18n'

/**
 * Sticky bar shown at the top of the trip view while an AI patch is pending
 * review. Summarises how many days/parts change, and offers Accept all /
 * Reject all plus a "jump to next change" affordance. The inline per-day
 * DayCardDiff handles single-day accept/reject; this bar handles the whole set.
 */
export default function AgentReviewBar({ diff, canEdit, onAcceptAll, onRejectAll, onJumpNext, agentOpen }) {
  const t = useT()
  if (!diff || diff.total === 0) return null

  const parts = []
  if (diff.dayCount > 0) {
    parts.push(t(diff.dayCount === 1 ? 'agentReviewDayCount' : 'agentReviewDayCountPlural', { count: diff.dayCount }))
  }
  if (diff.partCount > 0) {
    parts.push(t(diff.partCount === 1 ? 'agentReviewPartCount' : 'agentReviewPartCountPlural', { count: diff.partCount }))
  }

  return (
    <Box
      data-testid="agent-review-bar"
      sx={{
        position: 'sticky', top: 0,
        // Sit above the persistent assistant drawer (its docked paper is ~1200)
        // so the action buttons stay clickable while the drawer is open.
        zIndex: 1300,
        background: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 55%, #1b5e20 100%)',
        color: '#fff',
        boxShadow: '0 4px 18px rgba(74,20,140,0.35)',
        // Keep the content clear of the open drawer on wide screens.
        transition: 'padding-right 0.3s ease',
        pr: agentOpen ? { xs: 0, md: '420px' } : 0,
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1.25}
        sx={{ px: { xs: 2, sm: 3 }, py: 1.25, maxWidth: 'md', mx: 'auto' }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <AutoAwesomeIcon sx={{ fontSize: 18 }} />
          <Typography variant="body2" fontWeight={700} noWrap>
            {t('agentReviewTitle')}
          </Typography>
          <Chip
            label={parts.join(' · ')}
            size="small"
            sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 11, height: 22, fontWeight: 600 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {onJumpNext && (
            <Button
              size="small"
              onClick={onJumpNext}
              data-testid="review-jump-next"
              startIcon={<KeyboardArrowDownIcon sx={{ fontSize: '16px !important' }} />}
              sx={{ textTransform: 'none', fontSize: 12, color: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 2,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' } }}
            >
              {t('agentReviewJump')}
            </Button>
          )}
          <Button
            size="small"
            onClick={onRejectAll}
            data-testid="review-reject-all"
            startIcon={<CloseIcon sx={{ fontSize: '15px !important' }} />}
            sx={{ textTransform: 'none', fontSize: 12, color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 2,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' } }}
          >
            {t('agentReviewRejectAll')}
          </Button>
          {canEdit && (
            <Button
              size="small"
              variant="contained"
              onClick={onAcceptAll}
              data-testid="review-accept-all"
              startIcon={<CheckIcon sx={{ fontSize: '15px !important' }} />}
              sx={{ textTransform: 'none', fontSize: 12, fontWeight: 700, borderRadius: 2, boxShadow: 'none',
                bgcolor: '#fff', color: '#4A148C',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.88)' } }}
            >
              {t('agentReviewAcceptAll')}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  )
}
