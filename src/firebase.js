import { initializeApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInAnonymously, signOut, deleteUser,
  setPersistence, browserSessionPersistence,
} from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
export const db       = getFirestore(app)
export const storage  = getStorage(app)
export const googleProvider = new GoogleAuthProvider()

// Demo mode: sign in as an anonymous Firebase user (called only after a
// reCAPTCHA Enterprise assessment is verified server-side at /demo/start).
// Uses SESSION persistence so the demo identity is scoped to the tab — closing
// or "exiting" the tab clears it, and a fresh visit starts a brand-new demo.
export async function signInAnonymouslyDemo() {
  await setPersistence(auth, browserSessionPersistence)
  return signInAnonymously(auth)
}

const DEMO_GATEWAY_ID = import.meta.env.VITE_DEMO_TRIP_ID || 'demo-gateway'

// Which registry entries belong to a demo user's own session. Demo-created trips
// are authored `demo:{uid}` and have a `demo-{uid}-` id, so this targets exactly
// that user's trips and nothing else (never the shared sample or others' trips).
// Pure — unit-tested in firebase.demoCleanup.test.js.
export function ownDemoTrips(trips, uid) {
  if (!uid) return []
  return (trips || []).filter(
    t => t?.author === `demo:${uid}` || String(t?.id).startsWith(`demo-${uid}-`)
  )
}

// Delete every trip a demo user created this session — the itinerary doc plus
// its registry entry — so the shared demo namespace doesn't accumulate orphaned
// trips. Best-effort: failures are swallowed so sign-out never blocks on cleanup.
async function cleanupDemoTrips(uid) {
  if (!uid) return
  const registryRef = doc(db, 'trips', DEMO_GATEWAY_ID, 'registry', 'main')
  try {
    const snap = await getDoc(registryRef)
    const trips = snap.exists() ? (snap.data().trips || []) : []
    const mine = ownDemoTrips(trips, uid)
    if (mine.length === 0) return

    await Promise.allSettled(
      mine.map(t => deleteDoc(doc(db, 'trips', t.id, 'data', 'itinerary')))
    )
    const remaining = trips.filter(t => !mine.includes(t))
    await setDoc(registryRef, { trips: remaining })
  } catch {
    // best-effort; don't block sign-out
  }
}

// Sign out, with demo cleanup. For an anonymous (demo) user we first delete the
// trips they created this session (so the shared demo namespace stays clean),
// then DELETE the account so the next visit starts fresh with a brand-new uid —
// no carried-over identity or AI quota. Falls back to a plain signOut if delete
// isn't possible (e.g. token already gone).
export async function signOutWithCleanup() {
  const current = auth.currentUser
  if (current?.isAnonymous) {
    await cleanupDemoTrips(current.uid)   // remove this session's demo trips first
    try {
      await deleteUser(current)   // also ends the session
      return
    } catch {
      // fall through to signOut
    }
  }
  await signOut(auth)
}
