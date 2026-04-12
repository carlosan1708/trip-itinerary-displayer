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

export default function VersionHistoryModal({ open, onClose, tripId, currentVersion, onRestore }) {
  const [versions,   setVersions]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [confirming, setConfirming] = useState(null)   // snapshot id pending confirmation
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
    return d.toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })
  }

  const sourceLabel = s => s === 'restore' ? 'Restauración' : 'Subida local'
  const sourceColor = s => s === 'restore' ? 'warning'      : 'info'

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <HistoryIcon fontSize="small" /> Historial de versiones
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress size={32} />
          </Box>
        ) : versions.length === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography color="text.secondary" variant="body2">
              No hay versiones guardadas aún.
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
                    {/* badges row */}
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
                        <Chip label="Activa" size="small" color="success" sx={{ ml: 'auto' }} />
                      )}
                    </Box>

                    {/* metadata */}
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(v.savedAt)} · {v.savedBy}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {v.data?.title} — {v.data?.subtitle}
                      </Typography>
                    </Box>

                    {/* restore controls */}
                    {!isCurrent && (
                      isConfirming ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" color="warning.main">
                            ¿Restaurar esta versión?
                          </Typography>
                          <Button
                            size="small" variant="contained" color="warning"
                            disabled={restoring}
                            onClick={() => handleRestore(v)}
                          >
                            {restoring ? 'Restaurando…' : 'Confirmar'}
                          </Button>
                          <Button size="small" onClick={() => setConfirming(null)} disabled={restoring}>
                            Cancelar
                          </Button>
                        </Box>
                      ) : (
                        <Button
                          size="small"
                          startIcon={<RestoreIcon fontSize="small" />}
                          onClick={() => setConfirming(v.id)}
                        >
                          Restaurar
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
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  )
}
