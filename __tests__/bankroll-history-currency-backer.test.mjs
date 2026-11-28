// Bankroll Manager, Wave 4 db UI lane (2026-11-28): entry edit history,
// Recently Deleted and restore, per-session entry currency, and the backer
// share link with its public statement. The schema these use was installed by
// the coordinator on 2026-11-28 (bankroll_ledger_changes, the entry currency
// columns, staking_share_links + fn_staking_statement, external_ref).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ENTRY_CURRENCY_CODES,
  EUR_RATE_TO_USD,
  amountCents,
  applyEntryCurrency,
  chooseCurrency,
  defaultRateFor,
  entryInOwnCurrency,
  foreignEntryNote,
  foreignToUsdCents,
  initialCurrencyState,
  noteMoney,
  parseRate,
  rateProblem,
  rateSourceNote,
  typeRate,
  usdSavedPreview,
  usdToForeignCents,
} from '../src/lib/bankroll/entryCurrency.mjs';
import {
  clockLabel,
  daysLeft,
  diffLedgerRows,
  formatHistoryValue,
  historyItems,
  recentlyDeleted,
  restorableRow,
  restoreFailureText,
  restoreProblem,
} from '../src/lib/bankroll/ledgerHistory.mjs';
import {
  cleanStatementRows,
  normalizeStatementToken,
  readStakingStatement,
  shareLinkStatus,
  sortShareLinks,
  statementTotals,
  statementUrl,
} from '../src/lib/bankroll/stakingStatement.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Entry currency

test('the EUR default is the Display EUR rate inverted, and only EUR has one', () => {
  assert.equal(EUR_RATE_TO_USD, 1.0957, '1 / 0.9127 to 4 places is the ECB 1.0957 of 2026-11-27');
  assert.deepEqual(defaultRateFor('EUR'), { rate: 1.0957, asOf: '2026-11-27', source: 'ecb' });
  assert.equal(defaultRateFor('GBP'), null, 'any other currency asks the player');
  assert.deepEqual(ENTRY_CURRENCY_CODES, ['USD', 'EUR', 'GBP', 'CAD', 'AUD']);
});

test('conversion to US cents is exact and rounds half away from zero', () => {
  assert.equal(foreignToUsdCents(500, '1.0957'), 54785);
  assert.equal(foreignToUsdCents(700, 1.0957), 76699);
  assert.equal(foreignToUsdCents('33.33', '1.0957'), 3652); // 3651.97...
  assert.equal(foreignToUsdCents('0.05', '0.5'), 3, '2.5 cents rounds up');
  assert.equal(foreignToUsdCents('-0.05', '0.5'), -3, 'and away from zero when negative');
  // 9e12 cents times a rate in millionths is past 2^53; BigInt keeps it exact.
  assert.equal(foreignToUsdCents('90000000000.01', '1.234567'), 11111103000001);
  assert.equal(usdToForeignCents(547.85, 1.0957), 50000, 'back to the typed amount');
  assert.equal(amountCents('0.1'), 10);
  assert.equal(amountCents(0.1 + 0.2), 30);
  assert.equal(amountCents('1.005'), 101);
});

test('a rate is a positive decimal of at most 6 places', () => {
  assert.equal(parseRate('1.0957'), 1.0957);
  assert.equal(parseRate('0'), null);
  assert.equal(parseRate('-1'), null);
  assert.equal(parseRate('1.1234567'), null);
  assert.equal(parseRate('abc'), null);
  assert.equal(parseRate(''), null);
  assert.equal(rateProblem('', 'GBP'), 'Enter The Rate: US Dollars Per 1 GBP');
  assert.match(rateProblem('0', 'GBP'), /Positive Number/);
  assert.equal(rateProblem('', 'USD'), null, 'US dollars need no rate');
  assert.equal(rateProblem('1.27', 'GBP'), null);
});

