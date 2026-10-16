/**
 * The Daily Challenge winner is unchanged by skipping rows that cannot win.
 *
 * 2026-10-16: /api/training/hand-of-the-day took ~45s because selection read
 * ~8,800 LEGACY_UNVERIFIED rows (never eligible) one 64-row OFFSET page at a
 * time. src/lib/training/dailyCandidateScan.mjs reads the same circular order
 * with those rows filtered out in SQL. This test runs the original algorithm
 * and the new one over the same randomised caches and requires the same
 * winner every time, then pins the route's wiring and its SQL prefilter to
 * the campaign contract it relies on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DAILY_ELIGIBLE_SOURCE_CLASSIFICATIONS,
  scanDailyCandidates,
} from '../src/lib/training/dailyCandidateScan.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const CLASSES = ['LEGACY_UNVERIFIED', 'HEURISTIC', 'CURATED', 'CHART_AUDITED', 'SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

function makeCache(seed) {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * 400);
  const ids = new Set();
  while (ids.size < n) ids.add(`q_${Math.floor(r() * 1e6).toString(36).padStart(5, '0')}`);
  return [...ids].sort().map((id) => {
    const cls = CLASSES[Math.floor(r() * CLASSES.length)];
    // Only an eligible class can pass; within it, some rows still fail the full check.
    const passes = DAILY_ELIGIBLE_SOURCE_CLASSIFICATIONS.includes(cls) && r() < 0.15;
    return { question_id: id, source_classification: cls, passes };
  });
}

const canonicalize = (row) => (row.passes ? { id: row.question_id } : null);

// The algorithm as it was before 2026-10-16 (OFFSET pages over the full set).
function originalSelect(rows, offset, pageSize) {
  const count = rows.length;
  let scanned = 0;
  while (scanned < count) {
    const start = (offset + scanned) % count;
    const take = Math.min(pageSize, count - scanned, count - start);
    const page = rows.slice(start, start + take);
    for (const row of page) {
      const candidate = canonicalize(row);
      if (candidate) return candidate;
    }
    scanned += take;
  }
  return null;
}

function readersFor(rows, counter) {
  return {
    readIdAt: async (position) => { counter.reads += 1; return rows[position]?.question_id ?? null; },
    readPage: async ({ fromId, afterId, beforeId, limit }) => {
      counter.reads += 1;
      return rows
        .filter((row) => DAILY_ELIGIBLE_SOURCE_CLASSIFICATIONS.includes(row.source_classification))
        .filter((row) => (fromId === undefined || row.question_id >= fromId)
          && (afterId === undefined || row.question_id > afterId)
          && (beforeId === undefined || row.question_id < beforeId))
        .slice(0, limit);
    },
  };
}

test('the new scan picks exactly the original winner on 2,000 randomised caches', async () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const rows = makeCache(seed);
    const pageSize = 1 + (seed % 70);
    for (const offset of [0, rows.length - 1, seed % rows.length]) {
      const expected = originalSelect(rows, offset, pageSize);
      const counter = { reads: 0 };
      const actual = await scanDailyCandidates({
        count: rows.length, offset, pageSize, canonicalize, ...readersFor(rows, counter),
      });
      assert.deepEqual(actual, expected, `seed ${seed}, offset ${offset}, page ${pageSize}`);
    }
  }
});

test('the 2026-10-16 shape no longer reads thousands of unwinnable rows', async () => {
  // 11,442 rows ahead of the first winner from offset 2,619, all legacy.
  const rows = [];
  for (let i = 0; i < 23575; i += 1) {
    const winner = i === 11442;
    rows.push({ question_id: `q${String(i).padStart(6, '0')}`, source_classification: winner ? 'CHART_AUDITED' : 'LEGACY_UNVERIFIED', passes: winner });
  }
  const counter = { reads: 0 };
  const actual = await scanDailyCandidates({ count: rows.length, offset: 2619, pageSize: 64, canonicalize, ...readersFor(rows, counter) });
  assert.deepEqual(actual, originalSelect(rows, 2619, 64));
  assert.equal(actual.id, 'q011442');
  assert.ok(counter.reads <= 3, `expected a handful of reads, got ${counter.reads}`);
});

test('a changed set or bad input fails closed', async () => {
  const none = async () => [];
  assert.equal(await scanDailyCandidates({ count: 0, offset: 0, pageSize: 64, readIdAt: async () => 'a', readPage: none, canonicalize }), null);
  assert.equal(await scanDailyCandidates({ count: 3, offset: 3, pageSize: 64, readIdAt: async () => 'a', readPage: none, canonicalize }), null);
  assert.equal(await scanDailyCandidates({ count: 3, offset: 1, pageSize: 64, readIdAt: async () => null, readPage: none, canonicalize }), null);
});

test('the SQL prefilter matches every class the campaign contract can accept', () => {
  const delivery = read('src/lib/training/trainingAttemptDelivery.mjs');
  const body = delivery.slice(delivery.indexOf('export function trainingQuestionCampaignEligibility'), delivery.indexOf('export function isTrainingQuestionCampaignEligible'));
  // Every eligible branch requires one of these as the question's dataQuality.
  for (const cls of DAILY_ELIGIBLE_SOURCE_CLASSIFICATIONS) assert.match(body, new RegExp(`'${cls}'`), `${cls} is still an accepted class`);
  const accepted = new Set([
    ...[...body.matchAll(/(?:sourceClassification|dataQuality) [!=]== '([A-Z_]+)'/g)].map((m) => m[1]),
    ...[...body.matchAll(/\[([^\]]+)\]\.includes\(sourceClassification\)/g)]
      .flatMap((m) => [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])),
  ]);
  assert.ok(accepted.size >= 4, `parsed the accepted classes: ${[...accepted]}`);
  for (const cls of accepted) assert.ok(DAILY_ELIGIBLE_SOURCE_CLASSIFICATIONS.includes(cls), `${cls} is accepted by the contract but filtered out of the daily scan`);
  // The persisted classification becomes the question's dataQuality.
  const receipt = read('src/lib/training/cacheTruthPersistence.mjs');
  assert.match(receipt, /dataQuality: row\.source_classification/);
});

test('the route uses the shared scan with the same count, ordering and prefilter', () => {
  const src = read('pages/api/training/hand-of-the-day.js');
  assert.match(src, /scanDailyCandidates\(\{\s*count,\s*offset: dateHash\(today\) % count,/);
  assert.match(src, /\.in\('source_classification', DAILY_ELIGIBLE_SOURCE_CLASSIFICATIONS\)/);
  assert.match(src, /if \(fromId\) query = query\.gte\('question_id', fromId\);/);
  assert.match(src, /if \(afterId\) query = query\.gt\('question_id', afterId\);/);
  assert.match(src, /if \(beforeId\) query = query\.lt\('question_id', beforeId\);/);
  assert.match(src, /\.order\('question_id', \{ ascending: true \}\)\.limit\(limit\)/);
  assert.doesNotMatch(src, /readCandidateRange/);
  // The offset is still taken over the unfiltered set.
  const count = src.slice(src.indexOf("label: 'DailyChallenge:candidate-count'") - 400, src.indexOf("label: 'DailyChallenge:candidate-count'"));
  assert.doesNotMatch(count, /source_classification/);
});
