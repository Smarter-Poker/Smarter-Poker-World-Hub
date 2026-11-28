// #SmarterDesign image-header "?" standard (Dan, 2026-11-27), outside Bankroll.
// e2e/029 covers the Bankroll, Toke and Jarvis headers. This covers every other
// image header that hosts the painted help control: Poker Tools, Memory Games,
// the Training calculators, VIP and the store's VIP tab. Each one must show the
// one painted icon tucked into its corner, with no page skin boxing it at rest
// or on keyboard focus. Training's chrome layer and the store's square focus
// outline each boxed it once before this spec existed.
import { expect, test } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });

test.beforeEach(async ({ page, baseURL, context }) => {
  await installRealtimeSessionGuard(context);
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/rest/v1/')) {
      return route.fulfill({ json: request.headers().accept?.includes('vnd.pgrst.object') ? null : [] });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    if (url.origin === origin && request.method() === 'GET') return route.continue();
    return route.abort();
  });
});

const ROUTES = [
  '/hub/poker-tools',
  '/hub/memory-games',
  '/hub/memory-games/stats',
  '/hub/memory-games/leaderboard',
  '/hub/memory-games/achievements',
  '/hub/memory-games/tutorial',
  '/hub/training/icm-calculator',
  '/hub/training/hand-lab',
  '/hub/training/equity-calculator',
  '/hub/vip-membership/compare',
  '/hub/vip-membership/manage',
  '/hub/diamond-store?tab=vip',
];

for (const route of ROUTES) {
  test(`${route} wears the one painted header "?", tucked and never boxed`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'load' });
    // Let the page finish its first data pass: the store re-renders its
    // masthead once its catalog answers, which would drop focus mid-check.
    await page.waitForLoadState('networkidle');
    const help = page.locator('.sd-header-help').first();
    await expect(help).toBeVisible({ timeout: 20_000 });
    await expect(help.locator('img')).toHaveJSProperty('complete', true);

    const rest = await help.evaluate(el => {
      const img = el.querySelector('img') as HTMLImageElement;
      const header = (el.closest('header') || el.parentElement) as HTMLElement;
      const h = header.getBoundingClientRect();
      const i = img.getBoundingClientRect();
      const s = getComputedStyle(el);
      const textQ = [...header.querySelectorAll('button, a, span')]
        .filter(node => node.children.length === 0 && node.textContent?.trim() === '?').length;
      return {
        src: new URL(img.currentSrc || img.src).pathname,
        natural: img.naturalWidth,
        top: i.top - h.top,
        right: h.right - i.right,
        textQ,
        shadow: s.boxShadow,
        radius: s.borderTopLeftRadius,
        background: s.backgroundImage,
        borderTop: s.borderTopWidth,
      };
    });
    expect(rest.src).toBe('/images/smarterdesign/header-help.webp');
    expect(rest.natural).toBeGreaterThan(0);
    expect(rest.textQ, 'no text "?" anywhere in the header').toBe(0);
    // About 3px clear of the frame: 6.1/6.5px on the steel rim, 4.6/5px on
    // Training's 2px chrome border. Never touching (< 3px), never adrift (> 8px).
    expect(rest.top).toBeGreaterThanOrEqual(3);
    expect(rest.top).toBeLessThanOrEqual(8);
    expect(rest.right).toBeGreaterThanOrEqual(3);
    expect(rest.right).toBeLessThanOrEqual(8);
    expect(rest.shadow, 'no page skin paints a box at rest').toBe('none');
    expect(rest.radius).toBe('50%');
    expect(rest.background).toBe('none');
    expect(rest.borderTop).toBe('0px');

    await page.keyboard.press('Tab');
    await help.focus();
    const focus = await help.evaluate(el => {
      const s = getComputedStyle(el);
      const ring = getComputedStyle(el, '::after');
      return { visible: el.matches(':focus-visible'), shadow: s.boxShadow, outline: s.outlineStyle === 'none' || s.outlineWidth === '0px', radius: s.borderTopLeftRadius, ringRadius: ring.borderTopLeftRadius };
    });
    expect(focus.visible).toBe(true);
    expect(focus.shadow, 'focus draws no box on the target').toBe('none');
    expect(focus.outline, 'focus draws no outline on the target').toBe(true);
    expect(focus.radius).toBe('50%');
    // Some pages fade ::after in, so wait for the ring rather than read it once.
    await expect.poll(() => help.evaluate(el => (document.activeElement === el ? '' : 'focus moved to ' + (document.activeElement?.tagName || 'none') + ' ') + getComputedStyle(el, '::after').opacity), { message: 'the thin round ring shows on focus' }).toBe('1');
    expect(focus.ringRadius).toBe('50%');
  });
}
