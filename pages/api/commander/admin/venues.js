/**
 * Multi-Venue Admin API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 * GET /api/commander/admin/venues - List all venues user manages
 * GET /api/commander/admin/venues?summary=true - Get summary stats for all venues
 */
import { createClient } from '@supabase/supabase-js';
import { withRateLimit } from '../../../../src/lib/commander/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    const { summary } = req.query;

    // Get all venues where user is staff
    const { data: staffRecords, error: staffError } = await supabase
      .from('commander_staff')
      .select(`
        id,
        role,
        venue_id,
        poker_venues:venue_id (
          id,
          name,
          city,
          state,
          address,
          phone,
          website,
          logo_url
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['owner', 'manager']);

    if (staffError) throw staffError;

    if (!staffRecords || staffRecords.length === 0) {
      return res.status(200).json({ venues: [], summary: null });
    }

    const venues = staffRecords.map(s => ({
      ...s.poker_venues,
      role: s.role,
      staff_id: s.id
    }));

    if (!summary) {
      return res.status(200).json({ venues });
    }

    // Get summary stats for all venues
    const venueIds = venues.map(v => v.id);
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get active games count per venue
    const { data: activeGames } = await supabase
      .from('commander_games')
      .select('venue_id, id')
      .in('venue_id', venueIds)
      .eq('status', 'active');

    // Get waitlist counts per venue
    const { data: waitlistCounts } = await supabase
      .from('commander_waitlist')
      .select('venue_id, id')
      .in('venue_id', venueIds)
      .eq('status', 'waiting');

    // Get today's analytics
    const { data: todayAnalytics } = await supabase
      .from('commander_analytics_daily')
      .select('*')
      .in('venue_id', venueIds)
      .eq('date', today);

    // Get weekly analytics
    const { data: weekAnalytics } = await supabase
      .from('commander_analytics_daily')
      .select('venue_id, total_sessions, unique_players, total_play_hours, total_buyin')
      .in('venue_id', venueIds)
      .gte('date', weekAgo);

    // Aggregate stats per venue
    const venueStats = {};
    for (const venue of venues) {
      const vId = venue.id;

      // Active games
      const games = activeGames?.filter(g => g.venue_id === vId) || [];

      // Waitlist
      const waitlist = waitlistCounts?.filter(w => w.venue_id === vId) || [];

      // Today's stats
      const todayStats = todayAnalytics?.find(a => a.venue_id === vId) || {};

      // Weekly aggregates
      const weekStats = weekAnalytics?.filter(a => a.venue_id === vId) || [];
      const weeklyTotals = weekStats.reduce((acc, day) => ({
        sessions: acc.sessions + (day.total_sessions || 0),
        players: acc.players + (day.unique_players || 0),
        hours: acc.hours + parseFloat(day.total_play_hours || 0),
        buyin: acc.buyin + (day.total_buyin || 0)
      }), { sessions: 0, players: 0, hours: 0, buyin: 0 });

      venueStats[vId] = {
        active_games: games.length,
        waitlist_count: waitlist.length,
        today: {
          sessions: todayStats.total_sessions || 0,
          players: todayStats.unique_players || 0,
          hours: parseFloat(todayStats.total_play_hours || 0),
          buyin: todayStats.total_buyin || 0
        },
        week: weeklyTotals
      };
    }

    // Combine venues with stats
    const venuesWithStats = venues.map(venue => ({
      ...venue,
      stats: venueStats[venue.id] || {
        active_games: 0,
        waitlist_count: 0,
        today: { sessions: 0, players: 0, hours: 0, buyin: 0 },
        week: { sessions: 0, players: 0, hours: 0, buyin: 0 }
      }
    }));

    // Calculate overall totals
    const overallStats = {
      total_venues: venues.length,
      total_active_games: Object.values(venueStats).reduce((sum, v) => sum + v.active_games, 0),
      total_waitlist: Object.values(venueStats).reduce((sum, v) => sum + v.waitlist_count, 0),
      today: {
        sessions: Object.values(venueStats).reduce((sum, v) => sum + v.today.sessions, 0),
        players: Object.values(venueStats).reduce((sum, v) => sum + v.today.players, 0),
        hours: Object.values(venueStats).reduce((sum, v) => sum + v.today.hours, 0),
        buyin: Object.values(venueStats).reduce((sum, v) => sum + v.today.buyin, 0)
      },
      week: {
        sessions: Object.values(venueStats).reduce((sum, v) => sum + v.week.sessions, 0),
        players: Object.values(venueStats).reduce((sum, v) => sum + v.week.players, 0),
        hours: Object.values(venueStats).reduce((sum, v) => sum + v.week.hours, 0),
        buyin: Object.values(venueStats).reduce((sum, v) => sum + v.week.buyin, 0)
      }
    };

    return res.status(200).json({
      venues: venuesWithStats,
      summary: overallStats
    });

  } catch (error) {
    console.error('Admin venues error:', error);
    return res.status(500).json({ error: error.message });
  }
}

export default withRateLimit(handler);
