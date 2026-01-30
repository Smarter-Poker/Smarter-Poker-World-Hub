/**
 * POKER NEAR ME - Unified Search for Venues, Tours, Series, and Daily Events
 * Complete poker discovery platform with interactive map and geofence alerts
 */

import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const POPULAR_CITIES = [
    { name: 'Las Vegas', state: 'NV' },
    { name: 'Los Angeles', state: 'CA' },
    { name: 'Miami', state: 'FL' },
    { name: 'Atlantic City', state: 'NJ' },
    { name: 'Austin', state: 'TX' },
];

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Card Room',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity Room'
};

const TOUR_TYPE_LABELS = {
    major: 'Major Tour',
    circuit: 'Circuit',
    high_roller: 'High Roller',
    regional: 'Regional',
    grassroots: 'Grassroots',
    charity: 'Charity',
    cruise: 'Cruise'
};

const TOUR_COLORS = {
    'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
    'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
    'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
    'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' }
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getTrustLevel(score) {
    if (score >= 4.5) return { label: 'High', color: '#22c55e' };
    if (score >= 4.0) return { label: 'Good', color: '#3b82f6' };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b' };
    return { label: 'Low', color: '#ef4444' };
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(0) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
    return '$' + amount.toLocaleString();
}

function getCurrentDay() {
    return DAYS_OF_WEEK[new Date().getDay()];
}

// Geofence radii by venue type (meters)
const GEOFENCE_RADII = {
    casino: 500,
    card_room: 300,
    poker_club: 200,
    charity: 200,
};
const DEFAULT_GEOFENCE_RADIUS = 300;

function getGeofenceRadius(venueType) {
    return GEOFENCE_RADII[venueType] || DEFAULT_GEOFENCE_RADIUS;
}

// Tour Badge Component
function TourBadge({ tourCode, size = 'normal' }) {
    const style = TOUR_COLORS[tourCode] || TOUR_COLORS.default;
    const padding = size === 'small' ? '4px 10px' : '8px 16px';
    const fontSize = size === 'small' ? '11px' : '14px';

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding,
            borderRadius: '6px',
            background: style.bg,
            border: '1px solid ' + style.border,
            minWidth: size === 'small' ? '50px' : '70px'
        }}>
            <span style={{ color: style.text, fontSize, fontWeight: 800, letterSpacing: '0.5px' }}>
                {tourCode || 'TOUR'}
            </span>
        </div>
    );
}

