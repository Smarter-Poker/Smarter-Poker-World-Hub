/**
 * openNativeMaps.js — Centralized device-aware map routing utility
 * 
 * Routes map requests to the user's NATIVE map application:
 *   - iOS/iPad → Apple Maps
 *   - Mac (touch or desktop) → Apple Maps (native Mac app)
 *   - Android → geo: URI (system default maps app)
 *   - Windows/Linux → Checks localStorage preference, defaults to Apple Maps web
 * 
 * RULE: Never default to Google Maps. Use the device's native/preferred map app.
 */

/**
 * Detect user's platform for map routing
 * @returns {'apple'|'android'|'apple-web'} the best map provider for this device
 */
function detectMapProvider() {
  if (typeof navigator === 'undefined') return 'apple-web';
  const ua = navigator.userAgent || '';

  // iOS (iPhone, iPad, iPod) — always Apple Maps
  if (/iPhone|iPad|iPod/i.test(ua)) return 'apple';

  // Android — geo: protocol for system default
  if (/Android/i.test(ua)) return 'android';

  // Mac (desktop or touch) — Apple Maps is the native app
  if (/Macintosh/i.test(ua)) return 'apple';

  // Windows / Linux / other — check localStorage preference, default Apple Maps web
  try {
    const pref = localStorage.getItem('smarter_preferred_maps');
    if (pref === 'google') return 'google';
    if (pref === 'waze') return 'waze';
  } catch { /* localStorage unavailable */ }

  // Default: Apple Maps web (works on all browsers, never Google)
  return 'apple-web';
}

/**
 * Open the user's native maps app with an address search
 * @param {Object} options
 * @param {string} [options.address] - human-readable address string
 * @param {number} [options.lat] - latitude (for directions mode)
 * @param {number} [options.lng] - longitude (for directions mode)
 * @param {'search'|'directions'} [options.mode='search'] - search for a place vs get directions
 */
export function openNativeMaps({ address, lat, lng, mode = 'search' } = {}) {
  const provider = detectMapProvider();
  const encoded = encodeURIComponent(address || '');

  // === DIRECTIONS MODE (turn-by-turn using lat/lng) ===
  if (mode === 'directions' && lat != null && lng != null) {
    switch (provider) {
      case 'apple':
        return window.open(`https://maps.apple.com/?daddr=${lat},${lng}`, '_blank');
      case 'android':
        window.location.href = `geo:${lat},${lng}?q=${encoded}`;
        return;
      case 'waze':
        return window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank');
      case 'google':
        return window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
      case 'apple-web':
      default:
        return window.open(`https://maps.apple.com/?daddr=${lat},${lng}`, '_blank');
    }
  }

  // === SEARCH MODE (open map centered on address) ===
  switch (provider) {
    case 'apple':
      return window.open(`https://maps.apple.com/?q=${encoded}`, '_blank');
    case 'android':
      window.location.href = `geo:0,0?q=${encoded}`;
      return;
    case 'waze':
      return window.open(`https://waze.com/ul?q=${encoded}`, '_blank');
    case 'google':
      return window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
    case 'apple-web':
    default:
      return window.open(`https://maps.apple.com/?q=${encoded}`, '_blank');
  }
}

/**
 * Build an address string from venue-like objects
 * @param {Object} venue - object with address, name, city, state properties
 * @returns {string} formatted address string
 */
export function buildVenueAddress(venue) {
  if (!venue) return '';
  return [venue.address, venue.name, venue.city, venue.state].filter(Boolean).join(', ');
}

export default openNativeMaps;
