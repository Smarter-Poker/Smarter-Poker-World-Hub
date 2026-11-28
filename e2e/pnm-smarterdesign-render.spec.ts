// Poker Near Me #SmarterDesign, measured on RENDERED styles (2026-11-28).
//
// The source scanner (scripts/ci/check-pnm-smarterdesign-css.mjs, CHECK 30)
// reads literals. This reads what the browser actually painted, so an
// inherited colour, a cascade loss, a utility class or a JS-set style cannot
// slip past it. Every Poker Near Me page is loaded offline (fixtures in
// e2e/fixtures/pnmSmarterDesignFixtures.ts; no browser request leaves the
// local server) at a phone, a tablet and a desktop size, signed out, and on
// the phone also signed in, and every visible text element, button and frame
// is checked for:
//
//   - no banned hue (about 20-70 and 260-345 degrees with real saturation:
//     the same thresholds as CHECK 30) in text, borders or button fills,
//     outside the short exemption list below;
//   - no computed `text-transform: uppercase`;
//   - contrast of at least 4.5:1, or 3:1 for large text;
//   - every visible button at least 44px in its smaller dimension, unless it
//     is marked data-allow-small-target;
//   - the bottom nav fixed at bottom: 0 (CLAUDE.md rule 15);
//   - a [data-header-art] image header carrying the painted chrome "?".
//
// It also pins this week's specific fixes, and a floor of measured elements
// per page so a page that renders nothing cannot pass by reading nothing.
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE_SERIES_ID, FIXTURE_TOUR_CODE, FIXTURE_VENUE_ID, installPnmOffline } from './fixtures/pnmSmarterDesignFixtures';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });
test.describe.configure({ mode: 'parallel' });

const VIEWPORTS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

type RouteCase = { path: string; key: string };
const ROUTES: RouteCase[] = [
  { key: 'lobby', path: '/hub/poker-near-me/lobby' },
  { key: 'venues', path: '/hub/poker-near-me/venues' },
  { key: 'map', path: '/hub/poker-near-me/map' },
  { key: 'more', path: '/hub/poker-near-me/more' },
  { key: 'roadtrip', path: '/hub/poker-near-me/roadtrip' },
  { key: 'alerts', path: '/hub/poker-near-me/alerts' },
  { key: 'saved', path: '/hub/poker-near-me/saved' },
  { key: 'series', path: '/hub/poker-near-me/series' },
  { key: 'tours', path: '/hub/poker-near-me/tours' },
  { key: 'daily-tournaments', path: '/hub/poker-near-me/daily-tournaments' },
  { key: 'events-calendar', path: '/hub/poker-near-me/events-calendar' },
  { key: 'state', path: '/hub/poker-near-me/in/nv' },
  { key: 'venue', path: `/hub/venues/${FIXTURE_VENUE_ID}` },
  { key: 'tour', path: `/hub/tours/${FIXTURE_TOUR_CODE}` },
  { key: 'series-detail', path: `/hub/series/${FIXTURE_SERIES_ID}` },
  { key: 'poker-series', path: '/hub/poker-series' },
  { key: 'home-games', path: '/hub/home-games' },
];

// Same numbers as scripts/ci/check-pnm-smarterdesign-css.mjs.
const THRESHOLDS = {
  bands: [[20, 70], [260, 345]] as Array<[number, number]>,
  saturation: 0.25,
  chroma: 0.1,
  alpha: 0.05,
};

// Each exemption covers artwork or third-party cartography, never UI ink.
const EXEMPT = [
  '.leaflet-container', // map tiles, attribution and zoom controls are Leaflet's
  '[class*="marker"]', // map markers use a categorical palette on the tiles
  '[class*="cluster"]', // marker clusters, same palette
  '.pnc-icon', // painted pictograms are artwork
  '[class*="halo"]', // logo halos sit behind third-party logos
  '[class*="avatar"]', // avatar wells frame user photographs
  '[class*="rating"]', // rating chips: the conventional star colour beside a numeric score
  '[class*="photo"]', // venue photographs and their scrims are original records
  'img, picture, video, canvas, svg image',
].join(', ');

// Global chrome with its own contracts (global-footer-visual, the approved
// global header law): measured there, not here.
const OWNED_ELSEWHERE = '[data-global-bottom-nav], .approved-global-header, [data-artwork="approved-global-header"]';

const FLOOR = { text: 12, contrast: 6, buttons: 1 };

// Known debt, tolerated by name and only on its own route. Every entry is in
// pages/hub/venues/[id].js's in-page style block, which the venue page lane
// (work/venuepage) owns this round: slate #64748b labels and #475569 muted
// values on the dark info panel read 2.5-4.0:1, and the address button is
// 22px tall at desktop. Remove an entry the moment its source is fixed;
// nothing new is added here without a named owner. Everything else on every
// page is held to the full rule.
type Debt = { rule: 'contrast' | 'small'; route: RegExp; element: RegExp; owner: string };
const KNOWN_DEBT: Debt[] = [
  // Empty: the venue page contrast and 44px items were fixed at source on 2026-11-28.
];

