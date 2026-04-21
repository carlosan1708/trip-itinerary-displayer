import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, Chip, CircularProgress,
  List, ListItem, Divider,
} from '@mui/material'
import HistoryIcon  from '@mui/icons-material/History'
import RestoreIcon  from '@mui/icons-material/Restore'
import { useT, useLang } from '../i18n'

export default function VersionHistoryModal({ open, onClose, tripId, currentVersion, onRestore }) {
  const t    = useT()
  const lang = useLang()
  const [versions,   setVersions]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [restoring,  setRestoring]  = useState(false)

  useEffect(() => {
    if (!open || !tripId) return
    setVersions([])
    async function load() {
      setLoading(true)
      try {
        const snap = await getDocs(
          query(collection(db, 'trips', tripId, 'versions'), orderBy('savedAt', 'desc'))
        )
        setVersions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, tripId])

  async function handleRestore(snapshot) {
    setRestoring(true)
    try {
      await onRestore(snapshot.data)
      setConfirming(null)
      onClose()
    } finally {
      setRestoring(false)
    }
  }

  function formatDate(ts) {
    if (!ts) return '—'
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    const locale = lang === 'es' ? 'es-CR' : 'en-US'
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  }

  const sourceLabel = s => ({
    restore:     t('sourceRestore'),
    author_edit: t('sourceEdit'),
    local_push:  t('sourceLocalPush'),
  })[s] ?? t('sourceSaved')

  const sourceColor = s => ({ restore: 'warning', author_edit: 'success', local_push: 'info' })[s] ?? 'default'

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <HistoryIcon fontSize="small" /> {t('versionHistoryTitle')}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={32} />
          </Box>
        ) : versions.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography color="text.secondary" variant="body2">
              {t('noVersionsMsg')}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {versions.map((v, i) => {
              const isCurrent    = v.version === currentVersion
              const isConfirming = confirming === v.id
              return (
                <Box key={v.id}>
                  {i > 0 && <Divider />}
                  <ListItem sx={{
                    py: 2, px: 3,
                    flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                    bgcolor: isCurrent ? 'action.selected' : 'transparent',
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', flexWrap: 'wrap' }}>
                      <Chip
                        label={`v${v.version}`}
                        size="small"
                        color={isCurrent ? 'success' : 'default'}
                        variant={isCurrent ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 700 }}
                      />
                      <Chip
                        label={sourceLabel(v.source)}
                        size="small"
                        color={sourceColor(v.source)}
                        variant="outlined"
                      />
                      {isCurrent && (
                        <Chip label={t('activeChip')} size="small" color="success" sx={{ ml: 'auto' }} />
                      )}
                    </Box>

                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(v.savedAt)} · {v.savedBy}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {v.data?.title} — {v.data?.subtitle}
                      </Typography>
                    </Box>

                    {!isCurrent && (
                      isConfirming ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" color="warning.main">
                            {t('confirmRestoreMsg')}
                          </Typography>
                          <Button
                            size="small" variant="contained" color="warning"
                            disabled={restoring}
                            onClick={() => handleRestore(v)}
                          >
                            {restoring ? t('restoringBtn') : t('confirmBtn')}
                          </Button>
                          <Button size="small" onClick={() => setConfirming(null)} disabled={restoring}>
                            {t('cancel')}
                          </Button>
                        </Box>
                      ) : (
                        <Button
                          size="small"
                          startIcon={<RestoreIcon fontSize="small" />}
                          onClick={() => setConfirming(v.id)}
                        >
                          {t('restoreBtn')}
                        </Button>
                      )
                    )}
                  </ListItem>
                </Box>
              )
            })}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
