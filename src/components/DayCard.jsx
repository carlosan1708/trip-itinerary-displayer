import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  List,
  ListItem,
  Alert,
  Chip,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import FlightIcon from '@mui/icons-material/Flight'
import HotelIcon from '@mui/icons-material/Hotel'
import TrainIcon from '@mui/icons-material/Train'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { parseText } from '../utils/parseText'

const logisticIcons = {
  drive:  <DirectionsCarIcon fontSize="small" />,
  flight: <FlightIcon fontSize="small" />,
  stay:   <HotelIcon fontSize="small" />,
  train:  <TrainIcon fontSize="small" />,
}

export default function DayCard({ day, partColor }) {
  return (
    <Accordion
      disableGutters
      elevation={1}
      sx={{
        mb: 1.5,
        borderLeft: `4px solid ${partColor}`,
        borderRadius: '0 8px 8px 0 !important',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 3 },
      }}
    >
      {/* ── Summary ── */}
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ py: 1, minHeight: 64 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Day badge */}
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              bgcolor: partColor,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {day.dayNumber}
          </Box>

          {/* Text */}
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
              {day.date}
            </Typography>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
              {day.location}
            </Typography>
            <Typography variant="body2" color="text.secondary" lineHeight={1.3}>
              {day.subtitle}
            </Typography>
          </Box>
        </Box>
      </AccordionSummary>

      {/* ── Details ── */}
      <AccordionDetails sx={{ pt: 0, pb: 2.5, px: 2.5 }}>

        {/* Images */}
        {day.images?.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              overflowX: 'auto',
              mb: 2,
              mx: -2.5,
              px: 2.5,
              pb: 0.5,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {day.images.map((img, i) => (
              <Box
                key={i}
                sx={{
                  position: 'relative',
                  flexShrink: 0,
                  width: day.images.length === 1 ? '100%' : 260,
                  height: 190,
                  borderRadius: 2,
                  overflow: 'hidden',
                  '&:hover .caption': { opacity: 1 },
                }}
              >
                <Box
                  component="img"
                  src={img.url}
                  alt={img.caption || day.location}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {img.caption && (
                  <Box
                    className="caption"
                    sx={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                      fontSize: '0.75rem', px: 1.5, py: 0.75,
                      opacity: 0, transition: 'opacity 0.2s',
                    }}
                  >
                    {img.caption}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* Logistics table */}
        {day.logistics?.length > 0 && (
          <Box
            sx={{
              bgcolor: '#f5f5f5',
              borderRadius: 1,
              p: 1.5,
              mb: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            {day.logistics.map((l, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ color: partColor, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {logisticIcons[l.type]}
                </Box>
                <Typography variant="body2">
                  <strong>{l.label}:</strong> {l.value}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Activities */}
        {day.activities?.length > 0 && (
          <List dense disablePadding sx={{ mb: 1 }}>
            {day.activities.map((activity, i) => (
              <ListItem key={i} sx={{ px: 0, py: 0.5, alignItems: 'flex-start' }}>
                <FiberManualRecordIcon
                  sx={{ fontSize: 8, color: partColor, mt: '6px', mr: 1.5, flexShrink: 0 }}
                />
                <Typography variant="body2" lineHeight={1.5}>
                  {parseText(activity)}
                </Typography>
              </ListItem>
            ))}
          </List>
        )}

        {/* Warnings */}
        {day.warnings?.map((w, i) => (
          <Alert key={i} severity="warning" sx={{ mb: 1, fontSize: '0.83rem' }}>
            {parseText(w)}
          </Alert>
        ))}

        {/* Tips */}
        {day.tips?.map((t, i) => (
          <Alert
            key={i}
            severity="info"
            icon={false}
            sx={{
              mb: 0.75,
              fontSize: '0.83rem',
              py: 0.5,
              bgcolor: '#EEF4FB',
              color: '#1a3a5c',
              borderLeft: '3px solid #90CAF9',
              borderRadius: 1,
            }}
          >
            {parseText(t)}
          </Alert>
        ))}

        {/* Links */}
        {day.links?.length > 0 && (
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {day.links.map((link, i) => (
              <Chip
                key={i}
                label={link.label}
                icon={<OpenInNewIcon />}
                component="a"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                clickable
                size="small"
                variant="outlined"
                sx={{
                  borderColor: partColor,
                  color: partColor,
                  '& .MuiChip-icon': { color: partColor },
                }}
              />
            ))}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  )
}
