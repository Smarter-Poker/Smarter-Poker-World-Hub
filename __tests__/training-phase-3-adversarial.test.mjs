import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('Solutions board texture controls persist through the wired filter setter', () => {
  const source = read('pages/hub/training/solutions.js');

  assert.match(source, /setFilter\('rxTexture', tex\)/);
  assert.doesNotMatch(source, /saveFilter\('rxTexture'/);
  assert.match(source, /res\.status === 401[\s\S]*?router\.replace\('\/auth\/login\?redirect=\/hub\/training\/solutions'\)/);
});

test('Table Dynamics pop-out is wired and authored data is labeled honestly', () => {
  const source = read('src/components/training/TableDynamicsPanel.jsx');

  assert.match(source, /import \{ motion \} from 'framer-motion'/);
  assert.match(source, /Authored Training Scenario/);
  assert.match(source, /No Live Player Telemetry/);
  assert.match(source, /aria-pressed=\{isPoppedOut\}/);
  assert.doesNotMatch(source, /Real-time/i);
  assert.doesNotMatch(source, /RegShark|FishyJoe|Whale99|Maniac42|NittyNick/);
});

test('Table Dynamics uses the straight metallic Training design system', () => {
  const css = read('src/styles/worlds/training.css');

  assert.match(css, /Phase 3: Authored Table Dynamics Instrument Panel/);
  assert.match(css, /body\.world-training \.sp-dynamics-panel/);
  assert.match(css, /\.sp-dynamics-panel[\s\S]*?border-radius:\s*0/);
  assert.match(css, /\.sp-dynamics-source,[\s\S]*?\.sp-dynamics-dock[\s\S]*?box-shadow:/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.sp-dynamics-metrics/);
});

test('Training Hub categories and progress indicators expose valid accessible semantics', () => {
  const source = read('pages/hub/training.js');

  assert.match(source, /className="sp-cat-chips" role="group" aria-label="Game Categories"/);
  assert.doesNotMatch(source, /className="sp-cat-chip" role="tab" aria-pressed/);
  assert.match(source, /aria-label="Thirty Day GTO Accuracy"/);
  assert.match(source, /aria-label=\{`\$\{game\.name\} Training Calibration`\}/);
});

test('Coach and Tournament controls retain explicit accessible names', () => {
  const coach = read('pages/hub/training/coach-mode.js');
  const tournament = read('pages/hub/training/tournament-prep.js');

  assert.match(coach, /className="sp-coach-back sp-coach-hero-back" aria-label="Back To Training Hub"/);
  for (const id of [
    'tournament-buy-in',
    'tournament-starting-stack',
    'tournament-blind-level-length',
    'tournament-current-level',
  ]) {
    assert.match(tournament, new RegExp(`htmlFor="${id}"`));
    assert.match(tournament, new RegExp(`id="${id}"`));
  }
});

test('secondary Training filters use buttons instead of contradictory tab semantics', () => {
  for (const path of [
    'pages/hub/training/achievements.js',
    'pages/hub/training/glossary.js',
    'pages/hub/training/mental-journal.js',
    'pages/hub/training/training-feed.js',
  ]) {
    const source = read(path);
    assert.match(source, /role="group"/);
    assert.doesNotMatch(source, /role="tab"[^>]*aria-pressed|aria-pressed[^>]*role="tab"/);
  }
});

test('secondary Training calculators and builders expose names for every audited control', () => {
  const expectations = {
    'pages/hub/training/custom-rake.js': [
      'Custom Rake Percentage',
      'Custom Rake Cap',
      'Stack Depth In Big Blinds',
    ],
    'pages/hub/training/icm-calculator.js': [
      'Player ${i + 1} Stack',
      'Place ${i + 1} Prize Percentage',
      'Total Prize Pool',
    ],
    'pages/hub/training/quiz-builder.js': [
      'Question ${index + 1} Game Type',
      'Question ${index + 1} Difficulty',
      'Question ${index + 1} Position',
      'Question ${index + 1} Correct Answer',
    ],
    'pages/hub/training/risk-analyzer.js': [
      'Expected Return Percentage',
      'Standard Deviation',
      'Simulation Sample Size',
    ],
  };

  for (const [path, labels] of Object.entries(expectations)) {
    const source = read(path);
    for (const label of labels) assert.ok(source.includes(label), `${path} is missing ${label}`);
  }
});

test('signed-out gameplay fallback has a titled and keyboard-operable sign-in page', () => {
  const source = read('pages/auth/login.js');

  assert.match(source, /<title>Sign In \| Smarter\.Poker<\/title>/);
  assert.match(source, /aria-label="Email Address"/);
  assert.match(source, /aria-label="Password"/);
  assert.match(source, /aria-label=\{showPassword \? 'Hide Password' : 'Show Password'\}/);
  assert.match(source, /type="button"/);
  assert.match(source, /<svg/);
  assert.doesNotMatch(source, /👁/u);
});

test('active replay and arena effects observe the current hand and game identity', () => {
  const replay = read('src/components/training/SolverComparisonReplay.jsx');
  const arena = read('src/components/training/games/UniversalDynamicTable.jsx');
  const gameplay = read('src/components/poker/TrainingGameTable.jsx');

  assert.match(replay, /const handData = useMemo\(\(\) => hand\?\.handData \|\| hand \|\| \{\}, \[hand\]\)/);
  assert.match(arena, /\}, \[question\?\.gameId, questionNumber\]\);/);
  assert.doesNotMatch(arena, /\[showFeedback, onAnswer, options, questionNumber, correctAnswer\]/);
  assert.match(arena, /skin_carbon_ion-DknFfmaT-v6\.png/);
  assert.match(gameplay, /skin_carbon_ion-DknFfmaT-v6\.png/);
  assert.doesNotMatch(`${arena}\n${gameplay}`, /skin_carbon_ion-CuncF2Ud-v6\.png/);
});

test('Training deployment verification is read-only and checks exact release identity', () => {
  const source = read('scripts/verify_training_flow.js');

  assert.match(source, /expectedBuildSha/);
  assert.match(source, /Protected Gameplay Contract/);
  assert.match(source, /readOnly:\s*true/);
  assert.doesNotMatch(source, /createClient|\.insert\(|\.delete\(|xpInsertError|xpLog/);
});

test('Training callbacks cannot retain stale difficulty or adaptive-analysis state', () => {
  const source = read('src/hooks/useGTOTrainer.js');

  assert.match(source, /updateWeakSpotMap,\s*getWeakSpots,\s*prefetchNextLevel,\s*gameId,/);
  assert.match(source, /resolveDifficultyMode,\s*getWeakSpots,\s*\]\);/);
  assert.match(source, /\}, \[gameId, trainerConfig\]\);/);
  assert.match(source, /effectiveQuestionsPerLevel,\s*selectedLevel,\s*trainerConfig,\s*\]\);/);
});

test('browser route audit enforces serious WCAG failures and runtime performance bounds', () => {
  const source = read('scripts/training-browser-route-audit.mjs');

  assert.match(source, /axe\.run/);
  assert.match(source, /wcag21aa/);
  assert.match(source, /serious accessibility violations/);
  assert.match(source, /excessive DOM size/);
  assert.match(source, /closest\('\.approved-global-header'\)/);
  assert.match(source, /'\/training-table-demo'/);
});