type Audit = Awaited<ReturnType<typeof audit>>;

async function audit(page: Page) {
  return page.evaluate(({ T, EXEMPT, OWNED_ELSEWHERE }) => {
    const parse = (c: string): [number, number, number, number] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x, i) => (x.endsWith('%') ? (parseFloat(x) / 100) * (i < 3 ? 255 : 1) : parseFloat(x)));
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
    };
    const hsl = ([r, g, b]: number[]) => {
      const R = r / 255, G = g / 255, B = b / 255;
      const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min, l = (max + min) / 2;
      let h = 0; const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (d) h = max === R ? 60 * (((G - B) / d) % 6) : max === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
      return { h: h < 0 ? h + 360 : h, s, chroma: d };
    };
    const banned = (c: [number, number, number, number] | null) => {
      if (!c || c[3] < T.alpha) return false;
      const { h, s, chroma } = hsl(c);
      return s >= T.saturation && chroma >= T.chroma && T.bands.some(([a, b]) => h >= a && h <= b);
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const over = (top: number[], under: number[]) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
    const gradientStops = (img: string) => (img.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean) as number[][];

    // The colour behind an element: composite backgrounds up the tree until
    // an opaque layer. A gradient counts as the mean of its stops (the
    // colour under the middle of a label); a url() image means the backdrop
    // is artwork, which this cannot measure, so the element is not scored.
    const PAGE = [4, 13, 24, 1];
    const backdrop = (el: Element): number[] | null => {
      const layers: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') {
          if (/url\(/.test(cs.backgroundImage)) return null;
          const stops = gradientStops(cs.backgroundImage);
          if (stops.length) {
            const mean = [0, 1, 2, 3].map((i) => stops.reduce((s, c) => s + c[i], 0) / stops.length);
            layers.push(mean);
            if (mean[3] >= 0.99) break;
          }
        }
        const bg = parse(cs.backgroundColor);
        if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 0.99) break; }
      }
      return layers.reverse().reduce((under, top) => over(top, under), PAGE);
    };

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      let opacity = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
        opacity *= parseFloat(cs.opacity || '1');
        if (cs.clipPath && /inset\(50%|circle\(0/.test(cs.clipPath)) return false;
        if (cs.clip && cs.clip.startsWith('rect(0') && r.width <= 2) return false;
      }
      return opacity > 0.1;
    };
    const describe = (el: Element) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' "' + (el.textContent || '').trim().slice(0, 40) + '"';
    };

    const problems = { hue: [] as string[], uppercase: [] as string[], contrast: [] as string[], small: [] as string[] };
    let textCount = 0, contrastCount = 0, buttonCount = 0;

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest(OWNED_ELSEWHERE) || el.closest('script, style, noscript, template, head')) continue;
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
      const isButton = el.matches('button, [role="button"], input[type="button"], input[type="submit"], .sd-button');
      const cs = getComputedStyle(el);
      const framed = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat((cs as any)['border' + s + 'Width']) > 0 && (cs as any)['border' + s + 'Style'] !== 'none');
      if (!ownText && !isButton && !framed) continue;
      if (!visible(el)) continue;
      const exempt = !!el.closest(EXEMPT);

      if (ownText) {
        textCount++;
        if (cs.textTransform === 'uppercase') problems.uppercase.push(describe(el));
        const ink = parse(cs.color);
        if (!exempt && banned(ink)) problems.hue.push('text ' + cs.color + ' on ' + describe(el));
        const back = backdrop(el);
        if (ink && back && !el.closest(':disabled, [aria-disabled="true"]')) {
          contrastCount++;
          const fg = over(ink, back);
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
          const need = large ? 3 : 4.5;
          const got = ratio(fg, back);
          if (got + 0.005 < need) problems.contrast.push(got.toFixed(2) + ':1 (needs ' + need + ') ' + cs.color + ' over rgb(' + back.slice(0, 3).map(Math.round).join(',') + ') ' + describe(el));
        }
      }
      if ((isButton || framed) && !exempt) {
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          if (parseFloat((cs as any)['border' + side + 'Width']) > 0 && banned(parse((cs as any)['border' + side + 'Color']))) {
            problems.hue.push('border ' + (cs as any)['border' + side + 'Color'] + ' on ' + describe(el));
            break;
          }
        }
      }
      if (isButton) {
        buttonCount++;
        if (!exempt) {
          if (banned(parse(cs.backgroundColor))) problems.hue.push('fill ' + cs.backgroundColor + ' on ' + describe(el));
          const stop = gradientStops(cs.backgroundImage || '').find((c) => banned(c as any));
          if (stop) problems.hue.push('gradient stop rgb(' + stop.join(',') + ') on ' + describe(el));
        }
        if (!el.closest('[data-allow-small-target]') && !el.closest('.leaflet-container') && cs.pointerEvents !== 'none') {
          const r = el.getBoundingClientRect();
          if (Math.min(r.width, r.height) < 43.5) problems.small.push(Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + describe(el));
        }
      }
    }
    return { problems, textCount, contrastCount, buttonCount };
  }, { T: THRESHOLDS, EXEMPT, OWNED_ELSEWHERE });
}

