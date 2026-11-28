/**
 * Bankroll Manager page shell: every address goes somewhere real, the
 * dashboard filters read back only allowed values, the page is not remounted
 * by its own navigation, and saves do not reload twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TIME_FILTERS, CHART_TYPES, CHART_TYPE_LABELS, GAME_TYPES,
  sanitizeTimeFilter, sanitizeChartType, sanitizeGameTypes, toggleGameType, nextMenuIndex,
} from '../src/lib/bankroll/dashboardFilters.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = read('pages/hub/bankroll-manager.js');

// The page's own view table and resolver, evaluated as written.
function pageViews() {
  const start = PAGE.indexOf('const SIDEBAR_SECTIONS = [');
  const end = PAGE.indexOf('// Accounting-only categories');
  const art = PAGE.slice(PAGE.indexOf('const HEADER_ART = '), PAGE.indexOf('\n', PAGE.indexOf('const HEADER_ART = ')));
  assert.ok(start > 0 && end > start && art, 'view table, resolver and header art are where the page keeps them');
  // eslint-disable-next-line no-new-func
  return new Function(`${PAGE.slice(start, end)}\n${art}\nreturn { SIDEBAR_SECTIONS, MENU_SECTION_TITLES, resolveBankrollView, HEADER_ART };`)();
}

test('stored and linked filter values are read through the allowed options', () => {
  assert.equal(sanitizeTimeFilter('Last 7 Days'), 'Last 7 Days');
  assert.equal(sanitizeTimeFilter('Last 14 Days'), 'All Time');
  assert.equal(sanitizeTimeFilter(undefined), 'All Time');
  assert.equal(sanitizeChartType('donut'), 'donut');
  assert.equal(sanitizeChartType('pie'), 'line');
  for (const type of CHART_TYPES) assert.ok(CHART_TYPE_LABELS[type], `${type} has a label`);
  assert.equal(TIME_FILTERS.length, 5);
});

test('game types keep display order, drop unknowns, and keep an empty choice', () => {
  assert.deepEqual(sanitizeGameTypes(undefined), GAME_TYPES);
  assert.deepEqual(sanitizeGameTypes('not json'), GAME_TYPES, 'a meaningless link shows everything');
  assert.deepEqual(sanitizeGameTypes('sports,poker_cash'), ['poker_cash', 'sports']);
  assert.deepEqual(sanitizeGameTypes(['slots', 'slots', 'bogus', 'poker_mtt']), ['poker_mtt', 'slots']);
  assert.deepEqual(sanitizeGameTypes([]), []);
  assert.deepEqual(toggleGameType(GAME_TYPES, 'slots'), ['poker_cash', 'poker_mtt', 'casino_table', 'sports']);
  assert.deepEqual(toggleGameType(['sports'], 'poker_cash'), ['poker_cash', 'sports']);
  assert.deepEqual(toggleGameType(['sports'], 'expense'), ['sports'], 'expense is not a game type');
});

test('filter menus move focus with the arrow keys, Home and End, and wrap', () => {
  assert.equal(nextMenuIndex(-1, 'ArrowDown', 4), 0);
  assert.equal(nextMenuIndex(3, 'ArrowDown', 4), 0);
  assert.equal(nextMenuIndex(0, 'ArrowUp', 4), 3);
  assert.equal(nextMenuIndex(-1, 'ArrowUp', 4), 3);
  assert.equal(nextMenuIndex(2, 'Home', 4), 0);
  assert.equal(nextMenuIndex(0, 'End', 4), 3);
  assert.equal(nextMenuIndex(1, 'a', 4), null);
  assert.equal(nextMenuIndex(0, 'ArrowDown', 0), null);
});

test('every sidebar, menu and footer address opens a real view', () => {
  const { SIDEBAR_SECTIONS, MENU_SECTION_TITLES, resolveBankrollView, HEADER_ART } = pageViews();
  // Formerly unreachable: both fell back to the dashboard.
  assert.equal(resolveBankrollView('leaks'), 'leaks');
  assert.equal(resolveBankrollView('hand-review'), 'hand-review');
  assert.equal(resolveBankrollView('pro'), 'dashboard', 'the retired Pro block is gone, not half-reachable');
  assert.equal(resolveBankrollView('advanced-tax'), 'tax');
  assert.equal(resolveBankrollView('scan-receipt'), 'dashboard', 'popups open over the dashboard');
  assert.equal(resolveBankrollView('obsolete-bookmark'), 'dashboard');

  const views = [...SIDEBAR_SECTIONS.filter((s) => !s.action && !['scan-receipt', 'projection', 'toke-tracker'].includes(s.id)).map((s) => s.id), ...Object.keys(MENU_SECTION_TITLES)];
  for (const view of views) {
    assert.equal(resolveBankrollView(view), view, `${view} resolves to itself`);
    assert.match(PAGE, new RegExp(`activeSection === '${view}'`), `${view} renders something`);
    const art = HEADER_ART[view] || view;
    assert.ok(existsSync(join(ROOT, `public/images/smarterdesign/headers/${art}-scene.webp`)), `${view} header art ${art} exists`);
  }

  const footer = JSON.parse(read('src/config/world-footer-navigation.json')).worlds.find((w) => w.id === 'bankroll-manager');
  const menu = read('src/config/hamburgerMenus.js');
  const bankrollMenu = menu.slice(menu.indexOf("'bankroll-manager': (user"), menu.indexOf("'poker-near-me': (user"));
  const menuHrefs = [...bankrollMenu.matchAll(/'(\/hub\/bankroll-manager[^']*)'/g)].map((m) => m[1]);
  for (const href of [...footer.items.map((i) => i.href), ...menuHrefs]) {
    const url = new URL(href, 'https://smarter.poker');
    if (url.pathname !== '/hub/bankroll-manager') {
      assert.ok(existsSync(join(ROOT, `pages${url.pathname}.js`)), `${href} has a page`);
      continue;
    }
    const view = url.searchParams.get('view');
    const type = url.searchParams.get('type');
    if (type) { assert.match(PAGE, new RegExp(`${type}: '`), `${href} is a known ?type=`); continue; }
    if (view === 'log-session' || view === 'dashboard') continue; // the Log sheet and the dashboard itself
    assert.notEqual(resolveBankrollView(view), 'dashboard', `${href} does not silently fall back to the dashboard`);
  }
  assert.match(bankrollMenu, /Leak Analysis', '\/hub\/bankroll-manager\?view=leaks'/);
});

test('the page keeps one instance across its own ?view= and ?type= changes', async () => {
  const app = read('pages/_app.js');
  const expression = app.match(/const pageErrorBoundaryKey = ([\s\S]*?);/)[1];
  // eslint-disable-next-line no-new-func
  const key = new Function('resolvedPath', 'router', `return (${expression});`);
  const at = (asPath) => key('/hub/bankroll-manager', { asPath });
  assert.equal(at('/hub/bankroll-manager?view=trips'), at('/hub/bankroll-manager?type=cash'));
  assert.equal(at('/hub/bankroll-manager'), at('/hub/bankroll-manager?view=log-session'));
  assert.notEqual(key('/hub/news', { asPath: '/hub/news?q=a' }), key('/hub/news', { asPath: '/hub/news?q=b' }), 'other routes keep the old reset');
  // Without the remount each view needs its own crash boundary, reset per view.
  assert.match(PAGE, /<HubErrorBoundary key=\{`\$\{activeSection\}:\$\{categoryFilter\}`\}/);
  // ...and the dashboard's overlays close when it is left.
  assert.match(PAGE, /setShowAllEntries\(false\);\s*setOpenFilter\(null\);\s*\}, \[activeSection, categoryFilter\]\);/);
});

test('a save reloads the dashboard once', () => {
  const modal = read('src/components/bankroll/LogEntryModal.jsx');
  const dispatch = modal.indexOf("window.dispatchEvent(new CustomEvent('bankroll-updated'))");
  assert.ok(dispatch > 0 && dispatch < modal.indexOf('onSubmit(entry, saved'), 'the modal announces the save before handing it back');
  assert.match(PAGE, /window\.addEventListener\('bankroll-updated', loadData\)/);
  const submit = PAGE.slice(PAGE.indexOf('const handleLogSubmit'), PAGE.indexOf('// Bankroll Rules are judged against the row just saved'));
  assert.doesNotMatch(submit, /loadData\(\)/, 'the handler does not read the ledger a second time');
  // The dashboard no longer runs the leak analysis on every load.
  const load = PAGE.slice(PAGE.indexOf('const loadData = useCallback'), PAGE.indexOf('}, [userId, authInitializing, locationFilter, timeFilter, reportScope]);'));
  assert.doesNotMatch(load, /runLeakAnalysis/);
  assert.match(load, /getUserLocations\(userId\)\.catch\(/, 'a venue-list failure does not blank the dashboard');
  assert.match(PAGE, /failedScope === reportScope && \(\s*<div role="alert"[^>]*data-testid="bankroll-load-failed"/);
});

test('a refused Log deep link clears its address so the footer Log button works again', () => {
  assert.match(PAGE, /if \(requestedView === 'log-session'\) \{\s*void handleLogClick\(\)\.then\(\(opened\) => \{[\s\S]*?if \(!opened\) clearActionView\('log-session'\);/);
  const click = PAGE.slice(PAGE.indexOf('const handleLogClick = useCallback'), PAGE.indexOf('}, [userId, bankrollInitialized, guardAction, requireOnline]);'));
  assert.equal((click.match(/return true;/g) || []).length, 2, 'only an opened sheet or sign-in prompt reports success');
});

test('filters are one accessible menu component; no page-wide click listener', () => {
  const menu = read('src/components/bankroll/BankrollFilterMenu.jsx');
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /aria-pressed=/);
  assert.match(menu, /event\.key === 'Escape'/);
  assert.match(menu, /addEventListener\('pointerdown'/);
  assert.match(menu, /type="button"/);
  assert.equal((PAGE.match(/<BankrollFilterMenu/g) || []).length, 4);
  assert.doesNotMatch(PAGE, /document\.addEventListener\('click'/);
  assert.doesNotMatch(PAGE, /showChartTypeDropdown|showLocationDropdown/);
});

test('settings are real: Display EUR is in Settings, Venue Alerts gate the arrival alert, Auto-Save is gone', () => {
  assert.match(PAGE, /updatePreference\('currencyEUR', e\.target\.checked\)/);
  assert.match(PAGE, /if \(!notificationsRef\.current\) return;\s*\/\/ Request permission/);
  assert.doesNotMatch(PAGE, /autoSave/);
  assert.doesNotMatch(read('src/config/hamburgerMenus.js'), /setAutoSave\b/);
  // A failed save moves the switch back.
  assert.match(PAGE, /setPreferences\(prev => \(\{ \.\.\.prev, \[key\]: previous \}\)\)/);
});

test('category views log through the page gates and never sit on Loading when signed out', () => {
  const category = read('src/components/bankroll/CategoryOverview.jsx');
  assert.doesNotMatch(category, /import LogEntryModal/);
  assert.match(category, /addEventListener\('bankroll-updated', loadData\)/);
  assert.match(category, /useState\(Boolean\(userId\)\)/);
  assert.match(PAGE, /<CategoryOverview[\s\S]*?onAddEntry=\{handleLogClick\}[\s\S]*?onEditEntry=\{handleEditEntry\}/);
  assert.match(PAGE, /defaultCategory=\{defaultReceiptCategory \|\| \(!editEntry && categoryFilter !== 'all' \? categoryFilter : null\)\}/);
});

test('Quick Log is removed rather than left mounted nowhere', () => {
  assert.equal(existsSync(join(ROOT, 'src/components/bankroll/QuickLogWidget.jsx')), false);
  assert.doesNotMatch(read('src/components/bankroll/index.js'), /QuickLogWidget/);
});

test('Leak Analysis reads its own analysis and tells loading, failure and empty apart', () => {
  const view = read('src/components/bankroll/LeakAnalysisView.jsx');
  assert.match(view, /status === 'failed'[\s\S]*role="alert"[\s\S]*Retry/);
  assert.match(view, /status === 'loading' && !analysis/);
  assert.match(view, /analysis && leaks\.length === 0/);
  assert.match(view, /addEventListener\('bankroll-updated', load\)/);
  assert.match(PAGE, /const LeakAnalysisView = lazySection\(/);
});
