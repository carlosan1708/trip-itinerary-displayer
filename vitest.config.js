import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Dedicated Vitest config so unit tests (jsdom) stay isolated from the Vite
// build/dev config. Firebase is aliased to the same in-repo mocks the E2E
// test mode uses, so unit tests never touch the network or real SDK.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'firebase/app':       resolve(__dirname, 'src/__mocks__/firebase-app.js'),
      'firebase/auth':      resolve(__dirname, 'src/__mocks__/firebase-auth.js'),
      'firebase/firestore': resolve(__dirname, 'src/__mocks__/firebase-firestore.js'),
      'firebase/storage':   resolve(__dirname, 'src/__mocks__/firebase-storage.js'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      // A concrete origin gives jsdom a real, writable localStorage
      // (about:blank yields an opaque origin with a stubbed store).
      jsdom: { url: 'http://localhost/' },
    },
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/i18n/**'],
      reporter: ['text', 'html'],
    },
  },
})
