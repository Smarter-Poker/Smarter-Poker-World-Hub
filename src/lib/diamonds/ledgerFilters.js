/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ONE DEFINITION OF WHAT A DIAMOND ROW IS, FOR THE SERVER AND THE BROWSER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The wallet's filter tabs (All / Purchases / Earned / Spent / Gifts /
 * Refunds) used to be decided in two different places at once: the badge
 * counts and the visible list were computed in DiamondWalletModal.jsx over
 * whatever page happened to be loaded, while the API deliberately did no
 * filtering at all ("client handles all filtering"). Two consequences, both
 * measured on production 2026-09-05:
 *
 *  1. THE BADGES DESCRIBED THE PAGE, NOT THE WALLET. On a 416-row ledger the
 *     tabs read All (50), Refunds (31), Earned (48), Spent (2). The truth was
 *     416, 246, 390 and 25 - the Refunds badge was out by a factor of eight,
 *     and every number looked like a fact about the account.
 *
 *  2. "EARNED" WAS A HAND-MAINTAINED ALLOWLIST AND HAD FALLEN BEHIND. Thirty
 *     type names, edited by hand every time the platform learned a new way to
 *     give somebody a diamond. It was missing ten live kinds - `reconciliation`
 *     (420 rows, 679,549 diamonds), `pvp_refund` (488 rows), `adjustment`
 *     (45,645 diamonds), `live_gift_received`, `easter_egg`, `training_reward`
 *     and more: 941 credit rows worth 740,908 diamonds that a player had been
 *     paid and could not find under Earned.
 *
 * Club Arena hit (2) first and settled it on 2026-08-25, and this file adopts
 * that ruling rather than inventing a second one:
 *
 *     A CREDIT IS A POSITIVE AMOUNT. That is a fact about the row rather than
 *     a fact about our list, so it cannot go stale.
 *
 * Same reasoning for refunds: `/refund/i` matches `refund`, `pvp_refund`,
 * `tournament_refund` and `diamond_gift_refund` without anybody maintaining a
 * list. The old array named the first three and missed the fourth, so a
 * refunded gift appeared under no refund view at all.
 *
 * The tabs are VIEWS, not a partition - a refunded gift legitimately belongs
 * to both Gifts and Refunds. Do not "fix" the overlap by making them exclusive;
 * that is what dropped rows out of every tab last time.
 */

/** Kinds the Gifts tab shows: a transfer, in either direction, or its reversal. */
const GIFT_TYPES = [
  'diamond_gift_sent',
  'diamond_gift_received',
  'diamond_received',
  'diamond_gift_refund',
  'live_gift_sent',
  'live_gift_received',
];

/** Kinds the Purchases tab shows: diamonds exchanged for something. */
const PURCHASE_TYPES = [
  'purchase',
  'feature_unlock',
  'feature_purchase',
  'game_cost',
  'arcade_entry',
  'chip_purchase',
  'vip_daily',
];

/** The row's kind. Older rows carry it in `type`, newer in `transaction_type`. */
function kindOf(tx) {
  return (tx && (tx.transaction_type || tx.type)) || '';
}

const isRefundKind = (kind) => /refund/i.test(kind || '');

/**
 * Does this row belong under `filter`? The ONE predicate; the browser filters
 * the rendered list with it and the API builds the same question in SQL.
 */
function matchesFilter(tx, filter) {
  if (!filter || filter === 'all') return true;
  const kind = kindOf(tx);
  const amount = Number(tx && tx.amount) || 0;
  switch (filter) {
    case 'earned':
      return amount > 0;
    case 'spent':
      // A refund is money coming BACK. Counting it as spending told a player
      // they had spent diamonds that had been returned to them.
      return amount < 0 && !isRefundKind(kind);
    case 'refund':
      return isRefundKind(kind);
    case 'gifts':
      return GIFT_TYPES.includes(kind);
    case 'purchase':
      return PURCHASE_TYPES.includes(kind);
    default:
      return true;
  }
}

/** The tabs, in the order the wallet shows them. */
const LEDGER_FILTERS = ['all', 'purchase', 'earned', 'spent', 'gifts', 'refund'];

/**
 * Narrow a PostgREST query to one filter.
 *
 * Both columns are tested with `.or(...)` rather than a coalesce, because
 * PostgREST cannot express coalesce in a filter. Where the two columns
 * disagree this is INCLUSIVE - it shows the row under the tab that either
 * column justifies. That direction is deliberate: the defect being fixed is
 * rows going missing from a tab, so an ambiguous row is surfaced, never
 * hidden.
 */
function applyFilterToQuery(query, filter) {
  const inList = (list) => list.join(',');
  switch (filter) {
    case 'earned':
      return query.gt('amount', 0);
    case 'spent':
      /*
       * NULL IS NOT "NOT A REFUND" IN SQL, AND THAT WOULD HAVE HIDDEN ROWS.
       *
       * This was two chained `.not(...ilike...)`, which PostgREST ANDs. For a
       * row whose `transaction_type` is NULL, `NOT (NULL ILIKE '%refund%')` is
       * NULL rather than true, so the row failed the filter and vanished from
       * both the Spent list and the Spent badge - while the browser predicate
       * below, which falls back to `type`, would have counted it. The two
       * halves of one filter disagreeing is the whole class of defect this
       * module exists to end.
       *
       * Measured on production 2026-09-05 before changing it: 631 of 1,433
       * rows carry a NULL `transaction_type`, but none of those is a debit, so
       * nothing is missing from Spent today. It was a trap rather than a live
       * bug - the first debit written with only the legacy `type` column would
       * have disappeared silently.
       *
       * `coalesce` is not expressible in a PostgREST filter, so the refund test
       * is spelled out: a row is a refund if EITHER column says so. Its
       * negation - neither column says so, NULL included - is what Spent wants.
       */
      return query
        .lt('amount', 0)
        .or('transaction_type.is.null,transaction_type.not.ilike.%refund%')
        .or('type.is.null,type.not.ilike.%refund%');
    case 'refund':
      return query.or('transaction_type.ilike.%refund%,type.ilike.%refund%');
    case 'gifts':
      return query.or(
        `transaction_type.in.(${inList(GIFT_TYPES)}),type.in.(${inList(GIFT_TYPES)})`
      );
    case 'purchase':
      return query.or(
        `transaction_type.in.(${inList(PURCHASE_TYPES)}),type.in.(${inList(PURCHASE_TYPES)})`
      );
    case 'all':
    default:
      return query;
  }
}

module.exports = {
  GIFT_TYPES,
  PURCHASE_TYPES,
  LEDGER_FILTERS,
  kindOf,
  isRefundKind,
  matchesFilter,
  applyFilterToQuery,
};
