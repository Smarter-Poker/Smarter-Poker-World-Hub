/**
 * Dealers API — GET/POST
 * GET: List dealers for a venue
 * POST: Create a new dealer
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  const _g = await guardWriteStaff(req, res); if (!_g) return;

  const { venue_id } = req.query;

  if (req.method === 'GET') {
    if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });
    const { data, error } = await supabase
      .from('commander_dealers')
      .select('*')
      .eq('venue_id', venue_id)
      .order('name')
          .limit(100);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { dealers: data } });
  }

  if (req.method === 'POST') {
    const { venue_id: vid, display_name, name, employee_id, skill_level, certified_games } = req.body;
    const dealerName = name || display_name;
    if (!vid || !dealerName) return res.status(400).json({ success: false, error: 'venue_id and name required' });
    const { data, error } = await supabase
      .from('commander_dealers')
      .insert({ venue_id: vid, name: dealerName, employee_id, skill_level, certified_games })
      .select()
      .single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { dealer: data } });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
