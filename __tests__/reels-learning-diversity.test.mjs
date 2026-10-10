import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { selectLearningRows } from '../src/lib/reelsLearningRanking.mjs';
import { reelsFeedModeContract } from '../src/lib/reelsDeliveryContract.mjs';

// The controller imports the browser feed classifier, whose canonical storage
// host is read at module evaluation time. Set the maintained test project
// before importing it so this registered suite cannot poison later guards.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
const { loadCanonicalReelsWindow } = await import('../src/lib/reelsFeedController.mjs');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SERVER = read('../src/lib/server/reelsFeed.js');
const LIVE = read('../scripts/ci/reels-live-check.mjs');
const PAGE = read('../pages/hub/reels.js');

function row(source, index, sourceIndex) {
  return {
    id: `${String(sourceIndex + 1).padStart(8, '0')}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    source_id: source,
    created_at: new Date(Date.UTC(2026, 9, 9, 12, 0, -(sourceIndex * 10 + index))).toISOString(),
  };
}

test('Learning is source-diverse while Latest remains strict recent chronology', async () => {
  assert.equal(reelsFeedModeContract('learning').sort, 'learning');
  assert.equal(reelsFeedModeContract('latest').sort, 'recent');
  assert.match(PAGE, /modeContract\.id === 'learning'[\s\S]*modeContract\.sort/);

  const calls = [];
  await loadCanonicalReelsWindow({
    category: 'poker',
    limit: 20,
    fetchPage: async (options) => {
      calls.push(options);
      return { data: [], next_cursor: null };
    },
  });
  assert.equal(calls[0].sort, 'learning');

  await loadCanonicalReelsWindow({
    mode: 'latest',
    category: 'for-you',
    limit: 20,
    fetchPage: async (options) => {
      calls.push(options);
      return { data: [], next_cursor: null };
    },
  });
  assert.equal(calls[1].sort, 'recent');
});

test('Learning interleaves eligible sources without dropping or repeating cohort rows', () => {
  const cohort = Array.from({ length: 25 }, (_, sourceIndex) => (
    Array.from({ length: 4 }, (_, index) => row(`source-${String(sourceIndex).padStart(2, '0')}`, index, sourceIndex))
  )).flat();
  let state = { consumedIds: [], afterSource: '' };
  const seen = [];
  while (seen.length < cohort.length) {
    const page = selectLearningRows(cohort, { ...state, limit: 20 });
    assert.ok(page.rows.length > 0);
    if (seen.length === 0) {
      assert.equal(new Set(page.rows.map((item) => item.source_id)).size, 20);
    }
    seen.push(...page.rows.map((item) => item.id));
    state = { consumedIds: page.consumedIds, afterSource: page.afterSource };
  }
  assert.equal(new Set(seen).size, cohort.length);
  assert.deepEqual(new Set(seen), new Set(cohort.map((item) => item.id)));
});

test('a takedown of an already-returned row cannot shift the Learning continuation', () => {
  const cohort = Array.from({ length: 6 }, (_, sourceIndex) => (
    Array.from({ length: 8 }, (_, index) => row(`source-${sourceIndex}`, index, sourceIndex))
  )).flat();
  const first = selectLearningRows(cohort, { limit: 17 });
  const removedReturnedId = first.rows[4].id;
  const surviving = cohort.filter((item) => item.id !== removedReturnedId);
  const expectedRemaining = new Set(surviving
    .filter((item) => !first.rows.some((returned) => returned.id === item.id))
    .map((item) => item.id));
  const continued = [];
  let state = { consumedIds: first.consumedIds, afterSource: first.afterSource };
  while (continued.length < expectedRemaining.size) {
    const page = selectLearningRows(surviving, { ...state, limit: 13 });
    assert.ok(page.rows.length > 0);
    continued.push(...page.rows.map((item) => item.id));
    state = { consumedIds: page.consumedIds, afterSource: page.afterSource };
  }
  assert.deepEqual(new Set(continued), expectedRemaining);
  assert.equal(new Set(continued).size, continued.length);
});

test('the production certificate exercises the real Poker Learning selector and cursor law', () => {
  assert.match(LIVE, /sort: category === 'poker' \? 'learning' : 'recent'/);
  assert.match(SERVER, /const LEARNING_COHORT_SIZE = 240/);
  assert.match(SERVER, /packLearningCursorIds\(position\.consumed_ids\)/);
  assert.match(SERVER, /created_at\.eq\.\$\{cursor\.anchor_created_at\},id\.lte\.\$\{cursor\.anchor_id\}/);
  assert.match(SERVER, /selectLearningRows\(canonicalRows/);
  assert.match(SERVER, /rawRows\.slice\(0, LEARNING_COHORT_SIZE\)/);
  assert.match(SERVER, /const nextCursor = nextPosition \? encodeLearningCursor\(nextPosition\) : null/);
  assert.doesNotMatch(SERVER, /sort === 'learning'[\s\S]{0,400}MAX_SCAN_ROWS/);
});

test('Learning cursors compactly retain 240 consumed rows and reject foreign versions', () => {
  const start = SERVER.indexOf('function parseCursor');
  const end = SERVER.indexOf('function parseCollectionCursor', start);
  const parseSource = SERVER.slice(start, end);
  assert.ok(parseSource);
  const context = {
    Buffer,
    Date,
    JSON,
    Math,
    Number,
    String,
    MAX_CURSOR_LENGTH: 1024,
    MAX_LEARNING_CURSOR_LENGTH: 8192,
    LEARNING_COHORT_SIZE: 240,
    UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    CURSOR_TIMESTAMP_RE: /^\d{4}-\d{2}-\d{2}T[^\s]{1,40}$/,
    ReelsFeedInputError: class ReelsFeedInputError extends Error {},
  };
  context.globalThis = context;
  vm.runInNewContext(`${parseSource}\nglobalThis.parse = parseCursor;`, context);
  vm.runInNewContext(`${parseSource}\nglobalThis.parse = parseCursor;globalThis.encode = encodeLearningCursor;`, context);
  const consumed = Array.from({ length: 240 }, (_, index) => (
    `${(index + 1).toString(16).padStart(8, '0')}-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`
  ));
  const cursor = context.encode({
    anchor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    anchor_created_at: '2026-10-09T12:00:00.000Z',
    after_source: 'source-boundary',
    consumed_ids: consumed,
  });
  assert.ok(cursor.length < 8192);
  assert.deepEqual([...context.parse(cursor, 'learning').consumed_ids], consumed);
  assert.throws(() => context.parse(cursor, 'recent'));
  const legacyLearning = Buffer.from(JSON.stringify({
    v: 1,
    sort: 'learning',
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    created_at: '2026-10-09T12:00:00.000Z',
  })).toString('base64url');
  assert.throws(() => context.parse(legacyLearning, 'learning'));
  assert.throws(() => context.parse('x'.repeat(8193), 'learning'));
});
