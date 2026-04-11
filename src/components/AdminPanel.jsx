import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, List, ListItem, ListItemText,
  ListItemSecondaryAction, IconButton, Typography,
  Box, CircularProgress, Divider, Chip,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import { collection, getDocs, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const TRIP_ID = import.meta.env.VITE_TRIP_ID

export default function AdminPanel({ open, onClose, currentUserEmail }) {
  const [users, setUsers]       = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const loadUsers = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'trips', TRIP_ID, 'allowed_users'))
    setUsers(snap.docs.map(d => d.data()))
    setLoading(false)
  }

  useEffect(() => { if (open) loadUsers() }, [open])

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setError('Email inválido'); return }
    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, 'trips', TRIP_ID, 'allowed_users', email), {
        email,
        addedAt: serverTimestamp(),
        addedBy: currentUserEmail,
      })
      setNewEmail('')
      await loadUsers()
    } catch {
      setError('Error al agregar. Intenta de nuevo.')
    }
    setSaving(false)
  }

  const handleRemove = async (email) => {
    if (email === currentUserEmail) return // no puede eliminarse a sí mismo
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'allowed_users', email))
    await loadUsers()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Gestionar accesos
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
          Solo los emails invitados pueden ver el itinerario.
        </Typography>
      </DialogTitle>

      <DialogContent>
        {/* Agregar nuevo usuario */}
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            label="Email a invitar"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            error={!!error}
            helperText={error}
            placeholder="ejemplo@gmail.com"
          />
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
            onClick={handleAdd}
            disabled={saving || !newEmail}
            sx={{ flexShrink: 0 }}
          >
            Invitar
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Lista de usuarios */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          USUARIOS CON ACCESO ({users.length})
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List dense disablePadding>
            {users.map(u => (
              <ListItem key={u.email} disablePadding sx={{ py: 0.5 }}>
                <ListItemText
                  primary={u.email}
                  secondary={u.addedBy ? `Agregado por ${u.addedBy}` : null}
                />
                {u.email === currentUserEmail ? (
                  <Chip label="Tú" size="small" sx={{ mr: 1 }} />
                ) : (
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleRemove(u.email)}
                      title="Revocar acceso"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  )
}
