import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deriveInputIdentity, run, validateConfig } from '../scripts/ci/approve-horse-v31-inputs.mjs';

const env = { GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: 'a'.repeat(40), EXPECTED_COMMIT: 'a'.repeat(40), V31_MODE: 'qualify',
  NEXT_PUBLIC_SUPABASE_URL: 'https://kuklfnapbkmacvwxktbh.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon', TEST_USER_EMAIL: 'test@example.invalid',
  TEST_USER_PASSWORD: 'test-only', V31_RECEIPT: '/test/receipt.json' };

test('qualify requires existing configured identity and protected dispatch', () => {
  validateConfig(env);
  for (const patch of [{ GITHUB_REF: 'refs/heads/untrusted' }, { GITHUB_RUN_ATTEMPT: '2' },
    { EXPECTED_COMMIT: 'b'.repeat(40) }, { TEST_USER_PASSWORD: '' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://different.supabase.co' }]) {
    assert.throws(() => validateConfig({ ...env, ...patch }));
  }
});

test('approval refuses unpinned or arbitrary paths', () => {
  const approval = { ...env, V31_MODE: 'approve', V31_APPROVAL_PATH: '.agent/v31-inputs/frozen.json',
    V31_APPROVAL_SHA256: 'b'.repeat(64), V31_BUNDLE_CHECKSUM: 'c'.repeat(64),
    V31_BUNDLE_ID: '00000000-0000-4000-8000-000000000001' };
  validateConfig(approval);
  for (const path of ['../../other.json', 'https://remote/input.json', '.agent/v31-inputs/../x.json']) {
    assert.throws(() => validateConfig({ ...approval, V31_APPROVAL_PATH: path }));
  }
  assert.throws(() => validateConfig({ ...approval, V31_BUNDLE_CHECKSUM: '' }));
});

test('workflow keeps trusted execution and normal authenticated approval', () => {
  const workflow = readFileSync(new URL('../.github/workflows/approve-horse-v31-inputs.yml', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../scripts/ci/approve-horse-v31-inputs.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ inputs\./);
  assert.match(script, /auth\/v1\/token\?grant_type=password/);
  assert.match(script, /rpc\/fn_is_horse_admin/);
  assert.match(script, /rpc\/ca_gto_v31_approve_input_bundle/);
  assert.doesNotMatch(script, /rpc\/fn_gto_v31_input_bundle_(?:checksum|id)/);
  assert.doesNotMatch(script + workflow, /SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET|auth\.admin/);
  assert.match(script, /approval_unverified/);
  assert.match(script, /independentStoredReadback = false/);
});

test('local identity uses the authoritative strict Python contract', () => {
  const bytes = readFileSync(new URL('../.agent/v31-inputs/horse-v31-20261006.json', import.meta.url));
  assert.deepEqual(deriveInputIdentity(bytes), {
    checksum: '107f20cb8da55a182c80a9736b94c914a1608d68a2e7211e7fa79ac99459e016',
    id: '107f20cb-8da5-5a18-8c80-a9736b94c914',
  });
  assert.throws(() => deriveInputIdentity(Buffer.from('{"bundle_key":"a","bundle_key":"b"}')),
    /local_input_identity_validation_failed/);
});

test('approval submits once with exact inputs and retains mismatch or denied outcomes', async () => {
  const originalFetch = globalThis.fetch;
  const folder = await mkdtemp(join(tmpdir(), 'v31-approval-execution-'));
  const bytes = readFileSync(new URL('../.agent/v31-inputs/horse-v31-20261006.json', import.meta.url));
  const checksum = '107f20cb8da55a182c80a9736b94c914a1608d68a2e7211e7fa79ac99459e016';
  const id = '107f20cb-8da5-5a18-8c80-a9736b94c914';
  try {
    for (const outcome of ['success', 'identity_mismatch', 'denied', 'transport_unknown']) {
      const approvals = [];
      const paths = [];
      globalThis.fetch = async (url, options) => {
        paths.push(new URL(url).pathname);
        let value;
        if (url.includes('/token?')) value = { access_token: 'memory-only-test-token' };
        else if (url.endsWith('/user')) value = { id, email: env.TEST_USER_EMAIL };
        else if (url.endsWith('/fn_is_horse_admin')) value = true;
        else {
          assert.ok(url.endsWith('/ca_gto_v31_approve_input_bundle'));
          approvals.push(JSON.parse(options.body));
          if (outcome === 'denied') return { ok: false, status: 403 };
          if (outcome === 'transport_unknown') throw new Error('timeout');
          value = id;
        }
        return { ok: true, json: async () => value };
      };
      const config = { ...env, V31_MODE: 'approve', V31_RECEIPT: join(folder, 'receipt.json'),
        V31_APPROVAL_PATH: '.agent/v31-inputs/horse-v31-20261006.json',
        V31_APPROVAL_SHA256: createHash('sha256').update(bytes).digest('hex'),
        V31_BUNDLE_CHECKSUM: outcome === 'identity_mismatch' ? 'c'.repeat(64) : checksum,
        V31_BUNDLE_ID: id };
      if (outcome === 'success') assert.equal((await run(config)).status, 'complete');
      else await assert.rejects(run(config));
      assert.equal(approvals.length, outcome === 'identity_mismatch' ? 0 : 1);
      if (approvals.length) assert.deepEqual(approvals[0], { p_bundle: JSON.parse(bytes.toString('utf8')) });
      assert.ok(paths.every(path => !path.includes('/fn_gto_v31_input_bundle_')));
      const receipt = JSON.parse(await readFile(config.V31_RECEIPT, 'utf8'));
      assert.equal(receipt.approvalDurablePostcondition, outcome === 'success');
      assert.equal(receipt.independentStoredReadback, false);
      assert.equal(receipt.status, outcome === 'success' ? 'complete'
        : outcome === 'identity_mismatch' ? 'failed' : 'approval_unverified');
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(folder, { recursive: true });
  }
});

test('qualify performs no approval and denied administrator never writes', async () => {
  const originalFetch = globalThis.fetch;
  const folder = await mkdtemp(join(tmpdir(), 'v31-approval-test-'));
  try {
    for (const allowed of [true, false]) {
      const paths = [];
      globalThis.fetch = async (url) => {
        paths.push(new URL(url).pathname);
        const value = url.includes('/token?') ? { access_token: 'memory-only-test-token' }
          : url.endsWith('/user') ? { id: '00000000-0000-4000-8000-000000000001', email: env.TEST_USER_EMAIL }
            : allowed;
        return { ok: true, json: async () => value };
      };
      const config = { ...env, V31_RECEIPT: join(folder, 'receipt.json') };
      if (allowed) assert.equal((await run(config)).status, 'complete');
      else await assert.rejects(run(config), /configured_identity_is_not_horse_admin/);
      assert.deepEqual(paths, ['/auth/v1/token', '/auth/v1/user', '/rest/v1/rpc/fn_is_horse_admin']);
      const receipt = await readFile(config.V31_RECEIPT, 'utf8');
      assert.doesNotMatch(receipt, /memory-only-test-token|test-only|test@example/);
      assert.equal(JSON.parse(receipt).approvalAttempted, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(folder, { recursive: true });
  }
});
