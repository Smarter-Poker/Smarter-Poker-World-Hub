import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const MATRIX = read('src/components/memory-games/PreflopRangeMatrix.jsx');
const TAB_RAIL = read('src/components/memory-games/PreflopTabRail.jsx');
const REVIEW = read('src/components/memory-games/EnhancedReviewPanel.jsx');
const JARVIS = read('src/components/memory-games/JarvisExplanationDialog.jsx');
const ACHIEVEMENTS = read('pages/hub/memory-games/achievements.js');
const LEADERBOARD = read('pages/hub/memory-games/leaderboard.js');
const MAIN = read('pages/hub/memory-games.js');
const CSS = read('src/styles/worlds/memory-games.css');

test('range matrix uses valid grid rows and is one keyboard-focusable paint control', () => {
  // Mobile phase 2: the matrix fits 375px, so the old horizontal scroll
  // region is gone; the grid itself takes focus and owns the arrow keys.
  assert.match(MATRIX, /role="grid"[\s\S]*tabIndex=\{0\}/);
  assert.match(MATRIX, /role="gridcell"/);
  assert.doesNotMatch(MATRIX, /preflop-lab-grid-scroll/);
  assert.match(MATRIX, /className="preflop-lab-grid-row is-header" role="row"/);
  assert.match(MATRIX, /className="preflop-lab-axis-corner" role="columnheader"/);
  assert.match(MATRIX, /className="preflop-lab-grid-row" role="row"/);
  assert.match(MATRIX, /aria-rowcount=\{ranks\.length \+ 1\}/);
  assert.match(MATRIX, /aria-colindex=\{col \+ 2\}/);
  assert.match(CSS, /\.preflop-lab-grid\[role='grid'\]:focus-visible/);
});

test('scrolling subpage tab rails implement roving focus and arrow navigation', () => {
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']) assert.match(TAB_RAIL, new RegExp(key));
  assert.match(TAB_RAIL, /role="tablist"/);
  assert.match(TAB_RAIL, /aria-selected=\{selected === item\.key\}/);
  assert.match(TAB_RAIL, /tabIndex=\{selected === item\.key \? 0 : -1\}/);
  assert.match(ACHIEVEMENTS, /<PreflopTabRail/);
  // Achievements has genuine in-page categories. Ranked standings is now an
  // authority-gated information page, so it correctly uses only the shared
  // page navigation instead of exposing a meaningless local tab rail.
  assert.match(LEADERBOARD, /<PreflopSubpageShell/);
  assert.doesNotMatch(LEADERBOARD, /<PreflopTabRail/);
});

test('achievement progress and post-session review expose complete accessible semantics', () => {
  assert.match(ACHIEVEMENTS, /role="progressbar" aria-label=\{`Achievement vault completion:/);
  // Mobile phase 2, standard rule 2 (no hidden-content tabs): the three
  // review panels are stacked sections with a jump navigation, not tabs.
  assert.match(REVIEW, /role="navigation" aria-label="Jump to a review section"/);
  for (const id of ['overview', 'mistakes', 'solution']) {
    assert.match(REVIEW, new RegExp(`id="preflop-review-${id}" aria-labelledby="preflop-review-${id}-title"`));
  }
  assert.match(REVIEW, /aria-expanded=\{selectedMistake === i\}/);
  assert.match(REVIEW, /aria-pressed=\{showSolution\}/);
});

test('Jarvis analysis is a focus-managed modal that cannot strand body scrolling', () => {
  assert.match(MAIN, /<JarvisExplanationDialog/);
  assert.match(JARVIS, /acquireScrollLock\('JarvisExplanationDialog'\)/);
  assert.match(JARVIS, /role="dialog"/);
  assert.match(JARVIS, /aria-modal="true"/);
  assert.match(JARVIS, /event\.key === 'Escape'/);
  assert.match(JARVIS, /event\.key !== 'Tab'/);
  assert.match(JARVIS, /returnFocusRef\.current\?\.focus/);
});

test('mobile command targets meet the 44px interaction contract and award cards stay compact', () => {
  assert.match(CSS, /\.preflop-subpage-nav a,[\s\S]*\.preflop-tab-rail button[\s\S]*min-height:\s*44px/);
  assert.match(CSS, /\.preflop-panel-heading button,[\s\S]*\.preflop-subpage-error button[\s\S]*min-height:\s*44px/);
  assert.match(CSS, /\.preflop-subpage-back \{[\s\S]*min-height:\s*44px/);
  assert.match(CSS, /\.preflop-tab-rail button \{[\s\S]*min-width:\s*44px/);
  assert.match(CSS, /Mobile-first touch contract[\s\S]*\.preflop-lab-command-actions button[\s\S]*min-height:\s*44px/);
  assert.match(CSS, /\.preflop-award-grid article \{ min-height:\s*148px/);
});
