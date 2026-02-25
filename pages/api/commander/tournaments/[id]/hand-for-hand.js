/**
 * Hand-for-Hand API
 * POST /api/commander/tournaments/[id]/hand-for-hand
 * Toggles hand-for-hand mode (bubble play)
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id: tournamentId } = req.query;
  if (!tournamentId) return res.status(400).json({ success: false, error: 'Tournament ID required' });

  try {
    // Staff is already validated by guardWriteStaff at the handler level

    // Get tournament for clock_state
    const { data: tournament, error: tErr } = await supabase
      .from('commander_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();
    if (tErr || !tournament) return res.status(404).json({ success: false, error: 'Tournament not found' });

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
