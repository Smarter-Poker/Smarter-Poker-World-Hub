/**
 * RoadTripPlanner.jsx — Feature #3: Smart Poker Road Trip Planner
 * Multi-stop trip builder with route overlay showing poker venues along the way.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

const CORRIDOR_OPTIONS = [25, 50, 100];

// Haversine distance in miles
function haversineMiles(lat1, lng1, lat2, lng2) {
    const R = 3958.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Interpolate points along a great circle for corridor search
function interpolateRoute(start, end, numPoints = 20) {
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        points.push({
            lat: start.lat + t * (end.lat - start.lat),
            lng: start.lng + t * (end.lng - start.lng),
        });
    }
    return points;
}

// Check if a venue is within corridorMi of any route segment point
function isNearRoute(venue, routePoints, corridorMi) {
    if (!venue.latitude || !venue.longitude) return false;
    for (const pt of routePoints) {
        if (haversineMiles(pt.lat, pt.lng, parseFloat(venue.latitude), parseFloat(venue.longitude)) <= corridorMi) {
            return true;
        }
    }
    return false;
}

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

async function geocodeCity(query) {
    const key = query.toLowerCase().trim();
    if (POPULAR_CITIES_GEO[key]) return POPULAR_CITIES_GEO[key];
    // Try partial match
    for (const [k, v] of Object.entries(POPULAR_CITIES_GEO)) {
        if (k.includes(key) || key.includes(k.split(',')[0])) return v;
    }
    // Fallback: Nominatim (free, no API key)
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`);
        const data = await res.json();
        if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
    } catch { /* fallback failed */ }
    return null;
}

