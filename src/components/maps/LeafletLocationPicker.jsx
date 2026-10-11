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
 *    Poker Near Me (/hub/poker-near-me) uses the repository-pinned Leaflet
 *    runtime with a shared credential-free dark basemap. This component uses
 *    that same runtime and visible map-data attribution for the Home Games
 *    "Approximate Location" picker.
 *
 *  Library choices:
 *    - Leaflet 1.9.4 from the repository's pinned npm dependency
 *    - Esri Dark Gray Canvas base + reference labels (labels stay ON because
 *      the host needs street/city context to choose an approximate location)
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
import MapSurfaceFrame from '../poker-near-me/MapSurfaceFrame';
import { PokerNearMePanelShell } from '../poker-near-me/PokerNearMeConsole';
import {
  createPokerMapSession,
  loadPokerMapRuntime,
  resetPokerMapRuntime,
} from '../../lib/poker-near-me/mapRuntime';

// The privacy circle is map data, so it keeps a data colour (the schema's
// electric blue). Every other surface is painted by the shared console CSS.
const PRIVACY_AREA_COLOR = '#45adff';

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
async function readLocationJson(url, controller) {
  let deadline;
  let rejectInterrupted;
  const interrupted = new Promise((_resolve, reject) => { rejectInterrupted = reject; });
  const onAbort = () => rejectInterrupted(new Error('Location Lookup Interrupted'));
  controller.signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (controller.signal.aborted) throw new Error('Location Lookup Interrupted');
    deadline = setTimeout(() => controller.abort(), 30000);
    return await Promise.race([interrupted, (async () => {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error('Location Lookup Unavailable');
      const json = await response.json();
      if (controller.signal.aborted) throw new Error('Location Lookup Interrupted');
      return json;
    })()]);
  } finally {
    clearTimeout(deadline);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

async function nominatimSearch(query, controller) {
  if (!query?.trim()) return [];
  const url = 'https://nominatim.openstreetmap.org/search'
    + '?format=json&limit=5&addressdetails=1&countrycodes=us'
    + '&q=' + encodeURIComponent(query);
  const results = await readLocationJson(url, controller);
  if (!Array.isArray(results)) throw new Error('Location Lookup Unavailable');
  return results;
}

// Nominatim reverse geocode (lat,lng → address parts)
async function nominatimReverse(lat, lng, controller) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const json = await readLocationJson(url, controller);
    const a = json.address || {};
    return {
      city: a.city || a.town || a.village || a.hamlet || '',
      state: stateAbbrev(a.state || ''),
      zipCode: a.postcode || '',
      neighborhood: a.neighbourhood || a.suburb || '',
      country: (a.country_code || '').toUpperCase(),
    };
}

