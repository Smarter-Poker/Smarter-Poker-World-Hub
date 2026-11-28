import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditMigration } from '../scripts/ci/check-explicit-table-access.mjs';
const boundary = `REVOKE ALL ON TABLE public.example FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;`;
test('implicit grants fail even when an RLS policy exists', () => {
  assert.equal(auditMigration('CREATE TABLE public.example(id integer); CREATE POLICY own ON public.example USING (true);').length, 5);
});
test('explicit service-only, browser-read-only and RPC-only boundaries pass', () => {
  for (const grant of ['', 'GRANT INSERT ON public.example TO service_role;', 'GRANT SELECT(id) ON public.example TO authenticated;'])
    assert.deepEqual(auditMigration(`CREATE TABLE public.example(id integer); ${boundary} ${grant}`), []);
});
test('PUBLIC revoke alone never substitutes for the three named roles', () => {
  assert.equal(auditMigration('CREATE TABLE example(id integer); REVOKE ALL ON example FROM PUBLIC; ALTER TABLE example ENABLE ROW LEVEL SECURITY;').length, 3);
});
test('comments, strings and temporary tables cannot create false findings', () => {
  assert.deepEqual(auditMigration(`-- CREATE TABLE public.fake(id int);
/* nested /* CREATE TABLE public.fake2(id int); */ ignored */
SELECT 'CREATE TABLE public.fake3(id int);';

CREATE TEMP TABLE public.temporary(id int); CREATE TABLE private.hidden(id int);`), []);
});
test('quoted names, multiple relations and split revoke statements are recognized', () => {
  assert.deepEqual(auditMigration(`CREATE TABLE "public"."example"(id int);
REVOKE ALL PRIVILEGES ON TABLE public.other, "public"."example" FROM PUBLIC;
REVOKE ALL ON example FROM anon, authenticated, service_role;
ALTER TABLE "public"."example" ENABLE ROW LEVEL SECURITY;`), []);
});
test('every created table needs its own boundary', () => {
  assert.equal(auditMigration(`CREATE TABLE example(id int); CREATE TABLE missed(id int); ${boundary}`).length, 5);
});

test('executable table DDL inside DO bodies is checked', () => {
  assert.equal(auditMigration('DO $body$ BEGIN CREATE TABLE public.dynamic(id int); END $body$;').length, 5);
});

test('an uncalled stored function cannot supply a table boundary', () => {
  assert.equal(auditMigration(`CREATE TABLE public.example(id int);
CREATE FUNCTION later() RETURNS void LANGUAGE sql AS $$ ${boundary} $$;`).length, 5);
});

test('views and materialized views declare explicit access without table RLS', () => {
  for (const ddl of ['CREATE VIEW', 'CREATE OR REPLACE VIEW', 'CREATE MATERIALIZED VIEW']) {
    assert.equal(auditMigration(`${ddl} public.example AS SELECT 1 AS id;`).length, 4);
    assert.deepEqual(auditMigration(`${ddl} public.example AS SELECT 1 AS id; REVOKE ALL ON public.example FROM PUBLIC, anon, authenticated, service_role; GRANT SELECT ON public.example TO service_role;`), []);
  }
});
test('temporary views and non-public relations do not need API exposure declarations', () => {
  assert.deepEqual(auditMigration('CREATE TEMP VIEW example AS SELECT 1; CREATE VIEW private.example AS SELECT 1;'), []);
});

test('a later migration in the same change can complete an installed table\'s boundary, never an earlier one', () => {
  const created = `CREATE TABLE public.example(id int);
REVOKE ALL ON TABLE public.example FROM PUBLIC, anon, authenticated;
ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;`;
  assert.equal(auditMigration(created).length, 1);
  assert.deepEqual(auditMigration(created, { laterSql: 'REVOKE ALL ON TABLE public.example FROM service_role;' }), []);
  // A later file cannot switch on RLS for the creation file.
  assert.equal(auditMigration('CREATE TABLE public.example(id int);', { laterSql: boundary }).length, 1);
  // Later text inside a function body or a comment does not count.
  assert.equal(auditMigration(created, { laterSql: '-- REVOKE ALL ON public.example FROM service_role;' }).length, 1);
  assert.equal(auditMigration(created, { laterSql: 'CREATE FUNCTION f() RETURNS void LANGUAGE sql AS $$ REVOKE ALL ON public.example FROM service_role $$;' }).length, 1);
});

test('a later revoke only counts for the exact table and the exact roles it names', () => {
  const created = `CREATE TABLE public.example(id int);
REVOKE ALL ON TABLE public.example FROM PUBLIC, anon, authenticated;
ALTER TABLE public.example ENABLE ROW LEVEL SECURITY;`;
  // A different table, a different schema, or a different role leaves the finding.
  assert.equal(auditMigration(created, { laterSql: 'REVOKE ALL ON TABLE public.other FROM service_role;' }).length, 1);
  assert.equal(auditMigration(created, { laterSql: 'REVOKE ALL ON TABLE private.example FROM service_role;' }).length, 1);
  assert.equal(auditMigration(created, { laterSql: 'REVOKE ALL ON TABLE public.example FROM anon;' }).length, 1);
  // A partial revoke is not REVOKE ALL.
  assert.equal(auditMigration(created, { laterSql: 'REVOKE INSERT ON TABLE public.example FROM service_role;' }).length, 1);
  // A revoke that is not part of this change (another PR, already on main) is never passed in.
  assert.equal(auditMigration(created, { laterSql: '' }).length, 1);
});

test('the CLI hands each migration only the migrations after it in the same change', () => {
  const cli = fs.readFileSync(new URL('../scripts/ci/check-explicit-table-access.mjs', import.meta.url), 'utf8');
  assert.match(cli, /`\$\{base\}\.\.\.HEAD`, '--', 'supabase\/migrations'/);
  assert.match(cli, /\.filter\(path => path\.endsWith\('\.sql'\)\)\.sort\(\);/);
  assert.match(cli, /paths\.slice\(index \+ 1\)/);
});
