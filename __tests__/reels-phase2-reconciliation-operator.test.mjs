import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script = fs.readFileSync('scripts/reconcile-social-reels.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/e2e-tests.yml', 'utf8');

test('historical reconciliation is read only by default and apply is census-bound', () => {
  assert.match(script, /const apply = args\.includes\('--apply'\) \|\| process\.env\.REELS_RECONCILIATION_MODE === 'apply'/);
  assert.match(script, /--apply requires the fingerprint and pending count from an immediately preceding read-only census/);
  assert.match(script, /state\.fingerprint !== expectedFingerprint/);
  assert.match(script, /state\.pending\.length !== Number\(expectedPending\)/);
  assert.match(script, /Post-apply census retained unrepresented duplicate groups/);
  assert.match(script, /phase2-reconciliation:/);
});

test('the operator records sanitized coverage without exposing row identities', () => {
  assert.match(script, /rawDuplicateGroups/);
  assert.match(script, /representedDuplicateGroups/);
  assert.match(script, /pendingDuplicateGroups/);
  assert.match(script, /quarantineReasons/);
  assert.match(script, /pendingFingerprint/);
  const sanitizedBody = script.slice(script.indexOf('function sanitized'), script.indexOf('let state ='));
  assert.doesNotMatch(sanitizedBody, /canonicalAssetKey|alias_reel_id|canonical_reel_id|operation_id/);
  assert.doesNotMatch(script, /dotenv|\.env\.local|\.env\.prod/);
  assert.match(script, /unresolvedQuarantineGroups/);
  assert.match(script, /groupIdentity/);
});

test('hosted audit and apply use secret environment values and fixed commands', () => {
  assert.match(workflow, /reels-reconciliation-audit/);
  assert.match(workflow, /reels-reconciliation-apply/);
  assert.match(workflow, /REELS_RECONCILIATION_EXPECTED_FINGERPRINT: \$\{\{ inputs\.reels_reconciliation_fingerprint \}\}/);
  assert.match(workflow, /REELS_RECONCILIATION_EXPECTED_PENDING: \$\{\{ inputs\.reels_reconciliation_pending \}\}/);
  assert.equal((workflow.match(/run: node scripts\/reconcile-social-reels\.mjs/g) || []).length, 2);
  assert.doesNotMatch(workflow, /run:.*reels_reconciliation_(?:fingerprint|pending)/);
});
