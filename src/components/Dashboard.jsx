import { useState, useRef, useEffect } from 'react'
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db, signOutWithCleanup } from '../firebase'

const DEMO_MAX_TRIPS = Number(import.meta.env.VITE_DEMO_MAX_TRIPS || 2)
import {
  Box, Typography, TextField, Collapse, Chip,
  Button, Tooltip, InputAdornment, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  CircularProgress, Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material'
import SearchIcon        from '@mui/icons-material/Search'
import ExpandMoreIcon    from '@mui/icons-material/ExpandMore'
import ExpandLessIcon    from '@mui/icons-material/ExpandLess'
import FolderIcon        from '@mui/icons-material/Folder'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import LogoutIcon        from '@mui/icons-material/Logout'
import PeopleIcon        from '@mui/icons-material/People'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import StarIcon          from '@mui/icons-material/Star'
import StarBorderIcon    from '@mui/icons-material/StarBorder'
import EditIcon          from '@mui/icons-material/Edit'
import DownloadIcon      from '@mui/icons-material/Download'
import UploadFileIcon    from '@mui/icons-material/UploadFile'
import DeleteIcon        from '@mui/icons-material/Delete'
import AddIcon              from '@mui/icons-material/Add'
import AutoAwesomeIcon      from '@mui/icons-material/AutoAwesome'
import ContentCopyIcon      from '@mui/icons-material/ContentCopy'
import VisibilityOffIcon    from '@mui/icons-material/VisibilityOff'
import VisibilityIcon       from '@mui/icons-material/Visibility'
import MoreVertIcon         from '@mui/icons-material/MoreVert'
import GroupAddIcon         from '@mui/icons-material/GroupAdd'
import ExploreOutlinedIcon  from '@mui/icons-material/ExploreOutlined'

import AdminPanel        from './AdminPanel'
import TripEditorModal   from './TripEditorModal'
import AddTripDialog     from './AddTripDialog'
import EmptyDashboard    from './EmptyDashboard'
import TripShareDialog   from './TripShareDialog'
import UserProfileDialog from './UserProfileDialog'
import {
  getRegistry, saveRegistry,
  getFavorites, saveFavorites,
  getTripData, saveTripData, deleteTripData,
  slugify,
} from '../utils/registry'
import { useT, useLang, useChangeLang } from '../i18n'

const TRIP_COLORS = ['#2E7D32', '#0277BD', '#AD1457', '#F57C00', '#7B1FA2', '#00838F']

export default function Dashboard({ user, isAdmin, isDemo, gatewayTripId, onSelectTrip, onBuildWithAi }) {
  const GATEWAY_TRIP_ID = gatewayTripId
  const t          = useT()
  const lang       = useLang()
  const changeLang = useChangeLang()
  // `registry` is now a flat array of trip entries. Folders for display
  // are computed by role: My Trips for everyone, plus All Trips for admin.
  const [registry, setRegistry]     = useState(() => getRegistry())
  const [favorites, setFavorites]   = useState(() => getFavorites())
  const [search, setSearch]         = useState('')
  const [showFavsOnly, setShowFavsOnly] = useState(false)
  const [expanded, setExpanded]     = useState({ __my: true, __all: true })
  const [adminOpen, setAdminOpen]     = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [registryLoading, setRegistryLoading] = useState(() => !localStorage.getItem('trips-registry'))

  const [editingTrip, setEditingTrip] = useState(null)

  // addTrip state: null when closed, else { folderId, initialTab }
  const [addTrip, setAddTrip] = useState(null)

  const uploadReplaceRef  = useRef()
  const uploadReplaceTrip = useRef(null)

  const [copyDialog, setCopyDialog] = useState(null)
  const [copyName, setCopyName]     = useState('')
  const [copying, setCopying]       = useState(false)

  const [mobileMenu, setMobileMenu] = useState(null)
  const [shareDialog, setShareDialog] = useState(null) // { trip, folderId }

  // ── Registry live sync ────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'trips', GATEWAY_TRIP_ID, 'registry', 'main'),
      snap => {
        setRegistryLoading(false)
        if (!snap.exists()) return
        const data = snap.data()
        // New flat shape: { trips: [...] }. Legacy folder shape: { folders: [{trips: [...]}] }.
        const flat = Array.isArray(data.trips)
          ? data.trips
          : Array.isArray(data.folders)
            ? data.folders.flatMap(f => f.trips || [])
            : null
        if (!Array.isArray(flat)) return
        saveRegistry(flat)
        setRegistry(flat)
      },
      err => {
        console.warn('[sync] Registry snapshot error:', err.message)
        setRegistryLoading(false)
      }
    )
    return unsub
  }, [])

  // Accepts either the next array, or an updater fn (prev) => next. Using the
  // updater form avoids stale-closure bugs when called after an await (e.g.
  // confirmCopy reads source data asynchronously before appending).
  function updateRegistry(nextOrFn) {
    setRegistry(prev => {
      const next = typeof nextOrFn === 'function' ? nextOrFn(prev) : nextOrFn
      saveRegistry(next)
      setDoc(doc(db, 'trips', GATEWAY_TRIP_ID, 'registry', 'main'), { trips: next })
        .catch(err => console.warn('[sync] Could not save registry to Firestore:', err.message))
      return next
    })
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

  function handleSaveEdit(_folderId, tripId, meta, jsonData) {
    updateRegistry(prev => prev.map(t => t.id === tripId ? { ...t, ...meta } : t))
    if (jsonData) {
      const syncedData = meta.label ? { ...jsonData, title: meta.label } : jsonData
      saveTripData(tripId, syncedData)
      setDoc(doc(db, 'trips', tripId, 'data', 'itinerary'), syncedData)
        .catch(err => console.warn('[sync] Could not save to Firestore:', err.message))
    }
  }

  function deleteTrip(_folderId, tripId, e) {
    e.stopPropagation()
    if (!window.confirm(t('confirmDeleteTrip'))) return
    updateRegistry(prev => prev.filter(t => t.id !== tripId))
    deleteTripData(tripId)
    // Also delete the cloud doc so the trip doesn't come back on next sync /
    // registry rebuild. Firestore rules permit this for admin / author /
    // gateway user (same write rule as create).
    deleteDoc(doc(db, 'trips', tripId, 'data', 'itinerary'))
      .catch(err => console.warn('[sync] Could not delete trip from Firestore:', err.message))
  }

  function toggleHideTrip(_folderId, tripId, e) {
    e.stopPropagation()
    updateRegistry(prev => prev.map(t => t.id === tripId ? { ...t, hidden: !t.hidden } : t))
  }

  function saveViewers(_folderId, tripId, viewers) {
    updateRegistry(prev => prev.map(t => {
      if (t.id !== tripId) return t
      const updated = { ...t }
      if (viewers === undefined) {
        delete updated.viewers  // open to all — remove the field
      } else {
        updated.viewers = viewers
      }
      return updated
    }))
  }

  // Demo users are capped at DEMO_MAX_TRIPS. Returns true if blocked.
  function demoTripCapReached() {
    if (!isDemo) return false
    const owned = registry.filter(tr => tr.author === user.email).length
    if (owned >= DEMO_MAX_TRIPS) {
      window.alert(t('demoTripLimit', { max: DEMO_MAX_TRIPS }))
      return true
    }
    return false
  }

  // Demo trips need a uid-scoped id so Firestore rules can verify ownership.
  function newTripId(name) {
    return isDemo
      ? `demo-${user.uid}-${Date.now()}`
      : `trip-${slugify(name)}-${Date.now()}`
  }

  function handleCreateTrip(name, jsonData) {
    if (demoTripCapReached()) { setAddTrip(null); return }
    const id = newTripId(name)
    const trip = {
      id,
      label:    jsonData?.label?.trim() || name,
      subtitle: jsonData?.subtitle ?? '',
      dates:    jsonData?.subtitle ?? '',
      duration: jsonData?.stats?.[0] ?? '',
      author:   user.email,
      viewers:  [user.email],
    }
    updateRegistry(prev => [...prev, trip])
    if (jsonData) {
      saveTripData(id, jsonData)
      setDoc(doc(db, 'trips', id, 'data', 'itinerary'), jsonData)
        .catch(err => console.warn('[sync] Could not save trip to Firestore:', err.message))
    }
    setAddTrip(null)
  }

  function handleEmptyAi(seedText) {
    onBuildWithAi?.(null, seedText)
  }

  function handleEmptyPaste() {
    setAddTrip({ initialTab: 'paste' })
  }

  function openCopyDialog(trip, _folderId, e) {
    e.stopPropagation()
    setCopyDialog({ trip })
    setCopyName(`${t('copyPrefix')} ${trip.label}`)
  }

  async function confirmCopy() {
    if (!copyName.trim()) return
    if (demoTripCapReached()) { setCopyDialog(null); return }
    setCopying(true)
    try {
      let sourceData = getTripData(copyDialog.trip.id)
      if (!sourceData) {
        const snap = await getDoc(doc(db, 'trips', copyDialog.trip.id, 'data', 'itinerary'))
        if (snap.exists()) sourceData = snap.data()
      }
      const newId = newTripId(copyName)
      const newTrip = {
        id: newId,
        label: copyName.trim(),
        subtitle: sourceData?.subtitle ?? copyDialog.trip.subtitle,
        dates: copyDialog.trip.dates,
        duration: copyDialog.trip.duration,
        author: user.email,
        viewers: [user.email],
      }
      updateRegistry(prev => [...prev, newTrip])
      if (sourceData) {
        const newData = { ...sourceData, author: user.email, version: 1 }
        saveTripData(newId, newData)
        setDoc(doc(db, 'trips', newId, 'data', 'itinerary'), newData)
          .catch(err => console.warn('[sync]', err.message))
      }
      setCopyDialog(null)
      setCopyName('')
    } catch (err) {
      console.warn('[copy] confirmCopy failed:', err.message)
    } finally {
      setCopying(false)
    }
  }

  function canSeeTrip(tr) {
    if (isAdmin) return true
    if (tr.author === user.email) return true
    if (tr.viewers === undefined) return true   // legacy open trip
    return tr.viewers.includes(user.email)
  }

  const query2 = search.toLowerCase()

  function matchesFilters(tr) {
    if (!canSeeTrip(tr)) return false
    if (!isAdmin && tr.hidden) return false
    if (showFavsOnly && !favorites.includes(tr.id)) return false
    if (!query2) return true
    return (
      tr.label.toLowerCase().includes(query2) ||
      (tr.subtitle || '').toLowerCase().includes(query2)
    )
  }
  // Compute display folders from the flat registry by user role:
  //  - everyone gets "My Trips" (trips they authored)
  //  - admin also gets "All Trips" (every other trip)
  //  - demo users get a single "My Trips" folder that also includes the
  //    seeded sample trip(s), so they have something to explore immediately.
  const visibleTrips = registry.filter(matchesFilters)
  const mineTrips    = visibleTrips.filter(tr => tr.author === user.email)
  const othersTrips  = visibleTrips.filter(tr => tr.author !== user.email)
  const filtered = isDemo
    ? [
        { id: '__my', label: t('myTrips'), emoji: '✈️', trips: visibleTrips },
      ].filter(f => f.trips.length > 0)
    : isAdmin
    ? [
        { id: '__my',  label: t('myTrips'),  emoji: '✈️', trips: mineTrips },
        { id: '__all', label: t('allTrips'), emoji: '🗂️', trips: othersTrips },
      ].filter(f => f.trips.length > 0 || (!showFavsOnly && !query2))
    : [
        { id: '__my',  label: t('myTrips'),  emoji: '✈️', trips: mineTrips },
      ].filter(f => f.trips.length > 0)

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
          <Tooltip title={t('profile')}>
            <Button size="small" startIcon={<AccountCircleIcon sx={{ fontSize: 16 }} />}
              onClick={() => setProfileOpen(true)}
              data-testid="dashboard-profile-btn"
              sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', textTransform: 'none', '&:hover': { color: '#fff' } }}>
              {t('profile')}
            </Button>
          </Tooltip>
          <Tooltip title={t('signOutTooltip', { email: user.email })}>
            <Button size="small" startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
              onClick={() => signOutWithCleanup()}
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

      {/* ── Demo-mode notice ── */}
      {isDemo && (
        <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 3 }}>
          <Box data-testid="demo-banner" sx={{
            display: 'flex', alignItems: 'center', gap: 1.25,
            bgcolor: '#fff8e1', border: '1px solid #ffe082',
            borderRadius: 2, px: 2, py: 1.25,
          }}>
            <ExploreOutlinedIcon sx={{ color: '#f57c00', fontSize: 20, flexShrink: 0 }} />
            <Typography variant="caption" sx={{ color: '#7a5c00', lineHeight: 1.5 }}>
              {t('demoBanner', {
                maxTrips: DEMO_MAX_TRIPS,
                maxAi: import.meta.env.VITE_DEMO_MAX_AI_CALLS || 100,
              })}
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── AI assistant banner — only when user has visible trips ── */}
      {(registryLoading || filtered.length > 0) && (
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
      )}

      {/* ── Empty: no trips exist at all ── */}
      {!registryLoading && registry.length === 0 && (
        <EmptyDashboard
          onBuildWithAi={handleEmptyAi}
          onPasteJson={handleEmptyPaste}
        />
      )}

      {/* ── Empty: trips exist but none visible (not invited) ── */}
      {!registryLoading && registry.length > 0 && filtered.length === 0 && !search && !showFavsOnly && (
        <Box sx={{ maxWidth: 480, mx: 'auto', px: 3, pt: 6, pb: 4, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 48, mb: 2 }}>🗺️</Typography>
          <Typography variant="h6" fontWeight={700} mb={1}>{t('noSharedTripsTitle')}</Typography>
          <Typography variant="body2" color="text.secondary" mb={4} sx={{ lineHeight: 1.7 }}>
            {t('noSharedTripsBody')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => setAddTrip({ initialTab: 'ai' })}
              sx={{ background: 'linear-gradient(135deg, #B71C1C 0%, #7B1FA2 100%)', textTransform: 'none' }}
            >
              {t('noSharedTripsAiCta')}
            </Button>
          </Stack>
        </Box>
      )}

      {/* ── Filter bar ── */}
      {(registryLoading || filtered.length > 0 || search || showFavsOnly) && registry.length > 0 && (
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
      )}

      {/* ── Trip list ── */}
      {(registryLoading || filtered.length > 0 || search || showFavsOnly) && registry.length > 0 && (
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pb: 4 }}>
        {registryLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress size={32} />
          </Box>
        )}
        {!registryLoading && filtered.length === 0 && (search || showFavsOnly) && (
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography variant="body2" color="text.secondary" mb={1.5}>{t('noTripsFound')}</Typography>
            <Button size="small" onClick={() => { setSearch(''); setShowFavsOnly(false) }}>{t('clearFilters')}</Button>
          </Box>
        )}

        {!registryLoading && filtered.map(folder => (
          <Box key={folder.id} data-testid={`folder-${folder.id.replace('__','')}`} sx={{ mb: 2, bgcolor: '#fff', borderRadius: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

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
              {folder.id === '__my' && (
                <Box className="folder-actions" sx={{ display: 'flex', gap: 0.5 }} onClick={e => e.stopPropagation()}>
                  <Tooltip title={t('addItineraryTooltip')}>
                    <IconButton size="small" onClick={e => { e.stopPropagation(); setAddTrip({ initialTab: 'ai' }) }}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
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
                      {(isAuthor || isAdmin) && (
                        <Tooltip title={t('shareTripAction')}>
                          <IconButton size="small" onClick={e => { e.stopPropagation(); setShareDialog({ trip, folderId: folder.id }) }}>
                            <GroupAddIcon sx={{ fontSize: 16 }} />
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
                      {(isAuthor || isAdmin) && (
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

              {/* Add trip row — only on My Trips folder */}
              {folder.id === '__my' && (
              <Box
                onClick={e => { e.stopPropagation(); setAddTrip({ initialTab: 'ai' }) }}
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
              )}
            </Collapse>
          </Box>
        ))}

      </Box>
      )}

      {/* ── Hidden file inputs ── */}
      <input ref={uploadReplaceRef} type="file" accept=".json,application/json" hidden onChange={handleReplaceFile} />

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
      <AddTripDialog
        open={!!addTrip}
        initialTab={addTrip?.initialTab}
        onClose={() => setAddTrip(null)}
        onCreate={handleCreateTrip}
      />

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

      <UserProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} userEmail={user?.email} />

      {shareDialog && (
        <TripShareDialog
          open
          trip={shareDialog.trip}
          authorEmail={shareDialog.trip.author ?? user.email}
          onSave={viewers => saveViewers(shareDialog.folderId, shareDialog.trip.id, viewers)}
          onClose={() => setShareDialog(null)}
        />
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
            (isMobAuthor || isAdmin) && (
              <MenuItem key="share" onClick={() => { setShareDialog({ trip, folderId }); close() }}>
                <ListItemIcon><GroupAddIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{t('shareTripAction')}</ListItemText>
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
            (isMobAuthor || isAdmin) && [
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
