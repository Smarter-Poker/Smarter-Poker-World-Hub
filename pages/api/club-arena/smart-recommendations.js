/**
 * Smart Table Recommendations API — AI-driven table suggestions
 * ═══════════════════════════════════════════════════════════════
 * GET /api/club-arena/smart-recommendations?clubId=xxx
 *
 * Analyzes current club state and recommends:
 * - Optimal table configs based on active player count
 * - Under-utilized tables that should be closed
 * - Stake level adjustments based on player chip balances
 * - Peak time predictions based on historical patterns
 */

import { createClient } from '@supabase/supabase-js';
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
export default async function handler(req, res) {
  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/smart-recommendations')) return;
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId } = req.query;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify admin
      const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
          return res.status(403).json({ error: 'Admin access required' });
      }

      try {
          const [tablesRes, membersRes, txRes] = await Promise.allSettled([
              getSupabase().from('tables')
                  .select('id, name, status, current_players, max_players, game_variant, small_blind, big_blind, min_buy_in, max_buy_in, game_type')
                  .eq('club_id', clubId),
              getSupabase().from('club_members')
                  .select('user_id, chip_balance, status')
                  .eq('club_id', clubId).eq('status', 'active'),
              getSupabase().from('chip_transactions')
                  .select('amount, created_at, transaction_type')
                  .eq('club_id', clubId)
                  .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
                  .limit(2000),
          ]);

          const tables = tablesRes.status === 'fulfilled' ? (tablesRes.value?.data || []) : [];
          const members = membersRes.status === 'fulfilled' ? (membersRes.value?.data || []) : [];
          const txHistory = txRes.status === 'fulfilled' ? (txRes.value?.data || []) : [];

          const recommendations = [];
          const activeTables = tables.filter(t => ['active', 'playing', 'waiting', 'between_hands'].includes(t.status));
          const totalSeated = activeTables.reduce((s, t) => s + (t.current_players || 0), 0);
          const totalMembers = members.length;
          const avgChipBalance = members.length > 0
              ? Math.round(members.reduce((s, m) => s + (m.chip_balance || 0), 0) / members.length)
              : 0;

          // Rec 1: Under-utilized tables (< 30% capacity for > 0 players means low interest)
          activeTables.forEach(t => {
              if (t.current_players > 0 && t.current_players < (t.max_players * 0.3)) {
                  recommendations.push({
                      type: 'warning',
                      icon: '⚠️',
                      title: `"${t.name}" is under-utilized`,
                      desc: `Only ${t.current_players}/${t.max_players} seats filled. Consider closing or merging.`,
                      action: 'close_table',
                      tableId: t.id,
                      priority: 2,
                  });
              }
          });

          // Rec 2: All tables full — suggest opening more
          const fullTables = activeTables.filter(t => t.current_players >= t.max_players);
          if (fullTables.length > 0 && fullTables.length === activeTables.length) {
              recommendations.push({
                  type: 'success',
                  icon: '🚀',
                  title: 'All tables are full!',
                  desc: `All ${activeTables.length} tables at max capacity. Open a new table to capture overflow.`,
                  action: 'create_table',
                  priority: 1,
              });
          }

          // Rec 3: No active tables but enough members
          if (activeTables.length === 0 && totalMembers > 4) {
              recommendations.push({
                  type: 'info',
                  icon: '🎯',
                  title: 'No tables running',
                  desc: `You have ${totalMembers} members but no active tables. Consider opening a table.`,
                  action: 'create_table',
                  priority: 1,
              });
          }

          // Rec 4: Stake mismatch — avg chip balance vs table stakes
          activeTables.forEach(t => {
              if (avgChipBalance > 0 && t.max_buy_in > 0) {
                  if (avgChipBalance < t.min_buy_in * 2) {
                      recommendations.push({
                          type: 'warning',
                          icon: '💰',
                          title: `Stakes may be too high for "${t.name}"`,
                          desc: `Avg member balance (${avgChipBalance.toLocaleString()}) is close to the min buy-in (${t.min_buy_in}). Players may struggle to re-buy.`,
                          action: 'adjust_stakes',
                          tableId: t.id,
                          priority: 2,
                      });
                  }
              }
          });

          // Rec 5: Variety suggestion — only one game variant running
          const variants = [...new Set(activeTables.map(t => t.game_variant))];
          if (variants.length === 1 && activeTables.length >= 2) {
              const missing = variants[0] === 'nlh' ? 'PLO' : 'NLH';
              recommendations.push({
                  type: 'info',
                  icon: '🃏',
                  title: `Consider adding a ${missing} table`,
                  desc: `All ${activeTables.length} tables are ${variants[0].toUpperCase()}. Adding variety can attract more players.`,
                  action: 'create_table',
                  priority: 3,
              });
          }

          // Rec 6: Peak hour analysis
          const hourlyActivity = new Array(24).fill(0);
          txHistory.forEach(tx => {
              const hour = new Date(tx.created_at).getHours();
              hourlyActivity[hour]++;
          });
          const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));
          const currentHour = new Date().getHours();
          if (hourlyActivity[peakHour] > 10) {
              const hoursUntilPeak = ((peakHour - currentHour) + 24) % 24;
              if (hoursUntilPeak > 0 && hoursUntilPeak <= 3) {
                  recommendations.push({
                      type: 'info',
                      icon: '⏰',
                      title: `Peak hour approaching!`,
                      desc: `Historical data shows peak activity at ${peakHour}:00. Prepare tables ${hoursUntilPeak}h before rush.`,
                      priority: 2,
                  });
              }
          }

          // Rec 7: Healthy club — no issues
          if (recommendations.length === 0) {
              recommendations.push({
                  type: 'success',
                  icon: '✅',
                  title: 'Club looks great!',
                  desc: `${activeTables.length} tables running, ${totalSeated} players seated, ${totalMembers} total members. No issues detected.`,
                  priority: 4,
              });
          }

          // Sort by priority
          recommendations.sort((a, b) => (a.priority || 3) - (b.priority || 3));

          return res.status(200).json({
              success: true,
              recommendations,
              insights: {
                  activeTables: activeTables.length,
                  totalSeated,
                  totalMembers,
                  avgChipBalance,
                  peakHour,
                  hourlyActivity,
              },
          });
      } catch (err) {
          console.warn('[smart-recommendations]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
