import { expect, test } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
  contextOptions: { reducedMotion: 'reduce' },
});

const COMPLEX_TRAINING_ROUTES = [
  '/hub/training',
  '/hub/training/solutions',
  '/hub/training/study-group-finder',
  '/hub/training/session-notes',
  '/hub/training/custom-solve',
  '/hub/training/gto-news',
  '/hub/training/preflop-charts',
  '/hub/training/flashcards',
  '/hub/training/tournaments',
  '/hub/training/equity-calculator',
  '/hub/training/hand-lab',
  '/hub/training/community-leaderboard',
  '/hub/training/drill-builder',
];

test.beforeEach(async ({ context }) => {
  await installRealtimeSessionGuard(context);
});

for (const route of COMPLEX_TRAINING_ROUTES) {
  test(`Training #SMARTERDESIGN layout contract: ${route}`, async ({ page }) => {
    const pageErrors: string[] = [];
    const auth401s: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('response', (res) => {
      if (res.status() === 401) auth401s.push(`${res.status()} ${res.url()}`);
    });

    await page.setViewportSize({ width: 375, height: 812 });
    const resp = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 25000 });
    expect(resp?.status(), `HTTP 200 on ${route}`).toBe(200);
    await page.waitForTimeout(800);

    const mobileAudit = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const boxedHelp = Array.from(document.querySelectorAll('.sd-header-help')).filter((el) => {
        const cs = getComputedStyle(el);
        return cs.backgroundImage !== 'none' || cs.boxShadow !== 'none';
      }).length;

      const brokenWords: Array<{ word: string; lines: number }> = [];
      const clippedBtns: Array<{ text: string; right: number }> = [];

      for (const el of Array.from(document.querySelectorAll(
        '.sp-training-page-stage button, .sp-training-page-stage [role="button"], .sp-training-page-stage a',
      ))) {
        if (el.closest('.universal-header, .sp-arena-lobby-shell')) continue;
        const er = el.getBoundingClientRect();
        if (er.width < 10 || er.height < 10) continue;
        if (er.right > window.innerWidth + 4 && er.left < window.innerWidth) {
          clippedBtns.push({ text: (el.textContent || '').trim().slice(0, 24), right: Math.round(er.right) });
        }
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let tn: Node | null;
        while ((tn = tw.nextNode())) {
          const str = tn.nodeValue || '';
          const re = /[A-Za-z0-9]+/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(str)) !== null) {
            const word = m[0];
            if (word.length < 3) continue;
            const range = document.createRange();
            range.setStart(tn, m.index);
            range.setEnd(tn, m.index + word.length);
            const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
            const ys: number[] = [];
            for (const r of rects) {
              if (!ys.some((y) => Math.abs(y - r.top) <= 4)) ys.push(r.top);
            }
            if (ys.length > 1) brokenWords.push({ word, lines: ys.length });
          }
        }
      }
      return { overflow, boxedHelp, brokenWords, clippedBtns };
    });

    expect(mobileAudit.overflow, `zero 375px horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
    expect(mobileAudit.boxedHelp, `zero boxed header "?" on ${route}`).toBe(0);
    expect(mobileAudit.brokenWords, `zero mid-word button breaks on ${route}`).toEqual([]);
    expect(mobileAudit.clippedBtns, `zero right-edge clipped buttons on ${route}`).toEqual([]);
    expect(auth401s, `zero guest 401 errors on ${route}`).toEqual([]);
    expect(pageErrors, `zero uncaught page errors on ${route}`).toEqual([]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(150);
    const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desktopOverflow, `zero 1280px horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
  });
}

test('Hand Lab 52-card picker opens unframed with Escape dismiss and gto-news headlines stay editorial', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/hub/training/hand-lab', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Select Hole Card 1' }).click();
  await page.waitForTimeout(300);

  const picker = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('dialog[open] button[data-training-raw-control="true"]'));
    const cs = cards[0] ? getComputedStyle(cards[0]) : null;
    return {
      count: cards.length,
      bgImg: cs?.backgroundImage || '',
      boxShadow: cs?.boxShadow || '',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(picker.count).toBe(52);
  expect(picker.bgImg).toBe('none');
  expect(picker.boxShadow).toBe('none');
  expect(picker.overflow).toBeLessThanOrEqual(0);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const stillOpen = await page.evaluate(() => Boolean(document.querySelector('dialog[open]')));
  expect(stillOpen).toBe(false);

  await page.goto('/hub/training/gto-news', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(700);
  const editorialHeadlineBg = await page.evaluate(() => {
    const btn = document.querySelector('button[data-training-raw-control="true"][aria-expanded]');
    return btn ? getComputedStyle(btn).backgroundImage : 'missing';
  });
  expect(editorialHeadlineBg).toBe('none');
});
