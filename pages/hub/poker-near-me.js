/**
 *  POKER NEAR ME - Live Venue Finder
 * Find poker rooms, casinos, and tournaments near you
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useAvatar } from '../../src/contexts/AvatarContext';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getPokerNearMePreferences, updatePokerNearMePreferences } from '../../src/services/pokerNearMePreferences';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import { addSearchHistory as addSearchHistoryToDb, getSearchHistory as getSearchHistoryFromDb } from '../../src/services/pokerNearMeSearchHistory';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import FeatureGate from '../../src/components/gates/FeatureGate';
import { supabase } from '../../src/lib/supabase';
const VenueCard = dynamic(() => import('../../src/components/poker-near-me/VenueCard'), { ssr: false });
const TourCard = dynamic(() => import('../../src/components/poker-near-me/TourCard'), { ssr: false });
const SeriesCard = dynamic(() => import('../../src/components/poker-near-me/SeriesCard'), { ssr: false });

// Feature #3-#15 — New feature components
const RoadTripPlanner = dynamic(() => import('../../src/components/poker-near-me/RoadTripPlanner'), { ssr: false });
const SocialLayer = dynamic(() => import('../../src/components/poker-near-me/SocialLayer'), { ssr: false });
const TournamentAlerts = dynamic(() => import('../../src/components/poker-near-me/TournamentAlerts'), { ssr: false });
const VenueReviews = dynamic(() => import('../../src/components/poker-near-me/VenueReviews'), { ssr: false });
const NearMeNowFeed = dynamic(() => import('../../src/components/poker-near-me/NearMeNowFeed'), { ssr: false });
const VoiceSearch = dynamic(() => import('../../src/components/poker-near-me/VoiceSearch'), { ssr: false });
const TripCostCalculator = dynamic(() => import('../../src/components/poker-near-me/TripCostCalculator'), { ssr: false });
const SeasonalCalendar = dynamic(() => import('../../src/components/poker-near-me/SeasonalCalendar'), { ssr: false });

// Page configuration constants
const PAGE_SIZE = 24;
const PAGE_SIZE_DAILY = 30;
const PAGE_SIZE_LIVE = 30;
const LIVE_REFRESH_MS = 120000; // 2 minutes
const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_HISTORY_MAX = 8;
const DEFAULT_RADIUS_MILES = 50;

// Tab order for swipe navigation
const TAB_ORDER = ['venues', 'tours', 'series', 'daily', 'live', 'map', 'favorites', 'roadtrip', 'social', 'alerts', 'nearnow', 'calculator', 'calendar'];

// API response cache with TTL
const apiCache = {};
const API_CACHE_TTL = 60000; // 60 seconds
function cachedFetch(url, ttl = API_CACHE_TTL) {
    const now = Date.now();
    if (apiCache[url] && (now - apiCache[url].time) < ttl) {
        return Promise.resolve(apiCache[url].data);
    }
    return fetch(url).then(r => r.json()).then(data => {
        apiCache[url] = { data, time: now };
        return data;
    });
}

// Retry wrapper with exponential backoff
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
            }
        }
    }
    throw lastError;
}

// Search analytics tracker
function trackSearchEvent(eventName, data) {
    try {
        // Log for analytics (can be wired to Sentry, Mixpanel, etc.)
        if (typeof window !== 'undefined' && window.__SEARCH_ANALYTICS__) {
            window.__SEARCH_ANALYTICS__.push({ event: eventName, data, timestamp: Date.now() });
        }
        // Store locally for aggregate analysis
        const key = 'sp-search-analytics';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({ event: eventName, ...data, ts: Date.now() });
        // Keep last 100 events
        if (existing.length > 100) existing.splice(0, existing.length - 100);
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) { /* analytics should never break the app */ }
}

// Popular cities for autocomplete
const POPULAR_CITIES = [
    { name: 'Las Vegas', state: 'NV' }, { name: 'Los Angeles', state: 'CA' },
    { name: 'Atlantic City', state: 'NJ' }, { name: 'Miami', state: 'FL' },
    { name: 'Houston', state: 'TX' }, { name: 'Dallas', state: 'TX' },
    { name: 'Chicago', state: 'IL' }, { name: 'Phoenix', state: 'AZ' },
    { name: 'San Diego', state: 'CA' }, { name: 'Tampa', state: 'FL' },
    { name: 'Denver', state: 'CO' }, { name: 'Portland', state: 'OR' },
    { name: 'Seattle', state: 'WA' }, { name: 'San Francisco', state: 'CA' },
    { name: 'New Orleans', state: 'LA' }, { name: 'Oklahoma City', state: 'OK' },
    { name: 'Biloxi', state: 'MS' }, { name: 'Tunica', state: 'MS' },
    { name: 'Reno', state: 'NV' }, { name: 'San Jose', state: 'CA' },
    { name: 'Ft. Lauderdale', state: 'FL' }, { name: 'Orlando', state: 'FL' },
    { name: 'Austin', state: 'TX' }, { name: 'San Antonio', state: 'TX' },
    { name: 'Nashville', state: 'TN' }, { name: 'Detroit', state: 'MI' },
    { name: 'Minneapolis', state: 'MN' }, { name: 'St. Louis', state: 'MO' },
    { name: 'Charlotte', state: 'NC' }, { name: 'Sacramento', state: 'CA' },
];
const GEOFENCE_ALERT_TIMEOUT_MS = 30000;
const TOTAL_VENUES = 484;


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

// ---- Error Boundary for Map ----
class MapErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('Map rendering error:', error, info);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                        <line x1="8" y1="2" x2="8" y2="18" />
                        <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Map Unavailable</p>
                    <p style={{ fontSize: 13 }}>Unable to load the map. This may be caused by an ad blocker or network issue.</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(212,168,83,0.2)', border: '1px solid rgba(212,168,83,0.4)', borderRadius: 8, color: '#d4a853', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    >Try Again</button>
                </div>
            );
        }
        return this.props.children;
    }
}


