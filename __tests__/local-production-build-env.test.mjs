import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkBuildEnv, REQUIRED_BUILD_KEYS } from '../scripts/check-local-production-build-env.mjs';

const script = fileURLToPath(new URL('../scripts/check-local-production-build-env.mjs', import.meta.url));
// Deliberately non-credentials. Presence is all this preflight may certify.
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture_not_a_credential',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture_not_a_credential',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'fixture_public_vapid_not_a_credential',
};
const envText = (values) => Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');

test('the actual quoted redaction fails for every required build input', () => {
  for (const name of REQUIRED_BUILD_KEYS) {
    const input = { ...valid, [name]: '[SENSITIVE]' };
    // The former truthiness checks accept this precise failure input.
    assert.ok(REQUIRED_BUILD_KEYS.every(key => input[key]));
    assert.deepEqual(checkBuildEnv(envText(input)), [{ name, reason: 'unresolved sensitive marker' }]);
  }
});

test('Vercel dotenv precedence: inherited values win, including empty and invalid values', () => {
  const key = 'SUPABASE_SERVICE_ROLE_KEY';
  assert.deepEqual(checkBuildEnv(envText({ ...valid, [key]: '[SENSITIVE]' }), { [key]: valid[key] }), []);
  assert.deepEqual(checkBuildEnv(envText(valid), { [key]: '[SENSITIVE]' }), [
    { name: key, reason: 'unresolved sensitive marker' },
  ]);
  assert.deepEqual(checkBuildEnv(envText(valid), { [key]: '' }), [
    { name: key, reason: 'missing or empty' },
  ]);
});

test('unneeded runtime inputs may be absent but unresolved effective rows cannot pass', () => {
  assert.deepEqual(checkBuildEnv(envText(valid)), []);
  for (const name of ['NEXT_PUBLIC_TWILIO_PHONE_NUMBER', 'UNRELATED_RUNTIME_SECRET']) {
    assert.deepEqual(checkBuildEnv(`${envText(valid)}\n${name}='[SENSITIVE]'`), [
      { name, reason: 'unresolved sensitive marker' },
    ]);
  }
  assert.deepEqual(checkBuildEnv(envText(valid), { UNRELATED_RUNTIME_SECRET: '[SENSITIVE]' }), [
    { name: 'UNRELATED_RUNTIME_SECRET', reason: 'unresolved sensitive marker' },
  ]);
});

test('each required key must be present; former CI placeholder and admin sentinel fail', () => {
  for (const name of REQUIRED_BUILD_KEYS) {
    const input = { ...valid };
    delete input[name];
    assert.deepEqual(checkBuildEnv(envText(input)), [{ name, reason: 'missing or empty' }]);
  }
  for (const value of ['placeholder', 'MISSING_SUPABASE_SERVICE_ROLE_KEY', 'missing-key']) {
    assert.deepEqual(checkBuildEnv(envText({ ...valid, SUPABASE_SERVICE_ROLE_KEY: value })), [
      { name: 'SUPABASE_SERVICE_ROLE_KEY', reason: 'unresolved placeholder' },
    ]);
  }
});

test('dotenv quoting, comments and whitespace do not hide a sensitive marker', () => {
  assert.deepEqual(checkBuildEnv(`${envText(valid)}\n# ignored [SENSITIVE]\nexport EXTRA='[SENSITIVE]' # comment\r\n`), [
    { name: 'EXTRA', reason: 'unresolved sensitive marker' },
  ]);
  assert.deepEqual(checkBuildEnv(`${envText(valid)}\nEXTRA="prefix\\n[SENSITIVE]\\nsuffix"`), [
    { name: 'EXTRA', reason: 'unresolved sensitive marker' },
  ]);
});

test('real CLI handles an explicit path with spaces and never logs input values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wh-env-preflight-'));
  const path = join(dir, 'selected build input.env');
  const call = (args, env = {}) => spawnSync(process.execPath, [script, ...args], {
    cwd: dir, env, encoding: 'utf8', timeout: 5000,
  });
  try {
    writeFileSync(path, envText(valid));
    const good = call(['--build-env-file', path]);
    assert.equal(good.status, 0, good.stderr);
    const output = `${good.stdout}${good.stderr}`;
    for (const value of Object.values(valid)) assert.ok(!output.includes(value));
    writeFileSync(path, envText({ ...valid, UNRELATED_RUNTIME_SECRET: 'DO_NOT_LOG_THIS_[SENSITIVE]_VALUE' }));
    const bad = call(['--build-env-file', path]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /UNRELATED_RUNTIME_SECRET: unresolved sensitive marker/);
    assert.ok(!bad.stderr.includes('DO_NOT_LOG_THIS'));
    assert.ok(!bad.stderr.includes('[SENSITIVE]'));
    assert.equal(call(['--build-env-file', join(dir, 'absent')]).status, 2);
    assert.equal(call(['--prod']).status, 2);
    assert.equal(call(['--build-env-file', path, '--target=production']).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
