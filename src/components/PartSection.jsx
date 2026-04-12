import { Box, Typography, Divider, TextField } from '@mui/material'

export default function PartSection({ part, editMode, onPartChange }) {
  function update(field, value) {
    onPartChange({ ...part, [field]: value })
  }

  return (
    <Box sx={{ mt: 5, mb: 2.5 }}>
      <Divider sx={{ mb: 2, '&::before, &::after': { borderColor: part.color, opacity: 0.3 } }}>
        <Box sx={{ px: 2, py: 0.5, borderRadius: 2, bgcolor: part.color, color: '#fff', fontSize: '0.75rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          Parte {part.id}
        </Box>
      </Divider>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
        {editMode ? (
          <>
            <TextField
              size="small" variant="standard" value={part.emoji ?? ''}
              onChange={e => update('emoji', e.target.value)}
              sx={{ width: 56 }}
              inputProps={{ style: { fontSize: '1.4rem', textAlign: 'center' } }}
            />
            <TextField
              size="small" variant="standard" value={part.title}
              onChange={e => update('title', e.target.value)}
              sx={{ flex: 1, minWidth: 160, '& input': { fontWeight: 700, color: part.color, fontSize: '1.25rem' } }}
            />
            <TextField
              size="small" variant="standard" value={part.daysRange ?? ''}
              onChange={e => update('daysRange', e.target.value)}
              sx={{ width: 140, '& input': { fontStyle: 'italic', fontSize: '0.875rem' } }}
            />
          </>
        ) : (
          <>
            <Typography variant="h5" sx={{ fontWeight: 700, color: part.color }}>
              {part.emoji} {part.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {part.daysRange}
            </Typography>
          </>
        )}
      </Box>
    </Box>
  )
}
