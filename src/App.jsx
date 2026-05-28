import { useState, useEffect, useCallback } from 'react'
import {
  ThemeProvider, CssBaseline, Container, Box, Typography, CircularProgress,
} from '@mui/material'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import { findTripData, saveTripData, getRegistry, saveRegistry } from './utils/registry'

import theme from './theme'
import { I18nProvider, useT } from './i18n'
import ItineraryAgent       from './components/ItineraryAgent'
import TripEditorModal      from './components/TripEditorModal'
import VersionHistoryModal  from './components/VersionHistoryModal'
import Header from './components/Header'
import AllFilesPanel from './components/AllFilesPanel'
import PartSection from './components/PartSection'
import DayCard from './components/DayCard'
import LoginScreen from './components/LoginScreen'
import AccessDenied from './components/AccessDenied'
import Dashboard from './components/Dashboard'

const GATEWAY_TRIP_ID = import.meta.env.VITE_TRIP_ID

function LoadingScreen() {
  const t = useT()
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
    }}>
      <CircularProgress sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }} />
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
        {t('loading')}
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
  const [agentOpen, setAgentOpen]           = useState(false)
  const [agentTargetFolderId, setAgentTargetFolderId] = useState(null)
  const [language, setLanguage]             = useState(() => {
    const stored = localStorage.getItem('lang')
    return stored === 'en' || stored === 'es' ? stored : 'en'
  })

  const handleLangChange = useCallback((newLang) => {
    if (newLang !== 'en' && newLang !== 'es') return
    localStorage.setItem('lang', newLang)
    setLanguage(newLang)
  }, [])

  // ── Auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { setUser(null); setAllowed(false); return }

      try {
        const token = await currentUser.getIdToken()
        await fetch('/auth/set-admin-claim', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        await currentUser.getIdToken(true)
      } catch {
        // Non-fatal — admin claim just won't be set if backend is unreachable
      }

      const tokenResult = await currentUser.getIdTokenResult()
      const isAdminUser = tokenResult.claims.admin === true
      const email       = currentUser.email

      setUser({ ...currentUser, isAdmin: isAdminUser })

      const userRef = doc(db, 'trips', GATEWAY_TRIP_ID, 'allowed_users', email)
      const snap    = await getDoc(userRef)
      if (!snap.exists() && isAdminUser) {
        await setDoc(userRef, { email, addedAt: serverTimestamp(), addedBy: 'self' })
      } else if (!snap.exists()) { setAllowed(false); return }
      setAllowed(true)

      // Language resolution: localStorage > user-assigned > app default
      if (!localStorage.getItem('lang')) {
        const assignedLang = snap.exists() ? snap.data()?.language : null
        if (assignedLang === 'en' || assignedLang === 'es') {
          setLanguage(assignedLang)
        } else {
          try {
            const configSnap = await getDoc(doc(db, 'app-settings', 'config'))
            const defaultLang = configSnap.data()?.defaultLanguage
            if (defaultLang === 'en' || defaultLang === 'es') setLanguage(defaultLang)
          } catch { /* non-fatal */ }
        }
      }
    })
  }, [])

  async function saveSnapshot(tripId, data, source) {
    await addDoc(
      collection(db, 'trips', tripId, 'versions'),
      { version: data.version ?? 0, savedAt: serverTimestamp(), savedBy: user?.email ?? '?', source, data }
    )
  }

  useEffect(() => {
    if (!selectedTripId) { setItinerary(null); return }
    async function loadTrip() {
      setLoadingTrip(true)
      const localData = await findTripData(selectedTripId)
      const itinRef   = doc(db, 'trips', selectedTripId, 'data', 'itinerary')
      try {
        const itinSnap = await getDoc(itinRef)
        if (itinSnap.exists()) {
          const remote = itinSnap.data()
          if ((localData?.version ?? -1) > (remote.version ?? 0)) {
            await setDoc(itinRef, localData)
            await saveSnapshot(selectedTripId, localData, 'local_push')
            setItinerary(localData)
          } else {
            setItinerary(remote)
            saveTripData(selectedTripId, remote)
          }
        } else if (localData) {
          await setDoc(itinRef, localData)
          await saveSnapshot(selectedTripId, localData, 'local_push')
          setItinerary(localData)
        }
      } catch (err) {
        console.warn('[sync] Firestore unavailable, using local data:', err.message)
        if (localData) setItinerary(localData)
      }
      setLoadingTrip(false)
    }
    loadTrip()
  }, [selectedTripId])

  async function handleRestoreVersion(versionData) {
    const newVersion   = (itinerary?.version ?? 0) + 1
    const restoredData = { ...versionData, version: newVersion }
    const itinRef      = doc(db, 'trips', selectedTripId, 'data', 'itinerary')
    await setDoc(itinRef, restoredData)
    await saveSnapshot(selectedTripId, restoredData, 'restore')
    setItinerary(restoredData)
    saveTripData(selectedTripId, restoredData)
    setVersionHistoryOpen(false)
  }

  async function handleToggleEdit() {
    if (editMode && canEdit) {
      const updated = { ...itinerary, version: (itinerary.version ?? 0) + 1 }
      setItinerary(updated)
      saveTripData(selectedTripId, updated)
      syncRegistryLabel(selectedTripId, updated.title)
      setDoc(doc(db, 'trips', selectedTripId, 'data', 'itinerary'), updated)
        .then(() => saveSnapshot(selectedTripId, updated, 'author_edit'))
        .catch(err => console.warn('[sync] Could not save:', err.message))
    }
    setEditMode(m => !m)
  }

  function saveItinerary(updated) {
    setItinerary(updated)
    saveTripData(selectedTripId, updated)
    setDoc(doc(db, 'trips', selectedTripId, 'data', 'itinerary'), updated).catch(err =>
      console.warn('[sync] Could not save to Firestore:', err.message)
    )
  }

  function syncRegistryLabel(tripId, newTitle) {
    if (!newTitle) return
    const reg = getRegistry()
    let changed = false
    for (const folder of reg) {
      const trip = folder.trips?.find(t => t.id === tripId)
      if (trip && trip.label !== newTitle) {
        trip.label = newTitle
        changed = true
        break
      }
    }
    if (changed) {
      saveRegistry(reg)
      setDoc(doc(db, 'trips', GATEWAY_TRIP_ID, 'registry', 'main'), { folders: reg })
        .catch(err => console.warn('[sync] Could not update registry in Firestore:', err.message))
    }
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
      try {
        const parsed = JSON.parse(e.target.result)
        saveItinerary(parsed)
        syncRegistryLabel(selectedTripId, parsed.title)
      } catch {}
    }
    reader.readAsText(file)
  }

  function handleJsonEditorSave(_folderId, _tripId, meta, jsonData) {
    if (jsonData) {
      const syncedData = meta?.label ? { ...jsonData, title: meta.label } : jsonData
      saveItinerary(syncedData)
      syncRegistryLabel(selectedTripId, syncedData.title)
    }
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

  async function handleAgentEdit(updatedItinerary, { source } = {}) {
    saveItinerary(updatedItinerary)
    await saveSnapshot(selectedTripId, updatedItinerary, source || 'agent_edit')
  }

  async function handleAgentDuplicate(newTripId, duplicateItinerary) {
    saveTripData(newTripId, duplicateItinerary)
    const itinRef = doc(db, 'trips', newTripId, 'data', 'itinerary')
    try { await setDoc(itinRef, duplicateItinerary) } catch (err) {
      console.warn('[agent] Could not save duplicate to Firestore:', err.message)
    }
    const { getRegistry, saveRegistry } = await import('./utils/registry')
    const reg = getRegistry()
    const newTripEntry = {
      id: newTripId,
      label: duplicateItinerary.label,
      duration: duplicateItinerary.stats?.[0] || '',
      dates: duplicateItinerary.subtitle || '',
      subtitle: '',
      author: user.email,
    }

    let placed = false
    if (agentTargetFolderId) {
      const target = reg.find(f => f.id === agentTargetFolderId)
      if (target) {
        target.trips = target.trips || []
        target.trips.push(newTripEntry)
        placed = true
      }
      setAgentTargetFolderId(null)
    }
    if (!placed) {
      for (const folder of reg) {
        const original = folder.trips?.find(t => t.id === selectedTripId)
        if (original) {
          folder.trips = folder.trips || []
          folder.trips.push({ ...newTripEntry, subtitle: original.subtitle || '' })
          placed = true
          break
        }
      }
    }
    saveRegistry(reg)
    setDoc(doc(db, 'trips', GATEWAY_TRIP_ID, 'registry', 'main'), { folders: reg })
      .catch(err => console.warn('[sync] Could not save registry to Firestore:', err.message))
  }

  function handleBuildWithAi(folderId) {
    setAgentTargetFolderId(folderId || null)
    queueMicrotask(() => {
      document.querySelector('[data-testid="agent-fab"]')?.click()
    })
  }

  // ── Render ───────────────────────────────────────────────────────
  const isAdmin = user?.isAdmin === true
  const canEdit = !!itinerary?.author && user?.email === itinerary.author

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <I18nProvider lang={language} onLangChange={handleLangChange}>
        <AppContent
          user={user}
          allowed={allowed}
          isAdmin={isAdmin}
          canEdit={canEdit}
          selectedTripId={selectedTripId}
          setSelectedTripId={setSelectedTripId}
          itinerary={itinerary}
          loadingTrip={loadingTrip}
          editMode={editMode}
          jsonEditorOpen={jsonEditorOpen}
          setJsonEditorOpen={setJsonEditorOpen}
          versionHistoryOpen={versionHistoryOpen}
          setVersionHistoryOpen={setVersionHistoryOpen}
          pdfLoading={pdfLoading}
          agentOpen={agentOpen}
          setAgentOpen={setAgentOpen}
          language={language}
          onToggleEdit={canEdit ? handleToggleEdit : null}
          onUploadJson={canEdit ? handleJsonUpload : null}
          onOpenJsonEditor={canEdit ? () => setJsonEditorOpen(true) : null}
          onOpenVersionHistory={canEdit ? () => setVersionHistoryOpen(true) : null}
          onDownloadPdf={handleDownloadPdf}
          onRestoreVersion={handleRestoreVersion}
          onJsonEditorSave={handleJsonEditorSave}
          onPartChange={handlePartChange}
          onDayChange={handleDayChange}
          onAgentEdit={handleAgentEdit}
          onAgentDuplicate={handleAgentDuplicate}
          onBuildWithAi={handleBuildWithAi}
          onBack={() => { setSelectedTripId(null); setItinerary(null); setEditMode(false) }}
          setEditMode={setEditMode}
        />
      </I18nProvider>
    </ThemeProvider>
  )
}

