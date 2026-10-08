import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Use the sandbox's system Chromium; the Playwright-managed
        // download did not land a usable binary here. NOTE: this build
        // blocks all loopback access via Local Network Access enforcement
        // that command-line flags cannot disable in this sandbox, so the
        // chromium project is expected to fail here; firefox is the
        // working browser for E2E.
        launchOptions: {
          executablePath: '/opt/meta-chromium/chrome',
          // The sandbox's network makes Chromium 152 treat 127.0.0.1 as a
          // protected local-network target; disable the check for tests.
          args: [
            '--disable-features=LocalNetworkAccessChecks',
            '--no-proxy-server',
            '--proxy-bypass-list=127.0.0.1,localhost',
            '--disable-web-security',
            '--allow-insecure-localhost',
          ],
        },
      },
    },
  ],
});
