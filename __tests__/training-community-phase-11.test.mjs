import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// Hand Of The Day and the Training Feed moved to #SMARTERDESIGN interiors
// (2026-11-27): the command-deck shell repainted every pressed control pale
// cyan with dark ink and every heading in Orbitron over the console.
const routes = [];

test('Coach Mode is rebuilt on the #SMARTERDESIGN sessions interior (2026-11-27)', () => {
  const source = read('pages/hub/training/coach-mode.js');
  assert.match(source, /sessions-coaching\.module\.css/);
  assert.match(source, /className=\{s\.page\}/);
  // The retired command-deck shell drew a second frame, cyan pill buttons and
  // an amber progress segment around the lesson console.
  assert.doesNotMatch(source, /sp-training-command|sp-command-header|sp-command-main/);
});

test('the Goals page is rebuilt on #SMARTERDESIGN with its own image header (2026-11-27)', () => {
  const source = read('pages/hub/training/challenges.js');
  assert.match(source, /<TrainingPageHead slug="training-goals" title="Your Goals"/);
  assert.match(source, /training-smarterdesign\.module\.css/);
  assert.match(source, /className=\{sd\.page\}/);
  // The retired command-deck shell repainted every button border and drew a
  // second frame and an amber strip around the image header.
  assert.doesNotMatch(source, /sp-training-command|sp-command-header/);
});

test('the study group room and finder are rebuilt on #SMARTERDESIGN study-tool interiors (2026-11-27)', () => {
  for (const route of ['study-group', 'study-group-finder']) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.match(source, /<TrainingPageHead slug="training-study-group/, `${route} uses the image header`);
    assert.match(source, /study-tools\.module\.css/, `${route} uses the study-tool interior`);
    assert.match(source, /className=\{st\.page\}/, `${route} uses the console page rhythm`);
    // The retired command-deck shell repainted selected filters pale cyan and
    // drew a second frame around every surface.
    assert.doesNotMatch(source, /sp-training-command|sp-command-header|sp-command-main/);
  }
});

test('Hand Of The Day and the Training Feed are rebuilt on #SMARTERDESIGN interiors (2026-11-27)', () => {
  const daily = read('pages/hub/training/daily-challenge.js');
  assert.match(daily, /daily-challenge-casino\.module\.css/);
  assert.match(daily, /<main className=\{styles\.shell\}>/);
  const feed = read('pages/hub/training/training-feed.js');
  assert.match(feed, /training-journey-sd\.module\.css/);
  assert.match(feed, /className=\{sd\.main\}/);
  for (const source of [daily, feed]) {
    assert.doesNotMatch(source, /sp-training-command|sp-command-header|sp-command-main/);
  }
});

test('the remaining Phase 11 routes adopt the shared command-deck surface', () => {
  for (const route of routes) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.match(source, /sp-training-command/, `${route} is missing the Phase 11 shell`);
    assert.match(source, /sp-command-(?:header|main)/, `${route} is missing the command structure`);
  }
});

test('challenge definitions render only historical progress while live settlement is paused', () => {
  const source = read('pages/hub/training/challenges.js');
  const api = read('pages/api/training/challenges.js');

  assert.match(source, /title:\s*challenge\.title\s*\|\|\s*challenge\.name/);
  assert.match(source, /challenge\.goal\s*\?\?\s*challenge\.target_value/);
  assert.match(source, /Math\.max\(1,\s*challenge\.goal\)/);
  assert.match(source, /Tracking Paused/);
  assert.match(source, /Historical Snapshot/);
  assert.doesNotMatch(source, /challenge\.diamonds\s*\?\?\s*challenge\.diamond_reward/);
  assert.match(api, /paused_pending_verified_settlement/);
  assert.match(api, /rewardAvailable:\s*false/);
  assert.match(api, /progress:\s*0/);
  assert.doesNotMatch(api, /award_diamonds_v2|diamondsEarned/);
});

