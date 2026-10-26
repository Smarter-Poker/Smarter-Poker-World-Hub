import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    testMatch: 'daily-digest-layout.spec.ts',
    timeout: 15000,
    retries: 0,
    workers: 2,
    reporter: 'line',
    outputDir: 'test-results/digest-layout',
    use: { screenshot: 'only-on-failure' },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'webkit', use: { browserName: 'webkit' } },
    ],
});
