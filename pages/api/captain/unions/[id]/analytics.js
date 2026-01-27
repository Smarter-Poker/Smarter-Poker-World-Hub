/**
 * Union Analytics API
 * GET /api/captain/unions/[id]/analytics - Get cross-venue analytics
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { id, period = '30d' } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Union ID required' }
    });
  }

  // Auth check
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
    });
  }

  try {
    // Verify access
    const { data: union } = await supabase
      .from('captain_unions')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!union) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Union not found' }
      });
    }

    // Check if owner or super_agent
    const isOwner = union.owner_id === user.id;

    if (!isOwner) {
      const { data: agent } = await supabase
        .from('captain_agents')
        .select('role')
        .eq('union_id', id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!agent || agent.role !== 'super_agent') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }
    }

    // Calculate date range
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
    const days = daysMap[period] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get venues in this union
    const { data: unionVenues } = await supabase
      .from('captain_union_venues')
      .select('venue_id')
      .eq('union_id', id)
      .eq('status', 'active');

    const venueIds = unionVenues?.map(v => v.venue_id) || [];

    if (venueIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          summary: {
            total_venues: 0,
            total_active_games: 0,
            total_players_today: 0,
            total_sessions: 0,
            total_hours_played: 0
          },
          venues: [],
          daily_metrics: []
        }
      });
    }

    // Get current state
    const [gamesRes, waitlistRes, sessionsRes] = await Promise.all([
      supabase
        .from('captain_games')
        .select('id, venue_id, status, player_count')
        .in('venue_id', venueIds)
        .eq('status', 'active'),
      supabase
        .from('captain_waitlist')
        .select('id, venue_id, status')
        .in('venue_id', venueIds)
        .eq('status', 'waiting'),
      supabase
        .from('captain_sessions')
        .select('id, venue_id, duration_hours, created_at')
        .in('venue_id', venueIds)
        .gte('created_at', startDate.toISOString())
    ]);

    const games = gamesRes.data || [];
    const waitlist = waitlistRes.data || [];
    const sessions = sessionsRes.data || [];

    // Calculate per-venue stats
    const venueStats = {};
    venueIds.forEach(vId => {
      venueStats[vId] = {
        active_games: games.filter(g => g.venue_id === vId).length,
        players_in_games: games.filter(g => g.venue_id === vId).reduce((sum, g) => sum + (g.player_count || 0), 0),
        waiting_players: waitlist.filter(w => w.venue_id === vId).length,
        total_sessions: sessions.filter(s => s.venue_id === vId).length,
        total_hours: sessions.filter(s => s.venue_id === vId).reduce((sum, s) => sum + (s.duration_hours || 0), 0)
      };
    });

    // Get venue details
    const { data: venues } = await supabase
      .from('poker_venues')
      .select('id, name, city, state')
      .in('id', venueIds);

    const venuesWithStats = venues?.map(v => ({
      ...v,
      ...venueStats[v.id]
    })) || [];

    // Summary
    const summary = {
      total_venues: venueIds.length,
      total_active_games: games.length,
      total_players_in_games: games.reduce((sum, g) => sum + (g.player_count || 0), 0),
      total_waiting: waitlist.length,
      total_sessions: sessions.length,
      total_hours_played: sessions.reduce((sum, s) => sum + (s.duration_hours || 0), 0)
    };

    // Daily metrics (simplified)
    const dailyMetrics = [];
    for (let i = 0; i < Math.min(days, 30); i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const daySessions = sessions.filter(s =>
        s.created_at.startsWith(dateStr)
      );

      dailyMetrics.unshift({
        date: dateStr,
        sessions: daySessions.length,
        hours: daySessions.reduce((sum, s) => sum + (s.duration_hours || 0), 0)
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        summary,
        venues: venuesWithStats,
        daily_metrics: dailyMetrics
      }
    });
  } catch (error) {
    console.error('Union analytics error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
