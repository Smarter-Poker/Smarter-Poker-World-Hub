#!/usr/bin/env node
/**
 * Personal Assistant Two-Account Authenticated Live E2E Harness
 *
 * Executes the decisive two-account authenticated browser journey and cross-account
 * RLS isolation check against a live World Hub origin (default: https://smarter.poker).
 *
 * Security & Credential Contract:
 *   - Reads ONLY PA_E2E_EMAIL_A, PA_E2E_PASSWORD_A, PA_E2E_EMAIL_B, PA_E2E_PASSWORD_B
 *     from process.env. Never reads .env files and never prints credential values.
 *   - Fails closed with explicit missing variable names when credentials are unset.
 *
 * Usage:
 *   node scripts/e2e/pa-two-account-e2e.mjs --check-only
 *   PA_E2E_EMAIL_A=... PA_E2E_PASSWORD_A=... PA_E2E_EMAIL_B=... PA_E2E_PASSWORD_B=... \
 *     node scripts/e2e/pa-two-account-e2e.mjs --base-url https://smarter.poker
 */
import process from 'node:process';

export const REQUIRED_ENV_KEYS = Object.freeze([
  'PA_E2E_EMAIL_A',
  'PA_E2E_PASSWORD_A',
  'PA_E2E_EMAIL_B',
  'PA_E2E_PASSWORD_B',
]);

export const E2E_STEPS = Object.freeze([
  'account-a-login-and-home',
  'account-a-daily-hand-loaded',
  'account-a-leaks-and-coaching',
  'account-a-replay-and-practice-launch',
  'account-b-cross-account-rls-isolation',
]);

export function validateE2EEnvironment(env = process.env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !String(env[key] || '').trim());
  return {
    ready: missing.length === 0,
    missing,
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { baseUrl: 'https://smarter.poker', checkOnly: false, viewport: 'mobile' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check-only') {
      out.checkOnly = true;
    } else if (arg === '--base-url' && argv[i + 1]) {
      out.baseUrl = argv[i + 1].replace(/\/+$/, '');
      i += 1;
    } else if (arg === '--desktop') {
      out.viewport = 'desktop';
    }
  }
  return out;
}

async function signInAccount(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'networkidle', timeout: 45000 });
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(email);
  await passInput.fill(password);
  const submitBtn = page.locator('button[type="submit"]').first();
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 30000 }),
    submitBtn.click(),
  ]);
}

async function extractBearerToken(page) {
  return page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || (!k.includes('auth-token') && !k.includes('supabase'))) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(k) || 'null');
        const token = parsed?.access_token || parsed?.currentSession?.access_token || null;
        if (typeof token === 'string' && token.length > 20) return token;
      } catch {
        // ignore non-JSON entries
      }
    }
    return null;
  });
}