test('PvP reports unavailable live services honestly and routes to verified practice', () => {
  const source = read('pages/hub/training/pvp-lobby.js');

  assert.match(source, /real-player matchmaking/i);
  assert.match(source, /Real-Player Matchmaking', 'Not Live/);
  assert.match(source, /arena\/mtt-015\?level=1/);
  assert.doesNotMatch(source, /save-session|session-complete/);
  assert.doesNotMatch(source, /237\s*\+\s*Math\.floor\(Math\.random/);
  assert.doesNotMatch(source, /setOnlineCount/);
  assert.doesNotMatch(source, /GTO_Master|PokerShark99|23, losses: 14|Math\.random\(\) \* 400/);
});

test('Coach Mode keeps four-choice quizzes and unmistakable manual feedback', () => {
  const source = read('pages/hub/training/coach-mode.js');
  const optionArrays = [...source.matchAll(/opts:\s*\[([^\]]+)\]/g)];

  assert.ok(optionArrays.length >= 30, 'expected the complete authored coach quiz bank');
  for (const match of optionArrays) {
    const choices = match[1].match(/'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g) || [];
    assert.equal(choices.length, 4, `coach quiz does not have four answers: ${match[0]}`);
  }
  assert.match(source, /COACH_EXPLANATIONS/);
  assert.match(source, /className=\{s\.verdict\}[\s\S]{0,80}data-correct=/);
  assert.match(source, /'Correct'\s*:\s*'Incorrect'/);
  assert.match(source, /Your Answer/);
  assert.match(source, /Correct Answer/);
  assert.match(source, /This Result Will Stay Open Until You Click Next/);
  assert.match(source, /Next Question/);
  assert.doesNotMatch(source, /setTimeout\([^)]*nextQuizQuestion/);
});

test('Coach Mode is an image-led casino-realism chamber, not a generic dashboard', () => {
  const source = read('pages/hub/training/coach-mode.js');
  const css = read('src/styles/worlds/training.css');
  const artwork = [...source.matchAll(/art:\s*'([^']+)'/g)].map((match) => match[1]);

  assert.equal(artwork.length, 6, 'every Coach Mode module needs purpose-built rendered art');
  for (const publicPath of artwork) {
    const asset = path.join(root, 'public', publicPath);
    assert.ok(fs.existsSync(asset), `missing Coach Mode artwork: ${publicPath}`);
    assert.ok(fs.statSync(asset).size < 200_000, `Coach Mode artwork is not delivery-optimized: ${publicPath}`);
  }

  // The chamber render is now the scene of its image header.
  assert.match(source, /<TrainingPageHead\s+slug="training-coach-mode"/);
  assert.match(source, /sp-coach-casino/);
  assert.match(source, /sp-coach-console--concept/);
  assert.match(source, /sp-coach-console--quiz/);
  assert.match(source, /sp-coach-console--results/);
  assert.doesNotMatch(source, /style=\{\{/);
  assert.match(css, /COACH MODE — #SMARTERCASINOREALISM PRIVATE STRATEGY CHAMBER/);
  assert.match(css, /--coach-black:\s*#010305/);
  assert.match(css, /\.sp-coach-module-grid[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.sp-coach-module-grid[\s\S]*minmax\(0, 1fr\)/);
  assert.match(css, /\.sp-coach-module-card[\s\S]*border-radius:\s*2px\s*!important/);
});

test('the Phase 11 visual system uses straight dimensional cards and responsive grids', () => {
  const css = read('src/styles/worlds/training.css');

  assert.match(css, /PHASE 11 — CHALLENGES, COACHING & COMMUNITY COMMAND DECK/);
  assert.match(css, /\.sp-training-command div\[style\*="border: 1px"\][\s\S]*border-radius:\s*0\s*!important/);
  assert.match(css, /\.sp-command-grid--challenges,[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.sp-command-grid--challenges,[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/);
  assert.match(css, /\.sp-command-verdict\.is-correct[\s\S]*#50f1b5/);
  assert.match(css, /\.sp-command-header::after[\s\S]*#ffc65b/);
});

test('study groups and training feed use persisted, authenticated activity', () => {
  const finder = read('pages/hub/training/study-group-finder.js');
  const room = read('pages/hub/training/study-group.js');
  const feed = read('pages/hub/training/training-feed.js');
  const groupsApi = read('pages/api/training/study-groups.js');
  const groupApi = read('pages/api/training/study-groups/[groupId].js');
  const messagesApi = read('pages/api/training/study-groups/[groupId]/messages.js');

  assert.match(finder, /authedFetch\('\/api\/training\/study-groups'/);
  assert.match(finder, /Create Study Group/);
  assert.match(finder, /Join Group/);
  assert.doesNotMatch(finder, /MOCK_GROUPS|Preview Only|Coming Soon/);
  assert.match(room, /Persistent Member Room/);
  assert.match(room, /Copy Invite Link/);
  assert.match(room, /study-groups\/\$\{roomId\}\/messages/);
  assert.match(room, /Open Hand History Upload/);
  assert.doesNotMatch(room, /Local Study Workflow Preview|Invite Link Coming Soon|loadDemoHand|local-demo|save-session/);
  assert.match(groupsApi, /training_study_groups/);
  assert.match(groupsApi, /rpc\('create_training_study_group'/);
  assert.match(groupApi, /training_study_group_members/);
  assert.match(groupApi, /rpc\('join_training_study_group'/);
  assert.doesNotMatch(groupApi, /select\('\*', \{ count: 'exact', head: true \}\)/);
  assert.match(messagesApi, /training_study_group_messages/);
  assert.match(feed, /Verified Training Activity/);
  assert.doesNotMatch(feed, /simulated community activity|FRIEND_NAMES|community-\$\{i\}/);
});

test('the global header stays outside every scoped Phase 11 redesign', () => {
  // The study group room left the command deck for #SMARTERDESIGN
  // (2026-11-27): the global header still renders before the page head.
  const room = read('pages/hub/training/study-group.js');
  assert.ok(room.indexOf('<UniversalHeader') < room.lastIndexOf('<TrainingPageHead'));
  // PvP Lobby and Tournament Prep left the command deck for #SMARTERDESIGN
  // (2026-11-27): the global header still renders before the page head.
  for (const route of ['pvp-lobby', 'tournament-prep']) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.ok(source.indexOf('<UniversalHeader') < source.lastIndexOf('<TrainingPageHead'));
    assert.match(source, /training-play\.module\.css/);
    assert.doesNotMatch(source, /sp-training-command|sp-command-header/);
  }
  const goals = read('pages/hub/training/challenges.js');
  assert.ok(goals.indexOf('<UniversalHeader') < goals.lastIndexOf('<TrainingPageHead'));
  const css = read('src/styles/worlds/training.css');
  assert.doesNotMatch(css, /\.universal-header[^\n]*sp-training-command/);
});
