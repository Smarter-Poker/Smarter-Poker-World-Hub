import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECEIPT_UNASSIGN } from '../src/lib/bankroll/receiptGallery.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('deleting a ledger entry sends receipts filed to it back to Receipts Waiting', () => {
  const source = read('src/lib/bankroll/bankrollSelectors.ts');
  const start = source.indexOf('export async function deleteLedgerEntry');
  assert.ok(start >= 0, 'deleteLedgerEntry exists');
  const body = source.slice(start, source.indexOf('\n}\n', start));
  const deleteAt = body.indexOf(".delete()");
  const releaseAt = body.indexOf(".from('bankroll_receipts')");
  assert.ok(deleteAt >= 0 && releaseAt > deleteAt, 'receipts are released after the entry delete succeeds');
  assert.match(body.slice(releaseAt), /\.update\(RECEIPT_UNASSIGN\)[\s\S]*\.eq\('user_id', userId\)[\s\S]*\.eq\('assigned_id', entryId\)/);
  assert.deepEqual({ ...RECEIPT_UNASSIGN }, { status: 'unassigned', assigned_kind: null, assigned_id: null, assigned_at: null });
});

test('the log form "new trip" link opens a view the page actually resolves', () => {
  const modal = read('src/components/bankroll/LogEntryModal.jsx');
  const views = [...modal.matchAll(/bankroll-manager\?view=([a-z-]+)/g)].map((m) => m[1]);
  assert.ok(views.includes('trips'));
  const page = read('pages/hub/bankroll-manager.js');
  for (const view of views) assert.match(page, new RegExp("id: '" + view + "'"), view + ' is a real section');
});