test('a foreign entry stores US dollars in gross_* and what was typed in original_*', () => {
  const saved = applyEntryCurrency(
    { category: 'poker_mtt', gross_in: 220, gross_out: 1000, buy_in_amount: 100, add_on_amount: 20, bounties_collected: null },
    { currency: 'eur', rate: '1.0957' },
  );
  assert.equal(saved.entry_currency, 'EUR');
  assert.equal(saved.fx_rate_to_usd, 1.0957);
  assert.equal(saved.original_gross_in, 220);
  assert.equal(saved.original_gross_out, 1000);
  assert.equal(saved.gross_in, 241.05);
  assert.equal(saved.gross_out, 1095.7);
  assert.equal(saved.buy_in_amount, 109.57);
  assert.equal(saved.add_on_amount, 21.91);
  assert.equal(saved.bounties_collected, null);
  // bankroll_ledger_foreign_entry_complete: a non-USD row carries all three.
  for (const f of ['fx_rate_to_usd', 'original_gross_in', 'original_gross_out']) assert.notEqual(saved[f], null, f);
  const usd = applyEntryCurrency({ gross_in: 100, gross_out: 50 }, { currency: 'USD' });
  assert.deepEqual(
    [usd.entry_currency, usd.fx_rate_to_usd, usd.original_gross_in, usd.original_gross_out, usd.gross_in, usd.gross_out],
    ['USD', null, null, null, 100, 50],
    'a US dollar entry clears the foreign columns and is stored as typed',
  );
  assert.throws(() => applyEntryCurrency({ gross_in: 1 }, { currency: 'GBP', rate: '' }), /Invalid exchange rate/);
});

test('editing a foreign entry shows it in its own currency', () => {
  const row = {
    category: 'poker_mtt', entry_currency: 'EUR', fx_rate_to_usd: 1.0957,
    gross_in: 241.05, gross_out: 1095.7, original_gross_in: 220, original_gross_out: 1000,
    buy_in_amount: 109.57, add_on_amount: 21.91, bounties_collected: null,
  };
  const view = entryInOwnCurrency(row);
  assert.equal(view.gross_in, 220);
  assert.equal(view.gross_out, 1000);
  assert.equal(view.buy_in_amount, 100);
  assert.equal(view.add_on_amount, 20);
  assert.equal(view.entry_currency, 'EUR');
  assert.equal(entryInOwnCurrency({ gross_in: 5, entry_currency: null }).gross_in, 5, 'a US dollar row is unchanged');
  assert.deepEqual(initialCurrencyState(row), { currency: 'EUR', rate: '1.0957', source: 'saved' });
  assert.deepEqual(initialCurrencyState(null), { currency: 'USD', rate: '', source: 'usd' });
});

test('the picker defaults EUR, asks for other rates and says where a rate came from', () => {
  const start = initialCurrencyState(null);
  assert.deepEqual(chooseCurrency(start, 'EUR'), { currency: 'EUR', rate: '1.0957', source: 'ecb' });
  assert.deepEqual(chooseCurrency(start, 'GBP'), { currency: 'GBP', rate: '', source: 'player' });
  assert.deepEqual(chooseCurrency(start, 'USD'), { currency: 'USD', rate: '', source: 'usd' });
  assert.deepEqual(typeRate({ currency: 'EUR', rate: '1.0957', source: 'ecb' }, '1.1'), { currency: 'EUR', rate: '1.1', source: 'player' });
  const saved = { entry_currency: 'CAD', fx_rate_to_usd: 0.71, original_gross_in: 1, original_gross_out: 1 };
  assert.deepEqual(chooseCurrency(start, 'CAD', saved), { currency: 'CAD', rate: '0.71', source: 'saved' });
  assert.match(rateSourceNote({ code: 'EUR', source: 'ecb' }), /European Central Bank Reference Rate For EUR, Nov 27, 2026/);
  assert.match(rateSourceNote({ code: 'GBP', source: 'player', day: '2026-11-20' }), /Your Rate For Nov 20, 2026/);
  assert.match(rateSourceNote({ code: 'CAD', source: 'saved' }), /Saved With This Entry/);
});

test('the ledger note and the saved-as preview', () => {
  const cash = { category: 'poker_cash', entry_currency: 'EUR', fx_rate_to_usd: 1.0957, original_gross_in: 500, original_gross_out: 700 };
  assert.equal(foreignEntryNote(cash), 'EUR +200 at 1.0957');
  assert.equal(foreignEntryNote({ ...cash, original_gross_out: 250.5 }), 'EUR -249.50 at 1.0957');
  assert.equal(foreignEntryNote({ category: 'expense', entry_currency: 'GBP', fx_rate_to_usd: 1.27, original_gross_in: 80, original_gross_out: 0 }), 'GBP 80 at 1.27');
  assert.equal(foreignEntryNote({ category: 'poker_cash', gross_in: 1, gross_out: 2 }), null, 'US dollar rows have no note');
  assert.equal(usdSavedPreview({ currency: 'EUR', rate: '1.0957', grossIn: 500, grossOut: 700 }), 'Saved As +$219.14 (USD)');
  assert.equal(usdSavedPreview({ currency: 'EUR', rate: '1.0957', grossIn: 80, grossOut: 0, isExpense: true }), 'Saved As $87.66 (USD)');
  assert.equal(usdSavedPreview({ currency: 'GBP', rate: '', grossIn: 1, grossOut: 2 }), null);
  assert.equal(noteMoney('USD', 1500, { grouped: true }), '$1,500', 'US dollar notes keep their old form');
  assert.equal(noteMoney('EUR', 20), 'EUR 20');
});

