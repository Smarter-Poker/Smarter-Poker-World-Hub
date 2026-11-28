// LAW (2026-11-27): the poker room count the site claims is the count the
// database holds.
//
// About 70 files used to tell players and AI crawlers "715+ Live Rooms" (and
// others "324+", "500+", "320+"). poker_venues has never held 715 rows: on
// 2026-11-28 it had 603 rows, 593 active and 564 listed (active and not
// suppressed, the condition /api/poker/venues serves). "Live Rooms" also read
// as live table data, which the cash-games policy says is modelled, not
// scraped (.agent/workflows/live-cash-games-policy.md).
//
// The fix is one source of truth, src/lib/venueCount.mjs. This law pins it:
//   1. the public floor never exceeds the verified listed count;
//   2. no file in src/, pages/ or scripts/ types its own total room count, or any of
//      the retired figures, outside that module;
//   3. the static public files a crawler reads say exactly VENUE_COUNT_LABEL;
//   4. the homepage sticky CTA renders the shared label, not a number.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VENUE_COUNT,
  VENUE_COUNT_LABEL,
  VERIFIED_LISTED_VENUES,
  VENUE_COUNT_VERIFIED_AT,
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

// A total-room claim: "715+ Live Rooms", "560+ Verified Poker Venues",
// "324+ US Live Cardroom", "500+ Rooms" and the like.
const ROOM_CLAIM = /\b(\d{3,4})\+\s*(?:(?:Live|Verified|Tracked|Audited|Active|Licensed|Surveyed|Listed|North American|US)\s+)*(?:Poker\s+|Card\s?)?(?:Rooms?|Venues?|Cardrooms?|Casinos?)\b/gi;
// The figures this law retired. Never valid in any context.
const RETIRED = /\b(?:715|324)(?:\+|%2B)/g;
// A count followed by "Live Rooms" implies live data even when the number is right.
const LIVE_ROOMS = /\b\d{3,4}\+\s*Live\s+Rooms\b/gi;

test('the public room count never exceeds the verified count', () => {
  assert.equal(typeof VENUE_COUNT, 'number');
  assert.ok(Number.isInteger(VENUE_COUNT) && VENUE_COUNT > 0, 'VENUE_COUNT must be a positive integer');
  assert.ok(
    VENUE_COUNT <= VERIFIED_LISTED_VENUES,
    `VENUE_COUNT (${VENUE_COUNT}) claims more rooms than the ${VERIFIED_LISTED_VENUES} poker_venues listed on ${VENUE_COUNT_VERIFIED_AT}`,
  );
  // The verified figure itself must be the one read on 2026-11-28 or a later
  // re-read; it can only move with a fresh query, recorded in the module.
  assert.ok(VERIFIED_LISTED_VENUES < 715, 'the directory has never held 715 listed rooms');
  assert.equal(VENUE_COUNT_LABEL, `${VENUE_COUNT}+`);
  assert.match(VENUE_COUNT_VERIFIED_AT, /^\d{4}-\d{2}-\d{2}$/);
  const moduleSrc = fs.readFileSync(path.join(ROOT, CONSTANT_MODULE), 'utf8');
  assert.match(moduleSrc, /FROM poker_venues/, 'the module must record the query that verified the count');
});

test('no file in src/, pages/ or scripts/ hard-codes a room count outside the shared module', () => {
  // scripts/ is included because scripts/generate-llms-full.mjs writes public/llms-full.txt.
  const files = [...walk('src'), ...walk('pages'), ...walk('scripts')].filter((f) => f !== CONSTANT_MODULE);
  assert.ok(files.length > 500, `expected to scan the whole tree, found ${files.length} files`);
  const violations = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(RETIRED)) violations.push(`${rel}: retired figure "${m[0]}"`);
    for (const m of src.matchAll(LIVE_ROOMS)) violations.push(`${rel}: "${m[0]}" implies live data; say Poker Rooms`);
    for (const m of src.matchAll(ROOM_CLAIM)) {
      const n = Number(m[1]);
      // A subset smaller than the directory ("210+ US Venues" for PLO) can be
      // honest; a total at or above the floor must come from the constant.
      if (n >= VENUE_COUNT) violations.push(`${rel}: hard-coded room count "${m[0]}"; import VENUE_COUNT_LABEL`);
    }
  }
  assert.deepEqual(violations, [], `hard-coded room counts found:\n  ${violations.join('\n  ')}`);
});

test('static public files a crawler reads state exactly VENUE_COUNT_LABEL', () => {
  const staticFiles = [
    'public/llms.txt',
    'public/llms-full.txt',
    'public/opensearch.xml',
    'public/.well-known/ai-facts.json',
    'public/.well-known/agent.json',
    'public/.well-known/ai-plugin.json',
  ];
  for (const rel of staticFiles) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.deepEqual([...src.matchAll(RETIRED)].map((m) => m[0]), [], `${rel} still carries a retired room count`);
    for (const m of src.matchAll(ROOM_CLAIM)) {
      if (Number(m[1]) >= VENUE_COUNT) {
        assert.equal(`${m[1]}+`, VENUE_COUNT_LABEL, `${rel}: "${m[0]}" must say ${VENUE_COUNT_LABEL}`);
      }
    }
  }
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/.well-known/ai-facts.json'), 'utf8'));
  assert.equal(JSON.stringify(facts).includes('"verifiedVenuesCount":'), true);
  const counts = [];
  JSON.stringify(facts, (k, v) => { if (k === 'verifiedVenuesCount') counts.push(v); return v; });
  assert.ok(counts.length > 0);
  for (const c of counts) assert.equal(c, VENUE_COUNT, 'ai-facts.json verifiedVenuesCount must equal VENUE_COUNT');
});

test('the AI facts endpoints serve the shared constant, not a literal', () => {
  for (const rel of ['pages/api/ai/facts.js', 'pages/api/ai/freshness-ledger.js', 'pages/api/ai/geo-directory.geojson.js']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(src, /from '\.\.\/\.\.\/\.\.\/src\/lib\/venueCount\.mjs'/, `${rel} must import the shared room count`);
    assert.doesNotMatch(src, /(?:verifiedVenuesCount|totalVerifiedVenuesInCorpus):\s*\d/, `${rel} must not type a numeric room count`);
  }
});

test('the homepage sticky CTA renders the shared label', () => {
  const home = fs.readFileSync(path.join(ROOT, 'pages/index.js'), 'utf8');
  assert.match(home, /import \{ VENUE_COUNT_LABEL \} from '\.\.\/src\/lib\/venueCount\.mjs';/);
  assert.match(home, /\{VENUE_COUNT_LABEL\} Poker Rooms &amp; 107 Free GTO Games/);
  const cta = fs.readFileSync(path.join(ROOT, 'src/components/seo/SmarterConversionCta.jsx'), 'utf8');
  assert.match(cta, /`\$\{VENUE_COUNT_LABEL\} Poker Rooms`/, 'SmarterConversionCta default highlights must use the shared label');
});
