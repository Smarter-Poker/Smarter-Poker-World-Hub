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

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
export default async function handler(req, res) {
  try {
      // Rate limit
      if (await applyRateLimit(req, res)) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action, agentId, days = 7 } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      const targetAgent = agentId || user.id;
      const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // ─── PULSE: 7-Day Rolling Metrics ────────────────────────
      if (action === 'pulse') {
          try {
              // Total commissions earned in the window
              const { data: commissions } = await supabaseAdmin
                  .from('commission_history')
                  .select('amount, created_at, status')
                  .eq('agent_id', targetAgent)
                  .eq('club_id', clubId)
                  .gte('created_at', daysAgo)
                  .limit(10000);

              const totalCommissions = (commissions || []).reduce((s, c) => s + (c.amount || 0), 0);
              const paidCommissions = (commissions || []).filter(c => c.status === 'paid')
                  .reduce((s, c) => s + (c.amount || 0), 0);
              const pendingCommissions = totalCommissions - paidCommissions;

              // Player count under this agent
              const { data: players } = await supabaseAdmin
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
              const { data: txns } = await supabaseAdmin
                  .from('action_audit_logs')
                  .select('amount')
                  .eq('user_id', targetAgent)
                  .eq('club_id', clubId)
                  .gte('created_at', daysAgo)
                  .limit(10000);

              const totalVolume = (txns || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

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
                      totalVolume,
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
              const { data: players } = await supabaseAdmin
                  .from('club_members')
                  .select('user_id, chip_balance, last_active, role')
                  .eq('club_id', clubId)
                  .eq('agent_id', targetAgent)
                  .limit(10000);

              const userIds = (players || []).map(p => p.user_id);
              const { data: profiles } = await supabaseAdmin
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
              const { data: agents } = await supabaseAdmin
                  .from('agents')
                  .select('user_id, commission_rate, parent_agent_id')
                  .eq('club_id', clubId)
                  .eq('status', 'active')
                  .limit(5000);

              const agentIds = (agents || []).map(a => a.user_id);

              // Get commission totals per agent
              const { data: commissions } = await supabaseAdmin
                  .from('commission_history')
                  .select('agent_id, amount')
                  .eq('club_id', clubId)
                  .in('agent_id', agentIds)
                  .gte('created_at', daysAgo)
                  .limit(50000);

              const earningsMap = {};
              for (const c of (commissions || [])) {
                  earningsMap[c.agent_id] = (earningsMap[c.agent_id] || 0) + (c.amount || 0);
              }

              // Get player counts per agent
              const { data: members } = await supabaseAdmin
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
              const { data: profiles } = await supabaseAdmin
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
              const { data: commissions } = await supabaseAdmin
                  .from('commission_history')
                  .select('amount, created_at')
                  .eq('agent_id', targetAgent)
                  .eq('club_id', clubId)
                  .gte('created_at', daysAgo)
                  .order('created_at', { ascending: true })
                  .limit(10000);

              // Bucket by day
              const dailyBuckets = {};
              for (let d = 0; d < days; d++) {
                  const date = new Date(Date.now() - (days - 1 - d) * 24 * 60 * 60 * 1000);
                  const key = date.toISOString().split('T')[0];
                  dailyBuckets[key] = 0;
              }

              for (const c of (commissions || [])) {
                  const key = new Date(c.created_at).toISOString().split('T')[0];
                  if (dailyBuckets[key] !== undefined) {
                      dailyBuckets[key] += c.amount || 0;
                  }
              }

              const trendData = Object.entries(dailyBuckets).map(([date, amount]) => ({ date, amount }));

              return res.status(200).json({ success: true, trends: trendData });
          } catch (err) {
              return res.status(500).json({ error: 'Trends failed', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
          }
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[API Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
