/**
 * Commander Daily Analytics Aggregation Cron
 * POST /api/cron/commander-daily-aggregate
 * 
 * Triggered by Vercel Cron at 4:00 AM daily
 * Aggregates yesterday's data for ALL active venues into commander_analytics_daily
 * 
 * vercel.json cron config:
 * { "crons": [{ "path": "/api/cron/commander-daily-aggregate", "schedule": "0 4 * * *" }] }
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Accept GET (Vercel cron) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret for automated calls, or JWT for manual triggers
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');
  const targetDate = req.body?.date || req.query?.date || null;

  if (cronSecret !== process.env.CRON_SECRET || !process.env.CRON_SECRET) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
    } else {
      return res.status(401).json({ error: 'Unauthorized — missing cron secret or auth token' });
    }
  }

  try {
    // Default to yesterday unless specific date given
    const date = targetDate || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    })();

    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    // Get all active venues
    const { data: venues } = await supabase
      .from('poker_venues')
      .select('id, name')
      .eq('status', 'active')
          .limit(100);

    if (!venues || venues.length === 0) {
      return res.status(200).json({ message: 'No active venues', aggregated: 0 });
    }

    const results = [];

    for (const venue of venues) {
      try {
        // Parallel fetch all data for this venue
        const [sessionsRes, tournamentsRes, waitlistRes, timeBillingRes, cashRes, awardsRes, incidentsRes] = await Promise.all([
          // Player sessions
          supabase.from('commander_player_sessions')
            .select('id, player_id, total_time_minutes, total_buyin, games_played')
            .eq('venue_id', venue.id)
            .gte('check_in_at', dayStart).lt('check_in_at', dayEnd),
          // Tournaments
          supabase.from('commander_tournaments')
            .select('id, current_entries, buyin_amount, buyin_fee, prize_pool, status')
            .eq('venue_id', venue.id)
            .gte('scheduled_start', dayStart).lt('scheduled_start', dayEnd),
          // Waitlist entries
          supabase.from('commander_waitlist')
            .select('id, status, created_at, called_at, seated_at')
            .eq('venue_id', venue.id)
            .gte('created_at', dayStart).lt('created_at', dayEnd),
          // Time billing sessions
          supabase.from('commander_table_sessions')
            .select('id, duration_minutes, amount_charged')
            .eq('venue_id', venue.id)
            .gte('created_at', dayStart).lt('created_at', dayEnd),
          // Cash transactions
          supabase.from('commander_cash_transactions')
            .select('id, type, amount')
            .eq('venue_id', venue.id)
            .gte('created_at', dayStart).lt('created_at', dayEnd),
          // Promotion awards
          supabase.from('commander_promotion_awards')
            .select('id, prize_value')
            .eq('venue_id', venue.id)
            .gte('created_at', dayStart).lt('created_at', dayEnd),
          // Incidents
          supabase.from('commander_incidents')
            .select('id')
            .eq('venue_id', venue.id)
            .gte('created_at', dayStart).lt('created_at', dayEnd)
        ]);

        const sessions = sessionsRes.data || [];
        const tournaments = tournamentsRes.data || [];
        const waitlist = waitlistRes.data || [];
        const timeBilling = timeBillingRes.data || [];
        const cashTx = cashRes.data || [];
        const awards = awardsRes.data || [];
        const incidents = incidentsRes.data || [];

        // Calculate metrics
        const uniquePlayers = new Set(sessions.map(s => s.player_id).filter(Boolean));
        const totalMinutes = sessions.reduce((s, x) => s + (x.total_time_minutes || 0), 0);
        const totalBuyin = sessions.reduce((s, x) => s + parseFloat(x.total_buyin || 0), 0);

        // Waitlist metrics
        const seatedEntries = waitlist.filter(w => w.status === 'seated' && w.seated_at && w.created_at);
        const waitTimes = seatedEntries.map(w => (new Date(w.seated_at) - new Date(w.created_at)) / 60000);
        const avgWaitMinutes = waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;
        const noShows = waitlist.filter(w => w.status === 'no_show').length;

        // Time billing revenue
        const timeRevenue = timeBilling.reduce((s, x) => s + parseFloat(x.amount_charged || 0), 0);
        const totalTableHours = timeBilling.reduce((s, x) => s + (x.duration_minutes || 0), 0) / 60;

        // Cash tracking
        const buyIns = cashTx.filter(t => t.type === 'buy_in' || t.type === 'add_on');
        const cashOuts = cashTx.filter(t => t.type === 'cash_out');
        const totalCashIn = buyIns.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
        const totalCashOut = cashOuts.reduce((s, x) => s + parseFloat(x.amount || 0), 0);

        // Tournament revenue
        const tournamentFees = tournaments.reduce((s, t) => s + (t.current_entries || 0) * parseFloat(t.buyin_fee || 0), 0);
        const tournamentPrizePool = tournaments.reduce((s, t) => s + parseFloat(t.prize_pool || 0), 0);

        const analytics = {
          venue_id: venue.id,
          date,
          total_sessions: sessions.length,
          unique_players: uniquePlayers.size,
          total_play_hours: parseFloat((totalMinutes / 60).toFixed(2)),
          avg_session_hours: sessions.length > 0 ? parseFloat((totalMinutes / 60 / sessions.length).toFixed(2)) : 0,
          total_buyin: totalBuyin,
          total_cashout: totalCashOut,
          avg_buyin: sessions.length > 0 ? Math.round(totalBuyin / sessions.length) : 0,
          tournaments_run: tournaments.length,
          tournament_entries: tournaments.reduce((s, t) => s + (t.current_entries || 0), 0),
          tournament_fees: tournamentFees,
          tournament_prize_pool: tournamentPrizePool,
          time_revenue: timeRevenue,
          table_hours: parseFloat(totalTableHours.toFixed(2)),
          cash_in: totalCashIn,
          cash_out: totalCashOut,
          net_drop: totalCashIn - totalCashOut,
          waitlist_entries: waitlist.length,
          waitlist_seated: seatedEntries.length,
          waitlist_no_shows: noShows,
          avg_wait_minutes: parseFloat(avgWaitMinutes.toFixed(1)),
          promotions_awarded: awards.length,
          promotion_value_awarded: awards.reduce((s, a) => s + parseFloat(a.prize_value || 0), 0),
          incidents_count: incidents.length,
          calculated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('commander_analytics_daily')
          .upsert(analytics, { onConflict: 'venue_id,date' });

        if (error) {
          console.error(`Analytics error for ${venue.name}:`, error);
          results.push({ venue: venue.name, status: 'error', error: error.message });
        } else {
          results.push({ venue: venue.name, status: 'ok', players: uniquePlayers.size, sessions: sessions.length });
        }
      } catch (venueErr) {
        console.error(`Venue ${venue.name} error:`, venueErr);
        results.push({ venue: venue.name, status: 'error', error: venueErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      date,
      venues_processed: results.length,
      results
    });
  } catch (error) {
    console.error('Cron aggregate error:', error);
    return res.status(500).json({ error: error.message });
  }
}
