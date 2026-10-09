#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const APP_ORIGIN = 'https://smarter.poker';
export const AUTH_ORIGIN = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SHA = /^[0-9a-f]{40}$/;
const RECEIPT_PATH = 'test-results/social-card-live/result.json';
const DRAFT_KEYS = ['sp-post-draft', 'sp-post-card-draft', 'sp-post-pending-draft'];

export function validateConfiguration(env) {
  for (const key of [
    'TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SOCIAL_CARD_EXPECTED_SHA', 'SOCIAL_CARD_SOURCE_SHA',
  ]) assert.ok(String(env[key] || '').trim(), `${key} is required`);
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin, AUTH_ORIGIN, 'Unexpected authentication origin');
  assert.match(env.SOCIAL_CARD_EXPECTED_SHA, SHA, 'Expected deployed SHA must be a full commit');
  assert.match(env.SOCIAL_CARD_SOURCE_SHA, SHA, 'Workflow source SHA must be a full commit');
}

export function isForbiddenPostMutation(method, value) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase())) return false;
  const url = new URL(value);
  return /\/api\/(?:posts|social)|\/rest\/v1\/(?:posts|social_posts|social_page_posts)(?:\?|$)/.test(`${url.pathname}${url.search}`);
}

export function classifyHistorySurface({ importButtons, emptyText, rejectedText }) {
  if (importButtons > 0) return 'imported-own-hand';
  if (emptyText) return 'empty-history';
  if (rejectedText) return 'empty-no-complete-card-data';
  throw new Error('Recent hand surface did not reach an explicit terminal state');
}

