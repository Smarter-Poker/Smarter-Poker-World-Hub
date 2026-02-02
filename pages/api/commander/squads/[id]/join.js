/**
 * Join Squad API
 * POST /api/commander/squads/:id/join
 */
import { createClient } from '@supabase/supabase-js';

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
  const { player_id, invite_code } = req.body;

  if (!player_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'player_id required' }
    });
  }

  try {
    // Get squad
    const { data: squad, error: squadError } = await supabase
      .from('commander_waitlist_groups')
      .select(`
        *,
        commander_waitlist_group_members (id, player_id)
      `)
      .eq('id', id)
      .single();

    if (squadError || !squad) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Squad not found' }
      });
    }

    // Check if already a member
    const alreadyMember = squad.commander_waitlist_group_members?.some(
      m => m.player_id === player_id
    );
    if (alreadyMember) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_MEMBER', message: 'Already in this squad' }
      });
    }

    // Add member
    const { data: member, error: memberError } = await supabase
      .from('commander_waitlist_group_members')
      .insert({
        group_id: id,
        player_id
      })
      .select()
      .single();

    if (memberError) throw memberError;

    return res.status(200).json({
      success: true,
      data: { member }
    });
  } catch (error) {
    console.error('Join squad error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to join squad' }
    });
  }
}
