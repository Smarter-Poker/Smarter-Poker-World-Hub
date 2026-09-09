import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const verifier = readFileSync(
  join(ROOT, 'scripts/verify-training-cross-rpc-concurrency-postgres.mjs'),
  'utf8',
);

test('the disposable verifier applies both real Phase 6 migrations in safe order', () => {
  const award = verifier.indexOf('20260907005900_award_diamonds_v2_serialized_family_caps.sql');
  const authority = verifier.indexOf('20260907010000_training_server_authoritative_completion.sql');
  const applyAward = verifier.indexOf("'-f', AWARD_MIGRATION");
  const applyAuthority = verifier.indexOf("'-f', AUTHORITY_MIGRATION");

  assert.ok(award >= 0 && authority > award);
  assert.ok(applyAward >= 0 && applyAuthority > applyAward);
  assert.match(verifier, /extractRawTemplate[\s\S]*BASELINE_SQL/);
  assert.match(verifier, /mkdtempSync[\s\S]*pg_ctl/);
});

test('claim and completion are forced through a deterministic cross-RPC lock schedule', () => {
  assert.match(verifier, /phase6_cross_claim_gate/);
  assert.match(verifier, /pg_advisory_xact_lock\(\$\{TEST_GATE_NAMESPACE\}, \$\{TEST_GATE_KEY\}\)/);
  assert.match(verifier, /phase6-cross-claim/);
  assert.match(verifier, /phase6-cross-completion/);
  assert.match(verifier, /wait_event_type = 'Lock'/);
  assert.match(verifier, /Promise\.all\(\[claimPromise, completionPromise\]\)/);
  assert.match(verifier, /crossRpcNoDeadlock/);
});

test('real-award evidence covers snapshotted multipliers and multi-window payout', () => {
  assert.match(verifier, /diamond_multiplier\) VALUES[\s\S]*1\.00[\s\S]*2\.00[\s\S]*10\.00/);
  assert.match(verifier, /2x below-cap entitlement or replay failed/);
  assert.match(verifier, /10x below-cap entitlement or replay failed/);
  assert.match(verifier, /FOR part IN 1\.\.4 LOOP/);
  assert.match(verifier, /2x multi-window entitlement replay failed/);
  assert.match(verifier, /multiWindowTotal/);
  assert.match(verifier, /2x first-window deferral lost entitlement truth/);
  assert.match(verifier, /deferredTwoXTotal/);
  assert.match(verifier, /Historical 2x-to-1x replay was inconsistent/);
  assert.match(verifier, /Verified rank contract fabricated or omitted rank state/);
});

test('reward failures stay retryable while explicit caps and verified duplicates settle', () => {
  assert.match(verifier, /phase6-missing-catalog/);
  assert.match(verifier, /phase6-missing-profile/);
  assert.match(verifier, /phase6-malformed-award/);
  assert.match(verifier, /TRAINING_REWARD_RESPONSE_INVALID/);
  assert.match(verifier, /phase6-cap-settled/);
  assert.match(verifier, /phase6-duplicate/);
  assert.match(verifier, /rewardVerdict\?\.reconciled/);
  assert.match(verifier, /leaderboardRpcBlocked/);
  assert.match(verifier, /cacheAnswerKeysBlocked/);
  assert.match(verifier, /Legacy Daily recovery awarded twice/);
  assert.match(verifier, /Account erasure left attempt, hand, or sealed answer rows behind/);
});
