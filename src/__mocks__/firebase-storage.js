export function getStorage() {
  return { __isMock: true }
}

export function ref(_storage, path) {
  return { __storagePath: path, fullPath: path }
}

export function uploadBytes(ref, _file) {
  return Promise.resolve({ ref })
}

export function getDownloadURL(ref) {
  return Promise.resolve(`mock-storage-url:${ref.__storagePath}`)
}

export function deleteObject(_ref) {
  return Promise.resolve()
}
