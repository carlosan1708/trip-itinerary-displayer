import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom's built-in localStorage can be an incomplete stub in this environment,
// so install a small, spec-faithful in-memory implementation on both window
// and globalThis. Tests rely on get/set/remove/clear behaving like the browser.
class MemoryStorage {
  #store = new Map()
  get length() { return this.#store.size }
  getItem(key) { return this.#store.has(key) ? this.#store.get(key) : null }
  setItem(key, value) { this.#store.set(String(key), String(value)) }
  removeItem(key) { this.#store.delete(key) }
  clear() { this.#store.clear() }
  key(i) { return [...this.#store.keys()][i] ?? null }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
}

beforeEach(() => {
  storage.clear()
})

// Unmount React trees and reset storage between tests so state never leaks.
afterEach(() => {
  cleanup()
  storage.clear()
})