async function scrollThrough(page: Page) {
  // Mount every LazyPanel (600px rootMargin) by walking the page down in
  // viewport steps, then return to the top so the footer is shown again.
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollBy(0, Math.max(300, window.innerHeight * 0.8));
      return window.scrollY === before;
    });
    await page.waitForTimeout(150);
    if (done) break;
  }
  // A long discovery document keeps growing as panels mount, so the walk
  // above can end before the last tool. Bring each subsection into view too.
  const sections = await page.locator('.pnm-subsection[id]').evaluateAll((els) => els.map((el) => el.id));
  for (const id of sections) {
    await page.evaluate((target) => document.getElementById(target)?.scrollIntoView({ block: 'center' }), id);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

async function expectChrome(page: Page, path: string, viewportHeight: number) {
  const header = page.locator('[data-header-art]').first();
  await expect(header, `${path} has a #SmarterDesign image header`).toBeVisible({ timeout: 30_000 });
  const help = header.locator('.sd-header-help');
  await expect(help, `${path} header carries the chrome "?"`).toHaveCount(1);
  await expect(help.locator('img')).toHaveAttribute('src', /\/images\/smarterdesign\/header-help\.webp/);

  const nav = page.locator('[data-global-bottom-nav="true"]');
  await expect(nav, `${path} has the global bottom nav`).toHaveCount(1);
  await expect(nav).toHaveCSS('position', 'fixed');
  const box = await nav.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { bottom: r.bottom, height: r.height, cssBottom: getComputedStyle(el).bottom };
  });
  expect(box.cssBottom, `${path} footer is pinned at bottom: 0`).toBe('0px');
  // A deep link scrolls to its section on load, and useHideOnScroll then
  // slides the bar off the bottom edge. It may sit on the edge or below it,
  // never above it (that is the mid-page footer rule 15 forbids).
  expect(box.bottom, `${path} footer never floats above the bottom edge`).toBeGreaterThan(viewportHeight - 4);
  expect(box.bottom, `${path} footer is on or just below the bottom edge`).toBeLessThan(viewportHeight + box.height + 4);
}

function report(path: string, label: string, result: Audit) {
  const { problems } = result;
  const lines = (name: string, list: string[]) => (list.length ? `\n  ${name} (${list.length}):\n    ` + list.slice(0, 25).join('\n    ') : '');
  return `${path} at ${label}` +
    lines('banned hue', problems.hue) + lines('uppercase', problems.uppercase) +
    lines('contrast', problems.contrast) + lines('touch target under 44px', problems.small);
}

