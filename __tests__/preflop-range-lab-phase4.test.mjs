import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/memory-games.js');
const CSS = read('src/styles/worlds/memory-games.css');
const RANGE_LOGIC = read('src/lib/preflopRangeLab.js');
const RANGE_MATRIX = read('src/components/memory-games/PreflopRangeMatrix.jsx');
const ADAPTIVE_API = read('pages/api/gto/generate-adaptive.js');
const GENERATE_API = read('pages/api/gto/generate-scenario.js');
const POWER_UPS = read('src/utils/powerUps.js');
const COMBO = read('src/components/memory-games/modals/ComboPopup.js');
const REVIEW = read('src/components/memory-games/EnhancedReviewPanel.jsx');
const ACHIEVEMENTS = read('src/services/AchievementService.js');
const ELO_SERVICE = read('src/games/ELOService.js');
const ELO_API = read('pages/api/memory/elo.js');
const ELO_MATH = read('src/lib/memoryElo.js');
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
    assert.match(RANGE_LOGIC, /function normalizeRangeAction\(action\)/);
    assert.match(RANGE_LOGIC, /userAction !== normalizedCorrectAction/);
    assert.match(RANGE_LOGIC, /unionHands = totalSolutionHands \+ extraHands\.length/);
    assert.doesNotMatch(PAGE, /ACTION_COLORS moved to/);
});

test('Range Lab is a mobile-first native-button matrix with a separate desktop expansion', () => {
    assert.match(PAGE, /className="preflop-range-lab"/);
    assert.match(PAGE, /<PreflopRangeMatrix/);
    assert.match(RANGE_MATRIX, /className="preflop-lab-grid"[\s\S]*role="grid"/);
    assert.match(RANGE_MATRIX, /role="gridcell"/);
    // Mobile phase 2: the grid is ONE focusable paint control; the focused
    // hand is tracked in state and marked on its gridcell, not by roving tabIndex.
    assert.match(RANGE_MATRIX, /role="grid"[\s\S]*tabIndex=\{0\}/);
    assert.match(RANGE_MATRIX, /useState\(\(\) => getHandName\(0, 0\)\)/);
    assert.match(RANGE_MATRIX, /data-focused=/);
    // Cells are gridcells of one paint control (mobile phase 2), not buttons.
    assert.match(RANGE_MATRIX, /role="gridcell"[\s\S]*data-feedback=\{feedbackState\}/);
    assert.match(RANGE_MATRIX, /aria-selected=\{!!userAction\}/);
    assert.match(PAGE, /aria-pressed=\{selectedAction === action\}/);
    // Mobile phase 2: the matrix fits 375px; the 628px floor that made it a
    // sideways scroller is gone for good (no-slide-to-see law).
    assert.match(CSS, /\.preflop-lab-grid\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0/);
    assert.doesNotMatch(CSS, /min-width:\s*628px/);
    assert.match(CSS, /\.preflop-lab-feedback\s*\{\s*position:\s*relative;\s*min-width:\s*0/);
    assert.match(CSS, /\.preflop-lab-actions\s*\{[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
    // Desktop expansion lives in the 769px complement of the one phone breakpoint.
    assert.match(CSS, /@media \(min-width: 769px\)[\s\S]*\.preflop-lab-actions\s*\{[\s\S]*repeat\(6, minmax\(0, 1fr\)\)/);
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

test('authenticated achievement and ELO persistence run through server-owned contracts', () => {
    assert.match(ACHIEVEMENTS, /authedFetch\('\/api\/training\/achievements'/);
    assert.doesNotMatch(ACHIEVEMENTS, /supabase\.rpc\('unlock_achievement'/);
    assert.match(ELO_SERVICE, /authedFetch\('\/api\/memory\/elo'/);
    assert.doesNotMatch(ELO_SERVICE, /\.from\('profiles'\)/);
    assert.match(ELO_API, /getServerUserWithFallback\(req, supabase\)/);
    assert.match(ELO_API, /\.eq\('id', user\.id\)/);
    assert.doesNotMatch(ELO_API, /req\.body\?\.userId|req\.body\.userId/);
    assert.match(ELO_MATH, /export function calculateNewELO/);
});
