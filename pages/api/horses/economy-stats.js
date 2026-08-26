import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * ECONOMY STATS API — Admin Dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * Aggregates diamond economy data for the /horses admin Economy tab.
 * Returns: transactions log, totals in/out, purchases (revenue in USD),
 * VIP subscriptions, live VIP points, and user counts.
 * Auth-gated: requires valid session.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// Upper bound on any unbounded row pull in this route.
const ROW_CAP = 500;
const TX_CAP = 20000;
// vip_points holds one row per VIP holder (585 in production). The cap is an
// order of magnitude above that so the totals are whole-table today, and
// `vipPoints.truncated` says so honestly if it ever is not.
const VIP_POINTS_CAP = 5000;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // Auth: require valid JWT session
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Authorization required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      // BUG #240 FIX: Require admin/superadmin role — economy data is sensitive
      const { data: profile } = await getSupabase()
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          return res.status(403).json({ error: 'Admin access required' });
      }

      try {
          // A transaction counts as a REWARD when its type matches an
          // action_key in diamond_reward_catalog — the same definition
          // award_diamonds_v2 uses. This used to be expressed as a PostgREST
          // embed (`diamond_reward_catalog!inner(action_key)`), but there is NO
          // foreign key between diamond_transactions and
          // diamond_reward_catalog in production, so PostgREST rejected it with
          // PGRST200 on every call. The error was never checked, so
          // totalDiamondsEarned and totalRewardClaims silently rendered 0
          // forever. The catalog is now read directly and matched server-side.
          const { data: catalogRows, error: catalogError } = await getSupabase()
              .from('diamond_reward_catalog')
              .select('action_key');

          if (catalogError) {
              console.warn('[EconomyStats] diamond_reward_catalog error:', catalogError.message || catalogError);
              return res.status(500).json({ error: 'Failed to load economy stats' });
          }

          const actionKeys = (catalogRows || []).map(r => r.action_key).filter(Boolean);

          // ── Parallel data fetching for speed ──
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
              // 1. Recent diamond transactions (last 100)
              getSupabase()
                  .from('diamond_transactions')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .limit(100),

              // 2. Total diamonds earned via rewards (all time).
              //
              // Reads the LEDGER, not diamond_reward_claims. That table looks
              // like the right source and is not: award_diamonds_v2 never
              // writes it (verified against prosrc), so it holds only legacy
              // v1 rows and stopped growing on 2026-07-25.
              //
              // Two queries because the ledger records the action in EITHER
              // column: older rows carry it in `type` with `transaction_type`
              // null, newer rows populate both. They are de-duplicated by id.
              actionKeys.length
                  ? getSupabase()
                      .from('diamond_transactions')
                      .select('id, amount')
                      .gt('amount', 0)
                      .in('transaction_type', actionKeys)
                      .limit(TX_CAP)
                  : Promise.resolve({ data: [], error: null }),

              actionKeys.length
                  ? getSupabase()
                      .from('diamond_transactions')
                      .select('id, amount')
                      .gt('amount', 0)
                      .in('type', actionKeys)
                      .limit(TX_CAP)
                  : Promise.resolve({ data: [], error: null }),

              // 3. Diamond purchases (Stripe)
              getSupabase()
                  .from('diamond_purchases')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .limit(ROW_CAP),

              // 4. VIP subscriptions.
              //
              // KEPT, but it is empty: vip_subscriptions has ZERO rows in
              // production. The live VIP system is vip_points /
              // vip_points_ledger, read separately below, so the tab has a
              // true number to show instead of a permanent 0 / 0.
              getSupabase()
                  .from('vip_subscriptions')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .limit(ROW_CAP),

              // 5. Total user count
              getSupabase()
                  .from('profiles')
                  .select('id', { count: 'exact', head: true }),

              // 6. New users (last 7 days)
              getSupabase()
                  .from('profiles')
                  .select('id', { count: 'exact', head: true })
                  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

              // 7. Recent users (last 10 signups with details)
              getSupabase()
                  .from('profiles')
                  .select('id, username, full_name, email, created_at')
                  .order('created_at', { ascending: false })
                  .limit(10),

              // 8. LIVE VIP system — vip_points holds one row per holder
              // (585 in production) with current_points / lifetime_points.
              // Summed here in JS rather than with a PostgREST aggregate
              // because aggregate functions are DISABLED on this project
              // (`select=points.sum()` returns PGRST123, verified
              // 2026-08-26), so `.sum()` cannot be used anywhere in this repo.
              getSupabase()
                  .from('vip_points')
                  .select('user_id, current_points, lifetime_points')
                  .limit(VIP_POINTS_CAP),

              // 9. Size of the VIP points ledger (3.4M rows) — head count only.
              getSupabase()
                  .from('vip_points_ledger')
                  .select('id', { count: 'exact', head: true }),
          ]);

          // Every result is checked. None of these were checked before, so a
          // failing query rendered as a confident 0 on the dashboard.
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
              ['vip_points_ledger count', vipLedgerCountResult],
          ];
          const failed = named.filter(([, r]) => r?.error);
          if (failed.length > 0) {
              failed.forEach(([label, r]) => console.warn(`[EconomyStats] ${label} error:`, r.error.message || r.error));
              return res.status(500).json({
                  error: 'Failed to load economy stats',
                  failedSources: failed.map(([label]) => label),
              });
          }

          // Calculate aggregates. De-duplicate the two reward queries by id so
          // rows carrying the action in both columns are not counted twice.
          const rewardById = new Map();
          [...(rewardsByTxTypeResult.data || []), ...(rewardsByTypeResult.data || [])]
              .forEach(r => { if (r?.id != null) rewardById.set(r.id, r); });
          const rewardClaims = Array.from(rewardById.values());
          const totalDiamondsEarned = rewardClaims.reduce((sum, c) => sum + (c.amount || 0), 0);

          const transactions = transactionsResult.data || [];
          // Raw ledger rows name the column `transaction_type`; `type` is only
          // populated on some rows. Reading t.type alone missed every row that
          // used the other column.
          const totalDiamondsSpent = transactions
              .filter(t => {
                  const kind = t.type || t.transaction_type;
                  return kind === 'spent' || kind === 'purchase' || (t.amount && t.amount < 0);
              })
              .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

          const purchases = diamondPurchasesResult.data || [];

          // REVENUE.
          //
          // This summed `p.amount_paid || p.price`. diamond_purchases has
          // NEITHER column, so every row contributed 0 and "Purchase Revenue"
          // was permanently $0.00. The real column is `price_usd numeric`,
          // and it is ALREADY DENOMINATED IN DOLLARS (2.00 means two dollars,
          // not two cents) — so it must NOT be divided by 100 anywhere.
          //
          // Only money that actually settled counts: status 'completed' and
          // not refunded. Pending checkouts and refunds are revenue that
          // never arrived or went back out.
          const settledPurchases = purchases.filter(
              p => p.status === 'completed' && !p.refunded_at
          );
          const totalPurchaseRevenueUsd = Math.round(
              settledPurchases.reduce((sum, p) => sum + (Number(p.price_usd) || 0), 0) * 100
          ) / 100;
          const totalDiamondsSold = settledPurchases.reduce(
              (sum, p) => sum + (p.diamonds_amount || 0) + (p.bonus_diamonds || 0), 0
          );

          const vipSubs = vipSubsResult.data || [];
          const activeVipCount = vipSubs.filter(s =>
              s.status === 'active' || s.status === 'trialing'
          ).length;

          // LIVE VIP system. vip_subscriptions is empty in production; these
          // are the numbers the Economy tab can truthfully show.
          const vipPointRows = vipPointsResult.data || [];
          const vipPointsHolders = vipPointRows.length;
          const vipPointsOutstanding = vipPointRows.reduce((sum, r) => sum + (Number(r.current_points) || 0), 0);
          const vipPointsLifetime = vipPointRows.reduce((sum, r) => sum + (Number(r.lifetime_points) || 0), 0);

          return res.status(200).json({
              success: true,

              // Transaction log (last 100)
              transactions: transactions.map(t => ({
                  id: t.id,
                  user_id: t.user_id,
                  amount: t.amount,
                  type: t.type || t.transaction_type,
                  source: t.source,
                  description: t.description,
                  created_at: t.created_at,
              })),

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
                  // Do NOT divide by 100 — price_usd is dollars, not cents.
                  diamondPurchaseRevenue: totalPurchaseRevenueUsd,
                  diamondPurchaseRevenueUsd: totalPurchaseRevenueUsd,
                  diamondPurchaseRevenueUnit: 'usd',
                  diamondsSold: totalDiamondsSold,
                  // Revenue is summed over the most recent ROW_CAP purchase
                  // rows, not the whole table. Three rows exist in production
                  // so it is currently every one of them; this flag says so
                  // rather than letting a capped figure pass as lifetime.
                  diamondPurchaseTruncated: purchases.length >= ROW_CAP,
                  vipSubscriptionCount: vipSubs.length,
                  activeVipCount,
              },

              // LIVE VIP system (vip_subscriptions is empty in production).
              vipPoints: {
                  holders: vipPointsHolders,
                  pointsOutstanding: vipPointsOutstanding,
                  pointsLifetime: vipPointsLifetime,
                  ledgerEntries: vipLedgerCountResult.count ?? null,
                  truncated: vipPointRows.length >= VIP_POINTS_CAP,
                  note: 'Live VIP system. vip_subscriptions carries no rows in production; VIP standing is tracked in vip_points and vip_points_ledger.',
              },

              // Detail lists
              // Real diamond_purchases columns. The previous shape read
              // amount_paid / price / diamonds_received / diamonds, none of
              // which exist, so every field here was undefined.
              recentPurchases: purchases.slice(0, 20).map(p => ({
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
              })),

              vipSubscriptions: vipSubs.slice(0, 20).map(s => ({
                  id: s.id,
                  user_id: s.user_id,
                  plan: s.plan || s.tier,
                  status: s.status,
                  created_at: s.created_at,
                  current_period_end: s.current_period_end,
              })),

              recentUsers: (recentUsersResult.data || []).map(u => ({
                  id: u.id,
                  username: u.username,
                  full_name: u.full_name,
                  created_at: u.created_at,
              })),
          });
      } catch (error) {
          console.warn('[EconomyStats] Error:', error.message || error);
          return res.status(500).json({ error: 'Failed to load economy stats' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