export function exactSemanticLabel(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

export function validateReceipt(receipt, expectedSha) {
  assert.equal(receipt.status, 'passed', 'Social card live verification did not pass');
  assert.equal(receipt.expectedSha, expectedSha, 'Receipt expected revision differs');
  assert.equal(receipt.observedSha, expectedSha, 'Receipt production revision differs');
  assert.match(receipt.sourceSha, SHA, 'Receipt has no protected workflow source revision');
  assert.ok(String(receipt.deploymentId || '').startsWith('dpl_'), 'Receipt has no deployment identity');
  for (const key of [
    'authenticatedServiceIdentity', 'canonicalArtwork', 'longPressTen',
    'duplicateRefusal', 'draftReload', 'presetRoundTrip',
    'preferencesRestored', 'anonymousFactsDenied', 'otherUsersFactsDenied',
    'noPostMutation',
  ]) assert.equal(receipt.checks?.[key], true, `Receipt check ${key} is incomplete`);
  assert.ok([
    'imported-own-hand', 'empty-history', 'empty-no-complete-card-data',
  ].includes(receipt.history?.outcome), 'Receipt does not distinguish import from an empty state');
}

const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
const clone = (value) => value == null ? value : structuredClone(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readHealth(expectedSha) {
  const response = await fetch(`${APP_ORIGIN}/api/health`, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  assert.ok(response.ok && body?.status === 'ok', 'Production health is not healthy');
  assert.equal(body?.checks?.db?.status, 'ok', 'Production database is not healthy');
  assert.equal(body?.commitSha, expectedSha, 'Live revision differs from expected protected revision');
  assert.ok(String(body?.deploymentId || '').startsWith('dpl_'), 'Production deployment identity is missing');
  return body;
}

async function waitForSetting(client, userId, predicate, message) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const result = await client.from('profiles').select('app_settings').eq('id', userId).maybeSingle();
    if (!result.error && predicate(result.data?.app_settings)) return result.data?.app_settings;
    await sleep(300);
  }
  assert.fail(message);
}

async function authenticateBrowser(browser, email, password, expectedUserId) {
  const context = await browser.newContext({
    baseURL: APP_ORIGIN,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const continueToHub = page.getByRole('button', { name: /continue to hub/i });
  if (!new URL(page.url()).pathname.startsWith('/hub')) {
    if (await continueToHub.isVisible()) await continueToHub.click();
    else {
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      const outcome = await Promise.race([
        page.waitForURL(/\/hub(?:\/|$|\?)/, { timeout: 45_000 }).then(() => 'hub'),
        continueToHub.waitFor({ state: 'visible', timeout: 45_000 }).then(() => 'continue'),
      ]);
      if (outcome === 'continue') await continueToHub.click();
    }
  }
  await page.waitForURL(/\/hub(?:\/|$|\?)/, { timeout: 45_000 });
  assert.equal(new URL(page.url()).origin, APP_ORIGIN, 'Authenticated browser left production');
  const browserUserId = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
    if (session?.user?.id) localStorage.setItem(`sp_firstrun_notif_v2_${session.user.id}`, String(Date.now()));
    return session?.user?.id || null;
  });
  assert.equal(browserUserId, expectedUserId, 'Browser session differs from configured test identity');
  return { context, page };
}

async function verifyCardSurface({ browser, env, client, userId, receipt }) {
  receipt.stage = 'authenticate-browser';
  const { context, page } = await authenticateBrowser(browser, env.TEST_USER_EMAIL, env.TEST_USER_PASSWORD, userId);
  const postMutations = [];
  page.on('request', (request) => {
    if (isForbiddenPostMutation(request.method(), request.url())) postMutations.push('forbidden');
  });
  try {
    receipt.stage = 'open-social-composer';
    await page.goto('/hub/social-media', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('button', { name: 'Poker Cards', exact: true }).first().waitFor({ state: 'visible', timeout: 45_000 });
    await page.evaluate(({ keys, presetKey }) => {
      for (const key of [...keys, presetKey]) localStorage.removeItem(key);
    }, { keys: DRAFT_KEYS, presetKey: `sp-poker-card-presets:${userId}` });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

    const openPicker = async () => {
      await page.getByRole('button', { name: 'Poker Cards', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Add Poker Cards' });
      await dialog.waitFor({ state: 'visible', timeout: 20_000 });
      return dialog;
    };

    receipt.stage = 'open-card-picker';
    let dialog = await openPicker();
    receipt.stage = 'resolve-ten-button';
    const quickRankButtons = dialog.locator('button[aria-controls="quick-rank-suits"]');
    const visibleOneKeys = dialog.locator('button[aria-controls="quick-rank-suits"]:visible')
      .filter({ hasText: /^1$/ });
    const quickRankButtonCount = await quickRankButtons.count();
    const visibleOneCount = await visibleOneKeys.count();
    const tenAriaLabel = visibleOneCount === 1
      ? await visibleOneKeys.first().getAttribute('aria-label')
      : null;
    receipt.diagnostics = { quickRankButtonCount, visibleOneCount, tenAriaLabel };
    assert.equal(quickRankButtonCount, 13, 'The quick-rank selector did not render all ranks');
    assert.equal(visibleOneCount, 1, 'The quick-rank selector did not render one unique visible 1 key');
    const ten = visibleOneKeys.first();
    await ten.waitFor({ state: 'visible' });
    assert.match(tenAriaLabel || '', exactSemanticLabel('10. Hold for suits'), 'The 1 quick-rank key did not expose the ten long-press label');
    // Keep the complete hold inside the browser event loop. The split
    // Node-side dispatch did not surface the suit choices in headless
    // Chromium, while this preserves one continuous browser-owned gesture.
    receipt.stage = 'dispatch-ten-hold';
    await ten.evaluate(async (button) => {
      button.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1,
      }));
      await new Promise((resolve) => setTimeout(resolve, 500));
      button.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0,
      }));
    });
    receipt.diagnostics.tenAriaExpanded = await ten.getAttribute('aria-expanded') === 'true';
    receipt.stage = 'await-ten-suits';
    await dialog.getByRole('group', { name: exactSemanticLabel('10 suit choices') }).waitFor({ state: 'visible' });
    receipt.checks.longPressTen = true;
    delete receipt.diagnostics;

    receipt.stage = 'duplicate-card-refusal';
    const tenSuits = dialog.getByRole('group', { name: exactSemanticLabel('10 suit choices') });
    await tenSuits.getByRole('button', { name: exactSemanticLabel('Add 10 of spades to your hand') }).click();
    await tenSuits.waitFor({ state: 'hidden' });
    await dialog.getByRole('button', { name: exactSemanticLabel('Remove 10 of spades from your hand') }).waitFor({ state: 'visible' });
    const duplicate = dialog.getByRole('button', { name: exactSemanticLabel('Add 10 of spades to your hand') });
    assert.equal(await duplicate.count(), 1, 'The selected card control was not unique after the quick suit tray closed');
    assert.equal(await duplicate.isDisabled(), true, 'A selected card could be added twice');
    receipt.checks.duplicateRefusal = true;
    await dialog.getByRole('button', { name: exactSemanticLabel('Add ace of hearts to your hand') }).click();

    receipt.stage = 'canonical-card-artwork';
    const selectedTen = dialog.getByRole('button', { name: exactSemanticLabel('Remove 10 of spades from your hand') }).locator('img');
    assert.match(await selectedTen.getAttribute('src'), /\/hub\/club-arena\/cards\/2color\/spades_10\.webp$/);
    receipt.checks.canonicalArtwork = true;

    receipt.stage = 'save-account-preset';
    const presetName = `Production Certificate ${Date.now()}`;
    await dialog.locator('#poker-card-preset-name').fill(presetName);
    await dialog.getByRole('button', { name: 'Save Preset', exact: true }).click();
    await dialog.getByText('Preset Saved', { exact: true }).waitFor({ state: 'visible' });
    await waitForSetting(
      client,
      userId,
      (settings) => settings?.poker_card_presets?.some((preset) => preset?.name === presetName),
      'Saved preset did not persist to the configured account',
    );
    await dialog.getByRole('button', { name: 'Add Cards To Post', exact: true }).click();
    await page.getByText('Poker Cards In This Post', { exact: true }).waitFor({ state: 'visible' });
    assert.match(
      await page.getByText('Poker Cards In This Post', { exact: true }).locator('..').getByAltText(exactSemanticLabel('Ten of spades')).getAttribute('src'),
      /\/hub\/club-arena\/cards\/2color\/spades_10\.webp$/,
    );

    receipt.stage = 'reload-local-draft';
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByText('Poker Cards In This Post', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByAltText(exactSemanticLabel('Ten of spades')).first().waitFor({ state: 'visible' });
    receipt.checks.draftReload = true;

    receipt.stage = 'reload-delete-account-preset';
    dialog = await openPicker();
    await dialog.getByRole('button', { name: exactSemanticLabel(`Use ${presetName} preset`) }).waitFor({ state: 'visible', timeout: 20_000 });
    await dialog.getByRole('button', { name: exactSemanticLabel(`Use ${presetName} preset`) }).click();
    await dialog.getByText(`${presetName} Loaded`, { exact: true }).waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: exactSemanticLabel(`Delete ${presetName} preset`) }).click();
    await dialog.getByText('Preset Deleted', { exact: true }).waitFor({ state: 'visible' });
    await waitForSetting(
      client,
      userId,
      (settings) => !settings?.poker_card_presets?.some((preset) => preset?.name === presetName),
      'Deleted preset remained in the configured account',
    );
    receipt.checks.presetRoundTrip = true;

    receipt.stage = 'classify-own-hand-import';
    const importButtons = dialog.getByRole('button', { name: /^Import (?:Hand|Club Arena Hand)/ });
    const emptyHistory = dialog.getByText('No Recent Club Arena Hands To Import.', { exact: true });
    const rejectedHistory = dialog.getByText('Recent Hands Had No Complete Card Data To Import.', { exact: true });
    await Promise.any([
      importButtons.first().waitFor({ state: 'visible', timeout: 20_000 }),
      emptyHistory.waitFor({ state: 'visible', timeout: 20_000 }),
      rejectedHistory.waitFor({ state: 'visible', timeout: 20_000 }),
    ]).catch(() => assert.fail('Recent hand surface did not reach an explicit terminal state'));
    assert.equal(await dialog.getByRole('alert').count(), 0, 'Recent hand surface returned an error state');
    const importCount = await importButtons.count();
    const emptyText = await emptyHistory.isVisible().catch(() => false);
    const rejectedText = await rejectedHistory.isVisible().catch(() => false);
    const outcome = classifyHistorySurface({ importButtons: importCount, emptyText, rejectedText });
    if (importCount > 0) {
      const label = await importButtons.first().getAttribute('aria-label');
      await importButtons.first().click();
      await dialog.getByText(`${label.slice('Import '.length)} Imported`, { exact: true }).waitFor({ state: 'visible' });
    }
    receipt.history = { ...receipt.history, outcome };
    await dialog.getByRole('button', { name: 'Close Card Picker' }).click();
    assert.equal(postMutations.length, 0, 'The certificate attempted to publish a post');
    receipt.checks.noPostMutation = true;
    receipt.stage = 'card-surface-complete';
  } finally {
    await context.close();
  }
}

