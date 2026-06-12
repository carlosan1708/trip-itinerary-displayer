// Playwright config dedicated to recording showcase videos (not tests).
// Videos are written to scripts/.demo-videos/, then converted to GIFs.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'record-demos.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '.demo-videos',
  timeout: 120_000,

  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    ...devices['Desktop Chrome'],
  },

  webServer: process.env.E2E_REUSE_SERVER ? undefined : {
    command: 'npm run dev:test',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
