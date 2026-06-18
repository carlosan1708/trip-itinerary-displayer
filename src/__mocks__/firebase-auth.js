// Mock firebase/auth — auth state is controlled via window.__mockAuth in tests

const _listeners = new Set()

function _notify() {
  const currentUser =
    (typeof window !== 'undefined' && window.__mockAuth?.currentUser) ?? null
  for (const cb of _listeners) cb(currentUser)
}

export function getAuth() {
  return {
    __isMock: true,
    get currentUser() {
      return (typeof window !== 'undefined' && window.__mockAuth?.currentUser) ?? null
    },
  }
}

export function onAuthStateChanged(_auth, callback) {
  _listeners.add(callback)
  // Simulate async Firebase auth resolution for the initial state
  setTimeout(() => {
    const currentUser =
      (typeof window !== 'undefined' && window.__mockAuth?.currentUser) ?? null
    callback(currentUser)
  }, 50)
  return () => { _listeners.delete(callback) }
}

export function signInWithPopup() {
  return Promise.resolve()
}

export function signInWithEmailAndPassword() {
  return Promise.resolve()
}

export function signInAnonymously() {
  // Tests provide the anon user via window.__mockAnonUser. Signing in sets it
  // as the current user and re-fires onAuthStateChanged listeners so the app
  // transitions from LoginScreen → demo dashboard, mirroring real Firebase.
  const user =
    (typeof window !== 'undefined' && window.__mockAnonUser) ?? {
      uid: 'demo-test-uid',
      email: null,
      isAnonymous: true,
      getIdToken: () => Promise.resolve('mock-anon-token'),
      getIdTokenResult: () => Promise.resolve({ claims: {} }),
    }
  if (typeof window !== 'undefined') {
    window.__mockAuth = { ...(window.__mockAuth || {}), currentUser: user }
    _notify()
  }
  return Promise.resolve({ user })
}

export function signOut() {
  if (typeof window !== 'undefined') {
    window.__mockAuth = { ...(window.__mockAuth || {}), currentUser: null }
    _notify()
  }
  return Promise.resolve()
}

export function deleteUser() {
  // Demo cleanup path: deleting the anonymous user clears the session, same
  // observable effect as signOut for the app.
  if (typeof window !== 'undefined') {
    window.__mockAuth = { ...(window.__mockAuth || {}), currentUser: null }
    _notify()
  }
  return Promise.resolve()
}

export function setPersistence() {
  return Promise.resolve()
}

export const browserSessionPersistence = { type: 'SESSION' }

export class GoogleAuthProvider {}
