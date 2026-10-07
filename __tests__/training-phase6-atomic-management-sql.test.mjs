import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { bindAtomicSql, buildAtomicReadOnlySql, buildAtomicNegativeSql, parseAtomicManagementRows } from '../scripts/lib/phase6AtomicManagementSql.mjs';

test('atomic values are escaped and incomplete or noninteger inputs fail closed', () => {
  assert.equal(bindAtomicSql('SELECT $1, $10', ["a'b", 2,3,4,5,6,7,8,9,'ten']), "SELECT E'a''b', E'ten'");
  assert.throws(() => bindAtomicSql('$2', ['one']));
  assert.throws(() => bindAtomicSql('$1', [NaN]));
  assert.throws(() => bindAtomicSql('$1', [{}]));
});
test('read-only envelope uses one transaction and a real final rollback, never separate HTTP transactions', () => {
  const sql = buildAtomicReadOnlySql([{key:'mode',text:"SELECT current_setting('transaction_read_only') AS mode",params:[]}]);
  assert.match(sql, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql, /AS "phase6AtomicResult";\nROLLBACK;/);
  assert.throws(() => buildAtomicReadOnlySql([{key:'evil',text:'UPDATE table SET x=1'}]));
});
test('unreadable, truncated and additional results cannot become proof', () => {
  assert.throws(() => parseAtomicManagementRows([], ['six']));
  assert.throws(() => parseAtomicManagementRows([{phase6AtomicResult:{}}], ['six']));
  assert.throws(() => parseAtomicManagementRows([{phase6AtomicResult:{six:[]},extra:true}], ['six']));
  assert.deepEqual(parseAtomicManagementRows([{phase6AtomicResult:{six:[]}}], ['six']), {six:[]});
});
test('negative probes must contain six distinct reviewed entries', () => {
  assert.throws(() => buildAtomicNegativeSql([]));
});
test('required Safety runs the unit contracts and genuine PG17 rollback behavior', () => {
  const workflow=readFileSync(new URL('../.github/workflows/build-safety-gate.yml',import.meta.url),'utf8');
  assert.match(workflow,/run: node --test __tests__\/training-phase6-atomic-management-sql\.test\.mjs/);
  const behavioral='run: node scripts/qualify-phase6-atomic-management-pg17.mjs';
  assert.ok(workflow.indexOf(behavioral)>workflow.indexOf('echo "PHASE6_POSTGRES_BIN=$postgres_bin"'));
  assert.match(workflow,/name: Training Phase 6 Atomic Management PostgreSQL Rollback Authority\n\s+run: node scripts\/qualify-phase6-atomic-management-pg17\.mjs/);
});
