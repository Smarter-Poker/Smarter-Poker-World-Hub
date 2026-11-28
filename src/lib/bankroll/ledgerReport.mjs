// Shared, side-effect-free rules for every bankroll report and export file.
//
// The CSV, JSON, PDF and tax reports each used to total the ledger their own
// way. Between them they counted superseded revisions, deposits and
// withdrawals as "sessions" and as profit, stopped at 50 or 500 rows without
// saying so, and escaped only one CSV column. Everything that decides what a
// row means now lives here, once.

/** Categories that are gaming sessions. Deposits, withdrawals and expenses are not. */
export const SESSION_CATEGORIES = Object.freeze(['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports']);
export const MOVEMENT_CATEGORIES = Object.freeze(['deposit', 'withdrawal']);

export const CATEGORY_NAMES = Object.freeze({
  poker_cash: 'Cash Game',
  poker_mtt: 'Tournament',
  casino_table: 'Table Games',
  slots: 'Slots',
  sports: 'Sports Betting',
  expense: 'Expense',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
});

export const isSessionEntry = (entry) => SESSION_CATEGORIES.includes(entry?.category);

const toCents = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
};

/** Net of one row in cents: cash-out less buy-in, the same as the generated net_result column. */
export function entryNetCents(entry) {
  return toCents(entry?.gross_out) - toCents(entry?.gross_in);
}

/**
 * Totals that mean the same thing on every report:
 * - sessions / wins / sessionNet cover gaming categories only;
 * - expenses reduce the result, deposits and withdrawals are bankroll movements
 *   and never profit or loss.
 * All money values are dollars rounded to cents.
 */
export function summarizeLedger(entries = []) {
  let sessions = 0, wins = 0, losses = 0, sessionCents = 0, inCents = 0, outCents = 0;
  let expenseCents = 0, depositCents = 0, withdrawalCents = 0;
  for (const entry of entries) {
    if (!entry || entry.is_revision) continue;
    const net = entryNetCents(entry);
    if (isSessionEntry(entry)) {
      sessions++;
      sessionCents += net;
      inCents += toCents(entry.gross_in);
      outCents += toCents(entry.gross_out);
      if (net > 0) wins++;
      else if (net < 0) losses++;
    } else if (entry.category === 'expense') {
      expenseCents += Math.abs(toCents(entry.gross_in) || net);
    } else if (entry.category === 'deposit') {
      depositCents += toCents(entry.gross_out);
    } else if (entry.category === 'withdrawal') {
      withdrawalCents += toCents(entry.gross_in);
    }
  }
  const dollars = (cents) => cents / 100;
  return {
    sessions,
    wins,
    losses,
    winRate: sessions ? Math.round((wins / sessions) * 1000) / 10 : 0,
    totalBuyIns: dollars(inCents),
    totalCashOuts: dollars(outCents),
    sessionNet: dollars(sessionCents),
    averageSession: sessions ? Math.round(sessionCents / sessions) / 100 : 0,
    expenses: dollars(expenseCents),
    netAfterExpenses: dollars(sessionCents - expenseCents),
    deposits: dollars(depositCents),
    withdrawals: dollars(withdrawalCents),
  };
}

/**
 * One CSV cell. Quotes when needed, doubles embedded quotes, and neutralises
 * text a spreadsheet would run as a formula (=, +, -, @, tab, CR) by
 * prefixing an apostrophe. Numbers are written as plain numbers so a negative
 * net stays a negative number.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) || text !== text.trim() ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function buildCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Money as a report shows it: -$1,234.50, never $-1,234.5. */
export function formatUsd(value, { cents = true } = {}) {
  const number = Number(value) || 0;
  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/**
 * Read every row a query returns, a page at a time, so no report silently
 * stops at PostgREST's row cap or a hard-coded limit. `makeQuery` must return
 * a fresh, fully ordered query builder each call.
 */
export async function fetchAllRows(makeQuery, { pageSize = 1000, maxRows = 50000 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  return rows;
}

/** Rows and file content for the ledger CSV export. */
export function ledgerCsv(entries) {
  const header = ['Date', 'Category', 'Buy-In', 'Cash-Out', 'Net P/L', 'Stakes', 'Game Type', 'Tournament', 'Start Time', 'End Time', 'Mood', 'Notes'];
  const rows = entries.map((e) => [
    e.date, e.category, e.buy_in, e.cash_out, e.net_pl, e.stakes, e.game_type,
    e.tournament_name, e.start_time, e.end_time, e.emotional_tag, e.notes,
  ]);
  const s = summarizeLedger(entries.map((e) => ({ category: e.category_id, gross_in: e.buy_in, gross_out: e.cash_out })));
  return buildCsv([
    header,
    ...rows,
    [],
    ['Summary'],
    ['Entries', entries.length],
    ['Gaming Sessions', s.sessions],
    ['Session Buy-Ins', s.totalBuyIns],
    ['Session Cash-Outs', s.totalCashOuts],
    ['Session Net P/L', s.sessionNet],
    ['Expenses', -s.expenses],
    ['Net After Expenses', s.netAfterExpenses],
    ['Deposits', s.deposits],
    ['Withdrawals', s.withdrawals],
  ]);
}

/** The row shape every export writes. Signs: net_pl = cash-out less buy-in. */
export function exportRow(entry) {
  return {
    date: entry.entry_date,
    category: CATEGORY_NAMES[entry.category] || entry.category || 'Other',
    category_id: entry.category || null,
    buy_in: toCents(entry.gross_in) / 100,
    cash_out: toCents(entry.gross_out) / 100,
    net_pl: entryNetCents(entry) / 100,
    stakes: entry.stakes || '',
    game_type: entry.game_type || '',
    tournament_name: entry.tournament_name || '',
    start_time: entry.start_time || '',
    end_time: entry.end_time || '',
    emotional_tag: entry.emotional_tag || '',
    notes: entry.notes || '',
  };
}
