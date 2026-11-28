/**
 * PREFLOP CHARTS, SIGNED IN AND SIGNED OUT, AT THREE WIDTHS (2026-11-28).
 *
 * The #SmarterDesign upgrade of Preflop Charts (#3216, #3240, #3264, #3265)
 * was checked by hand. The signed-in views were only ever seen through a
 * throwaway harness on a bookmark branch, and that harness is what found the
 * last fourteen gold tokens, "5 Archived RunS" and "40S". This spec is that
 * harness made permanent, so the next change that brings any of them back
 * fails a PR instead of waiting for someone to look.
 *
 * It asserts behaviour and design, never class names, because the page's
 * stylesheets and its one large page module are being reorganised:
 *   - signed-in signals: grade chip, Smart Practice with the weak spot,
 *     Jarvis suggestions, the VIP AI Mode overlay;
 *   - My Stats with history: Title Case labels, no split "RunS" or "40S";
 *   - Awards with the unlocked count;
 *   - every game screen opens to its intro;
 *   - no text in Orbitron or a serif fallback, no gold, amber, yellow,
 *     purple, violet, pink or magenta text (the range grid's action legend
 *     is data and is allowed), no sideways scroll, and a fixed bottom bar
 *     sits on the bottom edge;
 * at 393x852, 768x1024 and 1280x800.
 *
 * Every request is answered here: the session is fabricated, REST and Auth
 * are fixtures, app APIs are fixtures, and nothing leaves the test origin.
 * installRealtimeSessionGuard keeps the made-up token off live Realtime.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });

const WIDTHS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const UID = '00000000-0000-4000-8000-0000000000aa';
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const EXPIRES = Math.floor(Date.now() / 1000) + 6 * 3600;
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp: EXPIRES, role: 'authenticated', aud: 'authenticated', email: 'fixture@example.test' })}.sig`;
const USER = {
  id: UID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.test',
  user_metadata: { username: 'FixturePlayer' },
  app_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const SESSION = { access_token: TOKEN, token_type: 'bearer', expires_in: 21600, expires_at: EXPIRES, refresh_token: 'fixture-refresh', user: USER };
const NOW = Date.now();
const SESSIONS = Array.from({ length: 14 }, (_, i) => ({
  id: `s${i}`,
  game_mode: ['range', 'speed_drill', 'pressure_cooker', 'pattern_recognition'][i % 4],
  level: 1 + (i % 3),
  score: 55 + ((i * 3) % 45),
  accuracy: 0.55 + ((i * 3) % 45) / 100,
  time_taken: 40 + i * 3,
  created_at: new Date(NOW - i * 86400000).toISOString(),
  completed: true,
}));
const ACHIEVEMENTS = [
  { key: 'first_game', unlocked: true, unlocked_at: '2026-11-20T12:00:00Z' },
  { key: 'perfect_range', unlocked: true, unlocked_at: '2026-11-22T12:00:00Z' },
  { key: 'speed_60', unlocked: true, unlocked_at: '2026-11-25T12:00:00Z' },
];

type Mode = { signedIn: boolean; slowScenario?: boolean };

async function install(context: BrowserContext, baseURL: string, mode: Mode) {
  await installRealtimeSessionGuard(context);
  const origin = new URL(baseURL).origin;
  if (mode.signedIn) {
    await context.addInitScript(([session]) => {
      try {
        localStorage.setItem('smarter-poker-auth', session);
      } catch {}
    }, [JSON.stringify(SESSION)]);
  }
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      if (!mode.signedIn) return route.fulfill({ status: 401, json: { message: 'No Session' } });
      if (path.includes('/token')) return route.fulfill({ json: SESSION });
      return route.fulfill({ json: USER });
    }
    if (path.startsWith('/rest/v1/')) {
      if (mode.signedIn && path.includes('/rpc/get_user_achievements')) return route.fulfill({ json: ACHIEVEMENTS });
      if (mode.signedIn && path.includes('/memory_game_sessions')) return route.fulfill({ json: SESSIONS });
      return route.fulfill({ json: request.headers().accept?.includes('vnd.pgrst.object') ? null : [] });
    }
    if (url.origin === origin && path.startsWith('/api/')) {
      if (!mode.signedIn) return route.fulfill({ status: 401, json: { success: false } });
      if (path.includes('/api/user/get-header-stats')) {
        return route.fulfill({ json: { success: true, profile: { id: UID, username: 'FixturePlayer', diamonds: 1250, is_vip: true, xp: 4200, level: 12 } } });
      }
      if (path.includes('/api/vip/check-status')) return route.fulfill({ json: { isVip: true } });
      if (path.includes('/api/gto/get-weak-spots')) {
        return route.fulfill({ json: { success: true, weakSpots: [{ area: 'BTN Opens', errorCount: 6 }, { area: 'BB Defense', errorCount: 4 }] } });
      }
      if (path.includes('/api/gto/lobby-suggestions')) {
        return route.fulfill({
          json: {
            success: true,
            suggestions: [
              { actionType: 'daily_challenge', message: '', action: '' },
              { actionType: 'start_level', levelId: 2, message: 'Level 2 Is Open: Position Pulse', action: 'Start Level 2' },
              { actionType: 'adaptive_training', message: 'Train Your BTN Opens Leak', action: 'Smart Practice' },
            ],
          },
        });
      }
      if (path.includes('/api/memory/dashboard')) {
        return route.fulfill({
          json: {
            success: true,
            stats: {
              rolling_30d_sessions: 14,
              rolling_accuracy_pct: 84,
              mastered_levels_count: 1,
              highest_unlocked_level: 2,
              per_level_mastery: [
                { level: 1, attempts: 8, best_accuracy: 92 },
                { level: 2, attempts: 3, best_accuracy: 71 },
              ],
            },
          },
        });
      }
      if (path.includes('/api/gto/generate-scenario')) {
        // Held long enough for the AI Mode overlay to be read, then refused.
        if (mode.slowScenario) await new Promise((resolve) => setTimeout(resolve, 6000));
        return route.fulfill({ status: 503, json: { success: false, error: 'Fixture' } });
      }
      return route.fulfill({ json: {} });
    }
    if (url.origin === origin && request.method() === 'GET') return route.continue();
    return route.abort();
  });
}

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page.locator('body')).toContainText(/Preflop/i, { timeout: 30000 });
}

/** Design checks that hold on every Preflop Charts screen. */
async function expectSmarterDesign(page: Page, where: string) {
  const report = await page.evaluate(() => {
    const problems: string[] = [];
    const canvas = document.createElement('canvas').getContext('2d')!;
    // The range grid's action legend is data: its colours name action types.
    const ACTION_LEGEND = /^(fold|call|raise|raise sm|raise small|raise big|all in|all-in|3-?bet|4-?bet)$/i;
    const hueOf = (value: string) => {
      canvas.fillStyle = '#000';
      canvas.fillStyle = value;
      const normalized = canvas.fillStyle;
      const hex = /^#([a-f0-9]{6})$/i.exec(normalized);
      const numbers = normalized.match(/[\d.]+/g);
      const rgb = hex ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) : numbers?.map(Number);
      if (!rgb || rgb.length < 3 || rgb[3] === 0) return null;
      const [r, g, b] = rgb;
      const max = Math.max(r, g, b);
      const chroma = max - Math.min(r, g, b);
      if (chroma < 40) return null;
      let hue = max === r ? (g - b) / chroma : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
      return (hue * 60 + 360) % 360;
    };
    const seen = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      const text = (node.textContent || '').trim();
      if (!element || !/[\p{L}\p{N}]/u.test(text) || element.closest('style,script,noscript,[hidden],svg')) continue;
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const family = style.fontFamily;
      if (/orbitron/i.test(family) || !/(sans|rajdhani|narrow|inter|roboto|system|mono|condensed|apple)/i.test(family)) {
        const key = `font ${family.slice(0, 40)} :: ${text.slice(0, 40)}`;
        if (!seen.has(key)) problems.push(key);
        seen.add(key);
      }
      if (ACTION_LEGEND.test(text)) continue;
      const hue = hueOf(style.color);
      // Gold, amber and yellow (32-80) and purple, violet, pink and magenta
      // (262-345) are banned. The standard's warning orange (#ff8a3d, ~24)
      // and plain reds stay legal.
      if (hue !== null && ((hue >= 32 && hue < 80) || (hue >= 262 && hue < 345))) {
        const key = `colour ${style.color} :: ${text.slice(0, 40)}`;
        if (!seen.has(key)) problems.push(key);
        seen.add(key);
      }
    }
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (overflow > 1) problems.push(`scrolls sideways by ${overflow}px`);
    // The bottom navigation is fixed to the bottom edge (CLAUDE.md rule 15).
    for (const element of document.querySelectorAll('nav, [role="navigation"]')) {
      const style = getComputedStyle(element);
      if (style.position !== 'fixed') continue;
      const box = element.getBoundingClientRect();
      if (!box.height || box.top < window.innerHeight / 2) continue;
      if (Math.abs(box.bottom - window.innerHeight) > 2 && box.top < window.innerHeight) {
        problems.push(`fixed bottom bar floats at ${Math.round(box.bottom)} of ${window.innerHeight}`);
      }
    }
    return problems;
  });
  expect(report, `${where}: SmarterDesign violations`).toEqual([]);
}

