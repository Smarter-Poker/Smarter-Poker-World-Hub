/**
 * Leave Squad API
 * POST /api/captain/squads/:id/leave
 */
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const { id } = req.query;

  try {
    // Get authenticated user
    const supabaseServerClient = createPagesServerClient({ req, res });
    const { data: { user } } = await supabaseServerClient.auth.getUser();

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }

    // Get squad
    const { data: squad, error: squadError } = await supabase
      .from('captain_waitlist_groups')
      .select('id, leader_id, group_status')
      .eq('id', id)
      .single();

    if (squadError || !squad) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Squad not found' }
      });
    }

    // Check if user is the leader
    if (squad.leader_id === user.id) {
      return res.status(400).json({
        success: false,
        error: { code: 'LEADER_CANNOT_LEAVE', message: 'Leader cannot leave. Disband the squad instead.' }
      });
    }

    // Check if squad is still forming
    if (squad.group_status !== 'forming') {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_LEAVE', message: 'Cannot leave squad after joining waitlist' }
      });
    }

    // Remove member
    const { error: deleteError } = await supabase
      .from('captain_waitlist_group_members')
      .delete()
      .eq('group_id', id)
      .eq('player_id', user.id);

    if (deleteError) throw deleteError;

    return res.status(200).json({
      success: true,
      data: { message: 'Left squad successfully' }
    });
  } catch (error) {
    console.error('Leave squad error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to leave squad' }
    });
  }
}
