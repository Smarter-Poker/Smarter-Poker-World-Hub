import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = file => readFileSync(join(ROOT, file), 'utf8');

test('Phase 6 warehouse operator consumers never use service-role PostgREST reads', () => {
  const rawWarehouseConsumers = [
    'scripts/examine-pio-structure.js',
    'scripts/analyze-pio-data.js',
    'scripts/verify-database.py',
    'src/lib/poker-engine/tests/check-horse-tables.js',
  ];
  for (const file of rawWarehouseConsumers) {
    const source = read(file);
    assert.doesNotMatch(source, /\.from\(['"](?:solved_spots_gold|memory_charts_gold)['"]\)/,
      `${file} must not query the warehouse through PostgREST`);
    assert.match(source, /SUPABASE_DB_PASSWORD|solver-operator-db|read-only operator/i,
      `${file} must identify its DB-owner/read-only path`);
  }
  assert.doesNotMatch(read('scripts/verify-database.py'), /SUPABASE_SERVICE_ROLE_KEY\s*\)/,
    'Python verifier must not accept a service-role credential');
});

test('deterministic trivia seeding splits operator warehouse reads from trivia target writes', () => {
  const source = read('scripts/trivia-deterministic-seed.js');
  assert.match(source, /querySolverWarehouse/);
  assert.match(source, /createSolverOperatorPool/);
  assert.match(source, /SUPABASE_DB_PASSWORD/);
  assert.match(source, /SOLVER_TABLE_COLUMNS/);
  assert.match(source, /SOLVER_TABLE_ORDER_BY/);
  assert.match(source, /ORDER BY \$\{orderBy\} ASC/,
    'warehouse offset pages must have a stable key order');
  assert.match(source, /select=id,subcategory&order=id\.asc\$\{cursor\}&limit=1000/,
    'trivia dedupe pages must use a stable keyset cursor');
  assert.match(source, /select=id,question&order=id\.asc\$\{cursor\}&limit=1000/,
    'servable-question pages must use a stable keyset cursor');
  assert.match(source, /source pool could not satisfy requested difficulty mix/,
    'partial generation must fail instead of reporting a successful target fill');
  assert.match(source, /category seed operation\(s\) failed/,
    'the process must exit unsuccessfully when any requested category fails');
  assert.match(source, /if \(Object\.prototype\.hasOwnProperty\.call\(SOLVER_TABLE_COLUMNS, table\)\)/);
  assert.doesNotMatch(source, /rest\/v1\/solved_spots_gold/);
  assert.doesNotMatch(source, /rest\/v1\/memory_charts_gold/);
  assert.match(read('scripts/trivia-pool-report.js'), /SUPABASE_DB_PASSWORD/,
    'pool guidance must tell operators why deterministic fills need DB-owner access');
});

test('live catalog audit has no service-role fallback and only allowlists the catalog RPC', () => {
  const source = read('scripts/training-live-catalog-audit.js');
  assert.match(source, /TRAINING_AUDIT_DB_PASSWORD_REQUIRED/);
  assert.match(source, /read-only-postgres \+ catalog-rpc/);
  assert.match(source, /createSolverOperatorPool/);
  assert.doesNotMatch(source, /rejectUnauthorized:\s*false/,
    'operator-password TLS must verify the server certificate');
  assert.match(source, /name !== 'training_solver_spot_candidates_v1'/);
  assert.doesNotMatch(source, /source: 'supabase-rest'/);
  assert.doesNotMatch(source, /if \(process\.env\.SUPABASE_DB_PASSWORD\) \{[\s\S]*?return \{[\s\S]*?source: 'read-only-postgres'[\s\S]*?\};\s*\}/);
});

test('operator helper fails closed without DB password and enforces read-only mode', () => {
  const source = read('scripts/lib/solver-operator-db.js');
  assert.match(source, /SUPABASE_DB_PASSWORD/);
  assert.match(source, /default_transaction_read_only=on/);
  assert.match(source, /rejectUnauthorized:\s*true/);
  assert.match(source, /Operator diagnostics must not use the service-role key/i);
  assert.match(source, /rollback[\s*]+compatibility/i,
    'helper must describe the temporary read grant honestly');
  assert.match(source, /\.supabase\\\.co/,
    'the project URL must be pinned to the Supabase origin shape before deriving a DB host');
});

test('database verifier fails instead of reporting success when required tables are absent', () => {
  const source = read('scripts/verify-database.py');
  assert.match(source, /Required solver warehouse tables are missing/);
  assert.match(source, /sslmode.*verify-full/);
  assert.match(source, /supabase\\\.co/,
    'Python verifier must validate the URL origin before deriving a DB host');
  assert.match(source, /table_names != expected_tables/);
  assert.match(source, /has no indexes/);
  assert.match(source, /Required solver warehouse tables are empty/);
});

test('PIO analyzer uses the current memory chart schema', () => {
  const source = read('scripts/analyze-pio-data.js');
  assert.match(source, /chart_id/);
  assert.match(source, /hand_matrix/);
  assert.doesNotMatch(source, /chart_name|chart_grid/,
    'analyzer must not query the retired chart_name/chart_grid columns');
});

test('operator diagnostics do not silently truncate or skip required warehouse checks', () => {
  assert.doesNotMatch(read('scripts/analyze-pio-data.js'), /memory_charts_gold[^;]+LIMIT 10000/s);
  const horseProbe = read('src/lib/poker-engine/tests/check-horse-tables.js');
  assert.match(horseProbe, /throw error/);
  assert.match(horseProbe, /process\.exitCode = 1/);
  assert.doesNotMatch(horseProbe, /\/Users\/smarter\.poker/,
    'diagnostics must not depend on one workstation path');
  assert.doesNotMatch(read('scripts/examine-pio-structure.js'), /\.gemini\/antigravity\/brain/);
  assert.match(read('scripts/examine-pio-structure.js'), /PIO_STRUCTURE_OUTPUT/);
});
