/**
 * Leaderboard Entries API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * POST /api/commander/leaderboards/[id]/entries - Add/update entry
 * POST /api/commander/leaderboards/[id]/entries/calculate - Recalculate all entries
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id: leaderboardId } = req.query;

  if (!leaderboardId) {
    return res.status(400).json({ error: 'Leaderboard ID required' });
  }

  if (req.method === 'POST') {
    return addOrUpdateEntry(req, res, leaderboardId);
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function addOrUpdateEntry(req, res, leaderboardId) {
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

    // Get leaderboard
    const { data: leaderboard } = await supabase
      .from('commander_leaderboards')
      .select('id, venue_id, leaderboard_type, status')
      .eq('id', leaderboardId)
      .single();

    if (!leaderboard) {
      return res.status(404).json({ error: 'Leaderboard not found' });
    }

    if (leaderboard.status === 'completed') {
      return res.status(400).json({ error: 'Cannot modify completed leaderboard' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', leaderboard.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'You are not authorized to update leaderboard entries' });
    }

    const { action = 'update' } = req.body;

    if (action === 'calculate') {
      return calculateAllEntries(req, res, leaderboard);
    }

    // Manual entry update
    const {
      player_id,
      score,
      hours_played,
      sessions_count,
      points_earned,
      qualifying_events
    } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: 'Player ID required' });
    }

    const entryData = {
      leaderboard_id: leaderboardId,
      player_id,
      score: score || 0,
      hours_played: hours_played || 0,
      sessions_count: sessions_count || 0,
      points_earned: points_earned || 0,
      qualifying_events: qualifying_events || 0,
      last_updated: new Date().toISOString()
    };

    const { data: entry, error } = await supabase
      .from('commander_leaderboard_entries')
      .upsert(entryData, { onConflict: 'leaderboard_id,player_id' })
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Recalculate rankings
    await updateRankings(leaderboardId);

    return res.status(200).json({ entry });
  } catch (error) {
    console.error('Add/update entry error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function calculateAllEntries(req, res, leaderboard) {
  try {
    // Get all player stats for this venue within the leaderboard period
    const { data: playerStats } = await supabase
      .from('commander_player_stats')
      .select('*')
      .eq('venue_id', leaderboard.venue_id);

    if (!playerStats || playerStats.length === 0) {
      return res.status(200).json({
        message: 'No player stats found for this venue',
        entries_updated: 0
      });
    }

    // Get sessions within the leaderboard period
    const { data: sessions } = await supabase
      .from('commander_player_sessions')
      .select('player_id, total_time_minutes, status')
      .eq('venue_id', leaderboard.venue_id)
      .eq('status', 'completed')
      .gte('check_in_time', `${leaderboard.start_date}T00:00:00`)
      .lte('check_in_time', `${leaderboard.end_date}T23:59:59`);

    // Aggregate by player
    const playerData = {};
    sessions?.forEach(session => {
      if (!session.player_id) return;
      if (!playerData[session.player_id]) {
        playerData[session.player_id] = {
          hours_played: 0,
          sessions_count: 0
        };
      }
      playerData[session.player_id].hours_played += (session.total_time_minutes || 0) / 60;
      playerData[session.player_id].sessions_count++;
    });

    // Create entries
    const entries = Object.entries(playerData).map(([playerId, data]) => {
      let score = 0;
      switch (leaderboard.leaderboard_type) {
        case 'hours_played':
          score = data.hours_played;
          break;
        case 'sessions':
          score = data.sessions_count;
          break;
        default:
          score = data.hours_played;
      }

      return {
        leaderboard_id: leaderboard.id,
        player_id: playerId,
        score,
        hours_played: data.hours_played,
        sessions_count: data.sessions_count,
        last_updated: new Date().toISOString()
      };
    });

    if (entries.length > 0) {
      const { error } = await supabase
        .from('commander_leaderboard_entries')
        .upsert(entries, { onConflict: 'leaderboard_id,player_id' });

      if (error) throw error;

      // Update rankings
      await updateRankings(leaderboard.id);
    }

    return res.status(200).json({
      message: 'Leaderboard entries calculated',
      entries_updated: entries.length
    });
  } catch (error) {
    console.error('Calculate entries error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateRankings(leaderboardId) {
  // Get all entries sorted by score
  const { data: entries } = await supabase
    .from('commander_leaderboard_entries')
    .select('id, score')
    .eq('leaderboard_id', leaderboardId)
    .order('score', { ascending: false });

  if (!entries || entries.length === 0) return;

  // Update ranks
  for (let i = 0; i < entries.length; i++) {
    await supabase
      .from('commander_leaderboard_entries')
      .update({ rank: i + 1 })
      .eq('id', entries[i].id);
  }
}
