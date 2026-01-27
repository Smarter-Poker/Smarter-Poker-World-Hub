/**
 * Squads API - Create group waitlist
 * POST /api/captain/squads
 * GET /api/captain/squads
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    return handleCreate(req, res);
  } else if (req.method === 'GET') {
    return handleList(req, res);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleCreate(req, res) {
  const { venue_id, game_type, stakes, leader_id, name, max_size = 6 } = req.body;

  if (!venue_id || !game_type || !leader_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id, game_type, and leader_id required' }
    });
  }

  try {
    // Generate invite code
    const invite_code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Create squad
    const { data: squad, error } = await supabase
      .from('captain_waitlist_groups')
      .insert({
        venue_id,
        game_type,
        stakes,
        leader_id,
        name: name || `Squad ${invite_code}`,
        invite_code,
        max_size,
        group_status: 'forming'
      })
      .select()
      .single();

    if (error) throw error;

    // Add leader as first member
    await supabase
      .from('captain_waitlist_group_members')
      .insert({
        group_id: squad.id,
        player_id: leader_id,
        is_leader: true,
        member_status: 'confirmed'
      });

    return res.status(201).json({
      success: true,
      data: { squad }
    });
  } catch (error) {
    console.error('Create squad error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create squad' }
    });
  }
}

async function handleList(req, res) {
  const { venue_id, player_id, status } = req.query;

  try {
    let query = supabase
      .from('captain_waitlist_groups')
      .select(`
        *,
        captain_waitlist_group_members (
          id,
          player_id,
          is_leader,
          member_status,
          profiles (id, display_name, avatar_url)
        )
      `)
      .order('created_at', { ascending: false });

    if (venue_id) query = query.eq('venue_id', venue_id);
    if (status) query = query.eq('group_status', status);

    const { data: squads, error } = await query;

    if (error) throw error;

    // Filter by player if specified
    let filtered = squads;
    if (player_id) {
      filtered = squads.filter(s =>
        s.captain_waitlist_group_members?.some(m => m.player_id === player_id)
      );
    }

    return res.status(200).json({
      success: true,
      data: { squads: filtered }
    });
  } catch (error) {
    console.error('List squads error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch squads' }
    });
  }
}
