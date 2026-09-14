/**
 * POKER NEWS: MOBILE PHASE 6 UPGRADES STAY APPLIED.
 *
 * Phase 6 (2026-09-13) rebuilt /hub/news on the phase 0 foundation and the
 * always-displayed standard. Every pin below is a defect that shipped on this
 * surface, so a later edit cannot quietly put it back:
 *
 *  - five sections (News, Reels, Videos, Events, Read Later) each rendered
 *    only when its tab was active, so four fifths of the page was hidden;
 *  - the section tab row was a hidden-scrollbar strip of 108px cards at 8px,
 *    the smallest type on the page;
 *  - the sidebar jumped ABOVE the feed on a phone and culled every widget but
 *    three with display: none;
 *  - the kicker, freshness label, story excerpt, view counts, bookmark count
 *    and the list rows' bookmark/share actions were all display: none;
 *  - a reels preview strip scrolled sideways with arrow buttons, duplicating
 *    the full reels section;
 *  - the source-filter chips were a sideways rail;
 *  - min-height: 100vh and bare overflow-x: hidden on the page container;
 *  - breakpoints at 390 and 1000.
 *
 * Changelog: docs/changelog/2026-09-13-mobile-phase6-poker-news.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const PAGE = 'pages/hub/news.js';
const STYLES = 'src/components/news/LiveWireStyles.js';
const TUTORIAL = 'src/tutorials/news.js';
const SURFACE = [PAGE, 'pages/hub/news/sources.js', STYLES, ...fs.readdirSync(path.join(ROOT, 'src/components/news')).map((f) => `src/components/news/${f}`)]
  .filter((f) => /\.(js|jsx)$/.test(f));

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the page is built on the phase 0a foundation', () => {
  const src = read(PAGE);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/);
  assert.match(src, /<HubPageShell className="news"/);
  assert.match(src, /<PullToRefresh onRefresh=\{refreshEverything\}/);
  assert.match(src, /useLoadFailsafe\(feedLoading, setFeedLoading\)/);
  assert.match(src, /const loading = swrLoading && feedLoading;/, 'the feed skeleton reads the capped flag');
  assert.match(src, /useModalHistory\(Boolean\(shareArticle\), closeShare\)/);
  assert.match(src, /useModalHistory\(reelViewerOpen, closeReelViewer\)/);
  assert.match(src, /useModalHistory\(Boolean\(articleReader\.open\), closeReader\)/);
  assert.match(src, /const refreshNewsFeed = useCallback\(\(\) => \{\s*if \(!requireOnline\(\)\) return/, 'refresh checks requireOnline');
});

test('every section is always on the page and the tab row is an anchor list', () => {
  const src = stripComments(read(PAGE));
  for (const sec of ['news', 'reels', 'videos', 'events', 'later']) {
    assert.doesNotMatch(src, new RegExp(`activeSection === '${sec}' && \\(`), `the ${sec} section is gated on activeSection`);
    assert.match(src, new RegExp(`id="news-section-${sec}"`), `the ${sec} section has its anchor id`);
  }
  assert.doesNotMatch(src, /activeSection === 'bookmarks' \|\| activeSection === 'later'\) && \(/);
  assert.match(src, /<nav className="section-tabs" aria-label="News sections" data-tutorial="sections">/);
  assert.doesNotMatch(src, /role="tablist"/, 'no tablist semantics on an anchor row');
  assert.doesNotMatch(src, /role="tab"/);
  assert.match(src, /target\.scrollIntoView\(/, 'selecting a section scrolls to it');
  // The tap records itself as a shallow ?tab= replace. The app shell used to
  // scroll to top on EVERY routeChangeComplete, shallow included, which undid
  // the section scroll 100ms after the tap. Next's own router does not reset
  // scroll on a shallow route; the shell now agrees.
  const app = read('pages/_app.js');
  assert.match(app, /const handleComplete = \(_url, \{ shallow = false \} = \{\}\) => \{/, 'handleComplete reads the shallow flag');
  assert.match(app, /if \(!shallow\) \{\s*window\.scrollTo\(0, 0\);/, 'the scroll-to-top is skipped on a shallow change');
  // The feed sits ABOVE the other four sections, so it must not load itself
  // as the reader scrolls past it: measured at 375, one anchor scroll to
  // Events grew the page from 13,931px to 20,807px and Events landed 7,000px
  // below where the tap asked. The next page is a 44px button, as are the
  // Reels and Videos caps.
  assert.doesNotMatch(src, /new IntersectionObserver\(/, 'the news feed auto-loads on scroll again');
  assert.match(src, /className="see-all-btn sp-show-more"[\s\S]{0,400}onClick=\{\(\) => \{ haptic\('light'\); loadMoreNews\(\); \}\}/, 'Load More is a button');
  assert.match(src, /setReelsVisible\(reels\.length\)/);
  assert.match(src, /setVideosVisible\(videos\.length\)/);
  assert.match(src, /\.sp-show-more \{[^}]*min-height: 44px/);
});

test('no hidden rail, no preview carousel, no culled content', () => {
  const banned = [/scrollbar-width\s*:\s*none/i, /scroll-snap-type\s*:/i, /scrollSnapType\s*:/, /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/i];
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const re of banned) assert.doesNotMatch(src, re, `${rel} reintroduced a hidden rail (${re})`);
  }
  const page = stripComments(read(PAGE));
  assert.doesNotMatch(page, /reels-carousel|carousel-arrow|reels-preview-section/, 'the preview strip is gone');
  assert.doesNotMatch(page, /order: -1/, 'the sidebar sits under the main column');
  const styles = stripComments(read(STYLES));
  assert.doesNotMatch(styles, /order: -1/);
  assert.doesNotMatch(styles, /\.source-filters \{[^}]*overflow-x: auto/);
  // The content culls named in ROLLOUT-PLAN, by selector.
  for (const sel of ['.news-desk-kicker', '.story-signal-copy', '.list-actions', '.bookmark-counter', '.widget:not(.leaderboard)']) {
    const re = new RegExp(`${sel.replace(/[.()]/g, '\\$&')}[^{]*\\{[^}]*display:\\s*none`);
    assert.doesNotMatch(page, re, `${sel} is culled in the page`);
    assert.doesNotMatch(styles, re, `${sel} is culled in LiveWireStyles`);
  }
});

test('100dvh, clip, and the three sanctioned breakpoints', () => {
  const allowed = new Set(['900', '768', '600']);
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const m of src.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/g)) assert.ok(allowed.has(m[1]), `${rel} uses a ${m[1]}px breakpoint`);
    assert.doesNotMatch(src, /min-height:\s*100vh/, `${rel} uses 100vh`);
    assert.doesNotMatch(src, /overflow-x:\s*hidden/, `${rel} uses overflow-x hidden (use clip)`);
    assert.doesNotMatch(src, /overflowX:\s*'hidden'/, `${rel} uses overflowX hidden (use clip)`);
  }
});

test('no font under 12px on the surface', () => {
  const tooSmall = (line) => line.replace(/^[^{]*\{/, '').split(';')
    .filter((d) => /^\s*font(-size)?\s*:/.test(d))
    .some((d) => { const v = d.replace(/^\s*font(-size)?\s*:/, '').replace(/\/\s*[\d.]+/g, ''); return [...v.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12); });
  const hits = [];
  for (const rel of SURFACE) {
    stripComments(read(rel)).split('\n').forEach((line, i) => {
      if (tooSmall(line)) hits.push(`${rel}:${i + 1}`);
      const m = line.match(/fontSize:\s*(\d+(?:\.\d+)?)(?![\d.])/); if (m && Number(m[1]) < 12) hits.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], `text under 12px:\n${hits.join('\n')}`);
});

test('the tutorial is registered for the prefix with eight steps whose targets exist', () => {
  assert.match(read('src/tutorials/index.js'), /prefix: '\/hub\/news', tutorial: NEWS_TUTORIAL/);
  const tut = read(TUTORIAL);
  assert.equal((tut.match(/^\s{4}\{\s*$/gm) || []).length, 8);
  assert.ok(!tut.includes(EM_DASH));
  const dom = read(PAGE);
  for (const t of [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'))) assert.match(dom, new RegExp(`data-tutorial="${t}"`), `no data-tutorial="${t}"`);
});

test('the budget row and the law count phase 6 as converted', () => {
  assert.equal(JSON.parse(read('scripts/ci/mobile-budget.json')).routes['/hub/news'].converted, true);
  const converted = JSON.parse(read('__tests__/no-slide-to-see.law.test.mjs').match(/const CONVERTED = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(converted.slice(0, 6), [1, 2, 3, 4, 5, 6]);
});