for (const size of WIDTHS) {
  test.describe(`Preflop Charts at ${size.name} ${size.width}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('signed out: the menu, every sub page and every game intro', async ({ page, context, baseURL }) => {
      test.setTimeout(120000);
      await install(context, baseURL!, { signedIn: false });
      await open(page, '/hub/preflop-charts');
      await expect(page.getByRole('button', { name: /^Speed Drill/ })).toBeVisible();
      await expectSmarterDesign(page, 'menu signed out');

      for (const sub of ['stats', 'leaderboard', 'achievements', 'tutorial']) {
        await open(page, `/hub/preflop-charts/${sub}`);
        await expect(page.getByRole('link', { name: 'Back To Preflop Charts' }).first()).toBeVisible();
        await expectSmarterDesign(page, `${sub} signed out`);
      }

      const games: Array<[RegExp, RegExp]> = [
        [/^Speed Drill/, /^Start Speed Drill/],
        [/^Pressure/, /^Start Pressure Cooker/],
        [/^Pattern/, /^Start Pattern Recognition/],
        [/^Mixed/, /^Start Mixed Trainer/],
        [/^Spot Trainer/, /^Start Spot Trainer/],
        [/^Local VS/, /^Start Local VS Practice/],
      ];
      for (const [mode, start] of games) {
        await open(page, '/hub/preflop-charts');
        await page.getByRole('button', { name: mode }).first().click();
        const launch = page.getByRole('button', { name: start }).first();
        await expect(launch, `${mode} offers its start control`).toBeVisible();
        await launch.click();
        // The game screen replaces the menu: its launch control is gone and
        // the screen offers its own first control.
        await expect(page.getByRole('button', { name: start })).toHaveCount(0, { timeout: 15000 });
        await expect(page.getByRole('button').first()).toBeVisible();
        await expectSmarterDesign(page, `${mode} intro`);
      }
    });

    test('signed in: grade, Smart Practice, Jarvis, My Stats and Awards', async ({ page, context, baseURL }) => {
      test.setTimeout(120000);
      await install(context, baseURL!, { signedIn: true, slowScenario: true });
      await open(page, '/hub/preflop-charts');
      const body = page.locator('body');
      await expect(body).toContainText(/84%/, { timeout: 30000 });
      await expect(body).toContainText(/Across Last 30 Days/i);
      await expect(body).toContainText(/BTN Opens/);
      await expect(body).toContainText(/Level 2 Is Open/);
      await expectSmarterDesign(page, 'menu signed in');

      // VIP AI Mode: the scenario request is held, so the overlay is readable.
      const ai = page.getByRole('button', { name: /AI Mode|AI On/ }).first();
      if (await ai.isEnabled()) {
        await ai.click();
        // Each level card is one button named for its state and level.
        await page.getByRole('button', { name: /Level 1, / }).first().click();
        await expect(body).toContainText(/Jarvis Is Generating Your Scenario/i, { timeout: 10000 });
      }

      await open(page, '/hub/preflop-charts/stats');
      await expect(body).toContainText(/Recent Trend/);
      const statsText = await body.innerText();
      expect(statsText, 'run counts read as one word').not.toMatch(/\bRunS\b/);
      expect(statsText, 'session times keep a lower-case unit').not.toMatch(/\b\d+S\b/);
      expect(statsText).not.toMatch(/LEGACY LOCAL ARCHIVE|LAST 12 LOCAL ARCHIVE RUNS|Recent trend/);
      await expectSmarterDesign(page, 'stats signed in');

      await open(page, '/hub/preflop-charts/achievements');
      await expect(body).toContainText(/\b3\b/);
      await expectSmarterDesign(page, 'achievements signed in');
    });
  });
}
