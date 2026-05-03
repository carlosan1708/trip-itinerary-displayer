import { useEffect, useMemo, useState } from 'react'
import {
  Box, Chip, Drawer, IconButton, Stack, Tooltip, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import DownloadIcon from '@mui/icons-material/Download'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useT } from '../i18n'

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AllFilesPanel({ open, onClose, tripId, gatewayTripId, itinerary }) {
  const t = useT()
  const [files, setFiles] = useState([])

  useEffect(() => {
    if (!open || !tripId || !gatewayTripId) return
    const q = query(
      collection(db, 'trips', gatewayTripId, 'files'),
      where('tripId', '==', tripId),
    )
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.uploadedAt?.toMillis() ?? 0) - (a.uploadedAt?.toMillis() ?? 0))
      setFiles(docs)
    })
  }, [open, tripId, gatewayTripId])

  const dayMap = useMemo(() => {
    const map = new Map()
    for (const file of files) {
      const k = file.dayNumber
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(file)
    }
    return map
  }, [files])

  const dayInfo = useMemo(() => {
    const info = {}
    for (const part of (itinerary?.parts ?? [])) {
      for (const day of (part.days ?? [])) {
        info[day.dayNumber] = { location: day.location, date: day.date }
      }
    }
    return info
  }, [itinerary])

  async function downloadFile(file) {
    const url = file.storageUrl || file.dataUrl
    if (!url) return
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = file.name || 'file'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank')
    }
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 400 } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid #e0e0e0' }}>
        <Typography variant="h6" fontWeight={700}>{t('allFilesTitle')}</Typography>
        <IconButton onClick={onClose} size="small" data-testid="close-all-files"><CloseIcon /></IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5 }}>
        {files.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic', mt: 2 }}>
            {t('allFilesEmpty')}
          </Typography>
        ) : (
          Array.from(dayMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([dayNum, dayFiles]) => {
              const info = dayInfo[dayNum]
              return (
                <Box key={dayNum} sx={{ mb: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.75 }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('dayLabel', { id: dayNum })}
                    </Typography>
                    {info && (
                      <Typography variant="caption" color="text.secondary">
                        {info.location}{info.date ? ` · ${info.date}` : ''}
                      </Typography>
                    )}
                  </Box>
                  <Stack spacing={0.75}>
                    {dayFiles.map(file => (
                      <Box
                        key={file.id}
                        data-testid="all-files-row"
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #e6ebf0', borderRadius: 2, px: 1.25, py: 0.75, bgcolor: '#fafbfd' }}
                      >
                        <InsertDriveFileIcon sx={{ color: '#5f6b7a', fontSize: 20, flexShrink: 0 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>{file.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{formatBytes(file.size)}</Typography>
                          {file.tags?.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                              {file.tags.map(tag => (
                                <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                              ))}
                            </Box>
                          )}
                        </Box>
                        <Tooltip title={t('downloadTooltip')}>
                          <IconButton size="small" onClick={() => downloadFile(file)}>
                            <DownloadIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )
            })
        )}
      </Box>
    </Drawer>
  )
}
