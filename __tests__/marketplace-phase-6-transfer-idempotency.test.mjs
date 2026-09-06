import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');
const api = await read('pages/api/store/diamond-transfer.js');
const wallet = await read('src/components/store/DiamondWalletModal.jsx');
const intentStoreSource = await read('src/lib/store/checkoutIntentStore.js');
const intentStore = await import(
  `data:text/javascript;base64,${Buffer.from(intentStoreSource).toString('base64')}`
);

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test('a transfer intent keeps one durable browser request key across retries', () => {
  const storage = memoryStorage();
  const options = {
    scope: 'diamond-transfer',
    userId: 'sender-a',
    paymentMethod: 'diamonds',
    intent: { recipientId: 'recipient-a', amount: 125 },
    storage,
    now: 1_800_000_000_000,
    requestIdFactory: scope => `${scope}-request-00000001`,
  };

  const first = intentStore.getOrCreateCommerceRequestId(options);
  const retry = intentStore.getOrCreateCommerceRequestId({
    ...options,
    now: options.now + 60_001,
    requestIdFactory: scope => `${scope}-request-00000002`,
  });
  assert.equal(retry, first);

  const changedAmount = intentStore.getOrCreateCommerceRequestId({
    ...options,
    intent: { recipientId: 'recipient-a', amount: 126 },
    requestIdFactory: scope => `${scope}-request-00000003`,
  });
  assert.notEqual(changedAmount, first);
});

