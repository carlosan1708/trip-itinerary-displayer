import { useState, useEffect } from 'react'
import {
  Accordion, AccordionSummary, AccordionDetails,
  Box, Typography, List, ListItem, Alert, Chip,
  TextField, Select, MenuItem, IconButton, Button,
} from '@mui/material'
import ExpandMoreIcon        from '@mui/icons-material/ExpandMore'
import DirectionsCarIcon     from '@mui/icons-material/DirectionsCar'
import FlightIcon            from '@mui/icons-material/Flight'
import HotelIcon             from '@mui/icons-material/Hotel'
import TrainIcon             from '@mui/icons-material/Train'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import WhatshotIcon          from '@mui/icons-material/Whatshot'
import TipsAndUpdatesIcon    from '@mui/icons-material/TipsAndUpdates'
import OpenInNewIcon         from '@mui/icons-material/OpenInNew'
import DeleteIcon            from '@mui/icons-material/Delete'
import AddIcon               from '@mui/icons-material/Add'
import AttachFileIcon        from '@mui/icons-material/AttachFile'
import AutoAwesomeIcon       from '@mui/icons-material/AutoAwesome'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { parseText } from '../utils/parseText'
import DayFiles from './DayFiles'
import DayNotes from './DayNotes'
import DayCardDiff from './DayCardDiff'
import { useT } from '../i18n'


const logisticIcons = {
  drive:  <DirectionsCarIcon fontSize="small" />,
  flight: <FlightIcon fontSize="small" />,
  stay:   <HotelIcon fontSize="small" />,
  train:  <TrainIcon fontSize="small" />,
}

