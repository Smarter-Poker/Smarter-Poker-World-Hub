/**
 * Public Home Game API
 * GET /api/public/home-game/[code] - Get public home game group info
 * No authentication required - returns only public data
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

  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CODE', message: 'Club code required' }
      });
    }

    // Fetch home game group by club_code
    const { data: group, error: groupError } = await supabase
      .from('commander_home_groups')
      .select(`
        id,
        name,
        description,
        club_code,
        is_private,
        requires_approval,
        city,
        state,
        default_game_type,
        default_stakes,
        typical_buyin_min,
        typical_buyin_max,
        max_players,
        typical_day,
        typical_time,
        frequency,
        member_count,
        games_hosted,
        created_at,
        owner:owner_id (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('club_code', code)
      .eq('is_active', true)
      .single();

    if (groupError || !group) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Home game group not found' }
      });
    }

    // For private groups, only show basic info
    if (group.is_private) {
      return res.status(200).json({
        success: true,
        data: {
          group: {
            id: group.id,
            name: group.name,
            club_code: group.club_code,
            is_private: true,
            requires_approval: group.requires_approval,
            city: group.city,
            state: group.state,
            member_count: group.member_count,
            host: group.owner?.display_name || 'Host'
          },
          upcoming_games: [],
          message: 'This is a private group. Request an invite to see details.',
          links: {
            join_request: `/hub/commander/home-games/join?code=${code}`,
            smarter_poker: `https://smarter.poker/home-game/${code}`,
            poker_near_me: `https://pokernear.me/home-game/${code}`
          }
        }
      });
    }

    // For public groups, fetch upcoming games
    const { data: upcomingGames } = await supabase
      .from('commander_home_games')
      .select(`
        id,
        title,
        game_type,
        stakes,
        buyin_min,
        buyin_max,
        scheduled_date,
        start_time,
        max_players,
        rsvp_yes,
        rsvp_maybe,
        status
      `)
      .eq('group_id', group.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_date', new Date().toISOString().split('T')[0])
      .order('scheduled_date', { ascending: true })
      .limit(5);

    // Get recent game history (count only)
    const { count: recentGamesCount } = await supabase
      .from('commander_home_games')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', group.id)
      .eq('status', 'completed')
      .gte('scheduled_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    return res.status(200).json({
      success: true,
      data: {
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          club_code: group.club_code,
          is_private: group.is_private,
          requires_approval: group.requires_approval,
          city: group.city,
          state: group.state,
          default_game_type: group.default_game_type,
          default_stakes: group.default_stakes,
          typical_buyin_min: group.typical_buyin_min,
          typical_buyin_max: group.typical_buyin_max,
          max_players: group.max_players,
          typical_day: group.typical_day,
          typical_time: group.typical_time,
          frequency: group.frequency,
          member_count: group.member_count,
          games_hosted: group.games_hosted,
          host: group.owner?.display_name || 'Host',
          host_avatar: group.owner?.avatar_url
        },
        upcoming_games: upcomingGames || [],
        stats: {
          games_last_90_days: recentGamesCount || 0,
          total_games_hosted: group.games_hosted,
          total_members: group.member_count
        },
        links: {
          join_request: `/hub/commander/home-games/join?code=${code}`,
          smarter_poker: `https://smarter.poker/home-game/${code}`,
          poker_near_me: `https://pokernear.me/home-game/${code}`
        }
      }
    });
  } catch (error) {
    console.error('Public home game API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch home game' }
    });
  }
}
