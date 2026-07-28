/**
 * POST /api/club-arena/club-leaderboard
 * 
 * Club Leaderboard — Player rankings by multiple metrics.
 * 
 * Actions:
 *   'chips'       - Top players ranked by chip balance
 *   'volume'      - Top players ranked by 7-day transaction volume
 *   'activity'    - Top players ranked by transaction count (last 7 days)
 *   'big_winners' - Players with highest net positive flow (7 days)
 * 
 * Body: { clubId, action, limit? }
 * Auth: Bearer token (any club member)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { isUUID } = require('../../../src/lib/club-arena/validate');
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      if (!applyRateLimit(req, res, 'club-arena/club-leaderboard')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action, limit } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });
      if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

      const maxLimit = Math.min(limit || 50, 100);

      // Verify membership
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership) return res.status(403).json({ error: 'Not a club member' });

      // ─── CHIPS: Top players by chip balance ──────────────────
      if (action === 'chips' || !action) {
          try {
              const { data: members } = await getSupabase()
                  .from('club_members')
                  .select('user_id, chip_balance, role, joined_at')
                  .eq('club_id', clubId)
                  .eq('status', 'active')
                  .order('chip_balance', { ascending: false })
                  .limit(maxLimit);

              const userIds = (members || []).map(m => m.user_id);
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, display_name, username, avatar_url')
                  .in('id', userIds);

              const profileMap = {};
              for (const p of (profiles || [])) profileMap[p.id] = p;

              const rankings = (members || []).map((m, i) => ({
                  rank: i + 1,
                  userId: m.user_id,
                  name: profileMap[m.user_id]?.display_name || profileMap[m.user_id]?.username || m.user_id.substring(0, 8),
                  avatar: profileMap[m.user_id]?.avatar_url || null,
                  role: m.role,
                  chips: m.chip_balance || 0,
                  joinedAt: m.joined_at,
              }));

              return res.status(200).json({ success: true, leaderboard: rankings, metric: 'chips' });
          } catch (err) {
              return res.status(500).json({ error: 'Leaderboard failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── VOLUME: Top players by 7-day transaction volume ─────
      if (action === 'volume' || action === 'activity' || action === 'big_winners') {
          try {
              const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

              const { data: transactions } = await getSupabase()
                  .from('chip_transactions')
                  .select('from_user_id, to_user_id, amount, transaction_type')
                  .eq('club_id', clubId)
                  .gte('created_at', sevenDaysAgo)
                  .limit(5000);

              // Build per-user stats
              const stats = {};
              for (const tx of (transactions || [])) {
                  const fromId = tx.from_user_id;
                  const toId = tx.to_user_id;
                  const amt = Math.abs(tx.amount || 0);

                  if (fromId) {
                      if (!stats[fromId]) stats[fromId] = { volume: 0, txCount: 0, netFlow: 0 };
                      stats[fromId].volume += amt;
                      stats[fromId].txCount++;
                      stats[fromId].netFlow -= amt;
                  }
                  if (toId) {
                      if (!stats[toId]) stats[toId] = { volume: 0, txCount: 0, netFlow: 0 };
                      stats[toId].volume += amt;
                      stats[toId].txCount++;
                      stats[toId].netFlow += amt;
                  }
              }

              // Sort by metric
              let sortKey = 'volume';
              if (action === 'activity') sortKey = 'txCount';
              if (action === 'big_winners') sortKey = 'netFlow';

              const sorted = Object.entries(stats || {})
                  .sort((a, b) => (b[1][sortKey] || 0) - (a[1][sortKey] || 0))
                  .slice(0, maxLimit);

              // Resolve profiles
              const userIds = sorted.map(([uid]) => uid);
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, display_name, username, avatar_url')
                  .in('id', userIds);

              const profileMap = {};
              for (const p of (profiles || [])) profileMap[p.id] = p;

              // Get roles
              const { data: members } = await getSupabase()
                  .from('club_members')
                  .select('user_id, role')
                  .eq('club_id', clubId)
                  .in('user_id', userIds);

              const roleMap = {};
              for (const m of (members || [])) roleMap[m.user_id] = m.role;

              const rankings = sorted.map(([userId, data], i) => ({
                  rank: i + 1,
                  userId,
                  name: profileMap[userId]?.display_name || profileMap[userId]?.username || userId.substring(0, 8),
                  avatar: profileMap[userId]?.avatar_url || null,
                  role: roleMap[userId] || 'player',
                  volume: data.volume,
                  txCount: data.txCount,
                  netFlow: data.netFlow,
              }));

              return res.status(200).json({ success: true, leaderboard: rankings, metric: action || 'volume' });
          } catch (err) {
              return res.status(500).json({ error: 'Leaderboard failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