export async function runLiveVerification(env = process.env) {
  validateConfiguration(env);
  const evidencePath = env.SOCIAL_CARD_RECEIPT || RECEIPT_PATH;
  const receipt = {
    schemaVersion: 1,
    kind: 'social-card-production-certificate',
    status: 'running',
    expectedSha: env.SOCIAL_CARD_EXPECTED_SHA,
    sourceSha: env.SOCIAL_CARD_SOURCE_SHA,
    observedAt: new Date().toISOString(),
    checks: {},
  };
  let browser;
  let client;
  let userId;
  let originalSettings;
  let originalSettingsLoaded = false;
  try {
    receipt.stage = 'production-health';
    const health = await readHealth(env.SOCIAL_CARD_EXPECTED_SHA);
    receipt.observedSha = health.commitSha;
    receipt.deploymentId = health.deploymentId;

    receipt.stage = 'authenticate-service-identity';
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(AUTH_ORIGIN, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20_000) }) },
    });
    const signedIn = await client.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
    assert.ok(!signedIn.error && signedIn.data?.session?.user?.id, 'Configured test account authentication failed; no fallback was used');
    const verified = await client.auth.getUser(signedIn.data.session.access_token);
    assert.equal(verified.data?.user?.id, signedIn.data.session.user.id, 'Configured test identity could not be verified');
    assert.equal(verified.data.user.email?.toLowerCase(), env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured test account');
    userId = signedIn.data.session.user.id;
    receipt.accountFingerprint = fingerprint(userId);
    receipt.checks.authenticatedServiceIdentity = true;

    receipt.stage = 'snapshot-account-preferences';
    const profile = await client.from('profiles').select('app_settings').eq('id', userId).maybeSingle();
    assert.ifError(profile.error);
    originalSettings = clone(profile.data?.app_settings);
    originalSettingsLoaded = true;

    receipt.stage = 'read-own-hand-facts';
    const ownFacts = await client.from('ca_hand_facts')
      .select('hand_id, user_id, played_at')
      .order('played_at', { ascending: false })
      .limit(25);
    assert.ifError(ownFacts.error);
    assert.ok((ownFacts.data || []).every((row) => row.user_id === userId), 'Authenticated query exposed another user\'s hand facts');
    receipt.history = { participantRows: ownFacts.data?.length || 0, outcome: null };
    receipt.checks.otherUsersFactsDenied = true;

    receipt.stage = 'deny-anonymous-hand-facts';
    const anonymous = createClient(AUTH_ORIGIN, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const anonFacts = await anonymous.from('ca_hand_facts').select('hand_id, user_id').limit(1);
    assert.ok(anonFacts.error || (anonFacts.data || []).length === 0, 'Anonymous query exposed private hand facts');
    receipt.checks.anonymousFactsDenied = true;

    receipt.stage = 'launch-browser';
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    await verifyCardSurface({ browser, env, client, userId, receipt });

    receipt.stage = 'final-production-health';
    const finalHealth = await readHealth(env.SOCIAL_CARD_EXPECTED_SHA);
    assert.equal(finalHealth.deploymentId, receipt.deploymentId, 'Production deployment changed during verification');
    delete receipt.stage;
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed';
    receipt.failure = error instanceof assert.AssertionError
      ? String(error.message).split('\n')[0].slice(0, 240)
      : `Live certificate failed during ${receipt.stage || 'unknown-stage'} (${error?.name || 'Error'})`;
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (client && userId && originalSettingsLoaded) {
      const restored = await client.from('profiles').update({ app_settings: originalSettings }).eq('id', userId);
      if (restored.error) {
        receipt.status = 'failed';
        receipt.failure = 'Configured test account preferences could not be restored';
        process.exitCode = 1;
      } else {
        const readback = await client.from('profiles').select('app_settings').eq('id', userId).maybeSingle();
        receipt.checks.preferencesRestored = !readback.error
          && JSON.stringify(readback.data?.app_settings) === JSON.stringify(originalSettings);
        if (!receipt.checks.preferencesRestored) {
          receipt.status = 'failed';
          receipt.failure = 'Configured test account preference restoration readback failed';
          process.exitCode = 1;
        }
      }
    }
    if (receipt.status === 'passed') delete receipt.stage;
    if (receipt.status === 'passed') validateReceipt(receipt, env.SOCIAL_CARD_EXPECTED_SHA);
    await mkdir(evidencePath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(receipt));
  }
  return receipt;
}

export function selfTest() {
  assert.throws(() => validateConfiguration({}), /TEST_USER_EMAIL/);
  assert.equal(classifyHistorySurface({ importButtons: 1 }), 'imported-own-hand');
  assert.equal(classifyHistorySurface({ importButtons: 0, emptyText: true }), 'empty-history');
  assert.equal(isForbiddenPostMutation('POST', 'https://smarter.poker/api/social/posts'), true);
  assert.equal(isForbiddenPostMutation('POST', `${AUTH_ORIGIN}/rest/v1/social_posts`), true);
  assert.equal(isForbiddenPostMutation('PATCH', `${AUTH_ORIGIN}/rest/v1/profiles?id=eq.fixture`), false);
  console.log('Social card live verifier safety checks passed');
}

async function checkReceipt(path) {
  const receipt = JSON.parse(await readFile(path, 'utf8'));
  validateReceipt(receipt, process.env.SOCIAL_CARD_EXPECTED_SHA);
  console.log('Social card live receipt is complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--check-receipt')) await checkReceipt(process.argv.at(-1));
  else await runLiveVerification();
}