test('the server transfer identity is stable and contains no clock bucket', () => {
  const functionSource = api.match(
    /function transferIdFor\(userId, recipientId, amount, idempotencyKey\) \{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(functionSource, 'transferIdFor must exist');
  const transferIdFor = new Function('createHash', `${functionSource}; return transferIdFor;`)(createHash);
  const first = transferIdFor('sender', 'recipient', 100, 'diamond-transfer-request-0001');
  const retry = transferIdFor('sender', 'recipient', 100, 'diamond-transfer-request-0001');
  assert.equal(retry, first);
  assert.notEqual(transferIdFor('sender', 'recipient', 101, 'diamond-transfer-request-0001'), first);
  assert.notEqual(transferIdFor('sender', 'recipient', 100, 'diamond-transfer-request-0002'), first);
  assert.doesNotMatch(functionSource, /Date\.now|Math\.floor|60_000|randomUUID/);
});

test('transfer settlement classification never credits after a null debit or refunds an ambiguous credit', () => {
  const debitSource = api.match(
    /function classifyTransferDebit\(result, error\) \{[\s\S]*?\n\}/
  )?.[0];
  const creditSource = api.match(
    /function classifyTransferCredit\(result, error, ledgerConfirmed = false\) \{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(debitSource && creditSource, 'pure settlement classifiers must be present');
  const classifyDebit = new Function(`${debitSource}; return classifyTransferDebit;`)();
  const classifyCredit = new Function(`${creditSource}; return classifyTransferCredit;`)();

  assert.equal(classifyDebit(null, null), 'pending');
  assert.equal(classifyDebit({ success: false }, null), 'rejected');
  assert.equal(classifyDebit({ success: true }, null), 'committed');
  assert.equal(classifyCredit(null, new Error('connection reset')), 'pending');
  assert.equal(classifyCredit(null, null), 'pending');
  assert.equal(classifyCredit({ success: false }, null), 'rejected');
  assert.equal(classifyCredit({ success: false }, null, true), 'committed');

  const nullDebitGuard = api.indexOf("if (debitState === 'pending')");
  const creditRpc = api.indexOf('const { data: creditResult', nullDebitGuard);
  assert.ok(nullDebitGuard > -1 && nullDebitGuard < creditRpc,
    'a null debit must return before the recipient credit RPC');
  const ambiguousCreditGuard = api.indexOf("if (creditState === 'pending')", creditRpc);
  const refundCall = api.indexOf('await refundSender(', ambiguousCreditGuard);
  assert.ok(ambiguousCreditGuard > creditRpc && ambiguousCreditGuard < refundCall,
    'an ambiguous credit must return pending before compensation');
});

test('the transfer API requires the durable key and resolves terminal replays before guards', () => {
  assert.match(api, /IDEMPOTENCY_KEY_RE/);
  assert.match(api, /req\.headers\['x-idempotency-key'\]/);
  assert.match(api, /INVALID_IDEMPOTENCY_KEY/);
  assert.match(api, /transfer_deduct_\$\{transferId\}/);
  assert.match(api, /transfer_\$\{transferId\}/);
  assert.match(api, /transfer_refund_\$\{transferId\}/);

  const replayLookup = api.indexOf(".from('diamond_transactions')", api.indexOf('const transferId ='));
  const earlyRateLimit = api.indexOf("scope: ':transfer-receipt'");
  const handlerAuth = api.indexOf('getServerUserWithFallback(req, getSupabase())', earlyRateLimit);
  const financialRateLimit = api.indexOf('if (!applyRateLimit', replayLookup);
  const friendshipGuard = api.indexOf('// ── Guard 1: Friendship verification');
  assert.ok(earlyRateLimit > -1 && earlyRateLimit < handlerAuth,
    'the receipt-tier limiter must protect authentication and replay reads');
  assert.ok(replayLookup > 0 && replayLookup < friendshipGuard);
  assert.ok(api.indexOf('if (completedReplay)') < friendshipGuard);
  assert.ok(api.indexOf('if (refundedReplay)') < friendshipGuard);
  assert.ok(financialRateLimit > api.indexOf('if (debitReplay)') && financialRateLimit < friendshipGuard);
  assert.match(api, /idempotencyTerminal: true/);
  assert.match(api, /TRANSFER_RECOVERY_PENDING/);
  assert.match(api, /Recover its missing credit directly/);
  assert.match(api, /newBalance: recoverySender\.diamonds \?\? 0/);
  assert.match(api, /MAX_TRANSFER_BODY_BYTES = 1_024/);
  assert.match(api, /Transfer Request Contains Unsupported Fields/);
  assert.doesNotMatch(api, /TRANSFER_IDEMPOTENCY_WINDOW_MS/);
});

test('normal completion and concurrent recovery reconcile each side effect exactly once', async () => {
  const displayStart = api.indexOf('function transferDisplayName(value)');
  const idStart = api.indexOf('function transferSideEffectId(transferId, kind)', displayStart);
  const classifyStart = api.indexOf('function classifyTransferDebit', idStart);
  const reconcileStart = api.indexOf('async function reconcileCompletedTransferSideEffects');
  const reconcileEnd = api.indexOf('\n\n// Phase 1:', reconcileStart);
  assert.ok(
    displayStart > -1 && idStart > displayStart && classifyStart > idStart
      && reconcileStart > classifyStart && reconcileEnd > reconcileStart,
    'deterministic side-effect helpers must remain independently testable'
  );

  const factory = new Function(
    'createHash',
    'getSupabase',
    `${api.slice(displayStart, idStart)}\n${api.slice(idStart, classifyStart)}\n`
      + `${api.slice(reconcileStart, reconcileEnd)}\n`
      + 'return { reconcileCompletedTransferSideEffects, transferSideEffectId };'
  );
  const { reconcileCompletedTransferSideEffects, transferSideEffectId } = factory(
    createHash,
    () => { throw new Error('the test must inject its database client'); }
  );

  const rows = new Map();
  const writes = [];
  const database = {
    from(table) {
      return {
        async upsert(row, options) {
          await Promise.resolve();
          writes.push({ table, row, options });
          const key = `${table}:${row.id}`;
          if (!rows.has(key)) rows.set(key, row);
          return { error: null };
        },
      };
    },
  };
  const effect = {
    userId: '00000000-0000-4000-8000-000000000001',
    recipientId: '00000000-0000-4000-8000-000000000002',
    amount: 125,
    clientIp: '203.0.113.9',
    senderName: 'VIP Pro',
    transferId: '0123456789abcdef0123456789abcdef',
  };

  await Promise.all([
    reconcileCompletedTransferSideEffects(effect, database),
    reconcileCompletedTransferSideEffects(effect, database),
    reconcileCompletedTransferSideEffects(effect, database),
  ]);

  assert.equal(rows.size, 2, 'one IP audit and one notification must survive concurrent replay');
  assert.equal(writes.length, 6, 'all three paths may attempt both conflict-safe writes');
  assert.ok(writes.every(write => write.options?.onConflict === 'id'));
  assert.ok(writes.every(write => write.options?.ignoreDuplicates === true));
  assert.equal(
    transferSideEffectId(effect.transferId, 'ip-audit'),
    transferSideEffectId(effect.transferId, 'ip-audit')
  );
  assert.notEqual(
    transferSideEffectId(effect.transferId, 'ip-audit'),
    transferSideEffectId(effect.transferId, 'notification')
  );
  const notification = rows.get(
    `notifications:${transferSideEffectId(effect.transferId, 'notification')}`
  );
  assert.equal(notification.data.transfer_id, effect.transferId);
  assert.match(notification.message, /^VIP Pro Sent You 125 Diamonds$/);

  assert.equal(
    [...api.matchAll(/await reconcileCompletedTransferSideEffects\(\{/g)].length,
    3,
    'receipt replay, orphan recovery, and normal completion must share one reconciler'
  );
});

test('the wallet retains ambiguous intents and clears only authoritative terminal results', () => {
  const start = wallet.indexOf('const handleTransfer = useCallback');
  const end = wallet.indexOf('\n  useEffect(() => {', start);
  const transfer = wallet.slice(start, end);
  assert.match(transfer, /getOrCreateCommerceRequestId\(transferIntent\)/);
  assert.match(transfer, /'X-Idempotency-Key': transferRequestId/);
  assert.match(transfer, /if \(data\.success\) \{\s*clearCommerceRequestId\(transferIntent\)/);
  assert.match(
    transfer,
    /if \(data\.idempotencyTerminal === true\) \{\s*clearCommerceRequestId\(transferIntent\)/
  );
  assert.doesNotMatch(transfer.match(/catch \(err\) \{[\s\S]*?\n    \} finally/)?.[0] || '', /clearCommerceRequestId/);
});
