/**
 * Hand-for-Hand API
 * POST /api/commander/tournaments/[id]/hand-for-hand
 * Toggles hand-for-hand mode (bubble play)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId } = req.query;
  if (!tournamentId) return res.status(400).json({ success: false, error: 'Tournament ID required' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: tournament } = await supabase
      .from('commander_tournaments')
      .select('id, venue_id, clock_state')
      .eq('id', tournamentId)
      .single();
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const { active } = req.body;
    const clockState = tournament.clock_state || {};

    const updatedClockState = {
      ...clockState,
      hand_for_hand: active !== false,
      hand_for_hand_started_at: active !== false ? new Date().toISOString() : null
    };

    const { error: uErr } = await supabase
      .from('commander_tournaments')
      .update({ clock_state: updatedClockState })
      .eq('id', tournamentId);

    if (uErr) return res.status(500).json({ success: false, error: 'Failed to update' });

    return res.status(200).json({
      success: true,
      data: {
        hand_for_hand: updatedClockState.hand_for_hand,
        started_at: updatedClockState.hand_for_hand_started_at
      }
    });
  } catch (err) {
    console.error('Hand-for-hand error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