// ---- Geofence Alert Banner (bottom of screen) ----------------------------
function GeofenceAlertBanner({ venue, onCheckin, onReview, onDismiss }) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
            if (onDismiss) onDismiss();
        }, 30000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    if (!visible || !venue) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            padding: '0 16px 16px',
            pointerEvents: 'none',
        }}>
            <div style={{
                maxWidth: 560,
                margin: '0 auto',
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(212, 168, 83, 0.4)',
                borderRadius: 14,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
                pointerEvents: 'auto',
            }}>
                {/* Venue icon */}
                <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: 'rgba(212,168,83,0.15)',
                    border: '1px solid rgba(212,168,83,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                    </svg>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#d4a853', marginBottom: 2 }}>
                        You are near a poker venue!
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {venue.name}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={onCheckin} style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: 'linear-gradient(135deg, #d4a853, #b8860b)',
                        border: 'none', color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>Check In</button>
                    <button onClick={onReview} style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    }}>Review</button>
                    <button onClick={() => { setVisible(false); if (onDismiss) onDismiss(); }} style={{
                        padding: '6px', borderRadius: 6,
                        background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---- Leaflet Map Component (client-side only) ----------------------------
function VenueMap({ venues, userLocation }) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const userMarkerRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);

    // Wait for Leaflet scripts to be available
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const check = () => {
            if (window.L && window.L.markerClusterGroup) {
                setMapReady(true);
            } else {
                setTimeout(check, 200);
            }
        };
        check();
    }, []);

    // Initialize map once Leaflet is ready
    useEffect(() => {
        if (!mapReady || !mapContainerRef.current) return;
        if (mapInstanceRef.current) return; // already initialized

        const L = window.L;

        const defaultCenter = [39.8283, -98.5795]; // US center
        const defaultZoom = 4;

        const map = L.map(mapContainerRef.current, {
            center: defaultCenter,
            zoom: defaultZoom,
            zoomControl: true,
            attributionControl: true,
        });

        // Dark tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;

        // Add venue markers
        const goldIcon = L.divIcon({
            className: 'venue-map-marker',
            html: '<div style="width:14px;height:14px;border-radius:50%;background:#d4a853;border:2px solid #fff;box-shadow:0 0 8px rgba(212,168,83,0.6);"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            popupAnchor: [0, -12],
        });

        const clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            iconCreateFunction: function (cluster) {
                const count = cluster.getChildCount();
                let size = 36;
                if (count > 50) size = 48;
                else if (count > 20) size = 42;
                return L.divIcon({
                    html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:rgba(212,168,83,0.85);border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#000;box-shadow:0 2px 10px rgba(0,0,0,0.4);">' + count + '</div>',
                    className: 'venue-cluster-icon',
                    iconSize: [size, size],
                });
            },
        });

        const validVenues = (venues || []).filter(function(v) { return v.latitude && v.longitude; });

        validVenues.forEach(function(venue) {
            const trust = getTrustLevel(venue.trust_score);
            const typeBadge = VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type || '';

            const popupHtml = '<div style="font-family:Inter,-apple-system,sans-serif;min-width:200px;max-width:280px;">' +
                '<div style="font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">' + (venue.name || '') + '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
                    '<span style="padding:2px 8px;border-radius:4px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:600;">' + typeBadge + '</span>' +
                    '<span style="font-size:12px;color:#666;">' + (venue.city || '') + ', ' + (venue.state || '') + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:' + trust.color + ';font-weight:600;margin-bottom:8px;">Trust: ' + trust.label + ' (' + (venue.trust_score || '-') + '/5)</div>' +
                '<div style="display:flex;gap:6px;">' +
                    '<a href="/hub/venues/' + venue.id + '" style="padding:6px 12px;border-radius:6px;background:#d4a853;color:#000;text-decoration:none;font-size:12px;font-weight:600;">View Details</a>' +
                    '<a href="/hub/venues/' + venue.id + '?action=checkin" style="padding:6px 12px;border-radius:6px;background:#1e40af;color:#fff;text-decoration:none;font-size:12px;font-weight:600;">Check In</a>' +
                    '<a href="/hub/venues/' + venue.id + '?action=review" style="padding:6px 12px;border-radius:6px;background:#374151;color:#fff;text-decoration:none;font-size:12px;font-weight:600;">Review</a>' +
                '</div>' +
            '</div>';

            const marker = L.marker([venue.latitude, venue.longitude], { icon: goldIcon })
                .bindPopup(popupHtml, { maxWidth: 300, className: 'venue-popup' });

            // Geofence circle
            const radius = getGeofenceRadius(venue.venue_type);
            const circle = L.circle([venue.latitude, venue.longitude], {
                radius: radius,
                color: '#d4a853',
                weight: 1,
                opacity: 0.35,
                fillColor: '#d4a853',
                fillOpacity: 0.08,
            });

            marker._venueCircle = circle;
            marker._venueData = venue;

            clusterGroup.addLayer(marker);
        });

        map.addLayer(clusterGroup);

        // Show / hide geofence circles based on zoom
        const circlesGroup = L.layerGroup();
        circlesGroup.addTo(map);

        function updateCircles() {
            circlesGroup.clearLayers();
            const zoom = map.getZoom();
            if (zoom >= 11) {
                clusterGroup.eachLayer(function(marker) {
                    if (marker._venueCircle) {
                        circlesGroup.addLayer(marker._venueCircle);
                    }
                });
            }
        }

        map.on('zoomend', updateCircles);
        updateCircles();

        // Center on user if available
        if (userLocation) {
            map.setView([userLocation.lat, userLocation.lng], 12);
        }

        // Cleanup
        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

    // Update user location marker when it changes
    useEffect(() => {
        if (!mapReady || !mapInstanceRef.current) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        if (userMarkerRef.current) {
            map.removeLayer(userMarkerRef.current);
            userMarkerRef.current = null;
        }

        if (userLocation) {
            const userIcon = L.divIcon({
                className: 'user-location-dot',
                html: '<div style="position:relative;width:18px;height:18px;">' +
                    '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:userPulse 2s ease-in-out infinite;"></div>' +
                    '<div style="position:absolute;top:4px;left:4px;width:10px;height:10px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 6px rgba(59,130,246,0.8);"></div>' +
                '</div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
            });

            userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
                .addTo(map)
                .bindPopup('<b style="color:#1a1a2e;">Your Location</b>');

            map.setView([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 12));
        }
    }, [userLocation, mapReady]);

    return (
        <div style={{ position: 'relative' }}>
            {!mapReady && (
                <div style={{
                    height: 'calc(100vh - 200px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 12,
                    color: 'rgba(255,255,255,0.5)',
                }}>
                    <div style={{
                        width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: '#d4a853', borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <span>Loading map...</span>
                </div>
            )}
            <div
                ref={mapContainerRef}
                style={{
                    height: 'calc(100vh - 200px)',
                    minHeight: 400,
                    width: '100%',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: mapReady ? 'block' : 'none',
                }}
            />
        </div>
    );
}


export default function PokerNearMe() {
    const router = useRouter();
    // Active tab state
    const [activeTab, setActiveTab] = useState('venues');

    // Data states
    const [venues, setVenues] = useState([]);
    const [allVenuesForMap, setAllVenuesForMap] = useState([]);
    const [tours, setTours] = useState([]);
    const [series, setSeries] = useState([]);
    const [dailyTournaments, setDailyTournaments] = useState([]);

    // UI states
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCity, setSelectedCity] = useState(null);
    const [nearestDistance, setNearestDistance] = useState(null);

    // Geofence alert state
    const [geofenceAlert, setGeofenceAlert] = useState(null);
    const geofenceRef = useRef(null);

    // Intro video state - only show once per session
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('poker-near-me-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('poker-near-me-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Filter states
    const [filters, setFilters] = useState({
        venueType: 'all',
        hasNLH: false,
        hasPLO: false,
        hasMixed: false,
        tourType: 'all',
        seriesTimeframe: 90,
        seriesType: 'all',
        selectedDay: getCurrentDay(),
        minBuyin: '',
        maxBuyin: ''
    });

    // --- NEW: Live games, favorites, sorting, pagination, search history ---
    const [liveGames, setLiveGames] = useState([]);
    const [liveLoading, setLiveLoading] = useState(false);
    const liveRefreshRef = useRef(null);
    const [favorites, setFavorites] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return JSON.parse(localStorage.getItem('sp-favorites') || '{}'); } catch { return {}; }
        }
        return {};
    });
    const [sortBy, setSortBy] = useState('default');
    const [displayCount, setDisplayCount] = useState({ venues: 24, tours: 24, series: 24, daily: 30, live: 30 });
    const [searchHistory, setSearchHistory] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return JSON.parse(localStorage.getItem('sp-search-history') || '[]'); } catch { return []; }
        }
        return [];
    });
    const [showSearchHistory, setShowSearchHistory] = useState(false);
    const [promotionVenueIds, setPromotionVenueIds] = useState(new Set());
    const [seriesViewMode, setSeriesViewMode] = useState('grid'); // 'grid' or 'calendar'

    // Load all venues for the map (from static JSON) on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        fetch('/data/all-venues.json')
            .then(function(r) { return r.json(); })
            .then(function(json) {
                var v = json.venues || json.data || json || [];
                setAllVenuesForMap(Array.isArray(v) ? v : []);
            })
            .catch(function() { setAllVenuesForMap([]); });
    }, []);

    // Fetch all data on mount and when filters change
    useEffect(() => {
        fetchAllData();
    }, [selectedCity, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------- Geofence monitoring ----------
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!userLocation) return;
        if (allVenuesForMap.length === 0) return;

        var gfService = null;

        // Dynamic import to keep SSR safe
        import('../../src/lib/geofence').then(function(mod) {
            var GeofenceService = mod.default;
            gfService = new GeofenceService();

            // Also try requesting push permission
            import('../../src/lib/pushAlerts').then(function(pushMod) {
                pushMod.requestPermission();

                gfService.start(allVenuesForMap, function(venue) {
                    // Try browser notification first
                    pushMod.showVenueAlert(venue, 'checkin');
                    // Also show in-app banner
                    setGeofenceAlert(venue);
                });
            }).catch(function() {
                // Fallback: just in-app alerts
                gfService.start(allVenuesForMap, function(venue) {
                    setGeofenceAlert(venue);
                });
            });

            geofenceRef.current = gfService;
        }).catch(function(err) {
            console.warn('[PokerNearMe] Could not load GeofenceService:', err);
        });

        return function() {
            if (geofenceRef.current) {
                geofenceRef.current.stop();
                geofenceRef.current = null;
            }
        };
    }, [userLocation, allVenuesForMap]);

    // --- NEW: Persist favorites to localStorage ---
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sp-favorites', JSON.stringify(favorites));
        }
    }, [favorites]);

    // --- NEW: Fetch promotion venue IDs on mount ---
    useEffect(() => {
        fetch('/api/poker/promotions?limit=200')
            .then(r => r.json())
            .then(json => {
                const ids = new Set();
                (json.promotions || json.data || []).forEach(p => { if (p.page_id) ids.add(String(p.page_id)); });
                setPromotionVenueIds(ids);
            })
            .catch(() => {});
    }, []);

    // --- NEW: Auto-refresh live games when on live tab ---
    useEffect(() => {
        if (activeTab === 'live') {
            fetchLiveGames();
            liveRefreshRef.current = setInterval(fetchLiveGames, 120000); // 2 min
        }
        return () => { if (liveRefreshRef.current) clearInterval(liveRefreshRef.current); };
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- NEW: Helper functions ---
    const toggleFavorite = (type, id, e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        const key = type + '-' + id;
        setFavorites(prev => {
            const next = { ...prev };
            if (next[key]) { delete next[key]; } else { next[key] = Date.now(); }
            return next;
        });
    };

    const isFavorited = (type, id) => !!favorites[type + '-' + id];

    const addToSearchHistory = (query) => {
        if (!query || !query.trim()) return;
        const trimmed = query.trim();
        setSearchHistory(prev => {
            const filtered = prev.filter(s => s !== trimmed);
            const next = [trimmed, ...filtered].slice(0, 8);
            localStorage.setItem('sp-search-history', JSON.stringify(next));
            return next;
        });
    };

    const getSortedVenues = (venueList) => {
        if (sortBy === 'default') return venueList;
        const sorted = [...venueList];
        switch (sortBy) {
            case 'trust-desc': return sorted.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
            case 'trust-asc': return sorted.sort((a, b) => (a.trust_score || 0) - (b.trust_score || 0));
            case 'distance': return sorted.sort((a, b) => (a.distance_mi || 9999) - (b.distance_mi || 9999));
            case 'name-az': return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'name-za': return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            default: return sorted;
        }
    };

    const loadMore = (tab) => {
        setDisplayCount(prev => ({ ...prev, [tab]: prev[tab] + 24 }));
    };

    const isNewcomerFriendly = (venue) => {
        if (!venue) return false;
        const hasLowStakes = venue.stakes_cash && venue.stakes_cash.some(s => {
            const match = s.match(/\$?(\d+)/);
            return match && parseInt(match[1]) <= 2;
        });
        const highTrust = (venue.trust_score || 0) >= 4.0;
        const isCardRoom = venue.venue_type === 'card_room' || venue.venue_type === 'charity';
        return (hasLowStakes && highTrust) || (isCardRoom && highTrust);
    };

    const requestGpsLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setGpsLoading(false);
            },
            () => {
                alert('Unable to get your location. Please enable location services.');
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const fetchAllData = async () => {
        setLoading(true);
        await Promise.all([
            fetchVenues(),
            fetchTours(),
            fetchSeries(),
            fetchDailyTournaments()
        ]);
        setLoading(false);
    };

    const fetchVenues = async () => {
        try {
            const params = new URLSearchParams({ limit: '500' });
            if (selectedCity) {
                params.set('city', selectedCity.name);
                params.set('state', selectedCity.state);
            }
            if (userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
                params.set('radius', '500');
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const res = await fetch('/api/poker/venues?' + params);
            const json = await res.json();
            const data = json.data;
            let filteredData = data || [];

            if (filters.venueType !== 'all') {
                filteredData = filteredData.filter(v => v.venue_type === filters.venueType);
            }
            if (filters.hasNLH) {
                filteredData = filteredData.filter(v => v.games_offered && v.games_offered.includes('NLH'));
            }
            if (filters.hasPLO) {
                filteredData = filteredData.filter(v => v.games_offered && v.games_offered.includes('PLO'));
            }
            if (filters.hasMixed) {
                filteredData = filteredData.filter(v => v.games_offered && v.games_offered.includes('Mixed'));
            }

            setVenues(filteredData);
            if (filteredData.length > 0 && filteredData[0].distance_mi) {
                setNearestDistance(filteredData[0].distance_mi);
            }
        } catch (e) {
            console.error('Fetch venues error:', e);
            setVenues([]);
        }
    };

    const fetchTours = async () => {
        try {
            const params = new URLSearchParams({ include_series: 'true', limit: '30' });
            if (filters.tourType !== 'all') {
                params.set('type', filters.tourType);
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const res = await fetch('/api/poker/tours?' + params);
            const json = await res.json();
            setTours(json.data || []);
        } catch (e) {
            console.error('Fetch tours error:', e);
            setTours([]);
        }
    };

    const fetchSeries = async () => {
        try {
            const params = new URLSearchParams({ upcoming: 'true', limit: '70' });

            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + filters.seriesTimeframe);
            params.set('end_date', endDate.toISOString().split('T')[0]);

            if (filters.seriesType !== 'all') {
                params.set('type', filters.seriesType);
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }

            const res = await fetch('/api/poker/series?' + params);
            const json = await res.json();
            setSeries(json.data || []);
        } catch (e) {
            console.error('Fetch series error:', e);
            setSeries([]);
        }
    };

    const fetchDailyTournaments = async () => {
        try {
            const params = new URLSearchParams({ limit: '100' });
            params.set('day', filters.selectedDay);

            if (selectedCity && selectedCity.state) {
                params.set('state', selectedCity.state);
            }
            if (searchQuery) {
                params.set('venue', searchQuery);
            }
            if (filters.minBuyin) {
                params.set('minBuyin', filters.minBuyin);
            }
            if (filters.maxBuyin) {
                params.set('maxBuyin', filters.maxBuyin);
            }

            const res = await fetch('/api/poker/daily-tournaments?' + params);
            const json = await res.json();
            setDailyTournaments(json.tournaments || []);
        } catch (e) {
            console.error('Fetch daily tournaments error:', e);
            setDailyTournaments([]);
        }
    };

    const fetchLiveGames = async () => {
        setLiveLoading(true);
        try {
            const res = await fetch('/api/poker/live-games?active=true');
            const json = await res.json();
            setLiveGames(json.games || json.data || []);
        } catch (e) {
            console.error('Fetch live games error:', e);
            setLiveGames([]);
        }
        setLiveLoading(false);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        addToSearchHistory(searchQuery);
        setShowSearchHistory(false);
        fetchAllData();
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
    };

    const clearFilters = () => {
        setSelectedCity(null);
        setUserLocation(null);
        setSearchQuery('');
        setFilters({
            venueType: 'all',
            hasNLH: false,
            hasPLO: false,
            hasMixed: false,
            tourType: 'all',
            seriesTimeframe: 90,
            seriesType: 'all',
            selectedDay: getCurrentDay(),
            minBuyin: '',
            maxBuyin: ''
        });
    };

    // Get counts for tabs
    const getCounts = () => ({
        venues: venues.length,
        tours: tours.length,
        series: series.length,
        daily: dailyTournaments.length,
        live: liveGames.length
    });

    const counts = getCounts();

    // Loading skeleton component
    const renderSkeletons = (count = 8) => (
        <div className="card-grid">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="entity-card skeleton-card">
                    <div className="skel skel-header"></div>
                    <div className="skel skel-title"></div>
                    <div className="skel skel-text"></div>
                    <div className="skel skel-tags"></div>
                    <div className="skel skel-footer"></div>
                </div>
            ))}
        </div>
    );

    // Render content based on active tab
    const renderContent = () => {
        if (activeTab === 'map') {
            return renderMap();
        }
        if (activeTab === 'live') {
            return renderLiveGames();
        }

        if (loading) {
            return renderSkeletons(8);
        }

        switch (activeTab) {
            case 'venues':
                return renderVenues();
            case 'tours':
                return renderTours();
            case 'series':
                return renderSeries();
            case 'daily':
                return renderDailyTournaments();
            default:
                return renderVenues();
        }
    };

    const renderMap = () => {
        return (
            <VenueMap
                venues={allVenuesForMap}
                userLocation={userLocation}
            />
        );
    };

    const renderVenues = () => {
        if (venues.length === 0) {
            return (
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    <p>No venues found matching your criteria</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try a different city, adjust filters, or use GPS</p>
                    <button onClick={clearFilters}>Clear All Filters</button>
                </div>
            );
        }

        const sorted = getSortedVenues(venues);
        const displayed = sorted.slice(0, displayCount.venues);

        return (
            <>
                {/* Sort & Results Bar */}
                <div className="results-bar">
                    <span className="results-count">Showing {displayed.length} of {venues.length} venues</span>
                    <div className="sort-controls">
                        <label>Sort:</label>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sort-select">
                            <option value="default">Default</option>
                            <option value="trust-desc">Trust (High to Low)</option>
                            <option value="trust-asc">Trust (Low to High)</option>
                            {userLocation && <option value="distance">Nearest First</option>}
                            <option value="name-az">Name (A-Z)</option>
                            <option value="name-za">Name (Z-A)</option>
                        </select>
                    </div>
                </div>
                <div className="card-grid">
                    {displayed.map((venue, i) => {
                        const trust = getTrustLevel(venue.trust_score);
                        const fav = isFavorited('venue', venue.id);
                        const newcomer = isNewcomerFriendly(venue);
                        const hasPromo = promotionVenueIds.has(String(venue.id));
                        return (
                            <div key={venue.id || i} className="entity-card venue-card" onClick={() => router.push('/hub/venues/' + venue.id)} style={{ cursor: 'pointer' }}>
                                {/* Favorite heart */}
                                <button className={'fav-btn' + (fav ? ' active' : '')} onClick={(e) => toggleFavorite('venue', venue.id, e)} title={fav ? 'Remove from favorites' : 'Add to favorites'}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill={fav ? '#ef4444' : 'none'} stroke={fav ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                                    </svg>
                                </button>
                                <div className="card-header">
                                    <h4>{venue.name}</h4>
                                    <span className="badge venue-type">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</span>
                                </div>
                                <p className="card-location">
                                    {venue.address ? (venue.address + ' - ') : ''}{venue.city}, {venue.state}
                                </p>
                                {/* Badge row */}
                                <div className="badge-row">
                                    {venue.is_featured && <span className="mini-badge featured-badge">Featured</span>}
                                    {newcomer && <span className="mini-badge newcomer-badge">Newcomer Friendly</span>}
                                    {hasPromo && <span className="mini-badge promo-badge">Active Promo</span>}
                                    {venue.has_tournaments && <span className="mini-badge tourney-badge">Tournaments</span>}
                                </div>
                                {/* Hours */}
                                {venue.hours && (
                                    <p className="card-hours">{venue.hours === '24/7' ? 'Open 24/7' : venue.hours}</p>
                                )}
                                <div className="card-tags">
                                    {venue.distance_mi && <span className="tag distance">{venue.distance_mi} mi</span>}
                                    {venue.games_offered && venue.games_offered.slice(0, 4).map(g => (
                                        <span key={g} className="tag game">{g}</span>
                                    ))}
                                </div>
                                {venue.stakes_cash && venue.stakes_cash.length > 0 && (
                                    <p className="card-detail">Stakes: {venue.stakes_cash.slice(0, 3).join(', ')}</p>
                                )}
                                <div className="card-footer">
                                    <span className="trust-badge" style={{ color: trust.color }}>Trust: {trust.label} ({venue.trust_score || '-'})</span>
                                    <div className="card-actions">
                                        {venue.website && (
                                            <a href={venue.website} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Web</a>
                                        )}
                                        {venue.phone && <a href={'tel:' + venue.phone} className="action-btn" onClick={e => e.stopPropagation()}>Call</a>}
                                        <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((venue.address || '') + ' ' + venue.name + ' ' + venue.city + ' ' + venue.state)}
                                            target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Map</a>
                                    </div>
                                </div>
                                {/* Quick actions */}
                                <div className="quick-actions">
                                    <button className="quick-btn checkin-btn" onClick={e => { e.stopPropagation(); router.push('/hub/venues/' + venue.id + '?action=checkin'); }}>Check In</button>
                                    <button className="quick-btn review-btn" onClick={e => { e.stopPropagation(); router.push('/hub/venues/' + venue.id + '?action=review'); }}>Review</button>
                                    <span className="action-btn primary" style={{ flex: 1, textAlign: 'center' }}>Details</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {/* Load More */}
                {displayCount.venues < venues.length && (
                    <div className="load-more">
                        <button className="load-more-btn" onClick={() => loadMore('venues')}>
                            Load More ({venues.length - displayCount.venues} remaining)
                        </button>
                    </div>
                )}
            </>
        );
    };

    const renderTours = () => {
        if (tours.length === 0) {
            return (
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                    <p>No tours found</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try clearing filters or searching for a specific tour</p>
                    <button onClick={clearFilters}>Clear Filters</button>
                </div>
            );
        }

        return (
            <>
                <div className="results-bar">
                    <span className="results-count">Showing {Math.min(displayCount.tours, tours.length)} of {tours.length} tours</span>
                </div>
                <div className="card-grid tours-grid">
                    {tours.slice(0, displayCount.tours).map((tour, i) => {
                        const fav = isFavorited('tour', tour.tour_code);
                        return (
                            <div key={tour.tour_code || i} className="entity-card tour-card" onClick={() => router.push('/hub/tours/' + tour.tour_code)} style={{ cursor: 'pointer' }}>
                                <button className={'fav-btn' + (fav ? ' active' : '')} onClick={(e) => toggleFavorite('tour', tour.tour_code, e)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? '#ef4444' : 'none'} stroke={fav ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                                    </svg>
                                </button>
                                <div className="card-header">
                                    <TourBadge tourCode={tour.tour_code} />
                                    <span className="badge tour-type">{TOUR_TYPE_LABELS[tour.tour_type] || tour.tour_type}</span>
                                </div>
                                <h4 className="tour-name">{tour.tour_name}</h4>
                                <p className="card-location">{tour.headquarters}</p>
                                {tour.typical_buyins && (
                                    <p className="card-detail">
                                        Buy-ins: {formatMoney(tour.typical_buyins.min)} - {formatMoney(tour.typical_buyins.max)}
                                    </p>
                                )}
                                {tour.regions && tour.regions.length > 0 && (
                                    <div className="card-tags">
                                        {tour.regions.map(r => <span key={r} className="tag region">{r}</span>)}
                                    </div>
                                )}
                                {tour.upcoming_series && tour.upcoming_series.length > 0 && (
                                    <div className="upcoming-series">
                                        <span className="upcoming-label">Next: {tour.upcoming_series[0].short_name || tour.upcoming_series[0].name}</span>
                                        <span className="upcoming-date">{formatDate(tour.upcoming_series[0].start_date)}</span>
                                    </div>
                                )}
                                <div className="card-footer">
                                    <span className="established">Est. {tour.established}</span>
                                    <div className="card-actions">
                                        <span className="action-btn primary">Details</span>
                                        {tour.official_website && (
                                            <a href={tour.official_website} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Website</a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {displayCount.tours < tours.length && (
                    <div className="load-more">
                        <button className="load-more-btn" onClick={() => loadMore('tours')}>
                            Load More ({tours.length - displayCount.tours} remaining)
                        </button>
                    </div>
                )}
            </>
        );
    };

    const renderSeries = () => {
        if (series.length === 0) {
            return (
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <p>No tournament series found</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try expanding the timeframe or clearing filters</p>
                    <button onClick={clearFilters}>Clear Filters</button>
                </div>
            );
        }

        return (
            <>
                <div className="results-bar">
                    <span className="results-count">Showing {Math.min(displayCount.series, series.length)} of {series.length} series</span>
                    <div className="view-toggle">
                        <button className={'view-btn' + (seriesViewMode === 'grid' ? ' active' : '')} onClick={() => setSeriesViewMode('grid')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                            Grid
                        </button>
                        <button className={'view-btn' + (seriesViewMode === 'calendar' ? ' active' : '')} onClick={() => setSeriesViewMode('calendar')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Calendar
                        </button>
                    </div>
                </div>

                {seriesViewMode === 'calendar' ? renderSeriesCalendar() : (
                    <>
                        <div className="card-grid">
                            {series.slice(0, displayCount.series).map((s, i) => {
                                const fav = isFavorited('series', s.id || (i + 1));
                                return (
                                    <div key={s.id || i} className="entity-card series-card" onClick={() => router.push('/hub/series/' + (s.id || (i + 1)))} style={{ cursor: 'pointer' }}>
                                        <button className={'fav-btn' + (fav ? ' active' : '')} onClick={(e) => toggleFavorite('series', s.id || (i + 1), e)}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? '#ef4444' : 'none'} stroke={fav ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                                                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                                            </svg>
                                        </button>
                                        <div className="card-header">
                                            <TourBadge tourCode={s.tour_code || s.short_name} size="small" />
                                            <span className="badge series-type">{s.series_type}</span>
                                        </div>
                                        <h4>{s.name}</h4>
                                        <p className="card-location">{s.location || ((s.city || s.venue) + ', ' + (s.state || ''))}</p>
                                        <p className="card-dates">{formatDate(s.start_date)} - {formatDate(s.end_date)}</p>
                                        <div className="card-tags">
                                            {s.total_events && <span className="tag events">{s.total_events} Events</span>}
                                            {s.main_event_buyin && <span className="tag buyin">{formatMoney(s.main_event_buyin)} Main</span>}
                                        </div>
                                        {s.main_event_guaranteed && (
                                            <p className="card-detail guaranteed">{formatMoney(s.main_event_guaranteed)}+ GTD</p>
                                        )}
                                        <div className="card-footer">
                                            <div className="card-actions">
                                                <span className="action-btn primary">Details</span>
                                                {s.source_url && (
                                                    <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Source</a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {displayCount.series < series.length && (
                            <div className="load-more">
                                <button className="load-more-btn" onClick={() => loadMore('series')}>
                                    Load More ({series.length - displayCount.series} remaining)
                                </button>
                            </div>
                        )}
                    </>
                )}
            </>
        );
    };

    const renderDailyTournaments = () => {
        if (dailyTournaments.length === 0) {
            return (
                <div className="empty-state">
                    <p>No daily tournaments found for {filters.selectedDay}</p>
                    <button onClick={clearFilters}>Clear Filters</button>
                </div>
            );
        }

        return (
            <>
                <div className="day-selector">
                    {DAYS_OF_WEEK.map(day => (
                        <button
                            key={day}
                            className={'day-btn' + (filters.selectedDay === day ? ' active' : '')}
                            onClick={() => {
                                setFilters({ ...filters, selectedDay: day });
                                setTimeout(() => fetchDailyTournaments(), 0);
                            }}
                        >
                            {day.slice(0, 3)}
                        </button>
                    ))}
                </div>
                <div className="card-grid daily-grid">
                    {dailyTournaments.slice(0, 50).map((t, i) => (
                        <div key={t.id || i} className="entity-card daily-card">
                            <div className="card-header">
                                <span className="time-badge">{t.start_time}</span>
                                <span className="badge game-type">{t.game_type || 'NLH'}</span>
                            </div>
                            <h4>{t.venue_name}</h4>
                            <p className="card-location">{t.city}, {t.state}</p>
                            <div className="card-tags">
                                <span className="tag buyin">${t.buy_in}</span>
                                {t.guaranteed && <span className="tag gtd">{formatMoney(t.guaranteed)} GTD</span>}
                                {t.format && <span className="tag format">{t.format}</span>}
                            </div>
                            {t.tournament_name && (
                                <p className="card-detail">{t.tournament_name}</p>
                            )}
                            <div className="card-footer">
                                <span className="venue-type">{t.venueType}</span>
                                {t.pokerAtlasUrl && (
                                    <a href={t.pokerAtlasUrl} target="_blank" rel="noopener noreferrer" className="action-btn primary">
                                        Info
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </>
        );
    };

    // --- NEW: Live Games Renderer ---
    const renderLiveGames = () => {
        if (liveLoading && liveGames.length === 0) {
            return renderSkeletons(6);
        }

        if (liveGames.length === 0) {
            return (
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
                    </svg>
                    <p>No live games reported right now</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Be the first to report a game at your venue!</p>
                    <p style={{ fontSize: 11, opacity: 0.3, marginTop: 8 }}>Auto-refreshes every 2 minutes</p>
                </div>
            );
        }

        // Group by venue
        const byVenue = {};
        liveGames.forEach(g => {
            const key = g.venue_id || 'unknown';
            if (!byVenue[key]) byVenue[key] = { venue_id: g.venue_id, venue_name: g.venue_name || 'Unknown Venue', games: [] };
            byVenue[key].games.push(g);
        });

        const venueGroups = Object.values(byVenue);

        return (
            <>
                <div className="results-bar">
                    <span className="results-count">
                        {liveGames.length} live game{liveGames.length !== 1 ? 's' : ''} at {venueGroups.length} venue{venueGroups.length !== 1 ? 's' : ''}
                    </span>
                    <div className="live-refresh">
                        <span className="live-dot"></span>
                        <span>Auto-refreshes every 2 min</span>
                        <button className="refresh-btn" onClick={fetchLiveGames} disabled={liveLoading}>
                            {liveLoading ? 'Refreshing...' : 'Refresh Now'}
                        </button>
                    </div>
                </div>
                <div className="card-grid">
                    {venueGroups.slice(0, displayCount.live).map((group, i) => (
                        <div key={group.venue_id || i} className="entity-card live-card"
                            onClick={() => group.venue_id ? router.push('/hub/venues/' + group.venue_id) : null}
                            style={{ cursor: group.venue_id ? 'pointer' : 'default' }}>
                            <div className="card-header">
                                <h4>{group.venue_name}</h4>
                                <span className="live-badge">LIVE</span>
                            </div>
                            <div className="live-games-list">
                                {group.games.map((game, gi) => (
                                    <div key={gi} className="live-game-row">
                                        <span className="live-game-type">{game.game_type || 'NLH'}</span>
                                        <span className="live-game-stakes">{game.stakes || '-'}</span>
                                        <span className="live-game-tables">{game.table_count || 1} table{(game.table_count || 1) !== 1 ? 's' : ''}</span>
                                        {game.wait_time !== null && game.wait_time !== undefined && (
                                            <span className="live-game-wait" style={{ color: game.wait_time <= 10 ? '#22c55e' : game.wait_time <= 30 ? '#d4a853' : '#ef4444' }}>
                                                {game.wait_time === 0 ? 'No wait' : game.wait_time + ' min wait'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {group.games[0].notes && <p className="card-detail">{group.games[0].notes}</p>}
                            <div className="card-footer">
                                <span className="live-time">Reported {group.games[0].created_at ? new Date(group.games[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'}</span>
                                {group.venue_id && <span className="action-btn primary">View Venue</span>}
                            </div>
                        </div>
                    ))}
                </div>
                {displayCount.live < venueGroups.length && (
                    <div className="load-more">
                        <button className="load-more-btn" onClick={() => loadMore('live')}>
                            Load More ({venueGroups.length - displayCount.live} remaining)
                        </button>
                    </div>
                )}
            </>
        );
    };

    // --- NEW: Series Calendar Renderer ---
    const renderSeriesCalendar = () => {
        const today = new Date();
        const months = [];
        for (let m = 0; m < 4; m++) {
            const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
            months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
        }

        return (
            <div className="calendar-view">
                {months.map((mo, mi) => {
                    const daysInMonth = new Date(mo.year, mo.month + 1, 0).getDate();
                    const firstDay = new Date(mo.year, mo.month, 1).getDay();
                    const monthSeries = series.filter(s => {
                        if (!s.start_date) return false;
                        const start = new Date(s.start_date);
                        const end = s.end_date ? new Date(s.end_date) : start;
                        const moStart = new Date(mo.year, mo.month, 1);
                        const moEnd = new Date(mo.year, mo.month + 1, 0);
                        return start <= moEnd && end >= moStart;
                    });

                    return (
                        <div key={mi} className="calendar-month">
                            <h3 className="calendar-month-title">{mo.label}</h3>
                            <div className="calendar-grid-header">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="cal-header-cell">{d}</div>
                                ))}
                            </div>
                            <div className="calendar-grid-body">
                                {Array.from({ length: firstDay }).map((_, i) => (
                                    <div key={'empty-' + i} className="cal-cell empty"></div>
                                ))}
                                {Array.from({ length: daysInMonth }).map((_, di) => {
                                    const dayNum = di + 1;
                                    const dateStr = mo.year + '-' + String(mo.month + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
                                    const dayDate = new Date(mo.year, mo.month, dayNum);
                                    const daySeries = monthSeries.filter(s => {
                                        const start = new Date(s.start_date);
                                        const end = s.end_date ? new Date(s.end_date) : start;
                                        return dayDate >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
                                               dayDate <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
                                    });
                                    const isToday = dayDate.toDateString() === today.toDateString();
                                    return (
                                        <div key={dayNum} className={'cal-cell' + (isToday ? ' today' : '') + (daySeries.length > 0 ? ' has-events' : '')}>
                                            <span className="cal-day-num">{dayNum}</span>
                                            {daySeries.slice(0, 2).map((s, si) => {
                                                const tourColor = TOUR_COLORS[s.tour_code] || TOUR_COLORS.default;
                                                return (
                                                    <div key={si} className="cal-event"
                                                        style={{ background: tourColor.border, color: tourColor.text === '#000' ? '#000' : '#fff' }}
                                                        onClick={() => router.push('/hub/series/' + (s.id || si + 1))}
                                                        title={s.name}>
                                                        {(s.tour_code || s.short_name || '').slice(0, 5)}
                                                    </div>
                                                );
                                            })}
                                            {daySeries.length > 2 && <div className="cal-more">+{daySeries.length - 2}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <>
            {/* Intro video overlay */}
            {showIntro && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <video
                        ref={introVideoRef}
                        src="/videos/poker-near-me-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                    />
                    <button
                        onClick={handleIntroEnd}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            padding: '8px 20px',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 20,
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer',
                            zIndex: 100000
                        }}
                    >
                        Skip
                    </button>
                </div>
            )}

            <Head>
                <title>Poker Near Me | Smarter.Poker</title>
                <meta name="description" content="Find poker rooms, tours, tournament series, and daily events near you." />
                {/* Leaflet CSS */}
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
                <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
                {/* Leaflet JS */}
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" defer></script>
                <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js" defer></script>
            </Head>

            <div className="pnm-page">
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} />

                {/* Page Header */}
                <div className="pnm-header">
                    <h1><span className="white">POKER</span> <span className="gold">NEAR</span> <span className="white">ME</span></h1>
                    <span className="subtitle">VENUES | TOURS | SERIES | DAILY EVENTS | LIVE GAMES | MAP</span>
                </div>

                {/* Search Section */}
                <div className="pnm-search-section">
                    <div className="search-container">
                        <form className="search-form" onSubmit={handleSearch}>
                            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                            </svg>
                            <div className="search-input-wrapper">
                                <input
                                    type="text"
                                    placeholder="Search venues, tours, series, or events..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => { if (searchHistory.length > 0) setShowSearchHistory(true); }}
                                    onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
                                />
                                {showSearchHistory && searchHistory.length > 0 && (
                                    <div className="search-history-dropdown">
                                        <div className="search-history-header">
                                            <span>Recent Searches</span>
                                            <button type="button" onClick={() => { setSearchHistory([]); localStorage.removeItem('sp-search-history'); setShowSearchHistory(false); }}>Clear</button>
                                        </div>
                                        {searchHistory.map((item, i) => (
                                            <button key={i} type="button" className="search-history-item"
                                                onClick={() => { setSearchQuery(item); setShowSearchHistory(false); setTimeout(() => fetchAllData(), 0); }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                {item}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button type="submit" className="search-btn">Search</button>
                        </form>

                        <div className="search-controls">
                            <div className="search-buttons">
                                <button className={'btn-gps' + (userLocation ? ' active' : '')} onClick={requestGpsLocation} disabled={gpsLoading}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                    </svg>
                                    {gpsLoading ? 'Locating...' : 'Use GPS'}
                                </button>
                                <button className={'btn-filters' + (showFilters ? ' active' : '')} onClick={() => setShowFilters(!showFilters)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                                        <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                                        <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                                    </svg>
                                    Filters
                                </button>
                            </div>

                            {/* Popular Cities */}
                            <div className="city-chips">
                                {POPULAR_CITIES.map(city => (
                                    <button key={city.name} className={'city-chip' + (selectedCity && selectedCity.name === city.name ? ' active' : '')}
                                        onClick={() => handleCityClick(city)}>
                                        {city.name}
                                    </button>
                                ))}
                                {selectedCity && (
                                    <button className="city-chip clear" onClick={() => setSelectedCity(null)}>Clear</button>
                                )}
                            </div>

                            {(userLocation || nearestDistance) && (
                                <div className="distance-display">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                    </svg>
                                    <span>Nearest: ~{nearestDistance || '0'} miles</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="filter-panel">
                        {activeTab === 'venues' && (
                            <>
                                <div className="filter-group">
                                    <label>Venue Type</label>
                                    <div className="filter-chips">
                                        {['all', 'casino', 'card_room', 'poker_club', 'charity'].map(type => (
                                            <button key={type} className={'chip' + (filters.venueType === type ? ' active' : '')}
                                                onClick={() => setFilters({ ...filters, venueType: type })}>
                                                {type === 'all' ? 'All' : VENUE_TYPE_LABELS[type]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="filter-group">
                                    <label>Games</label>
                                    <div className="filter-chips">
                                        <button className={'chip' + (filters.hasNLH ? ' active' : '')}
                                            onClick={() => setFilters({ ...filters, hasNLH: !filters.hasNLH })}>NLH</button>
                                        <button className={'chip' + (filters.hasPLO ? ' active' : '')}
                                            onClick={() => setFilters({ ...filters, hasPLO: !filters.hasPLO })}>PLO</button>
                                        <button className={'chip' + (filters.hasMixed ? ' active' : '')}
                                            onClick={() => setFilters({ ...filters, hasMixed: !filters.hasMixed })}>Mixed</button>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'tours' && (
                            <div className="filter-group">
                                <label>Tour Type</label>
                                <div className="filter-chips">
                                    {['all', 'major', 'circuit', 'high_roller', 'regional'].map(type => (
                                        <button key={type} className={'chip' + (filters.tourType === type ? ' active' : '')}
                                            onClick={() => setFilters({ ...filters, tourType: type })}>
                                            {type === 'all' ? 'All' : TOUR_TYPE_LABELS[type]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'series' && (
                            <>
                                <div className="filter-group">
                                    <label>Timeframe</label>
                                    <div className="filter-chips">
                                        {[30, 60, 90, 180].map(days => (
                                            <button key={days} className={'chip' + (filters.seriesTimeframe === days ? ' active' : '')}
                                                onClick={() => setFilters({ ...filters, seriesTimeframe: days })}>
                                                {days} Days
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="filter-group">
                                    <label>Series Type</label>
                                    <div className="filter-chips">
                                        {['all', 'major', 'circuit', 'regional'].map(type => (
                                            <button key={type} className={'chip' + (filters.seriesType === type ? ' active' : '')}
                                                onClick={() => setFilters({ ...filters, seriesType: type })}>
                                                {type.charAt(0).toUpperCase() + type.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'daily' && (
                            <div className="filter-group">
                                <label>Buy-in Range</label>
                                <div className="filter-inputs">
                                    <input
                                        type="number"
                                        placeholder="Min $"
                                        value={filters.minBuyin}
                                        onChange={(e) => setFilters({ ...filters, minBuyin: e.target.value })}
                                    />
                                    <span>to</span>
                                    <input
                                        type="number"
                                        placeholder="Max $"
                                        value={filters.maxBuyin}
                                        onChange={(e) => setFilters({ ...filters, maxBuyin: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        <button className="btn-apply" onClick={() => { fetchAllData(); setShowFilters(false); }}>
                            Apply Filters
                        </button>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="tab-navigation">
                    <button className={'tab' + (activeTab === 'venues' ? ' active' : '')} onClick={() => setActiveTab('venues')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                        </span>
                        Venues <span className="tab-count">{counts.venues}</span>
                    </button>
                    <button className={'tab' + (activeTab === 'tours' ? ' active' : '')} onClick={() => setActiveTab('tours')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                            </svg>
                        </span>
                        Tours <span className="tab-count">{counts.tours}</span>
                    </button>
                    <button className={'tab' + (activeTab === 'series' ? ' active' : '')} onClick={() => setActiveTab('series')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                        </span>
                        Series <span className="tab-count">{counts.series}</span>
                    </button>
                    <button className={'tab' + (activeTab === 'daily' ? ' active' : '')} onClick={() => setActiveTab('daily')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                        </span>
                        Daily <span className="tab-count">{counts.daily}</span>
                    </button>
                    <button className={'tab' + (activeTab === 'live' ? ' active' : '')} onClick={() => setActiveTab('live')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
                            </svg>
                        </span>
                        Live <span className="tab-count live-count">{counts.live}</span>
                    </button>
                    <button className={'tab' + (activeTab === 'map' ? ' active' : '')} onClick={() => setActiveTab('map')}>
                        <span className="tab-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                                <line x1="8" y1="2" x2="8" y2="18" />
                                <line x1="16" y1="6" x2="16" y2="22" />
                            </svg>
                        </span>
                        Map <span className="tab-count">{allVenuesForMap.length}</span>
                    </button>
                </div>

                {/* Main Content */}
                <main className="pnm-content">
                    {renderContent()}
                </main>

                {/* Geofence Alert Banner */}
                {geofenceAlert && (
                    <GeofenceAlertBanner
                        venue={geofenceAlert}
                        onCheckin={() => {
                            router.push('/hub/venues/' + geofenceAlert.id + '?action=checkin');
                            setGeofenceAlert(null);
                        }}
                        onReview={() => {
                            router.push('/hub/venues/' + geofenceAlert.id + '?action=review');
                            setGeofenceAlert(null);
                        }}
                        onDismiss={() => setGeofenceAlert(null)}
                    />
                )}

                <style jsx>{`
                    .pnm-page {
                        min-height: 100vh;
                        position: relative;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                        padding-bottom: 40px;
                    }

                    /* Space Background */
                    .space-bg {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.08) 0%, transparent 60%),
                            linear-gradient(180deg, #030712 0%, #0a1628 30%, #0f172a 50%, #0a1628 70%, #030712 100%);
                        z-index: -2;
                    }
                    .space-bg::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background-image:
                            radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.4), transparent),
                            radial-gradient(1px 1px at 40px 70px, rgba(255,255,255,0.3), transparent),
                            radial-gradient(1px 1px at 50px 160px, rgba(255,255,255,0.4), transparent),
                            radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.3), transparent),
                            radial-gradient(2px 2px at 160px 120px, rgba(255,255,255,0.5), transparent);
                        background-repeat: repeat;
                        background-size: 350px 200px;
                        animation: twinkle 8s ease-in-out infinite alternate;
                    }
                    @keyframes twinkle {
                        0% { opacity: 0.6; }
                        100% { opacity: 1; }
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background: linear-gradient(180deg, rgba(3,7,18,0.3) 0%, transparent 20%, transparent 80%, rgba(3,7,18,0.5) 100%);
                        z-index: -1;
                    }

                    /* Header */
                    .pnm-header {
                        padding: 24px 20px;
                        text-align: center;
                    }
                    .pnm-header h1 {
                        font-size: 32px;
                        font-weight: 700;
                        margin: 0;
                        letter-spacing: 2px;
                    }
                    .pnm-header .white { color: #fff; }
                    .pnm-header .gold { color: #d4a853; }
                    .pnm-header .subtitle {
                        display: block;
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin-top: 8px;
                        letter-spacing: 3px;
                    }

                    /* Search Section */
                    .pnm-search-section {
                        padding: 0 20px 20px;
                        max-width: 900px;
                        margin: 0 auto;
                    }
                    .search-container {
                        background: rgba(15, 23, 42, 0.6);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 16px;
                        padding: 16px;
                    }
                    .search-form {
                        position: relative;
                        display: flex;
                        gap: 10px;
                        margin-bottom: 12px;
                    }
                    .search-icon {
                        position: absolute;
                        left: 16px;
                        top: 50%;
                        transform: translateY(-50%);
                        color: rgba(255,255,255,0.4);
                    }
                    /* search-form input styles moved to .search-input-wrapper */
                    .search-btn {
                        padding: 14px 24px;
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        border-radius: 12px;
                        color: #000;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    .search-controls {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .search-buttons {
                        display: flex;
                        gap: 10px;
                    }
                    .btn-gps, .btn-filters {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px 16px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.8);
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-gps:hover, .btn-filters:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .btn-gps.active {
                        background: rgba(34,197,94,0.2);
                        border-color: rgba(34,197,94,0.5);
                        color: #22c55e;
                    }
                    .btn-filters.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }

                    .city-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .city-chip {
                        padding: 8px 14px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .city-chip:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .city-chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .city-chip.clear {
                        background: rgba(239,68,68,0.2);
                        border-color: rgba(239,68,68,0.4);
                        color: #ef4444;
                    }

                    .distance-display {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 8px 12px;
                        background: rgba(34,197,94,0.1);
                        border-radius: 8px;
                        color: #4ade80;
                        font-size: 13px;
                    }

                    /* Filter Panel */
                    .filter-panel {
                        max-width: 900px;
                        margin: 0 auto 20px;
                        padding: 16px;
                        background: rgba(15, 23, 42, 0.8);
                        backdrop-filter: blur(12px);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        margin-left: 20px;
                        margin-right: 20px;
                    }
                    .filter-group {
                        margin-bottom: 16px;
                    }
                    .filter-group label {
                        display: block;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .filter-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .chip {
                        padding: 8px 14px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        cursor: pointer;
                    }
                    .chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .filter-inputs {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }
                    .filter-inputs input {
                        width: 100px;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 14px;
                    }
                    .filter-inputs span {
                        color: rgba(255,255,255,0.5);
                    }
                    .btn-apply {
                        width: 100%;
                        padding: 12px;
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        border-radius: 10px;
                        color: #000;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    /* Tab Navigation */
                    .tab-navigation {
                        display: flex;
                        justify-content: center;
                        gap: 8px;
                        padding: 0 20px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }
                    .tab {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 20px;
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 10px;
                        color: rgba(255,255,255,0.7);
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .tab:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .tab.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .tab-icon {
                        display: flex;
                        align-items: center;
                    }
                    .tab-count {
                        background: rgba(255,255,255,0.1);
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-size: 12px;
                    }
                    .tab.active .tab-count {
                        background: rgba(212,168,83,0.3);
                    }

                    /* Main Content */
                    .pnm-content {
                        padding: 0 20px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }

                    /* Loading / Empty State */
                    .loading-state, .empty-state {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 80px 20px;
                        color: rgba(255,255,255,0.5);
                    }
                    .spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(255,255,255,0.1);
                        border-top-color: #d4a853;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 16px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .empty-state button {
                        margin-top: 16px;
                        padding: 12px 24px;
                        background: rgba(212,168,83,0.2);
                        border: 1px solid rgba(212,168,83,0.4);
                        border-radius: 8px;
                        color: #d4a853;
                        cursor: pointer;
                    }

                    /* Card Grid */
                    .card-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }
                    @media (min-width: 640px) {
                        .card-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                    @media (min-width: 1024px) {
                        .card-grid {
                            grid-template-columns: repeat(3, 1fr);
                        }
                    }
                    @media (min-width: 1280px) {
                        .card-grid {
                            grid-template-columns: repeat(4, 1fr);
                        }
                    }

                    /* Entity Cards */
                    .entity-card {
                        background: rgba(15, 23, 42, 0.5);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        padding: 16px;
                        transition: all 0.2s;
                    }
                    .entity-card:hover {
                        border-color: rgba(255,255,255,0.2);
                        background: rgba(15, 23, 42, 0.7);
                    }
                    .card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 10px;
                    }
                    .entity-card h4 {
                        font-size: 16px;
                        font-weight: 600;
                        margin: 0 0 4px;
                        color: #fff;
                    }
                    .card-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                        margin: 0 0 10px;
                    }
                    .card-dates {
                        font-size: 12px;
                        color: rgba(255,255,255,0.6);
                        margin: 0 0 10px;
                    }
                    .card-detail {
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        margin: 8px 0;
                    }
                    .card-detail.guaranteed {
                        color: #4ade80;
                        font-weight: 600;
                    }

                    /* Badges */
                    .badge {
                        padding: 4px 10px;
                        border-radius: 6px;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                    }
                    .badge.venue-type {
                        background: rgba(59,130,246,0.2);
                        color: #60a5fa;
                    }
                    .badge.tour-type {
                        background: rgba(139,92,246,0.2);
                        color: #a78bfa;
                    }
                    .badge.series-type {
                        background: rgba(34,197,94,0.2);
                        color: #4ade80;
                    }
                    .badge.game-type {
                        background: rgba(212,168,83,0.2);
                        color: #d4a853;
                    }

                    /* Tags */
                    .card-tags {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-bottom: 10px;
                    }
                    .tag {
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        background: rgba(255,255,255,0.08);
                        color: rgba(255,255,255,0.7);
                    }
                    .tag.distance {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                    }
                    .tag.game {
                        background: rgba(255,255,255,0.08);
                    }
                    .tag.region {
                        background: rgba(59,130,246,0.15);
                        color: #60a5fa;
                    }
                    .tag.events {
                        background: rgba(139,92,246,0.15);
                        color: #a78bfa;
                    }
                    .tag.buyin {
                        background: rgba(212,168,83,0.15);
                        color: #d4a853;
                    }
                    .tag.gtd {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                    }
                    .tag.format {
                        background: rgba(239,68,68,0.15);
                        color: #f87171;
                    }

                    /* Card Footer */
                    .card-footer {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding-top: 12px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        margin-top: 12px;
                    }
                    .trust-badge {
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .established {
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .venue-type {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                    }
                    .card-actions {
                        display: flex;
                        gap: 8px;
                    }
                    .action-btn {
                        padding: 6px 12px;
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.7);
                        text-decoration: none;
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        transition: all 0.2s;
                    }
                    .action-btn:hover {
                        background: rgba(255,255,255,0.05);
                    }
                    .action-btn.primary {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                    }

                    /* Tour-specific */
                    .tour-name {
                        margin-top: 10px;
                    }
                    .upcoming-series {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 10px;
                        background: rgba(255,255,255,0.05);
                        border-radius: 6px;
                        margin-top: 10px;
                    }
                    .upcoming-label {
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                    }
                    .upcoming-date {
                        font-size: 12px;
                        color: #d4a853;
                    }

                    /* Daily tournaments */
                    .day-selector {
                        display: flex;
                        justify-content: center;
                        gap: 6px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }
                    .day-btn {
                        padding: 10px 16px;
                        background: rgba(15, 23, 42, 0.6);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                    }
                    .day-btn.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .time-badge {
                        padding: 4px 10px;
                        background: rgba(59,130,246,0.2);
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        color: #60a5fa;
                    }

                    /* --- NEW STYLES --- */

                    /* Favorite Button */
                    .fav-btn {
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: rgba(0,0,0,0.4);
                        border: none;
                        border-radius: 50%;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        z-index: 2;
                        transition: all 0.2s;
                    }
                    .fav-btn:hover {
                        background: rgba(239,68,68,0.3);
                        transform: scale(1.1);
                    }
                    .fav-btn.active {
                        background: rgba(239,68,68,0.2);
                    }
                    .entity-card {
                        position: relative;
                    }

                    /* Results Bar */
                    .results-bar {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px 4px;
                        margin-bottom: 12px;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                    .results-count {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                    }
                    .sort-controls {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .sort-controls label {
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .sort-select {
                        padding: 6px 12px;
                        background: rgba(15,23,42,0.8);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 13px;
                        cursor: pointer;
                    }

                    /* Badge Row */
                    .badge-row {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-bottom: 8px;
                    }
                    .mini-badge {
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                    }
                    .featured-badge {
                        background: rgba(212,168,83,0.2);
                        color: #d4a853;
                        border: 1px solid rgba(212,168,83,0.3);
                    }
                    .newcomer-badge {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                        border: 1px solid rgba(34,197,94,0.25);
                    }
                    .promo-badge {
                        background: rgba(139,92,246,0.15);
                        color: #a78bfa;
                        border: 1px solid rgba(139,92,246,0.25);
                    }
                    .tourney-badge {
                        background: rgba(239,68,68,0.12);
                        color: #f87171;
                        border: 1px solid rgba(239,68,68,0.2);
                    }

                    /* Card Hours */
                    .card-hours {
                        font-size: 12px;
                        color: rgba(255,255,255,0.5);
                        margin: 0 0 8px;
                        font-style: italic;
                    }

                    /* Quick Actions */
                    .quick-actions {
                        display: flex;
                        gap: 6px;
                        padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        margin-top: 8px;
                    }
                    .quick-btn {
                        flex: 1;
                        padding: 7px 10px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        border: none;
                        transition: all 0.2s;
                    }
                    .checkin-btn {
                        background: rgba(34,197,94,0.15);
                        color: #4ade80;
                        border: 1px solid rgba(34,197,94,0.3);
                    }
                    .checkin-btn:hover { background: rgba(34,197,94,0.25); }
                    .review-btn {
                        background: rgba(59,130,246,0.15);
                        color: #60a5fa;
                        border: 1px solid rgba(59,130,246,0.3);
                    }
                    .review-btn:hover { background: rgba(59,130,246,0.25); }

                    /* Load More */
                    .load-more {
                        display: flex;
                        justify-content: center;
                        padding: 24px 0;
                    }
                    .load-more-btn {
                        padding: 12px 32px;
                        background: rgba(212,168,83,0.15);
                        border: 1px solid rgba(212,168,83,0.3);
                        border-radius: 10px;
                        color: #d4a853;
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .load-more-btn:hover {
                        background: rgba(212,168,83,0.25);
                    }

                    /* Live Games */
                    .live-badge {
                        padding: 3px 10px;
                        border-radius: 6px;
                        font-size: 11px;
                        font-weight: 700;
                        background: rgba(239,68,68,0.2);
                        color: #f87171;
                        border: 1px solid rgba(239,68,68,0.4);
                        animation: livePulse 2s ease-in-out infinite;
                    }
                    @keyframes livePulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.6; }
                    }
                    .live-games-list {
                        display: flex;
                        flex-direction: column;
                        gap: 6px;
                        margin: 8px 0;
                    }
                    .live-game-row {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 6px 8px;
                        background: rgba(255,255,255,0.04);
                        border-radius: 6px;
                        font-size: 13px;
                    }
                    .live-game-type {
                        font-weight: 600;
                        color: #d4a853;
                        min-width: 40px;
                    }
                    .live-game-stakes {
                        color: #fff;
                        font-weight: 500;
                    }
                    .live-game-tables {
                        color: rgba(255,255,255,0.5);
                        font-size: 12px;
                    }
                    .live-game-wait {
                        margin-left: auto;
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .live-time {
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                    }
                    .live-refresh {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .live-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: #ef4444;
                        animation: livePulse 2s ease-in-out infinite;
                    }
                    .refresh-btn {
                        padding: 4px 12px;
                        background: rgba(255,255,255,0.1);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        color: rgba(255,255,255,0.7);
                        font-size: 12px;
                        cursor: pointer;
                    }
                    .refresh-btn:hover { background: rgba(255,255,255,0.15); }
                    .live-count {
                        background: rgba(239,68,68,0.3) !important;
                    }

                    /* View Toggle */
                    .view-toggle {
                        display: flex;
                        gap: 4px;
                    }
                    .view-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 6px 14px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.5);
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .view-btn.active {
                        background: rgba(212,168,83,0.15);
                        border-color: rgba(212,168,83,0.3);
                        color: #d4a853;
                    }

                    /* Calendar View */
                    .calendar-view {
                        display: grid;
                        gap: 24px;
                    }
                    .calendar-month {
                        background: rgba(15,23,42,0.5);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        padding: 16px;
                    }
                    .calendar-month-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #d4a853;
                        margin: 0 0 12px;
                        text-align: center;
                    }
                    .calendar-grid-header {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 2px;
                        margin-bottom: 4px;
                    }
                    .cal-header-cell {
                        text-align: center;
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                        padding: 6px 0;
                        font-weight: 600;
                    }
                    .calendar-grid-body {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 2px;
                    }
                    .cal-cell {
                        min-height: 60px;
                        padding: 4px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 6px;
                        border: 1px solid rgba(255,255,255,0.05);
                    }
                    .cal-cell.empty {
                        background: transparent;
                        border: none;
                    }
                    .cal-cell.today {
                        border-color: rgba(212,168,83,0.4);
                        background: rgba(212,168,83,0.08);
                    }
                    .cal-cell.has-events {
                        background: rgba(59,130,246,0.06);
                    }
                    .cal-day-num {
                        display: block;
                        font-size: 11px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 2px;
                    }
                    .cal-cell.today .cal-day-num {
                        color: #d4a853;
                        font-weight: 700;
                    }
                    .cal-event {
                        padding: 1px 4px;
                        border-radius: 3px;
                        font-size: 9px;
                        font-weight: 700;
                        margin-bottom: 1px;
                        cursor: pointer;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .cal-event:hover {
                        opacity: 0.8;
                    }
                    .cal-more {
                        font-size: 9px;
                        color: rgba(255,255,255,0.4);
                        text-align: center;
                    }

                    /* Search History Dropdown */
                    .search-input-wrapper {
                        flex: 1;
                        position: relative;
                    }
                    .search-input-wrapper input {
                        width: 100%;
                        padding: 14px 16px 14px 48px;
                        background: rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 12px;
                        color: #fff;
                        font-size: 15px;
                        outline: none;
                    }
                    .search-input-wrapper input:focus {
                        border-color: rgba(212,168,83,0.5);
                    }
                    .search-input-wrapper input::placeholder { color: rgba(255,255,255,0.4); }
                    .search-history-dropdown {
                        position: absolute;
                        top: calc(100% + 4px);
                        left: 0;
                        right: 0;
                        background: rgba(15,23,42,0.98);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 10px;
                        overflow: hidden;
                        z-index: 50;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    }
                    .search-history-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 12px;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                    }
                    .search-history-header button {
                        background: none;
                        border: none;
                        color: #d4a853;
                        font-size: 11px;
                        cursor: pointer;
                    }
                    .search-history-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        width: 100%;
                        padding: 10px 12px;
                        background: transparent;
                        border: none;
                        color: rgba(255,255,255,0.7);
                        font-size: 14px;
                        text-align: left;
                        cursor: pointer;
                    }
                    .search-history-item:hover {
                        background: rgba(255,255,255,0.05);
                    }

                    /* Loading Skeletons */
                    .skeleton-card {
                        min-height: 180px;
                    }
                    .skel {
                        border-radius: 6px;
                        background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
                        background-size: 200% 100%;
                        animation: shimmer 1.5s ease-in-out infinite;
                    }
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                    .skel-header {
                        height: 20px;
                        width: 60%;
                        margin-bottom: 12px;
                    }
                    .skel-title {
                        height: 16px;
                        width: 80%;
                        margin-bottom: 10px;
                    }
                    .skel-text {
                        height: 12px;
                        width: 50%;
                        margin-bottom: 10px;
                    }
                    .skel-tags {
                        height: 24px;
                        width: 70%;
                        margin-bottom: 12px;
                    }
                    .skel-footer {
                        height: 32px;
                        width: 100%;
                    }

                    /* Mobile Filter Drawer */
                    @media (max-width: 768px) {
                        .filter-panel {
                            position: fixed !important;
                            bottom: 0 !important;
                            left: 0 !important;
                            right: 0 !important;
                            top: auto !important;
                            margin: 0 !important;
                            border-radius: 16px 16px 0 0 !important;
                            max-height: 70vh;
                            overflow-y: auto;
                            z-index: 1000;
                            box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
                            padding: 20px 16px !important;
                        }
                        .filter-panel::before {
                            content: '';
                            display: block;
                            width: 40px;
                            height: 4px;
                            background: rgba(255,255,255,0.2);
                            border-radius: 2px;
                            margin: 0 auto 16px;
                        }
                    }

                    /* Mobile */
                    @media (max-width: 640px) {
                        .pnm-header h1 {
                            font-size: 24px;
                        }
                        .search-form {
                            flex-direction: column;
                        }
                        .search-btn {
                            width: 100%;
                        }
                        .tab {
                            padding: 10px 14px;
                            font-size: 12px;
                        }
                        .tab-icon {
                            display: none;
                        }
                        .results-bar {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 6px;
                        }
                        .quick-actions {
                            flex-wrap: wrap;
                        }
                        .cal-cell {
                            min-height: 45px;
                            padding: 2px;
                        }
                        .cal-event {
                            font-size: 7px;
                        }
                        .calendar-month {
                            padding: 10px;
                        }
                    }
                `}</style>

                {/* Global styles for Leaflet overrides and user pulse animation */}
                <style jsx global>{`
                    @keyframes userPulse {
                        0% { transform: scale(1); opacity: 0.6; }
                        50% { transform: scale(2.2); opacity: 0; }
                        100% { transform: scale(1); opacity: 0; }
                    }
                    /* Override Leaflet default cluster styles to match dark theme */
                    .marker-cluster-small,
                    .marker-cluster-medium,
                    .marker-cluster-large {
                        background: transparent !important;
                    }
                    .marker-cluster-small div,
                    .marker-cluster-medium div,
                    .marker-cluster-large div {
                        background: transparent !important;
                    }
                    .venue-popup .leaflet-popup-content-wrapper {
                        border-radius: 10px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    }
                    .venue-popup .leaflet-popup-tip {
                        box-shadow: none;
                    }
                    .leaflet-container {
                        background: #0f172a !important;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }
                `}</style>
            </div>
        </>
    );
}
