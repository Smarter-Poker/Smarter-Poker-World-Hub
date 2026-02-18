/**
 * LOCATION MAP PICKER — Interactive map for setting home game coordinates
 * ═══════════════════════════════════════════════════════════════════════════
 * Opens a full-screen modal with:
 *  1. Leaflet map centered on user's GPS (or a default)
 *  2. Draggable pin to set approximate location
 *  3. Address search bar (Nominatim free geocoding)
 *  4. Reverse geocode display of pin position
 *  5. "Confirm Location" button returning { lat, lng, address }
 *
 * Props:
 *   initialLat  - starting latitude (defaults to user GPS)
 *   initialLng  - starting longitude
 *   onConfirm   - ({ lat, lng, address }) => void
 *   onClose     - () => void
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export default function LocationMapPicker({ initialLat, initialLng, onConfirm, onClose }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);
    const [address, setAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [coords, setCoords] = useState({ lat: initialLat || 41.8781, lng: initialLng || -87.6298 }); // default: Chicago
    const [mapReady, setMapReady] = useState(false);
    const searchTimeoutRef = useRef(null);

    // Load Leaflet dynamically (client-side only)
    useEffect(() => {
        let cancelled = false;

        const loadMap = async () => {
            // Load Leaflet CSS
            if (!document.getElementById('leaflet-css')) {
                const link = document.createElement('link');
                link.id = 'leaflet-css';
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);
            }

            const L = (await import('leaflet')).default;
            if (cancelled || !mapRef.current) return;

            // Fix default marker icon path issue in bundlers
            delete L.Icon.Default.prototype._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });

            // Get user's current position if no initial coords
            let startLat = coords.lat;
            let startLng = coords.lng;

            if (!initialLat && navigator.geolocation) {
                try {
                    const pos = await new Promise((resolve, reject) =>
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 8000,
                        })
                    );
                    startLat = pos.coords.latitude;
                    startLng = pos.coords.longitude;
                    if (!cancelled) setCoords({ lat: startLat, lng: startLng });
                } catch {
                    // Use default coordinates
                }
            }

            if (cancelled || !mapRef.current) return;

            // Initialize map
            const map = L.map(mapRef.current, {
                zoomControl: true,
                attributionControl: false,
            }).setView([startLat, startLng], 15);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(map);

            // Draggable marker
            const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);

            marker.on('dragend', () => {
                const pos = marker.getLatLng();
                setCoords({ lat: pos.lat, lng: pos.lng });
                reverseGeocode(pos.lat, pos.lng);
            });

            // Click on map to move pin
            map.on('click', (e) => {
                marker.setLatLng(e.latlng);
                setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
                reverseGeocode(e.latlng.lat, e.latlng.lng);
            });

            mapInstanceRef.current = map;
            markerRef.current = marker;
            setMapReady(true);

            // Reverse geocode initial position
            reverseGeocode(startLat, startLng);

            // Force map resize after render
            setTimeout(() => map.invalidateSize(), 100);
        };

        loadMap();

        return () => {
            cancelled = true;
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Reverse geocode coordinates to address
    const reverseGeocode = useCallback(async (lat, lng) => {
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            if (data.display_name) {
                setAddress(data.display_name);
            }
        } catch {
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
    }, []);

    // Forward geocode: search address → move pin
    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const results = await res.json();
            if (results.length > 0) {
                const { lat, lon, display_name } = results[0];
                const newLat = parseFloat(lat);
                const newLng = parseFloat(lon);
                setCoords({ lat: newLat, lng: newLng });
                setAddress(display_name);

                if (mapInstanceRef.current && markerRef.current) {
                    mapInstanceRef.current.setView([newLat, newLng], 16);
                    markerRef.current.setLatLng([newLat, newLng]);
                }
            }
        } catch (err) {
            console.error('[LocationMapPicker] Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery]);

    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    };

    const handleConfirm = () => {
        onConfirm({
            lat: coords.lat,
            lng: coords.lng,
            address: address || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        });
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <h2 style={styles.title}>📍 Set Location</h2>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>

                {/* Search bar */}
                <div style={styles.searchRow}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search Address Or Place..."
                        style={styles.searchInput}
                    />
                    <button
                        type="button"
                        onClick={handleSearch}
                        disabled={isSearching}
                        style={styles.searchBtn}
                    >
                        {isSearching ? '⟳' : '🔍'}
                    </button>
                </div>

                {/* Map container */}
                <div ref={mapRef} style={styles.mapContainer}>
                    {!mapReady && (
                        <div style={styles.mapLoading}>
                            Loading map...
                        </div>
                    )}
                </div>

                {/* Address preview */}
                <div style={styles.addressBar}>
                    <span style={styles.addressLabel}>📍</span>
                    <span style={styles.addressText}>
                        {address || 'Drag the pin or search to set location'}
                    </span>
                </div>

                {/* Coordinates */}
                <div style={styles.coordsRow}>
                    <span style={styles.coordsText}>
                        {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                    </span>
                </div>

                {/* Actions */}
                <div style={styles.actions}>
                    <button type="button" onClick={onClose} style={styles.cancelBtn}>
                        Cancel
                    </button>
                    <button type="button" onClick={handleConfirm} style={styles.confirmBtn}>
                        ✓ Confirm Location
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    modal: {
        background: '#1a1d2e',
        borderRadius: 16,
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        border: '2px solid #9ca3af',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: '#888',
        fontSize: 20,
        cursor: 'pointer',
        padding: 4,
    },
    searchRow: {
        display: 'flex',
        gap: 8,
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
    },
    searchInput: {
        flex: 1,
        padding: '10px 14px',
        fontSize: 14,
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        color: '#fff',
        outline: 'none',
    },
    searchBtn: {
        width: 44,
        background: 'rgba(35,116,225,0.2)',
        border: '2px solid rgba(35,116,225,0.4)',
        borderRadius: 10,
        color: '#fff',
        fontSize: 16,
        cursor: 'pointer',
    },
    mapContainer: {
        width: '100%',
        height: 320,
        position: 'relative',
        background: '#0a0e1a',
    },
    mapLoading: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8a8d91',
        fontSize: 14,
    },
    addressBar: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.15)',
    },
    addressLabel: {
        fontSize: 16,
        flexShrink: 0,
        marginTop: 1,
    },
    addressText: {
        fontSize: 14,
        color: '#b0b3b8',
        lineHeight: 1.4,
        wordBreak: 'break-word',
    },
    coordsRow: {
        padding: '0 16px 12px',
    },
    coordsText: {
        fontSize: 14,
        color: '#8a8d91',
        fontFamily: 'monospace',
    },
    actions: {
        display: 'flex',
        gap: 10,
        padding: '12px 16px 16px',
        borderTop: '1px solid rgba(255,255,255,0.15)',
    },
    cancelBtn: {
        flex: 1,
        padding: '12px 16px',
        fontSize: 14,
        fontWeight: 600,
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        color: '#b0b3b8',
        cursor: 'pointer',
    },
    confirmBtn: {
        flex: 2,
        padding: '12px 16px',
        fontSize: 14,
        fontWeight: 600,
        background: 'rgba(34,197,94,0.15)',
        border: '2px solid rgba(34,197,94,0.4)',
        borderRadius: 10,
        color: '#4ade80',
        cursor: 'pointer',
    },
};
