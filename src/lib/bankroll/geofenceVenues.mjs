// The venues the bankroll page's geofence watches (2026-11-27).
//
// The page used to call `/api/bankroll/linked-venues?userId=<id>` with no
// token, so the route answered 401 every time and the geofence never started.
// Sending the token alone would have started it for everybody, and
// GeofenceService.start() calls watchPosition, which raises the browser's
// location prompt on page load with nothing the player did to ask for it.
//
// So the watch starts only where the player has ALREADY granted location to
// this site (for example from Poker Near Me). Nobody is prompted from here,
// and the venues requested are the ones near where they are.

/** The browser's current position, or null. Never prompts: callers check the permission first. */
function currentPosition(geolocation, timeoutMs) {
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (pos) => resolve(pos && pos.coords ? pos.coords : null),
        () => resolve(null),
        { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: timeoutMs },
      );
    } catch (_error) {
      resolve(null);
    }
  });
}

/**
 * Returns `{ venues, reason }`. `reason` says why the list is empty:
 * no-geolocation, not-granted, signed-out, no-position, refused-<status>, failed.
 */
export async function loadGeofenceVenues({ getToken, fetcher = fetch, nav = globalThis.navigator, timeoutMs = 10000 } = {}) {
  if (!nav || !nav.geolocation) return { venues: [], reason: 'no-geolocation' };
  let state = 'unknown';
  try {
    if (nav.permissions && typeof nav.permissions.query === 'function') {
      state = (await nav.permissions.query({ name: 'geolocation' }))?.state || 'unknown';
    }
  } catch (_error) {
    state = 'unknown';
  }
  if (state !== 'granted') return { venues: [], reason: 'not-granted' };

  const token = typeof getToken === 'function' ? await getToken() : null;
  if (!token) return { venues: [], reason: 'signed-out' };

  const coords = await currentPosition(nav.geolocation, timeoutMs);
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
    return { venues: [], reason: 'no-position' };
  }
  // Two decimals (about a kilometre) is all the venue search needs.
  const lat = Math.round(coords.latitude * 100) / 100;
  const lng = Math.round(coords.longitude * 100) / 100;

  try {
    const res = await fetcher(`/api/bankroll/linked-venues?lat=${lat}&lng=${lng}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return { venues: [], reason: `refused-${res.status}` };
    const data = await res.json();
    if (!data || !data.success || !Array.isArray(data.venues)) return { venues: [], reason: 'failed' };
    return { venues: data.venues, reason: data.venues.length ? 'ok' : 'none-nearby' };
  } catch (_error) {
    return { venues: [], reason: 'failed' };
  }
}
