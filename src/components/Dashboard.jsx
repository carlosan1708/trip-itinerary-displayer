import { useState, useRef } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import {
  Box, Typography, TextField, Collapse, Chip,
  Button, Tooltip, InputAdornment, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  Alert,
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

import AdminPanel       from './AdminPanel'
import TripEditorModal  from './TripEditorModal'
import {
  getRegistry, saveRegistry,
  getFavorites, saveFavorites,
  getTripData, saveTripData, deleteTripData,
  slugify,
} from '../utils/registry'

const TRIP_COLORS = ['#2E7D32', '#0277BD', '#AD1457', '#F57C00', '#7B1FA2', '#00838F']

export default function Dashboard({ user, isAdmin, onSelectTrip }) {
  const [registry, setRegistry]     = useState(() => getRegistry())
  const [favorites, setFavorites]   = useState(() => getFavorites())
  const [search, setSearch]         = useState('')
  const [showFavsOnly, setShowFavsOnly] = useState(false)
  const [expanded, setExpanded]     = useState(() =>
    Object.fromEntries(getRegistry().map(f => [f.id, true]))
  )
  const [adminOpen, setAdminOpen]   = useState(false)

  // Edit modal
  const [editingTrip, setEditingTrip] = useState(null) // { folderId, trip }

  // Add trip modal
  const [addTripFolder, setAddTripFolder] = useState(null)
  const [addTripName, setAddTripName]     = useState('')
  const [addTripError, setAddTripError]   = useState('')
  const uploadNewRef  = useRef()
  const uploadNewData = useRef(null)

  // Add folder modal
  const [addFolderOpen, setAddFolderOpen] = useState(false)

  // AI prompt box
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [copied, setCopied]             = useState(false)
  const [newFolderEmoji, setNewFolderEmoji] = useState('🌍')
  const [newFolderName, setNewFolderName]   = useState('')

  // Per-row upload (replace JSON)
  const uploadReplaceRef  = useRef()
  const uploadReplaceTrip = useRef(null)
  const promptRef         = useRef()

  // ── Registry helpers ──────────────────────────────────────────────
  function updateRegistry(next) {
    saveRegistry(next)
    setRegistry(next)
  }

  // ── Favorites ─────────────────────────────────────────────────────
  function toggleFavorite(tripId, e) {
    e.stopPropagation()
    const next = favorites.includes(tripId)
      ? favorites.filter(id => id !== tripId)
      : [...favorites, tripId]
    saveFavorites(next)
    setFavorites(next)
  }

  // ── Download ──────────────────────────────────────────────────────
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

  // ── Replace JSON (quick upload on row) ────────────────────────────
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

  // ── Edit trip (modal) ─────────────────────────────────────────────
  function openEdit(folderId, trip, e) {
    e.stopPropagation()
    setEditingTrip({ folderId, trip })
  }

  function handleSaveEdit(folderId, tripId, meta, jsonData) {
    const next = registry.map(folder => {
      if (folder.id !== folderId) return folder
      return {
        ...folder,
        trips: folder.trips.map(t =>
          t.id === tripId ? { ...t, ...meta } : t
        ),
      }
    })
    updateRegistry(next)
    if (jsonData) saveTripData(tripId, jsonData)
  }

  // ── Delete trip ───────────────────────────────────────────────────
  function deleteTrip(folderId, tripId, e) {
    e.stopPropagation()
    if (!window.confirm('¿Eliminar este itinerario del panel?')) return
    const next = registry.map(f => {
      if (f.id !== folderId) return f
      return { ...f, trips: f.trips.filter(t => t.id !== tripId) }
    })
    updateRegistry(next)
    deleteTripData(tripId)
  }

  // ── Delete folder ─────────────────────────────────────────────────
  function deleteFolder(folderId, e) {
    e.stopPropagation()
    if (!window.confirm('¿Eliminar esta carpeta y todos sus viajes?')) return
    const folder = registry.find(f => f.id === folderId)
    folder?.trips.forEach(t => deleteTripData(t.id))
    updateRegistry(registry.filter(f => f.id !== folderId))
  }

  // ── Add trip to folder ────────────────────────────────────────────
  function handleAddTripFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        uploadNewData.current = data
        setAddTripName(data.title || file.name.replace('.json', ''))
      } catch {
        setAddTripError('El archivo no es un JSON válido.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function confirmAddTrip() {
    if (!addTripName.trim()) { setAddTripError('El nombre no puede estar vacío.'); return }
    const id   = `${addTripFolder}-${slugify(addTripName)}-${Date.now()}`
    const data = uploadNewData.current
    const trip = {
      id,
      label:    addTripName.trim(),
      subtitle: data?.subtitle ?? '',
      dates:    data?.subtitle ?? '',
      duration: data?.stats?.[0] ?? '',
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
    uploadNewData.current = null
  }

  // ── Add folder ────────────────────────────────────────────────────
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

  // ── Filter ────────────────────────────────────────────────────────
  const query = search.toLowerCase()
  const filtered = registry
    .map(folder => ({
      ...folder,
      trips: folder.trips.filter(t => {
        if (showFavsOnly && !favorites.includes(t.id)) return false
        if (!query) return true
        return (
          t.label.toLowerCase().includes(query) ||
          t.subtitle.toLowerCase().includes(query) ||
          folder.label.toLowerCase().includes(query)
        )
      }),
    }))
    .filter(f => f.trips.length > 0 || (!showFavsOnly && !query))

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
          {isAdmin && (
            <Tooltip title="Gestionar accesos">
              <Button size="small" startIcon={<PeopleIcon sx={{ fontSize: 16 }} />}
                onClick={() => setAdminOpen(true)}
                sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.75rem', textTransform: 'none', '&:hover': { color: '#fff' } }}>
                Accesos
              </Button>
            </Tooltip>
          )}
          <Tooltip title={`Cerrar sesión (${user.email})`}>
            <Button size="small" startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
              onClick={() => signOut(auth)}
              sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'none', minWidth: 0, '&:hover': { color: '#fff' } }}>
              Salir
            </Button>
          </Tooltip>
        </Box>

        <Typography variant="h3" component="h1"
          sx={{ fontWeight: 700, letterSpacing: '-0.5px', mb: 1, fontSize: { xs: '2rem', md: '2.8rem' } }}>
          ✈️ Mis Viajes
        </Typography>
        <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 300, letterSpacing: 2, textTransform: 'uppercase', fontSize: { xs: '0.8rem', md: '0.95rem' } }}>
          Selecciona un itinerario
        </Typography>
      </Box>

      {/* ── Filter bar ── */}
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 4, pb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="Buscar viaje..." value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment> }}
          sx={{ bgcolor: '#fff', borderRadius: 2, flex: 1, minWidth: 180 }}
        />
        <Chip
          icon={<StarIcon sx={{ fontSize: '16px !important' }} />}
          label="Favoritos"
          onClick={() => setShowFavsOnly(v => !v)}
          color={showFavsOnly ? 'warning' : 'default'}
          variant={showFavsOnly ? 'filled' : 'outlined'}
          sx={{ bgcolor: showFavsOnly ? undefined : '#fff', cursor: 'pointer' }}
        />
      </Box>

      {/* ── Trip list ── */}
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pb: 4 }}>
        {filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No hay viajes que coincidan.
          </Typography>
        )}

        {filtered.map(folder => (
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
                <Tooltip title="Agregar itinerario">
                  <IconButton size="small" onClick={e => { e.stopPropagation(); setAddTripFolder(folder.id); setAddTripName(''); uploadNewData.current = null }}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Eliminar carpeta">
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
                const isFav = favorites.includes(trip.id)
                return (
                  <Box
                    key={trip.id}
                    onClick={() => onSelectTrip(trip.id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      px: 2.5, py: 1.5, cursor: 'pointer',
                      borderTop: '1px solid #f0f0f0', pl: 5,
                      '&:hover': { bgcolor: '#f7f9fc' },
                      '& .trip-actions': { opacity: 0, transition: 'opacity 0.15s' },
                      '&:hover .trip-actions': { opacity: 1 },
                    }}
                  >
                    <Box sx={{ width: 3, height: 36, borderRadius: 2, bgcolor: TRIP_COLORS[i % TRIP_COLORS.length], flexShrink: 0 }} />

                    {/* Favorite */}
                    <IconButton size="small" onClick={e => toggleFavorite(trip.id, e)}
                      sx={{ color: isFav ? '#f9a825' : 'text.disabled', p: 0.25 }}>
                      {isFav ? <StarIcon sx={{ fontSize: 18 }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
                    </IconButton>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body1" fontWeight={600} noWrap>{trip.label}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{trip.subtitle}</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, mr: 0.5 }}>
                      <CalendarMonthIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                      <Typography variant="caption" color="text.secondary">{trip.dates}</Typography>
                    </Box>

                    <Chip label={trip.duration} size="small" sx={{ fontSize: '0.7rem', height: 20, flexShrink: 0 }} />

                    {/* Actions — visible on hover */}
                    <Box className="trip-actions" sx={{ display: 'flex', gap: 0.25 }} onClick={e => e.stopPropagation()}>
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={e => openEdit(folder.id, trip, e)}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Descargar JSON">
                        <IconButton size="small" onClick={e => downloadTrip(trip, e)}>
                          <DownloadIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Subir JSON (reemplazar)">
                        <IconButton size="small" onClick={e => openReplaceUpload(trip, e)}>
                          <UploadFileIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" color="error" onClick={e => deleteTrip(folder.id, trip.id, e)}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>

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
                <Typography variant="caption">Agregar itinerario</Typography>
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
          Agregar destino / carpeta
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
          onSave={handleSaveEdit}
          onClose={() => setEditingTrip(null)}
        />
      )}

      {/* ── Add Trip Dialog ── */}
      <Dialog open={!!addTripFolder} onClose={() => { setAddTripFolder(null); setShowAiPrompt(false) }}
        maxWidth="sm" fullWidth PaperProps={{ sx: { maxHeight: '90vh' } }}>
        <DialogTitle>Agregar itinerario</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>

          {addTripError && <Alert severity="error" sx={{ py: 0.5 }}>{addTripError}</Alert>}

          <TextField label="Nombre del itinerario" size="small" value={addTripName}
            onChange={e => { setAddTripName(e.target.value); setAddTripError('') }} fullWidth autoFocus />

          <Button variant="outlined" startIcon={<UploadFileIcon />}
            onClick={() => uploadNewRef.current.click()} size="small">
            {uploadNewData.current ? '✓ JSON cargado — cambiar archivo' : 'Cargar JSON'}
          </Button>

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
                ¿No tienes el JSON? Generalo con IA
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
   (vuelos, drives, trenes, alojamiento), actividades, tips y advertencias

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
            "Descripción de actividad 1",
            "Descripción de actividad 2"
          ],
          "tips":     ["Consejo útil para el día"],
          "warnings": ["Advertencia importante"],
          "links":    [{ "label": "Nombre", "url": "https://..." }]
        }
      ]
    }
  ]
}

