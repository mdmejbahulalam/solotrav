import { defineConfig } from '@playwright/test';

/**
 * Browser smoke tests for the public web pages and the sign-in guards. They use the Chrome already installed on the
 * machine (no browser download) and build and start the web and admin apps on their own ports (production mode, like deployment).
 * Authenticated journeys need a Supabase test project and are covered at the data layer (supabase/tests).
 */
const WEB = 3200;
const ADMIN = 3201;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 1,
  reporter: [['list']],
  use: { channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'web-desktop', use: { baseURL: `http://localhost:${WEB}`, viewport: { width: 1280, height: 900 } }, testMatch: /web\..*\.spec\.ts/ },
    { name: 'web-phone', use: { baseURL: `http://localhost:${WEB}`, viewport: { width: 390, height: 844 }, isMobile: true }, testMatch: /web\..*\.spec\.ts/ },
    { name: 'admin', use: { baseURL: `http://localhost:${ADMIN}`, viewport: { width: 1280, height: 900 } }, testMatch: /admin\..*\.spec\.ts/ },
  ],
  webServer: [
    { command: `npm run build -w @solotrav/web && npm run start -w @solotrav/web -- --port ${WEB}`, url: `http://localhost:${WEB}`, reuseExistingServer: true, timeout: 420_000 },
    { command: `npm run build -w @solotrav/admin && npm run start -w @solotrav/admin -- --port ${ADMIN}`, url: `http://localhost:${ADMIN}/login`, reuseExistingServer: true, timeout: 420_000 },
  ],
});

