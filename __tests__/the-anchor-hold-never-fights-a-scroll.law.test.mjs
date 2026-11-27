/**
 * THE ANCHOR HOLD NEVER FIGHTS A SCROLL (2026-11-26).
 *
 * Poker Near Me deep links (/hub/poker-near-me/series and friends) keep the
 * landing section anchored for a bounded hydration window while late content
 * above it grows. The hold stopped only on wheel, touchstart, pointerdown and
 * keydown. Any other scroll (a scrollbar drag, find-in-page, an anchor link,
 * assistive technology, a script) was dragged back to the section within
 * about 200ms, for up to 6.4 seconds: the 2026-11-26 CI probe scrolled the
 * Series route to y = 10073 and found it back at y = 341.
 *
 * The Global Footer E2E flake on e2e/024-world-menu-mobile-phase3.spec.ts
 * ("Poker Near Me deep Series route keeps its approved header trigger after
 * document scroll", WebKit only) was NOT settled here. A later probe
 * (2026-11-27) found the page collapsing its first-paint skeletons above the
 * reader, which shrank the document by about 2000px, clamped the scroll and
 * left WebKit laying the fixed header out against a stale layout viewport:
 * getBoundingClientRect read y = 1974 in that window too, not only the
 * protocol box. That root cause and its law live in
 * poker-near-me-sections-never-collapse-above-the-reader.law.test.mjs.
 *
 * Laws: a scroll that moved both the document and the held section ends the
 * hold before the next realignment, while growth above the section and
 * browser scroll anchoring do not; nothing in the global cascade turns <html>
 * or <body> (the portaled header's only ancestors) into a containing block for
 * fixed descendants; and the e2e pin keeps its immediate DOM and protocol
 * reads and its hit-test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  isForeignScroll,
  sectionAnchorDelta,
  sectionId,
} from '../src/components/poker-near-me/pnmSections.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

describe('isForeignScroll tells the visitor apart from the page', () => {
  const viewportHeight = 812;

  it('late content above the section (position unchanged) is not foreign', () => {
    assert.equal(isForeignScroll({ heldY: 341, scrollY: 341, anchorDelta: 2600, viewportHeight }), false);
  });

  it('browser scroll anchoring (position moved, section kept) is not foreign', () => {
    assert.equal(isForeignScroll({ heldY: 341, scrollY: 1180, anchorDelta: 3, viewportHeight }), false);
    assert.equal(isForeignScroll({ heldY: 341, scrollY: 1180, anchorDelta: -150, viewportHeight }), false);
  });

  it('the hold\'s own correction landing on the section is not foreign', () => {
    assert.equal(isForeignScroll({ heldY: 341, scrollY: 2941, anchorDelta: 0, viewportHeight }), false);
  });

  it('sub-pixel and rounding jitter is not foreign', () => {
    assert.equal(isForeignScroll({ heldY: 341, scrollY: 343, anchorDelta: 9000, viewportHeight }), false);
  });

  it('a scroll that moved the document and the section away is foreign (the e2e/024 jump)', () => {
    assert.equal(isForeignScroll({ heldY: 371, scrollY: 10073, anchorDelta: -9732, viewportHeight }), true);
    assert.equal(isForeignScroll({ heldY: 900, scrollY: 0, anchorDelta: 900, viewportHeight }), true);
  });

  it('a moved document whose section is gone is foreign', () => {
    assert.equal(isForeignScroll({ heldY: 371, scrollY: 5000, anchorDelta: null, viewportHeight }), true);
  });

  it('missing measurements never cancel the hold', () => {
    assert.equal(isForeignScroll({ heldY: undefined, scrollY: 5000, anchorDelta: -4000, viewportHeight }), false);
    assert.equal(isForeignScroll({ heldY: 10, scrollY: Number.NaN, anchorDelta: -4000, viewportHeight }), false);
  });
});

describe('sectionAnchorDelta measures from under the published header', () => {
  it('subtracts --sp-header-height from the section top, and is null when unmounted', () => {
    const previous = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle, window: globalThis.window };
    try {
      globalThis.window = {};
      globalThis.document = {
        documentElement: {},
        getElementById: (id) => (id === sectionId('map') ? { getBoundingClientRect: () => ({ top: 120 }) } : null),
      };
      globalThis.getComputedStyle = () => ({ getPropertyValue: () => '38px' });
      assert.equal(sectionAnchorDelta('map'), 82);
      assert.equal(sectionAnchorDelta('map', { extraOffset: 2 }), 80);
      assert.equal(sectionAnchorDelta('series'), null);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    }
  });
});

describe('the deep-link anchor hold on the Poker Near Me page', () => {
  const page = read('pages/hub/poker-near-me/[pnmTab].js');
  const start = page.indexOf('Keep the requested section anchored');
  const end = page.indexOf('}, [loading, scrollToSurface]);', start);
  const hold = page.slice(start, end);

  it('exists where the deep links expect it', () => {
    assert.ok(start > 0 && end > start, 'the anchor hold effect must stay in [pnmTab].js');
    assert.match(page, /import \{[^}]*isForeignScroll[^}]*sectionAnchorDelta[^}]*\} from '..\/..\/..\/src\/components\/poker-near-me\/pnmSections'/);
  });

  it('listens to every scroll and removes that listener when it ends', () => {
    assert.match(hold, /window\.addEventListener\('scroll', onDocumentScroll, \{ passive: true \}\)/);
    assert.match(hold, /window\.removeEventListener\('scroll', onDocumentScroll\)/);
    assert.match(hold, /function onDocumentScroll\(\) \{[\s\S]*?if \(visitorMoved\(\)\) \{\s*cleanup\(\);\s*return;\s*\}\s*heldY = window\.scrollY;/);
  });

  it('checks for a foreign scroll before every realignment, not after', () => {
    const realign = hold.slice(hold.indexOf('const realign = () => {'));
    const check = realign.indexOf('if (visitorMoved())');
    const scroll = realign.indexOf("scrollToSurface(key, { behavior: 'auto' })");
    assert.ok(check > 0 && scroll > check, 'realign must test visitorMoved() before it scrolls');
  });

  it('keeps the explicit-intent listeners and the bounded window', () => {
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      assert.match(hold, new RegExp(`window\\.addEventListener\\('${type}', cleanup`));
      assert.match(hold, new RegExp(`window\\.removeEventListener\\('${type}', cleanup, true\\)`));
    }
    assert.match(hold, /window\.setTimeout\(cleanup, 6400\)/);
  });
});

describe('the portaled global header keeps the viewport as its containing block', () => {
  // UniversalHeader portals the fixed header into <body>, so <html> and <body>
  // are its only ancestors. Any of these on either one makes `position: fixed`
  // scroll with the document instead of staying on screen.
  const FIXED_BREAKERS = /(^|;|\s)(transform|filter|perspective|backdrop-filter|-webkit-backdrop-filter|contain|container-type|will-change|content-visibility)\s*:\s*(?!none\b|normal\b|auto\b|visible\b)[^;]+/i;
  const ROOT_SELECTOR = /^(?:html|body|:root)(?:[.#[:][^\s>+~]*)?$/i;

  it('no global stylesheet gives <html> or <body> a property that captures fixed descendants', () => {
    const app = read('pages/_app.js');
    const sheets = [...app.matchAll(/^import ['"](\.\.\/[^'"]+\.css)['"];?/gm)].map((match) => join('pages', match[1]));
    assert.ok(sheets.length > 10, 'pages/_app.js must still import the global cascade');
    const offences = [];
    for (const sheet of sheets) {
      const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = rule[1].split(',').map((selector) => selector.trim());
        if (!selectors.some((selector) => ROOT_SELECTOR.test(selector))) continue;
        const declaration = rule[2].match(FIXED_BREAKERS);
        if (declaration) offences.push(`${sheet}: ${rule[1].trim()} { ${declaration[0].trim()} }`);
      }
    }
    assert.deepEqual(offences, []);
  });

  it('the header stays fixed to the viewport and portaled into <body>', () => {
    const header = read('src/components/ui/UniversalHeader.js');
    assert.match(header, /\.approved-global-header\s*\{[^}]*position: fixed;[^}]*inset: 0 0 auto;/);
    assert.match(header, /createPortal\(header, document\.body\)/);
  });
});

describe('the e2e pin measures what a visitor gets', () => {
  const spec = read('e2e/024-world-menu-mobile-phase3.spec.ts');
  const start = spec.indexOf("test('Poker Near Me deep Series route keeps its approved header trigger after document scroll'");
  const body = spec.slice(start, spec.indexOf('\ntest(', start + 1));

  it('reads the DOM pin and the protocol box at once, requires a reachable trigger and full viewport containment', () => {
    assert.ok(start > 0, 'the deep Series pin test must remain in e2e/024');
    assert.match(body, /getBoundingClientRect\(\)/);
    assert.match(body, /document\.elementFromPoint\(/);
    assert.match(body, /message: 'a tap at the trigger centre reaches the trigger'/);
    assert.match(body, /expect\(pin\.y \+ pin\.height\)\.toBeLessThanOrEqual\(PHONE\.height \+ 1\)/);
    assert.match(body, /const box = await trigger\.boundingBox\(\);\s*expect\(box\)\.not\.toBeNull\(\);/, 'the immediate protocol box read stays');
    assert.match(body, /expect\(box!\.y \+ box!\.height\)\.toBeLessThanOrEqual\(PHONE\.height \+ 1\)/);
    assert.match(body, /toBeInViewport\(\{ ratio: 1 \}\)/);
    assert.match(body, /expect\.poll\(async \(\) => \{\s*const box = await trigger\.boundingBox\(\);/);
  });
});
