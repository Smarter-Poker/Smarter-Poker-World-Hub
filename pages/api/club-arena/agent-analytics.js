import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/agent-analytics
 * 
 * Agent Intelligence Dashboard — Real-time analytics for agent network performance.
 * 
 * Actions:
 *   'pulse'        - 7-day rolling metrics: rake, commissions, player churn
 *   'heat_map'     - Color-coded player activity map (active/at-risk/churned)
 *   'leaderboard'  - Sub-agent ranking by revenue generated
 *   'trends'       - Daily commission/rake data for sparkline charts
 * 
 * Body: { clubId, action, agentId?, days? }
 * Auth: Bearer token (agent/owner/admin)
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
      if (!applyRateLimit(req, res, 'club-arena/agent-analytics')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action, agentId, days = 7 } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // SECURITY FIX 2026-07-19: this route previously ran with NO authorization
      // — it authenticated the JWT then queried by the body-supplied clubId/
      // agentId with no membership/role check, so any authenticated user could
      // read ANY club's player balances + PII and every agent's commissions.
      // Gate on the caller's own membership + role (mirrors agent-dashboard.js),
      // and force an agent to their OWN downline (they cannot inspect a peer by
      // passing agentId).
      const { data: callerMember } = await getSupabase()
        .from('club_members')
        .select('user_id, role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!callerMember) {
        return res.status(403).json({ error: 'Not a member of this club' });
      }
      const isOwnerAdmin = ['owner', 'admin'].includes(callerMember.role);
      const isAgent = ['agent', 'sub_agent', 'super_agent'].includes(callerMember.role);
      if (!isOwnerAdmin && !isAgent) {
        return res.status(403).json({ error: 'Agent, owner, or admin role required' });
      }

      // Owners/admins may inspect any agent in their club; agents are pinned to
      // their own user id regardless of the agentId they pass.
      const targetAgent = isOwnerAdmin ? agentId || user.id : user.id;
      const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // ─── PULSE: 7-Day Rolling Metrics ────────────────────────
      if (action === 'pulse') {
          try {
              // Total commissions earned in the window
              const { data: commsData } = await getSupabase().rpc('sum_agent_commissions', {
                  p_club_id: clubId, p_agent_id: targetAgent, p_start: daysAgo
              });
              
              const totalCommissions = commsData?.total || 0;
              const paidCommissions = commsData?.paid || 0;
              const pendingCommissions = totalCommissions - paidCommissions;

              // Player count under this agent
              const { data: players } = await getSupabase()
                  .from('club_members')
                  .select('user_id, chip_balance, last_active, role')
                  .eq('club_id', clubId)
                  .eq('agent_id', targetAgent)
                  .limit(10000);

              const now = new Date();
              let activeCount = 0, atRiskCount = 0, churnedCount = 0;
              for (const p of (players || [])) {
                  const lastActive = p.last_active ? new Date(p.last_active) : new Date(0);
                  const daysSince = Math.floor((now - lastActive) / (24 * 60 * 60 * 1000));
                  if (daysSince <= 5) activeCount++;
                  else if (daysSince <= 14) atRiskCount++;
                  else churnedCount++;
              }

              // Transaction volume
              const { data: totalVolume } = await getSupabase().rpc('sum_agent_volume', {
                  p_club_id: clubId, p_agent_id: targetAgent, p_start: daysAgo
              });

              return res.status(200).json({
                  success: true,
                  pulse: {
                      totalCommissions,
                      paidCommissions,
                      pendingCommissions,
                      playerCount: (players || []).length,
                      activeCount,
                      atRiskCount,
                      churnedCount,
                      totalVolume: totalVolume || 0,
                      periodDays: days,
                  },
              });
          } catch (err) {
              return res.status(500).json({ error: 'Pulse failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── HEAT_MAP: Player Activity Color Codes ────────────────
      if (action === 'heat_map') {
          try {
              const { data: players } = await getSupabase()
                  .from('club_members')
                  .select('user_id, chip_balance, last_active, role')
                  .eq('club_id', clubId)
                  .eq('agent_id', targetAgent)
                  .limit(10000);

              const userIds = (players || []).map(p => p.user_id);
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, display_name, username')
                  .in('id', userIds);

              const nameMap = {};
              for (const p of (profiles || [])) nameMap[p.id] = p.display_name || p.username || p.id.substring(0, 8);

              const now = new Date();
              const heatMap = (players || []).map(p => {
                  const lastActive = p.last_active ? new Date(p.last_active) : new Date(0);
                  const daysSince = Math.floor((now - lastActive) / (24 * 60 * 60 * 1000));
                  let status = 'active', color = 'green';
                  if (daysSince > 14) { status = 'churned'; color = 'red'; }
                  else if (daysSince > 5) { status = 'at_risk'; color = 'yellow'; }

                  return {
                      userId: p.user_id,
                      name: nameMap[p.user_id] || p.user_id.substring(0, 8),
                      chipBalance: p.chip_balance || 0,
                      lastActive: p.last_active,
                      daysSinceActive: daysSince,
                      status,
                      color,
                  };
              }).sort((a, b) => b.daysSinceActive - a.daysSinceActive);

              return res.status(200).json({ success: true, heatMap });
          } catch (err) {
              return res.status(500).json({ error: 'Heat map failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── LEADERBOARD: Sub-Agent Ranking ───────────────────────
      if (action === 'leaderboard') {
          try {
              // Get all agents in the club
              const { data: agents } = await getSupabase()
                  .from('agents')
                  .select('user_id, commission_rate, parent_agent_id')
                  .eq('club_id', clubId)
                  .eq('status', 'active')
                  .limit(5000);

              const agentIds = (agents || []).map(a => a.user_id);

              // Get commission totals per agent
              const { data: commissions } = await getSupabase()
                  .from('commission_history')
                  // 2026-08-15 CHECK 13 fix: `amount` is not a column on
                  // commission_history (real: commission_earned; aliased) — the
                  // select 42703'd and agent earnings always showed 0.
                  .select('agent_id, amount:commission_earned')
                  .eq('club_id', clubId)
                  .in('agent_id', agentIds)
                  .gte('created_at', daysAgo)
                  .limit(50000);

              const earningsMap = {};
              for (const c of (commissions || [])) {
                  earningsMap[c.agent_id] = (earningsMap[c.agent_id] || 0) + (c.amount || 0);
              }

              // Get player counts per agent
              const { data: members } = await getSupabase()
                  .from('club_members')
                  .select('agent_id')
                  .eq('club_id', clubId)
                  .in('agent_id', agentIds)
                  .limit(50000);

              const playerCountMap = {};
              for (const m of (members || [])) {
                  playerCountMap[m.agent_id] = (playerCountMap[m.agent_id] || 0) + 1;
              }

              // Resolve names
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, display_name, username')
                  .in('id', agentIds);

              const nameMap = {};
              for (const p of (profiles || [])) nameMap[p.id] = p.display_name || p.username || p.id.substring(0, 8);

              const leaderboard = (agents || []).map(a => ({
                  agentId: a.user_id,
                  name: nameMap[a.user_id] || a.user_id.substring(0, 8),
                  commissionRate: a.commission_rate,
                  earnings: earningsMap[a.user_id] || 0,
                  playerCount: playerCountMap[a.user_id] || 0,
                  parentAgentId: a.parent_agent_id,
              })).sort((a, b) => b.earnings - a.earnings);

              return res.status(200).json({ success: true, leaderboard, periodDays: days });
          } catch (err) {
              return res.status(500).json({ error: 'Leaderboard failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── TRENDS: Daily commission data for sparklines ─────────
      if (action === 'trends') {
          try {
              const { data: dailyBuckets } = await getSupabase().rpc('get_daily_commission_summary', {
                  p_club_id: clubId, p_agent_id: targetAgent, p_days: days
              });

              // Ensure all days are present
              const trendData = [];
              for (let d = days - 1; d >= 0; d--) {
                  const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  trendData.push({ date, amount: dailyBuckets?.[date] || 0 });
              }

              return res.status(200).json({ success: true, trends: trendData });
          } catch (err) {
              return res.status(500).json({ error: 'Trends failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── AGENT_SCORE: Composite Performance Scoring ────────────
      if (action === 'agent_score') {
          try {
              const { data: agent } = await getSupabase()
                  .from('agents')
                  // CHECK 13 (2026-08-14): player_count is not a column (real:
                  // active_player_count) — the select 42703'd and agent_score
                  // answered 404 for every agent.
                  .select('id, user_id, commission_rate, weekly_rake_generated, status, role, parent_agent_id, active_player_count, created_at')
                  .eq('user_id', targetAgent)
                  .eq('club_id', clubId)
                  .maybeSingle();

              if (!agent) return res.status(404).json({ error: 'Agent not found' });

              // Get players for retention/churn scoring
              const { data: players } = await getSupabase()
                  .from('club_members')
                  .select('user_id, last_active, chip_balance, created_at')
                  .eq('club_id', clubId)
                  .eq('agent_id', targetAgent)
                  .limit(10000);

              const now = new Date();
              let activeCount = 0, atRiskCount = 0, churnedCount = 0, newLast30 = 0;
              const totalPlayers = (players || []).length;

              for (const p of (players || [])) {
                  const lastActive = p.last_active ? new Date(p.last_active) : new Date(0);
                  const daysSince = Math.floor((now - lastActive) / (24 * 60 * 60 * 1000));
                  const playerAge = Math.floor((now - new Date(p.created_at)) / (24 * 60 * 60 * 1000));
                  if (daysSince <= 5) activeCount++;
                  else if (daysSince <= 14) atRiskCount++;
                  else churnedCount++;
                  if (playerAge <= 30) newLast30++;
              }

              // Commissions earned last 30 days
              const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
              const { data: commsData } = await getSupabase().rpc('sum_agent_commissions', {
                  p_club_id: clubId, p_agent_id: targetAgent, p_start: thirtyDaysAgo
              });
              const totalCommissions = commsData?.total || 0;

              // Cashouts processed last 30 days
              const { data: cashouts } = await getSupabase()
                  .from('action_audit_logs')
                  .select('amount, created_at')
                  .eq('club_id', clubId)
                  .eq('user_id', targetAgent)
                  .in('action_type', ['cashout_approved', 'cashout_processed'])
                  .gte('created_at', thirtyDaysAgo)
                  .limit(5000);
              const cashoutVolume = (cashouts || []).reduce((s, c) => s + Math.abs(c.amount || 0), 0);

              // ─── COMPOSITE SCORE CALCULATION ───
              // Player Retention (30%): % of active players / total
              const retentionScore = totalPlayers > 0 ? Math.min(100, (activeCount / totalPlayers) * 100) : 0;

              // Rake Generation (25%): Relative to commission target ($5000/month = 100%)
              const rakeScore = Math.min(100, (totalCommissions / 5000) * 100);

              // Cashout Velocity (20%): How quickly agent processes cashouts
              const cashoutScore = (cashouts || []).length > 0 ? Math.min(100, ((cashouts || []).length / Math.max(1, totalPlayers)) * 200) : 50; // Default 50 if no cashouts

              // Churn Rate (15%): Inverse of churn
              const churnScore = totalPlayers > 0 ? Math.max(0, 100 - (churnedCount / totalPlayers) * 100) : 50;

              // Growth (10%): New players in last 30 days
              const growthScore = Math.min(100, newLast30 * 20); // 5 new players = 100%

              const compositeScore = Math.round(
                  retentionScore * 0.30 +
                  rakeScore * 0.25 +
                  cashoutScore * 0.20 +
                  churnScore * 0.15 +
                  growthScore * 0.10
              );

              return res.status(200).json({
                  success: true,
                  score: {
                      composite: compositeScore,
                      grade: compositeScore >= 80 ? 'A' : compositeScore >= 60 ? 'B' : compositeScore >= 40 ? 'C' : compositeScore >= 20 ? 'D' : 'F',
                      breakdown: {
                          retention: { score: Math.round(retentionScore), weight: 30, detail: `${activeCount}/${totalPlayers} active` },
                          rakeGeneration: { score: Math.round(rakeScore), weight: 25, detail: `$${totalCommissions.toLocaleString()} / $5,000 target` },
                          cashoutVelocity: { score: Math.round(cashoutScore), weight: 20, detail: `${(cashouts || []).length} processed` },
                          churnRate: { score: Math.round(churnScore), weight: 15, detail: `${churnedCount} churned of ${totalPlayers}` },
                          growth: { score: Math.round(growthScore), weight: 10, detail: `${newLast30} new in 30d` },
                      },
                      totalPlayers,
                      activeCount,
                      atRiskCount,
                      churnedCount,
                  },
              });
          } catch (err) {
              return res.status(500).json({ error: 'Score failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      // ─── HIERARCHY_TREE: Recursive Agent Hierarchy ─────────────
      if (action === 'hierarchy_tree') {
          try {
              const { data: agents } = await getSupabase()
                  .from('agents')
                  .select('id, user_id, commission_rate, status, role, parent_agent_id, active_player_count, weekly_rake_generated')
                  .eq('club_id', clubId)
                  .limit(5000);

              const agentUserIds = (agents || []).map(a => a.user_id);
              const { data: profiles } = await getSupabase()
                  .from('profiles')
                  .select('id, display_name, username, avatar_url')
                  .in('id', agentUserIds);

              const nameMap = {};
              for (const p of (profiles || [])) nameMap[p.id] = { name: p.display_name || p.username || p.id.substring(0, 8), avatar: p.avatar_url };

              // Build tree structure
              const agentMap = new Map();
              const rootAgents = [];

              for (const a of (agents || [])) {
                  agentMap.set(a.id, {
                      id: a.id,
                      userId: a.user_id,
                      name: nameMap[a.user_id]?.name || a.user_id.substring(0, 8),
                      avatar: nameMap[a.user_id]?.avatar || null,
                      commissionRate: a.commission_rate,
                      status: a.status,
                      role: a.role,
                      playerCount: a.active_player_count || 0,
                      weeklyRake: a.weekly_rake_generated || 0,
                      parentAgentId: a.parent_agent_id,
                      children: [],
                  });
              }

              // Link children to parents
              for (const [id, node] of agentMap) {
                  if (node.parentAgentId && agentMap.has(node.parentAgentId)) {
                      agentMap.get(node.parentAgentId).children.push(node);
                  } else {
                      rootAgents.push(node);
                  }
              }

              return res.status(200).json({
                  success: true,
                  tree: rootAgents,
                  totalAgents: (agents || []).length,
                  activeAgents: (agents || []).filter(a => a.status === 'active').length,
              });
          } catch (err) {
              return res.status(500).json({ error: 'Hierarchy tree failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