// ---------------------------------------------------------------------------
// Edit history

const before = {
  id: 'e1', user_id: 'u1', created_at: '2026-11-01T00:00:00Z', net_result: 50,
  category: 'poker_cash', entry_date: '2026-11-20', start_time: '2026-11-20T21:30:00+00:00', end_time: null,
  gross_in: 200, gross_out: 250, notes: 'old', stakes: '1/2', media_urls: null, entry_currency: 'USD',
};

test('a history row is diffed field by field, ignoring ids and generated columns', () => {
  const after = { ...before, net_result: 100, gross_out: 300, notes: 'new', stakes: '1/2', media_urls: [], entry_currency: null, start_time: '2026-11-20T22:00:00+00:00' };
  const changes = diffLedgerRows(before, after);
  assert.deepEqual(changes.map((c) => c.field), ['start_time', 'gross_out', 'notes']);
  assert.deepEqual(diffLedgerRows(before, { ...before, gross_in: '200.00' }), [], 'numeric text equal to the number is not a change');
  assert.deepEqual(diffLedgerRows(before, { ...before, mystery_col: 'x' }).map((c) => c.label), ['Mystery Col'], 'an unknown column is shown, not hidden');
});

test('values are formatted: money follows Display EUR, typed money keeps its currency, clocks are not shifted', () => {
  assert.equal(formatHistoryValue('gross_out', 300, before), '$300');
  assert.equal(formatHistoryValue('gross_out', 300, before, { displayEUR: true }), '€273.81');
  assert.equal(formatHistoryValue('original_gross_in', 500, { entry_currency: 'EUR' }), 'EUR 500');
  assert.equal(formatHistoryValue('fx_rate_to_usd', 1.0957, { entry_currency: 'EUR' }), '1.0957 USD Per EUR');
  assert.equal(formatHistoryValue('entry_currency', null), 'USD');
  assert.equal(formatHistoryValue('notes', null), 'None');
  assert.equal(formatHistoryValue('category', 'poker_mtt'), 'Tournament');
  assert.equal(formatHistoryValue('entry_date', '2026-01-01'), 'Jan 1, 2026', 'a ledger day is never moved a day by the time zone');
  assert.equal(clockLabel('2026-11-20T21:30:00+00:00'), 'Nov 20, 2026, 9:30 PM');
});

test('history items are newest first and skip invisible changes', () => {
  const rows = [
    { id: 1, op: 'UPDATE', changed_at: '2026-11-21T10:00:00Z', old_row: before, new_row: { ...before, gross_out: 300, net_result: 100 } },
    { id: 3, op: 'UPDATE', changed_at: '2026-11-23T10:00:00Z', old_row: before, new_row: { ...before, is_revision: true } },
    { id: 2, op: 'DELETE', changed_at: '2026-11-22T10:00:00Z', old_row: before, new_row: null },
  ];
  const items = historyItems(rows);
  assert.deepEqual(items.map((i) => [i.id, i.op]), [[2, 'DELETE'], [1, 'UPDATE']]);
  assert.deepEqual(items[1].changes, [{ field: 'gross_out', label: 'Cash-Out', before: '$250', after: '$300' }]);
});

// ---------------------------------------------------------------------------
// Recently Deleted and restore

const NOW = new Date('2026-11-28T12:00:00Z');
const del = (id, entry, at, extra = {}) => ({ id, entry_id: entry, user_id: 'u1', op: 'DELETE', changed_at: at, old_row: { ...before, id: entry, ...extra }, new_row: null });

