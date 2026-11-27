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
  assert.match(source, /<BankrollImageHeader\s+art="training-leaderboard"/);
  assert.match(source, /training-smarterdesign\.module\.css/);
  // The intelligence rail repainted every button border with a 1px line,
  // which erased the chrome rims of the console buttons.
  assert.doesNotMatch(source, /sp-training-intelligence/);
});

test('the complete reporting family adopts one intelligence-rail shell', () => {
  for (const route of routes) {
    const source = read(`pages/hub/training/${route === 'gto-reports' ? 'reports' : route}.js`);
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
    assert.match(source, /sp-intelligence-header/, `${route} is missing the command header`);
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

  assert.ok(leaderboard.indexOf('<UniversalHeader') < leaderboard.indexOf('<BankrollImageHeader'));
  assert.doesNotMatch(css, /\.universal-header[^\n]*sp-training-intelligence/);
});
