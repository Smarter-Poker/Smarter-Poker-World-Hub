/**
 * POST /api/club-arena/club-health
 * 
 * Club Health Score API — Composite 0-100 health metric for club owners.
 * 
 * Scoring Algorithm:
 *   Active players this week    (40% weight)
 *   Rake trend vs last period   (20% weight)
 *   Agent engagement            (15% weight)
 *   Player acquisition rate     (15% weight)
 *   Cashout velocity            (10% weight — high = drain = bad)
 * 
 * Actions:
 *   'score'   - Returns the current health score with breakdown
 *   'history' - Returns health score history for trend arrows
 * 
 * Body: { clubId, action }
 * Auth: Bearer token (club owner/admin)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
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
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/club-health')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify ownership/admin
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
          return res.status(403).json({ error: 'Owner/admin only' });
      }

      if (action === 'score') {
          try {
              const now = new Date();
              const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
              const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
              const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

              // ═══════════════════════════════════════════════════════
              // 1. ACTIVE PLAYERS (40%) — players active in last 7 days
              // ═══════════════════════════════════════════════════════
              const { data: allMembers } = await getSupabase()
                  .from('club_members')
                  .select('user_id, last_active, role, created_at')
                  .eq('club_id', clubId)
                  .in('role', ['player', 'member']);

              const totalPlayers = (allMembers || []).length;
              const activePlayers = (allMembers || []).filter(m => {
                  const la = m.last_active || m.created_at;
                  return la && new Date(la) >= new Date(oneWeekAgo);
              }).length;

              // Score: percentage of active players, capped at 100
              const activeRatio = totalPlayers > 0 ? (activePlayers / totalPlayers) : 0;
              const activeScore = Math.min(100, Math.round(activeRatio * 100));

              // ═══════════════════════════════════════════════════════
              // 2. RAKE TREND (20%) — this week vs last week
              // ═══════════════════════════════════════════════════════
              const { data: thisWeekLogs } = await getSupabase()
                  .from('action_audit_logs')
                  .select('amount')
                  .eq('club_id', clubId)
                  .in('action_type', ['buyin', 'chip_distribution'])
                  .gte('created_at', oneWeekAgo);

              const { data: lastWeekLogs } = await getSupabase()
                  .from('action_audit_logs')
                  .select('amount')
                  .eq('club_id', clubId)
                  .in('action_type', ['buyin', 'chip_distribution'])
                  .gte('created_at', twoWeeksAgo)
                  .lt('created_at', oneWeekAgo);

              const thisWeekVol = (thisWeekLogs || []).reduce((s, l) => s + Math.abs(l.amount || 0), 0);
              const lastWeekVol = (lastWeekLogs || []).reduce((s, l) => s + Math.abs(l.amount || 0), 0);

              let trendScore = 50; // Neutral if no data
              if (lastWeekVol > 0) {
                  const growthRate = (thisWeekVol - lastWeekVol) / lastWeekVol;
                  trendScore = Math.min(100, Math.max(0, Math.round(50 + growthRate * 50)));
              } else if (thisWeekVol > 0) {
                  trendScore = 80; // New activity from nothing = good
              }

              // ═══════════════════════════════════════════════════════
              // 3. AGENT ENGAGEMENT (15%) — agents with activity this week
              // ═══════════════════════════════════════════════════════
              const { data: agents } = await getSupabase()
                  .from('agents')
                  .select('user_id')
                  .eq('club_id', clubId)
                  .eq('status', 'active');

              const totalAgents = (agents || []).length;
              let activeAgents = 0;
              if (totalAgents > 0) {
                  const agentIds = agents.map(a => a.user_id);
                  const { data: agentActivity } = await getSupabase()
                      .from('action_audit_logs')
                      .select('user_id')
                      .eq('club_id', clubId)
                      .in('user_id', agentIds)
                      .gte('created_at', oneWeekAgo);

                  activeAgents = new Set((agentActivity || []).map(a => a.user_id)).size;
              }
              const agentScore = totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 50;

              // ═══════════════════════════════════════════════════════
              // 4. ACQUISITION RATE (15%) — new players this month
              // ═══════════════════════════════════════════════════════
              const newPlayers = (allMembers || []).filter(m =>
                  m.created_at && new Date(m.created_at) >= new Date(oneMonthAgo)
              ).length;

              // Score based on growth vs total: 10%+ growth = 100, 0% = 30
              const growthRate = totalPlayers > 0 ? (newPlayers / totalPlayers) : 0;
              const acquisitionScore = Math.min(100, Math.round(30 + growthRate * 700));

              // ═══════════════════════════════════════════════════════
              // 5. CASHOUT VELOCITY (10%) — high cashout = drain = lower score
              // ═══════════════════════════════════════════════════════
              const { count: cashoutCount } = await getSupabase()
                  .from('action_audit_logs')
                  .select('id', { count: 'exact', head: true })
                  .eq('club_id', clubId)
                  .eq('action_type', 'cashout_approved')
                  .gte('created_at', oneWeekAgo);

              const { count: buyinCount } = await getSupabase()
                  .from('action_audit_logs')
                  .select('id', { count: 'exact', head: true })
                  .eq('club_id', clubId)
                  .eq('action_type', 'buyin')
                  .gte('created_at', oneWeekAgo);

              let cashoutScore = 70; // Default neutral-ish
              const totalFlow = (cashoutCount || 0) + (buyinCount || 0);
              if (totalFlow > 0) {
                  const cashoutRatio = (cashoutCount || 0) / totalFlow;
                  cashoutScore = Math.round(100 - cashoutRatio * 100); // Lower cashout ratio = higher score
              }

              // ═══════════════════════════════════════════════════════
              // COMPOSITE SCORE
              // ═══════════════════════════════════════════════════════
              const composite = Math.round(
                  activeScore * 0.40 +
                  trendScore * 0.20 +
                  agentScore * 0.15 +
                  acquisitionScore * 0.15 +
                  cashoutScore * 0.10
              );

              let status = 'healthy';
              let color = 'green';
              if (composite < 50) { status = 'critical'; color = 'red'; }
              else if (composite < 80) { status = 'warning'; color = 'yellow'; }

              // Trend arrow based on rake trend
              let trend = 'stable';
              if (trendScore > 60) trend = 'improving';
              else if (trendScore < 40) trend = 'declining';

              return res.status(200).json({
                  success: true,
                  healthScore: composite,
                  status,
                  color,
                  trend,
                  breakdown: {
                      activePlayers: { score: activeScore, weight: '40%', active: activePlayers, total: totalPlayers },
                      rakeTrend: { score: trendScore, weight: '20%', thisWeek: thisWeekVol, lastWeek: lastWeekVol },
                      agentEngagement: { score: agentScore, weight: '15%', active: activeAgents, total: totalAgents },
                      playerAcquisition: { score: acquisitionScore, weight: '15%', newThisMonth: newPlayers },
                      cashoutVelocity: { score: cashoutScore, weight: '10%', cashouts: cashoutCount || 0, buyins: buyinCount || 0 },
                  },
              });
          } catch (err) {
              return res.status(500).json({ error: 'Health score failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