export default function LeafletLocationPicker({ value, onChange, approximateOnly = true, height = 300 }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const mapSessionRef = useRef(null);
  const mapRuntimeRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  valueRef.current = value;
  const reverseAbortRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [tileStatus, setTileStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [reverseError, setReverseError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const searchDebounceRef = useRef(null);
  const updateManualLocation = useCallback((field, nextValue) => {
    // A manual correction revokes the pending provider's ownership. Keep the
    // selected point and synchronously retain edits across batched React events.
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;
    const next = { ...valueRef.current, [field]: nextValue };
    valueRef.current = next;
    onChangeRef.current?.(next);
  }, []);
  const handleMapLayoutChange = useCallback(() => {
    mapInstance.current?.invalidateSize?.({ pan: false });
  }, []);

  // Keep ref in sync so the long-lived map handlers always call the latest onChange
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const defaultCenter = {
    lat: (typeof value?.lat === 'number') ? value.lat : 36.1699,
    lng: (typeof value?.lng === 'number') ? value.lng : -115.1398,
  };

  // Step 1: load the shared local Leaflet runtime. A failed dynamic import is
  // retryable; unlike the retired CDN promise, one network/CSP failure cannot
  // poison every subsequent picker instance for the browser session.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    loadPokerMapRuntime()
      .then((runtime) => {
        if (cancelled) return;
        mapRuntimeRef.current = runtime;
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError('Map could not load');
      });
    return () => { cancelled = true; };
  }, [mapLoadAttempt]);

  // Step 2: init map once Leaflet is ready and the container is mounted
  useEffect(() => {
    if (!loaded || !mapRef.current || mapInstance.current) return;
    const L = mapRuntimeRef.current?.L;
    if (!L) return;
    let sessionActive = true;

    const session = createPokerMapSession({
      L,
      container: mapRef.current,
      tileStyle: 'dark_all',
      onTileStatus: ({ status }) => { if (sessionActive) setTileStatus(status); },
      mapOptions: {
        center: [defaultCenter.lat, defaultCenter.lng],
        zoom: 13,
        scrollWheelZoom: true,
      },
    });
    mapSessionRef.current = session;
    const { map } = session;
    mapInstance.current = map;

    const approx = approximateOnly ? approximateLocation(defaultCenter.lat, defaultCenter.lng) : defaultCenter;

    // Approximate-area circle (visual hint that the location is fuzzy)
    if (approximateOnly) {
      circleRef.current = L.circle([approx.lat, approx.lng], {
        radius: 800, // ~0.5 mile
        fillColor: PRIVACY_AREA_COLOR,
        fillOpacity: 0.15,
        color: PRIVACY_AREA_COLOR,
        opacity: 0.6,
        weight: 2,
      }).addTo(map);
    }

    // Pin (draggable): the painted location holder (class-only markup, all
    // art in poker-near-me-console-map.css) with a 44px hit box anchored at
    // its bottom centre.
    const pinIcon = L.divIcon({
      html: '<span class="pnm-painted-picker-pin" aria-hidden="true"></span>',
      className: 'pnm-location-picker__marker',
      iconSize: [44, 44],
      iconAnchor: [22, 44],
    });
    markerRef.current = L.marker([approx.lat, approx.lng], {
      draggable: true,
      keyboard: true,
      icon: pinIcon,
      title: 'Approximate home game location',
      alt: 'Approximate home game location map marker',
    }).addTo(map);

    const propagate = async (lat, lng) => {
      const approxPos = approximateOnly ? approximateLocation(lat, lng) : { lat, lng };
      if (markerRef.current) markerRef.current.setLatLng([approxPos.lat, approxPos.lng]);
      if (circleRef.current) circleRef.current.setLatLng([approxPos.lat, approxPos.lng]);
      reverseAbortRef.current?.abort();
      const controller = new AbortController();
      reverseAbortRef.current = controller;
      setReverseError('');
      // The selected privacy-safe point is form data, not a geocoder result.
      // Commit it immediately; a slow provider must not discard the selection.
      const selected = { ...valueRef.current, ...approxPos, approximate: approximateOnly };
      valueRef.current = selected;
      onChangeRef.current?.(selected);
      try {
        const geo = await nominatimReverse(approxPos.lat, approxPos.lng, controller);
        if (sessionActive && reverseAbortRef.current === controller && !controller.signal.aborted) {
          onChangeRef.current?.({ ...valueRef.current, ...approxPos, ...geo, approximate: approximateOnly });
        }
      } catch {
        if (sessionActive && reverseAbortRef.current === controller) {
          setReverseError('Location Details Unavailable. Your Selected Approximate Point Was Kept. Enter City And State Below.');
        }
      } finally {
        if (reverseAbortRef.current === controller) reverseAbortRef.current = null;
      }
    };

    markerRef.current.on('dragend', (e) => {
      const { lat, lng } = e.target.getLatLng();
      propagate(lat, lng);
    });

    // Dragging cannot be the only way to position a form control. Keep the
    // 1-km privacy grid intact while allowing the focused marker to move one
    // grid step with Arrow keys (five steps while Shift is held).
    const markerElement = markerRef.current.getElement?.();
    const markerLabel = 'Approximate home game location. Use Arrow keys to move the pin; hold Shift for a larger step.';
    markerElement?.setAttribute('aria-label', markerLabel);
    markerElement?.setAttribute('title', markerLabel);
    const handleMarkerKeyDown = (event) => {
      const directions = {
        ArrowUp: [1, 0],
        ArrowDown: [-1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction || !markerRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      const current = markerRef.current.getLatLng();
      const baseStep = approximateOnly ? 0.01 : 0.001;
      const step = baseStep * (event.shiftKey ? 5 : 1);
      const nextLat = Math.max(-90, Math.min(90, current.lat + direction[0] * step));
      const nextLng = Math.max(-180, Math.min(180, current.lng + direction[1] * step));
      propagate(nextLat, nextLng);
    };
    markerElement?.addEventListener('keydown', handleMarkerKeyDown);

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      propagate(lat, lng);
    });

    // Surface initial geo so the form has city/state populated even if the
    // user never drags the pin.
    propagate(defaultCenter.lat, defaultCenter.lng);

    return () => {
      sessionActive = false;
      reverseAbortRef.current?.abort();
      reverseAbortRef.current = null;
      markerElement?.removeEventListener('keydown', handleMarkerKeyDown);
      mapSessionRef.current?.destroy();
      mapSessionRef.current = null;
      mapInstance.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [loaded, approximateOnly]);

  const retryMap = useCallback(() => {
    resetPokerMapRuntime();
    mapRuntimeRef.current = null;
    setError(null);
    setLoaded(false);
    setMapLoadAttempt((attempt) => attempt + 1);
  }, []);

  // Debounced search against Nominatim
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setSearchError('');
    if (!searchInput.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await nominatimSearch(searchInput, controller);
        if (active) setSearchResults(results);
      } catch {
        if (active) {
          setSearchResults([]);
          setSearchError('Location Search Unavailable. Try Again Or Enter City And State Below.');
        }
      } finally { if (active) setSearching(false); }
    }, 700); // 700ms keeps us comfortably under Nominatim's 1 req/sec
    return () => {
      active = false;
      controller.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput, searchAttempt]);

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
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;
    setReverseError('');
    const a = r.address || {};
    const selected = {
        ...approxPos,
        city: a.city || a.town || a.village || a.hamlet || '',
        state: stateAbbrev(a.state || ''),
        zipCode: a.postcode || '',
        neighborhood: a.neighbourhood || a.suburb || '',
        country: (a.country_code || '').toUpperCase(),
        approximate: approximateOnly,
      };
    valueRef.current = selected;
    onChangeRef.current?.(selected);
  }, [approximateOnly]);

  // Fallback if Leaflet itself failed to load — manual city/state inputs.
  if (error) {
    return (
      <PokerNearMePanelShell as="div" className="pnm-location-picker-fallback" bodyClassName="pnm-location-picker-fallback__body">
        <p className="pnm-location-picker-fallback__copy" role="alert">
          Map Could Not Load. Enter Your City And State Manually Below - Your Home Game Will Save Normally.
        </p>
        <button
          type="button"
          className="pnm-map-status__action"
          onClick={retryMap}
        >
          Try Map Again
        </button>
        <div className="pnm-location-picker-fallback__fields">
          <span className="pnm-map-well">
            <input type="text" aria-label="City" autoComplete="address-level2" placeholder="City" value={value?.city || ''}
              onChange={e => updateManualLocation('city', e.target.value)} />
          </span>
          <span className="pnm-map-well">
            <input type="text" aria-label="State" autoComplete="address-level1" placeholder="State" value={value?.state || ''}
              onChange={e => updateManualLocation('state', e.target.value)} />
          </span>
        </div>
      </PokerNearMePanelShell>
    );
  }

  return (
    <MapSurfaceFrame
      className="pnm-map-surface--location-picker"
      eyebrow="Privacy-safe location"
      title="Home game area map"
      detail="Only the approximate one-kilometre area is published"
      onLayoutChange={handleMapLayoutChange}
    >
    <div className="pnm-location-picker pnm-map-stage">
      {(tileStatus === 'degraded' || tileStatus === 'unavailable') && (
        <PokerNearMePanelShell as="aside" className="pnm-map-tile-warning" bodyClassName="pnm-map-status__copy" data-map-tile-warning="true" data-map-tile-status={tileStatus} role="status">
          <p>Map Background Unavailable Or Incomplete. Location Controls Remain Available.</p>
          <button type="button" className="pnm-map-status__action" data-map-tile-retry="true" onClick={() => mapSessionRef.current?.retryTiles()}>Retry Map Background</button>
          <a className="pnm-map-status__action" data-map-tile-list="true" href="/hub/poker-near-me/venues">Browse Venue List</a>
        </PokerNearMePanelShell>
      )}
      {/* Search: live text printed inside the painted search well */}
      <div className="pnm-location-picker__search">
        <span className="pnm-map-well">
          <input
            type="text"
            aria-label="Search for a home game location"
            placeholder="Search for a city, address, or landmark..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </span>
        {searching && (
          <span className="pnm-location-picker__searching" role="status">
            Searching…
          </span>
        )}
        {(searchError || reverseError) && (
          <PokerNearMePanelShell as="div" className="pnm-location-picker-fallback" bodyClassName="pnm-location-picker-fallback__body" data-location-lookup-error="true">
            <p role="status">{searchError || reverseError}</p>
            {searchError && <button type="button" className="pnm-map-status__action" onClick={() => setSearchAttempt(attempt => attempt + 1)}>Retry Location Search</button>}
            <div className="pnm-location-picker-fallback__fields">
              <span className="pnm-map-well"><input type="text" aria-label="City" autoComplete="address-level2" value={value?.city || ''} onChange={event => updateManualLocation('city', event.target.value)} /></span>
              <span className="pnm-map-well"><input type="text" aria-label="State" autoComplete="address-level1" value={value?.state || ''} onChange={event => updateManualLocation('state', event.target.value)} /></span>
            </div>
          </PokerNearMePanelShell>
        )}
        {searchResults.length > 0 && (
          <PokerNearMePanelShell as="div" className="pnm-location-picker__results" bodyClassName="pnm-location-picker__results-body">
            {searchResults.map((r) => (
              <button
                key={r.place_id}
                type="button"
                className="pnm-location-picker__result"
                onClick={() => pickResult(r)}
              >
                {r.display_name}
              </button>
            ))}
          </PokerNearMePanelShell>
        )}
      </div>

      {/* Map container */}
      <div ref={mapRef} className="pnm-location-picker__map pnm-leaflet-map" style={{ height, width: '100%' }} role="region" aria-label="Approximate home game location map" tabIndex={0} data-map-foundation="shared-v3" data-map-style-source="local" data-map-ready={loaded ? 'true' : 'false'}>
        {!loaded && (
          <div className="pnm-map-status pnm-map-status--loading" role="status">
            Loading Map…
          </div>
        )}
      </div>
    </div>
    </MapSurfaceFrame>
  );
}
