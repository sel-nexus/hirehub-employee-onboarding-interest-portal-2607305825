/** Configure single-worker desktop and mobile journeys against a real Vite server. */
import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

const env = { ...loadEnv('test', process.cwd(), ''), ...process.env };
const host = env.HOST || 'localhost';
const port = Number(env.PORT || 4173);
const baseURL = env.BASE_URL || `http://${host}:${port}`;

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  fullyParallel: false,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host ${host} --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
