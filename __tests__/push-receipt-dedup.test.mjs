import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('push receipts atomically retire only older unconfirmed duplicate signatures', async () => {
  const migration = await readFile('supabase/migrations/20260831162000_confirmed_push_receipt_dedup.sql', 'utf8');
  assert.match(migration, /confirm_push_subscription_receipt/);
  assert.match(migration, /older\.last_receipt_at IS NULL/);
  assert.match(migration, /older\.created_at < v_current\.created_at/);
  assert.match(migration, /older\.device_label IS NOT DISTINCT FROM v_current\.device_label/);
  assert.match(migration, /older\.user_agent IS NOT DISTINCT FROM v_current\.user_agent/);
  assert.match(migration, /last_failure_reason = 'superseded_by_confirmed_device'/);
});

test('receipt endpoint uses the atomic reconciliation RPC', async () => {
  const source = await readFile('pages/api/push/receipt.js', 'utf8');
  assert.match(source, /\.rpc\('confirm_push_subscription_receipt', \{ p_endpoint: endpoint \}\)/);
  assert.doesNotMatch(source, /\.update\(\{ last_receipt_at:/);
});
