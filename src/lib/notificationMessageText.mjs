/*
 * FIGURES IN A FINANCIAL DIGEST GET THEIR SEPARATORS (2026-10-17).
 *
 * The Weekly Revenue Digest is written by the database as one line of bare
 * numerics ("Cash Rake 1536191.30 | Minted 80201150.93 ..."). A digit run of
 * five or more, with or without its cents, is printed with thousands
 * separators and its own number of decimal places, so nothing is rounded and
 * nothing changes but the grouping. Only digest notifications are touched;
 * every other notification prints exactly as written.
 */
const BARE_FIGURE = /(^|[\s(|:])(-?)(\d{5,})(\.\d+)?(?=$|[\s)|,;])/gu;

export function notificationMessageText(notification) {
  const message = notification?.message;
  if (message == null) return '';
  const text = String(message);
  if (notification?.type !== 'financial_digest') return text;
  return text.replace(BARE_FIGURE, (_m, lead, sign, whole, cents = '') => {
    const grouped = Number(whole).toLocaleString('en-US');
    return `${lead}${sign}${grouped}${cents}`;
  });
}
