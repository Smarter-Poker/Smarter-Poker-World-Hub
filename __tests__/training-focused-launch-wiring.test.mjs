import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('active Training clients never launch the nonexistent spot-trainer arena game', () => {
  const files = [
    'pages/hub/training/drill-builder.js',
    'pages/hub/training/replay-theater.js',
    'pages/hub/training/skill-tree.js',
    'pages/hub/training/study-plan.js',
    'pages/hub/training/tilt-guard.js',
    'pages/hub/training/weakness-scanner.js',
  ];
  for (const file of files) assert.doesNotMatch(read(file), /arena\/spot-trainer/, file);
});

test('every Skill Tree node launches one canonical Training game and reads only its exact stats', () => {
  const source = read('pages/hub/training/skill-tree.js');
  const ids = [...source.matchAll(/gameId:\s*'([^']+)'/g)].map((match) => match[1]);
  const canonical = new Set(TRAINING_LIBRARY.map((game) => game.id));
  assert.equal(ids.length, 16);
  assert.deepEqual(ids.filter((id) => !canonical.has(id)), []);
  assert.match(source, /stats\?\.\[node\.gameId\]/);
  assert.doesNotMatch(source, /gid\.includes\(|gameId\?\.includes\(/);
  assert.match(source, /arena\/\$\{node\.gameId\}\?level=1&source=skill-tree/);
});

test('Drill Builder persists its real schema, surfaces failures, and uses the strict launch contract', () => {
  const source = read('pages/hub/training/drill-builder.js');
  assert.match(source, /title:\s*drillName\.trim\(\)/);
  assert.match(source, /drill_type:\s*'focused_solver'/);
  assert.match(source, /\.select\('\*'\)\.maybeSingle\(\)/);
  assert.match(source, /if \(!saved\?\.id \|\| saved\.user_id !== userData\.user\.id\)/);
  assert.doesNotMatch(source, /\.single\(\)/);
  assert.match(source, /setSaveError/);
  assert.match(source, /buildCustomTrainingArenaHref\(config, 'drill-builder'\)/);
  assert.doesNotMatch(source, /user_id:\s*userData\.user\.id,\s*\n\s*name:/);
});

test('Study Plan marks practice only from server-returned sessions, never navigation', () => {
  const source = read('pages/hub/training/study-plan.js');
  const start = source.indexOf('const handleStartArea');
  const end = source.indexOf('const regeneratePlan', start);
  const handler = source.slice(start, end);
  assert.match(source, /completedGames = new Set/);
  assert.match(source, /session\.completed_at \|\| session\.created_at/);
  assert.doesNotMatch(source, /study-plan-completed|study-plan-week/);
  assert.doesNotMatch(handler, /setCompleted|localStorage/);
  assert.match(handler, /buildCustomTrainingArenaHref/);
});

test('Arena revalidates custom query values and fails closed for noncanonical games', () => {
  const source = read('pages/hub/training/arena/[gameId].js');
  assert.match(source, /customTrainingConfigFromQuery\(router\.query\)/);
  assert.match(source, /isCanonicalTrainingGameId\(gameId\)/);
  assert.match(source, /This Training Game Does Not Exist In The Canonical Library/);
  assert.match(source, /initialConfig=\{customLaunch\.config\}/);
});
