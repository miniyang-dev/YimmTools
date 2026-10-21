import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 8932)
const backend = fileURLToPath(new URL('../backend', import.meta.url))
const python =
  process.platform === 'win32'
    ? join(backend, '.venv', 'Scripts', 'python.exe')
    : join(backend, '.venv', 'bin', 'python')

/**
 * End-to-end tests run against the production build served by FastAPI (`npm run e2e` builds first).
 * Browser: the system Chrome by default (no download); set E2E_CHANNEL=msedge, or E2E_CHANNEL= (empty)
 * to use Playwright's own bundled Chromium after `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.E2E_CHANNEL === undefined ? 'chrome' : process.env.E2E_CHANNEL || undefined,
    locale: 'en-US',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'light',
    viewport: { width: 1280, height: 860 },
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port ${PORT}`,
    cwd: backend,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
