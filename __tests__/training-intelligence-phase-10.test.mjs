import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const routes = [
  'reports',
  'gto-reports',
  'gto-scorecard',
  'session-dashboard',
  'aggregate',
  'leaderboard',
  'community-leaderboard',
  'player-profiles',
];

test('the complete reporting family adopts one intelligence-rail shell', () => {
  for (const route of routes) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.match(source, /sp-training-intelligence/, `${route} is missing the intelligence shell`);
  }
});

test('report, scorecard, dashboard, and profile pages expose responsive stages', () => {
  for (const route of [
    'reports',
    'gto-reports',
    'gto-scorecard',
    'session-dashboard',
    'community-leaderboard',
    'player-profiles',
  ]) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.match(source, /sp-intelligence-header/, `${route} is missing the command header`);
    assert.match(source, /sp-intelligence-main/, `${route} is missing the responsive stage`);
  }
});

test('the intelligence system provides straight metallic cards and accessible pressed states', () => {
  const css = read('src/styles/worlds/training.css');

  assert.match(css, /PHASE 10 — REPORTING & COMPETITIVE INTELLIGENCE/);
  assert.match(css, /\.sp-training-intelligence div\[style\*="border-radius"\][\s\S]*border-radius:\s*0\s*!important/);
  assert.match(css, /\.sp-training-intelligence button\[aria-pressed="true"\][\s\S]*#e9fcff/);
  assert.match(css, /\.sp-intelligence-header::after[\s\S]*#ffbd4a/);
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

  assert.ok(leaderboard.indexOf('<UniversalHeader') < leaderboard.indexOf('sp-training-intelligence--leaderboard'));
  assert.doesNotMatch(css, /\.universal-header[^\n]*sp-training-intelligence/);
});
