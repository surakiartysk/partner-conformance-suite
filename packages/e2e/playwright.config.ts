import { defineConfig } from '@playwright/test'

const port = process.env.E2E_PORT ?? '8791'

/**
 * One worker, one browser, in order: the tests walk a visitor's path through one
 * session, and a session start is limited to five an hour for one address, so
 * they must not each make their own.
 *
 * The browser is the Chrome that is installed (`channel: 'chrome'`) rather than a
 * download: the runners GitHub gives have it, and so does a laptop.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `http://localhost:${port}/api/cases`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { E2E_PORT: port },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
