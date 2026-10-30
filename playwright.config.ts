import { defineConfig, devices } from '@playwright/test'

/** Port of the dev server the suite starts (other local tools use 1420 and 5191-5198); E2E_PORT overrides it. */
const PORT = Number(process.env.E2E_PORT) || 5199
const CI = !!process.env.CI

/**
 * End-to-end journeys against the browser build (web platform: IndexedDB
 * storage, <input type=file> pickers, exports downloaded as a zip) in WebKit,
 * the engine of the macOS desktop app (WKWebView).
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: CI ? 2 : 4,
  forbidOnly: CI,
  // A test that only passes on its retry is reported as flaky, never hidden.
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Instant scrolling and no transitions: the stage scrolls a chosen slide into view without animating.
    reducedMotion: 'reduce',
    acceptDownloads: true,
  },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // The app's config without HMR (e2e/vite.e2e.config.ts): edits to src/ cannot reload a page mid-test.
    command: `npx vite --config e2e/vite.e2e.config.ts --port ${PORT} --strictPort`,
    env: { WAJHA_PORT: String(PORT) },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
})
