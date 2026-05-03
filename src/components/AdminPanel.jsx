import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, List, ListItem, ListItemText,
  IconButton, Typography, Box, CircularProgress, Divider, Chip,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material'
import DeleteIcon    from '@mui/icons-material/Delete'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import TranslateIcon from '@mui/icons-material/Translate'
import { collection, getDocs, getDoc, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useT, useChangeLang } from '../i18n'

const TRIP_ID = import.meta.env.VITE_TRIP_ID

export default function AdminPanel({ open, onClose, currentUserEmail }) {
  const t          = useT()
  const changeLang = useChangeLang()

  const [users, setUsers]           = useState([])
  const [newEmail, setNewEmail]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [defaultLang, setDefaultLang] = useState('en')

  const loadUsers = async () => {
    setLoading(true)
    const snap = await getDocs(collection(db, 'trips', TRIP_ID, 'allowed_users'))
    setUsers(snap.docs.map(d => d.data()))
    setLoading(false)
  }

  useEffect(() => {
    if (!open) return
    loadUsers()
    getDoc(doc(db, 'app-settings', 'config')).then(snap => {
      if (snap.exists()) {
        const lang = snap.data().defaultLanguage
        if (lang === 'en' || lang === 'es') setDefaultLang(lang)
      }
    })
  }, [open])

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setError(t('invalidEmail')); return }
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
      setError(t('addUserError'))
    }
    setSaving(false)
  }

  const handleRemove = async (email) => {
    if (email === currentUserEmail) return
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'allowed_users', email))
    await loadUsers()
  }

  const handleSetDefault = async (_, lang) => {
    if (!lang) return
    setDefaultLang(lang)
    changeLang(lang)
    await setDoc(doc(db, 'app-settings', 'config'), { defaultLanguage: lang }, { merge: true })
  }

  const handleSetUserLang = async (email, lang) => {
    await setDoc(doc(db, 'trips', TRIP_ID, 'allowed_users', email), { language: lang }, { merge: true })
    setUsers(prev => prev.map(u => u.email === email ? { ...u, language: lang } : u))
    if (email === currentUserEmail) changeLang(lang)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {t('manageAccessTitle')}
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
          {t('inviteOnlyHelp')}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {/* App default language */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <TranslateIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('appDefaultLanguage')}
            </Typography>
          </Box>
          <ToggleButtonGroup value={defaultLang} exclusive onChange={handleSetDefault} size="small">
            <ToggleButton value="en">{t('languageEnglish')}</ToggleButton>
            <ToggleButton value="es">{t('languageSpanish')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Add new user */}
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <TextField
            fullWidth size="small"
            label={t('emailToInvite')}
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            error={!!error}
            helperText={error}
            placeholder={t('exampleEmail')}
          />
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
            onClick={handleAdd}
            disabled={saving || !newEmail}
            sx={{ flexShrink: 0 }}
          >
            {t('inviteBtn')}
          </Button>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* User list */}
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {t('usersWithAccess', { count: users.length })}
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <List dense disablePadding>
            {users.map(u => (
              <ListItem key={u.email} disablePadding sx={{ py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ListItemText
                  primary={u.email}
                  secondary={u.addedBy ? t('addedBy', { email: u.addedBy }) : null}
                  sx={{ flex: 1, mr: 0.5 }}
                />
                {/* Per-user language toggle */}
                <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', flexShrink: 0 }}>
                  {['en', 'es'].map(l => (
                    <Button key={l} size="small" onClick={() => handleSetUserLang(u.email, l)}
                      title={t('userAssignedLang')}
                      sx={{
                        minWidth: 0, px: 1, py: 0.25, borderRadius: 0,
                        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                        color: u.language === l ? 'primary.main' : 'text.disabled',
                        bgcolor: u.language === l ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}>
                      {l}
                    </Button>
                  ))}
                </Box>
                {u.email === currentUserEmail ? (
                  <Chip label={t('youChip')} size="small" />
                ) : (
                  <IconButton size="small" onClick={() => handleRemove(u.email)} title={t('revokeAccess')}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
