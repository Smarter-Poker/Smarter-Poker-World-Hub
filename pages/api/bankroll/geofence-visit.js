/**
 * 📍 GEOFENCE VISIT TRACKER API
 * ═══════════════════════════════════════════════════════════════════════════
 * Records when a user enters a poker venue geo-fence
 * ═══════════════════════════════════════════════════════════════════════════
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
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // BUG #249 FIX: Require JWT auth — prevent IDOR on bankroll data
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const _authUser = authData?.user;
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { venueId, venueName, latitude, longitude } = req.body;
      // BUG #240 FIX: Use JWT identity, not client-submitted userId
      const userId = _authUser.id;

      if (!venueId) {
          return res.status(400).json({ success: false, error: 'venueId required' });
      }

      try {
          // Check if user already has a recent (within 6 hours) visit to this venue
          const sixHoursAgo = new Date();
          sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

          const { data: recentVisit } = await getSupabase()
              .from('geofence_visits')
              .select('id')
              .eq('user_id', userId)
              .eq('venue_id', venueId)
              .gte('entered_at', sixHoursAgo.toISOString())
              .limit(1);

          if (recentVisit && recentVisit.length > 0) {
              // Already logged a recent visit to this venue
              return res.status(200).json({
                  success: true,
                  message: 'Recent visit already logged',
                  existingVisitId: recentVisit[0].id
              });
          }

          // Record the new geo-fence entry
          const { data: newVisit, error } = await getSupabase()
              .from('geofence_visits')
              .insert({
                  user_id: userId,
                  venue_id: venueId,
                  venue_name: venueName || 'Poker Venue',
                  entered_at: new Date().toISOString(),
                  notified: false,
                  session_logged: false
              })
              .select()
              .maybeSingle();

          if (error) {
              console.warn('[Geofence] Insert error:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }


          return res.status(200).json({
              success: true,
              message: 'Geofence visit recorded',
              visitId: newVisit.id,
              reminderScheduledFor: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
          });

      } catch (error) {
          console.warn('[Geofence] Server error:', error);
          return res.status(500).json({ success: false, error: 'Failed to record visit' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
