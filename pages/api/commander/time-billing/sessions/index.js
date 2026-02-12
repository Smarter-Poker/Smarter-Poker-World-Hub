/**
 * Time Billing Sessions API
 * GET /api/commander/time-billing/sessions - List sessions (active/completed)
 * POST /api/commander/time-billing/sessions - Start new session
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const _g = await guardWriteStaff(req, res); if (!_g) return;

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

    if (req.method === 'GET') {
      const { data: sessions, error } = await supabase
        .from('commander_time_sessions')
        .select('*')
        .eq('venue_id', staff.venue_id)
        .order('started_at', { ascending: false })
        .limit(100);

      if (error) {
        // Table might not exist yet - return empty
        return res.status(200).json({ success: true, data: [] });
      }
      return res.status(200).json({ success: true, data: sessions || [] });
    }

    if (req.method === 'POST') {
      const { player_name, table_number, seat_number, rate_per_hour } = req.body;
      if (!player_name) return res.status(400).json({ success: false, error: 'Player name required' });

      const { data: session, error } = await supabase
        .from('commander_time_sessions')
        .insert({
          venue_id: staff.venue_id,
          player_name,
          table_number: table_number || null,
          seat_number: seat_number || null,
          rate_per_hour: rate_per_hour || 12,
          status: 'active',
          started_at: new Date().toISOString(),
          started_by: user.id,
          amount_paid: 0,
          total_charge: 0
        })
        .select()
        .single();

      if (error) {
        console.error('Time session create error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.status(201).json({ success: true, data: session });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('Time billing error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
