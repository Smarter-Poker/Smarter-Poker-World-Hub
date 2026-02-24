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
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

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

    // Update waitlist entry to seated
    const { error: wlError } = await supabase
      .from('commander_waitlist')
      .update({
        status: 'seated',
        seated_at: new Date().toISOString(),
        notes: `Seated at Table ${table_number}, Seat ${seat_number}`
      })
      .eq('id', waitlist_id);

    if (wlError) return res.status(500).json({ success: false, error: wlError.message });

    // Update table seat status
    const { error: seatError } = await supabase
      .from('commander_table_seats')
      .upsert({
        venue_id: entry.venue_id,
        table_number,
        seat_number,
        status: 'occupied',
        player_name: entry.player_name,
        seated_at: new Date().toISOString()
      }, { onConflict: 'venue_id,table_number,seat_number' });

    // Seat error is non-fatal (table_seats might not exist yet)
    if (seatError) console.warn('Seat update warning:', seatError.message);

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
