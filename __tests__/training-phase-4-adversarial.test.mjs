import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('the alternate-drill CTA clears filters and moves keyboard focus to the full library', () => {
  const source = read('pages/hub/training.js');
  const controls = read('src/components/training/lobby/TrainingLobbyControls.jsx');

  assert.match(source, /const browseTrainingLibrary = useCallback/);
  assert.match(source, /const browseTrainingLibrary = useCallback\(\(\) => \{\s*setFilters\(DEFAULT_LOBBY_FILTERS\)/);
  assert.match(source, /onResetFilters=\{browseTrainingLibrary\}/);
  assert.match(source, /onClick=\{browseTrainingLibrary\}/);
  assert.match(source, /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /scrollIntoView\(\{/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /id="training-library"/);
  assert.match(source, /headingRef=\{libraryHeadingRef\}/);
  assert.match(controls, /ref=\{headingRef\}[\s\S]*?tabIndex=\{-1\}/);
});

test('the hub reads persisted active leaks instead of calling a nonexistent analyzer method', () => {
  const source = read('pages/hub/training.js');

  assert.match(source, /import \{ leakService \} from '\.\.\/\.\.\/src\/services\/LeakService'/);
  assert.match(source, /leakService\.getActiveLeaks\(authUser\.id\)/);
  assert.match(source, /filter\(row => row && row\.is_active !== false && !row\.resolved_at\)/);
  assert.match(source, /TRAINING_LIBRARY\.find\(game => game\.id\.toLowerCase\(\) === drillId\)/);
  assert.match(source, /href="\/hub\/training\/weakness-scanner"/);
  assert.doesNotMatch(source, /const biggestLeak = useMemo\(\(\) => leakAnalyzer/);
  assert.doesNotMatch(source, /You're losing \{biggestLeak\.bbPer100/);
});

test('grade copy is unambiguous and page-owned tokens cannot bleed into the global header', () => {
  const hub = read('pages/hub/training.js');
  const header = read('src/components/training/lobby/TrainingLobbyHeader.jsx');
  const css = read('src/styles/worlds/training.css');
  const transition = read('src/components/transitions/PageTransition.js');

  assert.match(`${hub}\n${header}`, /<h1[^>]*>Training Games<\/h1>/);
  assert.match(hub, /<span>\{delta\} \{delta === 1 \? 'correct hand' : 'correct hands'\} To \{next\}<\/span>/);
  assert.match(
    hub,
    /<PageTransition disableInitialAnimation>/,
    'the global command trigger must be interactive on the first client frame',
  );
  assert.match(
    transition,
    /if \(disableInitialAnimation\) \{[\s\S]*?return \([\s\S]*?<div className=\{className\}/,
    'the static path must bypass motion state so WebKit cannot blank hydrated controls',
  );
  assert.doesNotMatch(
    transition,
    /<motion\.div[\s\S]*?initial=\{disableInitialAnimation/,
    'the disabled path must not remain coupled to a motion variant',
  );
  assert.doesNotMatch(hub, /<BottomNavBar\b|import[^\n]*BottomNavBar|BOTTOM_NAV_CLEARANCE/);
  assert.doesNotMatch(hub, /<style jsx global>\{`\s*:root\s*\{/);
  assert.match(css, /body\.world-training \.sp-main,[\s\S]*?--sp-primary: #00d4ff/);
  assert.doesNotMatch(css, /\.approved-global-header[\s\S]*?--sp-primary:/);
});

test('the browser audit reports exact failing nodes and ignores non-product harness surfaces', () => {
  const source = read('scripts/training-browser-route-audit.mjs');

  assert.match(source, /targets: scopedNodes\.slice/);
  assert.match(source, /closest\('#hmr-reconnect-banner'\)/);
  assert.match(source, /const ownsFinalSurface = finalPathname\.startsWith\('\/hub\/training'\)/);
  assert.match(source, /TRAINING_AUDIT_ROUTE_PATTERN/);
  assert.match(source, /message\.location\(\)\?\.url/);
  assert.match(source, /\[source: \$\{sourceUrl\}\]/);
});
