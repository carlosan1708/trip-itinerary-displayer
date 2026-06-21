import { Box, Button, Chip, Container, Stack, Typography } from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import PartSection from './PartSection'
import DayCard from './DayCard'
import { countDays } from '../utils/itineraryPatch'
import { useT } from '../i18n'

/**
 * Full-page preview of an AI-generated itinerary, shown before it is saved.
 * A sticky bar offers Save (adds it to My Trips) / Discard. The itinerary is
 * rendered with the normal read-only PartSection + DayCard, so what you preview
 * is exactly what you get. No tripId is passed, so day cards skip Firestore.
 */
export default function NewTripPreview({ itinerary, agentOpen, onSave, onDiscard }) {
  const t = useT()
  if (!itinerary) return null

  // Derive the day count from the real structure so it can't drift from the
  // model-authored stats after agent edits (add/remove day).
  const days = countDays(itinerary)
  const dayLabel = t(days === 1 ? 'agentDiffDayCount' : 'agentDiffDayCountPlural', { count: days })

  return (
    <Box data-testid="new-trip-preview" sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sticky Save / Discard bar */}
      <Box
        data-testid="new-trip-bar"
        sx={{
          position: 'sticky', top: 0, zIndex: 1300,
          background: 'linear-gradient(135deg, #1b5e20 0%, #2E7D32 50%, #4A148C 100%)',
          color: '#fff',
          boxShadow: '0 4px 18px rgba(27,94,32,0.35)',
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
            <Typography variant="body2" fontWeight={700} noWrap>{t('agentCreateBarTitle')}</Typography>
            {days > 0 && (
              <Chip data-testid="new-trip-daycount" label={dayLabel} size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 11, height: 22, fontWeight: 600 }} />
            )}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              onClick={onDiscard}
              data-testid="new-trip-discard"
              startIcon={<CloseIcon sx={{ fontSize: '15px !important' }} />}
              sx={{ textTransform: 'none', fontSize: 12, color: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 2,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' } }}
            >
              {t('agentCreateDiscard')}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={onSave}
              data-testid="new-trip-save"
              startIcon={<CheckIcon sx={{ fontSize: '15px !important' }} />}
              sx={{ textTransform: 'none', fontSize: 12, fontWeight: 700, borderRadius: 2, boxShadow: 'none',
                bgcolor: '#fff', color: '#1b5e20',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.88)' } }}
            >
              {t('agentCreateSave')}
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Header + itinerary body */}
      <Container maxWidth="md" sx={{
        py: 4, px: { xs: 2, sm: 3 },
        transition: 'padding-right 0.3s ease',
        pr: agentOpen ? { xs: 2, sm: 3, md: '440px' } : { xs: 2, sm: 3 },
      }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h4" fontWeight={800}>{itinerary.title || itinerary.label}</Typography>
          {itinerary.subtitle && (
            <Typography variant="subtitle1" color="text.secondary">{itinerary.subtitle}</Typography>
          )}
          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
            {/* First chip is the day count, derived from structure so it can't
                drift; the rest (countries, cities) stay as model-authored stats. */}
            {days > 0 && <Chip label={dayLabel} size="small" variant="outlined" />}
            {(itinerary.stats || []).slice(1).map((s, i) => (
              <Chip key={i} label={s} size="small" variant="outlined" />
            ))}
          </Stack>
        </Box>

        {(itinerary.parts || []).map(part => (
          <Box key={part.id}>
            <PartSection part={part} editMode={false} onPartChange={() => {}} />
            {(part.days || []).map(day => (
              <DayCard
                key={day.dayNumber}
                day={day}
                partColor={part.color}
                editMode={false}
                onDayChange={() => {}}
                tripId={null}
                gatewayTripId={null}
                user={null}
                isAdmin={false}
              />
            ))}
          </Box>
        ))}
      </Container>
    </Box>
  )
}
