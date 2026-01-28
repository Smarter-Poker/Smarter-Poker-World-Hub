/**
 * Display Content API
 * GET /api/captain/displays/:deviceId/content
 * Returns content for table display based on current mode
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  const { deviceId, screen } = req.query;

  try {
    // Get display config
    const { data: display, error: displayError } = await supabase
      .from('captain_table_displays')
      .select('*, captain_tables(id, table_number, table_name)')
      .eq('device_id', deviceId)
      .single();

    if (displayError || !display) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Display not registered' }
      });
    }

    // Update heartbeat
    await supabase
      .from('captain_table_displays')
      .update({
        is_online: true,
        last_heartbeat: new Date().toISOString()
      })
      .eq('id', display.id);

    // Determine which screen to show
    const currentScreen = screen || display.display_mode;
    let content = {};

    switch (currentScreen) {
      case 'waitlist':
        content = await getWaitlistContent(display.venue_id);
        break;

      case 'clock':
        content = await getClockContent(display.venue_id);
        break;

      case 'promotions':
        content = await getPromotionsContent(display.venue_id);
        break;

      case 'high_hand':
        content = await getHighHandContent(display.venue_id);
        break;

      case 'leaderboard':
        content = await getLeaderboardContent(display.venue_id);
        break;

      case 'rotation':
      default:
        // Get all content for rotation
        content = {
          waitlist: await getWaitlistContent(display.venue_id),
          promotions: await getPromotionsContent(display.venue_id),
          high_hand: await getHighHandContent(display.venue_id),
          leaderboard: await getLeaderboardContent(display.venue_id)
        };
        break;
    }

    return res.status(200).json({
      success: true,
      data: {
        display_id: display.id,
        screen: currentScreen,
        rotation_screens: display.rotation_screens,
        rotation_interval: display.rotation_interval,
        venue_id: display.venue_id,
        table: display.captain_tables,
        content,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Display content error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch content' }
    });
  }
}

async function getWaitlistContent(venueId) {
  // Get active games with waitlists
  const { data: games } = await supabase
    .from('captain_games')
    .select('id, game_type, stakes, current_players, max_players, status')
    .eq('venue_id', venueId)
    .in('status', ['waiting', 'running'])
    .order('game_type');

  // Get waitlist entries grouped by game
  const { data: waitlist } = await supabase
    .from('captain_waitlist')
    .select('id, game_type, stakes, player_name, position, status, estimated_wait_minutes, created_at')
    .eq('venue_id', venueId)
    .eq('status', 'waiting')
    .order('position');

  // Group waitlist by game type + stakes
  const waitlistByGame = {};
  (waitlist || []).forEach(entry => {
    const key = `${entry.game_type}-${entry.stakes}`;
    if (!waitlistByGame[key]) {
      waitlistByGame[key] = [];
    }
    waitlistByGame[key].push({
      position: entry.position,
      name: entry.player_name || 'Player',
      wait_minutes: entry.estimated_wait_minutes
    });
  });

  return {
    games: games || [],
    waitlist: waitlistByGame,
    total_waiting: (waitlist || []).length
  };
}

async function getClockContent(venueId) {
  // Get running tournament
  const { data: tournament } = await supabase
    .from('captain_tournaments')
    .select('*')
    .eq('venue_id', venueId)
    .in('status', ['running', 'paused', 'final_table'])
    .order('actual_start', { ascending: false })
    .limit(1)
    .single();

  if (!tournament) {
    return { active: false };
  }

  return {
    active: true,
    tournament_name: tournament.name,
    status: tournament.status,
    current_level: tournament.current_level,
    blind_structure: tournament.blind_structure,
    is_on_break: tournament.is_on_break,
    players_remaining: tournament.players_remaining,
    total_entries: tournament.total_entries,
    prize_pool: tournament.prize_pool,
    average_stack: tournament.average_stack
  };
}

async function getPromotionsContent(venueId) {
  const now = new Date().toISOString();

  const { data: promotions } = await supabase
    .from('captain_promotions')
    .select('id, name, description, promotion_type, prize_type, prize_amount, starts_at, ends_at')
    .eq('venue_id', venueId)
    .eq('status', 'active')
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .limit(5);

  // Get progressive jackpots
  const { data: jackpots } = await supabase
    .from('captain_progressive_jackpots')
    .select('id, name, current_amount, min_qualifying_hand')
    .eq('venue_id', venueId)
    .eq('status', 'active');

  return {
    promotions: promotions || [],
    jackpots: jackpots || []
  };
}

async function getHighHandContent(venueId) {
  const today = new Date().toISOString().split('T')[0];

  // Get today's high hands
  const { data: highHands } = await supabase
    .from('captain_high_hands')
    .select('id, player_name, hand_description, hand_cards, prize_amount, verified_at, table_number')
    .eq('venue_id', venueId)
    .gte('created_at', today)
    .not('verified_at', 'is', null)
    .order('hand_rank', { ascending: false })
    .limit(10);

  // Get current high hand (best of day)
  const currentHigh = highHands?.[0] || null;

  return {
    current_high: currentHigh,
    todays_winners: highHands || [],
    last_updated: new Date().toISOString()
  };
}

async function getLeaderboardContent(venueId) {
  // Get active leaderboard
  const { data: leaderboard } = await supabase
    .from('captain_leaderboards')
    .select('id, name, period_type, prize_pool')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!leaderboard) {
    return { active: false };
  }

  // Get top entries
  const { data: entries } = await supabase
    .from('captain_leaderboard_entries')
    .select(`
      id,
      points,
      rank,
      profiles!inner (
        id,
        username,
        avatar_url
      )
    `)
    .eq('leaderboard_id', leaderboard.id)
    .order('points', { ascending: false })
    .limit(10);

  return {
    active: true,
    leaderboard_name: leaderboard.name,
    period: leaderboard.period_type,
    prize_pool: leaderboard.prize_pool,
    top_players: (entries || []).map((e, i) => ({
      rank: i + 1,
      name: e.profiles?.username || 'Player',
      points: e.points,
      avatar: e.profiles?.avatar_url
    }))
  };
}
