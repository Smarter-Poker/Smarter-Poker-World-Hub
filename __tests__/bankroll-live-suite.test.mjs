// bankroll-live: the read-only production suite for the Bankroll Manager.
// Pins the request classifier (no write may leave the browser), the workflow
// wiring (service account, deployed SHA, no credential artifact) and the
// default config's exclusion of the live spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyRequest, describeRequest, normaliseSha } from '../e2e/fixtures/bankrollLiveGuard.mjs';

const SUPABASE = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const APP = 'https://smarter.poker';

test('reads pass, ledger and API writes are data-writes', () => {
  assert.equal(classifyRequest('GET', `${SUPABASE}/rest/v1/bankroll_ledger?select=*`), 'read');
  assert.equal(classifyRequest('HEAD', `${SUPABASE}/rest/v1/bankroll_ledger`), 'read');
  assert.equal(classifyRequest('GET', `${APP}/api/bankroll/summary`), 'read');
  for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal(classifyRequest(verb, `${SUPABASE}/rest/v1/bankroll_ledger`), 'data-write', verb);
    assert.equal(classifyRequest(verb, `${APP}/api/bankroll/entries`), 'data-write', verb);
  }
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/rpc/fn_anything`), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/rpc/fn_platform_frozen`), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/rpc/fn_lightning_my_sessions`), 'read');
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/rpc/fn_bankroll_totals`), 'read', 'the STABLE dashboard totals read');
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/rpc/fn_profile_settings_set_key`), 'data-write');
  assert.equal(classifyRequest('PATCH', `${SUPABASE}/rest/v1/rpc/fn_lightning_my_sessions`), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/storage/v1/object/receipts/x.jpg`), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/functions/v1/anything`), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/auth/v1/logout`), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/auth/v1/token?grant_type=password`), 'data-write');
});

test('only the session refresh and reviewed read-only POSTs continue', () => {
  assert.equal(classifyRequest('POST', `${SUPABASE}/auth/v1/token?grant_type=refresh_token`), 'session');
  assert.equal(classifyRequest('POST', `${APP}/api/jarvis/bankroll-analysis`), 'read');
  assert.equal(classifyRequest('POST', `https://evil.example/api/jarvis/bankroll-analysis`), 'telemetry');
  assert.equal(classifyRequest('POST', `${APP}/_vercel/insights/view`), 'telemetry');
  assert.equal(classifyRequest('POST', 'https://us.i.posthog.com/e/'), 'telemetry');
});

test('receipts carry method and path only, and SHAs are exact', () => {
  assert.equal(describeRequest('post', `${SUPABASE}/rest/v1/t?apikey=secret&x=1`), 'POST kuklfnapbkmacvwxktbh.supabase.co/rest/v1/t');
  assert.equal(normaliseSha('A'.repeat(40)), 'a'.repeat(40));
  assert.equal(normaliseSha('abc123'), null);
  assert.equal(normaliseSha(''), null);
});

test('the workflow runs bankroll-live signed in as the service account and pinned to the deployment', () => {
  const wf = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
  assert.match(wf, /options: \[[^\]]*\bbankroll-live\b[^\]]*\]/);
  const job = wf.match(/^  bankroll-live:\n[\s\S]*?(?=^  [a-zA-Z0-9_-]+:\n|(?![\s\S]))/m)?.[0] || '';
  assert.ok(job, 'bankroll-live job missing');
  assert.match(job, /if: \$\{\{ inputs\.suite == 'bankroll-live' \}\}/);
  assert.match(job, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL \|\| secrets\.TEST_USER_EMAIL \}\}/);
  assert.match(job, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
  assert.match(job, /BANKROLL_LIVE_EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/);
  assert.match(job, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(job, /npx playwright test --config=playwright\.bankroll-live\.config\.ts/);
  assert.match(job, /path: test-results\/bankroll-live\//);
  assert.doesNotMatch(job, /playwright\/\.auth|SERVICE_ROLE/);
});

test('the live spec runs only through its own production config', () => {
  const base = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
  assert.equal((base.match(/\/bankroll-live\\\.spec\\\.ts\$\//g) || []).length, 2);
  const live = readFileSync(new URL('../playwright.bankroll-live.config.ts', import.meta.url), 'utf8');
  assert.match(live, /baseURL: 'https:\/\/smarter\.poker'/);
  assert.match(live, /retries: 0/);
  assert.match(live, /width: 375/);
  const spec = readFileSync(new URL('../e2e/bankroll-live.spec.ts', import.meta.url), 'utf8');
  assert.match(spec, /route\.abort\('blockedbyclient'\)/);
  assert.match(spec, /expect\(guard\.writes/);
  assert.doesNotMatch(spec, /TEST_USER_PASSWORD|console\.log/);
});

test('shell side effects and create-only provisioning are blocked but classified apart', () => {
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/rpc/fn_update_presence`), 'shell');
  assert.equal(classifyRequest('POST', `${APP}/api/auth/ensure-profile`), 'shell');
  assert.equal(classifyRequest('POST', `${APP}/api/rewards/eggs/evaluate`), 'shell');
  assert.equal(classifyRequest('POST', `${APP}/api/messenger/get-conversations`), 'read');
  const createOnly = { prefer: 'resolution=ignore-duplicates,return=minimal' };
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/bankroll_segments?on_conflict=user_id%2Csegment_type`, createOnly), 'provision');
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/bankroll_rules?on_conflict=user_id%2Crule_type`, createOnly), 'provision');
  // A merge upsert, a plain insert, or any other table is still a failing write.
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/bankroll_segments?on_conflict=user_id%2Csegment_type`, { prefer: 'resolution=merge-duplicates' }), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/bankroll_segments`, createOnly), 'data-write');
  assert.equal(classifyRequest('POST', `${SUPABASE}/rest/v1/bankroll_ledger?on_conflict=id`, createOnly), 'data-write');
  assert.equal(classifyRequest('PATCH', `${SUPABASE}/rest/v1/bankroll_segments?user_id=eq.x`), 'data-write');
});
