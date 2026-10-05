#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const APP_ORIGIN = 'https://smarter.poker';
export const AUTH_ORIGIN = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SHA = /^[0-9a-f]{40}$/;
const REQUIRED_CONTROLS = new Set([
  'video_library_discovery',
  'video_library_enrichment',
  'video_library_reel_creation',
  'video_library_reel_publication',
  'video_library_editorial_gate',
]);
const PRIVATE_KEYS = new Set([
  'canonical_asset_key', 'failure_code', 'failure_detail', 'provider_cursor',
  'session_id', 'source_name', 'user_id', 'video_id',
]);

export function validateConfiguration(env) {
  for (const key of ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VIDEO_OPERATIONS_EXPECTED_SHA']) {
    assert.ok(String(env[key] || '').trim(), `${key} is required`);
  }
  assert.ok(SHA.test(env.VIDEO_OPERATIONS_EXPECTED_SHA), 'VIDEO_OPERATIONS_EXPECTED_SHA must be a full commit SHA');
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin, AUTH_ORIGIN, 'Unexpected authentication origin');
  return { authOrigin: AUTH_ORIGIN };
}

function rejectPrivateKeys(value) {
  if (Array.isArray(value)) return value.forEach(rejectPrivateKeys);
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(PRIVATE_KEYS.has(key), false, `Operations snapshot exposed private field ${key}`);
    rejectPrivateKeys(nested);
  }
}

export function validateOperationsSnapshot(payload) {
  assert.ok(payload?.snapshot && typeof payload.snapshot === 'object', 'Operations API returned no snapshot');
  assert.ok(Array.isArray(payload.alerts), 'Operations API returned no alert list');
  const snapshot = payload.snapshot;
  for (const key of ['sources', 'ingestion', 'quota', 'candidates', 'rightsEvidence',
    'moderationCases', 'controls', 'controlHistory', 'jobs', 'nativeCosts',
    'delivery', 'learningFunnel']) assert.ok(Array.isArray(snapshot[key]), `Snapshot ${key} is not a list`);
  assert.ok(snapshot.sources.length > 0, 'Production source aggregates are empty');
  assert.ok(snapshot.candidates.length > 0, 'Production candidate aggregates are empty');
  const controls = new Map(snapshot.controls.map(row => [row.control_key, row]));
  for (const key of REQUIRED_CONTROLS) {
    assert.equal(typeof controls.get(key)?.enabled, 'boolean', `Required control ${key} is missing or invalid`);
  }
  assert.ok(Number.isFinite(Number(snapshot.duplicates?.duplicateRows)), 'Duplicate row count is invalid');
  assert.ok(Number.isFinite(Number(snapshot.duplicates?.duplicateCanonicalKeys)), 'Duplicate key count is invalid');
  assert.ok(Number.isFinite(Number(snapshot.topicLeakCount)), 'Topic leak count is invalid');
  assert.ok(Number.isFinite(Number(snapshot.organicSessions)), 'Organic session count is invalid');
  assert.equal(snapshot.windowHours, 24, 'Production snapshot did not honor the 24-hour window');
  assert.ok(Number.isFinite(Date.parse(snapshot.generatedAt)), 'Snapshot generation time is invalid');
  rejectPrivateKeys(payload);
  return {
    alertKeys: payload.alerts.map(row => String(row.key)).sort(),
    candidateGroups: snapshot.candidates.length,
    controlStates: [...REQUIRED_CONTROLS].sort().map(key => ({ key, enabled: controls.get(key).enabled })),
    deliveryGroups: snapshot.delivery.length,
    duplicateCanonicalKeys: Number(snapshot.duplicates.duplicateCanonicalKeys),
    duplicateRows: Number(snapshot.duplicates.duplicateRows),
    ingestionGroups: snapshot.ingestion.length,
    learningGroups: snapshot.learningFunnel.length,
    organicSessions: Number(snapshot.organicSessions),
    sourceGroups: snapshot.sources.length,
    topicLeakCount: Number(snapshot.topicLeakCount),
  };
}

export function validatePrivateNoStoreCacheControl(value) {
  const directives = new Set(String(value || '').split(',').map((part) => part.trim().toLowerCase()));
  assert.ok(directives.has('private'), 'Operations response is not private');
  assert.ok(directives.has('no-store'), 'Operations response is not no-store');
  assert.equal(directives.has('public'), false, 'Operations response contains a conflicting public directive');
}

export function validateReceipt(receipt, expectedSha) {
  assert.equal(receipt.status, 'passed', 'Video Operations live verification did not pass');
  assert.equal(receipt.expectedSha, expectedSha, 'Receipt expected revision differs');
  assert.equal(receipt.observedSha, expectedSha, 'Receipt production revision differs');
  assert.ok(receipt.deploymentId, 'Receipt has no deployment identity');
  assert.ok(receipt.snapshot?.sourceGroups > 0, 'Receipt has no source aggregates');
  assert.ok(receipt.snapshot?.candidateGroups > 0, 'Receipt has no candidate aggregates');
  assert.equal(receipt.snapshot?.controlStates?.length, REQUIRED_CONTROLS.size, 'Receipt control coverage is incomplete');
}

