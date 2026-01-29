/**
 * My Squads API
 * GET /api/commander/squads/my - Get player's squads and invitations
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
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }

  try {
    const { status } = req.query;

    // Get waitlist groups where user is a member
    const { data: memberships, error } = await supabase
      .from('commander_waitlist_group_members')
      .select(`
        id,
        player_id,
        joined_at,
        commander_waitlist_groups:group_id (
          id,
          game_type,
          stakes,
          status,
          prefer_same_table,
          accept_split,
          created_at,
          poker_venues:venue_id (id, name, city, state),
          profiles:leader_id (id, display_name, avatar_url)
        )
      `)
      .eq('player_id', user.id)
      .order('joined_at', { ascending: false });

    if (error) throw error;

    // Separate active squads and completed ones
    const activeSquads = [];
    const completedSquads = [];

    memberships?.forEach(m => {
      if (!m.commander_waitlist_groups) return;

      const squad = {
        id: m.commander_waitlist_groups.id,
        game_type: m.commander_waitlist_groups.game_type,
        stakes: m.commander_waitlist_groups.stakes,
        squad_status: m.commander_waitlist_groups.status,
        prefer_same_table: m.commander_waitlist_groups.prefer_same_table,
        accept_split: m.commander_waitlist_groups.accept_split,
        venue: m.commander_waitlist_groups.poker_venues,
        leader: m.commander_waitlist_groups.profiles,
        joined_at: m.joined_at
      };

      if (m.commander_waitlist_groups.status === 'waiting') {
        activeSquads.push(squad);
      } else {
        completedSquads.push(squad);
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        squads: activeSquads,
        completed: completedSquads,
        total: memberships?.length || 0
      }
    });
  } catch (error) {
    console.error('Get my squads error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to get squads' }
    });
  }
}
