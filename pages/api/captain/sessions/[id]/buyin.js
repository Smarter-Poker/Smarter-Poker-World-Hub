/**
 * Captain Session Buy-in API - POST /api/captain/sessions/:id/buyin
 * Add a buy-in to a player session
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

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  }

  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid amount required' }
      });
    }

    // Get current session
    const { data: session, error: fetchError } = await supabase
      .from('captain_player_sessions')
      .select('id, status, total_buyin, venue_id, player_id')
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
        error: { code: 'SESSION_ENDED', message: 'Cannot add buy-in to ended session' }
      });
    }

    const newTotal = (session.total_buyin || 0) + amount;

    // Update session total
    const { data: updated, error: updateError } = await supabase
      .from('captain_player_sessions')
      .update({ total_buyin: newTotal })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Session buy-in error:', updateError);
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to add buy-in' }
      });
    }

    // Log the buy-in transaction (if table exists)
    try {
      await supabase
        .from('captain_buyin_transactions')
        .insert({
          session_id: id,
          venue_id: session.venue_id,
          player_id: session.player_id,
          amount: amount,
          transaction_type: 'buyin',
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      // Transaction logging is optional - don't fail if table doesn't exist
      console.log('Buy-in transaction log skipped:', logError.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        session: updated,
        added_amount: amount,
        new_total: newTotal
      }
    });
  } catch (error) {
    console.error('Session buy-in error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}
