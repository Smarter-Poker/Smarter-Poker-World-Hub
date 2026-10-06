import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ORIGIN = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CHECKOUT = /^[0-9a-f]{40}$/;

export function deriveInputIdentity(bytes) {
  const pipelineRoot = fileURLToPath(new URL('../horse-solver-v31/', import.meta.url));
  const program = [
    'import json,sys',
    'from contract import _json_bytes,input_bundle_checksum,input_bundle_id',
    'bundle=_json_bytes(sys.stdin.buffer.read(),"approval bundle")',
    'checksum=input_bundle_checksum(bundle)',
    'print(json.dumps({"checksum":checksum,"id":input_bundle_id(checksum)}))',
  ].join('\n');
  const child = spawnSync('python3', ['-c', program], {
    cwd: pipelineRoot, input: bytes, encoding: 'utf8', timeout: 10_000, maxBuffer: 128_000,
    env: { PATH: process.env.PATH || '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1', LANG: 'C.UTF-8' },
  });
  if (child.status !== 0 || child.error) throw new Error('local_input_identity_validation_failed');
  let identity;
  try { identity = JSON.parse(child.stdout); } catch { throw new Error('local_input_identity_validation_failed'); }
  if (!HEX.test(identity.checksum || '') || !UUID.test(identity.id || '')) {
    throw new Error('local_input_identity_validation_failed');
  }
  return identity;
}

export function validateConfig(env) {
  if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_RUN_ATTEMPT !== '1'
      || !CHECKOUT.test(env.EXPECTED_COMMIT || '') || env.GITHUB_SHA !== env.EXPECTED_COMMIT) {
    throw new Error('protected_main_identity_invalid');
  }
  if (!['qualify', 'approve'].includes(env.V31_MODE)) throw new Error('mode_invalid');
  if (env.NEXT_PUBLIC_SUPABASE_URL !== ORIGIN) throw new Error('database_origin_invalid');
  for (const name of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD', 'V31_RECEIPT']) {
    if (!env[name]) throw new Error('configured_authentication_unavailable');
  }
  if (env.V31_MODE === 'approve' && (!/^\.agent\/v31-inputs\/[A-Za-z0-9_-]+\.json$/.test(env.V31_APPROVAL_PATH || '')
      || !HEX.test(env.V31_APPROVAL_SHA256 || '') || !HEX.test(env.V31_BUNDLE_CHECKSUM || '')
      || !UUID.test(env.V31_BUNDLE_ID || ''))) throw new Error('immutable_approval_identity_invalid');
}

async function request(path, body, env, token, method = 'POST') {
  let response;
  try {
    response = await fetch(`${ORIGIN}${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token || env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('database_transport_outcome_unknown');
  }
  if (!response.ok) throw new Error(`database_http_${response.status}`);
  return response.json();
}

export async function run(env) {
  validateConfig(env);
  const receipt = { schemaVersion: 1, operation: 'horse_v31_input_approval',
    mode: env.V31_MODE, status: 'started', commit: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    authenticated: false, horseAdmin: false, approvalAttempted: false,
    approvalDurablePostcondition: false, independentStoredReadback: false };
  const save = () => writeFile(env.V31_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await save();
  let token;
  try {
    const session = await request('/auth/v1/token?grant_type=password',
      { email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD }, env);
    token = session.access_token;
    if (!token) throw new Error('authenticated_session_missing');
    const user = await request('/auth/v1/user', undefined, env, token, 'GET');
    if (!UUID.test(user.id || '') || user.email?.toLowerCase() !== env.TEST_USER_EMAIL.toLowerCase()) {
      throw new Error('authenticated_identity_mismatch');
    }
    receipt.authenticated = true;
    receipt.accountFingerprint = createHash('sha256').update(user.id).digest('hex').slice(0, 16);
    receipt.horseAdmin = await request('/rest/v1/rpc/fn_is_horse_admin', {}, env, token) === true;
    if (!receipt.horseAdmin) throw new Error('configured_identity_is_not_horse_admin');
    if (env.V31_MODE === 'approve') {
      const bytes = await readFile(resolve(env.V31_APPROVAL_PATH));
      if (bytes.length > 1_000_000 || createHash('sha256').update(bytes).digest('hex') !== env.V31_APPROVAL_SHA256) {
        throw new Error('immutable_approval_file_mismatch');
      }
      const { checksum, id } = deriveInputIdentity(bytes);
      if (checksum !== env.V31_BUNDLE_CHECKSUM || id !== env.V31_BUNDLE_ID) throw new Error('local_input_identity_mismatch');
      const bundle = JSON.parse(bytes.toString('utf8'));
      receipt.inputBundleId = id;
      receipt.inputBundleChecksum = checksum;
      receipt.approvalAttempted = true;
      receipt.status = 'approval_in_progress';
      await save();
      const approved = await request('/rest/v1/rpc/ca_gto_v31_approve_input_bundle', { p_bundle: bundle }, env, token);
      if (approved !== id) throw new Error('approval_returned_identity_mismatch');
      receipt.approvalDurablePostcondition = true;
      receipt.independentStoredReadback = false;
      receipt.readbackNextStep = 'compactor registration then fn_gto_v31_worker_contract';
    }
    receipt.status = 'complete';
    return receipt;
  } catch (error) {
    receipt.status = receipt.approvalAttempted ? 'approval_unverified' : 'failed';
    receipt.failureCode = /^[a-z0-9_]+$/.test(error.message) ? error.message : 'controlled_validation_failure';
    throw error;
  } finally {
    token = undefined;
    receipt.recordedAt = new Date().toISOString();
    await save();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.env).then(() => console.log('V31_INPUT_OPERATION_COMPLETE'))
    .catch(() => { console.error('V31_INPUT_OPERATION_FAILED: inspect sanitized receipt'); process.exitCode = 1; });
}
