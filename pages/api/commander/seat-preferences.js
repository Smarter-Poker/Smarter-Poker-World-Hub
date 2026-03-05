/**
 * Seat Preferences API
 * GET /api/commander/seat-preferences?player_id=X — Get preferences
 * POST /api/commander/seat-preferences — Save/update preferences
 */
import { createClient } from '@supabase/supabase-js';
import { guardUser } from '../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // Auth guard: require user auth for writes
  if (req.method !== "GET") { const _user = await guardUser(req, res); if (!_user) return; }
  if (req.method === 'GET') return getPreferences(req, res);
  if (req.method === 'POST') return savePreferences(req, res);
  return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
}

async function getPreferences(req, res) {
  const { player_id, venue_id } = req.query;

  if (!player_id) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'player_id required' } });
  }

  try {
    let query = supabase
      .from('commander_seat_preferences')
      .select('*')
      .eq('player_id', player_id);

    if (venue_id) query = query.eq('venue_id', venue_id);

    const { data: prefs, error } = await query.maybeSingle();
    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { preferences: prefs || { preferred_seats: [], left_handed: false, near_tv: null, away_from_tv: null, notes: null } }
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}

async function savePreferences(req, res) {
  const { player_id, venue_id, preferred_seats, left_handed, near_tv, away_from_tv, notes } = req.body;

  if (!player_id) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'player_id required' } });
  }

  try {
    const data = {
      player_id,
      venue_id: venue_id || null,
      preferred_seats: preferred_seats || [],
      left_handed: left_handed || false,
      near_tv: near_tv ?? null,
      away_from_tv: away_from_tv ?? null,
      notes: notes?.trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data: pref, error } = await supabase
      .from('commander_seat_preferences')
      .upsert(data, { onConflict: 'player_id,venue_id' })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, data: { preferences: pref } });
  } catch (error) {
    console.error('Save preferences error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}
