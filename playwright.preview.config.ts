// ─────────────────────────────────────────────────────────────────────────
// Playwright config — Preview-deploy gate variant
// ─────────────────────────────────────────────────────────────────────────
// Same shape as playwright.config.ts but baseURL comes from the
// PREVIEW_URL env var (set by the GitHub Action). Only runs the
// signup-real spec; the rest of the e2e suite runs in the separate
// e2e-tests.yml workflow against production.
// ─────────────────────────────────────────────────────────────────────────
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    testMatch: /signup-real\.spec\.ts/,
    fullyParallel: false, // serialize so probe rate-limit can't hit us
    forbidOnly: !!process.env.CI,
    retries: 1,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-preview' }]],
    timeout: 60_000,
    use: {
        baseURL: process.env.PREVIEW_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        // Pass the Vercel deployment-protection bypass header on every
        // Playwright request so the runner can reach protected preview URLs.
        // The header is a no-op on production and local (env var is empty).
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
            ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } }
            : {}),
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
});
