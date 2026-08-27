import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const LEADERBOARD = read('pages/hub/memory-games/leaderboard.js');
const STATS = read('pages/hub/memory-games/stats.js');
const ACHIEVEMENTS = read('pages/hub/memory-games/achievements.js');
const TUTORIAL = read('pages/hub/memory-games/tutorial.js');
const SHELL = read('src/components/memory-games/PreflopSubpageShell.jsx');
const MAIN = read('pages/hub/memory-games.js');
const SESSION_SERVICE = read('src/services/GameSessionService.js');
const CSS = read('src/styles/worlds/memory-games.css');

test('all canonical subpages share the responsive command shell', () => {
  for (const page of [LEADERBOARD, STATS, ACHIEVEMENTS, TUTORIAL]) assert.match(page, /PreflopSubpageShell/);
  for (const route of ['/hub/preflop-charts/stats', '/hub/preflop-charts/leaderboard', '/hub/preflop-charts/achievements', '/hub/preflop-charts/tutorial']) assert.match(SHELL, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(CSS, /\.preflop-subpage-nav[\s\S]*position:\s*sticky/);
  assert.match(CSS, /@media \(min-width: 720px\)/);
});

test('leaderboard uses a valid real-data query and never invents rankings', () => {
  assert.match(LEADERBOARD, /\.from\('memory_leaderboards'\)/);
  assert.match(LEADERBOARD, /\.limit\(50\)/);
  assert.doesNotMatch(LEADERBOARD, /\.limit\(100\) \/\/ leaderboard/);
  assert.doesNotMatch(LEADERBOARD, /getPlaceholderData|GTOWizard|RangeKing/);
  assert.match(LEADERBOARD, /accuracyToPercent\(entry\.accuracy, entry\.score\)/);
});

test('advertised deep-link modes and safe accuracy persistence remain wired', () => {
  for (const mode of ['speed-drill', 'pressure-cooker', 'pattern', 'mixed', 'spot-trainer', 'tournament']) {
    assert.match(MAIN, new RegExp(`['\"]${mode}['\"]`));
  }
  assert.match(SESSION_SERVICE, /accuracy:\s*accuracy/);
  assert.doesNotMatch(SESSION_SERVICE, /accuracy:\s*accuracyToFraction/);
});

test('stats reads the completed boolean contract and normalizes mixed accuracy units', () => {
  assert.match(STATS, /\.eq\('completed', true\)/);
  assert.doesNotMatch(STATS, /\.eq\('status', 'completed'\)/);
  assert.match(STATS, /accuracyToPercent\(session\.accuracy, session\.score\)/);
  assert.doesNotMatch(STATS, /getPlaceholderStats|getPlaceholderLevelAccuracy/);
  for (const preservedSignal of ['Total score', 'Diamonds earned', 'Highest level', 'Recent trend', 'Focus stations']) {
    assert.match(STATS, new RegExp(preservedSignal));
  }
});

test('achievements uses the shared client and tutorial describes range training', () => {
  assert.doesNotMatch(ACHIEVEMENTS, /createClient\(|@supabase\/supabase-js/);
  assert.match(ACHIEVEMENTS, /import \{ supabase \} from/);
  assert.match(TUTORIAL, /Missing hands, extra hands/);
  assert.doesNotMatch(TUTORIAL, /Match Pairs of Cards/);
  assert.match(TUTORIAL, /Ctrl\/⌘ Z/);
});
