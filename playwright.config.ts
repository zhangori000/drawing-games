import { defineConfig, devices } from '@playwright/test'

const includeMobileProjects = process.env.PLAYWRIGHT_MOBILE === '1'

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
    baseURL: 'http://127.0.0.1:3100',
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
    command:
      'pnpm --filter @drawing-games/web dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
