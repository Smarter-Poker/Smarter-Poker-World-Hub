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

    // Get squads where user is a member
    let query = supabase
      .from('commander_home_members')
      .select(`
        id,
        role,
        status,
        joined_at,
        commander_squads:squad_id (
          id,
          name,
          game_type,
          stakes,
          status,
          prefer_same_table,
          created_at,
          poker_venues:venue_id (id, name, city, state),
          profiles:leader_id (id, display_name, avatar_url)
        )
      `)
      .eq('user_id', user.id);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: memberships, error } = await query.order('joined_at', { ascending: false });

    if (error) throw error;

    // Separate active squads and pending invitations
    const activeSquads = [];
    const pendingInvitations = [];

    memberships?.forEach(m => {
      if (!m.commander_squads) return;

      const squad = {
        id: m.commander_squads.id,
        name: m.commander_squads.name,
        game_type: m.commander_squads.game_type,
        stakes: m.commander_squads.stakes,
        squad_status: m.commander_squads.status,
        prefer_same_table: m.commander_squads.prefer_same_table,
        venue: m.commander_squads.poker_venues,
        leader: m.commander_squads.profiles,
        member_role: m.role,
        member_status: m.status,
        joined_at: m.joined_at
      };

      if (m.status === 'pending') {
        pendingInvitations.push(squad);
      } else if (m.status === 'active') {
        activeSquads.push(squad);
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        squads: activeSquads,
        invitations: pendingInvitations,
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
