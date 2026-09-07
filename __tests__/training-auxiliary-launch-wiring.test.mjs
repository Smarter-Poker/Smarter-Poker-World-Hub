import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const canonicalGames = new Map(TRAINING_LIBRARY.map((game) => [game.id, game]));

test('Autopilot embeds only canonical games behind one authenticated signed-Arena identity', () => {
  const source = read('pages/hub/training/autopilot.js');
  const ids = [...source.matchAll(/gameId:\s*'([^']+)'/g)].map((match) => match[1]);

  assert.equal(ids.length, 8);
  assert.deepEqual(ids.filter((id) => !canonicalGames.has(id)), []);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(source, /normalizeTrainingSessionConfig/);
  assert.match(source, /initialConfig=\{AUTOPILOT_ARENA_CONFIG\}/);
  assert.match(source, /userId=\{arenaUserId\}/);
  assert.match(source, /setArenaUserId\(user\.id\)/);
  assert.match(source, /sessionId=\{`\$\{autopilotRunId\}-\$\{currentSpotIdx\}`\}/);
  assert.match(source, /gameId=\{activeSpot\.gameId\}/);
  assert.match(source, /gameId === spot\.gameId/);
  assert.doesNotMatch(source, /anon-|gameId\.includes\(|activeSpot\.gameId \|\||onExit=/);
});

test('Quick Warmup pools use canonical IDs and honest labels and one stable authenticated Arena config', () => {
  const source = read('pages/hub/training/quick-warmup.js');
  const poolStart = source.indexOf('const WARMUP_GAMES');
  const poolEnd = source.indexOf('function selectWarmupGame', poolStart);
  const poolSource = source.slice(poolStart, poolEnd);
  const entries = [...poolSource.matchAll(/\{ id:\s*'([^']+)', name:\s*'([^']+)' \}/g)]
    .map(([, id, name]) => ({ id, name }));

  assert.equal(entries.length, 16);
  for (const entry of entries) {
    assert.ok(canonicalGames.has(entry.id), `${entry.id} is not in TRAINING_LIBRARY`);
    assert.equal(
      entry.name.toLowerCase(),
      canonicalGames.get(entry.id).name.toLowerCase(),
      `${entry.id} has a misleading label`,
    );
  }
  assert.match(source, /normalizeTrainingSessionConfig/);
  assert.match(source, /initialConfig=\{WARMUP_ARENA_CONFIG\}/);
  assert.match(source, /userId=\{arenaUserId\}/);
  assert.match(source, /setArenaUserId\(user\.id\)/);
  assert.match(source, /sessionId=\{arenaSessionId\}/);
  assert.match(source, /gameId=\{selectedGame\.id\}/);
  assert.match(source, /Time Complete - Finish The Signed Arena For Verified Results/);
  assert.doesNotMatch(source, /if \(timeLeft === 0 && phase === 'playing'\)[\s\S]{0,120}setPhase\('results'\)/);
  assert.doesNotMatch(source, /anon-|cash-preflop|cash-bb-defense|cash-cbet|cash-turn-play|onExit=/);
});

test('embedded Arena completion is not immediately overwritten by its paired exit callback', () => {
  const arena = read('src/components/training/GodModeArena.jsx');
  const completionStart = arena.indexOf('onComplete?.({');
  const completionEnd = arena.indexOf('onExit?.();', completionStart);
  assert.ok(completionStart >= 0 && completionEnd > completionStart);

  for (const file of [
    'pages/hub/training/autopilot.js',
    'pages/hub/training/quick-warmup.js',
  ]) {
    assert.doesNotMatch(read(file), /onExit=/, `${file} would overwrite its completion transition`);
  }
});

test('LeaderboardPanel consumes the verified API camelCase contract without inventing Diamonds', () => {
  const source = read('src/components/training/LeaderboardPanel.jsx');

  for (const field of [
    'userId',
    'username',
    'accuracy',
    'sessionsCompleted',
    'questionsCorrect',
    'gtowScoreAvg',
    'bestStreak',
  ]) {
    assert.match(source, new RegExp(`entry\\.${field}\\b`), `${field} is not rendered`);
  }
  assert.match(source, /entries\.map\(\(entry, i\) =>/);
  assert.match(source, /rank=\{entry\.rank\}/);
  assert.match(source, /isCurrentUser=\{Boolean\(userId && entry\.userId === userId\)\}/);
  assert.doesNotMatch(source, /\.sort\(/);
  assert.doesNotMatch(source, /entry\.(?:user_id|display_name|sessions_completed|questions_answered|total_diamonds)/);
  assert.doesNotMatch(source, /diamond/i);
});
