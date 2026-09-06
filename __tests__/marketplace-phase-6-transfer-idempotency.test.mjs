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

function sideEffectDatabase(seed = {}, readErrors = new Set()) {
  const rows = new Map([
    ['anti_farming_ips', [...(seed.anti_farming_ips || [])]],
    ['notifications', [...(seed.notifications || [])]],
  ]);
  const writes = [];

  function matches(row, filter) {
    const value = row[filter.column];
    if (filter.kind === 'eq') return value === filter.value;
    if (filter.kind === 'gte') return String(value) >= String(filter.value);
    if (filter.kind === 'lte') return String(value) <= String(filter.value);
    if (filter.kind === 'contains') {
      return Object.entries(filter.value).every(([key, expected]) => value?.[key] === expected);
    }
    throw new Error(`Unsupported Filter: ${filter.kind}`);
  }

  return {
    rows,
    writes,
    from(table) {
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push({ kind: 'eq', column, value }); return builder; },
        gte(column, value) { filters.push({ kind: 'gte', column, value }); return builder; },
        lte(column, value) { filters.push({ kind: 'lte', column, value }); return builder; },
        contains(column, value) { filters.push({ kind: 'contains', column, value }); return builder; },
        async limit(count) {
          if (readErrors.has(table)) {
            return { data: null, error: { message: `${table} Read Failed` } };
          }
          return {
            data: (rows.get(table) || [])
              .filter(row => filters.every(filter => matches(row, filter)))
              .slice(0, count),
            error: null,
          };
        },
        async upsert(row, options) {
          await Promise.resolve();
          writes.push({ table, row, options });
          const tableRows = rows.get(table) || [];
          if (!tableRows.some(existing => existing.id === row.id)) tableRows.push(row);
          rows.set(table, tableRows);
          return { error: null };
        },
      };
      return builder;
    },
  };
}

