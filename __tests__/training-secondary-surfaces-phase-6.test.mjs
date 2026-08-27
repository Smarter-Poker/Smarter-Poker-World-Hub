import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const library = fs.readFileSync('src/data/TRAINING_LIBRARY.js', 'utf8');
const playRoute = fs.readFileSync('pages/hub/training/play/[gameId].js', 'utf8');
const arenaRoute = fs.readFileSync('pages/hub/training/arena/[gameId].js', 'utf8');
const levelSelector = fs.readFileSync('src/components/training/LevelSelector.tsx', 'utf8');
const setup = fs.readFileSync('src/components/training/SessionSetupModal.jsx', 'utf8');
const arena = fs.readFileSync('src/components/training/GodModeArena.jsx', 'utf8');
const trainingCss = fs.readFileSync('src/styles/worlds/training.css', 'utf8');

test('all catalog games inherit the same dynamic secondary-page path', () => {
  const catalogCount = (library.match(/\bid:\s*['"]/g) || []).length;
  assert.ok(catalogCount >= 100, `expected 100+ catalog games, found ${catalogCount}`);
  assert.match(playRoute, /<LevelSelector[\s\S]*gameId=\{gameId\}/);
  assert.match(arenaRoute, /<GodModeArena[\s\S]*gameId=\{gameId\}/);
});

test('campaign selector carries game-specific art and has no inner corner frame', () => {
  assert.match(levelSelector, /getGameImage\(gameId\)/);
  assert.match(levelSelector, /className="sp-level-command-art"/);
  assert.match(levelSelector, /className="sp-level-stats"/);
  assert.doesNotMatch(levelSelector, /\.sp-level-card::before/);
});

test('session setup uses the shared responsive command deck', () => {
  assert.match(setup, /className="sp-card-lg sp-setup-console"/);
  assert.match(setup, /className="sp-setup-layout"/);
  assert.match(setup, /className="sp-setup-field-grid"/);
  assert.match(setup, /className="sp-setup-launch"/);
  assert.match(trainingCss, /\.sp-setup-layout\s*\{[\s\S]*grid-template-columns:/);
});

test('post-session review is themed as part of the Club Arena flow', () => {
  assert.match(arena, /className="sp-arena-review"/);
  assert.match(arena, /className="sp-arena-review__score"/);
  assert.match(arena, /className="sp-arena-review__summary"/);
  assert.match(trainingCss, /\.sp-arena-review__score\s*\{/);
  assert.match(trainingCss, /\.sp-arena-review__summary\s*\{/);
});