export default function DayCard({
  day, partColor, editMode, onDayChange, tripId, gatewayTripId, user, isAdmin,
  pendingDayDiff, canEdit, onAcceptDayDiff, onRejectDayDiff,
}) {
  const t = useT()
  const [files, setFiles] = useState([])
  const [expanded, setExpanded] = useState(editMode)
  const hasDiff = !!pendingDayDiff

  // Force the card open while it carries a pending AI change so the inline
  // diff is visible without the user hunting for it.
  useEffect(() => {
    if (hasDiff) setExpanded(true)
  }, [hasDiff])

  // Keep edit-mode expansion behaviour in sync.
  useEffect(() => {
    if (editMode) setExpanded(true)
  }, [editMode])

  useEffect(() => {
    if (!tripId || !gatewayTripId) return
    const q = query(
      collection(db, 'trips', gatewayTripId, 'files'),
      where('tripId', '==', tripId),
    )
    return onSnapshot(q, snap => {
      const dayFiles = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.dayNumber === day.dayNumber)
      dayFiles.sort((a, b) => (b.uploadedAt?.toMillis() ?? 0) - (a.uploadedAt?.toMillis() ?? 0))
      setFiles(dayFiles)
    })
  }, [tripId, gatewayTripId, day.dayNumber])

  function update(field, value) {
    onDayChange({ ...day, [field]: value })
  }

  function toArr(val) {
    if (Array.isArray(val)) return val
    return val != null ? [val] : []
  }

  function updateArrayItem(field, index, value) {
    const arr = [...toArr(day[field])]
    arr[index] = value
    update(field, arr)
  }

  function removeArrayItem(field, index) {
    update(field, toArr(day[field]).filter((_, i) => i !== index))
  }

  function addArrayItem(field, value) {
    update(field, [...toArr(day[field]), value])
  }

  function updateLogistic(index, key, value) {
    const arr = [...(day.logistics ?? [])]
    arr[index] = { ...arr[index], [key]: value }
    update('logistics', arr)
  }

  function updateLink(index, key, value) {
    const arr = [...(day.links ?? [])]
    arr[index] = { ...arr[index], [key]: value }
    update('links', arr)
  }

  const inputSx = { '& .MuiInput-root': { fontSize: 'inherit' } }

  return (
    <Accordion
      disableGutters
      elevation={1}
      expanded={expanded}
      onChange={(_e, isExpanded) => setExpanded(isExpanded)}
      TransitionProps={{ unmountOnExit: true }}
      sx={{
        mb: 1.5,
        borderLeft: `4px solid ${hasDiff ? '#7B1FA2' : partColor}`,
        borderRadius: '0 8px 8px 0 !important',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': { boxShadow: 3 },
        outline: hasDiff
          ? '1px solid rgba(123,31,162,0.4)'
          : editMode ? `1px dashed ${partColor}44` : 'none',
        boxShadow: hasDiff ? '0 0 0 3px rgba(123,31,162,0.10)' : undefined,
      }}
    >
      {/* ── Summary ── */}
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ py: 1, minHeight: 64 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', pr: 1 }}>
          <Box sx={{
            width: 44, height: 44, borderRadius: '50%', bgcolor: partColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 15, flexShrink: 0,
          }}>
            {day.dayNumber}
          </Box>

          {editMode ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField size="small" variant="standard" label={t('dateField')} value={day.date ?? ''}
                  onChange={e => update('date', e.target.value)} sx={{ width: 140, ...inputSx }} />
                <TextField size="small" variant="standard" label={t('locationField')} value={day.location ?? ''}
                  onChange={e => update('location', e.target.value)} sx={{ flex: 1, ...inputSx }}
                  inputProps={{ style: { fontWeight: 700 } }} />
              </Box>
              <TextField size="small" variant="standard" label={t('subtitleField')} value={day.subtitle ?? ''}
                onChange={e => update('subtitle', e.target.value)} sx={inputSx} />
            </Box>
          ) : (
            <>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>{day.date}</Typography>
                <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>{day.location}</Typography>
                <Typography variant="body2" color="text.secondary" lineHeight={1.3}>{day.subtitle}</Typography>
              </Box>
              {hasDiff && (
                <Chip
                  data-testid="day-proposed-badge"
                  icon={<AutoAwesomeIcon sx={{ fontSize: '13px !important' }} />}
                  label={t('agentInlineBadge')}
                  size="small"
                  sx={{
                    ml: 'auto', height: 22, fontSize: '0.72rem', flexShrink: 0, fontWeight: 700,
                    bgcolor: 'rgba(123,31,162,0.12)', color: '#6A1B9A',
                    border: '1px solid rgba(123,31,162,0.35)',
                    '& .MuiChip-icon': { color: '#7B1FA2' },
                  }}
                />
              )}
              {tripId && user && files.length > 0 && (
                <Chip
                  data-testid="file-count-badge"
                  icon={<AttachFileIcon sx={{ fontSize: '13px !important' }} />}
                  label={files.length}
                  size="small"
                  variant="outlined"
                  sx={{ ml: hasDiff ? 0.75 : 'auto', height: 22, fontSize: '0.72rem', flexShrink: 0 }}
                />
              )}
            </>
          )}
        </Box>
      </AccordionSummary>

      {/* ── Details ── */}
      <AccordionDetails sx={{ pt: 0, pb: 2.5, px: 2.5 }}>

        {/* Pending AI change (inline review) */}
        {hasDiff && (
          <Box sx={{ pt: 2 }}>
            <DayCardDiff
              dayDiff={pendingDayDiff}
              onAccept={canEdit ? onAcceptDayDiff : undefined}
              onReject={onRejectDayDiff}
            />
          </Box>
        )}

        {/* Images */}
        {editMode ? (
          (day.images?.length > 0 || true) && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.75 }}>{t('imagesSection')}</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {(day.images ?? []).map((img, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <TextField size="small" variant="outlined" fullWidth label={t('urlField')} value={img.url ?? ''}
                        onChange={e => { const arr = [...(day.images ?? [])]; arr[i] = { ...arr[i], url: e.target.value }; update('images', arr) }}
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', fontFamily: 'monospace' } }} />
                      <TextField size="small" variant="outlined" fullWidth label={t('captionField')} value={img.caption ?? ''}
                        onChange={e => { const arr = [...(day.images ?? [])]; arr[i] = { ...arr[i], caption: e.target.value }; update('images', arr) }} />
                    </Box>
                    {img.url && (
                      <Box component="img" src={img.url} alt={img.caption}
                        sx={{ width: 72, height: 52, objectFit: 'cover', borderRadius: 1, flexShrink: 0, mt: 0.25, border: '1px solid #e0e0e0' }}
                        onError={e => { e.target.style.display = 'none' }} />
                    )}
                    <IconButton size="small" sx={{ mt: 0.25 }} onClick={() => removeArrayItem('images', i)}>
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<AddIcon />}
                  onClick={() => addArrayItem('images', { url: '', caption: '' })}
                  sx={{ alignSelf: 'flex-start' }}>
                  {t('addImage')}
                </Button>
              </Box>
            </Box>
          )
        ) : (
          day.images?.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', mb: 2, mx: -2.5, px: 2.5, pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
              {day.images.map((img, i) => (
                <Box key={i} sx={{ position: 'relative', flexShrink: 0, width: day.images.length === 1 ? '100%' : 260, height: 190, borderRadius: 2, overflow: 'hidden', '&:hover .caption': { opacity: 1 } }}>
                  <Box component="img"
                    src={img.url}
                    alt={img.caption || day.location}
                    loading="lazy"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {img.caption && (
                    <Box className="caption" sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '0.75rem', px: 1.5, py: 0.75, opacity: 0, transition: 'opacity 0.2s' }}>
                      {img.caption}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )
        )}

        {/* Logistics */}
        {(editMode || day.logistics?.length > 0) && (
          <Box sx={{ bgcolor: '#f5f5f5', borderRadius: 1, p: 1.5, mb: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {(day.logistics ?? []).map((l, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {editMode ? (
                  <>
                    <Select size="small" variant="standard" value={l.type ?? 'drive'}
                      onChange={e => updateLogistic(i, 'type', e.target.value)}
                      sx={{ minWidth: 80, color: partColor }}>
                      {Object.keys(logisticIcons).map(t2 => (
                        <MenuItem key={t2} value={t2}>{t2}</MenuItem>
                      ))}
                    </Select>
                    <TextField size="small" variant="standard" value={l.label ?? ''}
                      onChange={e => updateLogistic(i, 'label', e.target.value)}
                      placeholder={t('labelField')} sx={{ width: 90 }} />
                    <TextField size="small" variant="standard" value={l.value ?? ''}
                      onChange={e => updateLogistic(i, 'value', e.target.value)}
                      placeholder={t('valueField')} sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={() => removeArrayItem('logistics', i)}>
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <Box sx={{ color: partColor, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {logisticIcons[l.type]}
                    </Box>
                    <Typography variant="body2"><strong>{l.label}:</strong> {l.value}</Typography>
                  </>
                )}
              </Box>
            ))}
            {editMode && (
              <Button size="small" startIcon={<AddIcon />}
                onClick={() => addArrayItem('logistics', { type: 'drive', label: '', value: '' })}
                sx={{ alignSelf: 'flex-start', mt: 0.5 }}>
                {t('addLogistics')}
              </Button>
            )}
          </Box>
        )}

        {/* Activities */}
        {(editMode || day.activities?.length > 0) && (
          <Box sx={{ mb: 1 }}>
            {editMode && <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{t('activitiesSection')}</Typography>}
            <List dense disablePadding>
              {(day.activities ?? []).map((activity, i) => (
                <ListItem key={i} sx={{ px: 0, py: 0.5, alignItems: 'flex-start' }}>
                  <FiberManualRecordIcon sx={{ fontSize: 8, color: partColor, mt: '6px', mr: 1.5, flexShrink: 0 }} />
                  {editMode ? (
                    <Box sx={{ display: 'flex', flex: 1, gap: 0.5 }}>
                      <TextField size="small" variant="standard" fullWidth value={activity}
                        onChange={e => updateArrayItem('activities', i, e.target.value)}
                        multiline sx={inputSx} />
                      <IconButton size="small" onClick={() => removeArrayItem('activities', i)}>
                        <DeleteIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Typography variant="body2" lineHeight={1.5}>{parseText(activity)}</Typography>
                  )}
                </ListItem>
              ))}
            </List>
            {editMode && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => addArrayItem('activities', '')} sx={{ ml: 2.5 }}>
                {t('addActivity')}
              </Button>
            )}
          </Box>
        )}

        {/* Optional Alternative */}
        {(editMode || day.optional_alternative) && (
          <Box sx={{ mb: 2 }}>
            {editMode
              ? <>
                  <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{t('dayAlternative')}</Typography>
                  <TextField size="small" variant="outlined" fullWidth multiline
                    value={day.optional_alternative ?? ''}
                    onChange={e => update('optional_alternative', e.target.value)}
                    sx={{ bgcolor: '#F3E5F5' }} />
                </>
              : <Box sx={{ bgcolor: '#F3E5F5', borderRadius: 1.5, p: 1.5, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                  <TipsAndUpdatesIcon sx={{ fontSize: 18, color: '#7B1FA2', mt: '2px', flexShrink: 0 }} />
                  <Box>
                    <Typography variant="caption" fontWeight={700} sx={{ color: '#7B1FA2', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}>
                      {t('dayAlternative')}
                    </Typography>
                    <Typography variant="body2" lineHeight={1.55} sx={{ color: '#4A148C' }}>
                      {parseText(day.optional_alternative)}
                    </Typography>
                  </Box>
                </Box>
            }
          </Box>
        )}

        {/* Optional High Intensity */}
        {(editMode || day.optional_high_intensity != null) && (
          <Box sx={{ mb: 1 }}>
            {editMode && <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{t('optionalHighIntensity')}</Typography>}
            <List dense disablePadding>
              {(Array.isArray(day.optional_high_intensity)
                ? day.optional_high_intensity
                : day.optional_high_intensity ? [day.optional_high_intensity] : []
              ).map((activity, i) => (
                <ListItem key={i} sx={{ px: 0, py: 0.5, alignItems: 'flex-start' }}>
                  <WhatshotIcon sx={{ fontSize: 14, color: '#e65100', mt: '4px', mr: 1.5, flexShrink: 0 }} />
                  {editMode ? (
                    <Box sx={{ display: 'flex', flex: 1, gap: 0.5 }}>
                      <TextField size="small" variant="standard" fullWidth value={activity}
                        onChange={e => updateArrayItem('optional_high_intensity', i, e.target.value)}
                        multiline sx={inputSx} />
                      <IconButton size="small" onClick={() => removeArrayItem('optional_high_intensity', i)}>
                        <DeleteIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Typography variant="body2" lineHeight={1.5} sx={{ color: '#bf360c' }}>
                      {parseText(activity)}
                    </Typography>
                  )}
                </ListItem>
              ))}
            </List>
            {editMode && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => addArrayItem('optional_high_intensity', '')} sx={{ ml: 2.5 }}>
                {t('addOptionalHigh')}
              </Button>
            )}
          </Box>
        )}

        {/* Warnings */}
        {(editMode || day.warnings?.length > 0) && (
          <Box sx={{ mb: 1 }}>
            {editMode && <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{t('warningsSection')}</Typography>}
            {(day.warnings ?? []).map((w, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.5 }}>
                {editMode ? (
                  <>
                    <TextField size="small" variant="outlined" fullWidth value={w}
                      onChange={e => updateArrayItem('warnings', i, e.target.value)}
                      multiline sx={{ bgcolor: '#fff3e0' }} />
                    <IconButton size="small" onClick={() => removeArrayItem('warnings', i)}>
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </>
                ) : (
                  <Alert severity="warning" sx={{ flex: 1, fontSize: '0.83rem' }}>{parseText(w)}</Alert>
                )}
              </Box>
            ))}
            {editMode && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => addArrayItem('warnings', '')}>
                {t('addWarning')}
              </Button>
            )}
          </Box>
        )}

        {/* Tips */}
        {(editMode || day.tips?.length > 0) && (
          <Box sx={{ mb: 1 }}>
            {editMode && <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{t('tipsSection')}</Typography>}
            {(day.tips ?? []).map((tip, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 0.75 }}>
                {editMode ? (
                  <>
                    <TextField size="small" variant="outlined" fullWidth value={tip}
                      onChange={e => updateArrayItem('tips', i, e.target.value)}
                      multiline sx={{ bgcolor: '#EEF4FB' }} />
                    <IconButton size="small" onClick={() => removeArrayItem('tips', i)}>
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </>
                ) : (
                  <Alert severity="info" icon={false} sx={{ flex: 1, fontSize: '0.83rem', py: 0.5, bgcolor: '#EEF4FB', color: '#1a3a5c', borderLeft: '3px solid #90CAF9', borderRadius: 1 }}>
                    {parseText(tip)}
                  </Alert>
                )}
              </Box>
            ))}
            {editMode && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => addArrayItem('tips', '')}>
                {t('addTip')}
              </Button>
            )}
          </Box>
        )}

        {/* Links */}
        {(editMode || day.links?.length > 0) && (
          <Box sx={{ mt: 1.5 }}>
            {editMode ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Typography variant="overline" color="text.secondary">{t('linksSection')}</Typography>
                {(day.links ?? []).map((link, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField size="small" variant="standard" label={t('labelField')} value={link.label ?? ''}
                      onChange={e => updateLink(i, 'label', e.target.value)} sx={{ width: 140 }} />
                    <TextField size="small" variant="standard" label={t('urlField')} value={link.url ?? ''}
                      onChange={e => updateLink(i, 'url', e.target.value)} sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={() => removeArrayItem('links', i)}>
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => addArrayItem('links', { label: '', url: '' })}>
                  {t('addLink')}
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {day.links.map((link, i) => (
                  <Chip key={i} label={link.label} icon={<OpenInNewIcon />}
                    component="a" href={link.url} target="_blank" rel="noopener noreferrer"
                    clickable size="small" variant="outlined"
                    sx={{ borderColor: partColor, color: partColor, '& .MuiChip-icon': { color: partColor } }}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Files */}
        {tripId && user && (
          <DayFiles
            tripId={tripId}
            gatewayTripId={gatewayTripId ?? tripId}
            dayNumber={day.dayNumber}
            user={user}
            isAdmin={isAdmin}
            files={files}
          />
        )}

        {/* Notes */}
        {tripId && user && (
          <DayNotes
            tripId={tripId}
            gatewayTripId={gatewayTripId ?? tripId}
            dayNumber={day.dayNumber}
            user={user}
            isAdmin={isAdmin}
          />
        )}

      </AccordionDetails>
    </Accordion>
  )
}
