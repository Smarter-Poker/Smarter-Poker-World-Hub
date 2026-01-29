/**
 * Daily Analytics API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/analytics/daily - Get daily analytics
 * POST /api/commander/analytics/daily - Calculate/refresh daily analytics
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return getDailyAnalytics(req, res);
  }

  if (req.method === 'POST') {
    return calculateDailyAnalytics(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getDailyAnalytics(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { venue_id, start_date, end_date, days = 30 } = req.query;

    if (!venue_id) {
      return res.status(400).json({ error: 'Venue ID required' });
    }

    // Check if user is manager/owner at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .in('role', ['owner', 'manager'])
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'Analytics access requires manager or owner role' });
    }

    let query = supabase
      .from('commander_analytics_daily')
      .select('*')
      .eq('venue_id', parseInt(venue_id))
      .order('date', { ascending: false });

    if (start_date && end_date) {
      query = query.gte('date', start_date).lte('date', end_date);
    } else {
      // Default to last N days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      query = query.gte('date', startDate.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate summary stats
    const summary = data.reduce((acc, day) => {
      acc.total_sessions += day.total_sessions || 0;
      acc.unique_players += day.unique_players || 0;
      acc.total_play_hours += parseFloat(day.total_play_hours) || 0;
      acc.total_buyin += day.total_buyin || 0;
      acc.tournaments_run += day.tournaments_run || 0;
      acc.promotions_awarded += day.promotions_awarded || 0;
      return acc;
    }, {
      total_sessions: 0,
      unique_players: 0,
      total_play_hours: 0,
      total_buyin: 0,
      tournaments_run: 0,
      promotions_awarded: 0
    });

    return res.status(200).json({
      analytics: data,
      summary,
      period: {
        start: data.length > 0 ? data[data.length - 1].date : null,
        end: data.length > 0 ? data[0].date : null,
        days: data.length
      }
    });
  } catch (error) {
    console.error('Get daily analytics error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function calculateDailyAnalytics(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { venue_id, date } = req.body;

    if (!venue_id) {
      return res.status(400).json({ error: 'Venue ID required' });
    }

    // Check if user is manager/owner at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .in('role', ['owner', 'manager'])
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'Analytics access requires manager or owner role' });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Calculate analytics from sessions
    const { data: sessions } = await supabase
      .from('commander_player_sessions')
      .select('*')
      .eq('venue_id', parseInt(venue_id))
      .gte('check_in_at', `${targetDate}T00:00:00`)
      .lt('check_in_at', `${targetDate}T23:59:59`);

    const { data: tournaments } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('venue_id', parseInt(venue_id))
      .gte('scheduled_start', `${targetDate}T00:00:00`)
      .lt('scheduled_start', `${targetDate}T23:59:59`);

    const { data: awards } = await supabase
      .from('commander_promotion_awards')
      .select('*')
      .eq('venue_id', parseInt(venue_id))
      .gte('created_at', `${targetDate}T00:00:00`)
      .lt('created_at', `${targetDate}T23:59:59`);

    // Calculate metrics
    const uniquePlayers = new Set(sessions?.map(s => s.player_id).filter(Boolean));
    const totalMinutes = sessions?.reduce((sum, s) => sum + (s.total_time_minutes || 0), 0) || 0;
    const totalBuyin = sessions?.reduce((sum, s) => sum + (s.total_buyin || 0), 0) || 0;
    const totalCashout = sessions?.reduce((sum, s) => sum + (s.total_cashout || 0), 0) || 0;

    const analytics = {
      venue_id: parseInt(venue_id),
      date: targetDate,
      total_sessions: sessions?.length || 0,
      unique_players: uniquePlayers.size,
      total_play_hours: (totalMinutes / 60).toFixed(2),
      avg_session_hours: sessions?.length > 0 ? (totalMinutes / 60 / sessions.length).toFixed(2) : 0,
      total_buyin: totalBuyin,
      total_cashout: totalCashout,
      avg_buyin: sessions?.length > 0 ? Math.round(totalBuyin / sessions.length) : 0,
      tournaments_run: tournaments?.length || 0,
      tournament_entries: tournaments?.reduce((sum, t) => sum + (t.current_entries || 0), 0) || 0,
      promotions_awarded: awards?.length || 0,
      promotion_value_awarded: awards?.reduce((sum, a) => sum + (a.prize_value || 0), 0) || 0,
      calculated_at: new Date().toISOString()
    };

    const { data: result, error } = await supabase
      .from('commander_analytics_daily')
      .upsert(analytics, { onConflict: 'venue_id,date' })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      analytics: result,
      message: `Analytics calculated for ${targetDate}`
    });
  } catch (error) {
    console.error('Calculate daily analytics error:', error);
    return res.status(500).json({ error: error.message });
  }
}
