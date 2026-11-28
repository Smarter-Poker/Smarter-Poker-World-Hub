import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import './preflop-accessibility-phase7.test.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const LEADERBOARD = read('pages/hub/memory-games/leaderboard.js');
const STATS = read('pages/hub/memory-games/stats.js');
const ACHIEVEMENTS = read('pages/hub/memory-games/achievements.js');
const TUTORIAL = read('pages/hub/memory-games/tutorial.js');
const SHELL = read('src/components/memory-games/PreflopSubpageShell.jsx');
const NAV = read('src/components/memory-games/PreflopSubpageNav.jsx');
const MAIN = read('pages/hub/memory-games.js');
const SESSION_SERVICE = read('src/services/GameSessionService.js');
const CSS = read('src/styles/worlds/memory-games.css');

test('all canonical subpages share the responsive command shell', () => {
  for (const page of [LEADERBOARD, STATS, ACHIEVEMENTS, TUTORIAL]) assert.match(page, /PreflopSubpageShell/);
  // Mobile phase 2: the nav rows live in PreflopSubpageNav (a wrapping row,
  // never a scroller), which the shell imports and re-exports.
  assert.match(SHELL, /import PreflopSubpageNav, \{ PREFLOP_NAV_ITEMS \} from '\.\/PreflopSubpageNav'/);
  for (const route of ['/hub/preflop-charts/stats', '/hub/preflop-charts/leaderboard', '/hub/preflop-charts/achievements', '/hub/preflop-charts/tutorial']) assert.match(NAV, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(CSS, /\.preflop-subpage-nav[\s\S]*position:\s*sticky/);
  // The sanctioned breakpoints are 900/768/600 (docs/mobile-standard); 720 is gone.
  assert.match(CSS, /@media \(min-width: 769px\)/);
  assert.doesNotMatch(CSS, /@media \(min-width: 720px\)/);
});

test('leaderboard fails closed instead of displaying browser-authored rankings', () => {
  assert.match(LEADERBOARD, /Ranked Standings Paused/);
  assert.match(LEADERBOARD, /No Unverified Scores Displayed/);
  assert.match(LEADERBOARD, /Legacy Rankings Are Archived/);
  assert.match(LEADERBOARD, /Play In Club Arena/);
  assert.doesNotMatch(LEADERBOARD, /\.from\(|supabase|memory_leaderboards/);
  assert.doesNotMatch(LEADERBOARD, /getPlaceholderData|GTOWizard|RangeKing|accuracyToPercent/);
});

test('advertised deep-link modes remain wired and local results cannot self-persist', () => {
  for (const mode of ['speed-drill', 'pressure-cooker', 'pattern', 'mixed', 'spot-trainer', 'tournament']) {
    assert.match(MAIN, new RegExp(`['\"]${mode}['\"]`));
  }
  assert.match(SESSION_SERVICE, /server_authoritative_training_attempt_required/);
  assert.match(SESSION_SERVICE, /async recordSession\(\)[\s\S]*success:\s*false/);
  assert.doesNotMatch(SESSION_SERVICE, /\.from\(|insert\(|upsert\(|fetch\(/);
});

test('all public shorthand and canonical game-mode query aliases resolve', () => {
  const aliases = {
    speed: "['speed', 'speed-drill']",
    pressure: "['pressure', 'pressure-cooker']",
    pattern: "['pattern', 'pattern-recognition']",
    mixed: "['mixed', 'mixed-strategy']",
    spot: "['spot', 'spot-trainer']",
    tournament: "['tournament', 'tournament']",
  };
  for (const [query, mapping] of Object.entries(aliases)) {
    assert.ok(MAIN.includes(`${query}: ${mapping}`), `?mode=${query} must resolve to ${mapping}`);
  }
  for (const canonical of ['speed-drill', 'pressure-cooker', 'pattern-recognition', 'mixed-strategy', 'spot-trainer']) {
    assert.match(MAIN, new RegExp(`'${canonical}': \\[`), `${canonical} must remain backward compatible`);
  }
});

test('stats labels completed legacy rows as a local archive with no rank or reward', () => {
  assert.match(STATS, /\.eq\('completed', true\)/);
  assert.doesNotMatch(STATS, /\.eq\('status', 'completed'\)/);
  assert.match(STATS, /accuracyToPercent\(session\.accuracy, session\.score\)/);
  assert.doesNotMatch(STATS, /getPlaceholderStats|getPlaceholderLevelAccuracy/);
  for (const preservedSignal of ['Local Practice History', 'LEGACY LOCAL ARCHIVE', 'No Verified Rank Or Reward', 'Local Score Total', 'Highest Local Level', 'Recent trend', 'Focus Stations', 'not a ranked score']) {
    assert.match(STATS, new RegExp(preservedSignal));
  }
  assert.doesNotMatch(STATS, /Diamonds earned|label="(?:Verified|Global) Rank"|label="Reward Earned"/);
});

test('achievements uses the shared client and tutorial describes range training', () => {
  assert.doesNotMatch(ACHIEVEMENTS, /createClient\(|@supabase\/supabase-js/);
  assert.match(ACHIEVEMENTS, /import \{ supabase \} from/);
  // Title Case is the page-copy rule (check-title-case.mjs); the sentence survives.
  assert.match(TUTORIAL, /Missing Hands, Extra Hands/);
  assert.doesNotMatch(TUTORIAL, /Match Pairs of Cards/);
  assert.match(TUTORIAL, /Ctrl\/(?:⌘|Cmd) Z/);
});
