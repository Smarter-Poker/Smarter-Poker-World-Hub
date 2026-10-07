/* THE DIAMOND WALLET CONTRACT, AS PRODUCTION ACTUALLY DECLARES IT.
 * -------------------------------------------------------------------------
 * ONE list, read by two readers:
 *
 *   __tests__/the-route-and-the-client-agree.test.mjs   offline, every PR:
 *       pins the CODE on both sides of the boundary against this snapshot.
 *   scripts/ci/diamond-wallet-live-smoke.mjs            on demand, by hand:
 *       pins this snapshot against the LIVE database and the live site.
 *
 * Two lists is how the two halves of one boundary drift while both stay
 * green, which is the defect phase 8 exists to end. So there is one, and it
 * is in a file neither side of the boundary owns.
 *
 * PROVENANCE. Every constant below was read off production
 * (kuklfnapbkmacvwxktbh) on 2026-09-29 with read-only SQL - no assumption,
 * no copy from a migration that may not have applied:
 *
 *   STORED_COLUMNS      information_schema.columns
 *   COMPUTED_COLUMNS    pg_proc: a function whose single argument is the
 *                       table's own composite type is a PostgREST computed
 *                       column. It is NOT in `*` and must be named.
 *   LIFETIME_TOTALS     pg_get_function_result('fn_diamond_lifetime_totals')
 *   WALLET_SUMMARY      the jsonb_build_object in the function's own body
 *   FLOW_BY_KIND        the jsonb_build_object in the function's own body
 *   BUCKET_KEYS         every THEN '<key>' and the final ELSE in
 *                       fn_diamond_kind_bucket, cross-checked against the 15
 *                       buckets the live ledger currently produces
 *
 * WHY THE TWO jsonb FUNCTIONS WERE READ FROM THEIR BODIES RATHER THAN CALLED.
 * Both refuse a caller that is neither the subject nor service_role
 * (`wallet_summary_is_own_only`, ERRCODE 42501), and a read-only analyst
 * session is neither. Their own RETURN jsonb_build_object is the same truth
 * and needed no elevation. The live smoke calls them for real when it is
 * given a key, and says COULD NOT TELL when it is not.
 *
 * IF YOU CHANGE THE DATABASE, CHANGE THIS FILE IN THE SAME PULL REQUEST.
 */

/** The snapshot's own date, printed by the smoke so a stale pin is visible. */
export const SNAPSHOT_TAKEN = '2026-09-29';

/** public.diamond_transactions, in ordinal order. What `select('*')` returns. */
export const STORED_COLUMNS = [
  'id',
  'user_id',
  'type',
  'amount',
  'balance_after',
  'description',
  'reference_id',
  'created_at',
  'transaction_type',
  'source',
  'metadata',
  'counterparty',
  'issuance_class',
];

/*
 * PostgREST COMPUTED columns on diamond_transactions.
 *
 * `player_line(diamond_transactions) -> text` is the ledger's own
 * player-facing line (phase 6, over fn_diamond_ledger_line). A computed
 * column is not part of `*` and does not appear in information_schema, so
 * nothing that snapshots stored columns can see it - and a select that stops
 * naming it returns rows with the field silently absent. The row still
 * renders; the line just goes blank. That is the whole reason this entry
 * exists separately from STORED_COLUMNS.
 */
export const COMPUTED_COLUMNS = ['player_line'];

/** fn_diamond_lifetime_totals(p_user_id uuid) RETURNS TABLE(...) */
export const LIFETIME_TOTALS_KEYS = ['lifetime_earned', 'lifetime_spent', 'credits', 'debits'];

/** fn_diamond_wallet_summary(p_user_id uuid) RETURNS jsonb - top level. */
export const WALLET_SUMMARY_KEYS = [
  'user_id',
  'on_hand',
  'collateral',
  'sendable',
  'in_arena',
  'arena_seats',
  'arena_entries',
  'arena',
  'lifetime_earned',
  'lifetime_spent',
  'read_at',
];

/** ...and its nested `arena` object, which is NULL when there is no arena. */
export const WALLET_SUMMARY_ARENA_KEYS = [
  'club_id',
  'name',
  'slug',
  'cash_games_enabled',
  'tournaments_enabled',
  'open_cash_tables',
  'min_cash_buy_in',
  'cheapest_table',
];

/** fn_diamond_flow_by_kind(p_user_id uuid) RETURNS jsonb - top level. */
export const FLOW_KEYS = [
  'user_id',
  'spent',
  'earned',
  'spent_total',
  'earned_total',
  'spent_last30',
  'earned_last30',
  'read_at',
];

/** ...and one element of its `spent` / `earned` arrays. */
export const FLOW_LINE_KEYS = [
  'bucket',
  'label',
  'lifetime',
  'lifetime_count',
  'last30',
  'last30_count',
];

/*
 * EVERY BUCKET fn_diamond_kind_bucket CAN EMIT, with the label it emits
 * beside it. Twenty-two: twenty-one reachable by a THEN, plus `other_earned`,
 * which is the final ELSE and therefore reachable by every credit kind
 * nobody has classified yet - the one most likely to appear without warning.
 *
 * `other_earned` has no arm in the function's own label CASE and falls to its
 * ELSE, so it prints as 'Other', the same label `other_spent` carries. Two
 * buckets, one row in the breakdown. That is the function's behaviour today
 * and it is recorded rather than corrected here: this file is a snapshot, not
 * an opinion.
 *
 * A bucket the interface does not render is a figure a player watches vanish,
 * so the offline test proves the wallet renders buckets by iterating them
 * rather than by matching an allowlist, and the live smoke proves this list
 * still is the database's list.
 */
export const BUCKET_LABELS = Object.freeze({
  // spent side
  arena: 'Diamond Arena Seats',
  // Added to fn_diamond_kind_bucket by Club Arena migration 20261005183028
  // (the Diamond cash rake, kind cash_rake). Read off production 2026-10-07.
  arena_rake: 'Diamond Arena Rake',
  gifts_sent: 'Gifts To Friends',
  transfers: 'Transfers',
  vip: 'VIP Membership',
  club_chips: 'Club Chip Purchases',
  games: 'Games And Arcade',
  store: 'Store Items And Perks',
  purchase_refunds: 'Refunded Purchases',
  adjustments: 'Adjustments',
  other_spent: 'Other',
  // earned side
  arena_cash_outs: 'Diamond Arena Cash-Outs',
  gifts_received: 'Gifts From Friends',
  grants: 'Union And Club Grants',
  purchases: 'Diamonds You Bought',
  rewards: 'Daily Rewards And Challenges',
  bonuses: 'Bonuses And Promotions',
  winnings: 'Prizes And Winnings',
  vip_bonuses: 'VIP Bonuses',
  social: 'Social And Community',
  refunds: 'Refunds',
  other_earned: 'Other',
});

/** The bucket keys alone, sorted, for set comparison. */
export const BUCKET_KEYS = Object.keys(BUCKET_LABELS).sort();

/** The two ends of the boundary this contract governs. */
export const ROUTE_PATH = 'pages/api/store/diamond-transactions.js';
export const CLIENT_PATH = 'src/components/store/DiamondWalletModal.jsx';

/** The Postgres objects the wallet cannot work without. */
export const REQUIRED_FUNCTIONS = [
  'fn_diamond_wallet_summary',
  'fn_diamond_lifetime_totals',
  'fn_diamond_flow_by_kind',
  'fn_diamond_kind_bucket',
  'fn_diamond_kind_row_label',
  'fn_diamond_ledger_line',
  'player_line',
];
