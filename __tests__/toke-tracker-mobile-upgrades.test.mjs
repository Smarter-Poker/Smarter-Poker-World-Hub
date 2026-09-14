/**
 * TOKE TRACKER: MOBILE PHASE 11 UPGRADES STAY APPLIED.
 *
 * Phase 11 (2026-09-14) rebuilt /hub/toke-tracker and its four rooms on the
 * phase 0 foundation and the always-displayed standard. Every pin below is a
 * defect that shipped on this surface, so a later edit cannot quietly put it
 * back:
 *
 *  - all five pages carried `minHeight: 100vh`, `paddingBottom: 70` (doubling
 *    the app shell's BottomNavSpacer) and `overflowX: 'hidden'`, and none of
 *    them used HubPageShell;
 *  - the same 40 lines of preference state were copied into all five, and the
 *    four subpages read localStorage while the landing page read Supabase;
 *  - TokeDashboard hid three of its four charts behind a tab strip;
 *  - DealerVault hid three of its four document categories behind another;
 *  - the year calendar drew three months across a 375px phone, which made
 *    every day a 15px target, and the real 44px grid appeared only for the
 *    one month you expanded; its year arrows were 28x28;
 *  - the Jarvis question box was 14px, so iOS zoomed the page on focus;
 *  - the day's downs sat in a 300px inner scroller;
 *  - no modal closed on the phone back gesture.
 *
 * Changelog: docs/changelog/2026-09-14-mobile-phase11-toke-tracker.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EM_DASH = String.fromCharCode(0x2014);

const PAGES = [
  'pages/hub/toke-tracker/index.js',
  'pages/hub/toke-tracker/shift.js',
  'pages/hub/toke-tracker/analytics.js',
  'pages/hub/toke-tracker/vault.js',
  'pages/hub/toke-tracker/venues.js',
];
const CSS = 'src/styles/worlds/toke-tracker.css';
const TRACKER = 'src/components/bankroll/TokeTracker.jsx';
const DASHBOARD = 'src/components/bankroll/TokeDashboard.jsx';
const CALENDAR = 'src/components/bankroll/TokeCalendar.jsx';
const VAULT = 'src/components/bankroll/DealerVault.jsx';
const TUTORIAL = 'src/tutorials/toke-tracker.js';
const SURFACE = [...PAGES, CSS, TRACKER, DASHBOARD, CALENDAR, VAULT];

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('all five pages are built on the phase 0a foundation, and the prefs hook is shared', () => {
  for (const rel of PAGES) {
    const src = read(rel);
    assert.match(src, /import HubPageShell from '\.\.\/\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/, `${rel} uses the shell`);
    assert.match(src, /<HubPageShell\s+className="toke"/, `${rel} renders the shell`);
    assert.match(src, /header=\{<UniversalHeader pageDepth=\{\d\} onMenuClick=\{\(\) => setMenuOpen\(true\)\} \/>\}/, `${rel} hands the shell the shared header`);
    assert.match(src, /useTokePrefs\(/, `${rel} reads preferences from the shared hook`);
    assert.match(src, /getMenuConfig\('toke-tracker', user, tokePrefs, menuHandlers\)/, `${rel} feeds the hamburger from the hook`);
    assert.doesNotMatch(src, /toke-tracker-prefs/, `${rel} re-implements the prefs (use useTokePrefs)`);
    assert.doesNotMatch(src, /<PageTransition>/, `${rel} still wraps itself in PageTransition`);
  }
  // The four rooms refresh on a pull; the landing page has nothing to reload.
  for (const rel of PAGES.slice(1)) {
    assert.match(read(rel), /<PullToRefresh\s+onRefresh=\{refresh\w+\}/, `${rel} pulls to refresh`);
    assert.match(read(rel), /if \(!requireOnline\(\)\) return;/, `${rel} says so when offline`);
  }
  const hook = read('src/hooks/useTokePrefs.js');
  assert.match(hook, /export function useTokePrefs\(userId\)/);
  assert.match(hook, /toke-settings-sync/, 'cross-tab sync survives the move');
  assert.match(hook, /settings\.tokeTracker = next;/, 'the profile row is still written');
});

test('no page owns a 100vh, a bottom pad, or its own header', () => {
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    assert.doesNotMatch(src, /(?<![\w-])100vh/, `${rel} uses 100vh`);
    assert.doesNotMatch(src, /overflowX:\s*'hidden'/, `${rel} uses overflowX hidden (the shell owns it)`);
    assert.doesNotMatch(src, /overflow-x:\s*hidden/, `${rel} uses overflow-x hidden (use clip)`);
    assert.doesNotMatch(src, /paddingBottom: 70\b/, `${rel} pads its own bottom (BottomNavSpacer owns it)`);
  }
});

test('every chart and every document category is on the page, not behind a tab', () => {
  const dash = stripComments(read(DASHBOARD));
  assert.match(dash, /const CHART_SECTIONS = \[/, 'the four charts are a list of sections');
  assert.match(dash, /CHART_SECTIONS\.map\(section =>/, 'and all four render');
  assert.doesNotMatch(dash, /setActiveChart/, 'the chart tab strip is back');
  assert.doesNotMatch(dash, /CHART_TABS/, 'the chart tab strip is back');

  const vault = stripComments(read(VAULT));
  assert.match(vault, /const \[uploadCategory, setUploadCategory\] = useState\('gaming_license'\)/);
  assert.match(vault, /TABS\.map\(section => \{/, 'every category renders as its own section');
  assert.match(vault, /const sectionDocs = docsForCategory\(section\.id\);/);
  assert.doesNotMatch(vault, /setActiveTab/, 'the category tab strip is back');
  assert.doesNotMatch(vault, /s\.tabBar/, 'the category tab strip is back');
  // The upload form asks for the category instead of inheriting a tab.
  assert.match(vault, /aria-label="Document Category"/);
});

test('the calendar is one grid of 44px days, bounded by a Show All button', () => {
  const cal = stripComments(read(CALENDAR));
  assert.match(cal, /const INITIAL_MONTHS = 3;/);
  assert.match(cal, /visibleMonths = showAllMonths/, 'the months are bounded, then revealed by a button');
  assert.match(cal, /Show All Twelve Months Of/, 'and the button says so');
  assert.match(cal, /className="toke-cal-day"/, 'a day is a real button');
  assert.doesNotMatch(cal, /miniGrid|miniDay|expandedMonth/, 'the 15px condensed grid is back');
  assert.match(cal, /width: 44, height: 44, minWidth: 44, minHeight: 44/, 'the year arrows are 44px');
  assert.match(read(CSS), /\.toke-cal-day \{\s*min-height: 44px;/);
  // 350px is the arithmetic minimum for seven 44px day columns; a narrower
  // month card put every day at 38px on a desktop (measured at 1280).
  assert.match(read(CSS), /\.toke-cal-year-grid \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(350px, 1fr\)\)/);
  assert.match(read('pages/hub/toke-tracker/venues.js'), /maxWidth=\{960\}/, 'Venue Intel is wide enough for two month cards');
  // Both sheets close on the phone back gesture.
  assert.match(cal, /useModalHistory\(showAddModal, closeAddModal\)/);
  assert.match(cal, /useModalHistory\(Boolean\(showEventDetail\), closeEventDetail\)/);
  assert.match(cal, /className="bankroll-modal-overlay"/, 'the sheets use the shared 600px switch');
});

test('the back gesture closes every Toke Tracker sheet', () => {
  const src = stripComments(read(TRACKER));
  for (const pin of [
    /useModalHistory\(Boolean\(viewingReceiptUrl\), closeReceipt\)/,
    /useModalHistory\(Boolean\(endingDown\), closeEndingDown\)/,
    /useModalHistory\(showAddDown, closeAddDown\)/,
    /useModalHistory\(showAddExpense, closeAddExpense\)/,
    /useModalHistory\(confirmDelete, closeDeleteConfirm\)/,
  ]) assert.match(src, pin, `missing back-gesture close: ${pin}`);
  assert.match(src, /const haptic = useHaptics\(\);/);
  assert.match(src, /haptic\('medium'\); setShowAddDown\(true\)/, 'Add Down buzzes');
});

test('no font under 12px, inputs are exactly 16px, and the downs are not in a scroller', () => {
  const hits = [];
  for (const rel of SURFACE) {
    stripComments(read(rel)).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/fontSize:\s*'?(\d+(?:\.\d+)?)(?:px)?'?(?=\s*[,}])/g)) if (Number(m[1]) < 12) hits.push(`${rel}:${i + 1}`);
      for (const m of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) if (Number(m[1]) < 12) hits.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], `text under 12px:\n${hits.join('\n')}`);

  const css = read(CSS);
  assert.match(css, /\.toke-page input[^{]*\{[^}]*font-size: 16px !important;[^}]*min-height: 44px;/s, 'inputs are 16px and 44px');
  assert.match(css, /\.toke-page button[^{]*\{\s*min-height: 44px;/, 'every control is 44px');

  const tracker = stripComments(read(TRACKER));
  assert.match(tracker, /downsScroll: \{ display: 'flex'/, 'the downs list is not a capped scroller');
  assert.doesNotMatch(tracker, /maxHeight: 300, overflowY: 'auto'/);
  for (const name of ['formInput', 'jarvisInput', 'goalInput', 'editInlineInput', 'tokeInput']) {
    const block = tracker.match(new RegExp(`${name}: \\{[\\s\\S]{0,400}?\\},`));
    assert.ok(block && /fontSize: 16/.test(block[0]), `${name} is not 16px (iOS zooms on focus)`);
  }
});

test('no rail on the surface and only the three sanctioned breakpoints', () => {
  const banned = [/scrollbar-width\s*:\s*none/i, /scrollbarWidth\s*:\s*'none'/, /scroll-snap-type\s*:/i, /scrollSnapType\s*:/, /::-webkit-scrollbar\s*\{\s*display\s*:\s*none/i, /overflow-x:\s*auto/, /overflowX:\s*'auto'/];
  const allowed = new Set(['900', '768', '600']);
  for (const rel of SURFACE) {
    const src = stripComments(read(rel));
    for (const re of banned) assert.doesNotMatch(src, re, `${rel} reintroduced a rail (${re})`);
    for (const m of src.matchAll(/@media[^{]*\((?:max|min)-width:\s*(\d+)px\)/g)) {
      assert.ok(allowed.has(m[1]), `${rel} uses a ${m[1]}px breakpoint`);
    }
  }
});

test('the tutorial is registered for the prefix with eight steps whose targets exist', () => {
  assert.match(read('src/tutorials/index.js'), /prefix: '\/hub\/toke-tracker', tutorial: TOKE_TRACKER_TUTORIAL/);
  const tut = read(TUTORIAL);
  assert.equal((tut.match(/^\s{4}\{\s*$/gm) || []).length, 8);
  assert.ok(!tut.includes(EM_DASH));
  const dom = PAGES.map(read).join('\n');
  for (const t of [...tut.matchAll(/target: '([^']+)'/g)].flatMap((m) => m[1].split('|'))) {
    assert.match(dom, new RegExp(`data-tutorial="${t}"`), `no data-tutorial="${t}"`);
  }
});

test('every control is reachable: no bare div with an onClick on the surface', () => {
  // Four of these shipped, and three were primary actions: Tap To Scan
  // Document, the file drop zone, a document thumbnail, and the completed
  // event card. A div with an onClick is invisible to a keyboard and to a
  // screen reader, and it is not counted by the 44px budget either, because
  // that only measures buttons (mobile phase 11 sweep).
  const files = [...SURFACE,
    'src/components/bankroll/toke/AddDownModal.jsx',
    'src/components/bankroll/toke/AddExpenseModal.jsx',
    'src/components/bankroll/toke/CompletedEventsList.jsx',
    'src/components/bankroll/toke/DoubleDownPrompt.jsx',
  ];
  const hits = [];
  for (const rel of files) {
    read(rel).split('\n').forEach((line, i) => {
      if (!/<div[^>]*\bonClick=/.test(line)) return;
      // A scrim whose only job is "tap outside to close" is not a control:
      // it is aria-hidden and every such layer also has a real close button.
      if (/aria-hidden="true"/.test(line)) return;
      // stopPropagation on a wrapper is not a control either.
      if (/onClick=\{e => e\.stopPropagation\(\)\}/.test(line)) return;
      hits.push(`${rel}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(hits, [], `clickable <div> (make it a <button>):\n${hits.join('\n')}`);
});

test('the image-mapped Add Down controls are 44px and named', () => {
  const modal = read('src/components/bankroll/toke/AddDownModal.jsx');
  // 9% and 10% of a 399px-tall card at 375 is 36px and 40px. The zones are
  // absolutely positioned, so a min-height grows the hit area downward into
  // the artwork's lower bezel.
  assert.equal((modal.match(/minHeight: 44/g) || []).length, 4, 'all four undersized zones carry minHeight 44');
  for (const label of ['Cash Game', 'Tournament', 'On Break', 'Brush', 'Start Down', 'Cancel']) {
    assert.match(modal, new RegExp(`aria-label="${label}"`), `the ${label} zone is painted art with no text: it needs a name`);
  }
  // And the stylesheet no longer exempts them from the 44px floor.
  const css = read(CSS);
  assert.doesNotMatch(css, /button:not\(\.universal-header \*\):not\(\.hamburger-menu \*\):not\(\.toke-img-map-element\)/,
    'the image-mapped buttons are exempt from the 44px rule again');
  // The 16px rule is (0,4,1) specific, so overriding it from a (0,2,0)
  // selector loses even with !important and the painted fields rendered at
  // 16px. Measured in a browser: they must be EXCLUDED from it, not
  // overridden after it.
  assert.match(css, /\.toke-page input[^,]*:not\(\.toke-img-map-element\),/,
    'the painted fields must be excluded from the 16px rule, not overridden after it');
  assert.match(css, /\.toke-page select:not\(\.toke-img-map-element\),/);
  assert.match(css, /\.toke-page \.toke-img-map-element \{\s*font-size: 18px !important;\s*min-height: 44px;/,
    'the painted fields keep their 18px and the 44px floor');
});

test('the load failsafe guards a skeleton that actually renders', () => {
  // useLoadFailsafe clears a stuck flag after 8s. On both pages that flag was
  // read by nothing, so the failsafe protected a skeleton that did not exist.
  for (const rel of ['pages/hub/toke-tracker/vault.js', 'pages/hub/toke-tracker/venues.js']) {
    const src = read(rel);
    assert.match(src, /useLoadFailsafe\(gigsLoading, setGigsLoading\)/, `${rel} has the failsafe`);
    assert.match(src, /gigsLoading[\s\S]{0,120}toke-skel/, `${rel} renders a skeleton from it`);
  }
  assert.match(read(CSS), /\.toke-skel \{/, 'one skeleton class');
  assert.match(read(CSS), /@keyframes tokeShimmer/, 'one shimmer keyframe');
  assert.match(read(CSS), /prefers-reduced-motion: reduce\) \{\s*\.toke-skel \{ animation: none; \}/);
});

test('the budget rows and the law count phase 11 as converted', () => {
  const budget = JSON.parse(read('scripts/ci/mobile-budget.json')).routes;
  assert.equal(budget['/hub/toke-tracker'].converted, true);
  const converted = JSON.parse(read('__tests__/no-slide-to-see.law.test.mjs').match(/const CONVERTED = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(converted, [1, 2, 3, 4, 5, 6, 7, 9, 10, 11], 'every surviving phase of the rollout is converted');
});
