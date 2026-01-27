/**
 * Captain Session API - GET/PATCH /api/captain/sessions/:id
 * Get or update a session (checkout)
 * Reference: Phase 2 - Session Tracking
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Session ID required' }
    });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PATCH':
      return handlePatch(req, res, id);
    default:
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      });
  }
}

async function handleGet(req, res, sessionId) {
  try {
    const { data: session, error } = await supabase
      .from('captain_player_sessions')
      .select(`
        *,
        profiles (
          id,
          display_name,
          avatar_url
        )
      `)
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { session }
    });
  } catch (error) {
    console.error('Captain session GET error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}

async function handlePatch(req, res, sessionId) {
  try {
    const { action, games_played, total_buyin, comps_earned, notes } = req.body;

    // Get current session
    const { data: session, error: fetchError } = await supabase
      .from('captain_player_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' }
      });
    }

    const updates = {};

    // Handle checkout action
    if (action === 'checkout') {
      if (session.check_out_at) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Session already checked out' }
        });
      }

      const checkoutTime = new Date();
      const checkInTime = new Date(session.check_in_at);
      const totalMinutes = Math.round((checkoutTime - checkInTime) / (1000 * 60));
      const hoursPlayed = Math.floor(totalMinutes / 60);

      updates.check_out_at = checkoutTime.toISOString();
      updates.total_minutes = totalMinutes;

      // Award XP for session completion
      // 50 XP base + 10 XP per hour played
      if (session.player_id && totalMinutes >= 30) {
        const XP_FOR_SESSION_COMPLETE = 50;
        const XP_PER_HOUR = 10;
        const bonusXP = XP_FOR_SESSION_COMPLETE + (hoursPlayed * XP_PER_HOUR);

        updates.xp_earned = (session.xp_earned || 0) + bonusXP;
      }
    }

    // Handle abandon action
    if (action === 'abandon') {
      updates.status = 'abandoned';
      updates.check_out_at = new Date().toISOString();
    }

    // Update stats
    if (games_played !== undefined) updates.games_played = games_played;
    if (total_buyin !== undefined) updates.total_buyin = total_buyin;
    if (comps_earned !== undefined) updates.comps_earned = comps_earned;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' }
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('captain_player_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('Captain session PATCH error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to update session' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { session: updated }
    });
  } catch (error) {
    console.error('Captain session PATCH error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
