import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const LEGACY_PATH = 'scripts/ingest_god_mode.py';
const LEGACY_SOURCE = readFileSync(LEGACY_PATH, 'utf8');
const WINDOWS_GUIDE = readFileSync('scripts/WINDOWS_DEPLOYMENT.txt', 'utf8');
const WINDOWS_CHECK = readFileSync('scripts/windows-setup.bat', 'utf8');
const FORBIDDEN_WORKER_DATABASE_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY',
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'FALLBACK_SUPABASE_URL', 'SUPABASE_URL_FALLBACK', 'SUPABASE_URL_WITH_PASS',
  'SUPABASE_DB_URL',
  'SUPABASE_CONNECTION_POOL_URL', 'SUPABASE_DB_HOST', 'SUPABASE_DB_PORT',
  'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_NAME',
  'SUPABASE_DB_SSL', 'SUPABASE_DB_CA', 'SUPABASE_JWT_SECRET',
  'SUPABASE_PROJECT_REF', 'DATABASE_URL', 'DIRECT_URL',
  'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PASSWORD', 'PG_PASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE',
  'PGUSER', 'PGPASSWORD',
];

test('retired God Mode ingest exits before importing a client or touching solver data', () => {
  assert.match(LEGACY_SOURCE, /RETIRED_UNSAFE_SOLVER_INGEST/);
  assert.match(LEGACY_SOURCE, /scripts\/preflop-deep\/run_machine\.py/);
  assert.doesNotMatch(LEGACY_SOURCE, /(?:from|import)\s+supabase|create_client|\.table\s*\(|\.insert\s*\(/);
  assert.doesNotMatch(LEGACY_SOURCE, /urllib|requests|socket|solved_spots_gold/);

  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'sp-retired-solver-ingest-'));
  const importedMarker = path.join(fixtureRoot, 'supabase-imported');
  try {
    writeFileSync(path.join(fixtureRoot, 'supabase.py'), [
      'from pathlib import Path',
      `Path(${JSON.stringify(importedMarker)}).write_text("unsafe import", encoding="utf-8")`,
      'raise RuntimeError("retired script imported Supabase")',
      '',
    ].join('\n'));
    const result = spawnSync('python3', [LEGACY_PATH, fixtureRoot], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: fixtureRoot,
        SUPABASE_URL: 'https://127.0.0.1:9',
        SUPABASE_KEY: 'offline-regression-value',
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /RETIRED_UNSAFE_SOLVER_INGEST/);
    assert.match(`${result.stdout}\n${result.stderr}`, /preflop-deep\/run_machine\.py/);
    assert.equal(existsSync(importedMarker), false, 'the retired path imported a database client');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Windows solver deployment is HMAC-gateway-only and never provisions database access', () => {
  const combined = `${WINDOWS_GUIDE}\n${WINDOWS_CHECK}`;
  for (const required of [
    'SOLVER_WORKER_API_URL',
    'SOLVER_WORKER_HMAC_SECRET',
    'APPROVED_PIO_BINARY_CHECKSUM',
    'PIPELINE_COMMIT',
    'APPROVED_MANIFEST_CHECKSUM',
    'RANGE_DIRECTORY',
    'scripts\\preflop-deep\\run_machine.py',
  ]) assert.match(combined, new RegExp(required.replace(/\\/g, '\\\\')));

  for (const name of FORBIDDEN_WORKER_DATABASE_ENV) {
    assert.match(
      WINDOWS_CHECK,
      new RegExp(`^if defined ${name} goto :legacy_database_setting$`, 'm'),
      `${name} can bypass the Windows legacy-database preflight`,
    );
  }
  assert.doesNotMatch(combined, /setx\s+(?:SUPABASE|SOLVER_WORKER_HMAC_SECRET)/i);
  assert.doesNotMatch(combined, /\$env:SUPABASE|create_client|pip\s+install[^\r\n]*supabase/i);
  assert.doesNotMatch(combined, /SUPABASE_(?:SERVICE_ROLE_KEY|KEY|URL|ANON_KEY)\s*=/i);
  assert.doesNotMatch(combined, /python\s+(?:\.\\)?ingest_god_mode\.py/i);
  assert.doesNotMatch(combined, /eyJ[a-zA-Z0-9_-]{20,}/, 'a JWT-like credential remains in worker docs');
});
