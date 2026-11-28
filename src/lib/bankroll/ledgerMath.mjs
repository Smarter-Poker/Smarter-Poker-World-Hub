// One set of rules for what a bankroll_ledger row does to the player's money.
//
// Every figure is summed in whole cents. The ledger stores dollars as numeric,
// and adding dollar floats row by row drifts (0.1 + 0.2 is 0.30000000000000004),
// which is how a balance tile ends up reading -$0.00 or $1,234.5.
//
// Three kinds of row exist:
// - results: sessions (poker_cash, poker_mtt, casino_table, slots, sports) and
//   expenses. These are what Net Results, the trend chart and goals measure.
// - movements: deposit and withdrawal, written by Adjust Bankroll. They change
//   the balance but are not winnings or losses.
// - the starting bankroll, which lives in bankroll_segments.initial_deposit and
//   has no ledger row.
//
// Until 2026-11-27 the Bankroll Balance tile skipped movements entirely, so an
// Adjust Bankroll deposit or withdrawal wrote its ledger row, said "Added To
// Bankroll", and left the balance exactly where it was.

export const SESSION_CATEGORIES = ['poker_cash', 'poker_mtt', 'casino_table', 'slots', 'sports'];
export const RESULT_CATEGORIES = [...SESSION_CATEGORIES, 'expense'];
export const MOVEMENT_CATEGORIES = ['deposit', 'withdrawal'];

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

/** Dollars (number or numeric string) to integer cents; anything unreadable is 0. */
export function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Integer cents back to dollars, without float residue. */
export function centsToDollars(cents) {
  return Math.round(cents) / 100;
}

export const isSessionRow = (entry) => SESSION_CATEGORIES.includes(entry?.category);
export const isResultRow = (entry) => RESULT_CATEGORIES.includes(entry?.category);
export const isMovementRow = (entry) => MOVEMENT_CATEGORIES.includes(entry?.category);

/**
 * A superseded revision is kept for history only and is never money. Every
 * reader filters `is_revision = false` in the query, and every totaller skips
 * one too, so the same rows give the same figure whichever path adds them up.
 */
export const isCurrentRow = (entry) => !!entry && !entry.is_revision;

/**
 * What an expense row costs, in positive cents, whatever sign it carries.
 * Every writer stores an expense as gross_in = amount, gross_out = 0; older
 * rows were typed with a negative amount or with the amount as gross_out.
 * The Trip Tracker, the trend chart, the reports and the tax report each used
 * their own rule for those rows, and two of them turned such an expense into
 * a gain. This is the one rule: the size of the row's net.
 */
export function expenseCostCents(entry) {
  if (!entry) return 0;
  return Math.abs(toCents(entry.gross_out) - toCents(entry.gross_in));
}

/**
 * What one row does to the bankroll, in cents. An expense is always money
 * out, whatever sign its amount was typed with.
 */
export function entryCents(entry) {
  if (!entry) return 0;
  if (entry.category === 'expense') return -expenseCostCents(entry);
  return toCents(entry.gross_out) - toCents(entry.gross_in);
}

/** Winnings and losses (sessions and expenses), never deposits or withdrawals. */
export function resultsCents(entries) {
  let total = 0;
  for (const entry of entries || []) if (isCurrentRow(entry) && isResultRow(entry)) total += entryCents(entry);
  return total;
}

/**
 * The player's bankroll: the starting bankroll on every non-life segment, plus
 * every result, plus every deposit, minus every withdrawal.
 */
export function bankrollBalanceCents(entries, segments) {
  let total = 0;
  for (const segment of segments || []) {
    if (segment && segment.segment_type !== 'life') total += toCents(segment.initial_deposit);
  }
  for (const entry of entries || []) {
    if (isCurrentRow(entry) && (isResultRow(entry) || isMovementRow(entry))) total += entryCents(entry);
  }
  return total;
}

/**
 * Hours played. Sessions are recorded as a start and end clock time on the
 * entry's own day, so a 9 PM to 3 AM session used to come out at -18 hours,
 * dragging total hours and the hourly rate negative. An end before the start
 * means the session ran past midnight.
 */
export function sessionHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const start = new Date(startTime).getTime();
  let end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end === start) return 0;
  if (end < start) end += DAY_MS * Math.ceil((start - end) / DAY_MS);
  return (end - start) / HOUR_MS;
}

/**
 * The end time to store for a session typed as two clock times on one day:
 * an end before the start is the next morning. Inputs and output are
 * 'YYYY-MM-DDTHH:MM:SS' wall-clock strings.
 */
export function sessionEndStamp(day, startClock, endClock) {
  if (!endClock) return null;
  if (!startClock || endClock >= startClock) return day + 'T' + endClock + ':00';
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10) + 'T' + endClock + ':00';
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/** "$1,234.50"; negative values read "-$1,234.50". Accepts cents. */
export function formatCents(cents) {
  const value = Math.round(cents);
  return (value < 0 ? '-' : '') + usd.format(Math.abs(value) / 100);
}
