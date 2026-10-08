import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProductionDeliveryAttestation, validateDesignatedAuditAuthState, validateImmutableDeploymentUrl } from '../training-phase6-production-delivery-attestation.mjs';

export const AUDIT_UUID = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
export function validateConfig(env) {
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'protected main required');
  assert.match(env.EXPECTED_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(env.GITHUB_SHA, env.EXPECTED_SHA, 'source identity mismatch');
  for (const key of ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'RUNNER_TEMP', 'PUBLIC_EVIDENCE']) assert.ok(env[key], `${key} required`);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://kuklfnapbkmacvwxktbh.supabase.co');
  return { origin: validateImmutableDeploymentUrl(env.DEPLOYMENT_URL), expectedSha: env.EXPECTED_SHA };
}
export async function collectPublic(env = process.env, runtime = {}) {
  const config = validateConfig(env);
  const createClient = runtime.createClient || (await import('@supabase/supabase-js')).createClient;
  const collect = runtime.collect || runProductionDeliveryAttestation;
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const privateDir = await mkdtemp(join(env.RUNNER_TEMP, 'training-phase6-session-'));
  try {
    const login = await client.auth.signInWithPassword({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD });
    assert.ok(!login.error && login.data?.session, 'configured audit sign-in failed');
    const checked = await client.auth.getUser(login.data.session.access_token);
    assert.ok(!checked.error, 'audit identity verification failed');
    assert.equal(checked.data?.user?.id, AUDIT_UUID, 'designated audit identity mismatch');
    assert.equal(checked.data.user.email?.toLowerCase(), env.TEST_USER_EMAIL.toLowerCase(), 'configured email mismatch');
    const state = { cookies: [], origins: [{ origin: config.origin, localStorage: [{ name: 'smarter-poker-auth', value: JSON.stringify(login.data.session) }] }] };
    validateDesignatedAuditAuthState(state, config.origin, AUDIT_UUID);
    const authState = join(privateDir, 'state.json');
    await writeFile(authState, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
    return await collect({ baseUrl: config.origin, expectedBuild: config.expectedSha, authState, output: env.PUBLIC_EVIDENCE, expectedAuditUserId: AUDIT_UUID, writeAcknowledgement: 'I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS', protectionBypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET || '' });
  } finally {
    await rm(privateDir, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  collectPublic().catch(() => { console.error('TRAINING_PHASE6_PUBLIC_CERTIFICATE_FAILED'); process.exitCode = 1; });
}
