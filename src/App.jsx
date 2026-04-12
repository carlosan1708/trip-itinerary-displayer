import { useState, useEffect } from 'react'
import {
  ThemeProvider, CssBaseline, Container, Box, Typography, CircularProgress,
} from '@mui/material'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import { findTripData, saveTripData } from './utils/registry'

import theme from './theme'
import TripEditorModal      from './components/TripEditorModal'
import VersionHistoryModal  from './components/VersionHistoryModal'
import Header from './components/Header'
import PartSection from './components/PartSection'
import DayCard from './components/DayCard'
import LoginScreen from './components/LoginScreen'
import AccessDenied from './components/AccessDenied'
import Dashboard from './components/Dashboard'

const ADMIN_EMAIL     = import.meta.env.VITE_ADMIN_EMAIL
const GATEWAY_TRIP_ID = import.meta.env.VITE_TRIP_ID

function LoadingScreen() {
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
    }}>
      <CircularProgress sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }} />
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
        Cargando...
      </Typography>
    </Box>
  )
}

export default function App() {
  const [user, setUser]           = useState(undefined)
  const [allowed, setAllowed]     = useState(null)
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [itinerary, setItinerary] = useState(null)
  const [loadingTrip, setLoadingTrip] = useState(false)
  const [editMode, setEditMode]             = useState(false)
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [pdfLoading, setPdfLoading]         = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { setUser(null); setAllowed(false); return }
      setUser(currentUser)
      const email   = currentUser.email
      const userRef = doc(db, 'trips', GATEWAY_TRIP_ID, 'allowed_users', email)
      const snap    = await getDoc(userRef)
      if (!snap.exists() && email === ADMIN_EMAIL) {
        await setDoc(userRef, { email, addedAt: serverTimestamp(), addedBy: 'self' })
      } else if (!snap.exists()) { setAllowed(false); return }
      setAllowed(true)
    })
  }, [])

  async function saveSnapshot(data, source) {
    await addDoc(
      collection(db, 'trips', GATEWAY_TRIP_ID, 'versions'),
      { version: data.version ?? 0, savedAt: serverTimestamp(), savedBy: user?.email ?? '?', source, data }
    )
  }

  useEffect(() => {
    if (!selectedTripId) { setItinerary(null); return }
    async function loadTrip() {
      setLoadingTrip(true)
      const localData = findTripData(selectedTripId)
      if (selectedTripId === GATEWAY_TRIP_ID) {
        const itinRef  = doc(db, 'trips', selectedTripId, 'data', 'itinerary')
        const itinSnap = await getDoc(itinRef)
        if (itinSnap.exists()) {
          const remote = itinSnap.data()
          if ((localData?.version ?? 1) > (remote.version ?? 0)) {
            await setDoc(itinRef, localData)
            await saveSnapshot(localData, 'local_push')
            setItinerary(localData)
          } else { setItinerary(remote) }
        } else if (localData) {
          await setDoc(itinRef, localData)
          await saveSnapshot(localData, 'local_push')
          setItinerary(localData)
        }
      } else { setItinerary(localData) }
      setLoadingTrip(false)
    }
    loadTrip()
  }, [selectedTripId])

  async function handleRestoreVersion(versionData) {
    const newVersion   = (itinerary?.version ?? 0) + 1
    const restoredData = { ...versionData, version: newVersion }
    const itinRef      = doc(db, 'trips', selectedTripId, 'data', 'itinerary')
    await setDoc(itinRef, restoredData)
    await saveSnapshot(restoredData, 'restore')
    setItinerary(restoredData)
    saveTripData(selectedTripId, restoredData)
    setVersionHistoryOpen(false)
  }

  // ── Edit helpers ─────────────────────────────────────────────────
  function saveItinerary(updated) {
    setItinerary(updated)
    saveTripData(selectedTripId, updated)
  }

  function handlePartChange(partId, updatedPart) {
    saveItinerary({
      ...itinerary,
      parts: itinerary.parts.map(p => p.id === partId ? updatedPart : p),
    })
  }

  function handleDayChange(partId, dayNumber, updatedDay) {
    saveItinerary({
      ...itinerary,
      parts: itinerary.parts.map(p => {
        if (p.id !== partId) return p
        return { ...p, days: p.days.map(d => d.dayNumber === dayNumber ? updatedDay : d) }
      }),
    })
  }

  function handleJsonUpload(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      try { saveItinerary(JSON.parse(e.target.result)) } catch {}
    }
    reader.readAsText(file)
  }

  function handleJsonEditorSave(_folderId, _tripId, _meta, jsonData) {
    if (jsonData) saveItinerary(jsonData)
  }

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const { generateItinerarioPdf } = await import('./utils/generatePdf.jsx')
      await generateItinerarioPdf(itinerary)
    } finally {
      setPdfLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────
  if (user === undefined || (user && allowed === null)) return <LoadingScreen />
  if (!user) return <LoginScreen />
  if (!allowed) return <AccessDenied email={user.email} />

  const isAdmin = user.email === ADMIN_EMAIL

  if (!selectedTripId) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Dashboard user={user} isAdmin={isAdmin} onSelectTrip={id => { setEditMode(false); setSelectedTripId(id) }} />
      </ThemeProvider>
    )
  }

  if (loadingTrip || !itinerary) return <LoadingScreen />

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Header
        title={itinerary.title}
        subtitle={itinerary.subtitle}
        stats={itinerary.stats}
        user={user}
        isAdmin={isAdmin}
        editMode={editMode}
        onToggleEdit={() => setEditMode(m => !m)}
        onUploadJson={handleJsonUpload}
        onOpenJsonEditor={() => setJsonEditorOpen(true)}
        onOpenVersionHistory={isAdmin && selectedTripId === GATEWAY_TRIP_ID ? () => setVersionHistoryOpen(true) : null}
        onDownloadPdf={handleDownloadPdf}
        pdfLoading={pdfLoading}
        onBack={() => { setSelectedTripId(null); setItinerary(null); setEditMode(false) }}
      />

      {jsonEditorOpen && (
        <TripEditorModal
          open={jsonEditorOpen}
          trip={{ id: selectedTripId, label: itinerary.title }}
          folderId={null}
          onSave={handleJsonEditorSave}
          onClose={() => setJsonEditorOpen(false)}
        />
      )}

      {versionHistoryOpen && (
        <VersionHistoryModal
          open={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
          tripId={selectedTripId}
          currentVersion={itinerary.version}
          onRestore={handleRestoreVersion}
        />
      )}

      <Container maxWidth="md" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
        {itinerary.parts.map(part => (
          <Box key={part.id}>
            <PartSection
              part={part}
              editMode={editMode}
              onPartChange={updated => handlePartChange(part.id, updated)}
            />
            {part.days.map(day => (
              <DayCard
                key={day.dayNumber}
                day={day}
                partColor={part.color}
                editMode={editMode}
                onDayChange={updated => handleDayChange(part.id, day.dayNumber, updated)}
                tripId={selectedTripId}
                gatewayTripId={GATEWAY_TRIP_ID}
                user={user}
                isAdmin={isAdmin}
              />
            ))}
          </Box>
        ))}
      </Container>

      <Box component="footer" sx={{
        textAlign: 'center', py: 4,
        background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
        color: 'rgba(255,255,255,0.5)',
      }}>
        <Typography variant="body2">🍁 ¡Buen viaje! · Canadá 2026</Typography>
      </Box>
    </ThemeProvider>
  )
}
