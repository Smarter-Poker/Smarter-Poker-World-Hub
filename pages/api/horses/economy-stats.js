/**
 * ECONOMY STATS API - Admin Dashboard
 * ===========================================================================
 * Aggregates diamond economy data for the /horses admin Economy tab.
 * Returns: transactions log, totals in/out, purchases (revenue in USD),
 * VIP subscriptions, live VIP points, and user counts.
 *
 * PHASE 1 NOTE (2026-09-02). Rebuilt onto src/lib/horses/operatorRoute.js:
 * money.read, one service-role client with no anon fallback, and the shared
 * envelope. The transaction log and the purchase list now page
 * ({ rows, total, limit, offset, hasMore } under `pages`) while keeping the
 * legacy `transactions` and `recentPurchases` arrays the console reads today.
 * The transaction page defaults to 100 rather than the console-wide 50 so the
 * operator's visible log does not silently halve on the release that added the
 * pager.
 * ===========================================================================
 */
import { withOperatorRoute } from '../../../src/lib/horses/operatorRoute.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { paging, runPaged, pagedResult } from '../../../src/lib/horses/paged.js';

// Upper bound on any unbounded row pull in this route.
const ROW_CAP = 500;
const TX_CAP = 20000;
// vip_points holds one row per VIP holder (585 in production). The cap is an
// order of magnitude above that so the totals are whole-table today, and
// `vipPoints.truncated` says so honestly if it ever is not.
const VIP_POINTS_CAP = 5000;

const TX_PAGE = { defaultLimit: 100, max: 200 };
const PURCHASE_PAGE = { defaultLimit: 20, max: 200 };

export const spec = {
  name: 'horses.economy-stats',
  methods: ['GET'],
  permission: PERMISSIONS.MONEY_READ,
  limit: 'read',
};

