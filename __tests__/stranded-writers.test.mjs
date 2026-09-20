import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function scan(t, files, stranded = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'stranded-writer-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(name, value) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value);
  }
  // Exercise the real scanner CLI and parser against an isolated source tree.
  // These files are never imported/executed as application or SQL code.
  for (const name of ['scripts/ci/check-stranded-writers.mjs', 'scripts/ci/lib/from-calls.mjs']) {
    write(name, readFileSync(path.join(REPO, name)));
  }
  write('scripts/ci/supabase-invariants.allowlist.json', JSON.stringify({
    stranded_writers: stranded, phantom_tables: {},
  }));
  for (const [name, value] of Object.entries(files)) write(name, value);
  const result = spawnSync(process.execPath, ['scripts/ci/check-stranded-writers.mjs', '--json'], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH || '' },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return { status: result.status, ...JSON.parse(result.stdout) };
}

for (const fixturePath of [
  'scripts/ci/probes/owner-operational-notification/inputs/schema.sql',
  'scripts/qualification/owner-operational-notification-destination.sql',
]) {
  test(`${fixturePath} cannot invent production supply or invalidate an external-writer allowlist`, t => {
    const result = scan(t, {
      'src/services/example.js': "db.from('external_supply').select('*'); db.from('missing_supply').select('*');",
      [fixturePath]: 'CREATE FUNCTION fixture_only() RETURNS void AS $$ BEGIN INSERT INTO public.external_supply(id) VALUES (1); INSERT INTO public.missing_supply(id) VALUES (1); END; $$ LANGUAGE plpgsql;',
    }, { external_supply: 'Verified external writer; isolated fixture is not that writer.' });
    assert.equal(result.status, 1);
    assert.deepEqual(result.staleAllow, []);
    assert.deepEqual(result.stranded.map(row => row.table), ['missing_supply']);
    assert.deepEqual(result.clientOnly, []);
  });
}

for (const writerPath of [
  'pages/api/writer.js', 'server/writer.js', 'scripts/operations/writer.mjs',
  'supabase/migrations/20260917000000_writer.sql', 'supabase/components/writer.sql',
  'scripts/ci/probes-production/writer.sql',
]) {
  test(`real write in ${writerPath} still satisfies a service reader`, t => {
    const result = scan(t, {
      'src/services/example.js': "db.from('actual_supply').select('*');",
      [writerPath]: writerPath.endsWith('.sql')
        ? 'INSERT INTO public.actual_supply(id) VALUES (1);'
        : "db.from('actual_supply').insert({ id: 1 });",
    });
    assert.equal(result.status, 0);
    assert.deepEqual(result.stranded, []);
    assert.deepEqual(result.staleAllow, []);
    assert.deepEqual(result.clientOnly, []);
  });
}

test('a genuine production writer still makes its existing allowlist entry stale', t => {
  const result = scan(t, {
    'src/services/example.js': "db.from('actual_supply').select('*');",
    'supabase/migrations/20260917000000_writer.sql': 'INSERT INTO public.actual_supply(id) VALUES (1);',
  }, { actual_supply: 'An old external-writer exception.' });
  assert.equal(result.status, 1);
  assert.deepEqual(result.stranded, []);
  assert.deepEqual(result.staleAllow, ['actual_supply']);
});

test('an isolated SQL fixture cannot disguise a client-only write as server supply', t => {
  const result = scan(t, {
    'src/services/example.js': "db.from('client_supply').select('*');",
    'src/components/Writer.jsx': "db.from('client_supply').upsert({ id: 1 });",
    'scripts/ci/probes/example/fixture.sql': 'UPDATE public.client_supply SET id = 1;',
  });
  assert.equal(result.status, 0);
  assert.deepEqual(result.stranded, []);
  assert.deepEqual(result.staleAllow, []);
  assert.deepEqual(result.clientOnly.map(row => row.table), ['client_supply']);
});

test('an ordinary service reader without any writer still fails', t => {
  const result = scan(t, { 'src/services/example.js': "db.from('missing_supply').select('*');" });
  assert.equal(result.status, 1);
  assert.deepEqual(result.stranded.map(row => row.table), ['missing_supply']);
  assert.deepEqual(result.staleAllow, []);
});
