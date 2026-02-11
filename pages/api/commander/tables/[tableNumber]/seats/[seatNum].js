/**
 * Table Seat Action API
 * PUT /api/commander/tables/[tableNumber]/seats/[seatNum]
 * Dealer tablet actions: mark seat as open, away, empty, occupied
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    const { tableNumber, seatNum } = req.query;
    const { action } = req.body; // open, away, empty, occupied

    const statusMap = {
      open: 'open',
      away: 'away',
      empty: 'empty',
      occupied: 'occupied'
    };

    const newStatus = statusMap[action] || 'empty';

    const { data, error } = await supabase
      .from('commander_table_seats')
      .upsert({
        venue_id: staff.venue_id,
        table_number: parseInt(tableNumber),
        seat_number: parseInt(seatNum),
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'empty' ? { player_name: null, seated_at: null } : {})
      }, { onConflict: 'venue_id,table_number,seat_number' })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Seat action error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
