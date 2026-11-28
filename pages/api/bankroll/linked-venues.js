import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Linked Venues API
 *
 * The venues GeofenceService watches: the player's own bankroll_locations
 * that are linked to a directory venue, plus, when the client sends its
 * approximate position, directory venues near it.
 *
 * What this route used to get wrong (2026-11-27):
 * - The answer is per player, yet it was sent `public, s-maxage=120`, and the
 *   bankroll page called it as `?userId=<id>` with no token: every call was a
 *   401, so the geofence never started for anyone, and a shared cache was
 *   told it could keep one player's venues for the next caller of that URL.
 * - Linked venues were returned with the bankroll_location's own coordinates,
 *   which are usually empty, although the header promised the directory's.
 * - With nothing linked it returned the first 500 directory venues anywhere
 *   in the country, cut off at an arbitrary row, and ignored a failed read.
 */
import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { guardBankrollRequest, nearbyPoint } from '../../../src/lib/bankroll/apiGuard.mjs';
import { fetchAllRows } from '../../../src/lib/bankroll/ledgerReport.mjs';

/** Half the side of the box searched around the player, in degrees of latitude (about 80 km). */
const NEARBY_DEGREES = 0.75;
const NEARBY_MAX = 200;

const coordinate = (value) => {
    const n = value === null || value === undefined || value === '' ? NaN : Number(value);
    return Number.isFinite(n) ? n : null;
};

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      const user = await guardBankrollRequest(req, res, {
          methods: ['GET'],
          verify: (request) => getServerUserWithFallback(request, getSupabase()),
      });
      if (!user) return;

      // Identity is the JWT's. A `userId` in the query is ignored.
      const point = nearbyPoint(req.query);
      if (point?.error) return res.status(400).json({ success: false, error: point.error });

      try {
          const { data: linkedLocations, error } = await getSupabase()
              .from('bankroll_locations')
              .select('id, name, venue_type, latitude, longitude, poker_venue_id, poker_venues(latitude, longitude, venue_type)')
              .eq('user_id', user.id)
              .not('poker_venue_id', 'is', null)
              .limit(200);
          if (error) throw error;

          const venues = [];
          const seen = new Set();
          for (const loc of linkedLocations || []) {
              const directory = loc.poker_venues || {};
              const latitude = coordinate(directory.latitude) ?? coordinate(loc.latitude);
              const longitude = coordinate(directory.longitude) ?? coordinate(loc.longitude);
              if (latitude === null || longitude === null || seen.has(loc.poker_venue_id)) continue;
              seen.add(loc.poker_venue_id);
              venues.push({
                  id: loc.poker_venue_id,
                  bankroll_location_id: loc.id,
                  name: loc.name,
                  venue_type: loc.venue_type || directory.venue_type || null,
                  latitude,
                  longitude,
                  linked: true,
              });
          }

          let directoryRows = [];
          if (point) {
              const lngSpan = NEARBY_DEGREES / Math.max(0.2, Math.cos((point.lat * Math.PI) / 180));
              const { data, error: nearbyError } = await getSupabase()
                  .from('poker_venues')
                  .select('id, name, venue_type, latitude, longitude')
                  .gte('latitude', point.lat - NEARBY_DEGREES)
                  .lte('latitude', point.lat + NEARBY_DEGREES)
                  .gte('longitude', point.lng - lngSpan)
                  .lte('longitude', point.lng + lngSpan)
                  .order('id', { ascending: true })
                  .limit(NEARBY_MAX);
              if (nearbyError) throw nearbyError;
              directoryRows = data || [];
          } else if (venues.length === 0) {
              // No position and nothing linked: every directory venue with a
              // position, a page at a time rather than the first 500.
              directoryRows = await fetchAllRows(() => getSupabase()
                  .from('poker_venues')
                  .select('id, name, venue_type, latitude, longitude')
                  .not('latitude', 'is', null)
                  .not('longitude', 'is', null)
                  .order('id', { ascending: true }), { maxRows: 5000 });
          }

          for (const v of directoryRows) {
              const latitude = coordinate(v.latitude);
              const longitude = coordinate(v.longitude);
              if (latitude === null || longitude === null || seen.has(v.id)) continue;
              seen.add(v.id);
              venues.push({ id: v.id, name: v.name, venue_type: v.venue_type, latitude, longitude, linked: false });
          }

          return res.status(200).json({ success: true, venues, total: venues.length });
      } catch (err) {
          console.warn('Linked venues error:', err);
          return res.status(500).json({ success: false, error: 'Venues could not be read. Try again.' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
