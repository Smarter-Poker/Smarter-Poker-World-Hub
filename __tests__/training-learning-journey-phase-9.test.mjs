import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const routes = [
  'progress',
  'achievements',
  'milestones',
  'streaks',
  'daily-goals',
  'study-plan',
  'training-calendar',
  'skill-tree',
];

test('the complete learning-journey family adopts one progress-vault shell', () => {
  for (const route of routes) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.match(source, /sp-training-journey/, `${route} is missing the journey shell`);
    assert.match(source, /sp-journey-main/, `${route} is missing the responsive journey stage`);
  }
});

test('progress and achievements use dense dimensional metric systems', () => {
  const progress = read('pages/hub/training/progress.js');
  const achievements = read('pages/hub/training/achievements.js');

  assert.match(progress, /sp-journey-stat-grid/);
  assert.match(progress, /sp-journey-stat-card/);
  assert.match(progress, /sp-journey-data-card/);
  assert.match(achievements, /sp-journey-achievement-card/);
  assert.match(achievements, /sp-journey-filter-rail/);
  assert.match(achievements, /aria-pressed=\{activeCategory === cat\}/);
});

test('planner, calendar, milestones, and skill tree share the metallic command header', () => {
  for (const route of ['milestones', 'daily-goals', 'study-plan', 'training-calendar', 'skill-tree']) {
    assert.match(read(`pages/hub/training/${route}.js`), /sp-journey-header/);
  }
});

test('journey labels use title case while poker acronyms remain authored exactly', () => {
  assert.doesNotMatch(read('pages/hub/training/achievements.js'), /cat\.toUpperCase\(\)/);
  assert.match(read('pages/hub/training/training-calendar.js'), />\s*Day Streak\s*</);
  assert.match(read('pages/hub/training/skill-tree.js'), /Nodes Mastered/);
  assert.match(read('pages/hub/training/study-plan.js'), /Master your GTO progression|Smarter\.Poker GTO Training/);
});

test('phone layouts keep straight cards, two-column metrics, and the global header out of scope', () => {
  const css = read('src/styles/worlds/training.css');
  const progress = read('pages/hub/training/progress.js');
  const achievements = read('pages/hub/training/achievements.js');

  assert.match(css, /\.sp-journey-stat-grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);
  assert.match(css, /\.sp-journey-stat-card,[\s\S]*border-radius:\s*0\s*!important/);
  assert.match(css, /\.sp-journey-header::after,[\s\S]*linear-gradient/);
  assert.ok(progress.indexOf('<UniversalHeader') < progress.indexOf('sp-journey-main'));
  assert.ok(achievements.indexOf('<UniversalHeader') < achievements.indexOf('sp-journey-main'));
  assert.doesNotMatch(css, /\.universal-header[^\n]*sp-training-journey/);
});
