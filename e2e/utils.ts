import { Page, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────
// Shared E2E Utilities for Smarter.Poker World Hub
// ─────────────────────────────────────────────────────────

/**
 * Wait for page to fully load (network idle)
 */
export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to a hub route and wait for load
 */
export async function navigateToHub(page: Page, path: string) {
  await page.goto(`/hub/${path}`);
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Check that a page loads without crashing (no 500 errors)
 */
export async function expectPageLoads(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.status()).toBeLessThan(500);
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Expect page body to contain specific text
 */
export async function expectPageContains(page: Page, text: string | RegExp) {
  await expect(page.locator('body')).toContainText(text);
}

/**
 * Check that no console errors occurred during page load
 */
export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

/**
 * Login with test credentials via the UI
 */
export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(hub|home)/, { timeout: 15000 });
}

/**
 * Check API health endpoint
 */
export async function checkAPIHealth(page: Page, endpoint: string): Promise<number> {
  const response = await page.request.get(endpoint);
  return response.status();
}
