import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GEOFENCE VISIT TRACKER API
 *
 * Records when a player enters a venue geofence, at most once per venue in six
 * hours.
 *
 * Hardened 2026-11-27: the method is checked before the token, the identity
 * comes from the JWT only, venueId must be a uuid (geofence_visits.venue_id is
 * a uuid column, so anything else was a database error answered as a 500), the
 * venue name is bounded, a failed duplicate check is no longer read as "no
 * recent visit", and an insert that returns no row no longer crashes on
 * `newVisit.id`.
 *
 * Known limit, reported rather than patched: directory venues
 * (poker_venues.id) are integers, so a directory venue id cannot be stored in
 * geofence_visits.venue_id until that column is migrated. No client calls this
 * route today; the geofence uses linked-venues and the push alert route.
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { geofenceVisitRequest, guardBankrollRequest } from '../../../src/lib/bankroll/apiGuard.mjs';

const VISIT_WINDOW_MS = 6 * 60 * 60 * 1000;

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      const user = await guardBankrollRequest(req, res, {
          methods: ['POST'],
          verify: (request) => getServerUserWithFallback(request, getSupabase()),
      });
      if (!user) return;

      const input = geofenceVisitRequest(req.body);
      if (input.error) return res.status(400).json({ success: false, error: input.error });
      const userId = user.id;

      try {
          const since = new Date(Date.now() - VISIT_WINDOW_MS).toISOString();
          const { data: recentVisit, error: recentError } = await getSupabase()
              .from('geofence_visits')
              .select('id')
              .eq('user_id', userId)
              .eq('venue_id', input.venueId)
              .gte('entered_at', since)
              .limit(1);
          if (recentError) throw recentError;

          if (recentVisit && recentVisit.length > 0) {
              return res.status(200).json({
                  success: true,
                  message: 'Recent visit already logged',
                  existingVisitId: recentVisit[0].id
              });
          }

          const { data: newVisit, error } = await getSupabase()
              .from('geofence_visits')
              .insert({
                  user_id: userId,
                  venue_id: input.venueId,
                  venue_name: input.venueName,
                  entered_at: new Date().toISOString(),
                  notified: false,
                  session_logged: false
              })
              .select('id')
              .maybeSingle();
          if (error) throw error;
          if (!newVisit?.id) throw new Error('Visit insert returned no row');

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
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