async function pageSpecificFixes(page: Page, key: string) {
  if (key === 'roadtrip' || key === 'more') {
    const planner = page.locator('.road-trip-planner').first();
    await expect(planner, 'the Road Trip Planner mounts').toBeVisible({ timeout: 30_000 });
    const roles = await planner.locator('.rtp-role').evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    expect(roles.length, 'From, Via and To role labels render').toBeGreaterThanOrEqual(2);
    expect(new Set(roles).size, `every .rtp-role shares one ink: ${roles.join(', ')}`).toBe(1);
    const [r, g, b] = (roles[0].match(/\d+(\.\d+)?/g) || []).map(Number);
    expect(r > g + 40 && r > b + 40, `.rtp-role is not red (${roles[0]})`).toBe(false);
    expect(b, `.rtp-role is the ice ink (${roles[0]})`).toBeGreaterThan(200);
    const placeholders = await planner.locator('input').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).placeholder || ''));
    expect(placeholders.some((p) => /origin/i.test(p)), 'an Origin field renders').toBe(true);
    expect(placeholders.some((p) => /destination/i.test(p)), 'a Destination field renders').toBe(true);
    for (const p of placeholders) expect(p, `placeholder "${p}" carries no E.G.`).not.toMatch(/e\.\s*g\./i);
  }
  if (key === 'alerts' || key === 'more') {
    const toggle = page.locator('.tournament-alerts .ta-toggle').first();
    await expect(toggle, 'the Tournament Alerts toggle mounts').toBeVisible({ timeout: 30_000 });
    const text = (await toggle.innerText()).trim();
    expect(['On', 'Off'], `.ta-toggle reads On or Off, read "${text}"`).toContain(text);
    await expect(toggle).toHaveAttribute('aria-pressed', text === 'On' ? 'true' : 'false');
  }
  if (key === 'more') {
    for (const tool of ['.road-trip-planner', '.trip-calc', '.near-me-feed', '.tournament-alerts', '.social-layer', '.peak-activity-heatmap']) {
      await expect(page.locator(tool).first(), `Discovery Tools mounts ${tool}`).toBeAttached({ timeout: 30_000 });
    }
  }
  if (key === 'venue') {
    const deck = page.locator('.pnm-deep-deck').first();
    await expect(deck, 'the venue hero renders').toBeVisible({ timeout: 30_000 });
    const name = (await deck.locator('h1, .pnm-deep-deck__heading').first().innerText()).trim();
    expect(name.length, 'the hero names the venue').toBeGreaterThan(2);
    const map = page.locator('.map-section').first();
    if (await map.count()) {
      const order = await page.evaluate(() => {
        const d = document.querySelector('.pnm-deep-deck')!;
        const m = document.querySelector('.map-section')!;
        return {
          domFirst: !!(d.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING),
          deckTop: d.getBoundingClientRect().top,
          mapTop: m.getBoundingClientRect().top,
        };
      });
      expect(order.domFirst, 'the hero comes before the map section in the document').toBe(true);
      expect(order.deckTop, 'the hero is drawn above the map section').toBeLessThan(order.mapTop);
    }
  }
}

const SIGNED = [
  { signedIn: false, label: 'signed out', viewports: VIEWPORTS },
  { signedIn: true, label: 'signed in', viewports: VIEWPORTS.filter((v) => v.name === 'phone') },
];

for (const route of ROUTES) {
  for (const mode of SIGNED) {
    for (const vp of mode.viewports) {
      test(`${route.path} ${vp.width}x${vp.height} ${mode.label} renders #SmarterDesign`, async ({ page, context, baseURL, browserName }) => {
        // WebKit runs the phone and desktop sizes signed out; Chromium runs
        // the whole matrix. Both engines paint the same cascade, so this keeps
        // the cross-engine check without doubling the job.
        test.skip(browserName === 'webkit' && (vp.name === 'tablet' || mode.signedIn), 'measured in Chromium');
        test.setTimeout(120_000);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await installPnmOffline(context, page, new URL(baseURL!).origin, mode.signedIn);

        const response = await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        // 503 is allowed: a detail page whose server-side lookup cannot run
        // (series/[id] offline) answers 503 so crawlers retry, and the
        // browser still renders the page from its own fetch.
        const status = response?.status() ?? 0;
        expect(status < 500 || status === 503, `${route.path} answered ${status}`).toBe(true);
        await page.waitForLoadState('load');
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

        await expectChrome(page, route.path, vp.height);
        await scrollThrough(page);
        await pageSpecificFixes(page, route.key);

        const result = await audit(page);
        const label = `${vp.width}x${vp.height} ${mode.label} (${browserName})`;
        test.info().annotations.push({ type: 'measured', description: `${result.textCount} text, ${result.contrastCount} contrast-scored, ${result.buttonCount} buttons` });
        console.log(`[pnm-smarterdesign] ${route.path} ${label}: ${result.textCount} text, ${result.contrastCount} contrast-scored, ${result.buttonCount} buttons`);
        expect(result.textCount, `${route.path} measured ${result.textCount} text elements; a page that reads nothing cannot pass`).toBeGreaterThanOrEqual(FLOOR.text);
        expect(result.contrastCount, `${route.path} scored contrast on ${result.contrastCount} elements`).toBeGreaterThanOrEqual(FLOOR.contrast);
        expect(result.buttonCount, `${route.path} measured ${result.buttonCount} buttons`).toBeGreaterThanOrEqual(FLOOR.buttons);
        const tolerated: string[] = [];
        for (const rule of ['contrast', 'small'] as const) {
          result.problems[rule] = result.problems[rule].filter((line) => {
            const element = rule === 'contrast' ? line.replace(/^.*? over rgb\([^)]*\) /, '') : line.replace(/^\d+x\d+ /, '');
            const known = KNOWN_DEBT.some((debt) => debt.rule === rule && debt.route.test(route.path) && debt.element.test(element));
            if (known) tolerated.push(line);
            return !known;
          });
        }
        if (tolerated.length) test.info().annotations.push({ type: 'known debt', description: tolerated.join(' | ') });
        const count = Object.values(result.problems).reduce((n, list) => n + list.length, 0);
        expect(count, report(route.path, label, result)).toBe(0);
      });
    }
  }
}
