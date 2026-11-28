// LAW (2026-11-27): every claim the site makes about its poker room directory
// is a claim the database supports.
//
// Sibling of the-room-count-is-real.law.test.mjs, which pins the total. On
// 2026-11-28 the listed set (poker_venues, is_active and not is_suppressed)
// was read again and five more kinds of claim were found untrue:
//
//   1. "560+ Verified Poker Rooms": only 69 listed rooms carry a
//      last_verified_at date. "Verified" may describe those 69 and nothing
//      else, and only with VERIFIED_VENUE_COUNT on the same line.
//   2. "210+ PLO", "140+ Limit & Mixed", "180+ Bad Beat Jackpot" US venues:
//      games_offered says 135 PLO and 31 limit or mixed rooms, and no column
//      records bad beat jackpots at all. Per-game figures come from the
//      constants in src/lib/venueCount.mjs or are not stated.
//   3. "North American" / "International" venues: every listed row has
//      country = 'US'. The international destination guides stay; claims
//      that the directory lists rooms outside the US do not.
//   4. "42 States" / "38 States": the listed set covers 41 US states.
//      VENUE_STATE_COUNT is the only state count of the directory.
//   5. "Active Live Rooms" on /poker-rooms/states: cash-game data is
//      modelled, not live (.agent/workflows/live-cash-games-policy.md), and
//      the per-state numbers were hand typed. The column is "Listed Rooms" and
//      reads LISTED_VENUES_BY_STATE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VENUE_COUNT,
  VENUE_COUNT_LABEL,
  VERIFIED_LISTED_VENUES,
  VERIFIED_VENUE_COUNT,
  LISTED_VENUES_BY_STATE,
  LISTED_VENUES_WITHOUT_STATE,
  VENUE_STATE_COUNT,
  VENUES_SPREADING_NLH,
  VENUES_SPREADING_PLO,
  VENUES_SPREADING_LIMIT_OR_MIXED,
  VENUES_SPREADING_MIXED,
  NLH_VENUE_LABEL,
  PLO_VENUE_LABEL,
  LIMIT_MIXED_VENUE_LABEL,
  MIXED_VENUE_LABEL,
  VENUE_FLOOR_BY_GAME_SLUG,
  listedVenueCount,
  listedVenueLabel,
} from '../src/lib/venueCount.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANT_MODULE = path.join('src', 'lib', 'venueCount.mjs');
const SOURCE_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(rel);
  }
  return out;
}

// The static files a crawler reads directly, plus the script that writes one.
const STATIC_FILES = [
  'public/llms.txt',
  'public/llms-full.txt',
  'public/opensearch.xml',
  'public/.well-known/ai-facts.json',
  'public/.well-known/agent.json',
  'public/.well-known/ai-plugin.json',
  'public/.well-known/mcp.json',
  'public/.well-known/mcp-registry.json',
  'scripts/generate-llms-full.mjs',
];

const SCANNED = [...walk('src'), ...walk('pages'), ...STATIC_FILES].filter((f) => f !== CONSTANT_MODULE);

// "Verified Poker Rooms", "Verified Live US Poker Venues", "Verified Cardrooms",
// "Verified Venues", "560+ verified live poker rooms": a blanket claim about
// the listed set. Plural only: a single "Verified Player" or a venue's own
// "Verified" badge is not a statement about the directory.
const BLANKET_VERIFIED = [
  /\bVerified\s+(?:Live\s+)?(?:US\s+|North American\s+)?(?:Live\s+)?(?:Legal\s+)?(?:Casino\s+)?(?:Poker\s+)?(?:Rooms|Venues|Cardrooms|Card Rooms|Venue Profiles|Venue Directory|Poker Venues Directory|Directory)\b/g,
  /\bverified\s+(?:live\s+)?(?:US\s+|north american\s+)?(?:poker\s+)?(?:rooms|venues|cardrooms|card rooms)\b/gi,
];

// A typed state count: "42 States", "38 US States", "15 States". All 50 / 51
// (50 states and DC) describe the state guides and are allowed; any count of
// states the directory covers must come from VENUE_STATE_COUNT.
const STATE_COUNT = /\b(\d{1,2})\s+(?:US\s+|U\.S\.\s+)?States\b|\b(\d{1,2})\s+(?:US|U\.S\.)\s+states\b/g;

