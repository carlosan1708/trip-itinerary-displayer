// Mock firebase/firestore — document data is controlled via window.__mockFirestore.docs
// Keys are slash-joined path segments, e.g. 'trips/canada-trip/allowed_users/user@test.com'

export function getFirestore() {
  return { __isMock: true }
}

export function doc(_db, ...pathParts) {
  return { __mockPath: pathParts.join('/') }
}

export function collection(_db, ...pathParts) {
  return { __mockPath: pathParts.join('/'), __isCollection: true }
}

export function serverTimestamp() {
  return new Date().toISOString()
}

export function getDoc(ref) {
  const docs =
    (typeof window !== 'undefined' && window.__mockFirestore?.docs) || {}
  const data = docs[ref.__mockPath]
  return Promise.resolve({
    exists: () => data !== undefined && data !== null,
    data: () => data ?? {},
  })
}

export function getDocs(_ref) {
  return Promise.resolve({ forEach: () => {}, docs: [] })
}

export function setDoc(ref, data) {
  if (typeof window !== 'undefined') {
    if (!window.__mockFirestore) window.__mockFirestore = {}
    if (!window.__mockFirestore.docs) window.__mockFirestore.docs = {}
    window.__mockFirestore.docs[ref.__mockPath] = data
  }
  return Promise.resolve()
}

export function addDoc(_collRef, _data) {
  return Promise.resolve({ id: 'mock-id-' + Date.now() })
}

export function deleteDoc(_ref) {
  return Promise.resolve()
}

export function updateDoc(_ref, _data) {
  return Promise.resolve()
}

export function query(ref, ..._constraints) {
  return ref
}

export function where(_field, _op, _value) {
  return { __isConstraint: true }
}

export function orderBy(_field, _dir) {
  return { __isConstraint: true }
}

export function onSnapshot(_ref, callback) {
  const store = (typeof window !== 'undefined' && window.__mockFirestore) || {}
  const data = (store.docs || {})[_ref.__mockPath]

  if (_ref.__isCollection) {
    const collDocs = (store.collections || {})[_ref.__mockPath] || []
    setTimeout(() => {
      callback({
        exists: () => false,
        data: () => ({}),
        docs: collDocs.map((d, i) => ({ id: d.id ?? `mock-${i}`, data: () => d })),
        forEach: () => {},
      })
    }, 0)
  } else {
    setTimeout(() => {
      callback({
        exists: () => data !== undefined && data !== null,
        data: () => data ?? {},
        docs: [],
        forEach: () => {},
      })
    }, 0)
  }
  return () => {} // unsubscribe noop
}