function AppContent({
  user, allowed, isAdmin, canEdit,
  selectedTripId, setSelectedTripId,
  itinerary, loadingTrip, editMode, setEditMode,
  jsonEditorOpen, setJsonEditorOpen,
  versionHistoryOpen, setVersionHistoryOpen,
  pdfLoading, agentOpen, setAgentOpen,
  language,
  onToggleEdit, onUploadJson, onOpenJsonEditor, onOpenVersionHistory,
  onDownloadPdf, onRestoreVersion, onJsonEditorSave,
  onPartChange, onDayChange, onAgentEdit, onAgentDuplicate, onBack,
  onBuildWithAi,
}) {
  const t = useT()
  const [filesPanelOpen, setFilesPanelOpen] = useState(false)

  if (user === undefined || (user && allowed === null)) return <LoadingScreen />
  if (!user) return <LoginScreen />
  if (!allowed) return <AccessDenied email={user.email} />

  if (!selectedTripId) {
    return (
      <>
        <Dashboard
          user={user}
          isAdmin={isAdmin}
          onSelectTrip={id => { setEditMode(false); setSelectedTripId(id) }}
          onBuildWithAi={onBuildWithAi}
        />
        <ItineraryAgent
          itinerary={null}
          user={user}
          canEdit={false}
          onDuplicateCreated={onAgentDuplicate}
          language={language}
        />
      </>
    )
  }

  if (loadingTrip || !itinerary) return <LoadingScreen />

  return (
    <>
      <Header
        title={itinerary.title}
        subtitle={itinerary.subtitle}
        stats={itinerary.stats}
        user={user}
        isAdmin={isAdmin}
        author={itinerary.author}
        editMode={editMode}
        onToggleEdit={canEdit ? onToggleEdit : null}
        onUploadJson={canEdit ? onUploadJson : null}
        onOpenJsonEditor={canEdit ? onOpenJsonEditor : null}
        onOpenVersionHistory={canEdit ? onOpenVersionHistory : null}
        onDownloadPdf={onDownloadPdf}
        pdfLoading={pdfLoading}
        onOpenFiles={() => setFilesPanelOpen(true)}
        onBack={onBack}
      />

      <AllFilesPanel
        open={filesPanelOpen}
        onClose={() => setFilesPanelOpen(false)}
        tripId={selectedTripId}
        gatewayTripId={GATEWAY_TRIP_ID}
        itinerary={itinerary}
      />

      {jsonEditorOpen && (
        <TripEditorModal
          open={jsonEditorOpen}
          trip={{ id: selectedTripId, label: itinerary.title }}
          initialJson={itinerary}
          folderId={null}
          onSave={onJsonEditorSave}
          onClose={() => setJsonEditorOpen(false)}
        />
      )}

      {versionHistoryOpen && (
        <VersionHistoryModal
          open={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
          tripId={selectedTripId}
          currentVersion={itinerary.version}
          onRestore={onRestoreVersion}
        />
      )}

      <Container maxWidth="md" sx={{
        py: 4, px: { xs: 2, sm: 3 },
        transition: 'padding-right 0.3s ease',
        pr: agentOpen ? { xs: 2, sm: 3, md: '440px' } : { xs: 2, sm: 3 },
      }}>
        {itinerary.parts.map(part => (
          <Box key={part.id}>
            <PartSection
              part={part}
              editMode={editMode}
              onPartChange={updated => onPartChange(part.id, updated)}
            />
            {part.days.map(day => (
              <DayCard
                key={day.dayNumber}
                day={day}
                partColor={part.color}
                editMode={editMode}
                onDayChange={updated => onDayChange(part.id, day.dayNumber, updated)}
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
        <Typography variant="body2">{t('footer')}</Typography>
      </Box>

      <ItineraryAgent
        itinerary={itinerary}
        user={user}
        canEdit={canEdit}
        onItineraryChange={onAgentEdit}
        onDuplicateCreated={onAgentDuplicate}
        open={agentOpen}
        onOpenChange={setAgentOpen}
        language={language}
      />
    </>
  )
}