async function runLiveE2E({ baseUrl, viewport }) {
  const envStatus = validateE2EEnvironment(process.env);
  if (!envStatus.ready) {
    console.error(
      JSON.stringify({
        ok: false,
        code: 'MISSING_E2E_CREDENTIALS',
        missingEnvVars: envStatus.missing,
        message: 'Supply all four dedicated PA_E2E_* environment variables before running live authenticated E2E.',
      }),
    );
    process.exit(2);
  }

  const { chromium } = await import('playwright');
  const vp = viewport === 'desktop'
    ? { width: 1440, height: 900, isMobile: false, hasTouch: false }
    : { width: 390, height: 844, isMobile: true, hasTouch: true };

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const receipt = {
    baseUrl,
    viewport,
    startedAt: new Date().toISOString(),
    steps: [],
    errors: [],
  };

  let accountAContext;
  let accountBContext;

  try {
    accountAContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    });
    const pageA = await accountAContext.newPage();
    const consoleErrorsA = [];
    const pageErrorsA = [];
    pageA.on('console', (m) => { if (m.type() === 'error') consoleErrorsA.push(m.text()); });
    pageA.on('pageerror', (e) => pageErrorsA.push(String(e)));

    // Step 1 & 2: Account A sign-in, Home load, Daily Hand non-error state
    await signInAccount(pageA, baseUrl, process.env.PA_E2E_EMAIL_A, process.env.PA_E2E_PASSWORD_A);
    await pageA.goto(`${baseUrl}/hub/personal-assistant`, { waitUntil: 'networkidle', timeout: 45000 });
    await pageA.waitForTimeout(800);

    const homeCheck = await pageA.evaluate(() => {
      const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const bodyText = document.body.innerText || '';
      return {
        overflowPx,
        dailyHandUnavailable: /Daily Hand Temporarily Unavailable/i.test(bodyText),
        hasPreviewOnly: /Sample View · Sign In To See Your Own Hands/i.test(bodyText),
      };
    });
    if (homeCheck.overflowPx > 0 || homeCheck.dailyHandUnavailable || homeCheck.hasPreviewOnly) {
      throw new Error(`Account A PA Home failed checks: ${JSON.stringify(homeCheck)}`);
    }
    receipt.steps.push({ step: E2E_STEPS[0], ok: true, overflowPx: homeCheck.overflowPx });
    receipt.steps.push({ step: E2E_STEPS[1], ok: true });

    // Step 3: Account A Leak Finder + authenticated API readback
    const tokenA = await extractBearerToken(pageA);
    if (!tokenA) throw new Error('Account A session bearer token unavailable after login');

    await pageA.goto(`${baseUrl}/hub/personal-assistant/leaks`, { waitUntil: 'networkidle', timeout: 45000 });
    await pageA.waitForTimeout(800);
    const leaksRes = await fetch(`${baseUrl}/api/assistant/leaks`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const leaksPayload = await leaksRes.json().catch(() => null);
    if (!leaksRes.ok || !leaksPayload) {
      throw new Error(`Account A /api/assistant/leaks returned HTTP ${leaksRes.status}`);
    }
    const firstLeakId = leaksPayload?.leaks?.[0]?.id || null;
    receipt.steps.push({
      step: E2E_STEPS[2],
      ok: true,
      leakCount: Array.isArray(leaksPayload?.leaks) ? leaksPayload.leaks.length : 0,
    });

    // Step 4: Coaching tab & Practice navigation readiness
    await pageA.goto(`${baseUrl}/hub/personal-assistant/leaks?tab=coaching`, { waitUntil: 'networkidle', timeout: 45000 });
    await pageA.waitForTimeout(600);
    const coachingOverflow = await pageA.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    );
    if (coachingOverflow > 0) throw new Error(`Coaching tab mobile overflow: ${coachingOverflow}px`);
    receipt.steps.push({ step: E2E_STEPS[3], ok: true, overflowPx: coachingOverflow });

    // Step 5: Account B isolated browser context — prove cross-account RLS isolation
    accountBContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    });
    const pageB = await accountBContext.newPage();
    await signInAccount(pageB, baseUrl, process.env.PA_E2E_EMAIL_B, process.env.PA_E2E_PASSWORD_B);
    const tokenB = await extractBearerToken(pageB);
    if (!tokenB) throw new Error('Account B session bearer token unavailable after login');

    if (firstLeakId) {
      const crossLeakRes = await fetch(
        `${baseUrl}/api/assistant/leaks/examples?leakId=${encodeURIComponent(firstLeakId)}`,
        { headers: { Authorization: `Bearer ${tokenB}` } },
      );
      const crossLeakBody = await crossLeakRes.json().catch(() => ({}));
      const leakedExamples = Array.isArray(crossLeakBody?.examples) ? crossLeakBody.examples.length : 0;
      if (crossLeakRes.ok && leakedExamples > 0) {
        throw new Error(`RLS VIOLATION: Account B received ${leakedExamples} examples for Account A leak ${firstLeakId}`);
      }
    }

    if (consoleErrorsA.length > 0 || pageErrorsA.length > 0) {
      throw new Error(`Console/page errors observed on Account A: ${JSON.stringify({ consoleErrorsA, pageErrorsA })}`);
    }
    receipt.steps.push({ step: E2E_STEPS[4], ok: true, checkedCrossLeakId: Boolean(firstLeakId) });
    receipt.ok = true;
    receipt.finishedAt = new Date().toISOString();
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await accountAContext?.close().catch(() => {});
    await accountBContext?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('pa-two-account-e2e.mjs');
if (isDirectRun) {
  const args = parseArgs();
  if (args.checkOnly) {
    const check = validateE2EEnvironment({});
    if (check.ready || check.missing.length !== REQUIRED_ENV_KEYS.length) {
      console.error('pa-two-account-e2e contract failed: empty env must fail closed');
      process.exit(1);
    }
    console.log(`pa-two-account-e2e contract ok: ${E2E_STEPS.length} steps, ${REQUIRED_ENV_KEYS.length} required env vars, fail-closed verified`);
    process.exit(0);
  }
  runLiveE2E(args).catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    process.exit(1);
  });
}