function transferSideEffectHarness() {
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

  return new Function(
    'createHash',
    'getSupabase',
    'LEGACY_SIDE_EFFECT_WINDOW_MS',
    `${api.slice(displayStart, idStart)}\n${api.slice(idStart, classifyStart)}\n`
      + `${api.slice(reconcileStart, reconcileEnd)}\n`
      + 'return { reconcileCompletedTransferSideEffects, transferSideEffectId };'
  )(
    createHash,
    () => { throw new Error('the test must inject its database client'); },
    60_000
  );
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
  const { reconcileCompletedTransferSideEffects, transferSideEffectId } = transferSideEffectHarness();
  const database = sideEffectDatabase();
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

  assert.equal(
    [...database.rows.values()].flat().length,
    2,
    'one IP audit and one notification must survive concurrent replay'
  );
  assert.equal(database.writes.length, 6, 'all three paths may attempt both conflict-safe writes');
  assert.ok(database.writes.every(write => write.options?.onConflict === 'id'));
  assert.ok(database.writes.every(write => write.options?.ignoreDuplicates === true));
  assert.equal(
    transferSideEffectId(effect.transferId, 'ip-audit'),
    transferSideEffectId(effect.transferId, 'ip-audit')
  );
  assert.notEqual(
    transferSideEffectId(effect.transferId, 'ip-audit'),
    transferSideEffectId(effect.transferId, 'notification')
  );
  const notification = database.rows.get('notifications').find(
    row => row.id === transferSideEffectId(effect.transferId, 'notification')
  );
  assert.equal(notification.data.transfer_id, effect.transferId);
  assert.match(notification.message, /^VIP Pro Sent You 125 Diamonds$/);

  assert.equal(
    [...api.matchAll(/await reconcileCompletedTransferSideEffects\(\{/g)].length,
    3,
    'receipt replay, orphan recovery, and normal completion must share one reconciler'
  );
});

test('completed replay recognizes random-ID side effects from the previous release', async () => {
  const { reconcileCompletedTransferSideEffects, transferSideEffectId } = transferSideEffectHarness();
  const creditCreatedAt = '2026-09-06T15:30:00.000Z';
  const effect = {
    userId: '00000000-0000-4000-8000-000000000011',
    recipientId: '00000000-0000-4000-8000-000000000012',
    amount: 275,
    clientIp: '198.51.100.27',
    senderName: 'Legacy VIP',
    transferId: 'fedcba9876543210fedcba9876543210',
    creditCreatedAt,
  };
  const legacyIpId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const legacyNotificationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.notEqual(legacyIpId, transferSideEffectId(effect.transferId, 'ip-audit'));
  assert.notEqual(legacyNotificationId, transferSideEffectId(effect.transferId, 'notification'));

  const database = sideEffectDatabase({
    anti_farming_ips: [{
      id: legacyIpId,
      user_id: effect.userId,
      ip_address: '203.0.113.200',
      action_type: 'diamond_gift_sent',
      amount: effect.amount,
      created_at: '2026-09-06T15:30:01.000Z',
    }],
    notifications: [{
      id: legacyNotificationId,
      user_id: effect.recipientId,
      actor_id: effect.userId,
      type: 'diamond_received',
      data: { transfer_id: effect.transferId },
      created_at: '2026-09-06T15:30:02.000Z',
    }],
  });

  const results = await Promise.all([
    reconcileCompletedTransferSideEffects(effect, database),
    reconcileCompletedTransferSideEffects(effect, database),
    reconcileCompletedTransferSideEffects(effect, database),
  ]);

  assert.deepEqual(results, [
    { ipAuditReady: true, notificationReady: true },
    { ipAuditReady: true, notificationReady: true },
    { ipAuditReady: true, notificationReady: true },
  ]);
  assert.equal(database.writes.length, 0, 'legacy random-ID rows must suppress deterministic duplicates');
  assert.equal(database.rows.get('anti_farming_ips').length, 1);
  assert.equal(database.rows.get('notifications').length, 1);
  assert.match(api, /creditCreatedAt: completedReplay\.created_at/);
  const reconcileSource = api.slice(
    api.indexOf('async function reconcileCompletedTransferSideEffects'),
    api.indexOf('\n\nfunction transferSideEffectsReady')
  );
  assert.doesNotMatch(
    reconcileSource,
    /\.eq\('ip_address',\s*clientIp\)/,
    'a replay from a different network must still recognize its original IP audit'
  );
});

test('legacy compatibility reads fail closed without guessing that an effect exists', async () => {
  const { reconcileCompletedTransferSideEffects } = transferSideEffectHarness();
  const database = sideEffectDatabase({}, new Set(['anti_farming_ips', 'notifications']));
  const result = await reconcileCompletedTransferSideEffects({
    userId: '00000000-0000-4000-8000-000000000021',
    recipientId: '00000000-0000-4000-8000-000000000022',
    amount: 50,
    clientIp: '192.0.2.50',
    senderName: 'Read Failure',
    transferId: '00112233445566778899aabbccddeeff',
    creditCreatedAt: '2026-09-06T16:00:00.000Z',
  }, database);

  assert.deepEqual(result, { ipAuditReady: false, notificationReady: false });
  assert.equal(database.writes.length, 0, 'an unreadable legacy state must not create a possible duplicate');
});

test('an unrelated legacy IP row outside the compatibility window cannot suppress reconciliation', async () => {
  const { reconcileCompletedTransferSideEffects, transferSideEffectId } = transferSideEffectHarness();
  const effect = {
    userId: '00000000-0000-4000-8000-000000000031',
    recipientId: '00000000-0000-4000-8000-000000000032',
    amount: 90,
    clientIp: '198.51.100.90',
    senderName: 'Window Boundary',
    transferId: '11223344556677889900aabbccddeeff',
    creditCreatedAt: '2026-09-06T17:00:00.000Z',
  };
  const database = sideEffectDatabase({
    anti_farming_ips: [{
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      user_id: effect.userId,
      ip_address: '203.0.113.90',
      action_type: 'diamond_gift_sent',
      amount: effect.amount,
      created_at: '2026-09-06T17:01:00.001Z',
    }],
  });

  const result = await reconcileCompletedTransferSideEffects(effect, database);

  assert.deepEqual(result, { ipAuditReady: true, notificationReady: true });
  assert.equal(database.rows.get('anti_farming_ips').length, 2);
  assert.ok(database.rows.get('anti_farming_ips').some(
    row => row.id === transferSideEffectId(effect.transferId, 'ip-audit')
  ));
  assert.equal(database.rows.get('notifications').length, 1);
  assert.equal(database.writes.length, 2);
});

test('side-effect failures keep every completed transfer retryable until reconciliation succeeds', () => {
  const readySource = api.match(
    /function transferSideEffectsReady\(result\) \{[\s\S]*?\n\}/
  )?.[0];
  const responseSource = api.match(
    /function respondTransferSideEffectsPending\(res\) \{[\s\S]*?\n\}/
  )?.[0];
  assert.ok(readySource && responseSource, 'the terminal side-effect response contract must be testable');
  const { transferSideEffectsReady, respondTransferSideEffectsPending } = new Function(
    `${readySource}\n${responseSource}\nreturn { transferSideEffectsReady, respondTransferSideEffectsPending };`
  )();

  assert.equal(transferSideEffectsReady({ ipAuditReady: true, notificationReady: true }), true);
  assert.equal(transferSideEffectsReady({ ipAuditReady: false, notificationReady: true }), false);
  assert.equal(transferSideEffectsReady({ ipAuditReady: true, notificationReady: false }), false);
  assert.equal(transferSideEffectsReady(null), false);

  let status = null;
  let payload = null;
  const result = respondTransferSideEffectsPending({
    status(value) {
      status = value;
      return {
        json(valuePayload) {
          payload = valuePayload;
          return valuePayload;
        },
      };
    },
  });
  assert.equal(status, 503);
  assert.equal(result, payload);
  assert.equal(payload.completed, true);
  assert.equal(payload.idempotencyTerminal, false);
  assert.equal(payload.code, 'TRANSFER_SIDE_EFFECTS_PENDING');
  assert.equal(
    [...api.matchAll(/if \(!transferSideEffectsReady\(/g)].length,
    3,
    'replay, orphan recovery, and normal completion must all retain the durable key on failure'
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
