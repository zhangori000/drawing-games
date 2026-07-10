import { defineConfig, devices } from '@playwright/test'

const includeMobileProjects = process.env.PLAYWRIGHT_MOBILE === '1'
const requestedPort = Number(process.env.PLAYWRIGHT_PORT ?? 3100)

if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 1 ||
  requestedPort > 65535
) {
  throw new Error('PLAYWRIGHT_PORT must be an integer between 1 and 65535')
}

const baseURL = `http://127.0.0.1:${requestedPort}`

const mobileProjects = [
  {
    name: 'mobile-chromium',
    testMatch: /.*\.mobile\.spec\.ts/,
    use: { ...devices['Pixel 7'] },
  },
  {
    name: 'mobile-webkit',
    testMatch: /.*\.mobile\.spec\.ts/,
    use: { ...devices['iPhone 13'] },
  },
]

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /.*\.mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...(includeMobileProjects ? mobileProjects : []),
  ],
  webServer: {
    command: `pnpm --filter @drawing-games/web dev --hostname 127.0.0.1 --port ${requestedPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
