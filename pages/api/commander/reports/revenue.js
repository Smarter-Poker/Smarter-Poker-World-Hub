/**
 * Revenue Report API
 * GET /api/commander/reports/revenue?venue_id=X&range=today|week|month|quarter|custom&start=&end=
 * Returns revenue breakdown: time charges, tournament fees, comps issued/redeemed
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getDateRange(range, customStart, customEnd) {
  const now = new Date();
  const end = customEnd ? new Date(customEnd) : now;
  const start = new Date();
  switch (range) {
    case 'today': start.setHours(0, 0, 0, 0); break;
    case 'week': start.setDate(now.getDate() - 7); break;
    case 'month': start.setMonth(now.getMonth() - 1); break;
    case 'quarter': start.setMonth(now.getMonth() - 3); break;
    case 'custom': return { start: new Date(customStart).toISOString(), end: end.toISOString() };
    default: start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Auth required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { venue_id, range = 'month', start: customStart, end: customEnd } = req.query;
    if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const { start, end } = getDateRange(range, customStart, customEnd);

    // 1. Time billing revenue
    const { data: timeSessions } = await supabase
      .from('commander_time_sessions')
      .select('amount_charged, duration_minutes, created_at, status')
      .eq('venue_id', venue_id)
      .gte('created_at', start)
      .lte('created_at', end);

    const timeRevenue = (timeSessions || [])
      .filter(s => s.status === 'ended' || s.status === 'completed')
      .reduce((sum, s) => sum + (s.amount_charged || 0), 0);
    const timeSessionCount = (timeSessions || []).length;
    const totalMinutes = (timeSessions || []).reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

    // Daily time breakdown
    const timeByDay = {};
    (timeSessions || []).forEach(s => {
      const day = s.created_at?.split('T')[0];
      if (day) {
        timeByDay[day] = (timeByDay[day] || 0) + (s.amount_charged || 0);
      }
    });

    // 2. Tournament revenue
    const { data: tournaments } = await supabase
      .from('commander_tournaments')
      .select('id, name, buyin_amount, fee_amount, status, created_at')
      .eq('venue_id', venue_id)
      .gte('created_at', start)
      .lte('created_at', end);

    let tournamentFees = 0;
    let tournamentBuyins = 0;
    let tournamentEntryCount = 0;

    for (const t of (tournaments || [])) {
      const { data: entries } = await supabase
        .from('commander_tournament_entries')
        .select('id, buyin_amount, rebuy_count')
        .eq('tournament_id', t.id);
      const count = (entries || []).length;
      tournamentEntryCount += count;
      tournamentBuyins += count * (t.buyin_amount || 0);
      tournamentFees += count * (t.fee_amount || 0);
      // Rebuys
      const rebuys = (entries || []).reduce((s, e) => s + (e.rebuy_count || 0), 0);
      tournamentBuyins += rebuys * (t.buyin_amount || 0);
      tournamentFees += rebuys * (t.fee_amount || 0);
    }

    // 3. Comp costs
    const { data: compTxns } = await supabase
      .from('commander_comp_transactions')
      .select('type, amount, created_at')
      .eq('venue_id', venue_id)
      .gte('created_at', start)
      .lte('created_at', end);

    const compsEarned = (compTxns || []).filter(c => c.type === 'earn').reduce((s, c) => s + (c.amount || 0), 0);
    const compsRedeemed = (compTxns || []).filter(c => c.type === 'redeem').reduce((s, c) => s + (c.amount || 0), 0);

    // Build daily revenue chart data
    const allDays = new Set();
    Object.keys(timeByDay).forEach(d => allDays.add(d));
    (tournaments || []).forEach(t => {
      const d = t.created_at?.split('T')[0];
      if (d) allDays.add(d);
    });
    const dailyData = [...allDays].sort().map(day => ({
      date: day,
      time_revenue: timeByDay[day] || 0,
      tournament_fees: 0, // simplified — would need per-day aggregation
    }));

    const totalRevenue = timeRevenue + tournamentFees;

    return res.status(200).json({
      success: true,
      data: {
        range: { start, end, label: range },
        totals: {
          total_revenue: totalRevenue,
          time_revenue: timeRevenue,
          tournament_fees: tournamentFees,
          tournament_prize_pools: tournamentBuyins,
          comps_earned: compsEarned,
          comps_redeemed: compsRedeemed,
          net_after_comps: totalRevenue - compsRedeemed,
        },
        time_billing: {
          sessions: timeSessionCount,
          total_minutes: totalMinutes,
          revenue: timeRevenue,
          avg_per_session: timeSessionCount > 0 ? Math.round(timeRevenue / timeSessionCount * 100) / 100 : 0,
        },
        tournaments: {
          count: (tournaments || []).length,
          entries: tournamentEntryCount,
          fees: tournamentFees,
          prize_pools: tournamentBuyins,
          tournaments: (tournaments || []).map(t => ({
            id: t.id, name: t.name, buyin: t.buyin_amount, fee: t.fee_amount, status: t.status
          })),
        },
        daily_chart: dailyData,
      }
    });
  } catch (err) {
    console.error('Revenue report error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
