// Mock firebase/auth — auth state is controlled via window.__mockAuth in tests

export function getAuth() {
  return { __isMock: true }
}

export function onAuthStateChanged(_auth, callback) {
  // Simulate async Firebase auth resolution
  setTimeout(() => {
    const currentUser =
      (typeof window !== 'undefined' && window.__mockAuth?.currentUser) ?? null
    callback(currentUser)
  }, 50)
  return () => {} // unsubscribe noop
}

export function signInWithPopup() {
  return Promise.resolve()
}

export function signInWithEmailAndPassword() {
  return Promise.resolve()
}

export function signOut() {
  return Promise.resolve()
}

export class GoogleAuthProvider {}
