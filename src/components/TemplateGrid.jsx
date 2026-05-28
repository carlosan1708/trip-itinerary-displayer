import { Box, Typography, Chip } from '@mui/material'
import { templates } from '../data/templates/templates'
import { useT } from '../i18n'

export default function TemplateGrid({ onPick }) {
  const t = useT()
  return (
    <Box
      data-testid="template-grid"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
        gap: 1.5,
      }}
    >
      {templates.map(tpl => (
        <Box
          key={tpl.id}
          data-testid={`template-tile-${tpl.id}`}
          onClick={() => onPick(tpl)}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: 2,
            cursor: 'pointer',
            transition: 'all 0.15s',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: 'rgba(25, 118, 210, 0.04)',
              transform: 'translateY(-1px)',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box component="span" sx={{ fontSize: 22 }}>{tpl.emoji}</Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
              {t(tpl.nameKey)}
            </Typography>
            <Chip
              label={t('tplDaysChip', { days: tpl.days })}
              size="small"
              sx={{ fontSize: '0.65rem', height: 18, '& .MuiChip-label': { px: 0.75 } }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {t(tpl.descKey)}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
