/**
 * Seat Waitlist Player
 * POST /api/commander/waitlist/seat
 * Moves player from waitlist to a table seat, marks waitlist entry as seated
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const { waitlist_id, table_number, seat_number } = req.body;
    if (!waitlist_id || !table_number || !seat_number) {
      return res.status(400).json({ success: false, error: 'waitlist_id, table_number, and seat_number required' });
    }

    // Get waitlist entry
    const { data: entry } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('id', waitlist_id)
      .single();

    if (!entry) return res.status(404).json({ success: false, error: 'Waitlist entry not found' });

    // Log to history (non-blocking)
    try {
      await supabase.from('commander_waitlist_history').insert({
        venue_id: entry.venue_id,
        player_id: entry.player_id,
        game_type: entry.game_type,
        stakes: entry.stakes,
        wait_time_minutes: Math.round((Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60)),
        was_seated: true,
        signup_method: entry.signup_method
      });
    } catch { /* history is non-critical */ }

    // Delete the waitlist entry (player is now seated)
    const { error: wlError } = await supabase
      .from('commander_waitlist')
      .delete()
      .eq('id', waitlist_id);

    if (wlError) return res.status(500).json({ success: false, error: wlError.message });

    // Update actual seat in commander_seats (if game_id is available)
    try {
      if (entry.game_id) {
        await supabase
          .from('commander_seats')
          .upsert({
            game_id: entry.game_id,
            seat_number,
            status: 'occupied',
            player_name: entry.player_name,
            player_id: entry.player_id || null,
            seated_at: new Date().toISOString()
          }, { onConflict: 'game_id,seat_number' });
      }
    } catch { /* seat update is non-critical */ }

    return res.status(200).json({
      success: true,
      data: {
        waitlist_id,
        player_name: entry.player_name,
        table_number,
        seat_number,
        seated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Waitlist seat error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
