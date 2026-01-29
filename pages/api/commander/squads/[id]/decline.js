/**
 * Decline Squad Invitation API
 * POST /api/commander/squads/[id]/decline - Decline a squad invitation
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
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { id } = req.query;

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
    // Find the membership record
    const { data: membership, error: findError } = await supabase
      .from('commander_waitlist_group_members')
      .select('id')
      .eq('group_id', id)
      .eq('player_id', user.id)
      .single();

    if (findError || !membership) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Membership not found' }
      });
    }

    // Remove the member record (decline = leave the squad)
    const { error: deleteError } = await supabase
      .from('commander_waitlist_group_members')
      .delete()
      .eq('id', membership.id);

    if (deleteError) throw deleteError;

    return res.status(200).json({
      success: true,
      data: { message: 'Invitation declined' }
    });
  } catch (error) {
    console.error('Decline squad invitation error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to decline invitation' }
    });
  }
}
