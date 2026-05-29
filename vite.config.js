import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      '/agent': 'http://localhost:8000',
      '/auth':  'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
    // Firebase Auth signInWithPopup polls popup.closed; strict COOP
    // blocks that and prints noisy warnings. Allow same-origin popup access.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  ...(mode !== 'test' && {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/@mui') ||
              id.includes('node_modules/@emotion')
            ) return 'vendor-ui'
            if (id.includes('node_modules/firebase')) return 'vendor-firebase'
          },
        },
      },
    },
  }),
  ...(mode === 'test' && {
    resolve: {
      alias: {
        'firebase/app':       resolve(__dirname, 'src/__mocks__/firebase-app.js'),
        'firebase/auth':      resolve(__dirname, 'src/__mocks__/firebase-auth.js'),
        'firebase/firestore': resolve(__dirname, 'src/__mocks__/firebase-firestore.js'),
        'firebase/storage':   resolve(__dirname, 'src/__mocks__/firebase-storage.js'),
      },
    },
  }),
}))