// ---- Leaflet Map Component (client-side only) ----------------------------
function VenueMap({ venues, userLocation }) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const userMarkerRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);

    // Dynamically load Leaflet scripts — deferred until Map tab is selected (~200KB saved on initial load)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (activeTab !== 'map') return; // ← lazy: only load when Map tab is active

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
                // Load Leaflet CSS (required for proper map rendering)
                if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
                    const leafletCSS = document.createElement('link');
                    leafletCSS.rel = 'stylesheet';
                    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                    document.head.appendChild(leafletCSS);
                }
                if (!document.querySelector('link[href*="MarkerCluster"]')) {
                    const clusterCSS = document.createElement('link');
                    clusterCSS.rel = 'stylesheet';
                    clusterCSS.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
                    document.head.appendChild(clusterCSS);
                    const clusterDefaultCSS = document.createElement('link');
                    clusterDefaultCSS.rel = 'stylesheet';
                    clusterDefaultCSS.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
                    document.head.appendChild(clusterDefaultCSS);
                }

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
    }, [activeTab]); // depends on activeTab — Leaflet only loads when Map tab is selected

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

            const popupHtml = '<div style="font-family:Inter,-apple-system,sans-serif;min-width:200px;max-width:280px;background:#0f172a;padding:12px;border-radius:10px;">' +
                '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">' + (venue.name || '') + '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
                '<span style="padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.2);color:#818cf8;font-size:11px;font-weight:600;">' + typeBadge + '</span>' +
                '<span style="font-size:12px;color:rgba(255,255,255,0.5);">' + (venue.city || '') + ', ' + (venue.state || '') + '</span>' +
                '</div>' +
                '<div style="font-size:12px;color:' + trust.color + ';font-weight:600;margin-bottom:8px;">Trust: ' + trust.label + ' (' + (venue.trust_score || '-') + '/5)</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<a href="' + detailPath + '" style="padding:6px 12px;border-radius:6px;background:#d4a853;color:#000;text-decoration:none;font-size:12px;font-weight:600;">View Details</a>' +
                '<a href="' + detailPath + '?action=checkin" style="padding:6px 12px;border-radius:6px;background:rgba(37,99,235,0.8);color:#fff;text-decoration:none;font-size:12px;font-weight:600;">Check In</a>' +
                '<a href="' + detailPath + '?action=review" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.1);color:#fff;text-decoration:none;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.2);">Review</a>' +
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
    const bus = useTrainingBus();
    const userId = user?.id;

    // Active tab state — persisted with sortBy and seriesViewMode
    const { filters: uiFilters, setFilter: setUiFilter } = usePersistedFilters('poker-near-me', {
        activeTab: 'venues',
        sortBy: 'default',
        seriesViewMode: 'grid'
    });

    const activeTab = uiFilters.activeTab;
    const sortBy = uiFilters.sortBy;
    const seriesViewMode = uiFilters.seriesViewMode;
    const setActiveTab = (val) => setUiFilter('activeTab', val);
    const setSortBy = (val) => setUiFilter('sortBy', val);
    const setSeriesViewMode = (val) => setUiFilter('seriesViewMode', val);


    // Data states
    const [venues, setVenues] = useState([]);
    const [allVenuesForMap, setAllVenuesForMap] = useState([]);
    const [tours, setTours] = useState([]);
    const [series, setSeries] = useState([]);
    const [dailyTournaments, setDailyTournaments] = useState([]);

    // UI states
    const [loading, setLoading] = useState(true);
    const [venueLoading, setVenueLoading] = useState(false);
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

    // Review panel state (Feature #9)
    const [reviewVenue, setReviewVenue] = useState(null);

    // Swipe gesture state
    const touchStartRef = useRef(null);
    const touchEndRef = useRef(null);
    const contentRef = useRef(null);

    // Pull-to-refresh state
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const pullStartRef = useRef(null);

    // City autocomplete state
    const [citySuggestions, setCitySuggestions] = useState([]);
    const [showCitySuggestions, setShowCitySuggestions] = useState(false);

    // Push notification state
    const [pushPermission, setPushPermission] = useState('default');

    // Fetch error state for retry UI
    const [fetchError, setFetchError] = useState(null);

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

    const [filters, setFilters] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('poker-near-me-search-filters');
                if (saved) return JSON.parse(saved);
            } catch (e) { console.error(e); }
        }
        return {
            radius: 50,
            venueType: 'all',
            hasNLH: false,
            hasPLO: false,
            hasMixed: false,
            tourType: 'all',
            seriesTimeframe: 90,
            seriesType: 'all',
            selectedDay: getCurrentDay(),
            minBuyin: '',
            maxBuyin: '',
            stakes: 'all',
            gameType: 'all'
        };
    });

    // Real-time Master Saving & Bus Synchronization
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('poker-near-me-search-filters', JSON.stringify(filters));
            window.dispatchEvent(new CustomEvent('poker-near-me-filters-sync', { detail: filters }));
        }
    }, [filters]);

    useEffect(() => {
        const handleSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(filters);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setFilters(e.detail);
                }
            }
        };
        window.addEventListener('poker-near-me-filters-sync', handleSync);
        return () => window.removeEventListener('poker-near-me-filters-sync', handleSync);
    }, [filters]);

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
    const [displayCount, setDisplayCount] = useState({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
    const [searchHistory, setSearchHistory] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return JSON.parse(localStorage.getItem('sp-search-history') || '[]'); } catch { return []; }
        }
        return [];
    });
    const [showSearchHistory, setShowSearchHistory] = useState(false);
    const searchDebounceRef = useRef(null);
    const searchWrapperRef = useRef(null);
    const [promotionVenueIds, setPromotionVenueIds] = useState(new Set());

    // Map view filters (for enhanced map-first experience)
    const [mapFilters, setMapFilters] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('poker-near-me-map-filters');
                if (saved) return JSON.parse(saved);
            } catch (e) { console.error(e); }
        }
        return {
            cashGames: false,
            tournaments: false,
            is24Hours: false,
            lowStakes: false,
            topRated: false
        };
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('poker-near-me-map-filters', JSON.stringify(mapFilters));
            window.dispatchEvent(new CustomEvent('poker-near-me-map-filters-sync', { detail: mapFilters }));
        }
    }, [mapFilters]);

    useEffect(() => {
        const handleSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(mapFilters);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setMapFilters(e.detail);
                }
            }
        };
        window.addEventListener('poker-near-me-map-filters-sync', handleSync);
        return () => window.removeEventListener('poker-near-me-map-filters-sync', handleSync);
    }, [mapFilters]);

    // Selected room for detail panel
    const [selectedRoom, setSelectedRoom] = useState(null);

    // Load all venues for the map (from static JSON) on mount — with offline cache
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const CACHE_KEY = 'sp-offline-venues';
        let hadCacheHit = false;
        // Try offline cache first
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.venues && parsed.time && (Date.now() - parsed.time) < 3600000) { // 1hr TTL
                    setAllVenuesForMap(parsed.venues);
                    hadCacheHit = true;
                }
            }
        } catch (e) { /* ignore */ }
        // Fetch fresh and update cache
        fetch('/data/all-venues.json')
            .then(function (r, { signal }) { return r.json(); })
            .then(function (json) {
                var v = json.venues || json.data || json || [];
                var arr = Array.isArray(v) ? v : [];
                setAllVenuesForMap(arr);
                // Cache for offline use
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ venues: arr, time: Date.now() }));
                } catch (e) { /* storage full, ignore */ }
            })
            .catch(function () {
                // Only show error if we have no cached data at all
                if (!hadCacheHit) {
                    setFetchError('Unable to load venue data. Check your connection.');
                }
            });
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

    // Auto-refresh venues when venue-affecting filter values change
    const filterRefreshRef = useRef(null);
    useEffect(() => {
        if (!hasSearched) return;
        // Debounce to prevent rapid re-fetching during filter cascades
        if (filterRefreshRef.current) clearTimeout(filterRefreshRef.current);
        filterRefreshRef.current = setTimeout(() => {
            fetchVenues();
        }, 400);
        return () => { if (filterRefreshRef.current) clearTimeout(filterRefreshRef.current); };
    }, [filters.radius, filters.venueType, filters.hasNLH, filters.hasPLO, filters.hasMixed]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close search history on outside click
    useEffect(() => {
        if (!showSearchHistory) return;
        const handleClickOutside = (e) => {
            if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
                setShowSearchHistory(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showSearchHistory]);

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

    // --- NEW: Persist favorites to localStorage + bus sync ---
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sp-favorites', JSON.stringify(favorites));
            window.dispatchEvent(new CustomEvent('poker-favorites-sync', { detail: favorites }));
        }
    }, [favorites]);

    // Listen for favorites changes from other tabs
    useEffect(() => {
        const handleFavSync = (e) => {
            if (e.detail && typeof window !== 'undefined') {
                const currentStr = JSON.stringify(favorites);
                const newStr = JSON.stringify(e.detail);
                if (currentStr !== newStr) {
                    setFavorites(e.detail);
                }
            }
        };
        window.addEventListener('poker-favorites-sync', handleFavSync);

        // Map global EventBus events to our local state
        const handleBusFavSync = (data) => {
            if (data && data.venueId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    next['venue-' + data.venueId] = Date.now();
                    return next;
                });
            }
        };
        const handleBusUnfavSync = (data) => {
            if (data && data.venueId) {
                setFavorites(prev => {
                    const next = { ...prev };
                    delete next['venue-' + data.venueId];
                    return next;
                });
            }
        };

        let unsubFav, unsubUnfav;
        if (bus && bus.on) {
            unsubFav = bus.on('venue:favorite', handleBusFavSync);
            unsubUnfav = bus.on('venue:unfavorite', handleBusUnfavSync);
        }

        return () => {
            window.removeEventListener('poker-favorites-sync', handleFavSync);
            if (unsubFav) unsubFav();
            if (unsubUnfav) unsubUnfav();
        };
    }, [favorites, bus]);

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
                    try { bus?.emit?.('venue:unfavorite', { venueId: id }); } catch { }
                } else {
                    await addVenueFavorite(userId, id, {
                        name: itemData.name,
                        address: itemData.address,
                        city: itemData.city,
                        state: itemData.state
                    });
                    try { bus?.emit?.('venue:favorite', { venueId: id, name: itemData.name }); } catch { }
                }
            } catch (err) {
                console.error('Error syncing favorite:', err);
            }
        }
    }, [favorites, userId, bus]);

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
                setSearchQuery('');
                setSelectedCity(null);
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(loc);
                setHasSearched(true);
                // Reset pagination on new GPS search
                setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
                setTimeout(() => {
                    fetchAllData({ includeVenues: true });
                    fetchLiveGames();
                }, 0);
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
        setVenueLoading(true);
        setFetchError(null);
        try {
            const params = new URLSearchParams({ limit: '500' });
            if (selectedCity) {
                params.set('city', selectedCity.name);
                params.set('state', selectedCity.state);
            }
            if (userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
                const kmRadius = filters.radius === 'Any' ? 5000 : Math.round(filters.radius * 1.60934);
                params.set('radius', String(kmRadius));
            }
            if (searchQuery) {
                params.set('search', searchQuery);
            }
            if (filters.venueType !== 'all') {
                params.set('type', filters.venueType);
            }
            if (filters.hasNLH) params.set('hasNLH', 'true');
            if (filters.hasPLO) params.set('hasPLO', 'true');
            if (filters.hasMixed) params.set('hasMixed', 'true');

            const url = '/api/poker/venues?' + params;
            const json = await fetchWithRetry(url);
            const data = json.data;
            let filteredData = data || [];

            setVenues(filteredData);
            if (filteredData.length > 0 && filteredData[0].distance_mi) {
                setNearestDistance(filteredData[0].distance_mi);
            }
        } catch (e) {
            console.error('Fetch venues error:', e);
            setFetchError('Failed to load venues. Tap to retry.');
            setVenues([]);
        }
        setVenueLoading(false);
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

            const url = '/api/poker/tours?' + params;
            const json = await cachedFetch(url);
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

            const url = '/api/poker/series?' + params;
            const json = await cachedFetch(url);
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
            // Also pass GPS-derived state when available
            if (!selectedCity && userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
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

            const url = '/api/poker/daily-tournaments?' + params;
            const json = await cachedFetch(url);
            setDailyTournaments(json.tournaments || []);
        } catch (e) {
            console.error('Fetch daily tournaments error:', e);
            setDailyTournaments([]);
        }
    };

    const fetchLiveGames = async () => {
        setLiveLoading(true);
        try {
            const params = new URLSearchParams({ active: 'true' });
            if (userLocation) {
                params.set('lat', userLocation.lat.toString());
                params.set('lng', userLocation.lng.toString());
            }
            const res = await fetch('/api/poker/live-games?' + params);
            const json = await res.json();
            // API returns { venues: { venueId: [games] } } for active=true
            // Flatten grouped object into a flat array
            let games = [];
            if (json.venues && typeof json.venues === 'object' && !Array.isArray(json.venues)) {
                games = Object.values(json.venues).flat();
            } else {
                games = json.games || json.data || [];
            }
            setLiveGames(games);
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
        setShowCitySuggestions(false);
        setHasSearched(true);
        // Reset pagination on new search
        setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
        // Track search analytics
        trackSearchEvent('search', { query: searchQuery, tab: activeTab, hasGPS: !!userLocation });
        fetchAllData({ includeVenues: true });
    };

    const handleSearchInputChange = (e) => {
        const value = e.target.value;
        setSearchQuery(value);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

        // City autocomplete
        if (value.trim().length >= 2) {
            const q = value.trim().toLowerCase();
            const matches = POPULAR_CITIES.filter(c =>
                c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
            ).slice(0, 6);
            setCitySuggestions(matches);
            setShowCitySuggestions(matches.length > 0);
        } else {
            setShowCitySuggestions(false);
        }

        if (value.trim().length >= 3) {
            searchDebounceRef.current = setTimeout(() => {
                setHasSearched(true);
                setDisplayCount({ venues: PAGE_SIZE, tours: PAGE_SIZE, series: PAGE_SIZE, daily: PAGE_SIZE_DAILY, live: PAGE_SIZE_LIVE });
                trackSearchEvent('auto_search', { query: value, tab: activeTab });
                fetchAllData({ includeVenues: true });
            }, SEARCH_DEBOUNCE_MS);
        }
    };

    // City suggestion click handler
    const handleCitySuggestionClick = (city) => {
        // Clear any pending search debounce to prevent double-fetch
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        setSearchQuery(city.name + ', ' + city.state);
        setSelectedCity(city);
        setUserLocation(null);
        setShowCitySuggestions(false);
        setHasSearched(true);
        trackSearchEvent('city_select', { city: city.name, state: city.state });
    };

    const handleCityClick = (city) => {
        setSelectedCity(city);
        setUserLocation(null);
    };

    // ═══ DEEP LINK PERSISTENCE: write tab + search to URL (debounced) ═══
    const deepLinkRef = useRef(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (deepLinkRef.current) clearTimeout(deepLinkRef.current);
        deepLinkRef.current = setTimeout(() => {
            const params = new URLSearchParams();
            if (activeTab !== 'venues') params.set('tab', activeTab);
            if (searchQuery) params.set('q', searchQuery);
            if (filters.venueType !== 'all') params.set('filter', filters.venueType);
            const qs = params.toString();
            const newUrl = '/hub/poker-near-me' + (qs ? '?' + qs : '');
            if (router.asPath !== newUrl) {
                router.replace(newUrl, undefined, { shallow: true });
            }
        }, 500);
        return () => { if (deepLinkRef.current) clearTimeout(deepLinkRef.current); };
    }, [activeTab, searchQuery, filters.venueType]); // eslint-disable-line react-hooks/exhaustive-deps

    // Read deep link params on mount
    useEffect(() => {
        if (router.query.q) setSearchQuery(String(router.query.q));
        if (router.query.tab && TAB_ORDER.includes(router.query.tab)) {
            setActiveTab(String(router.query.tab));
        }
        if (router.query.filter) {
            setFilters(prev => ({ ...prev, venueType: String(router.query.filter) }));
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ═══ SWIPE GESTURE HANDLERS ═══
    const handleTouchStart = useCallback((e) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
        touchEndRef.current = null;
    }, []);

    const handleTouchMove = useCallback((e) => {
        touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (!touchStartRef.current || !touchEndRef.current) return;
        const dx = touchEndRef.current.x - touchStartRef.current.x;
        const dy = touchEndRef.current.y - touchStartRef.current.y;
        const elapsed = Date.now() - touchStartRef.current.time;
        // Must be a horizontal swipe: fast, horizontal dominant, > 80px
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 500) {
            const currentIdx = TAB_ORDER.indexOf(activeTab);
            if (currentIdx === -1) return;
            if (dx < 0 && currentIdx < TAB_ORDER.length - 1) {
                setActiveTab(TAB_ORDER[currentIdx + 1]);
            } else if (dx > 0 && currentIdx > 0) {
                setActiveTab(TAB_ORDER[currentIdx - 1]);
            }
        }
        touchStartRef.current = null;
        touchEndRef.current = null;
    }, [activeTab]);

    // ═══ PULL-TO-REFRESH ═══
    const pullDistanceRef = useRef(0);
    const handlePullStart = useCallback((e) => {
        if (window.scrollY <= 0) {
            pullStartRef.current = e.touches[0].clientY;
        }
    }, []);

    const handlePullMove = useCallback((e) => {
        if (pullStartRef.current === null) return;
        const diff = e.touches[0].clientY - pullStartRef.current;
        if (diff > 0 && diff < 150) {
            pullDistanceRef.current = diff;
            setPullDistance(diff);
        }
    }, []);

    const handlePullEnd = useCallback(() => {
        const dist = pullDistanceRef.current;
        if (dist > 80 && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(0);
            pullDistanceRef.current = 0;
            fetchAllData({ includeVenues: true }).finally(() => {
                setIsRefreshing(false);
            });
        } else {
            setPullDistance(0);
            pullDistanceRef.current = 0;
        }
        pullStartRef.current = null;
    }, [isRefreshing]); // eslint-disable-line react-hooks/exhaustive-deps

    // ═══ PUSH NOTIFICATION REGISTRATION ═══
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPushPermission(Notification.permission);
        }
    }, []);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`pnm:${user?.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables' }, () => { fetchAllData({ includeVenues: true }); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id]);

    const requestPushPermission = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!('Notification' in window)) return;
        try {
            const result = await Notification.requestPermission();
            setPushPermission(result);
            if (result === 'granted') {
                trackSearchEvent('push_enabled', {});
            }
        } catch (e) {
            console.error('Push permission error:', e);
        }
    }, []);

    // ═══ FAVORITES TAB RENDERER ═══
    const renderFavorites = () => {
        const favVenues = (allVenuesForMap.length > 0 ? allVenuesForMap : venues).filter(v => isFavorited('venue', v.id));
        const favCount = Object.keys(favorites).filter(k => favorites[k]).length;

        if (favCount === 0) {
            return (
                <div className="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                    <p>No Favorites Yet</p>
                    <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Tap the ♥ icon on any venue to save it here</p>
                </div>
            );
        }

        return (
            <>
                <div className="results-bar">
                    <span className="results-count">{favVenues.length} saved venue{favVenues.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="card-grid">
                    {favVenues.map((venue, i) => (
                        <VenueCard
                            key={venue.id || i}
                            venue={venue}
                            isFavorited={true}
                            isNewcomer={isNewcomerFriendly(venue)}
                            onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                            promotionVenueIds={promotionVenueIds}
                            router={router}
                        />
                    ))}
                </div>
            </>
        );
    };

    const clearFilters = () => {
        setSelectedCity(null);
        setUserLocation(null);
        setSearchQuery('');
        setHasSearched(false);
        setVenues([]);
        setShowCitySuggestions(false);
        setFetchError(null);
        setDisplayCount(prev => ({ ...prev, venues: PAGE_SIZE }));
        setFilters({
            radius: 50,
            venueType: 'all',
            hasNLH: false,
            hasPLO: false,
            hasMixed: false,
            tourType: 'all',
            seriesTimeframe: 90,
            seriesType: 'all',
            selectedDay: getCurrentDay(),
            minBuyin: '',
            maxBuyin: '',
            stakes: 'all',
            gameType: 'all'
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
        if (activeTab === 'favorites') {
            return renderFavorites();
        }

        // For venues tab: show search landing if no search yet, skip skeleton
        if (activeTab === 'venues' && !hasSearched) {
            return renderVenues();
        }

        // Show loading for venues tab specifically
        if (activeTab === 'venues' && venueLoading) {
            return renderSkeletons(8);
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
            case 'roadtrip':
                return <RoadTripPlanner venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} userLocation={userLocation} dailyTournaments={dailyTournaments} series={series} />;
            case 'social':
                return <SocialLayer userId={userId} userLocation={userLocation} venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} authToken={user?.access_token} />;
            case 'alerts':
                return <TournamentAlerts dailyTournaments={dailyTournaments} userId={userId} authToken={user?.access_token} />;
            case 'nearnow':
                return <NearMeNowFeed userLocation={userLocation} venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} />;
            case 'calculator':
                return <TripCostCalculator venues={allVenuesForMap.length > 0 ? allVenuesForMap : venues} userLocation={userLocation} />;
            case 'calendar':
                return <SeasonalCalendar series={series} tours={tours} dailyTournaments={dailyTournaments} />;
            default:
                return renderVenues();
        }
    };

    const renderMap = () => {
        // Use searched venues if a search/GPS is active, otherwise fallback to all venues
        let baseVenues = (hasSearched && venues.length > 0) ? venues : allVenuesForMap;
        let filteredVenues = baseVenues;
        if (mapFilters.cashGames) {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
        }
        if (mapFilters.tournaments) {
            filteredVenues = filteredVenues.filter(v => v.has_tournaments);
        }
        if (mapFilters.is24Hours) {
            filteredVenues = filteredVenues.filter(v => v.is_24_hours || (v.hours_of_operation && v.hours_of_operation.includes('24')));
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
        if (filters.gameType === 'cash') {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.length > 0);
        } else if (filters.gameType === 'mtt') {
            filteredVenues = filteredVenues.filter(v => v.has_tournaments);
        } else if (filters.gameType === 'mixed') {
            filteredVenues = filteredVenues.filter(v => v.games_offered && v.games_offered.some(g => /mixed|horse|8-game/i.test(g)));
        }

        if (filters.stakes === '$1/2') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('1/2') || s.includes('1/3')));
        } else if (filters.stakes === '$2/5') {
            filteredVenues = filteredVenues.filter(v => v.stakes_cash && v.stakes_cash.some(s => s.includes('2/5')));
        } else if (filters.stakes === '$5/10+') {
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
                        <span className="map-stats">{filteredVenues.length} rooms • {liveGames.length} active tables • {dailyTournaments.length} tournaments today</span>
                    </div>

                    {/* Quick Filter Chips */}
                    <div className="map-filter-chips">
                        <button className={'filter-chip' + (mapFilters.cashGames ? ' active' : '')} onClick={() => toggleMapFilter('cashGames')}>
                            <span className="chip-dot cash"></span> Cash Games
                        </button>
                        <button className={'filter-chip' + (mapFilters.tournaments ? ' active' : '')} onClick={() => toggleMapFilter('tournaments')}>
                            <span className="chip-dot mtt"></span> Tournaments
                        </button>
                        <button className={'filter-chip' + (mapFilters.is24Hours ? ' active' : '')} onClick={() => toggleMapFilter('is24Hours')}>
                            <span className="chip-dot live"></span> 24/7 Open
                        </button>
                        <button className={'filter-chip' + (mapFilters.lowStakes ? ' active' : '')} onClick={() => toggleMapFilter('lowStakes')}>
                            <span className="chip-dot stakes"></span> Low Stakes
                        </button>
                        <button className={'filter-chip' + (mapFilters.topRated ? ' active' : '')} onClick={() => toggleMapFilter('topRated')}>
                            <span className="chip-dot rated"></span> Top Rated
                        </button>
                    </div>

                    {/* Map Container - wrapped in Error Boundary */}
                    <MapErrorBoundary>
                        <VenueMap
                            key={filteredVenues.length + '-' + (filteredVenues[0]?.id || 'none') + '-' + (filteredVenues[filteredVenues.length - 1]?.id || 'none')}
                            venues={filteredVenues}
                            userLocation={userLocation}
                        />
                    </MapErrorBoundary>

                    {/* Recenter Button */}
                    {userLocation && (
                        <button className="map-recenter-btn" onClick={requestGpsLocation} aria-label="Recenter on my location">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                            </svg>
                            My Location
                        </button>
                    )}

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
                                    <div className="room-card-location">
                                        {venue.city}, {venue.state}
                                        {venue.distance_mi && <span className="room-distance"> • {venue.distance_mi.toFixed(1)} mi</span>}
                                    </div>
                                    <div className="room-card-tags">
                                        {venue.venue_type && <span className="room-tag">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</span>}
                                        {venue.has_tournaments && <span className="room-tag"> • Tournaments</span>}
                                        {venue.games_offered && venue.games_offered.length > 0 && <span className="room-tag"> • {venue.games_offered.slice(0, 3).join(', ')}</span>}
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
                                        className={'sidebar-chip' + (filters.gameType === type.toLowerCase() ? ' active' : '')}
                                        onClick={() => setFilters(p => ({ ...p, gameType: type.toLowerCase() }))}
                                    >{type === 'all' ? 'All' : type}</button>
                                ))}
                            </div>
                        </div>

                        {/* Stakes */}
                        <div className="sidebar-filter-group">
                            <label className="sidebar-label">Stakes</label>
                            <div className="sidebar-chips">
                                {['all', '$1/2', '$2/5', '$5/10+'].map(stake => (
                                    <button
                                        key={stake}
                                        className={'sidebar-chip' + (filters.stakes === stake ? ' active' : '')}
                                        onClick={() => setFilters(p => ({ ...p, stakes: stake }))}
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
                                    value={filters.minBuyin}
                                    onChange={e => setFilters(p => ({ ...p, minBuyin: e.target.value }))}
                                />
                                <span className="range-divider">—</span>
                                <input
                                    type="number"
                                    placeholder="Max"
                                    className="sidebar-input"
                                    value={filters.maxBuyin}
                                    onChange={e => setFilters(p => ({ ...p, maxBuyin: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* Amenities group completely removed per Real Filters mandate */}

                        <button className="sidebar-apply-btn" onClick={() => {
                            setHasSearched(true);
                            fetchAllData({ includeVenues: true });
                        }}>
                            Apply Filters
                        </button>
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
                            <option value="distance">Distance (Nearest First)</option>
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
                            objectFit: 'contain'
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
                        <Image src="/images/poker-near-me-hud-frame-clean.png" alt="" width={1024} height={367} className="hud-bg-frame" />

                        <div className="hud-content-overlay">
                            {/* SEARCH BAR & BUTTON */}
                            <form className="hud-abs-search-form" onSubmit={handleSearch}>
                                <input
                                    type="text"
                                    className="hud-abs-search-input"
                                    placeholder=""
                                    value={searchQuery}
                                    onChange={handleSearchInputChange}
                                    autoComplete="off"
                                />
                                <button type="submit" className="hud-abs-search-btn" aria-label="Search"></button>
                            </form>

                            {/* GPS & FILTERS */}
                            <button className={'hud-abs-gps-btn' + (userLocation ? ' active' : '')} onClick={requestGpsLocation} disabled={gpsLoading} aria-label="Use GPS"></button>
                            <button className={'hud-abs-filter-btn' + (showFilters ? ' active' : '')} onClick={() => setShowFilters(!showFilters)} aria-label="Filters"></button>

                            {/* TABS */}
                            <button className="hud-abs-tab hud-abs-tab-venues" onClick={() => setActiveTab('venues')} aria-label="Venues"></button>
                            <button className="hud-abs-tab hud-abs-tab-tours" onClick={() => setActiveTab('tours')} aria-label="Tours"></button>
                            <button className="hud-abs-tab hud-abs-tab-series" onClick={() => setActiveTab('series')} aria-label="Series"></button>
                            <button className="hud-abs-tab hud-abs-tab-daily" onClick={() => setActiveTab('daily')} aria-label="Daily"></button>
                            <button className="hud-abs-tab hud-abs-tab-live" onClick={() => setActiveTab('live')} aria-label="Live"></button>
                            <button className="hud-abs-tab hud-abs-tab-map" onClick={() => setActiveTab('map')} aria-label="Map"></button>
                        </div>
                    </div>

                    {/* ═══ MOBILE TAB BAR — visible, accessible tab navigation ═══ */}
                    <div className="mobile-tab-bar" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        {[
                            { key: 'venues', label: 'Venues', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /><circle cx="12" cy="11" r="2" fill="currentColor" stroke="none" /></svg> },
                            { key: 'tours', label: 'Tours', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg> },
                            { key: 'series', label: 'Series', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
                            { key: 'daily', label: 'Daily', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" /></svg> },
                            { key: 'live', label: 'Live', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" fill="#ef4444" /><circle cx="12" cy="12" r="7" stroke="#ef4444" strokeWidth="1.5" opacity="0.5" /><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="1" opacity="0.25" /></svg> },
                            { key: 'map', label: 'Map', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg> },
                            { key: 'favorites', label: 'Saved', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg> },
                            { key: 'roadtrip', label: 'Trip', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 17h2l2-8h4l-1 4h3l5-6" /><circle cx="6.5" cy="17.5" r="2.5" fill="none" /><circle cx="16.5" cy="17.5" r="2.5" fill="none" /></svg> },
                            { key: 'social', label: 'Friends', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg> },
                            { key: 'alerts', label: 'Alerts', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /><circle cx="18" cy="4" r="2.5" fill="#ef4444" stroke="none" /></svg> },
                            { key: 'nearnow', label: 'Near Me', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" fill="#d4a853" /><circle cx="12" cy="12" r="7" stroke="#d4a853" strokeWidth="1" opacity="0.4" /><circle cx="12" cy="12" r="10.5" stroke="#d4a853" strokeWidth="0.8" opacity="0.2" /></svg> },
                            { key: 'calculator', label: 'Cost', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="12" y2="14" /></svg> },
                            { key: 'calendar', label: 'Calendar', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><circle cx="8" cy="14" r="1" fill="#22c55e" stroke="none" /><circle cx="12" cy="14" r="1" fill="#3b82f6" stroke="none" /><circle cx="16" cy="14" r="1" fill="#d4a853" stroke="none" /></svg> },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                className={'mtab' + (activeTab === tab.key ? ' active' : '')}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                <span className="mtab-icon">{tab.icon}</span>
                                <span className="mtab-label">{tab.label}</span>
                                {tab.key === 'live' && liveGames.length > 0 && <span className="mtab-badge">{liveGames.length}</span>}
                                {tab.key === 'favorites' && Object.keys(favorites).filter(k => favorites[k]).length > 0 && <span className="mtab-badge fav">{Object.keys(favorites).filter(k => favorites[k]).length}</span>}
                            </button>
                        ))}
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

                    {/* Filter Panel (below HUD) */}
                    {showFilters && (
                        <div className="filter-panel" style={{ maxWidth: 720, margin: '0 auto 16px', padding: 16, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}>
                            {activeTab === 'venues' && (
                                <>
                                    <div className="filter-group">
                                        <label>Search Radius (Miles)</label>
                                        <div className="filter-chips">
                                            {[25, 50, 100, 250, 'Any'].map(dist => (
                                                <button key={dist} type="button" className={'chip' + (filters.radius === dist ? ' active' : '')}
                                                    onClick={() => {
                                                        const newFilters = { ...filters, radius: dist };
                                                        setFilters(newFilters);
                                                        // Automatically trigger a refresh of venue data when radius changes
                                                        setHasSearched(true);
                                                    }}>
                                                    {dist === 'Any' ? 'Anywhere' : `${dist} mi`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
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
                                    <label>Buy-In Range</label>
                                    <div className="filter-inputs" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                        <input type="number" placeholder="Min $" value={filters.minBuyin}
                                            onChange={e => setFilters({ ...filters, minBuyin: e.target.value })}
                                            style={{ width: 100, padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 14 }} />
                                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>To</span>
                                        <input type="number" placeholder="Max $" value={filters.maxBuyin}
                                            onChange={e => setFilters({ ...filters, maxBuyin: e.target.value })}
                                            style={{ width: 100, padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 14 }} />
                                    </div>
                                </div>
                            )}
                            <button onClick={() => {
                                setHasSearched(true);
                                fetchAllData({ includeVenues: true });
                                setShowFilters(false);
                            }}
                                style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg, #d4a853, #b8860b)', border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                                Apply Filters
                            </button>
                        </div>
                    )}

                    {/* Main Content — with swipe + pull-to-refresh */}
                    <main
                        className="pnm-content"
                        ref={contentRef}
                        onTouchStart={(e) => { handleTouchStart(e); handlePullStart(e); }}
                        onTouchMove={(e) => { handleTouchMove(e); handlePullMove(e); }}
                        onTouchEnd={() => { handleTouchEnd(); handlePullEnd(); }}
                    >
                        {/* Pull-to-refresh indicator */}
                        {(pullDistance > 0 || isRefreshing) && (
                            <div className="pull-indicator" style={{ height: isRefreshing ? 40 : pullDistance * 0.5, opacity: isRefreshing ? 1 : Math.min(pullDistance / 80, 1) }}>
                                <span className={isRefreshing ? 'pull-spinner' : ''}>{isRefreshing ? '↻ Refreshing...' : pullDistance > 80 ? '↑ Release to refresh' : '↓ Pull to refresh'}</span>
                            </div>
                        )}

                        {/* City autocomplete dropdown */}
                        {showCitySuggestions && citySuggestions.length > 0 && (
                            <div className="city-autocomplete">
                                {citySuggestions.map((city, i) => (
                                    <button key={i} className="city-suggestion" onClick={() => handleCitySuggestionClick(city)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                                            <circle cx="12" cy="10" r="3" />
                                        </svg>
                                        {city.name}, {city.state}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Fetch error retry banner */}
                        {fetchError && (
                            <div className="fetch-error-banner" onClick={() => { setFetchError(null); fetchAllData({ includeVenues: true }); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                {fetchError}
                            </div>
                        )}

                        {/* Push notification opt-in */}
                        {pushPermission === 'default' && userLocation && (
                            <div className="push-optin-banner">
                                <span>🔔 Get notified when you’re near a poker room?</span>
                                <button onClick={requestPushPermission}>Enable</button>
                                <button onClick={() => setPushPermission('dismissed')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>Dismiss</button>
                            </div>
                        )}

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

                    {/* Voice Search Floating Button (Feature #11) */}
                    <VoiceSearch
                        onResult={(parsed) => {
                            if (parsed.searchQuery) setSearchQuery(parsed.searchQuery);
                            if (parsed.filters.gameType) setFilters(f => ({ ...f, gameType: parsed.filters.gameType }));
                            if (parsed.filters.radius) setFilters(f => ({ ...f, radius: parsed.filters.radius }));
                            if (parsed.filters.stakes) setFilters(f => ({ ...f, stakes: parsed.filters.stakes }));
                            if (parsed.filters.venueType) setFilters(f => ({ ...f, venueType: parsed.filters.venueType }));
                            if (parsed.filters.minBuyin) setFilters(f => ({ ...f, minBuyin: parsed.filters.minBuyin }));
                            if (parsed.filters.maxBuyin) setFilters(f => ({ ...f, maxBuyin: parsed.filters.maxBuyin }));
                            if (parsed.filters.tab) setActiveTab(parsed.filters.tab);
                            setHasSearched(true);
                            fetchAllData({ includeVenues: true });
                        }}
                    />

                    {/* Venue Reviews Panel (Feature #9) */}
                    <VenueReviews
                        venueId={reviewVenue?.id}
                        venueName={reviewVenue?.name}
                        userId={userId}
                        userName={user?.display_name || user?.email}
                        authToken={user?.access_token}
                        isOpen={!!reviewVenue}
                        onClose={() => setReviewVenue(null)}
                    />

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
                        width: 100%;
                        max-width: 1400px; /* Constrain ultra-wide stretching */
                        margin: 0 auto 0;
                        padding: 0;
                        overflow: hidden;
                    }
                    .hud-bg-frame {
                        width: 100%;
                        height: auto;
                        display: block;
                        pointer-events: none;
                        user-select: none;
                    }
                    .hud-content-overlay {
                        position: absolute;
                        inset: 0;
                        z-index: 2;
                        pointer-events: none; /* Let clicks pass through except where defined */
                    }

                    /* Interactive overlays via absolute positioning */
                    .hud-abs-search-form {
                        position: absolute;
                        top: 38%;
                        left: 18.5%;
                        width: 63%;
                        height: 12%;
                        pointer-events: none;
                    }
                    .hud-abs-search-input {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 84%;
                        height: 100%;
                        background: transparent;
                        border: none !important;
                        outline: none !important;
                        box-shadow: none !important;
                        color: #fff;
                        font-size: clamp(14px, 2.5vw, 20px);
                        padding: 0 16px 0 12%; /* Added padding to clear magnifying glass */
                        font-family: inherit;
                        caret-color: #d4a853;
                        pointer-events: auto;
                        cursor: text;
                    }
                    .hud-abs-search-input:focus {
                        outline: none !important;
                        box-shadow: none !important;
                    }
                    .hud-abs-search-input::placeholder { color: transparent; }
                    .hud-abs-search-btn {
                        position: absolute;
                        top: 0;
                        right: 0;
                        width: 14%;
                        height: 100%;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        pointer-events: auto;
                        outline: none !important;
                    }

                    .hud-abs-gps-btn { position: absolute; top: 54%; left: 29%; width: 11%; height: 10%; background: transparent; border: none; cursor: pointer; pointer-events: auto; }
                    .hud-abs-filter-btn { position: absolute; top: 54%; left: 60%; width: 11%; height: 10%; background: transparent; border: none; cursor: pointer; pointer-events: auto; }

                    .hud-abs-tab { position: absolute; top: 68%; height: 10%; background: transparent; border: none; cursor: pointer; pointer-events: auto; }
                    .hud-abs-tab-venues { left: 23%; width: 9%; }
                    .hud-abs-tab-tours { left: 33%; width: 8%; }
                    .hud-abs-tab-series { left: 42%; width: 8.5%; }
                    .hud-abs-tab-daily { left: 51.5%; width: 7.5%; }
                    .hud-abs-tab-live { left: 60%; width: 8%; }
                    .hud-abs-tab-map { left: 69%; width: 8%; }


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

                    /* Filter Panel Controls */
                    .filter-group {
                        margin-bottom: 20px;
                    }
                    .filter-group label {
                        display: block;
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        margin-bottom: 10px;
                        font-weight: 500;
                    }
                    .filter-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .chip {
                        padding: 8px 16px;
                        background: rgba(0,0,0,0.4);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 20px;
                        color: rgba(255,255,255,0.7);
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .chip:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(255,255,255,0.2);
                        color: #fff;
                    }
                    .chip.active {
                        background: rgba(212,168,83,0.2);
                        border-color: rgba(212,168,83,0.5);
                        color: #d4a853;
                    }

                    /* ═══ CITY AUTOCOMPLETE DROPDOWN ═══ */
                    .city-autocomplete {
                        background: rgba(15,23,42,0.98);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 10px;
                        overflow: hidden;
                        margin-bottom: 12px;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    }
                    .city-suggestion {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        width: 100%;
                        padding: 12px 14px;
                        background: transparent;
                        border: none;
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.8);
                        font-size: 14px;
                        text-align: left;
                        cursor: pointer;
                        transition: background 0.15s;
                    }
                    .city-suggestion:last-child { border-bottom: none; }
                    .city-suggestion:hover {
                        background: rgba(212,168,83,0.1);
                        color: #d4a853;
                    }

                    /* ═══ PULL-TO-REFRESH ═══ */
                    .pull-indicator {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                        font-size: 13px;
                        color: rgba(255,255,255,0.6);
                        transition: height 0.15s;
                    }
                    .pull-spinner {
                        animation: spin 0.8s linear infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }

                    /* ═══ FETCH ERROR BANNER ═══ */
                    .fetch-error-banner {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px 16px;
                        margin-bottom: 12px;
                        background: rgba(239,68,68,0.12);
                        border: 1px solid rgba(239,68,68,0.3);
                        border-radius: 10px;
                        color: #f87171;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    .fetch-error-banner:hover {
                        background: rgba(239,68,68,0.2);
                    }

                    /* ═══ PUSH NOTIFICATION OPT-IN ═══ */
                    .push-optin-banner {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px;
                        margin-bottom: 12px;
                        background: rgba(59,130,246,0.1);
                        border: 1px solid rgba(59,130,246,0.2);
                        border-radius: 10px;
                        font-size: 13px;
                        color: rgba(255,255,255,0.7);
                        flex-wrap: wrap;
                    }
                    .push-optin-banner span {
                        flex: 1;
                        min-width: 180px;
                    }
                    .push-optin-banner button:first-of-type {
                        padding: 6px 16px;
                        background: rgba(59,130,246,0.25);
                        border: 1px solid rgba(59,130,246,0.4);
                        border-radius: 8px;
                        color: #60a5fa;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                    }

                    /* ═══ FAVORITES BADGE VARIANT ═══ */
                    .mtab-badge.fav {
                        background: #ef4444;
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

                    /* ═══ MOBILE TAB BAR ═══ */
                    .mobile-tab-bar {
                        display: none;
                    }
                    @media (max-width: 768px) {
                        .mobile-tab-bar {
                            display: flex;
                            justify-content: space-between;
                            gap: 2px;
                            padding: 6px 8px;
                            margin: -8px 4px 8px;
                            background: rgba(15,23,42,0.8);
                            border: 1px solid rgba(255,255,255,0.08);
                            border-radius: 12px;
                            backdrop-filter: blur(10px);
                            -webkit-backdrop-filter: blur(10px);
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                        }
                    }
                    .mtab {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 2px;
                        padding: 8px 4px;
                        border-radius: 8px;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        transition: all 0.2s;
                        position: relative;
                        min-width: 0;
                    }
                    .mtab.active {
                        background: rgba(212,168,83,0.15);
                        box-shadow: inset 0 -2px 0 #d4a853;
                    }
                    .mtab-icon {
                        font-size: 16px;
                        line-height: 1;
                    }
                    .mtab-label {
                        font-size: 9px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.5);
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                    }
                    .mtab.active .mtab-label {
                        color: #d4a853;
                    }
                    .mtab-badge {
                        position: absolute;
                        top: 2px;
                        right: 4px;
                        background: #ef4444;
                        color: #fff;
                        font-size: 8px;
                        font-weight: 700;
                        padding: 1px 4px;
                        border-radius: 8px;
                        min-width: 14px;
                        text-align: center;
                        animation: livePulse 2s ease-in-out infinite;
                    }

                    /* ═══ MAP RECENTER BUTTON ═══ */
                    .map-recenter-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin: 8px 0;
                        padding: 10px 16px;
                        background: rgba(59,130,246,0.15);
                        border: 1px solid rgba(59,130,246,0.3);
                        border-radius: 10px;
                        color: #60a5fa;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .map-recenter-btn:hover {
                        background: rgba(59,130,246,0.25);
                    }

                    /* ═══ ROOM DISTANCE LABEL ═══ */
                    .room-distance {
                        color: #4ade80;
                        font-weight: 500;
                    }

                    /* ═══ COMPREHENSIVE MOBILE OPTIMIZATION ═══ */

                    /* Base: padding/margin reductions */
                    @media (max-width: 640px) {
                        .pnm-page {
                            padding-bottom: 24px;
                        }
                        .pnm-hud-panel {
                            padding: 0 2px;
                        }
                        .hud-content-overlay {
                            padding: 16% 12% 10%;
                        }
                        .pnm-content {
                            padding: 0 10px;
                        }
                        .results-bar {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 6px;
                            padding: 8px 0;
                        }
                        .quick-actions {
                            flex-wrap: wrap;
                        }

                        /* Card grid: single column on mobile */
                        .card-grid {
                            grid-template-columns: 1fr !important;
                            gap: 12px;
                        }
                        .entity-card {
                            padding: 14px;
                        }
                        .entity-card h4 {
                            font-size: 15px;
                        }

                        /* Day selector: horizontal scroll */
                        .day-selector {
                            justify-content: flex-start;
                            flex-wrap: nowrap;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            gap: 4px;
                            padding-bottom: 4px;
                        }
                        .day-btn {
                            flex-shrink: 0;
                            padding: 8px 12px;
                            font-size: 12px;
                        }

                        /* Calendar */
                        .cal-cell {
                            min-height: 40px;
                            padding: 2px;
                        }
                        .cal-event {
                            font-size: 7px;
                        }
                        .calendar-month {
                            padding: 8px;
                        }
                        .calendar-month-title {
                            font-size: 16px;
                        }

                        /* Map */
                        .map-header-row {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 4px;
                        }
                        .map-title {
                            font-size: 18px;
                        }
                        .map-filter-chips {
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            flex-wrap: nowrap;
                            padding-bottom: 4px;
                        }
                        .filter-chip {
                            flex-shrink: 0;
                            padding: 6px 10px;
                            font-size: 12px;
                        }
                        .room-list-grid {
                            grid-template-columns: 1fr !important;
                            gap: 10px;
                        }
                        .room-list-card {
                            padding: 12px;
                        }
                        .map-recenter-btn {
                            width: 100%;
                            justify-content: center;
                        }

                        /* Filter chips */
                        .filter-chips {
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            flex-wrap: nowrap;
                            padding-bottom: 4px;
                        }
                        .chip {
                            flex-shrink: 0;
                            padding: 6px 12px;
                            font-size: 12px;
                        }

                        /* Live games */
                        .live-game-row {
                            flex-wrap: wrap;
                            gap: 6px;
                        }
                        .live-badge {
                            font-size: 10px;
                        }

                        /* View toggle */
                        .view-toggle {
                            width: 100%;
                        }
                        .view-btn {
                            flex: 1;
                            justify-content: center;
                            font-size: 11px;
                            padding: 6px 8px;
                        }

                        /* Tour cards */
                        .upcoming-series {
                            flex-direction: column;
                            text-align: center;
                            gap: 4px;
                        }

                        /* Sort controls */
                        .sort-controls {
                            width: 100%;
                        }
                        .sort-select {
                            flex: 1;
                        }

                        /* Card actions */
                        .card-actions {
                            flex-wrap: wrap;
                        }
                        .action-btn {
                            flex: 1;
                            text-align: center;
                            min-width: 80px;
                        }

                        /* Search landing */
                        .search-landing, .empty-state, .loading-state {
                            padding: 40px 16px;
                        }

                        /* Load more */
                        .load-more-btn {
                            width: 100%;
                            padding: 14px;
                        }
                    }

                    /* Mobile map sidebar: slide-up drawer instead of hidden */
                    @media (max-width: 1024px) {
                        .map-desktop-layout {
                            grid-template-columns: 1fr !important;
                        }
                        .map-sidebar {
                            display: flex !important;
                            position: fixed;
                            bottom: 0;
                            left: 0;
                            right: 0;
                            z-index: 900;
                            background: rgba(15,23,42,0.98);
                            border-top: 1px solid rgba(255,255,255,0.1);
                            border-radius: 16px 16px 0 0;
                            max-height: 50vh;
                            overflow-y: auto;
                            padding: 20px 16px;
                            box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
                            backdrop-filter: blur(12px);
                            -webkit-backdrop-filter: blur(12px);
                            transform: translateY(calc(100% - 50px));
                            transition: transform 0.3s ease;
                        }
                        .map-sidebar::before {
                            content: 'Filters ▲';
                            display: block;
                            text-align: center;
                            font-size: 12px;
                            font-weight: 600;
                            color: rgba(255,255,255,0.4);
                            margin-bottom: 12px;
                            cursor: pointer;
                        }
                        .map-sidebar:hover,
                        .map-sidebar:focus-within {
                            transform: translateY(0);
                        }
                    }

                    /* Extra-small screens (under 375px) */
                    @media (max-width: 375px) {
                        .mtab-label {
                            font-size: 8px;
                        }
                        .mtab-icon {
                            font-size: 14px;
                        }
                        .pnm-content {
                            padding: 0 6px;
                        }
                        .hud-abs-search-input {
                            font-size: 13px !important;
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
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                        background: #0f172a;
                        color: #fff;
                        border: 1px solid rgba(255,255,255,0.1);
                    }
                    .venue-popup .leaflet-popup-content {
                        margin: 0;
                    }
                    .venue-popup .leaflet-popup-tip {
                        box-shadow: none;
                        background: #0f172a;
                    }
                    .leaflet-container {
                        background: #0f172a !important;
                        font-family: 'Inter', -apple-system, sans-serif;
                    }
                    /* Leaflet controls dark theme */
                    .leaflet-control-zoom a {
                        background: rgba(15,23,42,0.9) !important;
                        color: #fff !important;
                        border-color: rgba(255,255,255,0.15) !important;
                    }
                    .leaflet-control-attribution {
                        background: rgba(15,23,42,0.8) !important;
                        color: rgba(255,255,255,0.3) !important;
                        font-size: 10px !important;
                    }
                    .leaflet-control-attribution a {
                        color: rgba(255,255,255,0.4) !important;
                    }

                    /* Two-Column Map Layout */
                    .map-desktop-layout {
                        display: grid;
                        grid-template-columns: 1fr 320px;
                        gap: 24px;
                        width: 100%;
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
