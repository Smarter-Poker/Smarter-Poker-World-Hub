import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const routes = [
  'challenges',
  'daily-challenge',
  'pvp-lobby',
  'coach-mode',
  'study-group',
  'study-group-finder',
  'training-feed',
  'tournament-prep',
];

test('all eight Phase 11 routes adopt the shared command-deck surface', () => {
  for (const route of routes) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.match(source, /sp-training-command/, `${route} is missing the Phase 11 shell`);
    assert.match(source, /sp-command-(?:header|main)/, `${route} is missing the command structure`);
  }
});

test('challenge API rows are normalized before rendering progress and rewards', () => {
  const source = read('pages/hub/training/challenges.js');

  assert.match(source, /title:\s*challenge\.title\s*\|\|\s*challenge\.name/);
  assert.match(source, /challenge\.goal\s*\?\?\s*challenge\.target_value/);
  assert.match(source, /challenge\.diamonds\s*\?\?\s*challenge\.diamond_reward/);
  assert.match(source, /Math\.max\(1,\s*challenge\.goal\)/);
});

test('PvP identifies practice AI and never presents fabricated competitive data as live', () => {
  const source = read('pages/hub/training/pvp-lobby.js');

  assert.match(source, /Training Opponent Ready/);
  assert.match(source, /Training AI/);
  assert.match(source, /real-player matchmaking/i);
  assert.match(source, /available:\s*false/);
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
  assert.match(source, /sp-command-verdict/);
  assert.match(source, /'Correct'\s*:\s*'Incorrect'/);
  assert.match(source, /Your Answer/);
  assert.match(source, /Correct Answer/);
  assert.match(source, /This Result Will Stay Open Until You Click Next/);
  assert.match(source, /Next Question/);
  assert.doesNotMatch(source, /setTimeout\([^)]*nextQuizQuestion/);
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

test('community previews and unavailable creation actions remain honest', () => {
  const finder = read('pages/hub/training/study-group-finder.js');
  const room = read('pages/hub/training/study-group.js');
  const feed = read('pages/hub/training/training-feed.js');

  assert.match(finder, /example groups/);
  assert.match(finder, /Creating Groups Coming Soon/);
  assert.match(finder, /Preview Only/);
  assert.match(finder, /disabled/);
  assert.doesNotMatch(finder, /study-group-applied|Study Group Application/);
  assert.match(room, /Invite Link Coming Soon/);
  assert.match(room, /Local Study Workflow Preview/);
  assert.doesNotMatch(room, /test-room-123|save-session/);
  assert.match(feed, /Verified Training Activity/);
  assert.doesNotMatch(feed, /simulated community activity|FRIEND_NAMES|community-\$\{i\}/);
});

test('the global header stays outside every scoped Phase 11 redesign', () => {
  for (const route of ['challenges', 'study-group', 'tournament-prep']) {
    const source = read(`pages/hub/training/${route}.js`);
    assert.ok(source.indexOf('<UniversalHeader') < source.lastIndexOf('sp-training-command'));
  }
  const css = read('src/styles/worlds/training.css');
  assert.doesNotMatch(css, /\.universal-header[^\n]*sp-training-command/);
});
