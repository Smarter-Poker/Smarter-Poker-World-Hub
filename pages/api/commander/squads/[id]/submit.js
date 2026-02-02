/**
 * Submit Squad to Waitlist API
 * POST /api/commander/squads/:id/submit
 * Submits the entire squad to the venue waitlist
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

  try {
    // Get authenticated user via Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
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

    // Get squad with members
    const { data: squad, error: squadError } = await supabase
      .from('commander_waitlist_groups')
      .select(`
        *,
        commander_waitlist_group_members (
          id,
          player_id,
          joined_at,
          profiles (id, display_name, phone)
        )
      `)
      .eq('id', id)
      .single();

    if (squadError || !squad) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Squad not found' }
      });
    }

    // Verify user is the leader
    if (squad.leader_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only squad leader can submit to waitlist' }
      });
    }

    // Verify squad is in forming status (not yet submitted)
    if (squad.status !== 'forming') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_SUBMITTED', message: 'Squad already submitted to waitlist' }
      });
    }

    // All members present in the group are confirmed (schema has no status column on members)
    const members = squad.commander_waitlist_group_members || [];

    if (members.length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_ENOUGH_MEMBERS', message: 'Need at least 2 members' }
      });
    }

    // Get current waitlist position
    const { count: currentPosition } = await supabase
      .from('commander_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', squad.venue_id)
      .eq('game_type', squad.game_type)
      .eq('stakes', squad.stakes)
      .eq('status', 'waiting');

    const position = (currentPosition || 0) + 1;

    // Build squad notes with preferences
    const squadNotes = [
      `Squad group: ${squad.id}`,
      squad.prefer_same_table ? 'Prefer same table' : null,
      squad.accept_split ? 'Accept split' : null
    ].filter(Boolean).join('. ');

    // Create waitlist entries for each member
    const waitlistEntries = members.map((member, index) => ({
      venue_id: squad.venue_id,
      player_id: member.player_id,
      player_name: member.profiles?.display_name || `Player ${index + 1}`,
      player_phone: member.profiles?.phone || null,
      game_type: squad.game_type,
      stakes: squad.stakes,
      position: position,
      status: 'waiting',
      signup_method: 'app',
      notes: squadNotes
    }));

    const { data: entries, error: entriesError } = await supabase
      .from('commander_waitlist')
      .insert(waitlistEntries)
      .select();

    if (entriesError) throw entriesError;

    // Update squad status to waiting (submitted to waitlist)
    const { error: updateError } = await supabase
      .from('commander_waitlist_groups')
      .update({
        status: 'waiting'
      })
      .eq('id', id);

    if (updateError) throw updateError;

    return res.status(200).json({
      success: true,
      data: {
        message: 'Squad joined waitlist',
        position: position,
        entries_created: entries?.length || 0
      }
    });
  } catch (error) {
    console.error('Submit squad error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to submit squad to waitlist' }
    });
  }
}
