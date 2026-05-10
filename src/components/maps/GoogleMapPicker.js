/**
 * Google Maps Location Picker for Home Games
 * Shows approximate location (neighborhood level) for privacy
 *
 * SETUP: Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to environment variables
 *
 * Usage:
 *   <GoogleMapPicker
 *     value={{ lat: 36.1699, lng: -115.1398, city: 'Las Vegas', state: 'NV' }}
 *     onChange={({ lat, lng, city, state, zipCode, neighborhood }) => {}}
 *     approximateOnly={true}
 *   />
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// Phase 41: trim defensively. The Vercel env var has historically been pasted
// with a trailing newline, which made Google reject the key (the '%0A' on the
// script URL produces "This page can't load Google Maps correctly"). The trim
// makes the loader resilient to whitespace regardless of how the env was set.
const GOOGLE_MAPS_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '').trim();

const C = {
    bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B',
    border: '#DADDE1', blue: '#1877F2', green: '#42B72A', red: '#FA383E',
};

/**
 * Load Google Maps script dynamically
 */
function useGoogleMaps() {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!GOOGLE_MAPS_KEY) {
            setError('Google Maps API key not configured');
            return;
        }

        if (window.google?.maps) {
            setLoaded(true);
            return;
        }

        // Check if script is already loading
        if (document.querySelector('script[src*="maps.googleapis.com"]')) {
            const check = setInterval(() => {
                if (window.google?.maps) {
                    setLoaded(true);
                    clearInterval(check);
                }
            }, 100);
            return () => clearInterval(check);
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places,geocoding`;
        script.async = true;
        script.defer = true;
        script.onload = () => setLoaded(true);
        script.onerror = () => setError('Failed to load Google Maps');
        document.head.appendChild(script);
    }, []);

    return { loaded, error };
}

/**
 * Approximate a coordinate to neighborhood level (~0.5 mile radius)
 * Rounds to ~2 decimal places for privacy
 */
function approximateLocation(lat, lng) {
    const precision = 2; // ~1.1km precision
    return {
        lat: Math.round(lat * Math.pow(10, precision)) / Math.pow(10, precision),
        lng: Math.round(lng * Math.pow(10, precision)) / Math.pow(10, precision),
    };
}

/**
 * Reverse geocode coordinates to get city/state/neighborhood
 */
async function reverseGeocode(lat, lng) {
    if (!window.google?.maps) return null;

    const geocoder = new window.google.maps.Geocoder();

    return new Promise((resolve) => {
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status !== 'OK' || !results?.length) {
                resolve(null);
                return;
            }

            let city = '', state = '', zipCode = '', neighborhood = '', country = '';

            for (const result of results) {
                for (const component of result.address_components) {
                    if (component.types.includes('locality')) city = component.long_name;
                    if (component.types.includes('administrative_area_level_1')) state = component.short_name;
                    if (component.types.includes('postal_code')) zipCode = component.long_name;
                    if (component.types.includes('neighborhood')) neighborhood = component.long_name;
                    if (component.types.includes('country')) country = component.short_name;
                    if (!city && component.types.includes('sublocality')) city = component.long_name;
                }
            }

            resolve({ city, state, zipCode, neighborhood, country });
        });
    });
}

export default function GoogleMapPicker({ value, onChange, approximateOnly = true, height = 300 }) {
    const { loaded, error } = useGoogleMaps();
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerRef = useRef(null);
    const circleRef = useRef(null);
    const [searchInput, setSearchInput] = useState('');
    const [locationInfo, setLocationInfo] = useState(null);

    const defaultCenter = {
        lat: value?.lat || 36.1699,
        lng: value?.lng || -115.1398,
    };

    const initMap = useCallback(() => {
        if (!mapRef.current || !window.google?.maps) return;

        const map = new window.google.maps.Map(mapRef.current, {
            center: defaultCenter,
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            styles: [
                { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
            ],
        });

        mapInstance.current = map;

        // Add marker
        const approx = approximateOnly ? approximateLocation(defaultCenter.lat, defaultCenter.lng) : defaultCenter;

        if (approximateOnly) {
            // Show approximate area circle instead of exact pin
            circleRef.current = new window.google.maps.Circle({
                map,
                center: approx,
                radius: 800, // ~0.5 miles
                fillColor: '#1877F2',
                fillOpacity: 0.15,
                strokeColor: '#1877F2',
                strokeOpacity: 0.4,
                strokeWeight: 2,
            });
        }

        markerRef.current = new window.google.maps.Marker({
            map,
            position: approx,
            draggable: true,
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#1877F2',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
            },
        });

        // Handle marker drag
        markerRef.current.addListener('dragend', async (e) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            const approxPos = approximateOnly ? approximateLocation(lat, lng) : { lat, lng };

            if (circleRef.current) {
                circleRef.current.setCenter(approxPos);
            }

            const geo = await reverseGeocode(approxPos.lat, approxPos.lng);
            setLocationInfo(geo);

            if (onChange) {
                onChange({
                    ...approxPos,
                    ...(geo || {}),
                    approximate: approximateOnly,
                });
            }
        });

        // Handle map click
        map.addListener('click', async (e) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            const approxPos = approximateOnly ? approximateLocation(lat, lng) : { lat, lng };

            markerRef.current.setPosition(approxPos);
            if (circleRef.current) {
                circleRef.current.setCenter(approxPos);
            }

            const geo = await reverseGeocode(approxPos.lat, approxPos.lng);
            setLocationInfo(geo);

            if (onChange) {
                onChange({
                    ...approxPos,
                    ...(geo || {}),
                    approximate: approximateOnly,
                });
            }
        });

        // Initialize search autocomplete
        const input = document.getElementById('map-search-input');
        if (input) {
            const autocomplete = new window.google.maps.places.Autocomplete(input, {
                types: ['geocode'],
                componentRestrictions: { country: 'us' },
            });
            autocomplete.bindTo('bounds', map);

            autocomplete.addListener('place_changed', async () => {
                const place = autocomplete.getPlace();
                if (!place.geometry?.location) return;

                const lat = place.geometry.location.lat();
                const lng = place.geometry.location.lng();
                const approxPos = approximateOnly ? approximateLocation(lat, lng) : { lat, lng };

                map.setCenter(approxPos);
                map.setZoom(14);
                markerRef.current.setPosition(approxPos);
                if (circleRef.current) {
                    circleRef.current.setCenter(approxPos);
                }

                const geo = await reverseGeocode(approxPos.lat, approxPos.lng);
                setLocationInfo(geo);

                if (onChange) {
                    onChange({
                        ...approxPos,
                        ...(geo || {}),
                        approximate: approximateOnly,
                    });
                }
            });
        }

        // Get initial location info
        reverseGeocode(defaultCenter.lat, defaultCenter.lng).then(geo => {
            if (geo) setLocationInfo(geo);
        });
    }, [defaultCenter.lat, defaultCenter.lng, approximateOnly, onChange]);

    useEffect(() => {
        if (loaded) initMap();
    }, [loaded, initMap]);

    if (error && !GOOGLE_MAPS_KEY) {
        // Fallback: manual city/state entry
        return (
            <div style={{
                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Approximate Location</span>
                </div>
                <p style={{ fontSize: 12, color: C.textSec, margin: '0 0 12px' }}>
                    Enter your approximate location. Your exact address is never shared.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                        type="text"
                        placeholder="City"
                        value={value?.city || ''}
                        onChange={e => onChange?.({ ...value, city: e.target.value })}
                        style={{
                            padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                            fontSize: 14, fontFamily: 'inherit', outline: 'none', background: C.bg,
                        }}
                    />
                    <input
                        type="text"
                        placeholder="State"
                        value={value?.state || ''}
                        onChange={e => onChange?.({ ...value, state: e.target.value })}
                        style={{
                            padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
                            fontSize: 14, fontFamily: 'inherit', outline: 'none', background: C.bg,
                        }}
                    />
                </div>
                <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 8,
                    background: '#FEF3C7', fontSize: 12, color: '#92400E',
                }}>
                    Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to enable the interactive map
                </div>
            </div>
        );
    }

    return (
        <div style={{
            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Approximate Location</span>
                </div>
                {approximateOnly && (
                    <p style={{ fontSize: 12, color: C.textSec, margin: 0 }}>
                        Your exact address is never shared. Only the approximate area is shown to other players.
                    </p>
                )}
            </div>

            {/* Search */}
            <div style={{ padding: '8px 16px' }}>
                <input
                    id="map-search-input"
                    type="text"
                    placeholder="Search For A Location..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit',
                        outline: 'none', background: C.bg, boxSizing: 'border-box',
                    }}
                />
            </div>

            {/* Map */}
            <div ref={mapRef} style={{ height, width: '100%' }}>
                {!loaded && (
                    <div style={{
                        height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', background: C.bg, color: C.textSec, fontSize: 14,
                    }}>
                        Loading map...
                    </div>
                )}
            </div>

            {/* Location Info */}
            {locationInfo && (
                <div style={{
                    padding: '10px 16px', borderTop: `1px solid ${C.border}`,
                    fontSize: 13, color: C.textSec,
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    {[locationInfo.neighborhood, locationInfo.city, locationInfo.state].filter(Boolean).join(', ')}
                </div>
            )}
        </div>
    );
}

/**
 * Static map display (no interaction, just shows approximate area)
 */
export function StaticMapDisplay({ lat, lng, city, state, height = 200 }) {
    if (!GOOGLE_MAPS_KEY && city) {
        return (
            <div style={{
                height, background: C.bg, borderRadius: 8, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 8, border: `1px solid ${C.border}`,
            }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span style={{ fontSize: 14, color: C.textSec }}>{city}{state ? `, ${state}` : ''}</span>
            </div>
        );
    }

    if (!lat || !lng || !GOOGLE_MAPS_KEY) {
        return (
            <div style={{
                height, background: C.bg, borderRadius: 8, display: 'flex',
                alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`,
            }}>
                <span style={{ fontSize: 13, color: C.textSec }}>Location Not Available</span>
            </div>
        );
    }

    const approx = approximateLocation(lat, lng);
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${approx.lat},${approx.lng}&zoom=13&size=600x${height}&maptype=roadmap&key=${GOOGLE_MAPS_KEY}&style=feature:poi|visibility:simplified`;

    return (
        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            <img src={mapUrl} alt="Approximate Location" style={{ width: '100%', height, objectFit: 'cover', display: 'block' }} />
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                padding: '20px 12px 8px', color: '#fff', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 4,
            }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                Approximate area {city ? `- ${city}${state ? `, ${state}` : ''}` : ''}
            </div>
        </div>
    );
}
