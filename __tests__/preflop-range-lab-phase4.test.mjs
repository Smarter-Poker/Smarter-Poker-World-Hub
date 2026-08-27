import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/memory-games.js');
const CSS = read('src/styles/worlds/memory-games.css');
const ADAPTIVE_API = read('pages/api/gto/generate-adaptive.js');
const GENERATE_API = read('pages/api/gto/generate-scenario.js');
const POWER_UPS = read('src/utils/powerUps.js');
const COMBO = read('src/components/memory-games/modals/ComboPopup.js');
const REVIEW = read('src/components/memory-games/EnhancedReviewPanel.jsx');
const MODES = [
    'SpeedDrillGame.js',
    'PressureCookerGame.js',
    'PatternRecognitionGame.js',
    'MixedStrategyGame.js',
    'SpotTrainerGame.jsx',
    'TournamentModeGame.jsx',
].map((file) => read(`src/games/${file}`)).join('\n');

test('active range memory owns a complete six-action contract', () => {
    assert.match(PAGE, /const ACTION_COLORS = \{/);
    for (const action of ['fold', 'call', 'raise', 'raise_small', 'raise_big', 'all_in']) {
        assert.match(PAGE, new RegExp(`\\b${action}: \\{`));
    }
    assert.match(PAGE, /function normalizeRangeAction\(action\)/);
    assert.match(PAGE, /userAction !== normalizedCorrectAction/);
    assert.doesNotMatch(PAGE, /ACTION_COLORS moved to/);
});

test('Range Lab is a mobile-first native-button matrix with a separate desktop expansion', () => {
    assert.match(PAGE, /className="preflop-range-lab"/);
    assert.match(PAGE, /className="preflop-lab-grid-scroll" tabIndex="0"/);
    assert.match(PAGE, /className="preflop-lab-grid" role="group"/);
    assert.match(PAGE, /type="button"[\s\S]*data-feedback=\{feedbackState\}/);
    assert.match(PAGE, /aria-pressed=\{selectedAction === action\}/);
    assert.match(CSS, /\.preflop-lab-grid\s*\{[\s\S]*min-width:\s*520px/);
    assert.match(CSS, /\.preflop-lab-feedback\s*\{\s*position:\s*relative;\s*min-width:\s*0/);
    assert.match(CSS, /\.preflop-lab-actions\s*\{[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(CSS, /@media \(min-width: 768px\)[\s\S]*\.preflop-lab-actions\s*\{[\s\S]*repeat\(6, minmax\(0, 1fr\)\)/);
    assert.match(CSS, /@media \(min-width: 768px\)[\s\S]*\.preflop-lab-grid\s*\{[\s\S]*min-width:\s*0/);
});

test('submission, timeout, persistence, and adaptive launch regressions stay repaired', () => {
    assert.match(PAGE, /submissionLockedRef\.current/);
    assert.match(PAGE, /latestGridRef\.current/);
    assert.match(PAGE, /latestTimeRef\.current/);
    assert.match(PAGE, /questionsCorrect: result\.correctHands \|\| 0/);
    assert.match(PAGE, /diamondsSpent: isVIP \|\| currentLevel <= 3 \? 0 : GAME_COST/);
    assert.match(PAGE, /setMode\('game'\)/);
    assert.doesNotMatch(PAGE, /setGameState\(/);
    assert.doesNotMatch(PAGE, /setUserId\(user\.id\)|setEloRank|setGamesPlayed|correctHands\?\.length/);
});

test('protected GTO and Jarvis calls use the authenticated fetch contract', () => {
    for (const endpoint of [
        '/api/gto/generate-scenario',
        '/api/jarvis/training-session',
        '/api/gto/explain-hand',
        '/api/gto/render-analysis-card',
        '/api/gto/analyze-game',
        '/api/gto/get-weak-spots',
        '/api/gto/generate-adaptive',
        '/api/gto/lobby-suggestions',
    ]) {
        assert.match(PAGE, new RegExp(`authedFetch\\('${endpoint.replaceAll('/', '\\/')}`));
    }
    assert.doesNotMatch(PAGE, /\bfetch\(/);
});

test('generated solver solutions omit folds that the active-range grid must leave blank', () => {
    assert.match(GENERATE_API, /!entry\.startsWith\('fold'\)/);
    assert.match(ADAPTIVE_API, /!entry\.startsWith\('fold'\)/);
});

test('power-up charges are awaited before all six game modes apply their effects', () => {
    assert.match(POWER_UPS, /export async function purchasePowerUp/);
    assert.match(POWER_UPS, /'training_entry'/);
    assert.match(POWER_UPS, /if \(!result\?\.success\) return \{ success: false/);
    assert.equal((MODES.match(/await purchasePowerUp\(/g) || []).length, 6);
    assert.doesNotMatch(MODES, /onScoreUpdate\?\.\(DiamondEngine\.getBalance\(\)\)/);
    assert.doesNotMatch(MODES, /const newBalance = DiamondEngine\.award/);
});

test('review and combo components have self-contained render contracts', () => {
    assert.match(COMBO, /multiplier = 1/);
    assert.match(COMBO, /className="preflop-combo-popup"/);
    assert.doesNotMatch(COMBO, /styles\.|\bC\b/);
    assert.match(REVIEW, /const REVIEW_RANKS/);
    assert.match(REVIEW, /function getReviewHandName/);
    assert.match(REVIEW, /normalizeReviewAction/);
    assert.doesNotMatch(REVIEW, /\bRANKS\.map|\bgetHandName\(/);
});
