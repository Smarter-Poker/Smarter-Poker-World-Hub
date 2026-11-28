import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const routes = [
  'reports',
  'gto-reports',
  'session-dashboard',
  'community-leaderboard',
];

test('the Training Leaderboard is rebuilt on #SMARTERDESIGN with its own image header (2026-11-27)', () => {
  const source = read('pages/hub/training/leaderboard.js');
  assert.match(source, /<TrainingPageHead\s+slug="training-leaderboard"/);
  assert.match(source, /training-smarterdesign\.module\.css/);
  // The intelligence rail repainted every button border with a 1px line,
  // which erased the chrome rims of the console buttons.
  assert.doesNotMatch(source, /sp-training-intelligence/);
});

// Reports (and its gto-reports alias) and Session Dashboard moved to the
// #SMARTERDESIGN sessions interior (2026-11-27): the intelligence rail
// repainted every console button with a 1px line and wrapped the image
// header in a second frame, so those pages now use the shared module instead.
const SMARTERDESIGN_REPORT_ROUTES = new Set(['reports', 'gto-reports', 'session-dashboard']);

test('the complete reporting family adopts one intelligence-rail shell', () => {
  for (const route of routes) {
    const source = read(`pages/hub/training/${route === 'gto-reports' ? 'reports' : route}.js`);
    if (SMARTERDESIGN_REPORT_ROUTES.has(route)) {
      assert.match(source, /sessions-coaching\.module\.css/, `${route} is missing the #SMARTERDESIGN sessions interior`);
      assert.doesNotMatch(source, /sp-training-intelligence/, `${route} must not re-wrap the console in the intelligence rail`);
      continue;
    }
    assert.match(source, /sp-training-intelligence/, `${route} is missing the intelligence shell`);
  }
  assert.match(read('pages/hub/training/gto-scorecard.js'), /destination: '\/hub\/training\/gto-reports'/);
  assert.match(read('pages/hub/training/gto-reports.js'), /import VerifiedTrainingReports from '\.\/reports'[\s\S]*export default VerifiedTrainingReports/);
});

test('aggregate reports expose an honest solver-integrity boundary', () => {
  const source = read('pages/hub/training/aggregate.js');
  assert.match(source, /aggregate-boundary/);
  assert.match(source, /Aggregate Reports Are Paused/);
  assert.match(source, /Canonical Row Identity/);
  assert.match(source, /Complete Solver Lineage/);
  assert.match(source, /Documented Weighting/);
  assert.doesNotMatch(source, /api\/training\/aggregate-report|strategy_matrix\b/);
});

test('report, scorecard, dashboard, and profile pages expose responsive stages', () => {
  for (const route of [
    'reports',
    'gto-reports',
    'session-dashboard',
    'community-leaderboard',
  ]) {
    const source = read(`pages/hub/training/${route === 'gto-reports' ? 'reports' : route}.js`);
    assert.match(source, /<TrainingPageHead slug="training-/, `${route} is missing the #SMARTERDESIGN page head`);
    if (SMARTERDESIGN_REPORT_ROUTES.has(route)) {
      assert.match(source, /className=\{(?:s|sc)\.page\}/, `${route} is missing the responsive #SMARTERDESIGN stage`);
      continue;
    }
    assert.match(source, /sp-intelligence-main/, `${route} is missing the responsive stage`);
  }
});

test('the intelligence system provides straight metallic cards and accessible pressed states', () => {
  const css = read('src/styles/worlds/training.css');

  assert.match(css, /PHASE 10 — REPORTING & COMPETITIVE INTELLIGENCE/);
  assert.match(css, /\.sp-training-intelligence div\[style\*="border-radius"\][\s\S]*border-radius:\s*0\s*!important/);
  assert.match(css, /\.sp-training-intelligence button\[aria-pressed="true"\][\s\S]*#e9fcff/);
  assert.match(css, /\.sp-intelligence-header\.sd-masthead\s*\{[^}]*chrome-readout\.webp/);
});

test('phone layouts reduce metric grids and profile comparisons without horizontal page overflow', () => {
  const css = read('src/styles/worlds/training.css');

  assert.match(css, /@media \(max-width: 768px\)[\s\S]*repeat\(5[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /sp-training-intelligence--profiles[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/);
  assert.match(css, /sp-intelligence-main,[\s\S]*width:\s*100%\s*!important/);
});

test('the global header remains outside the leaderboard intelligence scope', () => {
  const leaderboard = read('pages/hub/training/leaderboard.js');
  const css = read('src/styles/worlds/training.css');

  assert.ok(leaderboard.indexOf('<UniversalHeader') < leaderboard.indexOf('<TrainingPageHead'));
  assert.doesNotMatch(css, /\.universal-header[^\n]*sp-training-intelligence/);
});
