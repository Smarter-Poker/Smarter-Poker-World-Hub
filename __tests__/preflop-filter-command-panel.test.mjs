import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PANEL = read('src/games/ScenarioFilterPanel.jsx');
const PAGE = read('pages/hub/memory-games.js');
const CSS = read('src/styles/worlds/memory-games.css');

test('preflop scenario filters expose an accessible range-tuning form', () => {
    assert.match(PANEL, /<motion\.section/);
    assert.match(PANEL, /aria-labelledby="scenario-filter-title"/);
    assert.match(PANEL, /aria-describedby="scenario-filter-description"/);
    assert.match(PANEL, /htmlFor="scenario-filter-position"/);
    assert.match(PANEL, /htmlFor="scenario-filter-stack-depth"/);
    assert.match(PANEL, /htmlFor="scenario-filter-format"/);
    assert.match(PANEL, /aria-label="Close scenario filters"/);
    assert.match(PANEL, /aria-live="polite"/);
    assert.doesNotMatch(PANEL, /style=\{/);
});

test('draft and applied filter states remain explicit without changing the data contract', () => {
    assert.match(PANEL, /data-filter-state=\{isDirty \? 'draft' : hasFilters \? 'active' : 'idle'\}/);
    assert.match(PANEL, /onFilterChange\(\{[\s\S]*position: position \|\| null,[\s\S]*stackDepth: stackDepth \|\| null,[\s\S]*format: format \|\| null/);
    assert.match(PANEL, /onFilterChange\(\{\}\)/);
    assert.match(PAGE, /availableScenarios=\{ALL_TRAINING_SCENARIOS\.length\}/);
    // Mobile phase 2: the count is computed once as filteredScenarioCount.
    assert.match(PAGE, /const filteredScenarioCount = filterScenarios\(ALL_TRAINING_SCENARIOS, scenarioFilters\)\.length/);
    assert.match(PAGE, /filteredCount=\{filteredScenarioCount\}/);
});

test('the command panel is mobile-first, touch-safe, and expands to three axes on desktop', () => {
    assert.match(CSS, /\.scenario-filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    // Mobile phase 2: the sanctioned phone breakpoint is 768 (docs/mobile-standard), not 640.
    assert.match(CSS, /@media \(max-width: 768px\)[\s\S]*\.scenario-filter-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/);
    assert.match(CSS, /@media \(max-width: 768px\)[\s\S]*\.scenario-filter-field select\s*\{[\s\S]*min-height:\s*50px/);
    assert.match(CSS, /\.scenario-filter-field select:focus-visible/);
    assert.match(CSS, /\.scenario-filter-console\[data-filter-state='draft'\]/);
});
