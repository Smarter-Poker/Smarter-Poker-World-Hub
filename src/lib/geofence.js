/**
 * GeofenceService - GPS-based venue proximity detection
 * 
 * Watches user's GPS position and fires callbacks when they enter
 * the geofence radius of a known poker venue.
 * 
 * Usage:
 *   const gf = new GeofenceService();
 *   gf.start(venues, (venue) => { console.log('Entered:', venue.name); });
 *   gf.stop();
 */

const STORAGE_KEY = 'smarter-poker-geofence-triggered';
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

const RADIUS_BY_TYPE = {
  casino: 500,
  card_room: 300,
  poker_club: 200,
  charity: 200,
};
const DEFAULT_RADIUS = 300;

/**
 * Returns the geofence radius in meters for a given venue type.
 */
function getRadiusForType(venueType) {
  return RADIUS_BY_TYPE[venueType] || DEFAULT_RADIUS;
}

/**
 * Haversine formula — returns the distance in meters between two lat/lng points.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default class GeofenceService {
  constructor() {
    this._watchId = null;
    this._venues = [];
    this._onEnter = null;
    this._triggered = this._loadTriggered();
  }

  // ------------------------------------------------------------------ public

  /**
   * Start watching the user's GPS position and checking venue geofences.
   *
   * @param {Array} venues  - Array of venue objects (must have latitude, longitude, venue_type, id)
   * @param {Function} onEnter - Callback invoked with the venue object when the user enters its geofence
   */
  start(venues, onEnter) {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      console.warn('[GeofenceService] Geolocation not available');
      return;
    }

    this._venues = venues || [];
    this._onEnter = onEnter;

    // Prune expired entries before starting
    this._pruneTriggered();

    this._watchId = navigator.geolocation.watchPosition(
      (position) => this._handlePosition(position),
      (err) => console.warn('[GeofenceService] watchPosition error:', err.message),
      {
        enableHighAccuracy: true,
        maximumAge: 30000,      // accept a position up to 30s old
        timeout: 15000,
      }
    );
  }

  /**
   * Stop watching the user's GPS position.
   */
  stop() {
    if (this._watchId !== null && typeof window !== 'undefined') {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  }

  /**
   * Pure geometric check — is the user within `radiusMeters` of a point?
   *
   * @param {number} userLat
   * @param {number} userLng
   * @param {number} venueLat
   * @param {number} venueLng
   * @param {number} radiusMeters
   * @returns {boolean}
   */
  isInsideGeofence(userLat, userLng, venueLat, venueLng, radiusMeters) {
    const dist = haversineDistance(userLat, userLng, venueLat, venueLng);
    return dist <= radiusMeters;
  }

  // ----------------------------------------------------------------- private

  _handlePosition(position) {
    const { latitude: userLat, longitude: userLng } = position.coords;

    for (const venue of this._venues) {
      if (!venue.latitude || !venue.longitude) continue;

      const radius = getRadiusForType(venue.venue_type);
      const inside = this.isInsideGeofence(
        userLat,
        userLng,
        venue.latitude,
        venue.longitude,
        radius
      );

      if (inside && !this._hasTriggeredRecently(venue)) {
        this._markTriggered(venue);
        if (typeof this._onEnter === 'function') {
          this._onEnter(venue);
        }
      }
    }
  }

  /**
   * Has this venue already fired within the cooldown window?
   */
  _hasTriggeredRecently(venue) {
    const key = String(venue.id);
    const ts = this._triggered[key];
    if (!ts) return false;
    return Date.now() - ts < COOLDOWN_MS;
  }

  /**
   * Record that we just triggered for this venue.
   */
  _markTriggered(venue) {
    const key = String(venue.id);
    this._triggered[key] = Date.now();
    this._saveTriggered();
  }

  /**
   * Remove entries older than the cooldown window.
   */
  _pruneTriggered() {
    const now = Date.now();
    let changed = false;
    for (const key of Object.keys(this._triggered)) {
      if (now - this._triggered[key] >= COOLDOWN_MS) {
        delete this._triggered[key];
        changed = true;
      }
    }
    if (changed) this._saveTriggered();
  }

  _loadTriggered() {
    try {
      if (typeof window === 'undefined') return {};
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _saveTriggered() {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._triggered));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }
}
