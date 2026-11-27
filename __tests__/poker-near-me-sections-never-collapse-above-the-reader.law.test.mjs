/**
 * LAW: a Poker Near Me section never collapses while its content is still
 * on the way.
 *
 * Global Footer E2E failed about half its WebKit runs at
 * e2e/024-world-menu-mobile-phase3.spec.ts "Poker Near Me deep Series route
 * keeps its approved header trigger after document scroll" (y = 1974 to 2007
 * against a bound of 813). A CI probe watched the document while the test
 * scrolled to the bottom of the deep Series route: as soon as the first
 * tours, series and daily requests settled, the page swapped its first-paint
 * card skeletons for panels that rendered nothing (the venue list's dynamic
 * chunk had no loading placeholder) or a 240px strip (the daily list's
 * LazyPanel placeholder). The venue section fell from 1641px to 105px, the
 * daily section from 804px to 288px, and the document from 10944px to 8911px
 * under a reader at the bottom. The scroll position clamped from 10073 to
 * 8099 and WebKit, which has no scroll anchoring, laid the fixed header out
 * against the stale layout viewport (10073 - 8099 = 1974px down) until the
 * next frame. Chromium's scroll anchoring hid the same collapse.
 *
 * The rule: every placeholder that takes over from a first-paint skeleton is
 * that same skeleton, so a hand-off never shrinks the page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ts = require('typescript');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const PAGE = read('pages/hub/poker-near-me/[pnmTab].js');
const LAZY = read('src/components/poker-near-me/LazyPanel.jsx');
const SKELETONS = read('src/components/poker-near-me/CardSkeletons.jsx');
const VENUES_PANEL = read('src/components/poker-near-me/VenuesTabPanel.jsx');

function compile(source, scope = {}) {
  const out = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const module = { exports: {} };
  vm.runInNewContext(out.outputText, { require, module, exports: module.exports, ...scope });
  return module.exports;
}

const skeletons = compile(SKELETONS);
const CardSkeletons = skeletons.default;
const { SkeletonCard, VENUE_SKELETON_CARDS: VENUE_CARDS, DAILY_SKELETON_CARDS: DAILY_CARDS } = skeletons;
const LazyPanel = compile(LAZY).default;

function dynamicOptions(component, source = PAGE) {
  const start = source.indexOf(`const ${component} = dynamic(`);
  assert.ok(start >= 0, `${component} must stay a dynamic chunk`);
  const end = source.indexOf(';\n', start);
  return source.slice(start, end);
}

function sectionSource(name) {
  const start = PAGE.indexOf(`const ${name} = (`);
  assert.ok(start >= 0, `${name} must exist`);
  return PAGE.slice(start, PAGE.indexOf('\n  );\n', start));
}

describe('the card skeleton', () => {
  it('renders the requested number of skeleton cards and nothing interactive', () => {
    assert.ok(VENUE_CARDS > 0 && DAILY_CARDS > 0);
    for (const count of [VENUE_CARDS, DAILY_CARDS]) {
      const html = renderToStaticMarkup(React.createElement(CardSkeletons, { count }));
      assert.equal((html.match(/class="entity-card skeleton-card"/g) || []).length, count);
      assert.doesNotMatch(html, /<(button|a|input)\b/);
    }
  });

  it('one skeleton card is one slot of the grid', () => {
    const grid = renderToStaticMarkup(React.createElement(CardSkeletons, { count: 1 }));
    assert.ok(grid.includes(renderToStaticMarkup(React.createElement(SkeletonCard))));
  });

  it('is the one skeleton the page draws on first paint', () => {
    assert.match(PAGE, /import CardSkeletons, \{\s*DAILY_SKELETON_CARDS,\s*VENUE_SKELETON_CARDS,\s*\} from '\.\.\/\.\.\/\.\.\/src\/components\/poker-near-me\/CardSkeletons';/);
    assert.match(PAGE, /const renderSkeletons = \(count = VENUE_SKELETON_CARDS\) => <CardSkeletons count=\{count\} \/>;/);
    assert.doesNotMatch(PAGE, /skeleton-card/, 'no second hand-drawn skeleton grid in the page');
  });
});

describe('the venue section keeps its height from first paint to the list', () => {
  const venues = sectionSource('venuesSection');

  it('first paint draws the venue skeleton', () => {
    assert.match(venues, /renderSkeletons\(VENUE_SKELETON_CARDS\)/);
  });

  it('the venue list chunk loads behind the same skeleton, never behind nothing', () => {
    assert.match(dynamicOptions('VenuesTabPanel'), /loading: \(\) => <CardSkeletons count=\{VENUE_SKELETON_CARDS\} \/>/);
  });

  it('every card in the list loads behind a skeleton card, never behind an empty slot', () => {
    assert.match(VENUES_PANEL, /import \{ SkeletonCard \} from '\.\/CardSkeletons';/);
    for (const card of ['VenueCard', 'RichTourCard']) {
      assert.match(dynamicOptions(card, VENUES_PANEL), /loading: \(\) => <SkeletonCard \/>/, `${card} needs the skeleton card while its chunk loads`);
    }
  });
});

describe('the daily section keeps its height from first paint to the list', () => {
  const events = sectionSource('eventsSection');
  const dailyStart = events.indexOf("id={sectionId('daily')}");
  const daily = events.slice(dailyStart, events.indexOf("id={sectionId('tours')}"));

  it('first paint draws the daily skeleton', () => {
    assert.ok(dailyStart > 0, 'the daily subsection must stay in the events section');
    assert.match(daily, /renderSkeletons\(DAILY_SKELETON_CARDS\)/);
  });

  it('the not-yet-mounted daily panel holds the same skeleton', () => {
    assert.match(daily, /<LazyPanel placeholder=\{<CardSkeletons count=\{DAILY_SKELETON_CARDS\} \/>\}>/);
  });

  it('the daily list chunk loads behind the same skeleton', () => {
    assert.match(dynamicOptions('DailyTournamentsTabPanel'), /loading: \(\) => <CardSkeletons count=\{DAILY_SKELETON_CARDS\} \/>/);
  });
});

describe('LazyPanel shows the placeholder it is given until it mounts', () => {
  it('a custom placeholder replaces the 240px strip', () => {
    const placeholder = React.createElement(CardSkeletons, { count: DAILY_CARDS });
    const html = renderToStaticMarkup(React.createElement(LazyPanel, { placeholder }, React.createElement('p', null, 'panel')));
    assert.match(html, /data-mounted="false"/);
    assert.equal(html, renderToStaticMarkup(React.createElement(LazyPanel, null, null)).replace(
      /<div class="pnm-skel"[^>]*><\/div>/,
      renderToStaticMarkup(placeholder),
    ));
    assert.doesNotMatch(html, /panel<\/p>/);
  });

  it('an eager panel renders its children', () => {
    const html = renderToStaticMarkup(React.createElement(LazyPanel, { eager: true }, React.createElement('p', null, 'panel')));
    assert.match(html, /<p>panel<\/p>/);
  });
});

// A browser stand-in for LazyPanel's effects: the test fires the observers.
function fakeBrowser() {
  const io = [];
  const ro = [];
  const timers = [];
  const window = {
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; io.push(this); }
      observe() {}
      disconnect() { this.off = true; }
    },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; ro.push(this); }
      observe() {}
      disconnect() { this.off = true; }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  return {
    window,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    intersect: () => io.filter((o) => !o.off).forEach((o) => o.callback([{ isIntersecting: true }])),
    resized: () => ro.filter((o) => !o.off).forEach((o) => o.callback([])),
    timers,
  };
}

function mountLazy(browser, { placeholderHeight, eager = false } = {}) {
  const Lazy = compile(LAZY, browser).default;
  const host = { children: [], getBoundingClientRect: () => ({ height: placeholderHeight }) };
  const Panel = ({ draw }) => (draw ? React.createElement('p', null, 'panel') : null);
  let tree;
  const render = (draw) => React.createElement(Lazy, { minHeight: 260, eager }, React.createElement(Panel, { draw }));
  act(() => {
    tree = create(render(false), { createNodeMock: (element) => (element.type === 'div' ? host : null) });
  });
  return {
    host,
    // The style object comes from the panel's own realm; compare its value.
    style: () => { const st = tree.toJSON().props.style; return st ? { ...st } : undefined; },
    mounted: () => tree.toJSON().props['data-mounted'],
    draw: () => act(() => {
      tree.update(render(true));
      host.children = [{ getBoundingClientRect: () => ({ height: 120 }) }];
    }),
    unmount: () => act(() => tree.unmount()),
  };
}

describe('LazyPanel holds the placeholder height until the panel draws', () => {
  it('a panel that draws nothing yet (a dynamic chunk still loading) keeps the placeholder height', () => {
    const browser = fakeBrowser();
    const panel = mountLazy(browser, { placeholderHeight: 308 });
    assert.equal(panel.mounted(), 'false');
    assert.equal(panel.style(), undefined);
    act(() => browser.intersect());
    assert.equal(panel.mounted(), 'true');
    assert.deepEqual(panel.style(), { minHeight: 308 }, 'the 308px Best Time slot must not fall to its 48px heading');
    act(() => browser.resized());
    assert.deepEqual(panel.style(), { minHeight: 308 }, 'still nothing drawn, still held');
    panel.draw();
    act(() => browser.resized());
    assert.equal(panel.style(), undefined, 'once the panel has a height the hold lets go');
    panel.unmount();
  });

  it('a panel that never draws gives the space back after the hold limit', () => {
    const browser = fakeBrowser();
    const panel = mountLazy(browser, { placeholderHeight: 320 });
    act(() => browser.intersect());
    assert.deepEqual(panel.style(), { minHeight: 320 });
    const safety = browser.timers.find((t) => !t.cleared && t.ms >= 5000);
    assert.ok(safety, 'a bounded hold');
    act(() => safety.fn());
    assert.equal(panel.style(), undefined);
    panel.unmount();
  });

  it('an eager panel and an unmeasurable placeholder hold nothing', () => {
    const eager = mountLazy(fakeBrowser(), { placeholderHeight: 300, eager: true });
    assert.equal(eager.mounted(), 'true');
    assert.equal(eager.style(), undefined);
    eager.unmount();
    const browser = fakeBrowser();
    const flat = mountLazy(browser, { placeholderHeight: 0 });
    act(() => browser.intersect());
    assert.equal(flat.style(), undefined);
    flat.unmount();
  });
});

describe('every first-paint skeleton in the stacked sections has a matching hand-off', () => {
  it('the page draws exactly the two audited first-paint skeletons', () => {
    const uses = PAGE.match(/renderSkeletons\([^)]*\)/g) || [];
    assert.deepEqual(uses.sort(), ['renderSkeletons(DAILY_SKELETON_CARDS)', 'renderSkeletons(VENUE_SKELETON_CARDS)'],
      'a new first-paint skeleton needs a same-height hand-off and a line in this law');
  });
});
