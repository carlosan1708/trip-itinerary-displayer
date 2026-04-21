import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'

export default function ItineraryAgentProgress({ steps, currentStep }) {
  return (
    <Box
      sx={{
        bgcolor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 2,
        px: 2,
        py: 1.5,
      }}
    >
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10, display: 'block', mb: 1.25 }}>
        Generando itinerario
      </Typography>
      <Stack spacing={1}>
        {steps.map((step, i) => {
          const done   = i < currentStep
          const active = i === currentStep
          return (
            <Stack key={i} direction="row" spacing={1.25} alignItems="center">
              {done ? (
                <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#81c784', flexShrink: 0 }} />
              ) : active ? (
                <CircularProgress size={14} thickness={5} sx={{ color: '#90caf9', flexShrink: 0 }} />
              ) : (
                <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
              )}
              <Typography
                variant="body2"
                sx={{
                  fontSize: 13,
                  color: done ? 'rgba(255,255,255,0.4)' : active ? '#fff' : 'rgba(255,255,255,0.25)',
                  textDecoration: done ? 'line-through' : 'none',
                }}
              >
                {step}
              </Typography>
            </Stack>
          )
        })}
      </Stack>
    </Box>
  )
}
