/**
 * geoPrivacy — shared coordinate-privacy primitives for Home Games.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `commander_home_groups.latitude/longitude` is a person's HOME ADDRESS.
 * The column type is DECIMAL(10,8)/DECIMAL(11,8), i.e. ~1mm precision.
 *
 * `pages/api/public/home-games/discover.js` implemented a careful privacy
 * model for this (grid snapping + whole-mile distance rounding), but the
 * logic lived as private functions inside that one route. The 2026-08-12
 * audit found `pages/api/poker/venues.js` — a public, unauthenticated
 * endpoint feeding the Poker Near Me map — returning the RAW coordinates and
 * a 0.1-mile-precision distance for the same groups. Every mitigation in
 * discover.js was therefore a no-op: the real address was one URL away via
 *
 *     GET /api/poker/venues?type=home_game&lat=..&lng=..&radius=150
 *
 * The fix is not to re-implement the jitter in the second route — that is how
 * the two implementations drifted apart in the first place. It is to have
 * exactly ONE implementation that both routes import.
 *
 * RULE: no route may emit a home group's latitude/longitude without passing
 * it through `jitterCoord()` first, and no route may expose a distance to a
 * home group at finer than whole-mile precision.
 *
 * See: audit-02-poker-near-me.md finding C-1.
 */

/**
 * Coarse coordinate for public display.
 *
 * The ORIGINAL design hashed groupId to offset the real coord by ±0.005°.
 * That was security-through-obscurity: the hash lives in public source, so an
 * attacker could recompute the offset for any visible groupId and subtract it
 * out to recover the EXACT host address from a single response.
 *
 * Real design (F33): snap the real coord to a 0.005° grid (~0.3 mi cell) and
 * return the CELL ANCHOR — a single point shared by every real location
 * inside that cell. No reverse-engineering recovers the sub-cell position,
 * because that information is genuinely discarded at snap time. The attack
 * surface is bounded at cell size.
 *
 * A small stable in-cell offset (±0.002°) is then added so multiple groups in
 * one cell don't stack on the map. That offset is publicly computable, but it
 * only scatters pins WITHIN the already-privacy-preserved cell, so knowing it
 * yields zero additional information about the real location.
 *
 * Bounds: 0.005° lat ≈ 0.35 mi at US latitudes; 0.005° lng ≈ 0.25 mi at 45°N
 * and 0.4 mi at 30°N.
 *
 * @param {string} groupId  stable per-group id (used only for in-cell scatter)
 * @param {number|string|null} lat
 * @param {number|string|null} lng
 * @returns {{lat: number|null, lng: number|null}}
 */
export function jitterCoord(groupId, lat, lng) {
  if (lat == null || lng == null) return { lat: null, lng: null };
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return { lat: null, lng: null };

  // Snap to 0.005° grid — the real coord is somewhere inside this cell.
  const cellLat = Math.round(nLat * 200) / 200;
  const cellLng = Math.round(nLng * 200) / 200;
  if (!groupId) return { lat: cellLat, lng: cellLng };

  // Stable in-cell offset for map-pin scatter only. Max ±0.002° so the
  // returned point stays inside the privacy cell.
  let a = 0;
  let b = 0;
  const s = String(groupId);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (a * 31 + c) >>> 0;
    b = (b * 37 + c * 7) >>> 0;
  }
  const dLat = ((a % 10000) / 10000 - 0.5) * 0.004;
  const dLng = ((b % 10000) / 10000 - 0.5) * 0.004;
  return { lat: cellLat + dLat, lng: cellLng + dLng };
}

/**
 * Great-circle distance in miles.
 * @returns {number}
 */
export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance to a home group, computed from the JITTERED coordinate and
 * returned at the precision that is safe to expose publicly.
 *
 * Two layers matter here and both are required:
 *   1. Measure from the jittered point, so a trilateration attack solves for
 *      the jittered point (offset up to ±0.3 mi from the real one).
 *   2. Round the exposed value to WHOLE MILES. Even if an attacker reverses
 *      the scatter seed, distance granularity caps the attack at ≈0.5 mi —
 *      enough for "this group is in the Loop", not "123 W Madison #4A".
 *
 * Callers that need to filter/sort by radius should use `raw` (unrounded) for
 * the comparison and expose only `miles`. `raw` must never be serialised to a
 * client response.
 *
 * @returns {{miles: number|null, raw: number|null, lat: number|null, lng: number|null}}
 */
export function publicDistanceToGroup(groupId, groupLat, groupLng, userLat, userLng) {
  const j = jitterCoord(groupId, groupLat, groupLng);
  if (
    j.lat == null ||
    j.lng == null ||
    userLat == null ||
    userLng == null ||
    !Number.isFinite(Number(userLat)) ||
    !Number.isFinite(Number(userLng))
  ) {
    return { miles: null, raw: null, lat: j.lat, lng: j.lng };
  }
  const raw = haversineMiles(Number(userLat), Number(userLng), j.lat, j.lng);
  return { miles: Math.round(raw), raw, lat: j.lat, lng: j.lng };
}

export default { jitterCoord, haversineMiles, publicDistanceToGroup };