test('Recently Deleted lists the newest delete per entry from the last 30 days, never one in the ledger', () => {
  const rows = [
    del(1, 'a', '2026-11-27T10:00:00Z'),
    del(2, 'a', '2026-11-20T10:00:00Z'), // older delete of the same entry
    del(3, 'b', '2026-10-01T10:00:00Z'), // past 30 days
    del(4, 'c', '2026-11-26T10:00:00Z'), // restored: back in the ledger
    del(5, 'd', '2026-11-25T10:00:00Z'),
    { id: 6, entry_id: 'e', op: 'UPDATE', changed_at: '2026-11-27T00:00:00Z', old_row: before, new_row: before },
  ];
  const listed = recentlyDeleted(rows, new Set(['c']), { now: NOW });
  assert.deepEqual(listed.map((r) => [r.id, r.entry_id]), [[1, 'a'], [5, 'd']]);
  assert.equal(daysLeft('2026-11-27T10:00:00Z', NOW), 28);
  assert.equal(daysLeft('2026-10-29T13:00:00Z', NOW), 0);
});

test('a restore inserts the deleted row as it was, less the generated net_result', () => {
  const row = restorableRow({ ...before });
  assert.equal(row.id, 'e1', 'the original id is reused (the deleted row no longer holds it)');
  assert.equal(row.created_at, '2026-11-01T00:00:00Z');
  assert.ok(!('net_result' in row), 'the database refuses a value for a generated column');
  assert.equal(row.notes, 'old');
  assert.throws(() => restorableRow({ id: 'x' }), /Incomplete/);
});

test('the same deleted row can never be restored twice', () => {
  const row = del(1, 'a', '2026-11-27T10:00:00Z');
  assert.equal(restoreProblem(row, { entryExists: false, userId: 'u1' }), null);
  assert.match(restoreProblem(row, { entryExists: true, userId: 'u1' }), /Already Back/);
  assert.match(restoreProblem(row, { userId: 'u2' }), /Another Account/);
  assert.match(restoreProblem({ ...row, op: 'UPDATE' }), /Not A Deleted Entry/);
  // A second insert racing the first is refused by the primary key.
  assert.match(restoreFailureText({ code: '23505', message: 'duplicate key value violates unique constraint "bankroll_ledger_pkey"' }), /Already Back/);
  assert.match(restoreFailureText({ code: '23505', details: 'Key (user_id, external_ref)=(...) already exists.' }), /Imported Again/);
  assert.match(restoreFailureText({ code: '23503' }), /Trip Or Venue/);
});

test('restore and Delete Forever go through the ledger and history tables as designed', async () => {
  const { restoreDeletedEntry, deleteEntryHistory } = await importComponentHelpers();
  const ledger = new Set();
  const history = [del(1, 'a', '2026-11-27T10:00:00Z'), { id: 9, entry_id: 'a', user_id: 'u1', op: 'UPDATE' }];
  const client = fakeClient({ ledger, history });
  const created = [];
  const create = async (userId, row) => {
    if (ledger.has(row.id)) { const e = new Error('dup'); e.code = '23505'; throw e; }
    ledger.add(row.id); created.push([userId, row]); return row;
  };
  const first = await restoreDeletedEntry(client, 'u1', history[0], create);
  assert.equal(first.ok, true);
  assert.equal(created[0][1].id, 'a');
  const second = await restoreDeletedEntry(client, 'u1', history[0], create);
  assert.equal(second.ok, false);
  assert.match(second.message, /Already Back/);
  assert.equal(created.length, 1, 'never inserted twice');
  const kept = await deleteEntryHistory(client, 'u1', 'a');
  assert.equal(kept.ok, false, 'an entry that is back keeps its history');
  ledger.delete('a');
  const gone = await deleteEntryHistory(client, 'u1', 'a');
  assert.deepEqual(gone, { ok: true, removed: 2 });
});

// The components import the app's supabase client; give them a stand-in by
// reading the helper functions out of the source with esbuild-free eval.
async function importComponentHelpers() {
  const src = read('src/components/bankroll/RecentlyDeleted.jsx');
  const start = src.indexOf('const ID_BATCH = 100;');
  const end = src.indexOf('function DeletedRow(');
  const body = src.slice(start, end).replace(/export async function/g, 'async function');
  const lib = await import('../src/lib/bankroll/ledgerHistory.mjs');
  // eslint-disable-next-line no-new-func
  const make = new Function('lib', 'createLedgerEntry', `const { DELETED_PAGE_SIZE, deletedSince, restorableRow, restoreFailureText, restoreProblem } = lib;\n${body}\nreturn { fetchDeletedPage, fetchExistingIds, restoreDeletedEntry, deleteEntryHistory };`);
  return make(lib, async () => { throw new Error('use the injected create'); });
}

