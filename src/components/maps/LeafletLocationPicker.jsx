/**
 * ════════════════════════════════════════════════════════════════════════
 *  LeafletLocationPicker — drop-in Leaflet replacement for GoogleMapPicker
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Why this exists:
 *    GoogleMapPicker depends on Google Maps Platform billing being enabled
 *    on the GCP project that owns the API key. When billing lapses or the
 *    key is moved to a non-billing project, Google injects a "This page
 *    can't load Google Maps correctly" modal that visually blocks the form.
 *
 *    Poker Near Me (/hub/poker-near-me) uses Leaflet + CartoDB tiles —
 *    same stack, zero billing, no API key, no Google project at all. This
 *    component brings that same stack to the home-games "Approximate
 *    Location" picker.
 *
 *  Library choices:
 *    - Leaflet 1.9.4 loaded from unpkg (same pattern Poker Near Me uses)
 *    - CartoDB dark_all tiles (matches the dark cmd-panel theme; labels
 *      ON because the host needs street/city context to pick a location)
 *    - Nominatim (OpenStreetMap) for forward + reverse geocoding —
 *      completely free, no API key. Rate-limited to ~1 req/sec; we
 *      debounce search by 700ms and only reverse-geocode on drag-end.
 *
 *  Same prop interface as GoogleMapPicker so the swap is drop-in:
 *    <LeafletLocationPicker
 *      value={{ lat, lng, city, state }}
 *      onChange={({ lat, lng, city, state, zipCode, neighborhood }) => ...}
 *      approximateOnly={true}
 *    />
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const C = {
  bg: '#0D192E', card: '#0F1C32', text: '#FFFFFF', textSec: '#94A3B8',
  border: '#4A5E78', accent: '#22D3EE',
};

// Load Leaflet from CDN once across all instances. Returns a promise that
// resolves when `window.L` is ready. Idempotent and SSR-safe.
let leafletLoadPromise = null;
function ensureLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    // CSS first (Leaflet won't render correctly without it)
    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      link.setAttribute('data-leaflet-css', 'true');
      document.head.appendChild(link);
    }
    // JS next
    const existing = document.querySelector('script[data-leaflet-js]');
    if (existing) {
      // Another instance is loading it — poll until ready.
      const check = setInterval(() => {
        if (window.L) { clearInterval(check); resolve(window.L); }
      }, 50);
      // Safety net: bail after 10s of no L
      setTimeout(() => { clearInterval(check); if (!window.L) reject(new Error('Leaflet load timeout')); }, 10000);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    s.crossOrigin = '';
    s.setAttribute('data-leaflet-js', 'true');
    s.onload = () => resolve(window.L);
    s.onerror = (e) => reject(new Error('Leaflet load failed'));
    document.head.appendChild(s);
  });
  return leafletLoadPromise;
}

// Privacy approximation: round lat/lng to ~1.1 km precision so the host's
// exact address can never be reconstructed from the persisted value.
function approximateLocation(lat, lng) {
  const p = 2; // 2 decimal places
  return {
    lat: Math.round(lat * Math.pow(10, p)) / Math.pow(10, p),
    lng: Math.round(lng * Math.pow(10, p)) / Math.pow(10, p),
  };
}

// US state full name → 2-letter abbreviation. Nominatim returns full state
// names; the form expects abbreviations (matches commander_home_groups.state).
const STATE_ABBREV = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC',
};
function stateAbbrev(name) {
  if (!name) return '';
  const lower = String(name).toLowerCase();
  if (STATE_ABBREV[lower]) return STATE_ABBREV[lower];
  if (name.length === 2) return name.toUpperCase();
  return name;
}

// Nominatim forward search. US-only, limit 5, address details on.
async function nominatimSearch(query) {
  if (!query?.trim()) return [];
  const url = 'https://nominatim.openstreetmap.org/search'
    + '?format=json&limit=5&addressdetails=1&countrycodes=us'
    + '&q=' + encodeURIComponent(query);
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    return await res.json();
  } catch (_e) {
    return [];
  }
}

// Nominatim reverse geocode (lat,lng → address parts)
async function nominatimReverse(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    const a = json.address || {};
    return {
      city: a.city || a.town || a.village || a.hamlet || '',
      state: stateAbbrev(a.state || ''),
      zipCode: a.postcode || '',
      neighborhood: a.neighbourhood || a.suburb || '',
      country: (a.country_code || '').toUpperCase(),
    };
  } catch (_e) {
    return null;
  }
}

export default function LeafletLocationPicker({ value, onChange, approximateOnly = true, height = 300 }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef(null);

  // Keep ref in sync so the long-lived map handlers always call the latest onChange
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const defaultCenter = {
    lat: (typeof value?.lat === 'number') ? value.lat : 36.1699,
    lng: (typeof value?.lng === 'number') ? value.lng : -115.1398,
  };

  // Step 1: load Leaflet
  useEffect(() => {
    let cancelled = false;
    ensureLeaflet()
      .then(() => { if (!cancelled) setLoaded(true); })
      .catch(() => { if (!cancelled) setError('Map could not load'); });
    return () => { cancelled = true; };
  }, []);

  // Step 2: init map once Leaflet is ready and the container is mounted
  useEffect(() => {
    if (!loaded || !mapRef.current || mapInstance.current) return;
    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [defaultCenter.lat, defaultCenter.lng],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    mapInstance.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    const approx = approximateOnly ? approximateLocation(defaultCenter.lat, defaultCenter.lng) : defaultCenter;

    // Approximate-area circle (visual hint that the location is fuzzy)
    if (approximateOnly) {
      circleRef.current = L.circle([approx.lat, approx.lng], {
        radius: 800, // ~0.5 mile
        fillColor: '#22D3EE',
        fillOpacity: 0.15,
        color: '#22D3EE',
        opacity: 0.6,
        weight: 2,
      }).addTo(map);
    }

    // Pin (draggable). Lucide-style MapPin SVG embedded as a divIcon so we
    // don't need to ship a separate PNG asset.
    const pinHtml =
      '<div style="transform: translate(-50%, -100%); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">'
      + '<svg width="28" height="28" viewBox="0 0 24 24" fill="#EF4444" stroke="#fff" stroke-width="1.5">'
      + '<path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 1 1 16 0Z"/>'
      + '<circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/>'
      + '</svg></div>';
    const pinIcon = L.divIcon({
      html: pinHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 28],
    });
    markerRef.current = L.marker([approx.lat, approx.lng], { draggable: true, icon: pinIcon }).addTo(map);

    const propagate = async (lat, lng) => {
      const approxPos = approximateOnly ? approximateLocation(lat, lng) : { lat, lng };
      if (markerRef.current) markerRef.current.setLatLng([approxPos.lat, approxPos.lng]);
      if (circleRef.current) circleRef.current.setLatLng([approxPos.lat, approxPos.lng]);
      const geo = await nominatimReverse(approxPos.lat, approxPos.lng);
      if (onChangeRef.current) {
        onChangeRef.current({ ...approxPos, ...(geo || {}), approximate: approximateOnly });
      }
    };

    markerRef.current.on('dragend', (e) => {
      const { lat, lng } = e.target.getLatLng();
      propagate(lat, lng);
    });

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      propagate(lat, lng);
    });

    // Surface initial geo so the form has city/state populated even if the
    // user never drags the pin.
    propagate(defaultCenter.lat, defaultCenter.lng);

    return () => {
      try { map.remove(); } catch (_e) {}
      mapInstance.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, approximateOnly]);

  // Debounced search against Nominatim
  useEffect(() => {
    if (!searchInput.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const results = await nominatimSearch(searchInput);
      setSearchResults(results);
      setSearching(false);
    }, 700); // 700ms keeps us comfortably under Nominatim's 1 req/sec
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]);

  const pickResult = useCallback(async (r) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const approxPos = approximateOnly ? approximateLocation(lat, lng) : { lat, lng };
    if (mapInstance.current) mapInstance.current.setView([approxPos.lat, approxPos.lng], 14);
    if (markerRef.current) markerRef.current.setLatLng([approxPos.lat, approxPos.lng]);
    if (circleRef.current) circleRef.current.setLatLng([approxPos.lat, approxPos.lng]);
    setSearchResults([]);
    setSearchInput('');
    const a = r.address || {};
    if (onChangeRef.current) {
      onChangeRef.current({
        ...approxPos,
        city: a.city || a.town || a.village || a.hamlet || '',
        state: stateAbbrev(a.state || ''),
        zipCode: a.postcode || '',
        neighborhood: a.neighbourhood || a.suburb || '',
        country: (a.country_code || '').toUpperCase(),
        approximate: approximateOnly,
      });
    }
  }, [approximateOnly]);

  // Fallback if Leaflet itself failed to load — manual city/state inputs.
  if (error) {
    return (
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
        <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 12px' }}>
          Map could not load. Enter your city and state manually below — your home game will save normally.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input type="text" placeholder="City" value={value?.city || ''}
            onChange={e => onChangeRef.current?.({ ...value, city: e.target.value })}
            style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
              fontSize: 14, fontFamily: 'inherit', outline: 'none', background: C.bg, color: C.text }} />
          <input type="text" placeholder="State" value={value?.state || ''}
            onChange={e => onChangeRef.current?.({ ...value, state: e.target.value })}
            style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
              fontSize: 14, fontFamily: 'inherit', outline: 'none', background: C.bg, color: C.text }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '12px 12px 8px', position: 'relative' }}>
        <input
          type="text"
          placeholder="Search for a city, address, or landmark..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
            outline: 'none', background: C.bg, color: C.text, boxSizing: 'border-box',
          }}
        />
        {searching && (
          <div style={{ position: 'absolute', right: 22, top: 22, fontSize: 11, color: C.textSec }}>
            Searching…
          </div>
        )}
        {searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 12, right: 12,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, zIndex: 1000, maxHeight: 240, overflow: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            {searchResults.map((r) => (
              <button
                key={r.place_id}
                type="button"
                onClick={() => pickResult(r)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 12px', background: 'transparent',
                  border: 'none', borderBottom: `1px solid ${C.border}`,
                  color: C.text, fontSize: 13, cursor: 'pointer', lineHeight: 1.4,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.bg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map container */}
      <div ref={mapRef} style={{ height, width: '100%' }}>
        {!loaded && (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: C.bg, color: C.textSec, fontSize: 14,
          }}>
            Loading map…
          </div>
        )}
      </div>
    </div>
  );
}