// The directory claimed rooms outside the US.
const NON_US_DIRECTORY = [
  /\$?\{VENUE_COUNT_LABEL\}\s+(?:\w+\s+){0,3}?(?:North American|International)\b/g,
  /\b\d{3}\+\s+(?:\w+\s+){0,3}?(?:North American|International)\s+(?:Live\s+)?(?:Poker\s+)?(?:Rooms|Venues|Cardrooms)\b/gi,
  /\bInternational\s+(?:Live\s+)?(?:Poker\s+)?(?:Venues|Cardrooms|Card Rooms)\b/g,
];
const NON_US_SAME_LINE = /(?:Across North America|In North America|Canada|Internationally|International Destinations)/;

// "Active Live Rooms" implies live table data, which the policy says is modelled.
const LIVE_LABEL = /\bActive Live (?:Poker )?Rooms\b/gi;

// Per-game figures that were never in the data, and the retired 324 total in
// any spelling or language.
const RETIRED_GAME_COUNTS = /\b(?:210|140|180)\+\s+US Venues\b/g;
const RETIRED_324 = /\b324(?=[- ](?:Venue|Active|Verified|Verifizierten|Licensed|Salas|Salles|Sale|以上))/g;

test('the listed-set constants agree with each other and with the verified total', () => {
  const stateSum = Object.values(LISTED_VENUES_BY_STATE).reduce((a, b) => a + b, 0);
  assert.equal(
    stateSum + LISTED_VENUES_WITHOUT_STATE,
    VERIFIED_LISTED_VENUES,
    'per-state counts plus stateless rows must add up to the verified listed count',
  );
  assert.equal(VENUE_STATE_COUNT, Object.keys(LISTED_VENUES_BY_STATE).length);
  assert.ok(VENUE_STATE_COUNT <= 50, 'the directory cannot cover more than 50 states');
  for (const [code, n] of Object.entries(LISTED_VENUES_BY_STATE)) {
    assert.match(code, /^[A-Z]{2}$/, `${code} is not a state code`);
    assert.ok(Number.isInteger(n) && n > 0, `${code} must list at least one room`);
  }
  assert.ok(VERIFIED_VENUE_COUNT > 0 && VERIFIED_VENUE_COUNT < VENUE_COUNT, 'verified rooms are a subset of listed rooms');

  for (const n of [VENUES_SPREADING_NLH, VENUES_SPREADING_PLO, VENUES_SPREADING_LIMIT_OR_MIXED, VENUES_SPREADING_MIXED]) {
    assert.ok(Number.isInteger(n) && n > 0 && n <= VERIFIED_LISTED_VENUES);
  }
  assert.ok(VENUES_SPREADING_MIXED <= VENUES_SPREADING_LIMIT_OR_MIXED);
  for (const [label, n] of [
    [NLH_VENUE_LABEL, VENUES_SPREADING_NLH],
    [PLO_VENUE_LABEL, VENUES_SPREADING_PLO],
    [LIMIT_MIXED_VENUE_LABEL, VENUES_SPREADING_LIMIT_OR_MIXED],
    [MIXED_VENUE_LABEL, VENUES_SPREADING_MIXED],
  ]) {
    const floor = Number(label.replace('+', ''));
    assert.ok(label.endsWith('+') && floor <= n && floor > 0, `${label} must be a floor at or below ${n}`);
  }
  assert.ok(Object.values(VENUE_FLOOR_BY_GAME_SLUG).every((l) => /^\d+\+$/.test(l)));

  assert.equal(listedVenueCount('tx'), LISTED_VENUES_BY_STATE.TX);
  assert.equal(listedVenueCount('UT'), 0);
  assert.equal(listedVenueLabel('UT'), '0 Listed Rooms');
  assert.equal(listedVenueLabel('AR'), '1 Listed Room');

  const moduleSrc = fs.readFileSync(path.join(ROOT, CONSTANT_MODULE), 'utf8');
  for (const q of [/last_verified_at IS NOT NULL/, /GROUP BY state/, /'PLO' = ANY\(games_offered\)/, /count\(DISTINCT state\)/]) {
    assert.match(moduleSrc, q, `venueCount.mjs must record the query ${q}`);
  }
});

test('no file claims every listed room is verified', () => {
  const violations = [];
  for (const rel of SCANNED) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('VERIFIED_VENUE_COUNT')) return;
      for (const re of BLANKET_VERIFIED) {
        for (const m of line.matchAll(re)) violations.push(`${rel}:${i + 1}: "${m[0]}"`);
      }
    });
  }
  assert.deepEqual(
    violations,
    [],
    `"Verified" describes only the ${VERIFIED_VENUE_COUNT} rooms with last_verified_at; say Listed or Poker Rooms:\n  ${violations.join('\n  ')}`,
  );
});

