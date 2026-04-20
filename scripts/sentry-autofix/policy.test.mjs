// Tests for the World Hub sentry-autofix policy.
// Run: node --test policy.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDenied, isAllowedForAutoMerge, assessPaths, DENYLIST, ALLOWLIST } from './policy.mjs';

// ══════════════════ DENYLIST ══════════════════

test('middleware.ts is denied', () => {
  assert.equal(isDenied('middleware.ts'), true);
});

test('pages/api/admin is denied', () => {
  assert.equal(isDenied('pages/api/admin/health.js'), true);
});

test('pages/api/debug is denied', () => {
  assert.equal(isDenied('pages/api/debug/anything.js'), true);
});

test('pages/api/emergency is denied', () => {
  assert.equal(isDenied('pages/api/emergency/shutdown.js'), true);
});

test('pages/api/auth is denied', () => {
  assert.equal(isDenied('pages/api/auth/login.js'), true);
});

test('pages/api/webhooks is denied', () => {
  assert.equal(isDenied('pages/api/webhooks/stripe.js'), true);
});

test('money substrings are denied (ledger, wallet, rake, purchase, diamonds, payouts, kyc, mfa, step-up)', () => {
  for (const p of [
    'pages/api/ledger/post.js',
    'pages/api/wallet/balance.js',
    'pages/api/rake/collect.js',
    'pages/api/purchase/confirm.js',
    'pages/api/diamonds/mint.js',
    'pages/api/payouts/process.js',
    'pages/api/kyc/verify.js',
    'pages/api/mfa/enroll.js',
    'pages/api/step-up/challenge.js',
  ]) {
    assert.equal(isDenied(p), true, `expected ${p} denied`);
  }
});

test('7 destructive poker routes denied', () => {
  for (const p of [
    'pages/api/poker/game/create.js',
    'pages/api/poker/game/delete.js',
    'pages/api/poker/game/reset.js',
    'pages/api/poker/tournament/create.js',
    'pages/api/poker/tournament/delete.js',
    'pages/api/poker/table/open.js',
    'pages/api/poker/buyin.js',
  ]) {
    assert.equal(isDenied(p), true, `expected ${p} denied`);
  }
});

test('cron handlers denied (autofix-loop risk)', () => {
  assert.equal(isDenied('pages/api/cron/reconcile-ledger.js'), true);
  assert.equal(isDenied('pages/api/cron/content-health-check.js'), true);
});

test('supabase migrations denied', () => {
  assert.equal(isDenied('supabase/migrations/20260420_new.sql'), true);
});

test('dep manifests + env denied', () => {
  assert.equal(isDenied('package.json'), true);
  assert.equal(isDenied('package-lock.json'), true);
  assert.equal(isDenied('.env'), true);
  assert.equal(isDenied('.env.local'), true);
  assert.equal(isDenied('.env.production'), true);
});

test('infra configs denied', () => {
  assert.equal(isDenied('vercel.json'), true);
  assert.equal(isDenied('next.config.js'), true);
  assert.equal(isDenied('.github/workflows/sentry-autofix.yml'), true);
  assert.equal(isDenied('.husky/pre-commit'), true);
});

test('autofix self-modification denied', () => {
  assert.equal(isDenied('scripts/sentry-autofix/run.mjs'), true);
  assert.equal(isDenied('services/sentry-autofix/src/server.mjs'), true);
});

test('service-role helpers denied', () => {
  assert.equal(isDenied('lib/supabaseAdmin.js'), true);
  assert.equal(isDenied('lib/serviceRole.js'), true);
  assert.equal(isDenied('lib/stripe.js'), true);
});

test('commander admin + td are denied', () => {
  assert.equal(isDenied('pages/commander/admin/settings.js'), true);
  assert.equal(isDenied('pages/commander/td/payouts.js'), true);
});

// ══════════════════ ALLOWLIST ══════════════════

test('hub pages are allowed for auto-merge', () => {
  assert.equal(isAllowedForAutoMerge('pages/hub/profile.js'), true);
  assert.equal(isAllowedForAutoMerge('pages/landing/index.js'), true);
  assert.equal(isAllowedForAutoMerge('pages/blog/post.js'), true);
});

test('safe commander pages allow auto-merge (docs/reports/displays only)', () => {
  assert.equal(isAllowedForAutoMerge('pages/commander/docs/schedule.js'), true);
  assert.equal(isAllowedForAutoMerge('pages/commander/reports/daily.js'), true);
  assert.equal(isAllowedForAutoMerge('pages/commander/displays/lobby.js'), true);
  // NOT allowed: commander/admin/* already in DENYLIST so ok
});

test('components + styles + assets allow auto-merge', () => {
  assert.equal(isAllowedForAutoMerge('components/Button.js'), true);
  assert.equal(isAllowedForAutoMerge('styles/globals.css'), true);
  assert.equal(isAllowedForAutoMerge('public/images/hero.png'), true);
  assert.equal(isAllowedForAutoMerge('src/components/Nav.jsx'), true);
  assert.equal(isAllowedForAutoMerge('src/lib/format.js'), true);
});

// ══════════════════ assessPaths ══════════════════

test('assessPaths: all clean hub paths → ok + allowMerge', () => {
  const r = assessPaths(['pages/hub/profile.js', 'components/Nav.jsx']);
  assert.equal(r.ok, true);
  assert.equal(r.denied.length, 0);
  assert.equal(r.allowMerge, true);
});

test('assessPaths: one denied blocks everything', () => {
  const r = assessPaths(['pages/hub/profile.js', 'pages/api/admin/x.js']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.denied, ['pages/api/admin/x.js']);
  assert.equal(r.allowMerge, false);
});

test('assessPaths: clean but not allowlisted → ok but allowMerge=false', () => {
  const r = assessPaths(['pages/hub/profile.js', 'pages/weirdnewsection/foo.js']);
  assert.equal(r.ok, true);
  assert.equal(r.allowMerge, false);
});

test('assessPaths: empty paths array → allowMerge=false', () => {
  const r = assessPaths([]);
  assert.equal(r.ok, true);
  assert.equal(r.allowMerge, false);
});

test('nested ledger match even inside unrelated nested path', () => {
  assert.equal(isDenied('lib/poker/ledger/reconcile.js'), true);
  assert.equal(isDenied('components/deep/wallet/card.jsx'), true);
});

// ══════════════════ Integrity ══════════════════

test('DENYLIST and ALLOWLIST are both non-empty arrays', () => {
  assert.ok(Array.isArray(DENYLIST) && DENYLIST.length > 0);
  assert.ok(Array.isArray(ALLOWLIST) && ALLOWLIST.length > 0);
});
