/**
 * RoadTripPlanner.jsx — Feature #3: Smart Poker Road Trip Planner
 * Multi-stop trip builder with route overlay showing poker venues along the way.
 */
import { useState, useCallback, useRef, useEffect, useId } from 'react';
import { getVenueLogoUrl, getVenueLogoFallback } from './pnm-utils';
import { haversineMiles, escapeHtml } from './pnm-utils';
import { openNativeMaps, openMultiStopRoute } from '../../utils/openNativeMaps';
import { createPokerMapSession, loadPokerMapRuntime, resetPokerMapRuntime } from '../../lib/poker-near-me/mapRuntime';
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
// Always run interpolated values through this before building those strings.
const esc = (value) => escapeHtml(String(value == null ? '' : value));

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
        setMapStatus('loading');

        const buildMap = async () => {
            try {
                const { L } = await loadPokerMapRuntime();
                if (cancelled || !mapRef.current) return;

                mapSessionRef.current?.destroy();
                mapSessionRef.current = createPokerMapSession({
                    L,
                    container: mapRef.current,
                    tileStyle: 'dark_all',
                });
                const { map } = mapSessionRef.current;
                mapInstanceRef.current = map;

                // Draw route polyline
                const latlngs = routeResult.routePoints.map(p => [p.lat, p.lng]);
                L.polyline(latlngs, { color: '#ffffff', weight: 3, opacity: 0.8, dashArray: '8, 6' }).addTo(map);

                // Stop markers
                routeResult.stops.forEach((stop, i) => {
                    const color = i === 0 ? '#22c55e' : i === routeResult.stops.length - 1 ? '#ef4444' : '#3b82f6';
                    const icon = L.divIcon({
                        className: 'trip-stop-marker',
                        html: `<div style="width:20px;height:20px;border-radius:50%;background:${esc(color)};border:3px solid #fff;box-shadow:0 0 10px ${esc(color)}80;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;">${Number(i) + 1}</div>`,
                        iconSize: [20, 20], iconAnchor: [10, 10],
                    });
                    L.marker([stop.lat, stop.lng], { icon }).addTo(map).bindPopup(`<b style="color:#0f172a">${esc(stop.name)}</b>`);
                });

                // Venue markers along route
                routeResult.venues.forEach(v => {
                    const icon = L.divIcon({
                        className: 'route-venue-marker',
                        html: '<div style="width:10px;height:10px;border-radius:50%;background:#ffffff;border:2px solid #fff;box-shadow:0 0 6px rgba(255,255,255,0.6);"></div>',
                        iconSize: [14, 14], iconAnchor: [7, 7],
                    });
                    L.marker([parseFloat(v.latitude), parseFloat(v.longitude)], { icon })
                        .addTo(map)
                        .bindPopup(`<div style="font-family:Inter,sans-serif;color:#0f172a;"><b>${esc(v.name)}</b><br/>${esc(v.city)}, ${esc(v.state)}</div>`);
                });

                // Fit bounds
                if (latlngs.length > 0) {
                    map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
                }

                setMapStatus('ready');
            } catch (err) {
                console.warn('Route map failed to load:', err);
                if (!cancelled) setMapStatus('error');
            }
        };

        buildMap();

        return () => {
            cancelled = true;
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
        <div className="road-trip-planner">
            <div className="rtp-header">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 17h2l2-8h4l-1 4h3l5-6" />
                    <circle cx="6.5" cy="17.5" r="2.5" fill="none" />
                    <circle cx="16.5" cy="17.5" r="2.5" fill="none" />
                    <path d="M9 17h5" />
                </svg>
                <h2>Poker Road Trip Planner</h2>
            </div>

            <div className="rtp-form">
                <div className="rtp-input-row">
                    <div className="rtp-dot origin" />
                    <input
                        type="text"
                        aria-label="Trip origin"
                        placeholder="Origin (e.g., Dallas, TX)"
                        value={origin}
                        onChange={e => setOrigin(e.target.value)}
                        className="rtp-input"
                    />
                </div>

                {waypoints.map((wp, i) => (
                    <div key={i} className="rtp-input-row">
                        <div className="rtp-dot waypoint" />
                        <input
                            type="text"
                            aria-label={`Trip waypoint ${i + 1}`}
                            placeholder={`Waypoint ${i + 1}`}
                            value={wp}
                            onChange={e => updateWaypoint(i, e.target.value)}
                            className="rtp-input"
                        />
                        <button type="button" className="rtp-remove-btn" aria-label={`Remove waypoint ${i + 1}`} onClick={() => removeWaypoint(i)}>×</button>
                    </div>
                ))}

                <div className="rtp-input-row">
                    <div className="rtp-dot destination" />
                    <input
                        type="text"
                        aria-label="Trip destination"
                        placeholder="Destination (e.g., Las Vegas, NV)"
                        value={destination}
                        onChange={e => setDestination(e.target.value)}
                        className="rtp-input"
                    />
                </div>

                <button type="button" className="rtp-add-waypoint" onClick={addWaypoint}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add Stop
                </button>

                <div className="rtp-options">
                    <div className="rtp-option-group">
                        <label>Search Corridor</label>
                        <div className="rtp-chips" role="radiogroup" aria-label="Search corridor">
                            {CORRIDOR_OPTIONS.map(mi => (
                                <button type="button" role="radio" aria-checked={corridorMi === mi} key={mi} className={'rtp-chip' + (corridorMi === mi ? ' active' : '')} onClick={() => setCorridorMi(mi)}>{mi} mi</button>
                            ))}
                        </div>
                    </div>

                    <div className="rtp-option-group">
                        <label>Travel Dates (optional)</label>
                        <div className="rtp-date-row">
                            <input type="date" aria-label="Trip start date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} className="rtp-date" />
                            <span className="rtp-date-sep">→</span>
                            <input type="date" aria-label="Trip end date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} className="rtp-date" />
                        </div>
                    </div>
                </div>

                <button type="button" className="rtp-calculate-btn" onClick={calculateRoute} disabled={calculating}>
                    {calculating ? (
                        <><span className="rtp-spinner" /> Calculating...</>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                            Plan My Trip
                        </>
                    )}
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                            Saved Trips ({savedTrips.length})
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto', transform: savedTripsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                        {savedTripsOpen && (
                            <div className="rtp-saved-trips-list" id={savedTripsId}>
                                {savedTrips.map((trip, i) => (
                                    <div key={i} className="rtp-saved-trip-item">
                                        <div className="rtp-saved-trip-route">
                                            <span className="rtp-saved-trip-from">{trip.origin || '?'}</span>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                                            <span className="rtp-saved-trip-to">{trip.destination || '?'}</span>
                                        </div>
                                        <div className="rtp-saved-trip-meta">
                                            {trip.corridorMi && <span>{trip.corridorMi} mi corridor</span>}
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
                            <span className="rtp-stat-label">miles (straight-line)</span>
                        </div>
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{Math.floor(routeResult.totalDriveTime / 60)}h {routeResult.totalDriveTime % 60}m</span>
                            <span className="rtp-stat-label">est. drive time</span>
                        </div>
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{routeResult.venues.length}</span>
                            <span className="rtp-stat-label">venues found</span>
                        </div>
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{routeResult.stops.length}</span>
                            <span className="rtp-stat-label">stops</span>
                        </div>
                    </div>

                    {/* Distance is great-circle between stop centroids, not routed
                        road mileage, so it under-reports a real drive. Say so. */}
                    <div className="rtp-estimate-note">
                        Distance and drive time are straight-line estimates at 55 mph. Actual road mileage is typically 15-30 percent higher.
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
                                    alert('Trip saved!');
                                } catch { alert('Failed to save trip.'); }
                            }}
                            style={{ flex: 1, padding: '8px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, color: '#22c55e', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
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
                            style={{ flex: 1, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, color: '#3b82f6', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                            Share Trip
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!routeResult?.stops?.length || routeResult.stops.length < 2) return;
                                openMultiStopRoute(routeResult.stops);
                            }}
                            style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, color: '#ffffff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
                            </svg>
                            {mapExpanded ? 'Hide Map' : 'Show Map'}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: mapExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                        <div className="rtp-map-shell" id={mapPanelId} style={{ display: mapExpanded ? 'block' : 'none' }}>
                            <div ref={mapRef} className="rtp-map pnm-leaflet-map" role="region" aria-label="Poker road trip route map" data-map-foundation="shared-v2" />
                            {mapStatus !== 'ready' && (
                                <div className={'rtp-map-overlay' + (mapStatus === 'error' ? ' error' : '')}>
                                    {mapStatus === 'error' ? (
                                        <div>
                                            <p>Route map could not be loaded. The stop and venue lists below are unaffected.</p>
                                            <button type="button" onClick={() => { resetPokerMapRuntime(); setMapLoadAttempt(value => value + 1); }}>Retry route map</button>
                                        </div>
                                    ) : 'Loading route map...'}
                                </div>
                            )}
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
                                <div className="rtp-more">+{routeResult.venues.length - 20} more venues</div>
                            )}
                            {routeResult.venues.length === 0 && (
                                <div className="rtp-empty" role="status">No mapped poker rooms were found inside this route corridor.</div>
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
                                <div className="rtp-more">+{routeResult.tournaments.length - 20} more tournaments</div>
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
                        <div className="rtp-empty" role="status">No route-matched tournaments or series overlap these travel dates.</div>
                    )}
                </div>
            )}

            <style>{`
        .road-trip-planner { padding: 0 0 20px; }
        .rtp-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
        .rtp-header h2 { font-size: 22px; font-weight: 700; color: #e2e8f0; margin: 0; letter-spacing: -0.3px; }
        .rtp-form { background: linear-gradient(160deg, rgba(18,28,45,0.85), rgba(10,16,28,0.92)); border: 1.5px solid rgba(148,163,184,0.12); border-radius: 16px; padding: 20px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.35); }
        .rtp-input-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .rtp-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .rtp-dot.origin { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); }
        .rtp-dot.waypoint { background: #ffffff; box-shadow: 0 0 8px rgba(255,255,255,0.5); }
        .rtp-dot.destination { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
        .rtp-input { flex: 1; min-width: 0; min-height: 44px; padding: 12px 16px; background: linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98)); border: 1.5px solid rgba(148,163,184,0.15); border-radius: 10px; color: #e2e8f0; font-size: 14px; font-family: inherit; transition: border-color 0.25s; box-shadow: inset 0 2px 6px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(148,163,184,0.08); }
        .rtp-input:focus { outline: none; border-color: rgba(255,255,255,0.5); }
        .rtp-input::placeholder { color: rgba(148,163,184,0.35); }
        .rtp-remove-btn { background: rgba(239,68,68,0.1); border: 1.5px solid rgba(239,68,68,0.3); color: #ef4444; width: 44px; height: 44px; border-radius: 8px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; }
        .rtp-remove-btn:hover { background: rgba(239,68,68,0.2); }
        .rtp-add-waypoint { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(200,214,229,0.08)); border: 1.5px solid rgba(255,255,255,0.35); border-radius: 8px; color: #ffffff; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 16px; transition: all 0.25s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); }
        .rtp-add-waypoint:hover { border-color: rgba(255,255,255,0.5); }
        .rtp-options { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        @media (max-width: 600px) { .rtp-options { grid-template-columns: 1fr; } }
        .rtp-option-group label { display: block; font-size: 12px; font-weight: 600; color: rgba(148,163,184,0.6); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .rtp-chips { display: flex; gap: 6px; }
        .rtp-chip { padding: 8px 14px; border-radius: 8px; background: linear-gradient(180deg, rgba(25,35,55,0.9), rgba(15,23,42,0.95)); border: 1.5px solid rgba(148,163,184,0.15); color: rgba(148,163,184,0.7); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.25s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.3); }
        .rtp-chip.active { background: linear-gradient(180deg, rgba(255,255,255,0.15), rgba(200,214,229,0.08)); border-color: rgba(255,255,255,0.45); color: #ffffff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 10px rgba(255,255,255,0.1); }
        .rtp-date-row { display: flex; align-items: center; gap: 8px; }
        .rtp-date { padding: 8px 12px; background: linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98)); border: 1.5px solid rgba(148,163,184,0.15); border-radius: 8px; color: #e2e8f0; font-size: 13px; font-family: inherit; color-scheme: dark; box-shadow: inset 0 2px 6px rgba(0,0,0,0.4); }
        .rtp-date-sep { color: rgba(148,163,184,0.4); font-size: 16px; }
        .rtp-calculate-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #ffffff, #cbd5e1); border: none; border-radius: 12px; color: #000; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: filter 0.2s; }
        .rtp-calculate-btn:hover { filter: brightness(1.1); }
        .rtp-calculate-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .rtp-spinner { width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.2); border-top-color: #000; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .rtp-error { margin-top: 12px; padding: 10px 14px; background: rgba(239,68,68,0.1); border: 1.5px solid rgba(239,68,68,0.3); border-radius: 8px; color: #ef4444; font-size: 13px; }
        .rtp-results { margin-top: 20px; }
        .rtp-stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        @media (max-width: 500px) { .rtp-stats-bar { grid-template-columns: repeat(2, 1fr); } }
        .rtp-stat { background: linear-gradient(160deg, rgba(18,28,45,0.85), rgba(10,16,28,0.92)); border: 1.5px solid rgba(148,163,184,0.12); border-radius: 12px; padding: 16px; text-align: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3); }
        .rtp-stat-value { display: block; font-size: 22px; font-weight: 700; color: #ffffff; }
        .rtp-stat-label { font-size: 11px; color: rgba(148,163,184,0.5); text-transform: uppercase; letter-spacing: 0.5px; }
        .rtp-map-wrapper { margin-bottom: 20px; }
        .rtp-map-toggle { display: none; width: 100%; padding: 10px; background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(200,214,229,0.04)); border: 1.5px solid rgba(255,255,255,0.2); border-radius: 10px; color: #ffffff; font-size: 13px; font-weight: 600; cursor: pointer; align-items: center; justify-content: center; gap: 6px; font-family: inherit; margin-bottom: 8px; }
        @media (max-width: 600px) { .rtp-map-toggle { display: flex; } }
        .rtp-map-shell { position: relative; }
        .rtp-map { width: 100%; height: 400px; border-radius: 12px; overflow: hidden; border: 1.5px solid rgba(148,163,184,0.12); background: #0d1117; }
        @media (max-width: 600px) { .rtp-map { height: 250px; } }
        .rtp-map-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 20px; border-radius: 12px; background: rgba(13,17,23,0.92); color: rgba(148,163,184,0.75); font-size: 13px; pointer-events: none; }
        .rtp-map-overlay.error { pointer-events: auto; }
        .rtp-map-overlay p { margin: 0 0 12px; }
        .rtp-map-overlay button { min-width: 44px; min-height: 44px; padding: 10px 16px; border: 1px solid rgba(59,130,246,0.55); border-radius: 6px; background: rgba(59,130,246,0.14); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
        .rtp-estimate-note { margin: -6px 0 14px; font-size: 11px; color: rgba(148,163,184,0.55); line-height: 1.5; }
        .rtp-share-status { margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; font-size: 12px; }
        .rtp-share-status.ok { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; }
        .rtp-share-status.fail { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
        .rtp-venue-card-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .rtp-venue-logo { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.08); }
        .rtp-venues-section h3, .rtp-series-section h3 { font-size: 18px; font-weight: 600; color: #e2e8f0; margin: 0 0 12px; }
        .rtp-venue-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .rtp-venue-card { background: linear-gradient(160deg, rgba(18,28,45,0.7), rgba(10,16,28,0.85)); border: 1.5px solid rgba(148,163,184,0.12); border-radius: 10px; padding: 14px; transition: all 0.25s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; }
        .rtp-venue-card:hover { border-color: rgba(255,255,255,0.35); transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.4); }
        .rtp-venue-name { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 2px; }
        .rtp-venue-loc { font-size: 12px; color: rgba(148,163,184,0.5); margin-bottom: 6px; }
        .rtp-venue-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .rtp-tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
        .rtp-tag.type { background: rgba(99,102,241,0.2); color: #818cf8; }
        .rtp-tag.trust { background: rgba(255,255,255,0.12); color: #ffffff; }
        .rtp-nav-btn { background: rgba(255,255,255,0.15); color: #ffffff; border: 1px solid rgba(255,255,255,0.3); cursor: pointer; font-family: inherit; font-weight: 600; transition: all 0.2s; -webkit-appearance: none; appearance: none; }
        .rtp-nav-btn:hover { background: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.5); }
        .rtp-more { padding: 14px; text-align: center; color: rgba(148,163,184,0.5); font-size: 13px; }
        .rtp-series-section { margin-top: 20px; }
        .rtp-series-card { background: linear-gradient(160deg, rgba(18,28,45,0.7), rgba(10,16,28,0.85)); border: 1.5px solid rgba(148,163,184,0.12); border-radius: 10px; padding: 14px; margin-bottom: 8px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3); }
        .rtp-series-name { font-size: 14px; font-weight: 600; color: #e2e8f0; }
        .rtp-series-dates { font-size: 12px; color: rgba(148,163,184,0.5); }
        .rtp-series-venue { font-size: 12px; color: #ffffff; margin-top: 2px; }
        .rtp-saved-trips { margin-top: 14px; border: 1.5px solid rgba(148,163,184,0.1); border-radius: 10px; overflow: hidden; }
        .rtp-saved-trips-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px; background: linear-gradient(180deg, rgba(18,28,45,0.5), rgba(10,16,28,0.6)); border: none; color: rgba(148,163,184,0.6); font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.2s; -webkit-appearance: none; appearance: none; }
        .rtp-saved-trips-toggle:hover { color: #ffffff; background: rgba(255,255,255,0.05); }
        .rtp-saved-trips-list { padding: 6px; }
        .rtp-saved-trip-item { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-bottom: 1px solid rgba(148,163,184,0.06); }
        .rtp-saved-trip-item:last-child { border-bottom: none; }
        .rtp-saved-trip-route { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #e2e8f0; }
        .rtp-saved-trip-meta { display: flex; gap: 12px; font-size: 10px; color: rgba(148,163,184,0.4); }
        .rtp-saved-trip-actions { display: flex; gap: 6px; margin-top: 4px; }
        .rtp-saved-trip-load { padding: 4px 12px; border-radius: 6px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #ffffff; font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; -webkit-appearance: none; appearance: none; }
        .rtp-saved-trip-load:hover { background: rgba(255,255,255,0.2); }
        .rtp-saved-trip-delete { padding: 4px 12px; border-radius: 6px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); color: rgba(239,68,68,0.6); font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; -webkit-appearance: none; appearance: none; }
        .rtp-saved-trip-delete:hover { background: rgba(239,68,68,0.15); color: #ef4444; }
        .rtp-add-waypoint, .rtp-chip, .rtp-date, .rtp-map-toggle, .rtp-nav-btn, .rtp-saved-trips-toggle, .rtp-saved-trip-load, .rtp-saved-trip-delete { min-height: 44px; }
        .rtp-date { min-width: 0; flex: 1; }
        .rtp-result-actions { display: flex; gap: 8px; margin-bottom: 12px; }
        .rtp-result-actions > button { min-height: 44px; }
        .rtp-empty { grid-column: 1 / -1; padding: 20px; border: 1px dashed rgba(148,163,184,0.2); border-radius: 10px; color: rgba(226,232,240,0.7); text-align: center; font-size: 13px; }
        .road-trip-planner button:focus-visible, .road-trip-planner input:focus-visible { outline: 2px solid #6ee7ef; outline-offset: 2px; }
        @media (max-width: 600px) {
          .rtp-form { padding: 16px; }
          .rtp-result-actions { flex-direction: column; }
          .rtp-result-actions > button { width: 100%; flex: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .road-trip-planner *, .road-trip-planner *::before, .road-trip-planner *::after { animation: none !important; transition: none !important; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
