// S18.md: browser integration tests against the production build. webServer
// builds then serves dist with the existing `preview` script (never the dev
// server), so these flows exercise exactly what ships.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// This environment pre-installs Chromium outside the default Playwright
// cache (PLAYWRIGHT_BROWSERS_PATH); point at it explicitly so a differently
// pinned @playwright/test version never tries to download its own copy.
const CHROMIUM_EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: './tests/solo-browser',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/solo' }],
  ],
  outputDir: 'test-results/solo',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Phone-first default (MASTER_DESIGN.md's primary target device); the
    // >=900px tablet split gets its own dedicated test with an explicit
    // viewport override rather than being the baseline for every flow.
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // devices['Desktop Chrome'] carries its own 1280x720 viewport, which
        // would otherwise override the phone-first default above — restate
        // it last so it wins.
        viewport: { width: 390, height: 844 },
        launchOptions: { executablePath: CHROMIUM_EXECUTABLE },
      },
    },
  ],
});
