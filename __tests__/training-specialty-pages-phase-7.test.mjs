import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rangeBuilder = fs.readFileSync('pages/hub/training/range-builder.js', 'utf8');
const tournaments = fs.readFileSync('pages/hub/training/tournaments.js', 'utf8');
const trainingCss = fs.readFileSync('src/styles/worlds/training.css', 'utf8');

test('range builder stacks its matrix and grading panel on phones', () => {
  assert.match(rangeBuilder, /className="sp-range-builder-layout"/);
  assert.match(rangeBuilder, /className="sp-range-builder-matrix"/);
  assert.match(rangeBuilder, /className="sp-range-builder-sidebar"/);
  assert.match(trainingCss, /\.sp-range-builder-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(rangeBuilder, /<div data-pills-row\s*\n\s*className="sp-range-builder-layout"/);
});

test('tournament filters render their labels instead of conditional source text', () => {
  assert.match(tournaments, /\{tab === 'live' \? \(/);
  assert.doesNotMatch(tournaments, />\s*tab === 'live' \?/);
  assert.match(tournaments, /aria-pressed=\{activeTab === tab\}/);
});

test('specialty tool adopters use straight dimensional Smarter.Poker chrome', () => {
  assert.match(rangeBuilder, /sp-training-tool--range-builder/);
  assert.match(tournaments, /sp-training-tool--tournaments/);
  assert.match(trainingCss, /\.sp-training-tool::before\s*\{/);
  assert.match(tournaments, /borderRadius:\s*0/);
  assert.match(tournaments, /#8beaff 0%, #23aee8 48%, #07557f 100%/);
});
