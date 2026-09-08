import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const ROOT = process.cwd();
const SOURCE = readFileSync(join(ROOT, 'pages/api/training/streak.js'), 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';

function response() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadHandler(rpcResult) {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return {
        async abortSignal() {
          return { data: rpcResult, error: null };
        },
      };
    },
  };
  const dependencies = {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/utils/trainingApiUtils': { withTiming: () => {} },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: USER_ID }, error: null }),
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async (factory) => factory().abortSignal(new AbortController().signal),
      trainingPersistenceUnavailableBody: () => ({
        success: false,
        code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
      }),
    },
  };
  const module = new SourceTextModule(SOURCE, { identifier: 'training-streak.js' });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected Training streak dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return { handler: module.namespace.default, calls };
}

async function claim(milestoneDays, rpcResult) {
  const { handler, calls } = await loadHandler(rpcResult);
  const res = response();
  await handler({
    method: 'PUT',
    headers: { authorization: 'Bearer test' },
    body: { milestoneDays },
  }, res);
  return { res, calls };
}

test('a 2x partial milestone exposes the server-snapshotted entitlement without accepting a client multiplier', async () => {
  const { res, calls } = await claim(60, {
    success: true,
    newClaim: false,
    awardApplied: true,
    milestoneCompleted: false,
    milestoneDays: 60,
    diamondsAwarded: 1000,
    diamondsAwardedTotal: 1000,
    diamondsRemaining: 600,
    entitlementDiamonds: 1600,
    rewardMultiplier: 2,
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [{
    name: 'fn_claim_training_streak_milestone_v2',
    args: { p_user_id: USER_ID, p_milestone_days: 60 },
  }]);
  assert.equal(res.body.milestoneCompleted, false);
  assert.equal(res.body.entitlementDiamonds, 1600);
  assert.equal(res.body.rewardMultiplier, 2);
  assert.equal(res.body.diamondsAwardedTotal + res.body.diamondsRemaining, 1600);
});

test('a completed 2x replay returns the same credited total without another award', async () => {
  const { res } = await claim(3, {
    success: true,
    newClaim: false,
    awardApplied: false,
    milestoneCompleted: true,
    milestoneDays: 3,
    diamondsAwarded: 0,
    diamondsAwardedTotal: 50,
    diamondsRemaining: 0,
    entitlementDiamonds: 50,
    rewardMultiplier: 2,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.diamondsAwardedTotal, 50);
  assert.equal(res.body.entitlementDiamonds, 50);
  assert.equal(res.body.idempotentReplay, true);
});

test('historical credit above the current price replays with its effective multiplier', async () => {
  const { res } = await claim(100, {
    success: true,
    newClaim: false,
    awardApplied: false,
    milestoneCompleted: true,
    milestoneDays: 100,
    diamondsAwarded: 0,
    diamondsAwardedTotal: 4000,
    diamondsRemaining: 0,
    entitlementDiamonds: 4000,
    rewardMultiplier: 2,
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.diamondsAwardedTotal, 4000);
  assert.equal(res.body.entitlementDiamonds, 4000);
  assert.equal(res.body.rewardMultiplier, 2);
  assert.equal(res.body.idempotentReplay, true);
});

test('a zero-credit first-window cap deferral remains explicit and retryable', async () => {
  const { res } = await claim(60, {
    success: false,
    status: 409,
    code: 'TRAINING_STREAK_AWARD_NOT_APPLIED',
    error: 'The streak reward could not be applied yet.',
    rewardVerdict: {
      reason: 'action_limit',
      awarded: 0,
      entitlement: 1600,
      multiplier: 2,
    },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.retryable, true);
  assert.equal(res.body.retryWindow, 'next_month');
  assert.equal(res.body.rewardVerdict.entitlement, 1600);
  assert.equal(res.body.rewardVerdict.multiplier, 2);
});

test('the API rejects inconsistent totals or a fabricated multiplier response', async () => {
  const { res } = await claim(60, {
    success: true,
    newClaim: false,
    awardApplied: true,
    milestoneCompleted: false,
    milestoneDays: 60,
    diamondsAwarded: 1000,
    diamondsAwardedTotal: 1000,
    diamondsRemaining: 1000,
    entitlementDiamonds: 2000,
    rewardMultiplier: 2,
  });

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'TRAINING_STREAK_CLAIM_INVALID_RESPONSE');
});

test('the streak API preserves a database integrity failure as a retryable 502', async () => {
  const { res } = await claim(3, {
    success: false,
    status: 502,
    code: 'TRAINING_STREAK_AWARD_INVALID_RESPONSE',
    error: 'The streak reward response was invalid.',
  });

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, 'TRAINING_STREAK_AWARD_INVALID_RESPONSE');
  assert.equal(res.body.retryable, true);
});

test('the streak boundary derives entitlement validation from server output only', () => {
  assert.match(SOURCE, /bodyKeys\.length !== 1/);
  assert.match(SOURCE, /bodyKeys\[0\] !== 'milestoneDays'/);
  assert.match(SOURCE, /entitlementDiamonds !== Math\.round\(milestone\.diamonds \* rewardMultiplier\)/);
  assert.match(SOURCE, /diamondsAwardedTotal \+ diamondsRemaining !== entitlementDiamonds/);
});
