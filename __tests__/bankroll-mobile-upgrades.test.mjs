/**
 * BANKROLL MANAGER: MOBILE PHASE 1B UPGRADES STAY APPLIED.
 *
 * Phase 1b (2026-09-03) re-did the Bankroll Manager on the phase 0a
 * foundation: HubPageShell, the 8s load failsafe, back-gesture modals,
 * bottom-sheet modals at 600px, the first-visit tutorial, lazy sections,
 * no text under 12px, and Recharts kept out of the page chunk. Each pin
 * below is one of those, so a later edit cannot quietly undo it.
 *
 * Changelog: docs/changelog/2026-09-03-mobile-phase1b-bankroll-full-upgrade.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PAGE = 'pages/hub/bankroll-manager.js';
const TUTORIAL = 'src/components/bankroll/BankrollTutorial.jsx';
const LOG_MODAL = 'src/components/bankroll/LogEntryModal.jsx';
const COMPONENT_DIR = 'src/components/bankroll';

test('the page is built on the phase 0a foundation', () => {
  const src = read(PAGE);
  assert.match(src, /import HubPageShell from '\.\.\/\.\.\/src\/components\/ui\/HubPageShell'/);
  assert.match(src, /<HubPageShell className="bankroll"/);
  assert.match(src, /useLoadFailsafe\(isLoading, setIsLoading\)/);
  assert.match(src, /useInitialLoadRef\(\)/);
  assert.ok(
    src.includes('useModalHistory') || src.includes('BankrollTutorial'),
    'page wires useModalHistory or the BankrollTutorial'
  );
  assert.match(src, /useOnlineStatus\(\)/);
  assert.match(src, /You Are Offline\. Try Again When Connected\./);
  assert.match(src, /useHaptics\(\)/);
  assert.doesNotMatch(src, /100vh/, 'no 100vh left on the page');
});

test('the tutorial exists, has seven steps and the versioned localStorage key', () => {
  const src = read(TUTORIAL);
  assert.match(src, /bankroll_tutorial_seen_v1/);
  const stepsBlock = src.slice(src.indexOf('export const TUTORIAL_STEPS'), src.indexOf('export function hasSeenBankrollTutorial'));
  const ids = [...stepsBlock.matchAll(/^\s{2}\{\s*$/gm)];
  assert.equal(ids.length, 7, `expected 7 tutorial steps, found ${ids.length}`);
  assert.match(src, /useModalHistory\(open, close\)/);
  assert.match(src, /data-tutorial=/);
  assert.match(read(PAGE), /data-tutorial="add-button"/);
  assert.match(read(PAGE), /<BankrollTutorial open=\{showTutorial\}/);
});

test('no text under 12px on the page or in any bankroll component', () => {
  const files = [PAGE, ...fs.readdirSync(path.join(ROOT, COMPONENT_DIR)).map((f) => path.join(COMPONENT_DIR, f))]
    .filter((f) => /\.(js|jsx)$/.test(f));
  const small = /fontSize:\s*(?:[0-9]|1[01])\b|font-size:\s*(?:[0-9]|1[01])px/;
  const offences = files.flatMap((f) =>
    read(f).split('\n').map((line, i) => (small.test(line) ? `${f}:${i + 1}: ${line.trim()}` : null)).filter(Boolean)
  );
  assert.deepEqual(offences, [], `text under 12px:\n${offences.join('\n')}`);
});

test('Recharts is not imported at page top level', () => {
  const src = read(PAGE);
  assert.doesNotMatch(src, /^import[^\n]*from\s+['"]recharts['"]/m);
  assert.doesNotMatch(src, /require\(['"]recharts['"]\)/);
});

test('off-dashboard sections are lazy with the skeleton loader', () => {
  const src = read(PAGE);
  for (const name of ['TripTracker', 'SeriesTracker', 'PlayerNotes', 'StakingTracker', 'TaxReportPanel', 'TokeTracker', 'TournamentCalendar', 'LocationAnalytics', 'VarianceCalculator', 'HistoricalComparison']) {
    assert.match(src, new RegExp(`const ${name} = lazySection\\(\\(\\) => import\\(`), `${name} is lazy`);
    assert.doesNotMatch(src, new RegExp(`^import ${name} from`, 'm'), `${name} has no eager import`);
  }
  assert.match(src, /className="bankroll-skel"/);
});

test('LogEntryModal is a back-gesture bottom sheet with safe-area padding', () => {
  const src = read(LOG_MODAL);
  assert.match(src, /safe-area-inset/);
  assert.match(src, /useModalHistory/);
  assert.match(src, /className="bankroll-modal-overlay"/);
  assert.match(src, /className="bankroll-modal-close sp-icon-btn"/);
  assert.match(src, /className="bankroll-modal-footer"/);
  assert.match(src, /inputMode="decimal"/);
});

test('every bankroll modal carries the sheet classes and the back-gesture hook', () => {
  for (const f of ['StartingBankrollModal', 'AdjustBankrollModal', 'ManageVenuesModal', 'BankrollProjection']) {
    const src = read(`${COMPONENT_DIR}/${f}.jsx`);
    assert.match(src, /useModalHistory/, `${f} uses useModalHistory`);
    assert.match(src, /className="bankroll-modal"/, `${f} has the sheet container class`);
    assert.match(src, /bankroll-modal-close/, `${f} has a 44px close control`);
  }
});

test('bankroll.css holds the sheet rules under the one 600px breakpoint and the skeleton', () => {
  const css = read('src/styles/worlds/bankroll.css');
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.bankroll-modal \{[^}]*max-height: 92dvh/);
  assert.match(css, /\.bankroll-modal \{[^}]*border-radius: 16px 16px 0 0/);
  assert.match(css, /\.bankroll-modal \{[^}]*safe-area-inset-bottom/);
  assert.match(css, /\.bankroll-skel \{/);
  assert.match(css, /@keyframes bankrollShimmer/);
  assert.match(css, /\.bankroll-sheet-handle/);
});

test('no bankroll table is a raw <table> any more', () => {
  const files = fs.readdirSync(path.join(ROOT, COMPONENT_DIR)).filter((f) => /\.jsx?$/.test(f));
  const raw = files.filter((f) => /<table\b/.test(read(path.join(COMPONENT_DIR, f))));
  assert.deepEqual(raw, [], `raw tables (use ResponsiveTable): ${raw.join(', ')}`);
});
