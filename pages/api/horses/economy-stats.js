import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * 💎 ECONOMY STATS API — Admin Dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * Aggregates diamond economy data for the /horses admin Economy tab.
 * Returns: transactions log, totals in/out, purchases, VIP subs, user counts.
 * Auth-gated: requires valid session.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
          // ── Parallel data fetching for speed ──
          const [
              transactionsResult,
              rewardClaimsResult,
              diamondPurchasesResult,
              vipSubsResult,
              totalUsersResult,
              newUsersResult,
              recentUsersResult,
          ] = await Promise.all([
              // 1. Recent diamond transactions (last 100)
              getSupabase()
                  .from('diamond_transactions')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .limit(100),

              // 2. Total diamonds earned via rewards (all time)
              getSupabase()
                  .from('diamond_reward_claims')
                  .select('diamonds_awarded'),

              // 3. Diamond purchases (Stripe)
              getSupabase()
                  .from('diamond_purchases')
                  .select('*')
                  .order('created_at', { ascending: false }),

              // 4. VIP subscriptions
              getSupabase()
                  .from('vip_subscriptions')
                  .select('*')
                  .order('created_at', { ascending: false }),

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
          ]);

          // Calculate aggregates
          const rewardClaims = rewardClaimsResult.data || [];
          const totalDiamondsEarned = rewardClaims.reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);

          const transactions = transactionsResult.data || [];
          const totalDiamondsSpent = transactions
              .filter(t => (t.type === 'spent' || t.type === 'purchase' || (t.amount && t.amount < 0)))
              .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

          const purchases = diamondPurchasesResult.data || [];
          const totalPurchaseRevenue = purchases.reduce((sum, p) => sum + (p.amount_paid || p.price || 0), 0);

          const vipSubs = vipSubsResult.data || [];
          const activeVipCount = vipSubs.filter(s =>
              s.status === 'active' || s.status === 'trialing'
          ).length;

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
                  diamondPurchaseRevenue: totalPurchaseRevenue,
                  vipSubscriptionCount: vipSubs.length,
                  activeVipCount,
              },

              // Detail lists
              recentPurchases: purchases.slice(0, 20).map(p => ({
                  id: p.id,
                  user_id: p.user_id,
                  amount_paid: p.amount_paid || p.price,
                  diamonds_received: p.diamonds_received || p.diamonds,
                  created_at: p.created_at,
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
