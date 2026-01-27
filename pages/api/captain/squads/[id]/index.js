/**
 * Squad Detail API
 * GET /api/captain/squads/:id
 * DELETE /api/captain/squads/:id
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, id);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleGet(req, res, id) {
  try {
    const { data: squad, error } = await supabase
      .from('captain_waitlist_groups')
      .select(`
        *,
        captain_waitlist_group_members (
          id,
          player_id,
          is_leader,
          status,
          joined_at,
          profiles (id, display_name, avatar_url)
        ),
        poker_venues (id, name, city, state)
      `)
      .eq('id', id)
      .single();

    if (error || !squad) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Squad not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { squad }
    });
  } catch (error) {
    console.error('Get squad error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch squad' }
    });
  }
}

async function handleDelete(req, res, id) {
  const { player_id } = req.body;

  try {
    // Check if player is the leader
    const { data: squad } = await supabase
      .from('captain_waitlist_groups')
      .select('leader_id')
      .eq('id', id)
      .single();

    if (!squad) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Squad not found' }
      });
    }

    if (squad.leader_id !== player_id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only leader can disband squad' }
      });
    }

    // Delete members first
    await supabase
      .from('captain_waitlist_group_members')
      .delete()
      .eq('group_id', id);

    // Delete squad
    await supabase
      .from('captain_waitlist_groups')
      .delete()
      .eq('id', id);

    return res.status(200).json({
      success: true,
      data: { message: 'Squad disbanded' }
    });
  } catch (error) {
    console.error('Delete squad error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete squad' }
    });
  }
}