REGLAS:
- "type" en logistics solo puede ser: "flight", "drive", "stay" o "train"
- Colores sugeridos por parte: "#2E7D32" verde, "#0277BD" azul, "#AD1457" rosa, "#F57C00" naranja
- tips, warnings y links pueden ser arrays vacíos []
- Devolveme SOLO el JSON, sin texto adicional antes ni después`}
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
                  Después de generarlo, descarga el JSON y súbelo con el botón "Cargar JSON" de arriba.
                </Typography>
              </Box>
            </Collapse>
          </Box>

        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddTripFolder(null); setAddTripError(''); setShowAiPrompt(false) }}>Cancelar</Button>
          <Button variant="contained" onClick={confirmAddTrip}>Agregar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Add Folder Dialog ── */}
      <Dialog open={addFolderOpen} onClose={() => setAddFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nuevo destino</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Stack direction="row" spacing={1}>
            <TextField label="Emoji" size="small" value={newFolderEmoji}
              onChange={e => setNewFolderEmoji(e.target.value)} sx={{ width: 80 }} />
            <TextField label="Nombre (ej: Japón)" size="small" value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)} fullWidth autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddFolderOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={confirmAddFolder} disabled={!newFolderName.trim()}>Crear</Button>
        </DialogActions>
      </Dialog>

      {isAdmin && (
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} currentUserEmail={user?.email} />
      )}
    </Box>
  )
}
