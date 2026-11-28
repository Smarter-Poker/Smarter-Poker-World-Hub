// Ledger dates (entry_date, trip start_date/end_date) are calendar days the
// player recorded in their own time zone, stored as 'YYYY-MM-DD'.
//
// Two mistakes kept shifting them by a day for anyone west of UTC:
// - `new Date().toISOString().slice(0, 10)` is the UTC date, so after 6 PM in
//   Chicago "today" was already tomorrow;
// - `new Date('2026-01-01')` is UTC midnight, which is Dec 31 in Chicago, so
//   displays showed the previous day and the tax report moved Jan 1 into the
//   prior year.

const pad = (n) => String(n).padStart(2, '0');

/** A Date's calendar day in the viewer's own time zone, as YYYY-MM-DD. */
export function localDay(date = new Date()) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/** The local calendar day `days` before today (0 = today). */
export function localDayOffset(days, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 12);
  return localDay(d);
}

/**
 * Parse a stored ledger day as local noon, so formatting and getFullYear /
 * getMonth return the day the player recorded. Full timestamps are parsed as-is.
 */
export function parseLedgerDay(value) {
  if (!value) return new Date(NaN);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(text + 'T12:00:00') : new Date(text);
}
