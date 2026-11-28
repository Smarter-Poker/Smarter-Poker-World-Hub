// Import Sessions saves rows in batches (2026-11-28). external_ref is unique
// per player, so a batch refused with 23505 on external_ref is retried row by
// row and the rows already there count as already imported, never twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertInBatches, isExternalRefConflict } from '../src/lib/bankroll/ledgerBatch.mjs';

const CONFLICT = { code: '23505', message: 'duplicate key value violates unique constraint "bankroll_ledger_user_external_ref_key"', details: 'Key (user_id, external_ref)=(u, csv:imp-20261128-abcdef:3) already exists.' };

function fakeLedger(existingRefs = []) {
  const refs = new Set(existingRefs);
  const calls = [];
  const insert = async (rows) => {
    calls.push(rows.length);
    if (rows.some((r) => refs.has(r.external_ref))) return { data: null, error: CONFLICT };
    for (const r of rows) refs.add(r.external_ref);
    return { data: rows.map((r) => ({ id: 'id-' + r.external_ref, category: r.category })), error: null };
  };
  return { insert, calls, refs };
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({ external_ref: `csv:imp-20261128-abcdef:${i + 2}`, category: 'poker_cash' }));

test('rows past 1,000 are saved in batches of 100 with progress', async () => {
  const db = fakeLedger();
  const progress = [];
  const result = await insertInBatches(rows(1234), db.insert, { onProgress: (d) => progress.push(d) });
  assert.equal(result.saved.length, 1234);
  assert.equal(result.alreadyImported, 0);
  assert.equal(db.calls.length, 13);
  assert.equal(progress.at(-1), 1234);
});

test('a 23505 on external_ref means already imported: the rest of that batch is still saved', async () => {
  const db = fakeLedger(['csv:imp-20261128-abcdef:5', 'csv:imp-20261128-abcdef:150']);
  const result = await insertInBatches(rows(200), db.insert);
  assert.equal(result.saved.length, 198);
  assert.equal(result.alreadyImported, 2);
  assert.equal(new Set(result.saved.map((r) => r.id)).size, 198, 'nothing saved twice');
});

test('any other failure stops and says how far it got', async () => {
  let n = 0;
  const insert = async (batch) => (++n === 3 ? { data: null, error: { code: '42501', message: 'denied' } } : { data: batch.map((r) => ({ id: r.external_ref })), error: null });
  await assert.rejects(insertInBatches(rows(500), insert), (e) => e.saved.length === 200 && e.message === 'denied');
  const short = async (batch) => ({ data: batch.slice(1), error: null });
  await assert.rejects(insertInBatches(rows(5), short), /Some Rows Were Not Saved/);
});

test('only an external_ref unique violation is treated as already imported', () => {
  assert.equal(isExternalRefConflict(CONFLICT), true);
  assert.equal(isExternalRefConflict({ code: '23505', message: 'duplicate key', details: 'Key (id)=(x) already exists.' }), false);
  assert.equal(isExternalRefConflict({ code: '23503', message: 'external_ref' }), false);
});
