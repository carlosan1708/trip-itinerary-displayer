import { useState, useEffect } from 'react'
import {
  ThemeProvider, CssBaseline, Container, Box, Typography, CircularProgress,
} from '@mui/material'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
const tripModules = import.meta.glob('./data/*.json', { eager: true })
const localItinerary = tripModules[`./data/${import.meta.env.VITE_TRIP_ID}.json`]?.default
import theme from './theme'
import Header from './components/Header'
import PartSection from './components/PartSection'
import DayCard from './components/DayCard'
import LoginScreen from './components/LoginScreen'
import AccessDenied from './components/AccessDenied'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL
const TRIP_ID     = import.meta.env.VITE_TRIP_ID

function LoadingScreen() {
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
    }}>
      <CircularProgress sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }} />
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
        Verificando acceso...
      </Typography>
    </Box>
  )
}

export default function App() {
  const [user, setUser]           = useState(undefined) // undefined = verificando
  const [allowed, setAllowed]     = useState(null)      // null = aún no verificado
  const [itinerary, setItinerary] = useState(null)

  useEffect(() => {
    return onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null)
        setAllowed(false)
        return
      }

      setUser(currentUser)
      const email = currentUser.email

      // 1. Verificar si el email está en la lista de invitados del viaje
      const userRef  = doc(db, 'trips', TRIP_ID, 'allowed_users', email)
      const userSnap = await getDoc(userRef)

      // Si es el admin y es su primer acceso, se auto-agrega
      if (!userSnap.exists() && email === ADMIN_EMAIL) {
        await setDoc(userRef, { email, addedAt: serverTimestamp(), addedBy: 'self' })
      } else if (!userSnap.exists()) {
        setAllowed(false)
        return
      }

      setAllowed(true)

      // 2. Cargar el itinerario desde Firestore
      const itinRef  = doc(db, 'trips', TRIP_ID, 'data', 'itinerary')
      const itinSnap = await getDoc(itinRef)

      if (itinSnap.exists()) {
        const remote = itinSnap.data()
        // Si la versión local es más nueva, sobreescribir Firestore
        if ((localItinerary.version ?? 1) > (remote.version ?? 0)) {
          await setDoc(itinRef, localItinerary)
          setItinerary(localItinerary)
        } else {
          setItinerary(remote)
        }
      } else {
        // Primera vez: sube los datos locales a Firestore
        await setDoc(itinRef, localItinerary)
        setItinerary(localItinerary)
      }
    })
  }, [])

  // Verificando auth o permisos
  if (user === undefined || (user && allowed === null)) return <LoadingScreen />

  // No autenticado
  if (!user) return <LoginScreen />

  // Autenticado pero sin acceso
  if (!allowed) return <AccessDenied email={user.email} />

  // Autenticado + autorizado + datos listos
  if (!itinerary) return <LoadingScreen />

  const isAdmin = user.email === ADMIN_EMAIL

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Header
        title={itinerary.title}
        subtitle={itinerary.subtitle}
        stats={itinerary.stats}
        user={user}
        isAdmin={isAdmin}
      />

      <Container maxWidth="md" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
        {itinerary.parts.map(part => (
          <Box key={part.id}>
            <PartSection part={part} />
            {part.days.map(day => (
              <DayCard
                key={day.dayNumber}
                day={day}
                partColor={part.color}
              />
            ))}
          </Box>
        ))}
      </Container>

      <Box
        component="footer"
        sx={{
          textAlign: 'center', py: 4,
          background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2f4a 45%, #0c2a1a 100%)',
          color: 'rgba(255,255,255,0.5)',
        }}
      >
        <Typography variant="body2">🍁 ¡Buen viaje! · Canadá 2026</Typography>
      </Box>
    </ThemeProvider>
  )
}
