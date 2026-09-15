import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const entry = fileURLToPath(new URL('../scripts/vercel-build.mjs', import.meta.url));
const values = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture_not_a_credential',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture_not_a_credential',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'fixture_public_vapid_not_a_credential',
};
const expected = [
  'node scripts/copy-reader-assets.mjs',
  'bash scripts/prune-platform-bins.sh',
  'node scripts/patch-next.js',
  'npm run test:marketplace',
  'npm run test:training:phase6-authority',
  'next build --webpack',
];

function fixture({ metadata = { target: 'production' }, input = values, env = {}, fail = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wh-vercel-entry-'));
  try {
    mkdirSync(join(dir, '.vercel/output'), { recursive: true });
    mkdirSync(join(dir, 'bin'));
    if (metadata !== null) writeFileSync(join(dir, '.vercel/output/builds.json'),
      typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    if (input !== null) writeFileSync(join(dir, '.vercel/.env.production.local'),
      Object.entries(input).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n'));
    // Real entry and shell chain; only the six application commands are inert
    // fixture executables. No npm, dependency install, app build or credential.
    for (const name of ['node', 'bash', 'npm', 'next']) {
      writeFileSync(join(dir, 'bin', name), `#!/bin/sh
stage='${name}'" $*"
printf '%s\\n' "$stage" >> "$FIXTURE_LOG"
[ "$stage" != "$FIXTURE_FAIL" ] || exit 17
if [ '${name}' = next ]; then
  [ "$NODE_OPTIONS" = '--max-old-space-size=7168' ] || exit 18
  [ "$FIXTURE_PASSTHROUGH" = kept ] || exit 19
  printf 'fixture-next-stdout\\n'
  printf 'fixture-next-stderr\\n' >&2
fi
`, { mode: 0o700 });
    }
    const result = spawnSync(process.execPath, [entry], {
      cwd: dir,
      env: { PATH: join(dir, 'bin'), FIXTURE_LOG: join(dir, 'calls'), FIXTURE_FAIL: fail,
        FIXTURE_PASSTHROUGH: 'kept', ...input, ...env },
      encoding: 'utf8', timeout: 5000,
    });
    const calls = existsSync(join(dir, 'calls'))
      ? readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n') : [];
    return { ...result, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('actual production entry rejects redaction before the first command regardless of VERCEL_ENV', () => {
  const result = fixture({ input: { ...values, SUPABASE_SERVICE_ROLE_KEY: '[SENSITIVE]' },
    env: { VERCEL_ENV: 'preview' } });
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /SUPABASE_SERVICE_ROLE_KEY: unresolved sensitive marker/);
  assert.ok(!result.stderr.includes('[SENSITIVE]'));
});

test('actual valid production entry retains every original command, environment and stdio', () => {
  const result = fixture();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, expected);
  assert.match(result.stdout, /fixture-next-stdout/);
  assert.match(result.stderr, /fixture-next-stderr/);
});

test('preview keeps the original chain without a production env file or production guard', () => {
  const result = fixture({ metadata: { target: 'preview' }, input: null,
    env: { VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: '[SENSITIVE]' } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, expected);
  assert.doesNotMatch(result.stdout, /preflight passed/);
});

test('missing, malformed or unsupported target/output refuses before any command', () => {
  for (const metadata of [null, '{invalid json', {}, { target: 1 }, { target: '' },
    { target: 'production', argv: ['vercel', 'build', '--output', 'elsewhere'] },
    { target: 'production', argv: ['vercel', 'build', '--output=elsewhere'] }]) {
    const result = fixture({ metadata });
    assert.equal(result.status, 2);
    assert.deepEqual(result.calls, []);
    assert.match(result.stderr, /Local build refused:/);
  }
});

test('an original command failure retains its exit status and stops the shell chain', () => {
  const result = fixture({ fail: expected[1] });
  assert.equal(result.status, 17);
  assert.deepEqual(result.calls, expected.slice(0, 2));
});


test('pre-push webpack guard follows the actual entry and refuses missing or unsafe commands', () => {
  const hook = readFileSync(new URL('../scripts/hooks/pre-push-js-safety.sh', import.meta.url), 'utf8');
  const start = hook.indexOf('# 11a ');
  const end = hook.indexOf('# 11b ', start);
  assert.ok(start >= 0 && end > start);
  const block = hook.slice(start, end);
  const dir = mkdtempSync(join(tmpdir(), 'wh-prepush-entry-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'node_modules/next'), { recursive: true });
    writeFileSync(join(dir, 'node_modules/next/package.json'), JSON.stringify({ version: '16.0.0' }));
    writeFileSync(join(dir, 'vercel.json'), JSON.stringify({ buildCommand: 'node scripts/vercel-build.mjs' }));
    for (const [command, valid] of [['next build --webpack', true], ['next build', false], [null, false]]) {
      const module = join(dir, 'scripts/vercel-build.mjs');
      if (command === null) rmSync(module);
      else writeFileSync(module, `export const BUILD_COMMAND = ${JSON.stringify(command)};`);
      const result = spawnSync('/bin/bash', ['-c', `ERRORS=0; NEXTJS_CONFIG_ERRORS=0;
${block}
exit "$ERRORS"`], {
        cwd: dir, encoding: 'utf8', timeout: 5000,
        env: { PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf('/'))}:/usr/bin:/bin` },
      });
      assert.equal(result.status, valid ? 0 : 1, result.stdout + result.stderr);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
