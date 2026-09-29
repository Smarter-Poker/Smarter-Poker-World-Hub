/**
 * RoadTripPlanner.jsx — Feature #3: Smart Poker Road Trip Planner
 * Multi-stop trip builder with route overlay showing poker venues along the way.
 */
import { useState, useCallback, useRef, useEffect, useId } from 'react';
import { getVenueLogoUrl, getVenueLogoFallback } from './pnm-utils';
import { haversineMiles } from './pnm-utils';
import { openNativeMaps, openMultiStopRoute } from '../../utils/openNativeMaps';
import {
    addPokerMapLayers,
    createPokerMapSession,
    createPokerMarkerLayer,
    loadPokerMapRuntime,
    resetPokerMapRuntime,
} from '../../lib/poker-near-me/mapRuntime';
import MapSurfaceFrame from './MapSurfaceFrame';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';
import {
    attachPokerPopupViewportGuard,
    buildPokerRouteStopPopupHtml,
    buildPokerTourPopupHtml,
    buildPokerVenuePopupHtml,
    createPokerClusterIcon,
    createPokerPopupClickHandler,
    createPokerRouteStopIcon,
    createPokerTourIcon,
    createPokerVenueIcon,
    isPokerTourStop,
    syncPokerMapKeyboardTargets,
} from './mapPresentation';
import {
    filterSeriesForRoute,
    interpolateRouteLeg,
    isVenueNearRoute,
    travelDayNames,
    validateTravelDateRange,
} from '../../lib/poker-near-me/roadTripRuntime';

const CORRIDOR_OPTIONS = [25, 50, 100];
const TRIP_DRAFT_KEY = 'pnm_trip_draft_v1';

// SECURITY: Leaflet's bindPopup/divIcon take raw HTML strings. Venue and stop names
// come from scraped external sources (Bravo/PokerAtlas), so a name such as
// `<img src=x onerror=...>` used to execute in every planner user's browser.
// Every marker and popup string is now built by the shared mapPresentation
// module, which escapes each interpolated value before it reaches Leaflet.

// haversineMiles is now imported from ./pnm-utils

// City geocode lookup (uses the existing popular cities + free Nominatim fallback)
const POPULAR_CITIES_GEO = {
    'las vegas, nv': { lat: 36.1699, lng: -115.1398 },
    'los angeles, ca': { lat: 34.0522, lng: -118.2437 },
    'atlantic city, nj': { lat: 39.3643, lng: -74.4229 },
    'miami, fl': { lat: 25.7617, lng: -80.1918 },
    'new york, ny': { lat: 40.7128, lng: -74.006 },
    'dallas, tx': { lat: 32.7767, lng: -96.797 },
    'houston, tx': { lat: 29.7604, lng: -95.3698 },
    'chicago, il': { lat: 41.8781, lng: -87.6298 },
    'phoenix, az': { lat: 33.4484, lng: -112.074 },
    'san francisco, ca': { lat: 37.7749, lng: -122.4194 },
    'denver, co': { lat: 39.7392, lng: -104.9903 },
    'seattle, wa': { lat: 47.6062, lng: -122.3321 },
    'portland, or': { lat: 45.5152, lng: -122.6784 },
    'new orleans, la': { lat: 29.9511, lng: -90.0715 },
    'tampa, fl': { lat: 27.9506, lng: -82.4572 },
    'san antonio, tx': { lat: 29.4241, lng: -98.4936 },
    'austin, tx': { lat: 30.2672, lng: -97.7431 },
    'nashville, tn': { lat: 36.1627, lng: -86.7816 },
    'detroit, mi': { lat: 42.3314, lng: -83.0458 },
    'oklahoma city, ok': { lat: 35.4676, lng: -97.5164 },
    'memphis, tn': { lat: 35.1495, lng: -90.049 },
    'louisville, ky': { lat: 38.2527, lng: -85.7585 },
    'st. louis, mo': { lat: 38.627, lng: -90.1994 },
    'kansas city, mo': { lat: 39.0997, lng: -94.5786 },
    'reno, nv': { lat: 39.5296, lng: -119.8138 },
    'biloxi, ms': { lat: 30.3960, lng: -88.8853 },
    'tunica, ms': { lat: 34.6846, lng: -90.3829 },
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// day_of_week from /api/poker/daily-tournaments is mixed-case ('saturday',
// 'MONDAY'), the literal 'Daily' for recurring events, or a raw date string for
// charity / tour / home-game rows. Resolve it to one of DAY_NAMES, 'DAILY', or
// null, plus the concrete calendar date when the value was a date.
function normalizeDayToken(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === 'daily' || lower === 'everyday' || lower === 'every day') return 'DAILY';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const dt = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
        if (!Number.isNaN(dt.getTime())) return DAY_NAMES[dt.getUTCDay()];
    }
    const idx = DAY_NAMES.findIndex(d => lower.startsWith(d.toLowerCase()));
    if (idx >= 0) return DAY_NAMES[idx];
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return DAY_NAMES[parsed.getDay()];
    return null;
}