export function selfTest() {
  assert.throws(() => validateConfiguration({}), /TEST_USER_EMAIL/);
  const controls = [...REQUIRED_CONTROLS].map(control_key => ({ control_key, enabled: control_key !== 'video_library_editorial_gate' }));
  const snapshot = validateOperationsSnapshot({ alerts: [], snapshot: {
    generatedAt: '2026-10-05T00:00:00Z', windowHours: 24, sources: [{ topic: 'poker', active: 1 }],
    ingestion: [], quota: [], candidates: [{ topic: 'poker', status: 'published', count: 1 }],
    rightsEvidence: [], moderationCases: [], controls, controlHistory: [], jobs: [], nativeCosts: [],
    delivery: [], learningFunnel: [], organicSessions: 0, topicLeakCount: 0,
    duplicates: { duplicateRows: 0, duplicateCanonicalKeys: 0 },
  } });
  assert.equal(snapshot.sourceGroups, 1);
  assert.throws(() => validateOperationsSnapshot({ alerts: [], snapshot: {
    generatedAt: '2026-10-05T00:00:00Z', windowHours: 24, sources: [{ source_name: 'private' }],
    ingestion: [], quota: [], candidates: [{}], rightsEvidence: [], moderationCases: [], controls,
    controlHistory: [], jobs: [], nativeCosts: [], delivery: [], learningFunnel: [], organicSessions: 0,
    topicLeakCount: 0, duplicates: { duplicateRows: 0, duplicateCanonicalKeys: 0 },
  } }), /private field/);
  console.log('Video Operations live verifier safety checks passed');
}

export async function runLiveVerification(env = process.env) {
  const { authOrigin } = validateConfiguration(env);
  const evidenceDir = env.VIDEO_OPERATIONS_EVIDENCE_DIR || 'test-results/video-operations-live';
  await mkdir(evidenceDir, { recursive: true });
  const receipt = { observedAt: new Date().toISOString(), expectedSha: env.VIDEO_OPERATIONS_EXPECTED_SHA, status: 'running' };
  try {
    const healthResponse = await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    const health = await healthResponse.json();
    assert.ok(healthResponse.ok && health.status === 'ok', 'Production health is not healthy');
    assert.equal(health.commitSha, env.VIDEO_OPERATIONS_EXPECTED_SHA, 'Live revision differs from expected protected revision');
    receipt.observedSha = health.commitSha;
    receipt.deploymentId = health.deploymentId;

    const { createClient } = await import('@supabase/supabase-js');
    const auth = createClient(authOrigin, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) },
    });
    const signedIn = await auth.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
    assert.ok(!signedIn.error && signedIn.data?.session?.access_token, 'Configured test account authentication failed; no fallback account was used');
    const verified = await auth.auth.getUser(signedIn.data.session.access_token);
    assert.ok(!verified.error && verified.data?.user?.id === signedIn.data.session.user.id, 'Configured test account identity could not be verified');
    assert.equal(verified.data.user.email?.toLowerCase(), env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured test account');

    const response = await fetch(`${APP_ORIGIN}/api/admin/video-operations?windowHours=24`, {
      headers: { Authorization: `Bearer ${signedIn.data.session.access_token}`, 'Cache-Control': 'no-cache' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, `Authenticated Video Operations API returned HTTP ${response.status}`);
    validatePrivateNoStoreCacheControl(response.headers.get('cache-control'));
    receipt.snapshot = validateOperationsSnapshot(await response.json());

    const finalHealth = await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    assert.equal((await finalHealth.json()).commitSha, env.VIDEO_OPERATIONS_EXPECTED_SHA, 'Production revision changed during verification');
    receipt.status = 'passed';
    validateReceipt(receipt, env.VIDEO_OPERATIONS_EXPECTED_SHA);
    console.log(JSON.stringify(receipt));
  } catch (error) {
    receipt.status = 'failed';
    receipt.failure = error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'Live probe could not complete; inspect configured test access and service availability';
    console.error(receipt.failure);
    process.exitCode = 1;
  } finally {
    await writeFile(`${evidenceDir}/result.json`, JSON.stringify(receipt, null, 2));
  }
  return receipt;
}

async function checkReceipt(path) {
  const receipt = JSON.parse(await readFile(path, 'utf8'));
  validateReceipt(receipt, process.env.VIDEO_OPERATIONS_EXPECTED_SHA);
  console.log('Video Operations live receipt is complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) selfTest();
  else if (process.argv.includes('--check-receipt')) await checkReceipt(process.argv.at(-1));
  else await runLiveVerification();
}
