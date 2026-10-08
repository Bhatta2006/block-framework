import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: `node dist/bin.js --port 5199 --project ../../.builder-cache/e2e-${Date.now()}.blockfw.json`,
    url: 'http://127.0.0.1:5199/api/project',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