export async function handle({ db, query }) {
  const txPage = paging(query, TX_PAGE);
  const purchasePage = paging(query, PURCHASE_PAGE);

  // A transaction counts as a REWARD when its type matches an action_key in
  // diamond_reward_catalog - the same definition award_diamonds_v2 uses. This
  // used to be expressed as a PostgREST embed
  // (`diamond_reward_catalog!inner(action_key)`), but there is NO foreign key
  // between diamond_transactions and diamond_reward_catalog in production, so
  // PostgREST rejected it with PGRST200 on every call. The error was never
  // checked, so totalDiamondsEarned and totalRewardClaims silently rendered 0
  // forever. The catalog is now read directly and matched server-side.
  const { data: catalogRows, error: catalogError } = await db
    .from('diamond_reward_catalog')
    .select('action_key');

  // One failed source must not blank the whole tab. Every OTHER source in this
  // route is already collected into failedSources and the page renders a
  // banner for it; this one alone 500'd, so a catalog hiccup took down ten
  // working panels with it. Same treatment now.
  const failedSourcesEarly = [];
  if (catalogError) {
    console.warn('[EconomyStats] diamond_reward_catalog error:', catalogError.message || catalogError);
    failedSourcesEarly.push('diamond_reward_catalog');
  }

  const actionKeys = (catalogRows || []).map((r) => r.action_key).filter(Boolean);

  const [
    transactionsResult,
    rewardsByTxTypeResult,
    rewardsByTypeResult,
    diamondPurchasesResult,
    vipSubsResult,
    totalUsersResult,
    newUsersResult,
    recentUsersResult,
    vipPointsResult,
    vipLedgerCountResult,
  ] = await Promise.all([
    // 1. Recent diamond transactions, paged.
    runPaged(
      db
        .from('diamond_transactions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false }),
      txPage
    ),

    // 2. Total diamonds earned via rewards (all time).
    //
    // Reads the LEDGER, not diamond_reward_claims. That table looks like the
    // right source and is not: award_diamonds_v2 never writes it (verified
    // against prosrc), so it holds only legacy v1 rows and stopped growing on
    // 2026-07-25.
    //
    // Two queries because the ledger records the action in EITHER column:
    // older rows carry it in `type` with `transaction_type` null, newer rows
    // populate both. They are de-duplicated by id.
    actionKeys.length
      ? db
          .from('diamond_transactions')
          .select('id, amount')
          .gt('amount', 0)
          .in('transaction_type', actionKeys)
          .limit(TX_CAP)
      : Promise.resolve({ data: [], error: null }),

    actionKeys.length
      ? db
          .from('diamond_transactions')
          .select('id, amount')
          .gt('amount', 0)
          .in('type', actionKeys)
          .limit(TX_CAP)
      : Promise.resolve({ data: [], error: null }),

    // 3. Diamond purchases (Stripe). Revenue is summed over the most recent
    // ROW_CAP rows, which is a different bound from the page the UI renders.
    db
      .from('diamond_purchases')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(ROW_CAP),

    // 4. VIP subscriptions.
    //
    // KEPT, but it is empty: vip_subscriptions has ZERO rows in production.
    // The live VIP system is vip_points / vip_points_ledger, read separately
    // below, so the tab has a true number to show instead of a permanent 0/0.
    db.from('vip_subscriptions').select('*').order('created_at', { ascending: false }).limit(ROW_CAP),

    // 5. Total user count
    db.from('profiles').select('id', { count: 'exact', head: true }),

    // 6. New users (last 7 days)
    db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // 7. Recent users (last 10 signups with details).
    // `email` was selected and never returned - ten real addresses pulled on
    // every poll of this endpoint for nothing. The same PII was already
    // dropped from the top holders query in anti-abuse.js for this reason.
    db
      .from('profiles')
      .select('id, username, full_name, created_at')
      .order('created_at', { ascending: false })
      .limit(10),

    // 8. LIVE VIP system - vip_points holds one row per holder (585 in
    // production) with current_points / lifetime_points. Summed here in JS
    // rather than with a PostgREST aggregate because aggregate functions are
    // DISABLED on this project (`select=points.sum()` returns PGRST123,
    // verified 2026-08-26), so `.sum()` cannot be used anywhere in this repo.
    db.from('vip_points').select('user_id, current_points, lifetime_points').limit(VIP_POINTS_CAP),

    // 9. The VIP points ledger.
    //
    // This USED to be `{ count: 'exact', head: true }`. On the live 3.4M-row
    // table that count takes 8.5 SECONDS on its own (measured against
    // production 2026-08-26), and sitting inside this Promise.all it pushed
    // the whole route past its budget - /api/horses/economy-stats was
    // returning 500 and the Economy tab was dead. Caught by walking the panel
    // in a real browser; no amount of reading the code would have shown it.
    //
    // An exact row count of a ledger is not worth eight seconds of an
    // operator's time. The most recent entry is enough to say whether the
    // ledger is live, and it is an index hit.
    db.from('vip_points_ledger').select('created_at').order('created_at', { ascending: false }).limit(1),
  ]);

  // Every result is checked. None of these were checked before, so a failing
  // query rendered as a confident 0 on the dashboard.
  const named = [
    ['diamond_transactions', transactionsResult],
    ['reward transactions (transaction_type)', rewardsByTxTypeResult],
    ['reward transactions (type)', rewardsByTypeResult],
    ['diamond_purchases', diamondPurchasesResult],
    ['vip_subscriptions', vipSubsResult],
    ['profiles total count', totalUsersResult],
    ['profiles new-user count', newUsersResult],
    ['profiles recent users', recentUsersResult],
    ['vip_points', vipPointsResult],
    ['vip_points_ledger latest entry', vipLedgerCountResult],
  ];
  // PARTIAL FAILURE IS NOT TOTAL FAILURE.
  //
  // This used to `return 500` the moment ANY one of the ten sources errored,
  // which turned a single slow or broken query into a blank Economy tab. The
  // original sin was the opposite - unchecked results rendering as a confident
  // 0 - and the fix for that overcorrected.
  //
  // Now: every failure is named and surfaced, the sources that DID load still
  // render, and the UI shows the `failedSources` banner it already knows how
  // to draw.
  const failed = named.filter(([, r]) => r?.error);
  failed.forEach(([label, r]) => console.warn(`[EconomyStats] ${label} error:`, r.error?.message || r.error));
  const failedSources = [...failedSourcesEarly, ...failed.map(([label]) => label)];

  // Calculate aggregates. De-duplicate the two reward queries by id so rows
  // carrying the action in both columns are not counted twice.
  const rewardById = new Map();
  [...(rewardsByTxTypeResult.data || []), ...(rewardsByTypeResult.data || [])].forEach((r) => {
    if (r?.id != null) rewardById.set(r.id, r);
  });
  const rewardClaims = Array.from(rewardById.values());
  const totalDiamondsEarned = rewardClaims.reduce((sum, c) => sum + (c.amount || 0), 0);

  const transactions = transactionsResult.data || [];
  // Raw ledger rows name the column `transaction_type`; `type` is only
  // populated on some rows. Reading t.type alone missed every row that used
  // the other column.
  const totalDiamondsSpent = transactions
    .filter((t) => {
      const kind = t.type || t.transaction_type;
      return kind === 'spent' || kind === 'purchase' || (t.amount && t.amount < 0);
    })
    .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

  const purchases = diamondPurchasesResult.data || [];

  // REVENUE.
  //
  // This summed `p.amount_paid || p.price`. diamond_purchases has NEITHER
  // column, so every row contributed 0 and "Purchase Revenue" was permanently
  // $0.00. The real column is `price_usd numeric`, and it is ALREADY
  // DENOMINATED IN DOLLARS (2.00 means two dollars, not two cents) - so it
  // must NOT be divided by 100 anywhere.
  //
  // Only money that actually settled counts: status 'completed' and not
  // refunded. Pending checkouts and refunds are revenue that never arrived or
  // went back out.
  const settledPurchases = purchases.filter((p) => p.status === 'completed' && !p.refunded_at);
  const totalPurchaseRevenueUsd =
    Math.round(settledPurchases.reduce((sum, p) => sum + (Number(p.price_usd) || 0), 0) * 100) / 100;
  const totalDiamondsSold = settledPurchases.reduce(
    (sum, p) => sum + (p.diamonds_amount || 0) + (p.bonus_diamonds || 0),
    0
  );

  const vipSubs = vipSubsResult.data || [];
  const activeVipCount = vipSubs.filter((s) => s.status === 'active' || s.status === 'trialing').length;

  // LIVE VIP system. vip_subscriptions is empty in production; these are the
  // numbers the Economy tab can truthfully show.
  const vipLedgerLatest = vipLedgerCountResult.data?.[0]?.created_at || null;
  const vipPointRows = vipPointsResult.data || [];
  const vipPointsHolders = vipPointRows.length;
  const vipPointsOutstanding = vipPointRows.reduce((sum, r) => sum + (Number(r.current_points) || 0), 0);
  const vipPointsLifetime = vipPointRows.reduce((sum, r) => sum + (Number(r.lifetime_points) || 0), 0);

  const transactionRows = transactions.map((t) => ({
    id: t.id,
    user_id: t.user_id,
    amount: t.amount,
    type: t.type || t.transaction_type,
    source: t.source,
    description: t.description,
    created_at: t.created_at,
  }));

  const purchaseRows = purchases
    .slice(purchasePage.offset, purchasePage.offset + purchasePage.limit)
    .map((p) => ({
      id: p.id,
      user_id: p.user_id,
      package_name: p.package_name,
      // Dollars. Do not divide by 100.
      price_usd: Number(p.price_usd) || 0,
      diamonds_amount: p.diamonds_amount || 0,
      bonus_diamonds: p.bonus_diamonds || 0,
      created_at: p.created_at,
      completed_at: p.completed_at,
      refunded_at: p.refunded_at,
      status: p.status,
    }));

  const vipSubRows = vipSubs.slice(0, 20).map((s) => ({
    id: s.id,
    user_id: s.user_id,
    plan: s.plan || s.tier,
    status: s.status,
    created_at: s.created_at,
    current_period_end: s.current_period_end,
  }));

  const recentUsers = (recentUsersResult.data || []).map((u) => ({
    id: u.id,
    username: u.username,
    full_name: u.full_name,
    created_at: u.created_at,
  }));

  return {
    // Transaction log, paged.
    transactions: transactionRows,

    // Aggregate stats
    stats: {
      totalUsers: totalUsersResult.count || 0,
      newUsers7d: newUsersResult.count || 0,
      totalDiamondsEarned,
      totalDiamondsSpent,
      totalRewardClaims: rewardClaims.length,
      diamondPurchaseCount: purchases.length,
      diamondPurchaseCompletedCount: settledPurchases.length,
      // UNIT: US DOLLARS, already. Render as-is with a $ sign.
      // Do NOT divide by 100 - price_usd is dollars, not cents.
      diamondPurchaseRevenue: totalPurchaseRevenueUsd,
      diamondPurchaseRevenueUsd: totalPurchaseRevenueUsd,
      diamondPurchaseRevenueUnit: 'usd',
      diamondsSold: totalDiamondsSold,
      // Revenue is summed over the most recent ROW_CAP purchase rows, not the
      // whole table. Three rows exist in production so it is currently every
      // one of them; this flag says so rather than letting a capped figure
      // pass as lifetime.
      diamondPurchaseTruncated: purchases.length >= ROW_CAP,
      diamondPurchaseTotal: diamondPurchasesResult.count ?? null,
      vipSubscriptionCount: vipSubs.length,
      activeVipCount,
    },

    // Named sources that failed to load, if any. The tab renders these in a
    // banner and still shows everything that did load.
    failedSources: failedSources.length ? failedSources : undefined,

    // LIVE VIP system (vip_subscriptions is empty in production).
    vipPoints: {
      holders: vipPointsHolders,
      pointsOutstanding: vipPointsOutstanding,
      pointsLifetime: vipPointsLifetime,
      // Not a row count: see the query above. An exact count of this 3.4M-row
      // ledger costs 8.5 seconds and was 500ing the whole tab.
      ledgerLastEntryAt: vipLedgerLatest,
      truncated: vipPointRows.length >= VIP_POINTS_CAP,
      note: 'Live VIP system. vip_subscriptions carries no rows in production; VIP standing is tracked in vip_points and vip_points_ledger.',
    },

    // Detail lists.
    // Real diamond_purchases columns. The previous shape read amount_paid /
    // price / diamonds_received / diamonds, none of which exist, so every
    // field here was undefined.
    recentPurchases: purchaseRows,

    vipSubscriptions: vipSubRows,

    recentUsers,

    pages: {
      transactions: { ...pagedResult(transactionsResult, txPage), rows: transactionRows },
      purchases: {
        rows: purchaseRows,
        total: diamondPurchasesResult.count ?? purchases.length,
        limit: purchasePage.limit,
        offset: purchasePage.offset,
        hasMore: purchasePage.offset + purchaseRows.length < purchases.length,
      },
    },
    limit: txPage.limit,
    offset: txPage.offset,
  };
}

export default withOperatorRoute(spec, handle);
