/**
 * Club Analytics API — Real-time admin dashboard data
 * ═══════════════════════════════════════════════════════
 * GET /api/club-arena/club-analytics?clubId=xxx
 * GET /api/club-arena/club-analytics?clubId=xxx&action=rake_report&period=7d
 * GET /api/club-arena/club-analytics?clubId=xxx&action=csv&period=30d
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
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, action, period } = req.query;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // Verify admin access
      const { data: membership } = await supabaseAdmin
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .maybeSingle();

      if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
          return res.status(403).json({ error: 'Admin access required' });
      }

      try {
          // Parse period (default 7 days)
          const periodDays = period === '30d' ? 30 : period === '14d' ? 14 : period === '90d' ? 90 : 7;
          const since = new Date(Date.now() - periodDays * 86400000).toISOString();

          if (action === 'csv') {
              // Generate CSV export of rake data
              const { data: rakeData } = await supabaseAdmin
                  .from('chip_transactions')
                  .select('amount, created_at, transaction_type, notes')
                  .eq('club_id', clubId)
                  .eq('transaction_type', 'rake')
                  .gte('created_at', since)
                  .order('created_at', { ascending: false })
                  .limit(5000);

              const rows = (rakeData || []).map(r => ({
                  date: new Date(r.created_at).toISOString().split('T')[0],
                  time: new Date(r.created_at).toISOString().split('T')[1]?.split('.')[0] || '',
                  amount: r.amount || 0,
                  notes: (r.notes || '').replace(/,/g, ';'),
              }));

              const csv = 'Date,Time,Rake Amount,Notes\n' +
                  rows.map(r => `${r.date},${r.time},${r.amount},${r.notes}`).join('\n');

              res.setHeader('Content-Type', 'text/csv');
              res.setHeader('Content-Disposition', `attachment; filename="rake_report_${periodDays}d.csv"`);
              return res.status(200).send(csv);
          }

          if (action === 'rake_report') {
              // Rake breakdown by day
              const { data: rakeData } = await supabaseAdmin
                  .from('chip_transactions')
                  .select('amount, created_at')
                  .eq('club_id', clubId)
                  .eq('transaction_type', 'rake')
                  .gte('created_at', since)
                  .order('created_at', { ascending: true })
                  .limit(5000);

              // Group by day
              const dailyRake = {};
              (rakeData || []).forEach(r => {
                  const day = new Date(r.created_at).toISOString().split('T')[0];
                  dailyRake[day] = (dailyRake[day] || 0) + (r.amount || 0);
              });

              // Fill missing days with 0
              const days = [];
              for (let d = 0; d < periodDays; d++) {
                  const date = new Date(Date.now() - (periodDays - 1 - d) * 86400000).toISOString().split('T')[0];
                  days.push({ date, rake: dailyRake[date] || 0 });
              }

              const totalRake = days.reduce((s, d) => s + d.rake, 0);
              const avgDaily = Math.round(totalRake / periodDays);
              const peakDay = days.reduce((max, d) => d.rake > max.rake ? d : max, { date: '', rake: 0 });

              return res.status(200).json({
                  success: true,
                  period: `${periodDays}d`,
                  days,
                  summary: { totalRake, avgDaily, peakDay: peakDay.date, peakAmount: peakDay.rake },
              });
          }

          // Default: Dashboard analytics snapshot
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          const yesterday = new Date(now - 86400000).toISOString().split('T')[0];

          // Parallel queries for speed
          const [
              tablesRes,
              membersRes,
              todayRakeRes,
              yesterdayRakeRes,
              weekRakeRes,
              recentSessionsRes,
              activePlayersRes,
          ] = await Promise.allSettled([
              // Active tables
              supabaseAdmin.from('tables').select('id, status, current_players')
                  .eq('club_id', clubId).in('status', ['active', 'playing', 'waiting', 'between_hands']),
              // Total members
              supabaseAdmin.from('club_members').select('id', { count: 'exact', head: true })
                  .eq('club_id', clubId).eq('status', 'active'),
              // Today's rake
              supabaseAdmin.from('chip_transactions').select('amount')
                  .eq('club_id', clubId).eq('transaction_type', 'rake')
                  .gte('created_at', `${today}T00:00:00Z`)
                  .limit(50000),
              // Yesterday's rake
              supabaseAdmin.from('chip_transactions').select('amount')
                  .eq('club_id', clubId).eq('transaction_type', 'rake')
                  .gte('created_at', `${yesterday}T00:00:00Z`)
                  .lt('created_at', `${today}T00:00:00Z`)
                  .limit(50000),
              // Last 7 days rake (for sparkline)
              supabaseAdmin.from('chip_transactions').select('amount, created_at')
                  .eq('club_id', clubId).eq('transaction_type', 'rake')
                  .gte('created_at', new Date(now - 7 * 86400000).toISOString())
                  .order('created_at', { ascending: true }).limit(2000),
              // Recent sessions (last 24h unique players)
              supabaseAdmin.from('chip_transactions').select('from_user_id, to_user_id')
                  .eq('club_id', clubId).in('transaction_type', ['table_win', 'table_loss', 'rake'])
                  .gte('created_at', new Date(now - 86400000).toISOString()).limit(500),
              // Currently seated players
              supabaseAdmin.from('tables').select('current_players')
                  .eq('club_id', clubId).in('status', ['active', 'playing']),
          ]);

          // Process results
          const tables = tablesRes.status === 'fulfilled' ? (tablesRes.value?.data || []) : [];
          const totalMembers = membersRes.status === 'fulfilled' ? (membersRes.value?.count || 0) : 0;
          const todayRake = todayRakeRes.status === 'fulfilled'
              ? (todayRakeRes.value?.data || []).reduce((s, r) => s + (r.amount || 0), 0) : 0;
          const yesterdayRake = yesterdayRakeRes.status === 'fulfilled'
              ? (yesterdayRakeRes.value?.data || []).reduce((s, r) => s + (r.amount || 0), 0) : 0;

          // Sparkline: rake per day for last 7 days
          const sparklineData = {};
          if (weekRakeRes.status === 'fulfilled') {
              (weekRakeRes.value?.data || []).forEach(r => {
                  const day = new Date(r.created_at).toISOString().split('T')[0];
                  sparklineData[day] = (sparklineData[day] || 0) + (r.amount || 0);
              });
          }
          const sparkline = [];
          for (let d = 6; d >= 0; d--) {
              const date = new Date(now - d * 86400000).toISOString().split('T')[0];
              sparkline.push(sparklineData[date] || 0);
          }

          // Unique active players (last 24h)
          const playerIds = new Set();
          if (recentSessionsRes.status === 'fulfilled') {
              (recentSessionsRes.value?.data || []).forEach(r => {
                  if (r.from_user_id) playerIds.add(r.from_user_id);
                  if (r.to_user_id) playerIds.add(r.to_user_id);
              });
          }

          // Currently seated
          const seatedNow = activePlayersRes.status === 'fulfilled'
              ? (activePlayersRes.value?.data || []).reduce((s, t) => s + (t.current_players || 0), 0) : 0;

          const rakeChange = yesterdayRake > 0 ? Math.round(((todayRake - yesterdayRake) / yesterdayRake) * 100) : 0;

          return res.status(200).json({
              success: true,
              analytics: {
                  activeTables: tables.filter(t => ['active', 'playing'].includes(t.status)).length,
                  totalTables: tables.length,
                  totalMembers,
                  seatedNow,
                  uniquePlayers24h: playerIds.size,
                  todayRake,
                  yesterdayRake,
                  rakeChange, // % change from yesterday
                  sparkline, // 7-day rake sparkline data
              },
          });
      } catch (err) {
          console.error('[club-analytics]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