test('no file types a state count; the directory count is VENUE_STATE_COUNT', () => {
  const violations = [];
  for (const rel of SCANNED) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(STATE_COUNT)) {
        const n = Number(m[1] || m[2]);
        if (n === 50 || n === 51) continue;
        violations.push(`${rel}:${i + 1}: "${m[0]}"`);
      }
    });
  }
  assert.deepEqual(violations, [], `hard-coded state counts; import VENUE_STATE_COUNT:\n  ${violations.join('\n  ')}`);
});

test('no claim places directory rooms outside the US', () => {
  const violations = [];
  for (const rel of SCANNED) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const re of NON_US_DIRECTORY) {
        for (const m of line.matchAll(re)) violations.push(`${rel}:${i + 1}: "${m[0]}"`);
      }
      if (/VENUE_COUNT_LABEL|VENUE_COUNT\b/.test(line) && NON_US_SAME_LINE.test(line)) {
        violations.push(`${rel}:${i + 1}: the room count shares a line with a non-US claim`);
      }
    });
  }
  assert.deepEqual(violations, [], `every listed venue is in the US:\n  ${violations.join('\n  ')}`);
});

test('no "Active Live Rooms" label and no retired per-game or 324 figures', () => {
  const violations = [];
  for (const rel of SCANNED) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const re of [LIVE_LABEL, RETIRED_GAME_COUNTS, RETIRED_324]) {
      for (const m of src.matchAll(re)) violations.push(`${rel}: "${m[0]}"`);
    }
  }
  assert.deepEqual(violations, [], violations.join('\n  '));
});

test('/poker-rooms/states shows Listed Rooms from the listed set', () => {
  const index = fs.readFileSync(path.join(ROOT, 'pages/poker-rooms/states/index.js'), 'utf8');
  assert.match(index, /<th style=\{styles\.th\}>Listed Rooms<\/th>/);
  assert.match(index, /\{listedVenueCount\(s\.code\)\}/);
  assert.match(index, /from '\.\.\/\.\.\/\.\.\/src\/lib\/venueCount\.mjs'/);
  const detail = fs.readFileSync(path.join(ROOT, 'pages/poker-rooms/states/[state].js'), 'utf8');
  assert.match(detail, /listedVenueLabel\(stateGuide\.code\)/);
  // The hand-typed per-state estimates are gone, so nothing can show them.
  for (const rel of SCANNED) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(src, /approxLiveRooms/, `${rel} still reads the retired approxLiveRooms field`);
  }
});

test('the AI markdown renders verified per-game counts and nothing undefined', async () => {
  const md = await import('../src/lib/seo/markdownIngestion.mjs');
  const cash = md.renderLiveCashGamesMarkdown();
  assert.ok(cash.includes(`${PLO_VENUE_LABEL} US Venues`));
  assert.ok(cash.includes(`${LIMIT_MIXED_VENUE_LABEL} US Venues`));
  assert.ok(cash.includes(`${VENUE_COUNT_LABEL} US Venues`));

  const byGame = md.renderPokerRoomsByGameIndexMarkdown();
  assert.doesNotMatch(byGame, /undefined/);
  assert.ok(byGame.includes(`${PLO_VENUE_LABEL} Venues`));
  const plo = md.renderPokerRoomsByGameDetailMarkdown('pot-limit-omaha');
  assert.doesNotMatch(plo, /undefined/);
  assert.ok(plo.includes(`${PLO_VENUE_LABEL} Poker Rooms`));
  const bomb = md.renderPokerRoomsByGameDetailMarkdown('double-board-bomb-pots');
  assert.doesNotMatch(bomb, /undefined|Venues Spreading Game/, 'no count is stated where the data has none');
});

test('ai-facts states the verified and state counts from the constants', () => {
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/.well-known/ai-facts.json'), 'utf8'));
  const found = { v: [], s: [] };
  JSON.stringify(facts, (k, v) => {
    if (k === 'venuesWithRecordedVerificationCount') found.v.push(v);
    if (k === 'venueStatesCount') found.s.push(v);
    return v;
  });
  assert.deepEqual(found.v, [VERIFIED_VENUE_COUNT]);
  assert.deepEqual(found.s, [VENUE_STATE_COUNT]);
  const api = fs.readFileSync(path.join(ROOT, 'pages/api/ai/facts.js'), 'utf8');
  assert.match(api, /venuesWithRecordedVerificationCount: VERIFIED_VENUE_COUNT/);
  assert.match(api, /venueStatesCount: VENUE_STATE_COUNT/);
});