// Returns a Date when day_of_week held a concrete calendar date, else null.
function dayTokenAsDate(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!iso) return null;
    const dt = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

// Split "Portland, ME" into { city: 'portland', state: 'me' }.
function splitCityState(value) {
    const parts = String(value || '').toLowerCase().trim().split(',');
    return {
        city: (parts[0] || '').trim(),
        state: (parts[1] || '').trim(),
    };
}

async function geocodeCity(query) {
    const key = query.toLowerCase().trim();
    if (POPULAR_CITIES_GEO[key]) return POPULAR_CITIES_GEO[key];
    // Partial match against the built-in table.
    // BUG FIX: the old check accepted a city-name match while ignoring the
    // state entirely, so "Portland, ME" resolved to Portland, OR and
    // "Kansas City, KS" to the Missouri entry. A partial match is now only
    // accepted when the state token matches too (or the user gave no state);
    // anything else falls through to Nominatim, which resolves it correctly.
    const wanted = splitCityState(key);
    if (wanted.city) {
        for (const [k, v] of Object.entries(POPULAR_CITIES_GEO || {})) {
            const entry = splitCityState(k);
            if (entry.city !== wanted.city) continue;
            if (wanted.state && entry.state && wanted.state !== entry.state) continue;
            return v;
        }
    }
    // Fallback: Nominatim (free, no API key)
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`);
        const data = await res.json();
        if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { /* fallback failed */ }
    return null;
}

export default function RoadTripPlanner({ venues = [], userLocation, dailyTournaments = [], series = [], locationCity = '', locationState = '' }) {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [waypoints, setWaypoints] = useState([]);
    const [corridorMi, setCorridorMi] = useState(50);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [routeResult, setRouteResult] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [error, setError] = useState(null);
    const [mapExpanded, setMapExpanded] = useState(true);
    const [savedTripsOpen, setSavedTripsOpen] = useState(false);
    const [savedTrips, setSavedTrips] = useState([]);
    const [mapStatus, setMapStatus] = useState('idle'); // idle | loading | ready | error
    const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
    const [shareStatus, setShareStatus] = useState(null);
    const [draftHydrated, setDraftHydrated] = useState(false);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const mapSessionRef = useRef(null);
    const originAutoRef = useRef(false);
    const instanceId = useId().replace(/:/g, '');
    const savedTripsId = `rtp-saved-${instanceId}`;
    const mapPanelId = `rtp-map-${instanceId}`;
    const handleMapLayoutChange = useCallback(() => {
        mapInstanceRef.current?.invalidateSize?.({ pan: false });
    }, []);

    // Load saved trips from localStorage
    useEffect(() => {
        try {
            const trips = JSON.parse(localStorage.getItem('pnm_saved_trips') || '[]');
            setSavedTrips(trips);
        } catch { /* silent */ }
    }, []);

    // Restore a shared trip from the URL (?from=&to=&corridor=). The lobby's
    // deep-link reader only consumes pod/q/state/game/sort/radius, so nothing
    // else in the app reads these — the planner has to read them itself or the
    // "Share Trip" link restores nothing.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const params = new URLSearchParams(window.location.search);
            const from = params.get('from');
            const to = params.get('to');
            const corridor = parseInt(params.get('corridor'), 10);
            const sharedWaypoints = params.getAll('via').map(value => value.trim()).filter(Boolean).slice(0, 8);
            if (from) { setOrigin(from); originAutoRef.current = true; }
            if (to) setDestination(to);
            if (CORRIDOR_OPTIONS.includes(corridor)) setCorridorMi(corridor);
            if (sharedWaypoints.length) setWaypoints(sharedWaypoints);
            const start = params.get('start') || '';
            const end = params.get('end') || '';
            if (start || end) setDateRange({ start, end });
            if (!from && !to) {
                const draft = JSON.parse(sessionStorage.getItem(TRIP_DRAFT_KEY) || 'null');
                if (draft && typeof draft === 'object') {
                    setOrigin(String(draft.origin || ''));
                    if (draft.origin) originAutoRef.current = true;
                    setDestination(String(draft.destination || ''));
                    setWaypoints(Array.isArray(draft.waypoints) ? draft.waypoints.map(String).slice(0, 8) : []);
                    if (CORRIDOR_OPTIONS.includes(Number(draft.corridorMi))) setCorridorMi(Number(draft.corridorMi));
                    setDateRange({ start: String(draft.dateRange?.start || ''), end: String(draft.dateRange?.end || '') });
                }
            }
        } catch { /* silent */ }
        setDraftHydrated(true);
    }, []);

    useEffect(() => {
        if (!draftHydrated) return;
        try {
            sessionStorage.setItem(TRIP_DRAFT_KEY, JSON.stringify({ origin, destination, waypoints, corridorMi, dateRange }));
        } catch { /* storage unavailable */ }
    }, [draftHydrated, origin, destination, waypoints, corridorMi, dateRange]);

    // Auto-populate origin with GPS city on first mount (one-time only)
    useEffect(() => {
        if (originAutoRef.current) return;
        if (locationCity && userLocation) {
            originAutoRef.current = true;
            const cityStr = locationState ? `${locationCity}, ${locationState}` : locationCity;
            setOrigin(cityStr);
        }
    }, [locationCity, locationState, userLocation]);

    const addWaypoint = () => setWaypoints(prev => [...prev, '']);
    const removeWaypoint = (idx) => setWaypoints(prev => prev.filter((_, i) => i !== idx));
    const updateWaypoint = (idx, val) => setWaypoints(prev => prev.map((w, i) => i === idx ? val : w));

    const calculateRoute = useCallback(async () => {
        setError(null);
        setCalculating(true);
        try {
            const travelDates = validateTravelDateRange(dateRange);
            if (!travelDates.ok) { setError(travelDates.error); return; }
            const stops = [origin, ...waypoints.filter(w => w.trim()), destination].filter(Boolean);
            if (stops.length < 2) { setError('Enter at least an origin and destination.'); return; }

            // Geocode all stops
            const geoStops = [];
            for (const stop of stops) {
                const geo = await geocodeCity(stop);
                if (!geo) { setError(`Could not locate: "${stop}"`); return; }
                geoStops.push({ name: stop, ...geo });
            }

            // Build route segments and find venues along each
            const allRoutePoints = [];
            const segments = [];
            let totalDistance = 0;

            for (let i = 0; i < geoStops.length - 1; i++) {
                const segPoints = interpolateRouteLeg(geoStops[i], geoStops[i + 1]);
                allRoutePoints.push(...segPoints);
                const dist = haversineMiles(geoStops[i].lat, geoStops[i].lng, geoStops[i + 1].lat, geoStops[i + 1].lng);
                totalDistance += dist;
                segments.push({
                    from: geoStops[i],
                    to: geoStops[i + 1],
                    distance: dist,
                    driveTime: Math.round(dist / 55 * 60), // rough estimate at 55 mph
                });
            }

            // Find venues within corridor
            const nearbyVenues = venues.filter(v => isVenueNearRoute(v, geoStops, corridorMi));

            // Filter tournaments by date range if set
            let matchingTournaments = [];
            if (travelDates.startDate && travelDates.endDate) {
                const { startDate, endDate } = travelDates;
                const venueIds = new Set(nearbyVenues.map(v => String(v.id)));
                const travelDays = travelDayNames(startDate, endDate, DAY_NAMES);
                matchingTournaments = dailyTournaments.filter(t => {
                    if (!venueIds.has(String(t.venue_id))) return false;
                    // BUG FIX: day_of_week is mixed-case ('saturday'/'MONDAY'), the
                    // literal 'Daily' for recurring events, or a raw date string for
                    // charity/tour/home rows. Exact-string comparison against
                    // 'Sun'..'Sat' never matched any of those.
                    const exactDate = dayTokenAsDate(t.day_of_week);
                    if (exactDate) return exactDate >= startDate && exactDate <= endDate;
                    const tDay = normalizeDayToken(t.day_of_week);
                    if (tDay === 'DAILY') return true;
                    if (!tDay) return false;
                    return travelDays.has(tDay);
                });
            }

            // Filter series by date range
            let matchingSeries = [];
            if (travelDates.startDate && travelDates.endDate) {
                matchingSeries = filterSeriesForRoute(
                    series,
                    nearbyVenues,
                    travelDates.startDate,
                    travelDates.endDate,
                );
            }

            setRouteResult({
                stops: geoStops,
                segments,
                totalDistance,
                totalDriveTime: segments.reduce((sum, s) => sum + s.driveTime, 0),
                venues: nearbyVenues,
                tournaments: matchingTournaments,
                series: matchingSeries,
                routePoints: allRoutePoints,
            });
        } catch (err) {
            setError('Failed to calculate route. Please try again.');
            console.warn('Route calculation error:', err);
        } finally {
            setCalculating(false);
        }
    }, [origin, destination, waypoints, corridorMi, dateRange, venues, dailyTournaments, series]);

    // Render Leaflet route map when result is available.
    // Use the shared, locally vendored runtime so this secondary map receives
    // the same Leaflet assets and accessible controls as every discovery map.
    useEffect(() => {
        if (!routeResult || typeof window === 'undefined') return undefined;

        let cancelled = false;
        let mapContainer = null;
        let popupClickHandler = null;
        let keyboardObserver = null;
        let keyboardFrame = 0;
        let detachPopupGuard = () => {};
        setMapStatus('loading');

        const scheduleKeyboardTargetSync = () => {
            if (keyboardFrame) return;
            keyboardFrame = window.requestAnimationFrame(() => {
                keyboardFrame = 0;
                syncPokerMapKeyboardTargets(mapContainer);
            });
        };

        const buildMap = async () => {
            try {
                const runtime = await loadPokerMapRuntime();
                const { L } = runtime;
                if (cancelled || !mapRef.current) return;

                mapSessionRef.current?.destroy();
                mapSessionRef.current = createPokerMapSession({
                    L,
                    container: mapRef.current,
                    tileStyle: 'dark_all',
                });
                const { map } = mapSessionRef.current;
                mapInstanceRef.current = map;
                mapContainer = mapRef.current;

                // Popup actions (View Details, Directions, Call) are delegated
                // from the map node exactly as on every other discovery map.
                popupClickHandler = createPokerPopupClickHandler();
                mapContainer.addEventListener('click', popupClickHandler);
                detachPopupGuard = attachPokerPopupViewportGuard(map);

                // Keep keyboard targets aligned with the visible pins, including
                // inside the fullscreen focus trap.
                map.on('moveend zoomend resize', scheduleKeyboardTargetSync);
                keyboardObserver = new MutationObserver(scheduleKeyboardTargetSync);
                keyboardObserver.observe(mapContainer, { childList: true, subtree: true });

                // Venue names stay legible: labels print only once the route is
                // zoomed close enough for them not to collide.
                const updateLabelVisibility = () => {
                    mapContainer?.classList.toggle('vmp-labels-hidden', map.getZoom() < 9);
                };
                map.on('zoomend', updateLabelVisibility);

                // Draw route polyline
                const latlngs = routeResult.routePoints.map(p => [p.lat, p.lng]);
                L.polyline(latlngs, { color: '#ffffff', weight: 3, opacity: 0.8, dashArray: '8, 6' }).addTo(map);

                // Venue markers along route: the shared painted venue and tour
                // machines, clustered by the shared density rules.
                const { layer: venueLayer } = createPokerMarkerLayer({
                    L,
                    map,
                    clusteringAvailable: runtime.clusteringAvailable,
                    iconCreateFunction: (cluster) => createPokerClusterIcon(L, cluster, { variant: 'compact' }),
                    disableClusteringAtZoom: 9,
                });
                const venueMarkers = routeResult.venues
                    .filter(v => Number.isFinite(parseFloat(v.latitude)) && Number.isFinite(parseFloat(v.longitude)))
                    .map(v => {
                        const tourStop = isPokerTourStop(v);
                        const icon = tourStop
                            ? createPokerTourIcon(L, v, { variant: 'compact' })
                            : createPokerVenueIcon(L, v, { variant: 'compact' });
                        const popupHtml = tourStop
                            ? buildPokerTourPopupHtml(v, { variant: 'compact' })
                            : buildPokerVenuePopupHtml(v, { variant: 'compact' });
                        return L.marker([parseFloat(v.latitude), parseFloat(v.longitude)], {
                            icon,
                            keyboard: true,
                            title: v.name || 'Poker venue',
                            alt: `${v.name || 'Poker venue'} map marker`,
                        }).bindPopup(popupHtml, { className: 'pnm-popup', maxWidth: 300, closeButton: true });
                    });
                addPokerMapLayers(venueLayer, venueMarkers);

                // Stop markers: numbered painted machines above every venue pin.
                routeResult.stops.forEach((stop, i) => {
                    L.marker([stop.lat, stop.lng], {
                        icon: createPokerRouteStopIcon(L, stop, i, routeResult.stops.length),
                        keyboard: true,
                        zIndexOffset: 1000,
                        title: stop.name,
                        alt: `${stop.name} route stop marker`,
                    })
                        .addTo(map)
                        .bindPopup(buildPokerRouteStopPopupHtml(stop, i, routeResult.stops.length), { className: 'pnm-popup', maxWidth: 300, closeButton: true });
                });

                // Fit bounds
                if (latlngs.length > 0) {
                    map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
                }
                updateLabelVisibility();
                scheduleKeyboardTargetSync();

                setMapStatus('ready');
            } catch (err) {
                console.warn('Route map failed to load:', err);
                if (!cancelled) setMapStatus('error');
            }
        };

        buildMap();

        return () => {
            cancelled = true;
            if (mapContainer && popupClickHandler) mapContainer.removeEventListener('click', popupClickHandler);
            detachPopupGuard();
            keyboardObserver?.disconnect();
            if (keyboardFrame) window.cancelAnimationFrame(keyboardFrame);
            mapSessionRef.current?.destroy();
            mapSessionRef.current = null;
            mapInstanceRef.current = null;
        };
    }, [routeResult, mapLoadAttempt]);

    useEffect(() => {
        if (!mapExpanded || !mapInstanceRef.current) return undefined;
        const frame = requestAnimationFrame(() => {
            const map = mapInstanceRef.current;
            if (!map) return;
            map.invalidateSize({ pan: false });
            const routePoints = routeResult?.routePoints || [];
            if (routePoints.length > 0 && window.L) {
                map.fitBounds(window.L.latLngBounds(routePoints.map(point => [point.lat, point.lng])), { padding: [30, 30] });
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [mapExpanded, routeResult]);

    return (
        <PokerNearMePanelShell
            as="section"
            className="road-trip-planner pnm-console-tool"
            bodyClassName="pnm-console-tool__body"
            aria-labelledby="pnm-road-trip-title"
        >
            <div className="rtp-header">
                <PokerNearMeConsoleIcon name="directions" className="pnm-console-tool__header-icon" />
                <h2 id="pnm-road-trip-title">Poker Road Trip Planner</h2>
            </div>

            <div className="rtp-form">
                {/* Every field sits in the painted search well at its native
                    ratio; the route role prints as live lit-blue type. */}
                <div className="rtp-input-row rtp-input-row--origin">
                    <span className="rtp-role" aria-hidden="true">From</span>
                    <span className="rtp-well">
                        <input
                            type="text"
                            aria-label="Trip origin"
                            placeholder="Origin (e.g., Dallas, TX)"
                            value={origin}
                            onChange={e => setOrigin(e.target.value)}
                            className="rtp-input"
                        />
                    </span>
                </div>

                {waypoints.map((wp, i) => (
                    <div key={i} className="rtp-input-row rtp-input-row--waypoint">
                        <span className="rtp-role" aria-hidden="true">Via</span>
                        <span className="rtp-well">
                            <input
                                type="text"
                                aria-label={`Trip waypoint ${i + 1}`}
                                placeholder={`Waypoint ${i + 1}`}
                                value={wp}
                                onChange={e => updateWaypoint(i, e.target.value)}
                                className="rtp-input"
                            />
                        </span>
                        <button type="button" className="rtp-remove-btn" aria-label={`Remove waypoint ${i + 1}`} onClick={() => removeWaypoint(i)}>
                            <PokerNearMeConsoleIcon name="close" />
                        </button>
                    </div>
                ))}

                <div className="rtp-input-row rtp-input-row--destination">
                    <span className="rtp-role" aria-hidden="true">To</span>
                    <span className="rtp-well">
                        <input
                            type="text"
                            aria-label="Trip destination"
                            placeholder="Destination (e.g., Las Vegas, NV)"
                            value={destination}
                            onChange={e => setDestination(e.target.value)}
                            className="rtp-input"
                        />
                    </span>
                </div>

                <button type="button" className="rtp-add-waypoint" onClick={addWaypoint}>
                    Add Stop
                </button>

                <div className="rtp-options">
                    <div className="rtp-option-group">
                        <span className="rtp-option-label">Search Corridor</span>
                        <div className="rtp-chips" role="radiogroup" aria-label="Search corridor">
                            {CORRIDOR_OPTIONS.map(mi => (
                                <button type="button" role="radio" aria-checked={corridorMi === mi} key={mi} className={'rtp-chip' + (corridorMi === mi ? ' active' : '')} onClick={() => setCorridorMi(mi)}>{mi} Mi</button>
                            ))}
                        </div>
                    </div>

                    <div className="rtp-option-group">
                        <span className="rtp-option-label">Travel Dates (Optional)</span>
                        <div className="rtp-date-row">
                            <span className="rtp-well rtp-well--date">
                                <input type="date" aria-label="Trip start date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} className="rtp-date" />
                            </span>
                            <span className="rtp-date-sep" aria-hidden="true">To</span>
                            <span className="rtp-well rtp-well--date">
                                <input type="date" aria-label="Trip end date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} className="rtp-date" />
                            </span>
                        </div>
                    </div>
                </div>

                {/* The primary plate carries its label only: a painted icon
                    holder on a painted plate would be a frame on a frame. */}
                <button type="button" className="rtp-calculate-btn" onClick={calculateRoute} disabled={calculating} aria-busy={calculating}>
                    {calculating ? 'Calculating...' : 'Plan My Trip'}
                </button>

                {error && <div className="rtp-error" role="alert">{error}</div>}

                {/* Saved Trips Collapsible */}
                {savedTrips.length > 0 && (
                    <div className="rtp-saved-trips">
                        <button
                            type="button"
                            className="rtp-saved-trips-toggle"
                            onClick={() => setSavedTripsOpen(p => !p)}
                            aria-expanded={savedTripsOpen}
                            aria-controls={savedTripsId}
                        >
                            {savedTripsOpen ? 'Hide' : 'Show'} Saved Trips ({savedTrips.length})
                        </button>
                        {savedTripsOpen && (
                            <div className="rtp-saved-trips-list" id={savedTripsId}>
                                {savedTrips.map((trip, i) => (
                                    <div key={i} className="rtp-saved-trip-item">
                                        <div className="rtp-saved-trip-route">
                                            <span className="rtp-saved-trip-from">{trip.origin || '?'}</span>
                                            <span className="rtp-saved-trip-separator">To</span>
                                            <span className="rtp-saved-trip-to">{trip.destination || '?'}</span>
                                        </div>
                                        <div className="rtp-saved-trip-meta">
                                            {trip.corridorMi && <span>{trip.corridorMi} Mi Corridor</span>}
                                            {trip.waypoints?.length > 0 && <span>{trip.waypoints.length} stop{trip.waypoints.length > 1 ? 's' : ''}</span>}
                                            <span>{new Date(trip.savedAt).toLocaleDateString()}</span>
                                        </div>
                                        <div className="rtp-saved-trip-actions">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setOrigin(trip.origin || '');
                                                    setDestination(trip.destination || '');
                                                    setWaypoints(trip.waypoints || []);
                                                    setCorridorMi(trip.corridorMi || 50);
                                                    setDateRange(trip.dateRange || { start: '', end: '' });
                                                    setSavedTripsOpen(false);
                                                }}
                                                className="rtp-saved-trip-load"
                                            >
                                                Load
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = savedTrips.filter((_, idx) => idx !== i);
                                                    setSavedTrips(updated);
                                                    try { localStorage.setItem('pnm_saved_trips', JSON.stringify(updated)); } catch { /* silent */ }
                                                }}
                                                className="rtp-saved-trip-delete"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Results */}
            {routeResult && (
                <div className="rtp-results">
                    {/* Stats bar */}
                    <div className="rtp-stats-bar">
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{Math.round(routeResult.totalDistance)}</span>
                            <span className="rtp-stat-label">Miles (Straight-Line)</span>
                        </div>
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{Math.floor(routeResult.totalDriveTime / 60)}h {routeResult.totalDriveTime % 60}m</span>
                            <span className="rtp-stat-label">Est. Drive Time</span>
                        </div>
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{routeResult.venues.length}</span>
                            <span className="rtp-stat-label">Venues Found</span>
                        </div>
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{routeResult.stops.length}</span>
                            <span className="rtp-stat-label">Stops</span>
                        </div>
                    </div>

                    {/* Distance is great-circle between stop centroids, not routed
                        road mileage, so it under-reports a real drive. Say so. */}
                    <div className="rtp-estimate-note">
                        Distance And Drive Time Are Straight-Line Estimates At 55 Mph. Actual Road Mileage Is Typically 15-30 Percent Higher.
                    </div>

                    {/* Save / Share Actions */}
                    <div className="rtp-result-actions">
                        <button
                            type="button"
                            onClick={() => {
                                try {
                                    const trip = { origin, destination, waypoints, corridorMi, dateRange, savedAt: new Date().toISOString() };
                                    const saved = JSON.parse(localStorage.getItem('pnm_saved_trips') || '[]');
                                    saved.unshift(trip);
                                    const updated = saved.slice(0, 10);
                                    localStorage.setItem('pnm_saved_trips', JSON.stringify(updated));
                                    setSavedTrips(updated);
                                    setShareStatus({ ok: true, msg: 'Trip saved to this device.' });
                                } catch {
                                    setShareStatus({ ok: false, msg: 'Could not save this trip on this device.' });
                                }
                                setTimeout(() => setShareStatus(null), 4000);
                            }}
                            className="rtp-result-action rtp-result-action--save"
                        >
                            Save Trip
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                // The planner pod lives on the lobby route, and the
                                // clipboard write is async — reporting success before
                                // it resolved told users a link was copied when the
                                // write had been rejected.
                                try {
                                    const params = new URLSearchParams();
                                    params.set('pod', 'roadtrip');
                                    if (origin) params.set('from', origin);
                                    if (destination) params.set('to', destination);
                                    waypoints.filter(Boolean).slice(0, 8).forEach((waypoint) => params.append('via', waypoint));
                                    if (corridorMi !== 50) params.set('corridor', String(corridorMi));
                                    if (dateRange.start) params.set('start', dateRange.start);
                                    if (dateRange.end) params.set('end', dateRange.end);
                                    const url = `${window.location.origin}/hub/poker-near-me/lobby?${params.toString()}`;
                                    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
                                    await navigator.clipboard.writeText(url);
                                    setShareStatus({ ok: true, msg: 'Trip link copied to clipboard.' });
                                } catch {
                                    setShareStatus({ ok: false, msg: 'Could not copy the link. Copy the page URL instead.' });
                                }
                                setTimeout(() => setShareStatus(null), 4000);
                            }}
                            className="rtp-result-action rtp-result-action--share"
                        >
                            Share Trip
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!routeResult?.stops?.length || routeResult.stops.length < 2) return;
                                openMultiStopRoute(routeResult.stops);
                            }}
                            className="rtp-result-action rtp-result-action--route"
                        >
                            Start Full Route ({routeResult?.stops?.length || 0} Stops)
                        </button>
                    </div>

                    {shareStatus && (
                        <div className={'rtp-share-status' + (shareStatus.ok ? ' ok' : ' fail')} role="status">
                            {shareStatus.msg}
                        </div>
                    )}

                    {/* Map — collapsible on mobile */}
                    <div className="rtp-map-wrapper">
                        <button type="button" className="rtp-map-toggle" onClick={() => setMapExpanded(e => !e)} aria-expanded={mapExpanded} aria-controls={mapPanelId}>
                            {mapExpanded ? 'Hide Map' : 'Show Map'}
                        </button>
                        <div className="rtp-map-shell" id={mapPanelId} hidden={!mapExpanded}>
                            <MapSurfaceFrame
                                className="pnm-map-surface--road-trip"
                                eyebrow="Route intelligence"
                                title="Poker road trip map"
                                detail={`${routeResult?.stops?.length || 0} stops · ${routeResult?.venues?.length || 0} rooms along this route`}
                                onLayoutChange={handleMapLayoutChange}
                            >
                                <div className="pnm-map-stage">
                                    <div ref={mapRef} className="rtp-map pnm-leaflet-map" role="region" aria-label="Poker road trip route map" data-map-foundation="shared-v3" data-map-ready={mapStatus === 'ready' ? 'true' : 'false'} />
                                    {mapStatus !== 'ready' && (
                                        <div className={'rtp-map-overlay pnm-map-status' + (mapStatus === 'error' ? ' error pnm-map-status--error' : ' pnm-map-status--loading')} role={mapStatus === 'error' ? 'alert' : 'status'}>
                                            {mapStatus === 'error' ? (
                                                <div className="pnm-map-status__copy">
                                                    <p>Route Map Could Not Be Loaded. The Stop And Venue Lists Below Are Unaffected.</p>
                                                    <button type="button" className="pnm-map-status__action" onClick={() => { resetPokerMapRuntime(); setMapLoadAttempt(value => value + 1); }}>Retry Route Map</button>
                                                </div>
                                            ) : 'Loading Route Map...'}
                                        </div>
                                    )}
                                </div>
                            </MapSurfaceFrame>
                        </div>
                    </div>

                    {/* Venues along route */}
                    <div className="rtp-venues-section">
                        <h3>Poker Rooms Along Your Route</h3>
                        <div className="rtp-venue-list">
                            {routeResult.venues.slice(0, 20).map((v, i) => {
                                const logo = getVenueLogoUrl(v);
                                return (
                                <div key={v.id || i} className="rtp-venue-card">
                                    <div className="rtp-venue-card-row">
                                        {logo && <img src={logo} alt="" className="rtp-venue-logo" onError={e => { const fb = getVenueLogoFallback(v); if (fb && e.target.src !== fb) { e.target.src = fb; } else { e.target.style.display = 'none'; } }} loading="lazy" />}
                                        <div>
                                            <div className="rtp-venue-name">{v.name}</div>
                                            <div className="rtp-venue-loc">{v.city}, {v.state}</div>
                                        </div>
                                    </div>
                                    <div className="rtp-venue-tags">
                                        {v.venue_type && <span className="rtp-tag type">{v.venue_type.replace('_', ' ')}</span>}
                                        {v.trust_score && <span className="rtp-tag trust">Trust: {v.trust_score}/5</span>}
                                        <button
                                            type="button"
                                            className="rtp-tag rtp-nav-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openNativeMaps({
                                                    address: [v.address, v.name, v.city, v.state].filter(Boolean).join(', '),
                                                    lat: parseFloat(v.latitude),
                                                    lng: parseFloat(v.longitude),
                                                    mode: 'directions'
                                                });
                                            }}
                                        >Navigate</button>
                                    </div>
                                </div>
                                );
                            })}
                            {routeResult.venues.length > 20 && (
                                <div className="rtp-more">+{routeResult.venues.length - 20} More Venues</div>
                            )}
                            {routeResult.venues.length === 0 && (
                                <div className="rtp-empty" role="status">No Mapped Poker Rooms Were Found Inside This Route Corridor.</div>
                            )}
                        </div>
                    </div>

                    {/* Tournaments during travel dates — this list was computed
                        and then thrown away; the Travel Dates inputs appeared to
                        filter tournaments while rendering nothing. */}
                    {routeResult.tournaments.length > 0 && (
                        <div className="rtp-series-section">
                            <h3>Tournaments During Your Trip</h3>
                            {routeResult.tournaments.slice(0, 20).map((t, i) => (
                                <div key={t.id || i} className="rtp-series-card">
                                    <div className="rtp-series-name">{t.name || t.tournament_name || 'Tournament'}</div>
                                    <div className="rtp-series-dates">
                                        {[t.day_of_week, t.start_time, t.buy_in > 0 ? `$${t.buy_in}` : null]
                                            .filter(Boolean).join(' - ')}
                                    </div>
                                    {t.venue_name && <div className="rtp-series-venue">{t.venue_name}</div>}
                                </div>
                            ))}
                            {routeResult.tournaments.length > 20 && (
                                <div className="rtp-more">+{routeResult.tournaments.length - 20} More Tournaments</div>
                            )}
                        </div>
                    )}

                    {/* Series during travel dates */}
                    {routeResult.series.length > 0 && (
                        <div className="rtp-series-section">
                            <h3>Series During Your Trip</h3>
                            {routeResult.series.map((s, i) => (
                                <div key={i} className="rtp-series-card">
                                    <div className="rtp-series-name">{s.name}</div>
                                    <div className="rtp-series-dates">{s.start_date} - {s.end_date || 'TBD'}</div>
                                    {s.venue_name && <div className="rtp-series-venue">{s.venue_name}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                    {dateRange.start && dateRange.end && routeResult.tournaments.length === 0 && routeResult.series.length === 0 && (
                        <div className="rtp-empty" role="status">No Route-Matched Tournaments Or Series Overlap These Travel Dates.</div>
                    )}
                </div>
            )}

        </PokerNearMePanelShell>
    );
}