export default function RoadTripPlanner({ venues = [], userLocation, dailyTournaments = [], series = [] }) {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [waypoints, setWaypoints] = useState([]);
    const [corridorMi, setCorridorMi] = useState(50);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [routeResult, setRouteResult] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [error, setError] = useState(null);
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const addWaypoint = () => setWaypoints(prev => [...prev, '']);
    const removeWaypoint = (idx) => setWaypoints(prev => prev.filter((_, i) => i !== idx));
    const updateWaypoint = (idx, val) => setWaypoints(prev => prev.map((w, i) => i === idx ? val : w));

    const calculateRoute = useCallback(async () => {
        setError(null);
        setCalculating(true);
        try {
            const stops = [origin, ...waypoints.filter(w => w.trim()), destination].filter(Boolean);
            if (stops.length < 2) { setError('Enter at least an origin and destination.'); setCalculating(false); return; }

            // Geocode all stops
            const geoStops = [];
            for (const stop of stops) {
                const geo = await geocodeCity(stop);
                if (!geo) { setError(`Could not locate: "${stop}"`); setCalculating(false); return; }
                geoStops.push({ name: stop, ...geo });
            }

            // Build route segments and find venues along each
            const allRoutePoints = [];
            const segments = [];
            let totalDistance = 0;

            for (let i = 0; i < geoStops.length - 1; i++) {
                const segPoints = interpolateRoute(geoStops[i], geoStops[i + 1], 30);
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
            const nearbyVenues = venues.filter(v => isNearRoute(v, allRoutePoints, corridorMi));

            // Filter tournaments by date range if set
            let matchingTournaments = [];
            if (dateRange.start && dateRange.end) {
                const startDate = new Date(dateRange.start);
                const endDate = new Date(dateRange.end);
                const venueIds = new Set(nearbyVenues.map(v => String(v.id)));
                // Build set of day abbreviations within travel window
                const travelDays = new Set();
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    travelDays.add(dayNames[d.getDay()]);
                }
                matchingTournaments = dailyTournaments.filter(t => {
                    if (!venueIds.has(String(t.venue_id))) return false;
                    // Match day_of_week against travel window days
                    const tDay = t.day_of_week || '';
                    return travelDays.has(tDay) || travelDays.size === 0;
                });
            }

            // Filter series by date range
            let matchingSeries = [];
            if (dateRange.start && dateRange.end) {
                const startDate = new Date(dateRange.start);
                const endDate = new Date(dateRange.end);
                matchingSeries = series.filter(s => {
                    if (!s.start_date) return false;
                    const sStart = new Date(s.start_date);
                    const sEnd = s.end_date ? new Date(s.end_date) : sStart;
                    return sStart <= endDate && sEnd >= startDate;
                });
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
            console.error('Route calculation error:', err);
        } finally {
            setCalculating(false);
        }
    }, [origin, destination, waypoints, corridorMi, dateRange, venues, dailyTournaments, series]);

    // Render Leaflet route map when result is available
    useEffect(() => {
        if (!routeResult || !mapRef.current || typeof window === 'undefined' || !window.L) return;
        if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

        const L = window.L;
        const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(map);

        // Draw route polyline
        const latlngs = routeResult.routePoints.map(p => [p.lat, p.lng]);
        L.polyline(latlngs, { color: '#d4a853', weight: 3, opacity: 0.8, dashArray: '8, 6' }).addTo(map);

        // Stop markers
        routeResult.stops.forEach((stop, i) => {
            const color = i === 0 ? '#22c55e' : i === routeResult.stops.length - 1 ? '#ef4444' : '#3b82f6';
            const icon = L.divIcon({
                className: 'trip-stop-marker',
                html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 10px ${color}80;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;">${i + 1}</div>`,
                iconSize: [20, 20], iconAnchor: [10, 10],
            });
            L.marker([stop.lat, stop.lng], { icon }).addTo(map).bindPopup(`<b style="color:#0f172a">${stop.name}</b>`);
        });

        // Venue markers along route
        routeResult.venues.forEach(v => {
            const icon = L.divIcon({
                className: 'route-venue-marker',
                html: '<div style="width:10px;height:10px;border-radius:50%;background:#d4a853;border:2px solid #fff;box-shadow:0 0 6px rgba(212,168,83,0.6);"></div>',
                iconSize: [14, 14], iconAnchor: [7, 7],
            });
            L.marker([parseFloat(v.latitude), parseFloat(v.longitude)], { icon })
                .addTo(map)
                .bindPopup(`<div style="font-family:Inter,sans-serif;color:#0f172a;"><b>${v.name}</b><br/>${v.city || ''}, ${v.state || ''}</div>`);
        });

        // Fit bounds
        if (latlngs.length > 0) {
            map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
        }

        mapInstanceRef.current = map;
        return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
    }, [routeResult]);

    return (
        <div className="road-trip-planner">
            <div className="rtp-header">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                            placeholder={`Waypoint ${i + 1}`}
                            value={wp}
                            onChange={e => updateWaypoint(i, e.target.value)}
                            className="rtp-input"
                        />
                        <button className="rtp-remove-btn" onClick={() => removeWaypoint(i)}>×</button>
                    </div>
                ))}

                <div className="rtp-input-row">
                    <div className="rtp-dot destination" />
                    <input
                        type="text"
                        placeholder="Destination (e.g., Las Vegas, NV)"
                        value={destination}
                        onChange={e => setDestination(e.target.value)}
                        className="rtp-input"
                    />
                </div>

                <button className="rtp-add-waypoint" onClick={addWaypoint}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add Stop
                </button>

                <div className="rtp-options">
                    <div className="rtp-option-group">
                        <label>Search Corridor</label>
                        <div className="rtp-chips">
                            {CORRIDOR_OPTIONS.map(mi => (
                                <button key={mi} className={'rtp-chip' + (corridorMi === mi ? ' active' : '')} onClick={() => setCorridorMi(mi)}>{mi} mi</button>
                            ))}
                        </div>
                    </div>

                    <div className="rtp-option-group">
                        <label>Travel Dates (optional)</label>
                        <div className="rtp-date-row">
                            <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} className="rtp-date" />
                            <span className="rtp-date-sep">→</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} className="rtp-date" />
                        </div>
                    </div>
                </div>

                <button className="rtp-calculate-btn" onClick={calculateRoute} disabled={calculating}>
                    {calculating ? (
                        <><span className="rtp-spinner" /> Calculating...</>
                    ) : (
                        <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                            Plan My Trip
                        </>
                    )}
                </button>

                {error && <div className="rtp-error">{error}</div>}
            </div>

            {/* Results */}
            {routeResult && (
                <div className="rtp-results">
                    {/* Stats bar */}
                    <div className="rtp-stats-bar">
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{Math.round(routeResult.totalDistance)}</span>
                            <span className="rtp-stat-label">miles</span>
                        </div>
                        <div className="rtp-stat">
                            <span className="rtp-stat-value">{Math.floor(routeResult.totalDriveTime / 60)}h {routeResult.totalDriveTime % 60}m</span>
                            <span className="rtp-stat-label">drive time</span>
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

                    {/* Map */}
                    <div ref={mapRef} className="rtp-map" />

                    {/* Venues along route */}
                    <div className="rtp-venues-section">
                        <h3>Poker Rooms Along Your Route</h3>
                        <div className="rtp-venue-list">
                            {routeResult.venues.slice(0, 20).map((v, i) => (
                                <div key={v.id || i} className="rtp-venue-card">
                                    <div className="rtp-venue-name">{v.name}</div>
                                    <div className="rtp-venue-loc">{v.city}, {v.state}</div>
                                    <div className="rtp-venue-tags">
                                        {v.venue_type && <span className="rtp-tag type">{v.venue_type.replace('_', ' ')}</span>}
                                        {v.trust_score && <span className="rtp-tag trust">Trust: {v.trust_score}/5</span>}
                                    </div>
                                </div>
                            ))}
                            {routeResult.venues.length > 20 && (
                                <div className="rtp-more">+{routeResult.venues.length - 20} more venues</div>
                            )}
                        </div>
                    </div>

                    {/* Series during travel dates */}
                    {routeResult.series.length > 0 && (
                        <div className="rtp-series-section">
                            <h3>Series During Your Trip</h3>
                            {routeResult.series.map((s, i) => (
                                <div key={i} className="rtp-series-card">
                                    <div className="rtp-series-name">{s.name}</div>
                                    <div className="rtp-series-dates">{s.start_date} — {s.end_date || 'TBD'}</div>
                                    {s.venue_name && <div className="rtp-series-venue">{s.venue_name}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <style jsx>{`
        .road-trip-planner { padding: 0 0 20px; }
        .rtp-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
        .rtp-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
        .rtp-form { background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px; }
        .rtp-input-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .rtp-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .rtp-dot.origin { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); }
        .rtp-dot.waypoint { background: #3b82f6; box-shadow: 0 0 8px rgba(59,130,246,0.5); }
        .rtp-dot.destination { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
        .rtp-input { flex: 1; padding: 12px 16px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #fff; font-size: 14px; font-family: inherit; transition: border-color 0.2s; }
        .rtp-input:focus { outline: none; border-color: rgba(212,168,83,0.5); }
        .rtp-input::placeholder { color: rgba(255,255,255,0.3); }
        .rtp-remove-btn { background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; width: 32px; height: 32px; border-radius: 8px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .rtp-add-waypoint { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); border-radius: 8px; color: #3b82f6; font-size: 13px; font-weight: 500; cursor: pointer; margin-bottom: 16px; }
        .rtp-add-waypoint:hover { background: rgba(59,130,246,0.2); }
        .rtp-options { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        @media (max-width: 600px) { .rtp-options { grid-template-columns: 1fr; } }
        .rtp-option-group label { display: block; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .rtp-chips { display: flex; gap: 6px; }
        .rtp-chip { padding: 8px 14px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .rtp-chip.active { background: rgba(212,168,83,0.2); border-color: rgba(212,168,83,0.5); color: #d4a853; }
        .rtp-date-row { display: flex; align-items: center; gap: 8px; }
        .rtp-date { padding: 8px 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #fff; font-size: 13px; font-family: inherit; color-scheme: dark; }
        .rtp-date-sep { color: rgba(255,255,255,0.3); font-size: 16px; }
        .rtp-calculate-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #d4a853, #b8860b); border: none; border-radius: 12px; color: #000; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: filter 0.2s; }
        .rtp-calculate-btn:hover { filter: brightness(1.1); }
        .rtp-calculate-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .rtp-spinner { width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.2); border-top-color: #000; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .rtp-error { margin-top: 12px; padding: 10px 14px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; color: #ef4444; font-size: 13px; }
        .rtp-results { margin-top: 20px; }
        .rtp-stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        @media (max-width: 500px) { .rtp-stats-bar { grid-template-columns: repeat(2, 1fr); } }
        .rtp-stat { background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; text-align: center; }
        .rtp-stat-value { display: block; font-size: 22px; font-weight: 700; color: #d4a853; }
        .rtp-stat-label { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
        .rtp-map { width: 100%; height: 400px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; background: #0f172a; }
        .rtp-venues-section h3, .rtp-series-section h3 { font-size: 18px; font-weight: 600; color: #fff; margin: 0 0 12px; }
        .rtp-venue-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .rtp-venue-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; transition: all 0.2s; }
        .rtp-venue-card:hover { border-color: rgba(212,168,83,0.3); background: rgba(255,255,255,0.06); }
        .rtp-venue-name { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 2px; }
        .rtp-venue-loc { font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 6px; }
        .rtp-venue-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .rtp-tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
        .rtp-tag.type { background: rgba(99,102,241,0.2); color: #818cf8; }
        .rtp-tag.trust { background: rgba(212,168,83,0.15); color: #d4a853; }
        .rtp-more { padding: 14px; text-align: center; color: rgba(255,255,255,0.4); font-size: 13px; }
        .rtp-series-section { margin-top: 20px; }
        .rtp-series-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; margin-bottom: 8px; }
        .rtp-series-name { font-size: 14px; font-weight: 600; color: #fff; }
        .rtp-series-dates { font-size: 12px; color: rgba(255,255,255,0.4); }
        .rtp-series-venue { font-size: 12px; color: #d4a853; margin-top: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
