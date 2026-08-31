import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('push receipts confirm only the exact endpoint and preserve identical device signatures', async () => {
  const migration = await readFile('supabase/migrations/20260901030900_safe_push_receipt_confirmation.sql', 'utf8');
  assert.match(migration, /confirm_push_subscription_receipt/);
  assert.match(migration, /WHERE endpoint = p_endpoint/);
  assert.match(migration, /AND is_active/);
  assert.doesNotMatch(migration, /device_label|user_agent|older\./);
  assert.match(migration, /REVOKE ALL.+FROM anon/);
  assert.match(migration, /REVOKE ALL.+FROM authenticated/);
  assert.match(migration, /GRANT EXECUTE.+TO service_role/);
});

test('receipt endpoint uses the atomic reconciliation RPC', async () => {
  const source = await readFile('pages/api/push/receipt.js', 'utf8');
  assert.match(source, /\.rpc\('confirm_push_subscription_receipt', \{ p_endpoint: endpoint \}\)/);
  assert.match(source, /const \{ error \} = await getSupabase\(\)\.rpc/);
  assert.match(source, /if \(error\) console\.warn/);
  assert.doesNotMatch(source, /\.update\(\{ last_receipt_at:/);
});
