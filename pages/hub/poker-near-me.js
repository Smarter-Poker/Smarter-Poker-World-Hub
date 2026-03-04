/**
 *  POKER NEAR ME - Live Venue Finder
 * Find poker rooms, casinos, and tournaments near you
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { supabase } from '../../src/lib/supabase';
import { useAvatar } from '../../src/contexts/AvatarContext';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getPokerNearMePreferences, updatePokerNearMePreferences } from '../../src/services/pokerNearMePreferences';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory as getSearchHistoryFromDb, clearSearchHistory as clearSearchHistoryFromDb } from '../../src/services/pokerNearMeSearchHistory';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import FeatureGate from '../../src/components/gates/FeatureGate';
const VenueCard = dynamic(() => import('../../src/components/poker-near-me/VenueCard'), { ssr: false });
const TourCard = dynamic(() => import('../../src/components/poker-near-me/TourCard'), { ssr: false });
const SeriesCard = dynamic(() => import('../../src/components/poker-near-me/SeriesCard'), { ssr: false });

// Page configuration constants
const PAGE_SIZE = 24;
const PAGE_SIZE_DAILY = 30;
const PAGE_SIZE_LIVE = 30;
const LIVE_REFRESH_MS = 120000; // 2 minutes
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_HISTORY_MAX = 8;
const GPS_SEARCH_RADIUS_KM = 500;
const GEOFENCE_ALERT_TIMEOUT_MS = 30000;
const TOTAL_VENUES = 483;

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
        }, GEOFENCE_ALERT_TIMEOUT_MS);
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

    // Dynamically load Leaflet scripts to ensure proper order
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Check if already loaded
        if (window.L && window.L.MarkerClusterGroup) {
            setMapReady(true);
            return;
        }

        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                // Check if script already exists
                const existing = document.querySelector(`script[src="${src}"]`);
                if (existing) {
                    existing.addEventListener('load', resolve);
                    if (existing.dataset.loaded === 'true') resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = src;
                script.async = false;
                script.onload = () => {
                    script.dataset.loaded = 'true';
                    resolve();
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        };

        const loadLeaflet = async () => {
            try {
                // Load Leaflet first
                await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');

                // Wait a tick for Leaflet to initialize
                await new Promise(r => setTimeout(r, 100));

                // Then load MarkerCluster
                await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js');

                // Wait for MarkerClusterGroup to be available (PascalCase)
                const checkReady = () => {
                    if (window.L && window.L.MarkerClusterGroup) {
                        setMapReady(true);
                    } else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            } catch (err) {
                console.error('Failed to load Leaflet scripts:', err);
            }
        };

        loadLeaflet();
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

        const validVenues = (venues || []).filter(function (v) { return v.latitude && v.longitude; });

        validVenues.forEach(function (venue) {
            const trust = getTrustLevel(venue.trust_score);
            const typeBadge = VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type || '';

            const detailPath = venue.is_social_page
                ? '/club/' + venue.social_page_id
                : '/hub/venues/' + venue.id;

            const popupHtml = '<div style="font-family:Inter,-apple-system,sans-serif;min-width:200px;max-width:280px;">' +
                '<div style="font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:4px;">' + (venue.name || '') + '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
                '<span style="padding:2px 8px;border-radius:4px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:600;">' + typeBadge + '</span>' +
                '<span style="font-size:12px;color:#666;">' + (venue.city || '') + ', ' + (venue.state || '') + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:' + trust.color + ';font-weight:600;margin-bottom:8px;">Trust: ' + trust.label + ' (' + (venue.trust_score || '-') + '/5)</div>' +
                '<div style="display:flex;gap:6px;">' +
                '<a href="' + detailPath + '" style="padding:6px 12px;border-radius:6px;background:#d4a853;color:#000;text-decoration:none;font-size:12px;font-weight:600;">View Details</a>' +
                '<a href="' + detailPath + '?action=checkin" style="padding:6px 12px;border-radius:6px;background:#1e40af;color:#fff;text-decoration:none;font-size:12px;font-weight:600;">Check In</a>' +
                '<a href="' + detailPath + '?action=review" style="padding:6px 12px;border-radius:6px;background:#374151;color:#fff;text-decoration:none;font-size:12px;font-weight:600;">Review</a>' +
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
                clusterGroup.eachLayer(function (marker) {
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
                    height: 'calc(100vh - 280px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 12,
                    color: 'rgba(255,255,255,0.5)',
                }}>
                    <div style={{
                        width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: '#d4a853', borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <span>Loading Map...</span>
                </div>
            )}
            <div
                ref={mapContainerRef}
                style={{
                    height: 'calc(100vh - 280px)',
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


export default function PokerNearMePage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;

    // Active tab state
    const [activeTab, setActiveTab] = useState('venues');

    // Handle query parameters for deep linking
    useEffect(() => {
        if (router.query.tab) {
            setActiveTab(router.query.tab);
        }
        if (router.query.filter) {
            setFilters(prev => ({ ...prev, venueType: router.query.filter }));
        }
    }, [router.query]);

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
    const [hasSearched, setHasSearched] = useState(false);

    // Geofence alert state
    const [geofenceAlert, setGeofenceAlert] = useState(null);
    const geofenceRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        geofenceAlerts: true,
        locationEnabled: true,
        showNewcomerFriendly: true
    });

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
    const [displayCount, setDisplayCount] = useState({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
    const [searchHistory, setSearchHistory] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return JSON.parse(localStorage.getItem('sp-search-history') || '[]'); } catch { return []; }
        }
        return [];
    });
    const [showSearchHistory, setShowSearchHistory] = useState(false);
    const searchDebounceRef = useRef(null);
    const [promotionVenueIds, setPromotionVenueIds] = useState(new Set());
    const [seriesViewMode, setSeriesViewMode] = useState('grid'); // 'grid' or 'calendar'

    // Map view filters (for enhanced map-first experience)
    const [mapFilters, setMapFilters] = useState({
        cashGames: false,
        tournaments: false,
        openNow: false,
        lowStakes: false,
        topRated: false
    });

    // Sidebar filters (for right panel)
    const [sidebarFilters, setSidebarFilters] = useState({
        gameType: 'all',
        stakes: 'all',
        minBuyin: '',
        maxBuyin: '',
        hasFood: false,
        hasHotel: false,
        hasParking: false,
        is24Hours: false
    });

    // Selected room for detail panel
    const [selectedRoom, setSelectedRoom] = useState(null);

    // Load all venues for the map (from static JSON) on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        fetch('/data/all-venues.json')
            .then(function (r) { return r.json(); })
            .then(function (json) {
                var v = json.venues || json.data || json || [];
                setAllVenuesForMap(Array.isArray(v) ? v : []);
            })
            .catch(function () { setAllVenuesForMap([]); });
    }, []);

    // Fetch non-venue data on mount (tours, series, daily tournaments)
    useEffect(() => {
        fetchAllData();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // When city or GPS location is set, search for venues
    useEffect(() => {
        if (selectedCity || userLocation) {
            setHasSearched(true);
            fetchVenues();
        }
    }, [selectedCity, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------- Geofence monitoring ----------
    const [geofenceStatus, setGeofenceStatus] = useState(null); // 'active' | 'denied' | 'error'

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!userLocation) return;
        if (allVenuesForMap.length === 0) return;

        var gfService = null;

        // Dynamic import to keep SSR safe
        import('../../src/lib/geofence').then(function (mod) {
            var GeofenceService = mod.default;
            gfService = new GeofenceService();

            // Also try requesting push permission
            import('../../src/lib/pushAlerts').then(function (pushMod) {
                pushMod.requestPermission().then(function (permission) {
                    if (permission === 'denied') {
                        setGeofenceStatus('denied');
                    }
                }).catch(function () {
                    setGeofenceStatus('denied');
                });

                gfService.start(allVenuesForMap, function (venue) {
                    // Try browser notification first
                    pushMod.showVenueAlert(venue, 'checkin');
                    // Also show in-app banner
                    setGeofenceAlert(venue);
                });

                setGeofenceStatus('active');
            }).catch(function () {
                // Fallback: just in-app alerts (push not available)
                gfService.start(allVenuesForMap, function (venue) {
                    setGeofenceAlert(venue);
                });
                setGeofenceStatus('active');
            });

            geofenceRef.current = gfService;
        }).catch(function (err) {
            console.warn('[PokerNearMe] Could not load GeofenceService:', err);
            setGeofenceStatus('error');
        });

        return function () {
            if (geofenceRef.current) {
                geofenceRef.current.stop();
                geofenceRef.current = null;
            }
        };
    }, [userLocation, allVenuesForMap]);

    // --- Merge geocoded social pages into geofence feed ---
    useEffect(() => {
        if (!venues || venues.length === 0) return;
        const socialWithCoords = venues.filter(v =>
            v.is_social_page && v.latitude && v.longitude
        );
        if (socialWithCoords.length === 0) return;

        setAllVenuesForMap(prev => {
            // Remove any previously merged social pages, then add fresh ones
            const withoutSocial = prev.filter(v => !String(v.id).startsWith('sp-'));
            return [...withoutSocial, ...socialWithCoords];
        });
    }, [venues]);

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
            .catch(() => { });
    }, []);

    // --- NEW: Auto-refresh live games when on live tab ---
    useEffect(() => {
        if (activeTab === 'live') {
            fetchLiveGames();
            liveRefreshRef.current = setInterval(fetchLiveGames, LIVE_REFRESH_MS);
        }
        return () => { if (liveRefreshRef.current) clearInterval(liveRefreshRef.current); };
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- NEW: Helper functions ---
    const toggleFavorite = useCallback(async (type, id, e, itemData = {}) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        const key = type + '-' + id;
        const isCurrentlyFavorited = favorites[key];

        // Update local state immediately
        setFavorites(prev => {
            const next = { ...prev };
            if (next[key]) { delete next[key]; } else { next[key] = Date.now(); }
            return next;
        });

        // Sync venue favorites to Supabase
        if (type === 'venue' && userId) {
            try {
                if (isCurrentlyFavorited) {
                    await removeVenueFavorite(userId, id);
                } else {
                    await addVenueFavorite(userId, id, {
                        name: itemData.name,
                        address: itemData.address,
                        city: itemData.city,
                        state: itemData.state
                    });
                }
            } catch (err) {
                console.error('Error syncing favorite:', err);
            }
        }
    }, [favorites, userId]);

    const isFavorited = (type, id) => !!favorites[type + '-' + id];

    const addToSearchHistory = (query) => {
        if (!query || !query.trim()) return;
        const trimmed = query.trim();
        setSearchHistory(prev => {
            const filtered = prev.filter(s => s !== trimmed);
            const next = [trimmed, ...filtered].slice(0, SEARCH_HISTORY_MAX);
            localStorage.setItem('sp-search-history', JSON.stringify(next));
            return next;
        });
        // Async sync to Supabase if logged in
        if (userId) {
            addSearchHistoryToDb(userId, query.trim(), {
                location: selectedCity ? selectedCity.name : null,
                filters: filters
            }).catch(() => { /* localStorage is the primary store */ });
        }
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
        setDisplayCount(prev => ({ ...prev, [tab]: prev[tab] + PAGE_SIZE }));
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

    // Load preferences, venue favorites, and search history from Supabase on mount
    useEffect(() => {
        if (userId) {
            getPokerNearMePreferences(userId).then(setPreferences);

            // Load venue favorites from Supabase
            getVenueFavorites(userId).then(data => {
                const favMap = {};
                data.forEach(f => { favMap['venue-' + f.venue_id] = Date.now(); });
                setFavorites(prev => ({ ...prev, ...favMap }));
            }).catch(err => console.error('Error loading venue favorites:', err));

            // Merge search history from Supabase with localStorage
            getSearchHistoryFromDb(userId, SEARCH_HISTORY_MAX).then(dbHistory => {
                if (dbHistory && dbHistory.length > 0) {
                    setSearchHistory(prev => {
                        const merged = [...new Set([...prev, ...dbHistory.map(h => h.search_query)])].slice(0, SEARCH_HISTORY_MAX);
                        localStorage.setItem('sp-search-history', JSON.stringify(merged));
                        return merged;
                    });
                }
            }).catch(() => { /* localStorage is the primary store */ });
        }
    }, [userId]);

    // Hamburger menu handlers - save to Supabase
    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updatePokerNearMePreferences(userId, { [key]: value });
            } catch (error) {
                console.error('Failed to save preference:', error);
            }
        }
    }, [preferences]);

    const menuConfig = getMenuConfig('poker-near-me', null, preferences, {
        setGeofenceAlerts: (val) => updatePreference('geofenceAlerts', val),
        setLocationEnabled: (val) => updatePreference('locationEnabled', val),
        setShowNewcomerFriendly: (val) => updatePreference('showNewcomerFriendly', val)
    });

    const fetchAllData = async ({ includeVenues = false } = {}) => {
        setLoading(true);
        const fetches = [fetchTours(), fetchSeries(), fetchDailyTournaments()];
        if (includeVenues) {
            fetches.push(fetchVenues());
        }
        await Promise.all(fetches);
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
                params.set('radius', String(GPS_SEARCH_RADIUS_KM));
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
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        addToSearchHistory(searchQuery);
        setShowSearchHistory(false);
        setHasSearched(true);
        fetchAllData({ includeVenues: true });
    };

    const handleSearchInputChange = (e) => {
        const value = e.target.value;
        setSearchQuery(value);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (value.trim().length >= 3) {
            searchDebounceRef.current = setTimeout(() => {
                setHasSearched(true);
                fetchAllData({ includeVenues: true });
            }, SEARCH_DEBOUNCE_MS);
        }
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
    };

    const clearFilters = () => {
        setSelectedCity(null);
        setUserLocation(null);
        setSearchQuery('');
        setHasSearched(false);
        setVenues([]);
        setDisplayCount(prev => ({ ...prev, venues: PAGE_SIZE }));
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

        // For venues tab: show search landing if no search yet, skip skeleton
        if (activeTab === 'venues' && !hasSearched) {
            return renderVenues();
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
        // Filter venues based on map filters
        let filteredVenues = allVenuesForMap;
        if (mapFilters.cashGames) {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
        }
        if (mapFilters.tournaments) {
            filteredVenues = filteredVenues.filter(v => v.has_tournaments);
        }
        if (mapFilters.lowStakes) {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => {
                const match = s.match(/\$?(\d+)/);
                return match && parseInt(match[1]) <= 2;
            }));
        }
        if (mapFilters.topRated) {
            filteredVenues = filteredVenues.filter(v => (v.trust_score || 0) >= 4.0);
        }

        // Apply sidebar filters
        if (sidebarFilters.gameType === 'cash') {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
        } else if (sidebarFilters.gameType === 'mtt') {
            filteredVenues = filteredVenues.filter(v => v.has_tournaments);
        }

        if (sidebarFilters.stakes === '$1/25') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('1/2') || s.includes('1/3')));
        } else if (sidebarFilters.stakes === '$2/5') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('2/5')));
        } else if (sidebarFilters.stakes === '$5/10+') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('5/10') || s.includes('10/20') || s.includes('25/50')));
        }

        const toggleMapFilter = (key) => {
            setMapFilters(prev => ({ ...prev, [key]: !prev[key] }));
        };

        return (
            <div className="map-desktop-layout">
                {/* LEFT COLUMN: Map Section */}
                <div className="map-main-section">
                    {/* Header Row */}
                    <div className="map-header-row">
                        <h2 className="map-title">Poker Rooms Near You</h2>
                        <span className="map-stats">{filteredVenues.length} rooms • 0 active tables • 100 tournaments today</span>
                    </div>

                    {/* Quick Filter Chips */}
                    <div className="map-filter-chips">
                        <button className={'filter-chip' + (mapFilters.cashGames ? ' active' : '')} onClick={() => toggleMapFilter('cashGames')}>
                            <span className="chip-dot cash"></span> Cash Games
                        </button>
                        <button className={'filter-chip' + (mapFilters.tournaments ? ' active' : '')} onClick={() => toggleMapFilter('tournaments')}>
                            <span className="chip-dot mtt"></span> Tournaments
                        </button>
                        <button className={'filter-chip' + (mapFilters.openNow ? ' active' : '')} onClick={() => toggleMapFilter('openNow')}>
                            <span className="chip-dot live"></span> Open Now
                        </button>
                        <button className={'filter-chip' + (mapFilters.lowStakes ? ' active' : '')} onClick={() => toggleMapFilter('lowStakes')}>
                            <span className="chip-dot stakes"></span> Low Stakes
                        </button>
                        <button className={'filter-chip' + (mapFilters.topRated ? ' active' : '')} onClick={() => toggleMapFilter('topRated')}>
                            <span className="chip-dot rated"></span> Top Rated
                        </button>
                    </div>

                    {/* Map Container */}
                    <VenueMap
                        venues={filteredVenues}
                        userLocation={userLocation}
                    />

                    {/* Room List Below Map */}
                    <div className="map-room-list">
                        <h3 className="room-list-title">Closest Poker Rooms</h3>
                        <div className="room-list-grid">
                            {filteredVenues.slice(0, 6).map((venue, i) => (
                                <div key={venue.id || i} className="room-list-card" onClick={() => setSelectedRoom(venue)}>
                                    <div className="room-card-header">
                                        <span className="room-name">{venue.name}</span>
                                        <span className="room-hours">{venue.is_24_hours ? '24/7' : venue.hours_of_operation || '—'}</span>
                                    </div>
                                    <div className="room-card-location">{venue.city}, {venue.state}</div>
                                    <div className="room-card-tags">
                                        <span className="room-tag">• — Tournaments</span>
                                    </div>
                                    <button className="room-view-btn" onClick={(e) => { e.stopPropagation(); router.push(venue.is_social_page ? `/club/${venue.social_page_id}` : `/hub/venues/${venue.id}`); }}>View Room</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Sidebar Filters + Room Detail */}
                <div className="map-sidebar">
                    <div className="sidebar-filters">
                        <h3 className="sidebar-title">Filters</h3>

                        {/* Game Type */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Game Type</label>
                            <div className="sidebar-chips">
                                {['all', 'Cash', 'MTT', 'Mixed'].map(type => (
                                    <button
                                        key={type}
                                        className={'sidebar-chip' + (sidebarFilters.gameType === type.toLowerCase() ? ' active' : '')}
                                        onClick={() => setSidebarFilters(p => ({ ...p, gameType: type.toLowerCase() }))}
                                    >{type === 'all' ? 'All' : type}</button>
                                ))}
                            </div>
                        </div>

                        {/* Stakes */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Stakes</label>
                            <div className="sidebar-chips">
                                {['all', '$1/25', '$2/5', '$5/10+'].map(stake => (
                                    <button
                                        key={stake}
                                        className={'sidebar-chip' + (sidebarFilters.stakes === stake ? ' active' : '')}
                                        onClick={() => setSidebarFilters(p => ({ ...p, stakes: stake }))}
                                    >{stake === 'all' ? 'All' : stake}</button>
                                ))}
                            </div>
                        </div>

                        {/* Buy-in Range */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Buy-In Range</label>
                            <div className="sidebar-range-inputs">
                                <input
                                    type="number"
                                    placeholder="Min"
                                    className="sidebar-input"
                                    value={sidebarFilters.minBuyin}
                                    onChange={e => setSidebarFilters(p => ({ ...p, minBuyin: e.target.value }))}
                                />
                                <span className="range-divider">—</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    className="sidebar-input"
                                    value={sidebarFilters.maxBuyin}
                                    onChange={e => setSidebarFilters(p => ({ ...p, maxBuyin: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* Amenities */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Amenities</label>
                            <div className="sidebar-checkboxes">
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.hasFood}
                                        onChange={e => setSidebarFilters(p => ({ ...p, hasFood: e.target.checked }))}
                                    />
                                    <span>Food Tableside</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.hasHotel}
                                        onChange={e => setSidebarFilters(p => ({ ...p, hasHotel: e.target.checked }))}
                                    />
                                    <span>Hotel</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.hasParking}
                                        onChange={e => setSidebarFilters(p => ({ ...p, hasParking: e.target.checked }))}
                                    />
                                    <span>Free Parking</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.is24Hours}
                                        onChange={e => setSidebarFilters(p => ({ ...p, is24Hours: e.target.checked }))}
                                    />
                                    <span>24/7</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.hasWifi}
                                        onChange={e => setSidebarFilters(p => ({ ...p, hasWifi: e.target.checked }))}
                                    />
                                    <span>WiFi</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.hasMassage}
                                        onChange={e => setSidebarFilters(p => ({ ...p, hasMassage: e.target.checked }))}
                                    />
                                    <span>Massage</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.nonSmoking}
                                        onChange={e => setSidebarFilters(p => ({ ...p, nonSmoking: e.target.checked }))}
                                    />
                                    <span>Non-Smoking</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.autoShufflers}
                                        onChange={e => setSidebarFilters(p => ({ ...p, autoShufflers: e.target.checked }))}
                                    />
                                    <span>Auto Shufflers</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.usbChargers}
                                        onChange={e => setSidebarFilters(p => ({ ...p, usbChargers: e.target.checked }))}
                                    />
                                    <span>USB Chargers</span>
                                </label>
                                <label className="sidebar-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={sidebarFilters.phoneInList}
                                        onChange={e => setSidebarFilters(p => ({ ...p, phoneInList: e.target.checked }))}
                                    />
                                    <span>Phone-in Waitlist</span>
                                </label>
                            </div>
                        </div>

                        <button className="sidebar-apply-btn">Apply Filters</button>
                    </div>

                    {/* Room Detail Panel */}
                    {selectedRoom && (
                        <div className="room-detail-panel">
                            <div className="detail-header">
                                <h3>{selectedRoom.name}</h3>
                                <button className="detail-close" onClick={() => setSelectedRoom(null)}>×</button>
                            </div>
                            <p className="detail-location">{selectedRoom.city}, {selectedRoom.state}</p>
                            <button className="detail-view-btn" onClick={() => router.push(selectedRoom.is_social_page ? `/club/${selectedRoom.social_page_id}` : `/hub/venues/${selectedRoom.id}`)}>View Full Details</button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderVenues = () => {
        if (!hasSearched) {
            return null;
        }

        if (venues.length === 0) {
            return (
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    <p>No Venues Found Matching Your Criteria</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try A Different City, Adjust Filters, Or Use GPS</p>
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
                    <span className="results-count">{venues.length} result{venues.length !== 1 ? 's' : ''} found</span>
                    <div className="sort-controls">
                        <label>Sort:</label>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sort-select">
                            <option value="default">Default</option>
                            <option value="trust-desc">Trust (High To Low)</option>
                            <option value="trust-asc">Trust (Low To High)</option>
                            {userLocation && <option value="distance">Nearest First</option>}
                            <option value="name-az">Name (A-Z)</option>
                            <option value="name-za">Name (Z-A)</option>
                        </select>
                    </div>
                </div>
                <div className="card-grid">
                    {displayed.map((venue, i) => (
                        <VenueCard
                            key={venue.id || i}
                            venue={venue}
                            isFavorited={isFavorited('venue', venue.id)}
                            isNewcomer={isNewcomerFriendly(venue)}
                            hasPromo={promotionVenueIds.has(String(venue.id))}
                            onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                            onNavigate={(path) => router.push(path)}
                        />
                    ))}
                </div>
                {/* Load More */}
                {displayCount.venues < venues.length && (
                    <div className="load-more">
                        <button className="load-more-btn" onClick={() => loadMore('venues')}>
                            Show More Results ({venues.length - displayed.length} more)
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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
                    <p>No Tours Found</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try Clearing Filters Or Searching For A Specific Tour</p>
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
                    {tours.slice(0, displayCount.tours).map((tour, i) => (
                        <TourCard
                            key={tour.tour_code || i}
                            tour={tour}
                            isFavorited={isFavorited('tour', tour.tour_code)}
                            onFavorite={(e) => toggleFavorite('tour', tour.tour_code, e)}
                            onNavigate={(path) => router.push(path)}
                        />
                    ))}
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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <p>No Tournament Series Found</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try Expanding The Timeframe Or Clearing Filters</p>
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
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                            Grid
                        </button>
                        <button className={'view-btn' + (seriesViewMode === 'calendar' ? ' active' : '')} onClick={() => setSeriesViewMode('calendar')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            Calendar
                        </button>
                    </div>
                </div>

                {seriesViewMode === 'calendar' ? renderSeriesCalendar() : (
                    <>
                        <div className="card-grid">
                            {series.slice(0, displayCount.series).map((s, i) => (
                                <SeriesCard
                                    key={s.id || i}
                                    series={s}
                                    index={i}
                                    isFavorited={isFavorited('series', s.id || (i + 1))}
                                    onFavorite={(e) => toggleFavorite('series', s.id || (i + 1), e)}
                                    onNavigate={(path) => router.push(path)}
                                />
                            ))}
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
                        <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
                    </svg>
                    <p>No Live Games Reported Right Now</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Be The First To Report A Game At Your Venue!</p>
                    <p style={{ fontSize: 11, opacity: 0.3, marginTop: 8 }}>Auto-refreshes every {LIVE_REFRESH_MS / 60000} minutes</p>
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
                        <span>Auto-refreshes every {LIVE_REFRESH_MS / 60000} min</span>
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

            <SEOHead
                title="Poker Near Me — Find Live Poker Rooms & Casinos"
                description="Discover Live Poker Rooms, Casinos, And Card Rooms Near You. Real-time Game Info, Tournament Schedules, And Interactive Maps Across The United States."
                canonical="/hub/poker-near-me"
            />

            <div className="pnm-page">
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* 25💎 day-pass gate for non-VIP users */}
                <FeatureGate
                    featureKey="poker_near_me"
                    userId={userId}
                    cost={25}
                    duration={24}
                    title="Poker Near Me"
                    description="Access 483+ Live Poker Venues, Tournament Schedules, And Daily Events Worldwide."
                >

                    {/* ═══ FUTURISTIC METAL HUD PANEL ═══ */}
                    <div className="pnm-hud-panel">
                        <img src="/images/poker-near-me-hud-frame.png" alt="" className="hud-bg-frame" aria-hidden="true" />
                        <div className="hud-content-overlay">
                            {/* Title */}
                            <h1 className="hud-title">POKER NEAR ME</h1>
                            <div className="hud-subtitle">VENUES | TOUR | SERIES | DAILY EVENTS | LIVE GAMES | MAP</div>

                            {/* Search Bar */}
                            <form className="hud-search-row" onSubmit={handleSearch}>
                                <div className="hud-search-bar">
                                    <svg className="hud-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                                    </svg>
                                    <input
                                        type="text"
                                        className="hud-search-input"
                                        placeholder=""
                                        value={searchQuery}
                                        onChange={handleSearchInputChange}
                                        onFocus={() => { if (searchHistory.length > 0) setShowSearchHistory(true); }}
                                        onBlur={() => setTimeout(() => setShowSearchHistory(false), 200)}
                                    />
                                    {showSearchHistory && searchHistory.length > 0 && (
                                        <div className="search-history-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50 }}>
                                            <div className="search-history-header">
                                                <span>Recent Searches</span>
                                                <button type="button" onClick={() => { setSearchHistory([]); localStorage.removeItem('sp-search-history'); if (userId) clearSearchHistoryFromDb(userId).catch(() => { }); setShowSearchHistory(false); }}>Clear</button>
                                            </div>
                                            {searchHistory.map((item, i) => (
                                                <button key={i} type="button" className="search-history-item"
                                                    onClick={() => { setSearchQuery(item); setShowSearchHistory(false); setHasSearched(true); setTimeout(() => fetchAllData({ includeVenues: true }), 0); }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                    {item}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button type="submit" className="hud-search-btn">Search</button>
                            </form>

                            {/* GPS + Filters Buttons */}
                            <div className="hud-controls-row">
                                <button className={'hud-ctrl-btn' + (userLocation ? ' active' : '')} onClick={requestGpsLocation} disabled={gpsLoading}>
                                    {gpsLoading ? 'Locating...' : 'Use GPS'}
                                </button>
                                <button className={'hud-ctrl-btn' + (showFilters ? ' active' : '')} onClick={() => setShowFilters(!showFilters)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                                        <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                                        <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                                    </svg>
                                    Filters
                                </button>
                            </div>

                            {/* Tab Buttons */}
                            <div className="hud-tab-row">
                                {[
                                    { key: 'venues', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', icon2: '9 22 9 12 15 12 15 22', label: 'Venues' },
                                    { key: 'tours', label: 'Tours' },
                                    { key: 'series', label: 'Series' },
                                    { key: 'daily', label: 'Daily' },
                                    { key: 'live', label: 'Live' },
                                    { key: 'map', label: 'Map' }
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        className={'hud-tab-btn' + (activeTab === tab.key ? ' active' : '')}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Distance / Geofence notices (below HUD) */}
                    {(userLocation || nearestDistance) && (
                        <div className="distance-display" style={{ textAlign: 'center', padding: '6px 0', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -2, marginRight: 4 }}>
                                <polygon points="3 11 22 2 13 21 11 13 3 11" />
                            </svg>
                            <span>Nearest: ~{nearestDistance || '0'} miles</span>
                        </div>
                    )}
                    {geofenceStatus === 'denied' && (
                        <div className="geofence-notice denied">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span>Notifications Blocked - Venue Alerts Will Show In-app Only</span>
                        </div>
                    )}

                    {/* Main Content */}
                    <main className="pnm-content">
                        {renderContent()}
                    </main>

                    {/* Geofence Alert Banner */}
                    {geofenceAlert && (
                        <GeofenceAlertBanner
                            venue={geofenceAlert}
                            onCheckin={() => {
                                const gfUrl = geofenceAlert.is_social_page
                                    ? '/club/' + geofenceAlert.social_page_id
                                    : '/hub/venues/' + geofenceAlert.id;
                                router.push(gfUrl + '?action=checkin');
                                setGeofenceAlert(null);
                            }}
                            onReview={() => {
                                const gfUrl = geofenceAlert.is_social_page
                                    ? '/club/' + geofenceAlert.social_page_id
                                    : '/hub/venues/' + geofenceAlert.id;
                                router.push(gfUrl + '?action=review');
                                setGeofenceAlert(null);
                            }}
                            onDismiss={() => setGeofenceAlert(null)}
                        />
                    )}

                    <style jsx global>{`
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

                    /* ═══ HUD PANEL ═══ */
                    .pnm-hud-panel {
                        position: relative;
                        max-width: 720px;
                        margin: 0 auto 12px;
                        padding: 0 12px;
                    }
                    .hud-bg-frame {
                        width: 100%;
                        height: auto;
                        display: block;
                        pointer-events: none;
                        user-select: none;
                        filter: brightness(0.85);
                    }
                    .hud-content-overlay {
                        position: absolute;
                        inset: 0;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 14% 16% 12%;
                        z-index: 2;
                    }

                    /* HUD Title */
                    .hud-title {
                        font-family: 'Inter', 'Arial Black', sans-serif;
                        font-size: clamp(16px, 4vw, 32px);
                        font-weight: 800;
                        letter-spacing: 4px;
                        margin: 0 0 2px;
                        background: linear-gradient(180deg, #ffffff 0%, #c0c0c0 40%, #d4a853 80%, #b8860b 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        text-shadow: none;
                        text-transform: uppercase;
                    }
                    .hud-subtitle {
                        font-size: clamp(7px, 1.6vw, 12px);
                        color: rgba(255,255,255,0.55);
                        letter-spacing: 2px;
                        margin-bottom: clamp(6px, 2vw, 14px);
                        text-transform: uppercase;
                        font-weight: 500;
                    }

                    /* HUD Search Row */
                    .hud-search-row {
                        display: flex;
                        gap: 6px;
                        width: 100%;
                        margin-bottom: clamp(4px, 1.2vw, 10px);
                    }
                    .hud-search-bar {
                        position: relative;
                        flex: 1;
                        display: flex;
                        align-items: center;
                        background: linear-gradient(180deg, rgba(10,15,25,0.9) 0%, rgba(20,28,42,0.85) 100%);
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 6px;
                        overflow: hidden;
                        box-shadow: inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04);
                    }
                    .hud-search-icon {
                        position: absolute;
                        left: 10px;
                        top: 50%;
                        transform: translateY(-50%);
                        pointer-events: none;
                    }
                    .hud-search-input {
                        flex: 1;
                        background: transparent;
                        border: none;
                        outline: none;
                        color: #fff;
                        font-size: clamp(12px, 2vw, 15px);
                        padding: clamp(8px, 1.5vw, 14px) 12px clamp(8px, 1.5vw, 14px) 34px;
                        font-family: inherit;
                        caret-color: #d4a853;
                    }
                    .hud-search-input::placeholder {
                        color: rgba(255,255,255,0.3);
                    }
                    .hud-search-btn {
                        padding: clamp(8px, 1.5vw, 14px) clamp(14px, 3vw, 26px);
                        background: linear-gradient(180deg, #d4a853 0%, #a07730 100%);
                        border: 1px solid rgba(212,168,83,0.6);
                        border-radius: 6px;
                        color: #000;
                        font-weight: 700;
                        font-size: clamp(11px, 1.8vw, 14px);
                        cursor: pointer;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        transition: all 0.15s;
                        box-shadow: 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
                    }
                    .hud-search-btn:hover {
                        background: linear-gradient(180deg, #e0b965 0%, #b8860b 100%);
                    }
                    .hud-search-btn:active {
                        transform: scale(0.97);
                    }

                    /* HUD Controls Row (GPS + Filters) */
                    .hud-controls-row {
                        display: flex;
                        gap: 8px;
                        width: 100%;
                        justify-content: center;
                        margin-bottom: clamp(4px, 1.2vw, 10px);
                    }
                    .hud-ctrl-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        padding: clamp(6px, 1vw, 10px) clamp(16px, 3vw, 32px);
                        background: linear-gradient(180deg, rgba(50,55,65,0.9) 0%, rgba(35,38,48,0.95) 100%);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 5px;
                        color: rgba(255,255,255,0.75);
                        font-size: clamp(10px, 1.6vw, 13px);
                        font-weight: 600;
                        cursor: pointer;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        transition: all 0.15s;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06);
                    }
                    .hud-ctrl-btn:hover {
                        background: linear-gradient(180deg, rgba(65,70,80,0.95) 0%, rgba(45,48,58,1) 100%);
                        border-color: rgba(255,255,255,0.25);
                    }
                    .hud-ctrl-btn.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.3) 0%, rgba(140,110,50,0.3) 100%);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }

                    /* HUD Tab Row */
                    .hud-tab-row {
                        display: flex;
                        gap: clamp(4px, 0.8vw, 8px);
                        width: 100%;
                        justify-content: center;
                        flex-wrap: wrap;
                    }
                    .hud-tab-btn {
                        padding: clamp(5px, 1vw, 9px) clamp(10px, 2vw, 18px);
                        background: linear-gradient(180deg, rgba(55,60,72,0.9) 0%, rgba(38,42,52,0.95) 100%);
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 5px;
                        color: rgba(255,255,255,0.7);
                        font-size: clamp(9px, 1.5vw, 13px);
                        font-weight: 600;
                        cursor: pointer;
                        text-transform: capitalize;
                        letter-spacing: 0.5px;
                        transition: all 0.15s;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
                    }
                    .hud-tab-btn:hover {
                        background: linear-gradient(180deg, rgba(70,75,88,0.95) 0%, rgba(50,54,65,1) 100%);
                        border-color: rgba(255,255,255,0.22);
                        color: #fff;
                    }
                    .hud-tab-btn.active {
                        background: linear-gradient(180deg, rgba(212,168,83,0.35) 0%, rgba(160,120,48,0.3) 100%);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                        box-shadow: 0 0 8px rgba(212,168,83,0.2), inset 0 1px 0 rgba(255,255,255,0.08);
                    }

                    /* Main Content */
                    .pnm-content {
                        padding: 0 20px;
                        max-width: 1400px;
                        margin: 0 auto;
                    }

                    /* Loading / Empty State */
                    .loading-state, .empty-state, .search-landing {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 80px 20px;
                        color: rgba(255,255,255,0.5);
                        text-align: center;
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
                        .pnm-hud-panel {
                            padding: 0 4px;
                        }
                        .hud-content-overlay {
                            padding: 16% 12% 10%;
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

                    /* Two-Column Map Layout */
                    .map-desktop-layout {
                        display: grid;
                        grid-template-columns: 1fr 320px;
                        gap: 24px;
                        width: 100%;
                    }
                    @media (max-width: 1024px) {
                        .map-desktop-layout {
                            grid-template-columns: 1fr;
                        }
                        .map-sidebar {
                            display: none;
                        }
                    }

                    .map-main-section {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

                    .map-header-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .map-title {
                        font-size: 22px;
                        font-weight: 700;
                        color: #fff;
                        margin: 0;
                    }
                    .map-stats {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                    }

                    /* Filter Chips */
                    .map-filter-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .filter-chip {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 14px;
                        border-radius: 20px;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(255,255,255,0.1);
                        font-size: 13px;
                        color: rgba(255,255,255,0.7);
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .filter-chip:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(255,255,255,0.2);
                    }
                    .filter-chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .chip-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                    }
                    .chip-dot.cash { background: #22c55e; }
                    .chip-dot.mtt { background: #3b82f6; }
                    .chip-dot.live { background: #ef4444; }
                    .chip-dot.stakes { background: #f59e0b; }
                    .chip-dot.rated { background: #d4a853; }

                    /* Room List Below Map */
                    .map-room-list {
                        margin-top: 20px;
                    }
                    .room-list-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #fff;
                        margin: 0 0 12px 0;
                    }
                    .room-list-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                        gap: 12px;
                    }
                    .room-list-card {
                        background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 12px;
                        padding: 16px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .room-list-card:hover {
                        background: rgba(255,255,255,0.08);
                        border-color: rgba(212,168,83,0.3);
                    }
                    .room-card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 6px;
                    }
                    .room-name {
                        font-size: 15px;
                        font-weight: 600;
                        color: #fff;
                    }
                    .room-hours {
                        font-size: 11px;
                        color: #22c55e;
                        font-weight: 500;
                    }
                    .room-card-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                    }
                    .room-card-tags {
                        margin-bottom: 12px;
                    }
                    .room-tag {
                        font-size: 12px;
                        color: rgba(255,255,255,0.4);
                    }
                    .room-view-btn {
                        width: 100%;
                        padding: 8px 12px;
                        border-radius: 8px;
                        background: rgba(212,168,83,0.2);
                        border: 1px solid rgba(212,168,83,0.4);
                        color: #d4a853;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .room-view-btn:hover {
                        background: rgba(212,168,83,0.3);
                    }

                    /* Sidebar Styles */
                    .map-sidebar {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }
                    .sidebar-filters {
                        background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 12px;
                        padding: 20px;
                    }
                    .sidebar-title {
                        font-size: 16px;
                        font-weight: 600;
                        color: #fff;
                        margin: 0 0 16px 0;
                    }
                    .sidebar-filter-group {
                        margin-bottom: 16px;
                    }
                    .sidebar-label {
                        display: block;
                        font-size: 12px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 8px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .sidebar-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                    }
                    .sidebar-chip {
                        padding: 6px 12px;
                        border-radius: 6px;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(255,255,255,0.1);
                        font-size: 12px;
                        color: rgba(255,255,255,0.7);
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .sidebar-chip:hover {
                        background: rgba(255,255,255,0.1);
                    }
                    .sidebar-chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }
                    .sidebar-range-inputs {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .sidebar-input {
                        flex: 1;
                        padding: 8px 10px;
                        border-radius: 6px;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(255,255,255,0.1);
                        font-size: 13px;
                        color: #fff;
                    }
                    .sidebar-input::placeholder {
                        color: rgba(255,255,255,0.3);
                    }
                    .range-divider {
                        color: rgba(255,255,255,0.3);
                    }
                    .sidebar-checkboxes {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                    }
                    .sidebar-checkbox {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 13px;
                        color: rgba(255,255,255,0.7);
                        cursor: pointer;
                    }
                    .sidebar-checkbox input {
                        accent-color: #d4a853;
                    }
                    .sidebar-apply-btn {
                        width: 100%;
                        padding: 12px;
                        border-radius: 8px;
                        background: linear-gradient(135deg, #d4a853, #b8860b);
                        border: none;
                        font-size: 14px;
                        font-weight: 600;
                        color: #000;
                        cursor: pointer;
                        transition: all 0.2s;
                        margin-top: 8px;
                    }
                    .sidebar-apply-btn:hover {
                        filter: brightness(1.1);
                    }

                    /* Room Detail Panel */
                    .room-detail-panel {
                        background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 12px;
                        padding: 20px;
                    }
                    .detail-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }
                    .detail-header h3 {
                        font-size: 16px;
                        font-weight: 600;
                        color: #fff;
                        margin: 0;
                    }
                    .detail-close {
                        background: none;
                        border: none;
                        font-size: 20px;
                        color: rgba(255,255,255,0.5);
                        cursor: pointer;
                    }
                    .detail-location {
                        font-size: 13px;
                        color: rgba(255,255,255,0.5);
                        margin: 0 0 12px 0;
                    }
                    .detail-view-btn {
                        width: 100%;
                        padding: 10px;
                        border-radius: 8px;
                        background: rgba(212,168,83,0.2);
                        border: 1px solid rgba(212,168,83,0.4);
                        color: #d4a853;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                `}</style>
                </FeatureGate>
            </div>
        </>
    );
}
