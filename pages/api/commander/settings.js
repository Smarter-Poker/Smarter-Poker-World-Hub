/**
 * Venue Settings API
 * GET /api/commander/settings - Get venue settings
 * PUT /api/commander/settings - Update venue settings (room_open, etc)
 */
import { createClient } from '@supabase/supabase-js';
import { guardManager } from '../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardManager(req, res); if (!_g) return;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { data: staff } = await supabase
      .from('commander_staff')
      .select('venue_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

    if (req.method === 'GET') {
      const { data: settings } = await supabase
        .from('commander_venue_settings')
        .select('*')
        .eq('venue_id', staff.venue_id)
        .single();

      return res.status(200).json({
        success: true,
        data: settings || { venue_id: staff.venue_id, room_open: false }
      });
    }

    if (req.method === 'PUT') {
      const updates = req.body;
      const allowedFields = ['room_open', 'default_game_type', 'default_stakes',
        'max_tables', 'default_seats_per_table', 'time_billing_rate',
        'late_reg_levels', 'default_starting_chips', 'house_rules'];

      const filtered = {};
      for (const key of allowedFields) {
        if (updates[key] !== undefined) filtered[key] = updates[key];
      }

      const { data, error } = await supabase
        .from('commander_venue_settings')
        .upsert({
          venue_id: staff.venue_id,
          ...filtered,
          updated_at: new Date().toISOString(),
          updated_by: user.id
        }, { onConflict: 'venue_id' })
        .select()
        .single();

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Settings error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
