import { useState, useRef, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const GATEWAY_TRIP_ID = import.meta.env.VITE_TRIP_ID
import {
  Box, Typography, TextField, Collapse, Chip,
  Button, Tooltip, InputAdornment, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  Alert, CircularProgress, Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material'
import SearchIcon        from '@mui/icons-material/Search'
import ExpandMoreIcon    from '@mui/icons-material/ExpandMore'
import ExpandLessIcon    from '@mui/icons-material/ExpandLess'
import FolderIcon        from '@mui/icons-material/Folder'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import LogoutIcon        from '@mui/icons-material/Logout'
import PeopleIcon        from '@mui/icons-material/People'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import StarIcon          from '@mui/icons-material/Star'
import StarBorderIcon    from '@mui/icons-material/StarBorder'
import EditIcon          from '@mui/icons-material/Edit'
import DownloadIcon      from '@mui/icons-material/Download'
import UploadFileIcon    from '@mui/icons-material/UploadFile'
import DeleteIcon        from '@mui/icons-material/Delete'
import AddIcon              from '@mui/icons-material/Add'
import CreateNewFolderIcon  from '@mui/icons-material/CreateNewFolder'
import AutoAwesomeIcon      from '@mui/icons-material/AutoAwesome'
import ContentCopyIcon      from '@mui/icons-material/ContentCopy'
import CheckIcon            from '@mui/icons-material/Check'
import VisibilityOffIcon    from '@mui/icons-material/VisibilityOff'
import VisibilityIcon       from '@mui/icons-material/Visibility'
import PersonIcon           from '@mui/icons-material/Person'
import MoreVertIcon         from '@mui/icons-material/MoreVert'

import AdminPanel       from './AdminPanel'
import TripEditorModal  from './TripEditorModal'
import {
  getRegistry, saveRegistry,
  getFavorites, saveFavorites,
  getTripData, saveTripData, deleteTripData,
  slugify,
} from '../utils/registry'
import { useT, useLang, useChangeLang } from '../i18n'

const TRIP_COLORS = ['#2E7D32', '#0277BD', '#AD1457', '#F57C00', '#7B1FA2', '#00838F']

export default function Dashboard({ user, isAdmin, onSelectTrip }) {
  const t          = useT()
  const lang       = useLang()
  const changeLang = useChangeLang()
  const [registry, setRegistry]     = useState(() => getRegistry())
  const [favorites, setFavorites]   = useState(() => getFavorites())
  const [search, setSearch]         = useState('')
  const [showFavsOnly, setShowFavsOnly] = useState(false)
  const [expanded, setExpanded]     = useState(() =>
    Object.fromEntries(getRegistry().map(f => [f.id, true]))
  )
  const [adminOpen, setAdminOpen]   = useState(false)
  const [registryLoading, setRegistryLoading] = useState(() => !localStorage.getItem('trips-registry'))

  const [editingTrip, setEditingTrip] = useState(null)

  const [addTripFolder, setAddTripFolder] = useState(null)
  const [addTripName, setAddTripName]     = useState('')
  const [addTripError, setAddTripError]   = useState('')
  const [pasteJson, setPasteJson]         = useState('')
  const [pasteError, setPasteError]       = useState('')
  const uploadNewRef  = useRef()
  const uploadNewData = useRef(null)

  const [addFolderOpen, setAddFolderOpen] = useState(false)

  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [copied, setCopied]             = useState(false)
  const [newFolderEmoji, setNewFolderEmoji] = useState('🌍')
  const [newFolderName, setNewFolderName]   = useState('')

  const uploadReplaceRef  = useRef()
  const uploadReplaceTrip = useRef(null)
  const promptRef         = useRef()

  const [copyDialog, setCopyDialog] = useState(null)
  const [copyName, setCopyName]     = useState('')
  const [copyFolder, setCopyFolder] = useState('')
  const [copying, setCopying]       = useState(false)

  const [mobileMenu, setMobileMenu] = useState(null)

  // ── Registry cloud sync ───────────────────────────────────────────
  useEffect(() => {
    async function syncRegistryFromCloud() {
      try {
        const snap = await getDoc(doc(db, 'trips', GATEWAY_TRIP_ID, 'registry', 'main'))
        if (!snap.exists()) return
        const remote = snap.data().folders
        if (!Array.isArray(remote)) return
        saveRegistry(remote)
        setRegistry(remote)
        setExpanded(prev => {
          const next = { ...prev }
          remote.forEach(f => { if (!(f.id in next)) next[f.id] = true })
          return next
        })
      } catch (err) {
        console.warn('[sync] Could not load registry from Firestore:', err.message)
      }
    }
    syncRegistryFromCloud().finally(() => setRegistryLoading(false))
  }, [])

  function updateRegistry(next) {
    saveRegistry(next)
    setRegistry(next)
    setDoc(doc(db, 'trips', GATEWAY_TRIP_ID, 'registry', 'main'), { folders: next })
      .catch(err => console.warn('[sync] Could not save registry to Firestore:', err.message))
  }

  function toggleFavorite(tripId, e) {
    e.stopPropagation()
    const next = favorites.includes(tripId)
      ? favorites.filter(id => id !== tripId)
      : [...favorites, tripId]
    saveFavorites(next)
    setFavorites(next)
  }

  function downloadTrip(trip, e) {
    e.stopPropagation()
    const stored = getTripData(trip.id)
    const content = stored
      ? JSON.stringify(stored, null, 2)
      : JSON.stringify({ id: trip.id, title: trip.label }, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${trip.id}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  function openReplaceUpload(trip, e) {
    e.stopPropagation()
    uploadReplaceTrip.current = trip
    uploadReplaceRef.current.click()
  }

  function handleReplaceFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        saveTripData(uploadReplaceTrip.current.id, data)
      } catch { /* ignore bad JSON on quick upload */ }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function openEdit(folderId, trip, e) {
    e.stopPropagation()
    let data = getTripData(trip.id)
    if (!data) {
      try {
        const snap = await getDoc(doc(db, 'trips', trip.id, 'data', 'itinerary'))
        if (snap.exists()) data = snap.data()
      } catch {}
    }
    setEditingTrip({ folderId, trip, initialJson: data })
  }

  function handleSaveEdit(folderId, tripId, meta, jsonData) {
    const next = registry.map(folder => {
      if (folder.id !== folderId) return folder
      return {
        ...folder,
        trips: folder.trips.map(t2 =>
          t2.id === tripId ? { ...t2, ...meta } : t2
        ),
      }
    })
    updateRegistry(next)
    if (jsonData) {
      const syncedData = meta.label ? { ...jsonData, title: meta.label } : jsonData
      saveTripData(tripId, syncedData)
      setDoc(doc(db, 'trips', tripId, 'data', 'itinerary'), syncedData)
        .catch(err => console.warn('[sync] Could not save to Firestore:', err.message))
    }
  }

  function deleteTrip(folderId, tripId, e) {
    e.stopPropagation()
    if (!window.confirm(t('confirmDeleteTrip'))) return
    const next = registry.map(f => {
      if (f.id !== folderId) return f
      return { ...f, trips: f.trips.filter(tr => tr.id !== tripId) }
    })
    updateRegistry(next)
    deleteTripData(tripId)
  }

  function toggleHideTrip(folderId, tripId, e) {
    e.stopPropagation()
    const next = registry.map(f => {
      if (f.id !== folderId) return f
      return { ...f, trips: f.trips.map(tr => tr.id === tripId ? { ...tr, hidden: !tr.hidden } : tr) }
    })
    updateRegistry(next)
  }

  function deleteFolder(folderId, e) {
    e.stopPropagation()
    if (!window.confirm(t('confirmDeleteFolder'))) return
    const folder = registry.find(f => f.id === folderId)
    folder?.trips.forEach(tr => deleteTripData(tr.id))
    updateRegistry(registry.filter(f => f.id !== folderId))
  }

  function handleAddTripFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        uploadNewData.current = data
        setPasteJson('')
        setPasteError('')
        setAddTripName(data.label || data.title || file.name.replace('.json', ''))
      } catch {
        setAddTripError(t('invalidJsonFile'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handlePasteJsonChange(text2) {
    setPasteJson(text2)
    setPasteError('')
    if (!text2.trim()) { uploadNewData.current = null; return }
    try {
      const data = JSON.parse(text2)
      uploadNewData.current = data
      if (!addTripName) setAddTripName(data.label || data.title || '')
    } catch {
      uploadNewData.current = null
      setPasteError(t('invalidJsonPaste'))
    }
  }

  function confirmAddTrip() {
    if (!addTripName.trim()) { setAddTripError(t('nameEmpty')); return }
    if (pasteJson.trim() && pasteError) { return }
    const id   = `${addTripFolder}-${slugify(addTripName)}-${Date.now()}`
    const data = uploadNewData.current
    const trip = {
      id,
      label:    data?.label?.trim() || addTripName.trim(),
      subtitle: data?.subtitle ?? '',
      dates:    data?.subtitle ?? '',
      duration: data?.stats?.[0] ?? '',
      author:   user.email,
    }
    const next = registry.map(f => {
      if (f.id !== addTripFolder) return f
      return { ...f, trips: [...f.trips, trip] }
    })
    updateRegistry(next)
    if (data) saveTripData(id, data)
    setAddTripFolder(null)
    setAddTripName('')
    setAddTripError('')
    setPasteJson('')
    setPasteError('')
    uploadNewData.current = null
  }

  function openCopyDialog(trip, folderId, e) {
    e.stopPropagation()
    setCopyDialog({ trip, folderId })
    setCopyName(`${t('copyPrefix')} ${trip.label}`)
    setCopyFolder(folderId)
  }

  async function confirmCopy() {
    if (!copyName.trim() || !copyFolder) return
    setCopying(true)
    try {
      let sourceData = getTripData(copyDialog.trip.id)
      if (!sourceData) {
        const snap = await getDoc(doc(db, 'trips', copyDialog.trip.id, 'data', 'itinerary'))
        if (snap.exists()) sourceData = snap.data()
      }
      const newId = `${copyFolder}-${slugify(copyName)}-${Date.now()}`
      const newTrip = {
        id: newId,
        label: copyName.trim(),
        subtitle: sourceData?.subtitle ?? copyDialog.trip.subtitle,
        dates: copyDialog.trip.dates,
        duration: copyDialog.trip.duration,
        author: user.email,
      }
      const next = registry.map(f => {
        if (f.id !== copyFolder) return f
        return { ...f, trips: [...f.trips, newTrip] }
      })
      updateRegistry(next)
      if (sourceData) {
        const newData = { ...sourceData, author: user.email, version: 1 }
        saveTripData(newId, newData)
        setDoc(doc(db, 'trips', newId, 'data', 'itinerary'), newData)
          .catch(err => console.warn('[sync]', err.message))
      }
      setCopyDialog(null)
      setCopyName('')
    } finally {
      setCopying(false)
    }
  }

  function confirmAddFolder() {
    if (!newFolderName.trim()) return
    const id = slugify(newFolderName) || `folder-${Date.now()}`
    const folder = { id, label: newFolderName.trim(), emoji: newFolderEmoji, trips: [] }
    const next = [...registry, folder]
    updateRegistry(next)
    setExpanded(e => ({ ...e, [id]: true }))
    setAddFolderOpen(false)
    setNewFolderName('')
    setNewFolderEmoji('🌍')
  }

  const query2 = search.toLowerCase()
  const filtered = registry
    .map(folder => ({
      ...folder,
      trips: folder.trips.filter(tr => {
        if (!isAdmin && tr.hidden) return false
        if (showFavsOnly && !favorites.includes(tr.id)) return false
        if (!query2) return true
        return (
          tr.label.toLowerCase().includes(query2) ||
          tr.subtitle.toLowerCase().includes(query2) ||
          folder.label.toLowerCase().includes(query2)
        )
      }),
    }))
    .filter(f => f.trips.length > 0 || (!showFavsOnly && !query2))

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f7fa' }}>

      {/* ── Header ── */}
      <Box sx={{
        background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
        color: '#fff', py: { xs: 5, md: 7 }, px: 3,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: 'linear-gradient(90deg, #2E7D32, #AD1457, #0277BD)' }} />

        <Box sx={{ position: 'absolute', top: 12, right: 16, display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Language toggle */}
          <Box data-testid="lang-toggle" sx={{ display: 'flex', alignItems: 'center', borderRadius: 1, border: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            {['en', 'es'].map(l => (
              <Button key={l} size="small" onClick={() => changeLang(l)} aria-pressed={lang === l} sx={{
                minWidth: 0, px: 1.2, py: 0.3, borderRadius: 0,
                fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                color: lang === l ? '#fff' : 'rgba(255,255,255,0.35)',
                bgcolor: lang === l ? 'rgba(255,255,255,0.12)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', color: '#fff' },
              }}>{l}</Button>
            ))}
          </Box>
          {isAdmin && (
            <Tooltip title={t('manageAccess')}>
              <Button size="small" startIcon={<PeopleIcon sx={{ fontSize: 16 }} />}
                onClick={() => setAdminOpen(true)}
                sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', textTransform: 'none', '&:hover': { color: '#fff' } }}>
                {t('access')}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={t('signOutTooltip', { email: user.email })}>
            <Button size="small" startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
              onClick={() => signOut(auth)}
              sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'none', minWidth: 0, '&:hover': { color: '#fff' } }}>
              {t('logout')}
            </Button>
          </Tooltip>
        </Box>

        <Typography variant="h3" component="h1"
          sx={{ fontWeight: 700, letterSpacing: '-0.5px', mb: 1, fontSize: { xs: '2rem', md: '2.8rem' } }}>
          {t('loginTitle')}
        </Typography>
        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 300, letterSpacing: 2, textTransform: 'uppercase', fontSize: { xs: '0.8rem', md: '0.95rem' } }}>
          {t('selectItinerary')}
        </Typography>
      </Box>

      {/* ── AI assistant banner ── */}
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 4, pb: 0 }}>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
            border: '1px solid rgba(183,28,28,0.35)',
            borderRadius: 3, px: { xs: 2, sm: 3 }, py: 2,
            boxShadow: '0 2px 16px rgba(183,28,28,0.18)',
            '@keyframes banner-pulse': {
              '0%':   { borderColor: 'rgba(183,28,28,0.35)' },
              '50%':  { borderColor: 'rgba(183,28,28,0.7)' },
              '100%': { borderColor: 'rgba(183,28,28,0.35)' },
            },
            animation: 'banner-pulse 3s ease-in-out infinite',
          }}
        >
          <Box sx={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #B71C1C, #7B1FA2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AutoAwesomeIcon sx={{ color: '#fff', fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#fff', mb: 0.25 }}>
              {t('aiAssistantTitle')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
              {t('aiAssistantDesc')}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            startIcon={<AutoAwesomeIcon sx={{ fontSize: '16px !important' }} />}
            onClick={() => {
              document.querySelector('[data-testid="agent-fab"]')?.click()
            }}
            sx={{
              flexShrink: 0,
              background: 'linear-gradient(135deg, #B71C1C 0%, #7B1FA2 100%)',
              color: '#fff', fontWeight: 700, fontSize: '0.75rem',
              textTransform: 'none', borderRadius: 2, px: 2,
              boxShadow: '0 2px 10px rgba(183,28,28,0.4)',
              '&:hover': { background: 'linear-gradient(135deg, #c62828 0%, #8e24aa 100%)' },
            }}
          >
            {t('openAssistant')}
          </Button>
        </Box>
      </Box>

      {/* ── Filter bar ── */}
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 4, pb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder={t('searchTrip')} value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment> }}
          sx={{ bgcolor: '#fff', borderRadius: 2, flex: 1, minWidth: 180 }}
        />
        <Chip
          icon={<StarIcon sx={{ fontSize: '16px !important' }} />}
          label={t('favorites')}
          onClick={() => setShowFavsOnly(v => !v)}
          color={showFavsOnly ? 'warning' : 'default'}
          variant={showFavsOnly ? 'filled' : 'outlined'}
          sx={{ bgcolor: showFavsOnly ? undefined : '#fff', cursor: 'pointer' }}
        />
      </Box>

      {/* ── Trip list ── */}
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pb: 4 }}>
        {registryLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress size={32} />
          </Box>
        )}
        {!registryLoading && filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            {t('noTripsFound')}
          </Typography>
        )}

        {!registryLoading && filtered.map(folder => (
          <Box key={folder.id} sx={{ mb: 2, bgcolor: '#fff', borderRadius: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

            {/* Folder row */}
            <Box
              onClick={() => setExpanded(e => ({ ...e, [folder.id]: !e[folder.id] }))}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 2.5, py: 1.75, cursor: 'pointer', userSelect: 'none',
                '&:hover': { bgcolor: '#f0f4f8' },
                '& .folder-actions': { opacity: 0, transition: 'opacity 0.15s' },
                '&:hover .folder-actions': { opacity: 1 },
              }}
            >
              <FolderIcon sx={{ color: '#e6a817', fontSize: 22 }} />
              <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
                {folder.emoji} {folder.label}
              </Typography>
              <Box className="folder-actions" sx={{ display: 'flex', gap: 0.5 }} onClick={e => e.stopPropagation()}>
                <Tooltip title={t('addItineraryTooltip')}>
                  <IconButton size="small" onClick={e => { e.stopPropagation(); setAddTripFolder(folder.id); setAddTripName(''); uploadNewData.current = null }}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('deleteFolderTooltip')}>
                  <IconButton size="small" color="error" onClick={e => deleteFolder(folder.id, e)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Chip label={`${folder.trips.length}`} size="small" sx={{ fontSize: '0.72rem', height: 22, ml: 0.5 }} />
              <IconButton size="small" disableRipple>
                {expanded[folder.id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>

            {/* Sub-rows */}
            <Collapse in={!!expanded[folder.id]}>
              {folder.trips.map((trip, i) => {
                const isFav     = favorites.includes(trip.id)
                const isAuthor  = !!trip.author && trip.author === user.email
                return (
                  <Box
                    key={trip.id}
                    onClick={() => !trip.hidden && onSelectTrip(trip.id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      px: 2.5, py: 1.25, cursor: trip.hidden ? 'default' : 'pointer',
                      borderTop: '1px solid #f0f0f0', pl: 5,
                      opacity: trip.hidden ? 0.45 : 1,
                      bgcolor: trip.hidden ? '#fafafa' : 'transparent',
                      '&:hover': { bgcolor: trip.hidden ? '#fafafa' : '#f7f9fc' },
                      '& .trip-actions': { opacity: 0, transition: 'opacity 0.15s' },
                      '&:hover .trip-actions': { opacity: 1 },
                    }}
                  >
                    <Box sx={{ width: 3, height: 40, borderRadius: 2, bgcolor: TRIP_COLORS[i % TRIP_COLORS.length], flexShrink: 0, alignSelf: 'stretch', my: 0.5 }} />

                    <IconButton size="small" onClick={e => toggleFavorite(trip.id, e)}
                      sx={{ color: isFav ? '#f9a825' : 'text.disabled', p: 0.25, flexShrink: 0 }}>
                      {isFav ? <StarIcon sx={{ fontSize: 18 }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
                    </IconButton>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body1" fontWeight={600} noWrap>{trip.label}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.25 }}>
                        {trip.subtitle && (
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{trip.subtitle}</Typography>
                        )}
                        {trip.dates && (
                          <>
                            {trip.subtitle && <Typography variant="caption" color="text.disabled">·</Typography>}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                              <CalendarMonthIcon sx={{ fontSize: 11, color: 'text.disabled' }} />
                              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{trip.dates}</Typography>
                            </Box>
                          </>
                        )}
                        {trip.duration && (
                          <Chip label={trip.duration} size="small" sx={{ fontSize: '0.62rem', height: 16, '& .MuiChip-label': { px: 0.75 } }} />
                        )}
                        {isAdmin && trip.hidden && (
                          <Chip label={t('hiddenChip')} size="small" sx={{ fontSize: '0.62rem', height: 16, bgcolor: '#e0e0e0', color: 'text.secondary', '& .MuiChip-label': { px: 0.75 } }} />
                        )}
                      </Box>
                    </Box>

                    {/* Desktop: hover action buttons */}
                    <Box className="trip-actions" sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.25, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      {isAdmin && (
                        <Tooltip title={trip.hidden ? t('showItinerary') : t('hideItinerary')}>
                          <IconButton size="small" onClick={e => toggleHideTrip(folder.id, trip.id, e)}
                            sx={{ color: trip.hidden ? 'primary.main' : 'text.secondary' }}>
                            {trip.hidden ? <VisibilityIcon sx={{ fontSize: 16 }} /> : <VisibilityOffIcon sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </Tooltip>
                      )}
                      {isAuthor && (
                        <Tooltip title={t('editTripAction')}>
                          <IconButton size="small" onClick={e => openEdit(folder.id, trip, e)}>
                            <EditIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={t('copyItineraryAction')}>
                        <IconButton size="small" aria-label={t('copyItineraryAction')} onClick={e => openCopyDialog(trip, folder.id, e)}>
                          <ContentCopyIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('downloadJsonAction')}>
                        <IconButton size="small" onClick={e => downloadTrip(trip, e)}>
                          <DownloadIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      {isAuthor && (
                        <Tooltip title={t('uploadJsonReplaceAction')}>
                          <IconButton size="small" onClick={e => openReplaceUpload(trip, e)}>
                            <UploadFileIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {isAuthor && (
                        <Tooltip title={t('deleteAction')}>
                          <IconButton size="small" color="error" onClick={e => deleteTrip(folder.id, trip.id, e)}>
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>

                    {/* Mobile: always-visible options button */}
                    <IconButton
                      size="small"
                      sx={{ display: { xs: 'flex', sm: 'none' }, flexShrink: 0, color: 'text.secondary' }}
                      onClick={e => { e.stopPropagation(); setMobileMenu({ anchor: e.currentTarget, trip, folderId: folder.id }) }}
                    >
                      <MoreVertIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    <ArrowForwardIosIcon sx={{ fontSize: 12, color: 'text.secondary', flexShrink: 0 }} />
                  </Box>
                )
              })}

              {/* Add trip row */}
              <Box
                onClick={e => { e.stopPropagation(); setAddTripFolder(folder.id); setAddTripName(''); uploadNewData.current = null }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 5, py: 1, cursor: 'pointer', borderTop: '1px dashed #e0e0e0',
                  color: 'text.secondary',
                  '&:hover': { bgcolor: '#f7f9fc', color: 'primary.main' },
                }}
              >
                <AddIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption">{t('addItineraryTooltip')}</Typography>
              </Box>
            </Collapse>
          </Box>
        ))}

        {/* Add folder */}
        <Button
          startIcon={<CreateNewFolderIcon />}
          onClick={() => setAddFolderOpen(true)}
          variant="outlined"
          fullWidth
          sx={{ mt: 1, borderStyle: 'dashed', color: 'text.secondary', borderColor: 'divider', '&:hover': { borderColor: 'primary.main', color: 'primary.main' } }}
        >
          {t('addDestination')}
        </Button>
      </Box>

      {/* ── Hidden file inputs ── */}
      <input ref={uploadReplaceRef} type="file" accept=".json,application/json" hidden onChange={handleReplaceFile} />
      <input ref={uploadNewRef} type="file" accept=".json,application/json" hidden onChange={handleAddTripFileChange} />

      {/* ── Edit Trip Modal ── */}
      {editingTrip && (
        <TripEditorModal
          open={!!editingTrip}
          trip={editingTrip.trip}
          folderId={editingTrip.folderId}
          initialJson={editingTrip.initialJson}
          onSave={handleSaveEdit}
          onClose={() => setEditingTrip(null)}
        />
      )}

      {/* ── Add Trip Dialog ── */}
      <Dialog open={!!addTripFolder} onClose={() => { setAddTripFolder(null); setShowAiPrompt(false); setPasteJson(''); setPasteError('') }}
        maxWidth="sm" fullWidth PaperProps={{ sx: { maxHeight: '90vh' } }}>
        <DialogTitle>{t('addTripTitle')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>

          {addTripError && <Alert severity="error" sx={{ py: 0.5 }}>{addTripError}</Alert>}

          <TextField label={t('itineraryNameLabel')} size="small" value={addTripName}
            onChange={e => { setAddTripName(e.target.value); setAddTripError('') }} fullWidth autoFocus />

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" startIcon={<UploadFileIcon />}
              onClick={() => uploadNewRef.current.click()} size="small" sx={{ flexShrink: 0 }}>
              {uploadNewData.current && !pasteJson ? t('fileLoaded') : t('uploadFileBtn')}
            </Button>
            <Typography variant="caption" color="text.secondary">{t('orPasteJson')}</Typography>
          </Stack>

          <TextField
            multiline
            minRows={4}
            maxRows={10}
            fullWidth
            size="small"
            placeholder='{ "version": 1, "title": "My trip", ... }'
            value={pasteJson}
            onChange={e => handlePasteJsonChange(e.target.value)}
            error={!!pasteError}
            helperText={pasteError || (uploadNewData.current && pasteJson ? '✓ JSON válido' : '')}
            FormHelperTextProps={{ sx: { color: !pasteError && uploadNewData.current && pasteJson ? 'success.main' : undefined } }}
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
          />

          {/* AI prompt box */}
          <Box sx={{ border: '1px solid', borderColor: 'primary.light', borderRadius: 2, overflow: 'hidden' }}>
            <Box
              onClick={() => setShowAiPrompt(v => !v)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 2, py: 1.25, cursor: 'pointer', bgcolor: '#f0f4ff',
                '&:hover': { bgcolor: '#e8eeff' },
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 18, color: 'primary.main' }} />
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1, color: 'primary.main' }}>
                {t('noJsonTitle')}
              </Typography>
              {showAiPrompt ? <ExpandLessIcon fontSize="small" sx={{ color: 'primary.main' }} /> : <ExpandMoreIcon fontSize="small" sx={{ color: 'primary.main' }} />}
            </Box>

            <Collapse in={showAiPrompt}>
              <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Copia el prompt de abajo, pégalo en <strong>ChatGPT</strong>, responde las preguntas
                  y luego descarga el JSON que te genere para subirlo aquí.
                </Typography>

                <Box sx={{ position: 'relative' }}>
                  <Box
                    component="pre"
                    ref={promptRef}
                    sx={{
                      bgcolor: '#1e1e2e', color: '#cdd6f4',
                      borderRadius: 1.5, p: 2, fontSize: '0.72rem',
                      fontFamily: 'monospace', lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      maxHeight: 320, overflowY: 'auto',
                      m: 0,
                    }}
                  >
{`Necesito generar un itinerario de viaje en formato JSON. Primero hazme las siguientes preguntas una por una y luego genera el JSON:

PREGUNTAS:
1. ¿Cuál es el nombre del viaje y las fechas (fecha inicio – fecha fin)?
2. ¿Cuántos días dura en total?
3. ¿Desde qué ciudad/aeropuerto salís y a cuál llegás? (ej: SJO → YYZ)
4. ¿Cuántas partes o etapas tiene el viaje? (ej: Parte 1: Montañas, Parte 2: Ciudad)
5. Para cada parte: nombre, rango de días, emoji representativo y color preferido (#hex)
6. Para cada día de cada parte: fecha, ciudad/lugar, subtítulo del día, transportes usados
   (vuelos, drives, trenes, alojamiento), actividades (3–5 por día con duración estimada y
   tips prácticos), consejos, advertencias, y actividades opcionales si sobra tiempo

Una vez que respondas todo, generame el JSON con EXACTAMENTE esta estructura:

{
  "version": 1,
  "title": "Nombre del Viaje",
  "subtitle": "Sep 12 – Sep 30, 2026",
  "stats": ["19 días", "3 regiones", "5 ciudades", "SJO → YYZ"],
  "parts": [
    {
      "id": 1,
      "emoji": "🏔️",
      "title": "Nombre de la Parte",
      "color": "#2E7D32",
      "daysRange": "Días 1 – 7",
      "days": [
        {
          "dayNumber": 1,
          "date": "Sáb 12 Sep",
          "location": "Ciudad",
          "subtitle": "Descripción corta del día",
          "logistics": [
            { "type": "flight", "label": "Vuelo",       "value": "SJO → YYZ" },
            { "type": "drive",  "label": "Drive",        "value": "Aeropuerto → Hotel: 30 min" },
            { "type": "stay",   "label": "Alojamiento",  "value": "Nombre del hotel" },
            { "type": "train",  "label": "Tren",         "value": "Ciudad A → Ciudad B" }
          ],
          "activities": [
            "Descripción de actividad 1 — duración estimada y tip de reserva",
            "Descripción de actividad 2"
          ],
          "tips":                  ["Consejo útil para el día"],
          "warnings":              ["Advertencia importante"],
          "links":                 [{ "label": "Nombre", "url": "https://..." }],
          "optional_alternatives": ["Actividad opcional si sobra tiempo"],
          "images": [
            { "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/X/XX/Filename.jpg/1280px-Filename.jpg", "caption": "Descripción" }
          ]
        }
      ]
    }
  ]
}

REGLAS GENERALES:
- "type" en logistics solo puede ser: "flight", "drive", "stay" o "train"
- Colores sugeridos: "#2E7D32" verde, "#0277BD" azul, "#AD1457" rosa, "#F57C00" naranja, "#7B1FA2" morado, "#00838F" teal
- tips, warnings, links, images y optional_alternatives pueden ser arrays vacíos []
- Devolveme SOLO el JSON, sin texto adicional antes ni después

REGLAS DE IMÁGENES (crítico):
- Usa solo imágenes de Wikimedia Commons
- Antes de incluir cualquier imagen, consultá la API para obtener la URL correcta:
  https://commons.wikimedia.org/w/api.php?action=query&titles=File:NOMBRE.jpg&prop=imageinfo&iiprop=url&iiurlwidth=1024&format=json
- Usá el campo "thumburl" de la respuesta exactamente como viene (normalmente termina en /1280px-...)
- Si la API devuelve una URL sin /thumb/ (imagen pequeña), usá esa URL directa
- NUNCA construyas URLs de thumbnail manualmente ni uses tamaños arbitrarios como 1024px
- Verificá que el archivo existe antes de incluirlo (nombre incorrecto → imagen rota para todos)
- Ponele 2–3 imágenes por día, orientación horizontal preferida`}
                  </Box>

                  <Tooltip title={copied ? 'Copiado!' : 'Copiar prompt'}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        navigator.clipboard.writeText(promptRef.current?.textContent ?? '')
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                      sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.1)', color: '#cdd6f4', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
                    >
                      {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  {t('noJsonNote')}
                </Typography>
              </Box>
            </Collapse>
          </Box>

        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddTripFolder(null); setAddTripError(''); setShowAiPrompt(false); setPasteJson(''); setPasteError('') }}>{t('cancel')}</Button>
          <Button variant="contained" onClick={confirmAddTrip}>{t('add')}</Button>
        </DialogActions>
      </Dialog>

      {/* ── Add Folder Dialog ── */}
      <Dialog open={addFolderOpen} onClose={() => setAddFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('newDestination')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Stack direction="row" spacing={1}>
            <TextField label={t('emojiLabel')} size="small" value={newFolderEmoji}
              onChange={e => setNewFolderEmoji(e.target.value)} sx={{ width: 80 }} />
            <TextField label={t('folderNamePlaceholder')} size="small" value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)} fullWidth autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddFolderOpen(false)}>{t('cancel')}</Button>
          <Button variant="contained" onClick={confirmAddFolder} disabled={!newFolderName.trim()}>{t('create')}</Button>
        </DialogActions>
      </Dialog>

      {/* ── Copy Trip Dialog ── */}
      {copyDialog && (
        <Dialog open onClose={() => setCopyDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('copyItineraryTitle')}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            <Typography variant="body2" color="text.secondary">
              {t('originalLabel', { label: copyDialog.trip.label })}
            </Typography>
            <TextField
              label={t('newItineraryName')}
              value={copyName}
              onChange={e => setCopyName(e.target.value)}
              size="small"
              fullWidth
              autoFocus
            />
            <TextField
              select
              label={t('destinationFolder')}
              value={copyFolder}
              onChange={e => setCopyFolder(e.target.value)}
              size="small"
              fullWidth
              SelectProps={{ native: true }}
            >
              {registry.map(f => (
                <option key={f.id} value={f.id}>{f.emoji} {f.label}</option>
              ))}
            </TextField>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCopyDialog(null)}>{t('cancel')}</Button>
            <Button
              variant="contained"
              onClick={confirmCopy}
              disabled={!copyName.trim() || copying}
              startIcon={copying ? <CircularProgress size={14} /> : <ContentCopyIcon />}
            >
              {copying ? t('copyingBtn') : t('copy')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {isAdmin && (
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} currentUserEmail={user?.email} />
      )}

      {/* ── Mobile actions menu ── */}
      <Menu
        anchorEl={mobileMenu?.anchor}
        open={Boolean(mobileMenu)}
        onClose={() => setMobileMenu(null)}
        onClick={e => e.stopPropagation()}
        PaperProps={{ sx: { minWidth: 200 } }}
      >
        {mobileMenu && (() => {
          const { trip, folderId } = mobileMenu
          const isMobAuthor = !!trip.author && trip.author === user.email
          const close = () => setMobileMenu(null)
          return [
            isAdmin && (
              <MenuItem key="vis" onClick={e => { toggleHideTrip(folderId, trip.id, e); close() }}>
                <ListItemIcon>{trip.hidden ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}</ListItemIcon>
                <ListItemText>{trip.hidden ? t('showAction') : t('hideAction')}</ListItemText>
              </MenuItem>
            ),
            isMobAuthor && (
              <MenuItem key="edit" onClick={e => { openEdit(folderId, trip, e); close() }}>
                <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t('edit')}</ListItemText>
              </MenuItem>
            ),
            <MenuItem key="copy" aria-label={t('copyItineraryAction')} onClick={e => { openCopyDialog(trip, folderId, e); close() }}>
              <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t('copyItineraryAction')}</ListItemText>
            </MenuItem>,
            <MenuItem key="dl" onClick={e => { downloadTrip(trip, e); close() }}>
              <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t('downloadJsonAction')}</ListItemText>
            </MenuItem>,
            isMobAuthor && (
              <MenuItem key="upload" onClick={e => { openReplaceUpload(trip, e); close() }}>
                <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t('uploadJson')}</ListItemText>
              </MenuItem>
            ),
            isMobAuthor && [
              <Divider key="div" />,
              <MenuItem key="del" onClick={e => { deleteTrip(folderId, trip.id, e); close() }} sx={{ color: 'error.main' }}>
                <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                <ListItemText>{t('deleteAction')}</ListItemText>
              </MenuItem>,
            ],
          ].filter(Boolean)
        })()}
      </Menu>
    </Box>
  )
}
