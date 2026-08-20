/**
 * ClubLedger — RPC envelope handling.
 *
 * Every fn_* money function in this database RETURNS jsonb of the shape
 * { success: boolean, error?: text, new_balance?: numeric }. None of them RAISE
 * on a business refusal (insufficient balance, club not found, amount <= 0).
 *
 * That means `const { error } = await supabase.rpc(...)` is null on a REFUSED
 * debit, and code branching only on `error` books the debit as completed.
 * ClubLedger.debit() shipped exactly that bug — it even had an
 * `error.message.includes('Insufficient')` branch that could never fire,
 * because the insufficient case never populated `error` in the first place.
 *
 * These tests pin the envelope contract at the ledger boundary, which is the
 * choke point every poker-engine chip movement passes through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ClubLedger } = require('../src/lib/poker-engine/ClubLedger.js');

/** Minimal supabase stub: rpc() replays a queued envelope, from() is inert. */
function stubSupabase(envelopeByFn) {
  const calls = [];
  return {
    calls,
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(envelopeByFn[fn] ?? { data: null, error: null });
    },
    from() {
      return {
        insert: () => Promise.resolve({ error: null }),
        select() { return this; },
        eq() { return this; },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
    },
  };
}

const CLUB = '00000000-0000-0000-0000-0000000000c1';
const USER = '00000000-0000-0000-0000-000000000011';

test('debit reports failure when the RPC refuses without raising', async () => {
  const supabase = stubSupabase({
    fn_debit_chips: { data: { success: false, error: 'Insufficient balance' }, error: null },
  });
  const res = await new ClubLedger({ supabase }).debit(CLUB, USER, 500);

  assert.equal(res.success, false, 'a refused debit must not report success');
  assert.equal(res.error, 'Insufficient balance');
});

test('debit writes no audit row for a refused debit', async () => {
  const supabase = stubSupabase({
    fn_debit_chips: { data: { success: false, error: 'Insufficient balance' }, error: null },
  });
  await new ClubLedger({ supabase }).debit(CLUB, USER, 500);

  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].fn, 'fn_debit_chips');
});

test('debit returns a numeric balance on success, not the jsonb envelope', async () => {
  const supabase = stubSupabase({
    fn_debit_chips: { data: { success: true, new_balance: 1500 }, error: null },
  });
  const res = await new ClubLedger({ supabase }).debit(CLUB, USER, 500);

  assert.equal(res.success, true);
  assert.equal(typeof res.newBalance, 'number', 'newBalance is documented as a number');
  assert.equal(res.newBalance, 1500);
});

test('credit reports failure when the RPC refuses without raising', async () => {
  const supabase = stubSupabase({
    fn_credit_chips: { data: { success: false, error: 'amount must be > 0' }, error: null },
  });
  const res = await new ClubLedger({ supabase }).credit(CLUB, USER, 500);

  assert.equal(res.success, false);
  assert.equal(res.error, 'amount must be > 0');
});

test('credit returns a numeric balance on success', async () => {
  const supabase = stubSupabase({
    fn_credit_chips: { data: { success: true, new_balance: 2500 }, error: null },
  });
  const res = await new ClubLedger({ supabase }).credit(CLUB, USER, 500);

  assert.equal(res.success, true);
  assert.equal(res.newBalance, 2500);
});

test('transport errors still fail and are not masked by the envelope check', async () => {
  const supabase = stubSupabase({
    fn_debit_chips: { data: null, error: { message: 'connection reset' } },
  });
  const res = await new ClubLedger({ supabase }).debit(CLUB, USER, 500);

  assert.equal(res.success, false);
  assert.equal(res.error, 'connection reset');
});

test('debitOverlay records a pending row when the treasury refuses', async () => {
  const inserted = [];
  const supabase = stubSupabase({
    fn_debit_treasury: { data: { success: false, error: 'insufficient treasury' }, error: null },
  });
  supabase.from = () => ({
    insert: (row) => { inserted.push(row); return Promise.resolve({ error: null }); },
  });

  const res = await new ClubLedger({ supabase }).debitOverlay(CLUB, 10000, { tournamentId: 't1' });

  assert.equal(res.success, false, 'an unfunded overlay must not report success');
  assert.equal(inserted.length, 1, 'the shortfall must leave a pending audit row');
  assert.equal(inserted[0].metadata.status, 'pending');
});
