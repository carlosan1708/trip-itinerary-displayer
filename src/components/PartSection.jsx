import { Box, Typography, Divider } from '@mui/material'

export default function PartSection({ part }) {
  return (
    <Box sx={{ mt: 5, mb: 2.5 }}>
      <Divider
        sx={{
          mb: 2,
          '&::before, &::after': { borderColor: part.color, opacity: 0.3 },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 0.5,
            borderRadius: 2,
            bgcolor: part.color,
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Parte {part.id}
        </Box>
      </Divider>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: part.color }}>
          {part.emoji} {part.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {part.daysRange}
        </Typography>
      </Box>
    </Box>
  )
}
