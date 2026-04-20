import test from 'node:test';
import assert from 'node:assert/strict';
import { isDenied, isAllowedForAutoMerge, assessPaths } from './policy.mjs';

test('denies middleware.ts', () => {
  assert.equal(isDenied('middleware.ts'), true);
});

test('denies admin/debug/emergency API', () => {
  assert.equal(isDenied('pages/api/admin/users/create.js'), true);
  assert.equal(isDenied('pages/api/debug/dump.js'), true);
  assert.equal(isDenied('pages/api/emergency/stop.js'), true);
});

test('denies auth/webhooks/cron API', () => {
  assert.equal(isDenied('pages/api/auth/login.js'), true);
  assert.equal(isDenied('pages/api/webhooks/stripe.js'), true);
  assert.equal(isDenied('pages/api/cron/rake-sweep.js'), true);
});

test('denies money paths by substring', () => {
  assert.equal(isDenied('pages/api/wallet/debit.js'), true);
  assert.equal(isDenied('pages/api/ledger/post.js'), true);
  assert.equal(isDenied('pages/api/purchase/diamond-pack.js'), true);
  assert.equal(isDenied('pages/api/payouts/initiate.js'), true);
  assert.equal(isDenied('pages/api/kyc/verify.js'), true);
  assert.equal(isDenied('pages/api/mfa/challenge.js'), true);
  assert.equal(isDenied('pages/api/auth/step-up/verify.js'), true);
});

test('denies the 7 destructive poker routes', () => {
  assert.equal(isDenied('pages/api/poker/game/create.js'), true);
  assert.equal(isDenied('pages/api/poker/game/delete.js'), true);
  assert.equal(isDenied('pages/api/poker/game/reset.js'), true);
  assert.equal(isDenied('pages/api/poker/tournament/create.js'), true);
  assert.equal(isDenied('pages/api/poker/tournament/delete.js'), true);
  assert.equal(isDenied('pages/api/poker/table/deal.js'), true);
  assert.equal(isDenied('pages/api/poker/buyin.js'), true);
});

test('denies supabase migrations + manifests + env', () => {
  assert.equal(isDenied('supabase/migrations/20260420_foo.sql'), true);
  assert.equal(isDenied('package.json'), true);
  assert.equal(isDenied('package-lock.json'), true);
  assert.equal(isDenied('.env'), true);
  assert.equal(isDenied('.env.local'), true);
});

test('denies infra configs and workflows', () => {
  assert.equal(isDenied('vercel.json'), true);
  assert.equal(isDenied('next.config.mjs'), true);
  assert.equal(isDenied('.github/workflows/build-safety-gate.yml'), true);
});

test('denies autofix self-modification', () => {
  assert.equal(isDenied('scripts/sentry-autofix/run.mjs'), true);
  assert.equal(isDenied('services/sentry-autofix/src/server.mjs'), true);
});

test('allows hub pages + components for auto-merge', () => {
  assert.equal(isAllowedForAutoMerge('pages/hub/poker-near-me.js'), true);
  assert.equal(isAllowedForAutoMerge('components/Navbar.jsx'), true);
  assert.equal(isAllowedForAutoMerge('styles/main.css'), true);
  assert.equal(isAllowedForAutoMerge('docs/runbook.md'), true);
});

test('allows safe commander pages only', () => {
  assert.equal(isAllowedForAutoMerge('pages/commander/docs/readme.js'), true);
  assert.equal(isAllowedForAutoMerge('pages/commander/reports/daily.js'), true);
  // Dealer/tournaments/admin commander pages are NOT auto-merge-safe:
  assert.equal(isAllowedForAutoMerge('pages/commander/dealer/seat.js'), false);
  assert.equal(isAllowedForAutoMerge('pages/commander/tournaments/start.js'), false);
});

test('assessPaths returns denied + allowMerge correctly', () => {
  // Happy path: all allowlisted
  const ok = assessPaths(['pages/hub/index.js', 'components/Card.jsx']);
  assert.equal(ok.ok, true);
  assert.equal(ok.allowMerge, true);
  assert.deepEqual(ok.denied, []);

  // Deny wins: one denylist hit blocks the whole PR
  const denied = assessPaths(['pages/hub/index.js', 'middleware.ts']);
  assert.equal(denied.ok, false);
  assert.equal(denied.allowMerge, false);
  assert.deepEqual(denied.denied, ['middleware.ts']);

  // Mixed safe but not all allowlisted → cannot auto-merge
  const mixed = assessPaths(['pages/hub/index.js', 'some/random/file.js']);
  assert.equal(mixed.ok, true);
  assert.equal(mixed.allowMerge, false);

  // Empty paths → not eligible for auto-merge
  const empty = assessPaths([]);
  assert.equal(empty.ok, true);
  assert.equal(empty.allowMerge, false);
});

test('ledger path substring match catches nested', () => {
  assert.equal(isDenied('src/lib/ledger/post.ts'), true);
  assert.equal(isDenied('server/src/wallet/debit.ts'), true);
});
