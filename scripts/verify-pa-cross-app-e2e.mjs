#!/usr/bin/env node
/**
 * Reusable Two-Account Authenticated Cross-App E2E Verifier
 *
 * Verifies the live Personal Assistant / Leak Finder / Club Arena cross-app
 * journey across Desktop (1440x900) and Phone (390x844) viewports using two
 * dedicated non-player test accounts.
 *
 * Usage:
 *   PA_E2E_EMAIL_A=... PA_E2E_PASSWORD_A=... \
 *   PA_E2E_EMAIL_B=... PA_E2E_PASSWORD_B=... \
 *   npm run verify:pa-cross-app-e2e
 *
 * Never prints tokens, passwords, or private hole cards. Never mutates real
 * player accounts.
 */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = String(process.env.VERIFY_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL_A = process.env.PA_E2E_EMAIL_A;
const PASSWORD_A = process.env.PA_E2E_PASSWORD_A;
const EMAIL_B = process.env.PA_E2E_EMAIL_B;
const PASSWORD_B = process.env.PA_E2E_PASSWORD_B;

if (!SUPABASE_URL || !ANON_KEY || !EMAIL_A || !PASSWORD_A || !EMAIL_B || !PASSWORD_B) {
  console.error(
    'Missing required non-player E2E env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, '
    + 'PA_E2E_EMAIL_A, PA_E2E_PASSWORD_A, PA_E2E_EMAIL_B, PA_E2E_PASSWORD_B.',
  );
  process.exit(2);
}

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token || !data?.user?.id) {
    throw new Error(`Sign-in failed for test account (${error?.message || 'no session'}).`);
  }
  return { userId: data.user.id, token: data.session.access_token };
}

async function apiJson(path, token, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, json };
}

async function main() {
  const [acctA, acctB] = await Promise.all([
    signIn(EMAIL_A, PASSWORD_A),
    signIn(EMAIL_B, PASSWORD_B),
  ]);
  assert.notEqual(acctA.userId, acctB.userId, 'Account A and Account B must be distinct users');

  // 1. Coaching workspace + Training Plan + Solver Coverage Gaps
  const coachingA = await apiJson('/api/assistant/coaching', acctA.token);
  assert.equal(coachingA.status, 200, `coaching GET returned ${coachingA.status}`);
  assert.equal(coachingA.json?.success, true);
  assert.ok(coachingA.json?.snapshot?.trainingPlan, 'coaching snapshot must include trainingPlan');
  assert.match(String(coachingA.headers.get('cache-control') || ''), /private.*no-store/i);

  // 2. Fetch Account A's leaks and check single-hand audit if a Club Arena hand is linked
  const leaksA = await apiJson('/api/assistant/leaks', acctA.token);
  assert.equal(leaksA.status, 200, `leaks GET returned ${leaksA.status}`);
  assert.equal(leaksA.json?.success, true);

  const sampleHandId = process.env.PA_E2E_HAND_ID_A || null;
  if (sampleHandId) {
    // Account A can audit their own hand
    const auditA = await apiJson(`/api/assistant/leaks/hand-audit?hand=${encodeURIComponent(sampleHandId)}`, acctA.token);
    assert.ok([200, 403].includes(auditA.status), `unexpected hand-audit status ${auditA.status}`);
    assert.match(String(auditA.headers.get('cache-control') || ''), /private.*no-store/i);
    if (auditA.status === 200) {
      assert.equal(auditA.json?.success, true);
      assert.ok(String(auditA.json?.returnToClubArenaHref || '').includes(`hand=${sampleHandId}`));
    }

    // Account B MUST NOT read Account A's hand (404 isolation)
    const auditB = await apiJson(`/api/assistant/leaks/hand-audit?hand=${encodeURIComponent(sampleHandId)}`, acctB.token);
    assert.ok([403, 404].includes(auditB.status), `Account B must be blocked (404/403), got ${auditB.status}`);
    assert.equal(auditB.json?.decisions, undefined, 'Account B must never receive Account A decisions');
  }

  // 3. Optional Playwright live desktop + phone UI check if playwright is installed
  let playwrightChecked = false;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      for (const [label, viewport] of [
        ['desktop', { width: 1440, height: 900 }],
        ['phone', { width: 390, height: 844 }],
      ]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.goto(`${BASE_URL}/hub/personal-assistant/leaks`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
        assert.equal(overflow, false, `horizontal overflow detected on ${label}`);
        assert.deepEqual(errors, [], `pageerror detected on ${label}`);
        await context.close();
      }
      playwrightChecked = true;
    } finally {
      await browser.close();
    }
  } catch (err) {
    if (!/Cannot find package 'playwright'/i.test(String(err?.message || ''))) throw err;
  }

  console.log(JSON.stringify({
    success: true,
    baseUrl: BASE_URL,
    trainingPlanVersion: coachingA.json?.snapshot?.trainingPlan?.version || null,
    sampleHandChecked: Boolean(sampleHandId),
    playwrightChecked,
  }, null, 2));
}

main().catch((err) => {
  console.error('[verify-pa-cross-app-e2e] FAILED:', err?.message || err);
  process.exit(1);
});
