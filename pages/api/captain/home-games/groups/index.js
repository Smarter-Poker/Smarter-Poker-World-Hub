/**
 * Home Game Groups API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 4
 * GET /api/captain/home-games/groups - List groups
 * POST /api/captain/home-games/groups - Create group
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listGroups(req, res);
  }

  if (req.method === 'POST') {
    return createGroup(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listGroups(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    let userId = null;
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    const { my_groups, city, state, game_type } = req.query;

    let query = supabase
      .from('captain_home_groups')
      .select(`
        *,
        profiles:owner_id (id, display_name, avatar_url)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // Filter to user's groups
    if (my_groups === 'true' && userId) {
      const { data: memberships } = await supabase
        .from('captain_home_members')
        .select('group_id')
        .eq('user_id', userId)
        .eq('status', 'approved');

      const groupIds = memberships?.map(m => m.group_id) || [];
      if (groupIds.length > 0) {
        query = query.in('id', groupIds);
      } else {
        return res.status(200).json({ groups: [] });
      }
    } else {
      // Only show public groups to non-members
      query = query.eq('is_private', false);
    }

    if (city) {
      query = query.ilike('city', `%${city}%`);
    }

    if (state) {
      query = query.eq('state', state);
    }

    if (game_type) {
      query = query.eq('default_game_type', game_type);
    }

    const { data, error } = await query.limit(50);

    if (error) throw error;

    // Add membership info for logged-in user
    if (userId && data?.length > 0) {
      const { data: memberships } = await supabase
        .from('captain_home_members')
        .select('group_id, role, status')
        .eq('user_id', userId)
        .in('group_id', data.map(g => g.id));

      const membershipMap = {};
      memberships?.forEach(m => {
        membershipMap[m.group_id] = m;
      });

      data.forEach(group => {
        group.my_membership = membershipMap[group.id] || null;
      });
    }

    return res.status(200).json({ groups: data });
  } catch (error) {
    console.error('List groups error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createGroup(req, res) {
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

    const {
      name,
      description,
      is_private,
      requires_approval,
      city,
      state,
      zip_code,
      latitude,
      longitude,
      default_game_type,
      default_stakes,
      typical_buyin_min,
      typical_buyin_max,
      max_players,
      typical_day,
      typical_time,
      frequency,
      settings
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const { data: group, error } = await supabase
      .from('captain_home_groups')
      .insert({
        name,
        description,
        owner_id: user.id,
        is_private: is_private !== false,
        requires_approval: requires_approval !== false,
        city,
        state,
        zip_code,
        latitude,
        longitude,
        default_game_type: default_game_type || 'nlhe',
        default_stakes,
        typical_buyin_min,
        typical_buyin_max,
        max_players: max_players || 9,
        typical_day,
        typical_time,
        frequency,
        settings: settings || {}
      })
      .select(`
        *,
        profiles:owner_id (id, display_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    return res.status(201).json({ group });
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({ error: error.message });
  }
}
