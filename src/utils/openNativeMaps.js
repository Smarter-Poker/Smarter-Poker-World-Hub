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
 * 
 * Features:
 *   - Device-aware routing (Apple/Android/Waze/Google)
 *   - localStorage preference override ('smarter_preferred_maps')
 *   - Toast notification on map open
 *   - Multi-stop route building (for Road Trip Planner)
 *   - Search mode (view location) vs Directions mode (navigate)
 */

/**
 * Detect user's platform for map routing
 * @returns {'apple'|'android'|'apple-web'|'google'|'waze'} the best map provider
 */
function detectMapProvider() {
  if (typeof navigator === 'undefined') return 'apple-web';
  const ua = navigator.userAgent || '';

  // Check localStorage preference first (user explicit choice overrides device detection)
  try {
    const pref = localStorage.getItem('smarter_preferred_maps');
    if (pref && pref !== 'auto') {
      if (pref === 'google') return 'google';
      if (pref === 'waze') return 'waze';
      if (pref === 'apple') return 'apple';
    }
  } catch { /* localStorage unavailable */ }

  // iOS (iPhone, iPad, iPod) — always Apple Maps
  if (/iPhone|iPad|iPod/i.test(ua)) return 'apple';

  // Android — geo: protocol for system default
  if (/Android/i.test(ua)) return 'android';

  // Mac (desktop or touch) — Apple Maps is the native app
  if (/Macintosh/i.test(ua)) return 'apple';

  // Default: Apple Maps web (works on all browsers, never Google)
  return 'apple-web';
}

/**
 * Get a human-readable name for the current map provider
 * @returns {string} e.g. "Apple Maps", "Google Maps", "Waze"
 */
export function getMapProviderName() {
  const provider = detectMapProvider();
  switch (provider) {
    case 'apple': return 'Apple Maps';
    case 'apple-web': return 'Apple Maps';
    case 'google': return 'Google Maps';
    case 'waze': return 'Waze';
    case 'android': return 'Default Maps';
    default: return 'Maps';
  }
}

/**
 * Show a brief toast notification (imported lazily to avoid circular deps)
 */
function showToast(message) {
  // Dynamic import to avoid bundling the React component in utility code
  try {
    if (typeof document === 'undefined') return;
    // Remove existing toast
    const existing = document.getElementById('sp-map-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'sp-map-toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%',
      'transform:translateX(-50%) translateY(10px)',
      'background:rgba(10,14,25,0.94)', 'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)', 'color:#e2e8f0',
      'padding:10px 20px', 'border-radius:10px',
      'font-size:13px', 'font-weight:600',
      'font-family:Inter,-apple-system,sans-serif',
      'border:1px solid rgba(212,168,83,0.25)',
      'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
      'z-index:99999', 'display:flex', 'align-items:center', 'gap:8px',
      'opacity:0', 'transition:opacity 0.25s ease,transform 0.25s ease',
      'pointer-events:none',
    ].join(';');
    toast.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d4a853" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>${message}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  } catch { /* silent */ }
}

/**
 * Open the user's native maps app with an address search
 * @param {Object} options
 * @param {string} [options.address] - human-readable address string
 * @param {number} [options.lat] - latitude (for directions mode)
 * @param {number} [options.lng] - longitude (for directions mode)
 * @param {'search'|'directions'} [options.mode='search'] - search vs navigate
 * @param {boolean} [options.silent=false] - skip the toast notification
 */
export function openNativeMaps({ address, lat, lng, mode = 'search', silent = false } = {}) {
  const provider = detectMapProvider();
  const encoded = encodeURIComponent(address || '');
  const providerName = getMapProviderName();

  if (!silent) {
    const action = mode === 'directions' ? 'Navigating' : 'Opening';
    showToast(`${action} In ${providerName}...`);
  }

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
 * Open native maps with a multi-stop route (for Road Trip Planner)
 * Apple Maps supports waypoints via URL params, Google Maps supports up to 10
 * @param {Array<{name: string, lat: number, lng: number}>} stops - ordered list of stops
 * @param {boolean} [silent=false] - skip toast
 */
export function openMultiStopRoute(stops, silent = false) {
  if (!stops || stops.length < 2) return;
  const provider = detectMapProvider();
  const providerName = getMapProviderName();

  if (!silent) {
    showToast(`Opening ${stops.length}-Stop Route In ${providerName}...`);
  }

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);

  switch (provider) {
    case 'apple':
    case 'apple-web': {
      // Apple Maps: saddr=origin&daddr=destination — waypoints via intermediate URLs
      // For 2 stops, simple. For multi-stop, chain with +to: syntax or fall back to single dest  
      if (stops.length === 2) {
        return window.open(`https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${destination.lat},${destination.lng}`, '_blank');
      }
      // Apple Maps multi-stop: use daddr with "+" separators
      const daddrs = stops.slice(1).map(s => `${s.lat},${s.lng}`).join('+to:');
      return window.open(`https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${daddrs}`, '_blank');
    }
    case 'google': {
      // Google Maps: up to 10 waypoints supported in URL
      const waypointStr = waypoints.map(w => `${w.lat},${w.lng}`).join('|');
      let url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
      if (waypointStr) url += `&waypoints=${encodeURIComponent(waypointStr)}`;
      url += '&travelmode=driving';
      return window.open(url, '_blank');
    }
    case 'waze': {
      // Waze only supports single destination — open with final stop
      return window.open(`https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes`, '_blank');
    }
    case 'android': {
      // Android: google.navigation intent with waypoints
      const waypointStr = waypoints.map(w => `${w.lat},${w.lng}`).join('|');
      let url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
      if (waypointStr) url += `&waypoints=${encodeURIComponent(waypointStr)}`;
      url += '&travelmode=driving';
      return window.open(url, '_blank');
    }
    default:
      return window.open(`https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${destination.lat},${destination.lng}`, '_blank');
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

/**
 * Get the current preference value
 * @returns {string} 'auto'|'apple'|'google'|'waze'
 */
export function getMapPreference() {
  try {
    return localStorage.getItem('smarter_preferred_maps') || 'auto';
  } catch { return 'auto'; }
}

/**
 * Set the map preference
 * @param {string} pref - 'auto'|'apple'|'google'|'waze'
 */
export function setMapPreference(pref) {
  try {
    if (pref === 'auto') {
      localStorage.removeItem('smarter_preferred_maps');
    } else {
      localStorage.setItem('smarter_preferred_maps', pref);
    }
  } catch { /* localStorage unavailable */ }
}

export default openNativeMaps;
