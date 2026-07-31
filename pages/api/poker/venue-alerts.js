import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * API: /api/poker/venue-alerts
 * CRUD for venue game alerts system.
 * GET: List user's alerts
 * POST: Create a new alert
 * DELETE: Remove an alert
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  try {
    const limitType = req.method === 'GET' ? LIMITS.read : LIMITS.write;
    if (!applyRateLimit(req, res, limitType)) return;

    if (req.method === 'OPTIONS') return res.status(200).end();

    // SECURITY: identity always comes from the JWT, never from the query/body.
    // Mirrors pages/api/poker/tournament-alerts.js.
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    /* removed duplicate authUser */
    if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });
    const user_id = authUser.id;

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('venue_game_alerts')
        .select('*')
        .eq('user_id', user_id)
        .eq('active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return res.status(200).json({ alerts: data || [] });
    }
    
    if (req.method === 'POST') {
      const { venue_name, game_type, alert_via = 'push' } = req.body || {};
      if (!venue_name || !game_type) {
        return res.status(400).json({ error: 'venue_name and game_type required' });
      }
      
      // Check for duplicate
      const { data: existing } = await supabase
        .from('venue_game_alerts')
        .select('id')
        .eq('user_id', user_id)
        .eq('venue_name', venue_name)
        .eq('game_type', game_type)
        .eq('active', true)
        .maybeSingle();
      
      if (existing) {
        return res.status(200).json({ message: 'Alert already exists', alert: existing });
      }
      
      const { data, error } = await supabase
        .from('venue_game_alerts')
        .insert({
          user_id,
          venue_name,
          game_type,
          alert_via,
          active: true,
          last_triggered: null,
        })
        .select()
        .maybeSingle();
      
      if (error) throw error;
      return res.status(201).json({ alert: data });
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const { error } = await supabase
        .from('venue_game_alerts')
        .update({ active: false })
        .eq('id', id)
        .eq('user_id', user_id);
      
      if (error) throw error;
      return res.status(200).json({ success: true });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Venue alerts error:', err);
    res.status(500).json({ error: err.message });
  }
}
