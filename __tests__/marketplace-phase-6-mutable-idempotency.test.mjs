import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  beginIdempotent,
  RELEASE_SENTINEL_STATUS,
} = require('../src/lib/club-arena/durableIdempotency.js');

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const idempotencyMigration = read('supabase/migrations/20260819_club_shop_function_bodies.sql');

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function rpcRecorder(beginResult) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'fn_idempotency_begin') return { data: beginResult, error: null };
      if (name === 'fn_idempotency_finish') return { data: null, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
}

test('a claimed mutable 400 releases its response-cache claim through the sentinel status', async () => {
  const supabase = rpcRecorder({ claimed: true });
  const req = { headers: { 'x-idempotency-key': 'mutable-request-1' } };
  const res = responseRecorder();
  const body = { success: false, reason: 'sold_out' };

  const claim = await beginIdempotent(supabase, req, res, 'marketplace:test', {
    cacheFailures: false,
  });
  assert.equal(claim.proceed, true);
  await res.status(400).json(body);

  assert.equal(res.statusCode, 400, 'the release sentinel must never replace the real HTTP status');
  assert.deepEqual(res.body, body, 'the release sentinel must never replace the real response body');
  assert.deepEqual(supabase.calls[1], {
    name: 'fn_idempotency_finish',
    args: {
      p_key: supabase.calls[0].args.p_key,
      p_status: RELEASE_SENTINEL_STATUS,
      p_body: body,
    },
  });
  assert.ok(RELEASE_SENTINEL_STATUS >= 500, 'the database release branch requires a 5xx sentinel');
  assert.match(
    idempotencyMigration,
    /IF p_status >= 500 THEN[\s\S]*?DELETE FROM api_idempotency WHERE key = p_key/,
    'the sentinel must reach the deployed database branch that deletes the claim'
  );
});

test('successful claimed responses are cached and completed responses replay unchanged', async () => {
  const body = { success: true, purchaseId: 'purchase-1' };
  const claimedStore = rpcRecorder({ claimed: true });
  const claimedRes = responseRecorder();
  const req = { headers: { 'x-idempotency-key': 'successful-request-1' } };

  const claim = await beginIdempotent(claimedStore, req, claimedRes, 'marketplace:test', {
    cacheFailures: false,
  });
  assert.equal(claim.proceed, true);
  await claimedRes.status(200).json(body);
  assert.equal(claimedStore.calls[1].args.p_status, 200);
  assert.deepEqual(claimedStore.calls[1].args.p_body, body);

  const replayStore = rpcRecorder({ claimed: false, state: 'done', status: 200, body });
  const replayRes = responseRecorder();
  const replay = await beginIdempotent(replayStore, req, replayRes, 'marketplace:test', {
    cacheFailures: false,
  });
  assert.equal(replay.proceed, false);
  assert.equal(replayRes.statusCode, 200);
  assert.deepEqual(replayRes.body, body);
  assert.equal(replayStore.calls.length, 1, 'a replay must not finish or mutate the stored response');
});

test('failure caching remains the default and Marketplace alone opts into mutable failure release', async () => {
  const defaultStore = rpcRecorder({ claimed: true });
  const defaultRes = responseRecorder();
  const body = { success: false, error: 'Permanent For This Route' };
  await beginIdempotent(
    defaultStore,
    { headers: { 'x-idempotency-key': 'default-request-1' } },
    defaultRes,
    'unchanged-default:test'
  );
  await defaultRes.status(400).json(body);
  assert.equal(defaultStore.calls[1].args.p_status, 400, 'existing routes must keep caching 4xx responses');

  const endpoint = read('pages/api/club-arena/marketplace-purchase.js');
  assert.match(endpoint, /beginIdempotent\([\s\S]*?marketplace-purchase:[\s\S]*?shouldCacheResponse:/);
  assert.match(endpoint, /status\s*>=\s*200\s*&&\s*status\s*<\s*300/);
  assert.match(endpoint, /responseBody\?\.success\s*===\s*true/);
  assert.match(endpoint, /p_charge_reference:\s*chargeReference/);
});
