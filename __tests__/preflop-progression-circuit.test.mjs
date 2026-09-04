import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/memory-games.js');
const CSS = read('src/styles/worlds/memory-games.css');

test('the progression circuit reports live level, mastery, and practice-pool state', () => {
    assert.match(PAGE, /className="preflop-circuit-status"/);
    assert.match(PAGE, /aria-label="Range progression status"/);
    assert.match(PAGE, /Current Station[\s\S]*Level \{currentLevel\}/);
    assert.match(PAGE, /Next Mastery Gate[\s\S]*Level \{highestUnlockedLevel\} Open/);
    assert.match(PAGE, /Practice Pool[\s\S]*\{filteredScenarioCount\}\/\{ALL_TRAINING_SCENARIOS\.length\}/);
});

test('level availability reflects the applied filters without replacing game handlers', () => {
    assert.match(PAGE, /filterScenarios\(levelScenarios, scenarioFilters\)\.length/);
    assert.match(PAGE, /const isAvailable = isUnlocked && hasMatchingScenarios/);
    assert.match(PAGE, /className="preflop-level-card-action"/);
    assert.match(PAGE, /onClick=\{\(\) => startGame\(level\.level\)\}/);
    assert.match(PAGE, /disabled=\{!isAvailable\}/);
    assert.match(PAGE, /data-level-state=\{levelState\}/);
});

test('the actual current level and mastery data drive card presentation', () => {
    assert.match(PAGE, /const isCurrent = level\.level === currentLevel/);
    assert.doesNotMatch(PAGE, /idx === 0 \? ' is-current'/);
    assert.match(PAGE, /aria-current=\{isCurrent \? 'step' : undefined\}/);
    assert.match(PAGE, /const mastery = memoryDashboard\?\.per_level_mastery\?\.find/);
    assert.match(PAGE, /className="preflop-level-progress-track"/);
    assert.match(PAGE, /--level-progress/);
});

test('the circuit and level states retain responsive, accessible styling', () => {
    assert.match(CSS, /\.preflop-circuit-status\s*\{[\s\S]*grid-template-columns:/);
    assert.match(CSS, /@media \(max-width: 900px\)[\s\S]*\.preflop-circuit-status\s*\{[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
    // Mobile phase 2: the sanctioned phone breakpoint is 768, not 640.
    assert.match(CSS, /@media \(max-width: 768px\)[\s\S]*\.preflop-circuit-stat\s*\{[\s\S]*min-height:\s*72px/);
    assert.match(CSS, /\.preflop-level-card\.is-no-match/);
    assert.match(CSS, /\.preflop-level-state\.is-mastered/);
    assert.match(CSS, /\.preflop-level-card:focus-within/);
});
