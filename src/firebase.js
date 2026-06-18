import { initializeApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInAnonymously, signOut, deleteUser,
  setPersistence, browserSessionPersistence,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
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

// Sign out, with demo cleanup. For an anonymous (demo) user we DELETE the
// account so the next visit starts fresh with a brand-new uid — no carried-
// over demo trips or AI quota. Their demo trips/quota are keyed on the uid,
// so a new uid means a clean slate. Falls back to a plain signOut if delete
// isn't possible (e.g. token already gone).
export async function signOutWithCleanup() {
  const current = auth.currentUser
  if (current?.isAnonymous) {
    try {
      await deleteUser(current)   // also ends the session
      return
    } catch {
      // fall through to signOut
    }
  }
  await signOut(auth)
}
