import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Tournament Alerts API
 * Manages user tournament alert preferences (localStorage primary, Supabase sync optional).
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
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
    if (!applyCors(req, res, { methods: 'GET, POST, DELETE, OPTIONS', headers: 'Content-Type, Authorization' })) return;
try {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      // Auth: verify JWT identity
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
      const userId = user.id;

      try {
          // GET: Fetch user's alert preferences
          if (req.method === 'GET') {
              const { match } = req.query;

              // If match=true, return matching tournaments
              if (match === 'true') {
                  // Fetch daily tournaments
                  const tournamentsRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/poker/daily-tournaments?limit=100`);
                  if (!tournamentsRes.ok) throw new Error(`Request failed (${tournamentsRes.status})`);
                  const tournamentsData = await tournamentsRes.json();
                  const tournaments = tournamentsData.tournaments || tournamentsData.data || [];

                  // Fetch user prefs from Supabase (or return empty)
                  const { data: prefs, error: prefsErr } = await getSupabase()
                      .from('tournament_alert_preferences')
                      .select('*')
                      .eq('user_id', userId)
                      .limit(1)
                      .maybeSingle();

                  if (prefsErr && prefsErr.code !== 'PGRST116') {
                      // PGRST116 = "The result contains 0 rows" (table may not exist yet)
                      console.warn('Error fetching alert prefs:', prefsErr);
                  }

                  if (!prefs) {
                      return res.status(200).json({ success: true, matches: [], prefs: null });
                  }

                  // Match tournaments against prefs
                  const matches = tournaments.filter(t => {
                      // Game type
                      const gameTypes = prefs.game_types || [];
                      if (gameTypes.length > 0) {
                          const tGame = (t.game_type || t.game || '').toLowerCase();
                          if (!gameTypes.some(g => tGame.includes(g.toLowerCase()))) return false;
                      }
                      // Buy-in range
                      const buyIn = t.buy_in || t.buyin || 0;
                      if (prefs.min_buyin && buyIn < prefs.min_buyin) return false;
                      if (prefs.max_buyin && buyIn > prefs.max_buyin) return false;
                      return true;
                  });

                  return res.status(200).json({ success: true, matches, prefs });
              }

              // Default: return just the prefs
              const { data: prefs, error } = await getSupabase()
                  .from('tournament_alert_preferences')
                  .select('*')
                  .eq('user_id', userId)
                  .limit(1)
                  .maybeSingle();

              // Table may not exist — handle gracefully
              if (error && error.code !== 'PGRST116' && !error.message?.includes('does not exist')) {
                  console.warn('Error fetching alert prefs:', error);
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }

              return res.status(200).json({ success: true, prefs: prefs || null });
          }

          // POST: Save/update alert preferences
          if (req.method === 'POST') {
              const { game_types, min_buyin, max_buyin, distance_mi, days, push_enabled, enabled } = req.body;

              const prefsData = {
                  user_id: userId,
                  game_types: game_types || [],
                  min_buyin: min_buyin || null,
                  max_buyin: max_buyin || null,
                  distance_mi: distance_mi || 50,
                  days: days || [],
                  push_enabled: push_enabled || false,
                  enabled: enabled !== undefined ? enabled : true,
                  updated_at: new Date().toISOString(),
              };

              // Upsert
              const { data, error } = await getSupabase()
                  .from('tournament_alert_preferences')
                  .upsert(prefsData, { onConflict: 'user_id' })
                  .select()
                  .maybeSingle();

              if (error) {
                  // If table doesn't exist, just return success (localStorage is primary)
                  if (error.message?.includes('does not exist')) {
                      return res.status(200).json({ success: true, prefs: prefsData, note: 'Saved locally only (table not created yet)' });
                  }
                  console.warn('Error saving alert prefs:', error);
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }

              return res.status(200).json({ success: true, prefs: data });
          }

          // DELETE: Remove alert preferences
          if (req.method === 'DELETE') {
              const { error } = await getSupabase()
                  .from('tournament_alert_preferences')
                  .delete()
                  .eq('user_id', userId);

              if (error && !error.message?.includes('does not exist')) {
                  console.warn('Error deleting alert prefs:', error);
                  return res.status(500).json({ success: false, error: 'Internal server error' });
              }

              return res.status(200).json({ success: true });
          }

          return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
      } catch (err) {
          console.warn('Tournament Alerts API error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
