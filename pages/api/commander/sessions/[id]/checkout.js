/**
 * Commander Session Checkout API
 * POST /api/commander/sessions/[id]/checkout - Check out a player session
 * Reference: Phase 2 - Session Tracking
 */
import { createClient } from '@supabase/supabase-js';
import { captureException } from '../../../../../src/lib/commander/errorMonitoring';
import { guardStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Auth guard: require staff auth
  const _staff = await guardStaff(req, res);
  if (!_staff) return;

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Session ID is required' }
    });
  }

  try {
    // Get the existing session
    const { data: session, error: fetchError } = await supabase
      .from('commander_player_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' }
      });
    }

    if (session.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Session is not active' }
      });
    }

    // Calculate total time
    const checkInTime = new Date(session.check_in_at);
    const checkOutTime = new Date();
    const totalMinutes = Math.round((checkOutTime - checkInTime) / (1000 * 60));

    // Update session to completed
    const { data: updatedSession, error: updateError } = await supabase
      .from('commander_player_sessions')
      .update({
        status: 'completed',
        check_out_at: checkOutTime.toISOString(),
        total_time_minutes: totalMinutes
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Commander session checkout error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to checkout session' }
      });
    }

    // Free any seats the player occupies
    if (session.player_id) {
      await supabase
        .from('commander_seats')
        .update({
          status: 'available',
          player_id: null,
          player_name: null,
          seated_at: null
        })
        .eq('player_id', session.player_id)
        .eq('status', 'occupied');
    }

    return res.status(200).json({
      success: true,
      data: {
        session: updatedSession,
        total_time_minutes: totalMinutes
      }
    });
  } catch (error) {
    captureException(error, {
      action: 'session_checkout',
      endpoint: `/api/commander/sessions/${id}/checkout`,
      session_id: id
    });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
