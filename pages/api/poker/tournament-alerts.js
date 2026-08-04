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

/** Great-circle distance in miles. */
function haversineMiles(lat1, lng1, lat2, lng2) {
    const R = 3959;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

                  // `enabled` is persisted by the POST below but was never read.
                  if (prefs.enabled === false) {
                      return res.status(200).json({ success: true, matches: [], prefs });
                  }

                  // Query the tournaments table DIRECTLY.
                  //
                  // This used to `fetch()` this app's own public URL from inside
                  // the serverless handler — a full round trip out through the
                  // CDN and back into another function, with no timeout and no
                  // abort, and on preview deploys (NEXT_PUBLIC_SITE_URL unset)
                  // it read PRODUCTION data.
                  let tq = getSupabase()
                      .from('venue_daily_tournaments')
                      .select('id, venue_id, venue_name, day_of_week, start_time, buy_in, game_type, tournament_name, guaranteed, source_url')
                      .eq('is_active', true)
                      .eq('data_quality', 'scraped_verified')
                      .or('is_suppressed.is.null,is_suppressed.eq.false');

                  if (prefs.min_buyin != null) tq = tq.gte('buy_in', prefs.min_buyin);
                  if (prefs.max_buyin != null) tq = tq.lte('buy_in', prefs.max_buyin);

                  const { data: tournaments, error: tErr } = await tq
                      .order('start_time', { ascending: true })
                      .limit(500);

                  if (tErr) {
                      console.warn('[tournament-alerts] tournament query failed:', tErr.message);
                      return res.status(200).json({ success: true, matches: [], prefs, degraded: true });
                  }

                  // `days` was persisted and then ignored by the matcher.
                  const wantedDays = Array.isArray(prefs.days)
                      ? prefs.days.map(d => String(d).toLowerCase().trim()).filter(Boolean)
                      : [];

                  let matches = (tournaments || []).filter(t => {
                      // Game type
                      const gameTypes = prefs.game_types || [];
                      if (gameTypes.length > 0) {
                          const tGame = (t.game_type || t.tournament_name || '').toLowerCase();
                          if (!gameTypes.some(g => tGame.includes(String(g).toLowerCase()))) return false;
                      }
                      // Day of week ('Daily' rows always qualify)
                      if (wantedDays.length > 0) {
                          const tDay = String(t.day_of_week || '').toLowerCase().trim();
                          if (tDay !== 'daily' && !wantedDays.includes(tDay)) return false;
                      }
                      return true;
                  });

                  // Distance: only applicable when the caller supplies their
                  // position. `distance_mi` was persisted but had nothing to
                  // measure against on the server.
                  const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
                  const userLat = parseFloat(safeQ(req.query.lat));
                  const userLng = parseFloat(safeQ(req.query.lng));
                  const maxMiles = Number.isFinite(prefs.distance_mi) ? prefs.distance_mi : null;
                  let distanceApplied = false;

                  if (Number.isFinite(userLat) && Number.isFinite(userLng) && maxMiles) {
                      const venueIds = [...new Set(
                          matches.map(t => Number(t.venue_id)).filter(n => Number.isFinite(n) && n > 0)
                      )];
                      if (venueIds.length > 0) {
                          const coordsById = new Map();
                          for (let i = 0; i < venueIds.length; i += 300) {
                              const { data: venueRows } = await getSupabase()
                                  .from('poker_venues')
                                  .select('id, latitude, longitude')
                                  .in('id', venueIds.slice(i, i + 300));
                              (venueRows || []).forEach(v => coordsById.set(Number(v.id), v));
                          }
                          matches = matches.filter(t => {
                              const v = coordsById.get(Number(t.venue_id));
                              const vLat = v ? parseFloat(v.latitude) : NaN;
                              const vLng = v ? parseFloat(v.longitude) : NaN;
                              if (!Number.isFinite(vLat) || !Number.isFinite(vLng)) return false;
                              return haversineMiles(userLat, userLng, vLat, vLng) <= maxMiles;
                          });
                          distanceApplied = true;
                      }
                  }

                  return res.status(200).json({ success: true, matches, prefs, distance_applied: distanceApplied });
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