function fakeClient({ ledger, history }) {
  return {
    from(table) {
      const filters = [];
      let op = 'select';
      const chain = {
        select() { return chain; },
        delete() { op = 'delete'; return chain; },
        eq(c, v) { filters.push(['eq', c, v]); return chain; },
        in(c, v) { filters.push(['in', c, v]); return chain; },
        then(resolve, reject) {
          let result;
          if (table === 'bankroll_ledger') {
            const ids = (filters.find(([o]) => o === 'in') || [])[2] || [];
            result = { data: ids.filter((id) => ledger.has(id)).map((id) => ({ id })), error: null };
          } else {
            const match = (r) => filters.every(([, c, v]) => r[c] === v);
            const hits = history.filter(match);
            if (op === 'delete') for (const h of hits) history.splice(history.indexOf(h), 1);
            result = { data: hits.map((h) => ({ id: h.id })), error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

// ---------------------------------------------------------------------------
// Backer statement

const TOKEN = '3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f';

test('tokens are UUIDs; links are active, expired or revoked', () => {
  assert.equal(normalizeStatementToken(TOKEN.toUpperCase()), TOKEN);
  assert.equal(normalizeStatementToken('not-a-token'), null);
  assert.equal(normalizeStatementToken('../../etc'), null);
  assert.equal(statementUrl(TOKEN), `https://smarter.poker/staking/statement/${TOKEN}`);
  const now = new Date('2026-11-28T00:00:00Z');
  assert.equal(shareLinkStatus({ expires_at: '2026-12-28T00:00:00Z' }, now), 'active');
  assert.equal(shareLinkStatus({ expires_at: '2026-11-27T00:00:00Z' }, now), 'expired');
  assert.equal(shareLinkStatus({ expires_at: '2026-12-28T00:00:00Z', revoked_at: '2026-11-27T00:00:00Z' }, now), 'revoked');
  const sorted = sortShareLinks([
    { token: 'old', created_at: '2026-11-01', expires_at: '2026-11-20T00:00:00Z' },
    { token: 'live', created_at: '2026-10-01', expires_at: '2026-12-20T00:00:00Z' },
  ], now);
  assert.deepEqual(sorted.map((l) => l.token), ['live', 'old']);
});

test('statement totals are summed in cents and makeup is the last session\'s', () => {
  const rows = [
    { entry_date: '2026-11-01', category: 'poker_cash', gross_result: -300.1, player_share: 0, backer_share: -300.1, makeup_before: 0, makeup_after: 300.1 },
    { entry_date: '2026-11-03', category: 'poker_mtt', gross_result: 0.1, player_share: 0, backer_share: 0.1, makeup_before: 300.1, makeup_after: 300 },
    { entry_date: '2026-11-05', category: 'poker_cash', gross_result: 500.2, player_share: 100.1, backer_share: 400.1, makeup_before: 300, makeup_after: 0, notes: 'never shown', user_id: 'x' },
  ];
  assert.deepEqual(statementTotals(rows), {
    sessions: 3, wins: 2, grossCents: 20020, playerCents: 10010, backerCents: 10010, makeupCents: 0,
    firstDay: '2026-11-01', lastDay: '2026-11-05',
  });
  assert.deepEqual(Object.keys(cleanStatementRows(rows)[2]).sort(), ['backer_share', 'category', 'entry_date', 'gross_result', 'makeup_after', 'makeup_before', 'player_share'], 'nothing beyond what the function returns');
  assert.deepEqual(statementTotals([]).sessions, 0);
});

test('the statement read uses the publishable key and says unavailable for zero rows', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return { ok: true, json: async () => (url.endsWith('fn_staking_link_is_active') ? false : []) }; };
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' };
  assert.deepEqual(await readStakingStatement(TOKEN, fetchImpl, env), { status: 'unavailable', rows: [] });
  assert.equal(calls[0][0], 'https://example.supabase.co/rest/v1/rpc/fn_staking_statement');
  assert.deepEqual(JSON.parse(calls[0][1].body), { p_token: TOKEN });
  assert.ok(!('Authorization' in calls[0][1].headers), 'no user session is sent');
  assert.equal(calls[1][0], 'https://example.supabase.co/rest/v1/rpc/fn_staking_link_is_active');
  assert.deepEqual(await readStakingStatement('bad', fetchImpl, env), { status: 'unavailable', rows: [] });
  assert.equal(calls.length, 2, 'a malformed token never reaches the database');
  await assert.rejects(() => readStakingStatement(TOKEN, async () => ({ ok: false, status: 500 }), env), /fn_staking_statement 500/);
});

test('a live link on a deal with no sessions reads as empty, not expired', async () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' };
  const live = async (url) => ({ ok: true, json: async () => (url.endsWith('fn_staking_link_is_active') ? true : []) });
  assert.deepEqual(await readStakingStatement(TOKEN, live, env), { status: 'empty', rows: [] });
  const failing = async (url) => (url.endsWith('fn_staking_link_is_active') ? { ok: false, status: 503 } : { ok: true, json: async () => [] });
  await assert.rejects(() => readStakingStatement(TOKEN, failing, env), /fn_staking_link_is_active 503/);
  const view = read('src/components/bankroll/StakingStatementView.jsx');
  assert.match(view, /status === 'empty'[\s\S]{0,200}No Sessions Linked Yet/);
});

// ---------------------------------------------------------------------------
// Wiring

test('every surface is mounted where the player reaches it', () => {
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /\{ id: 'recently-deleted', label: 'Recently Deleted', icon: '' \}/);
  assert.match(page, /activeSection === 'recently-deleted'[\s\S]{0,200}<RecentlyDeleted userId=\{userId\} displayEUR=\{preferences\.currencyEUR\} \/>/);
  assert.match(page, /displayEUR=\{preferences\.currencyEUR\}\s*\n\s*onClose=\{closeLogModal\}/, 'the edit sheet knows Display EUR for its History');
  const modal = read('src/components/bankroll/LogEntryModal.jsx');
  assert.match(modal, /<LedgerEntryHistory userId=\{userId\} entryId=\{editEntry\.id\} displayEUR=\{displayEUR\} \/>/);
  assert.match(modal, /<EntryCurrencyFields/);
  assert.match(modal, /Object\.assign\(entry, applyEntryCurrency\(entry, \{ currency: currencyState\.currency, rate: currencyState\.rate \}\)\);/);
  assert.match(modal, /const e = editView;/, 'an edited foreign entry is shown as typed');
  const history = read('src/components/bankroll/LedgerEntryHistory.jsx');
  assert.match(history, /\.eq\('entry_id', entryId\)/, 'only this entry\'s rows');
  assert.match(history, /\.range\(from, from \+ pageSize - 1\)/, 'paged');
  const deleted = read('src/components/bankroll/RecentlyDeleted.jsx');
  assert.match(deleted, /\.eq\('op', 'DELETE'\)/);
  assert.match(deleted, /await create\(userId, insert\)/);
  assert.match(deleted, /import \{ createLedgerEntry \} from '\.\.\/\.\.\/lib\/bankroll\/bankrollSelectors';/, 'the app\'s own creation path');
  const sel = read('src/lib/bankroll/bankrollSelectors.ts');
  assert.match(sel, /const OPTIONAL_LEDGER_COLUMNS = \[\s*'id', 'created_at', 'external_ref',/);
  const tracker = read('src/components/bankroll/StakingTracker.jsx');
  assert.match(tracker, /<StakingSharePanel userId=\{userId\} arrangement=\{activeArrangement\} sessionCount=\{sessions\.length\} \/>/);
  const timeline = read('src/components/bankroll/LedgerTimeline.jsx');
  assert.match(timeline, /foreignEntryNote\(entry\)/);
  const statement = read('pages/staking/statement/[token].js');
  assert.match(statement, /X-Robots-Tag', 'noindex, nofollow'/);
  assert.match(statement, /Cache-Control', 'private, no-store/);
  assert.match(statement, /Referrer-Policy', 'no-referrer'/);
  assert.doesNotMatch(statement, /console\.\w+\([^)]*token\b/, 'the bearer token is never logged');
  const view = read('src/components/bankroll/StakingStatementView.jsx');
  assert.match(view, /This Link Has Expired Or Was Revoked/);
  assert.match(view, /noindex, nofollow/);
  assert.match(read('e2e/bankroll-live.spec.ts'), /\{ view: 'recently-deleted', title: 'Recently Deleted' \}/);
});
