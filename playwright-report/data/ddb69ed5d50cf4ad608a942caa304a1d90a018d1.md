# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 017-mlb-analytics.spec.ts >> MLB Analytics Hub >> Main Dashboard renders and navigates to Best Bets
- Location: e2e/017-mlb-analytics.spec.ts:8:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h1').filter({ hasText: 'MLB' })
Expected: visible
Error: strict mode violation: locator('h1').filter({ hasText: 'MLB' }) resolved to 2 elements:
    1) <h1 class="text-2xl font-black tracking-widest uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">…</h1> aka getByRole('heading', { name: 'MLB Analytics Vault' })
    2) <h1 class="text-3xl font-black tracking-[0.2em] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] text-center font-['Orbitron',sans-serif]">…</h1> aka locator('main').filter({ hasText: 'System SyncMLB Analytics' }).locator('h1')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('h1').filter({ hasText: 'MLB' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - link "Back to Hub" [ref=e4] [cursor=pointer]:
      - /url: https://smarter.poker/hub
      - img "Hub" [ref=e5]
    - img "Smarter.Poker" [ref=e7]
    - generic [ref=e8]:
      - link "Diamonds" [ref=e9] [cursor=pointer]:
        - /url: https://smarter.poker/hub/diamond-store
        - img "Diamonds" [ref=e10]
      - link "My Profile" [ref=e11] [cursor=pointer]:
        - /url: https://smarter.poker/hub
        - text: "?"
      - link "Messages" [ref=e12] [cursor=pointer]:
        - /url: https://smarter.poker/hub/messenger
        - img "Messages" [ref=e13]
      - link "Notifications" [ref=e14] [cursor=pointer]:
        - /url: https://smarter.poker/hub/notifications
        - img "Notifications" [ref=e15]
      - link "Settings" [ref=e16] [cursor=pointer]:
        - /url: https://smarter.poker/hub/settings
        - img "Settings" [ref=e17]
      - link "Help" [ref=e18] [cursor=pointer]:
        - /url: https://smarter.poker/hub/help
        - img "Help" [ref=e19]
  - navigation [ref=e20]:
    - generic [ref=e21]:
      - generic [ref=e22]: MLB⚡
      - link "Today" [ref=e23] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS
      - link "Best Bets" [ref=e24] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/best-bets
      - link "Props" [ref=e25] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/props
      - link "Tracker" [ref=e26] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/tracker
      - link "Standings" [ref=e27] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/standings
      - link "Teams" [ref=e28] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/teams
      - link "Players" [ref=e29] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/players
      - link "Model" [ref=e30] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/model
      - link "Portfolio" [ref=e31] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/portfolio
      - link "Accuracy" [ref=e32] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/accuracy
      - link "HR Tracker" [ref=e33] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/hr-tracker
      - link "Status" [ref=e34] [cursor=pointer]:
        - /url: /hub/MLB-ANALYTICS/status
  - main [ref=e35]:
    - heading "MLB Analytics Vault" [level=1] [ref=e37]
  - alert [ref=e187]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('MLB Analytics Hub', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/hub/MLB-ANALYTICS');
  6  |   });
  7  | 
  8  |   test('Main Dashboard renders and navigates to Best Bets', async ({ page }) => {
  9  |     // Check main title
> 10 |     await expect(page.locator('h1').filter({ hasText: 'MLB' })).toBeVisible();
     |                                                                 ^ Error: expect(locator).toBeVisible() failed
  11 | 
  12 |     // Click on Best Bets navigation link/card
  13 |     const bestBetsLink = page.locator('a', { hasText: 'BEST BETS' }).first();
  14 |     await bestBetsLink.click();
  15 | 
  16 |     // Ensure we reached the page
  17 |     await expect(page.url()).toContain('/hub/MLB-ANALYTICS/best-bets');
  18 |     // We should hit the gate or the page title
  19 |     await expect(page.locator('h1')).toBeVisible();
  20 |   });
  21 | 
  22 |   test('Props Explorer renders', async ({ page }) => {
  23 |     await page.goto('/hub/MLB-ANALYTICS/props');
  24 |     await expect(page.locator('h1')).toBeVisible();
  25 |   });
  26 | 
  27 |   test('Model Intel renders', async ({ page }) => {
  28 |     await page.goto('/hub/MLB-ANALYTICS/model-intel');
  29 |     await expect(page.locator('h1')).toBeVisible();
  30 |   });
  31 | 
  32 |   test('Accuracy renders', async ({ page }) => {
  33 |     await page.goto('/hub/MLB-ANALYTICS/accuracy');
  34 |     await expect(page.locator('h1')).toBeVisible();
  35 |   });
  36 | 
  37 |   test('Backtest renders', async ({ page }) => {
  38 |     await page.goto('/hub/MLB-ANALYTICS/backtest');
  39 |     await expect(page.locator('h1')).toBeVisible();
  40 |   });
  41 | });
  42 | 
```