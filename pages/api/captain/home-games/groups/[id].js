/**
 * Single Home Game Group API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/captain/home-games/groups/[id] - Get group details
 * PUT /api/captain/home-games/groups/[id] - Update group
 * DELETE /api/captain/home-games/groups/[id] - Delete group
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Group ID required' });
  }

  if (req.method === 'GET') {
    return getGroup(req, res, id);
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    return updateGroup(req, res, id);
  }

  if (req.method === 'DELETE') {
    return deleteGroup(req, res, id);
  }

  res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function getGroup(req, res, id) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    let userId = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    // Check if request is via invite code
    const isInviteCode = id.length === 8 && /^[A-Z0-9]+$/.test(id.toUpperCase());

    let query = supabase
      .from('captain_home_groups')
      .select(`
        *,
        profiles:owner_id (id, display_name, avatar_url),
        captain_home_members (
          id, user_id, role, status, games_attended,
          profiles:user_id (id, display_name, avatar_url)
        ),
        captain_home_games (
          id, title, scheduled_date, start_time, status, rsvp_yes, max_players
        )
      `);

    if (isInviteCode) {
      query = query.eq('invite_code', id.toUpperCase());
    } else {
      query = query.eq('id', id);
    }

    const { data: group, error } = await query.single();

    if (error || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check access for private groups
    if (group.is_private && userId !== group.owner_id) {
      const isMember = group.captain_home_members?.some(
        m => m.user_id === userId && m.status === 'approved'
      );

      if (!isMember && !isInviteCode) {
        return res.status(403).json({ error: 'This is a private group' });
      }

      // For invite code access, only show limited info
      if (isInviteCode && !isMember) {
        return res.status(200).json({
          group: {
            id: group.id,
            name: group.name,
            description: group.description,
            member_count: group.member_count,
            default_game_type: group.default_game_type,
            city: group.city,
            state: group.state,
            invite_code: group.invite_code
          },
          is_preview: true
        });
      }
    }

    // Filter members to only approved for non-admins
    let members = group.captain_home_members || [];
    const userMembership = members.find(m => m.user_id === userId);
    const isAdmin = userMembership?.role === 'owner' || userMembership?.role === 'admin';

    if (!isAdmin) {
      members = members.filter(m => m.status === 'approved');
    }

    // Filter upcoming games
    const upcomingGames = (group.captain_home_games || [])
      .filter(g => g.status !== 'cancelled' && g.status !== 'completed')
      .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
      .slice(0, 5);

    return res.status(200).json({
      group: {
        ...group,
        captain_home_members: members,
        captain_home_games: upcomingGames
      },
      my_membership: userMembership || null,
      is_admin: isAdmin
    });
  } catch (error) {
    console.error('Get group error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function updateGroup(req, res, id) {
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

    // Check if user is owner or admin
    const { data: group } = await supabase
      .from('captain_home_groups')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const { data: membership } = await supabase
      .from('captain_home_members')
      .select('role')
      .eq('group_id', id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .single();

    const canEdit = group.owner_id === user.id ||
      membership?.role === 'owner' ||
      membership?.role === 'admin';

    if (!canEdit) {
      return res.status(403).json({ error: 'Only owners and admins can update the group' });
    }

    const updates = { ...req.body, updated_at: new Date().toISOString() };

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.owner_id;
    delete updates.invite_code;
    delete updates.member_count;
    delete updates.games_hosted;
    delete updates.created_at;

    const { data: updated, error } = await supabase
      .from('captain_home_groups')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, group: updated });
  } catch (error) {
    console.error('Update group error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function deleteGroup(req, res, id) {
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

    // Only owner can delete
    const { data: group } = await supabase
      .from('captain_home_groups')
      .select('owner_id')
      .eq('id', id)
      .single();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== user.id) {
      return res.status(403).json({ error: 'Only the owner can delete this group' });
    }

    const { error } = await supabase
      .from('captain_home_groups')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Group deleted' });
  } catch (error) {
    console.error('Delete group error:', error);
    return res.status(500).json({ error: error.message });
  }
}
