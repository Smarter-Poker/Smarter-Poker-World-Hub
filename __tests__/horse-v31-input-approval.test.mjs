import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run, validateConfig } from '../scripts/ci/approve-horse-v31-inputs.mjs';

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
  assert.doesNotMatch(script + workflow, /SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET|auth\.admin/);
  assert.match(script, /approval_unverified/);
  assert.match(script, /independentStoredReadback = false/);
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
