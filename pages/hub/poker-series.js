/**
 * Poker Series — Live Tournament Series Directory
 * Smarter.Poker Hub
 * ═══════════════════════════════════════════════════════
 * Matches Poker Tours page layout: sidebar + map + 2-col card grid
 * Shows currently running + upcoming (≤60 days) series by default
 */
import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, memo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import FullScreenPageOverlay from '../../src/components/ui/FullScreenPageOverlay';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import { resolveEntityCoordinates, haversineDistance } from '../../src/lib/geoUtils';
import { supabase } from '../../src/lib/supabase';

// ─── Lazy-load components ───
const VenueMap = dynamic(() => import('../../src/components/poker-near-me/VenueMap').then(m => ({ default: m.default })), { ssr: false });
const MapErrorBoundary = dynamic(() => import('../../src/components/poker-near-me/VenueMap').then(m => ({ default: m.MapErrorBoundary })), { ssr: false });

// ─── Tour Colors ───
const TOUR_COLORS = {
    'WSOP':    { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227', fill: '#c9a227' },
    'WPT':     { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626', fill: '#dc2626' },
    'WSOPC':   { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227', fill: '#c9a227' },
    'MSPT':    { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6', fill: '#3b82f6' },
    'RGPS':    { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981', fill: '#10b981' },
    'PGT':     { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6', fill: '#8b5cf6' },
    'DSE':     { bg: 'linear-gradient(135deg, #0891b2, #0e7490)', text: '#fff', border: '#06b6d4', fill: '#06b6d4' },
    'MPT':     { bg: 'linear-gradient(135deg, #4338ca, #312e81)', text: '#fff', border: '#818cf8', fill: '#818cf8' },
    'LIPS':    { bg: 'linear-gradient(135deg, #be185d, #831843)', text: '#fff', border: '#ec4899', fill: '#ec4899' },
    'VENETIAN':{ bg: 'linear-gradient(135deg, #854d0e, #713f12)', text: '#fff', border: '#d97706', fill: '#d97706' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563', fill: '#6b7280' }
};

// ─── Tour Logo Map — maps tour codes to existing /public/images/tours/ assets ───
// Used as fallback when poker_series.logo_url is null (most scraped series)
const TOUR_LOGO_MAP = {
    'WSOP':       '/images/tours/wsop.png',
    'WSOPC':      '/images/tours/wsopc.png',
    'WPT':        '/images/tours/wpt.png',
    'MSPT':       '/images/tours/mspt.png',
    'RGPS':       '/images/tours/rgps.png',
    'PGT':        '/images/tours/pgt.png',
    'CPPT':       '/images/tours/cppt.png',
    'NAPT':       '/images/tours/napt.png',
    'FPN':        '/images/tours/fpn.png',
    'LIPS':       '/images/tours/lips.png',
    'BPO':        '/images/tours/bpo.png',
    'GCPT':       '/images/tours/gcpt.jpg',
    'ROUGHRIDER': '/images/tours/roughrider.png',
    'PAT':        '/images/tours/pat.jpg',
};

const SERIES_TYPE_INFO = {
    major:      { label: 'Major', color: '#c9a227' },
    circuit:    { label: 'Circuit', color: '#3b82f6' },
    high_roller:{ label: 'High Roller', color: '#8b5cf6' },
    regional:   { label: 'Regional', color: '#10b981' },
    grassroots: { label: 'Grassroots', color: '#f59e0b' },
    charity:    { label: 'Charity', color: '#ec4899' },
};

// ─── Helpers ───
function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === '') return '';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '';
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
    return '$' + num.toLocaleString();
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (parts) {
        const date = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (parts) {
        const date = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return '';
}

function cleanHtml(s) {
    return (s || '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

function safeHref(url) {
    if (!url) return undefined;
    const s = String(url).replace(/[\x00-\x20\x7F]/g, '');
    if (/^(javascript|data|vbscript|file):/i.test(s)) return '#xss';
    return s;
}

// Smart date range — detects multi-month/season series and labels them properly
function formatSeriesDateRange(start, end) {
    if (!start) return '';
    const startFmt = formatDate(start);
    if (!end) return startFmt;
    try {
        const s = new Date(start + 'T00:00:00');
        const e = new Date(end + 'T23:59:59');
        const days = Math.round((e - s) / (1000 * 60 * 60 * 24));
        if (days <= 0) return startFmt; // same-day fallback
        if (days > 180) return `${startFmt} — Season Series`;
        if (days > 45) return `${startFmt} – ${formatDateShort(end)} · ${days}-Day Series`;
        return `${startFmt} – ${formatDate(end)}`;
    } catch {
        return startFmt;
    }
}

// ── Derive short venue identifier for series without a named tour brand ──
// Scraper stores venue name in city field ("Wynn Las Vegas Las Vegas") or it
// can be extracted from the series name itself. Returns ≤14-char uppercase label.
function deriveVenueBadge(series, seriesName) {
    // 1. Explicit venue_name / venue field
    const venue = (series.venue || series.venue_name || '').trim();
    if (venue) return venue.split(/\s+/).slice(0, 2).join(' ').toUpperCase().slice(0, 14);
    // 2. city field — scraper format: "VenueName CityName" merged together
    const cityRaw = (series.city || '').trim();
    if (cityRaw) {
        const words = cityRaw.split(/\s+/);
        const venueWords = words.length >= 3 ? words.slice(0, 2) : words.slice(0, Math.max(1, words.length - 1));
        const badge = venueWords.join(' ').toUpperCase().slice(0, 14);
        if (badge.length >= 3) return badge;
    }
    // 3. Extract venue portion from series name — stop at first generic keyword
    const STOP = /^(poker|series|championship|open|classic|tournament|cup|challenge|circuit|festival|main|event|invitational|showdown|spring|summer|fall|winter|january|february|march|april|may|june|july|august|september|october|november|december|\d{4})$/i;
    const words = seriesName.split(/\s+/);
    const stopIdx = words.findIndex(w => STOP.test(w));
    const venueWords = stopIdx > 0 ? words.slice(0, stopIdx) : words.slice(0, 2);
    return venueWords.join(' ').toUpperCase().slice(0, 14) || 'SERIES';
}

// ── Derive venue category pill for series typed as 'regional' ──
// Returns same shape as SERIES_TYPE_INFO entries: { label, color }
function deriveSeriesCategory(seriesName, city) {
    const n = ((seriesName || '') + ' ' + (city || '')).toLowerCase();
    if (/\b(card house|card room|cardroom|lounge|poker room|poker lounge|tcl\b|tch\b|lodge|hustler|bay 101|kings|lucky hearts|peppermill|bicycle|commerce|garden|rivers casino|harlow|foxhole|bestbet|parx|prime social|social poker|elite poker|live poker classic)\b/.test(n))
        return { label: 'Card Room', color: '#8b5cf6' };
    if (/\b(park|downs|kennel|track|meadow|racing|fairground)\b/.test(n))
        return { label: 'Card Room', color: '#8b5cf6' };
    if (/\b(charity|benefit|foundation)\b/.test(n))
        return { label: 'Charity', color: '#ec4899' };
    if (/\b(online|social club)\b/.test(n))
        return { label: 'Poker Club', color: '#06b6d4' };
    // Everything else is hosted by a casino
    return { label: 'Casino', color: '#f59e0b' };
}

function isSeriesLive(start, end) {
    if (!start) return false;
    const now = new Date();
    const startMs = Date.parse(start + 'T00:00:00');
    if (isNaN(startMs)) return false;
    const s = new Date(startMs);
    const endMs = end ? Date.parse(end + 'T23:59:59') : startMs;
    const e = new Date(isNaN(endMs) ? startMs : endMs);
    return now >= s && now <= e;
}

function isSeriesUpcoming(start, daysAhead = 60) {
    if (!start) return false;
    const startMs = Date.parse(start + 'T00:00:00');
    if (isNaN(startMs)) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const s = new Date(startMs);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + daysAhead);
    return s > now && s <= cutoff;
}

// Geographic logic has been centralized to src/lib/geoUtils.js

// ═══════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════
export default function PokerSeriesPage({ initialSeries = [] }) {
    const router = useRouter();
    const [isMenuOpen, setMenuOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    // ─── Data State ───
    const [allSeries, setAllSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [allVenues, setAllVenues] = useState([]);

    // Bind realtime venue and series updates to cache invalidation
    // BUG FIX: poker-series relies exclusively on getStaticProps initialSeries.
    // Setting an rtNonce previously did NOTHING except force a re-render over stale prop arrays!
    // Now we surgically intercept postgres payloads and mutate `allSeries` directly.
    useVenueRealtime((payload) => {
        if (!payload) {
            // [PS2+PS3 FIX] Use .range(0,999) to bypass Supabase 1000-row project ceiling.
            Promise.all([
                supabase.from('poker_series').select('*').or('is_suppressed.is.null,is_suppressed.eq.false').order('start_date', { ascending: true }).range(0, 999),
                supabase.from('tournament_series').select('*').or('is_suppressed.is.null,is_suppressed.eq.false').order('start_date', { ascending: true }).range(0, 499)
            ])
            .then(([psRes, tsRes]) => {
                let merged = [];
                if (tsRes.data) merged = [...tsRes.data];
                if (psRes.data) {
                    for (const ps of psRes.data) {
                        const uid = ps.series_uid;
                        if (!uid || !merged.some(t => t.series_uid === uid)) merged.push(ps);
                    }
                }
                setAllSeries(merged);
            })
            .catch(err => console.warn('[RT] Hard refresh exception:', err));
            return;
        }

        if (payload.table === 'poker_venues') {
            const { eventType, new: newRec } = payload;
            if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRec) {
                setAllVenues(prev => {
                    const next = [...prev];
                    const idx = next.findIndex(v => v.id === newRec.id);
                    if (newRec.is_suppressed === true || newRec.is_active === false) {
                        if (idx !== -1) next.splice(idx, 1);
                    } else if (idx !== -1) {
                        next[idx] = { ...next[idx], ...newRec };
                    } else {
                        next.push(newRec);
                    }
                    return next;
                });
            }
            return;
        }

        if (payload.table !== 'poker_series' && payload.table !== 'tournament_series') return;
        const { eventType, new: newRec, old: oldRec } = payload;

        setAllSeries(prev => {
            let next = [...prev];
            if (eventType === 'DELETE' && oldRec) {
                return next.filter(s => s.id !== oldRec.id);
            }
            if (eventType === 'INSERT' && newRec) {
                if (newRec.is_suppressed !== true && !next.some(s => s.id === newRec.id)) next.push(newRec);
            } else if (eventType === 'UPDATE' && newRec) {
                const idx = next.findIndex(s => s.id === newRec.id);
                if (newRec.is_suppressed === true) {
                    if (idx !== -1) next.splice(idx, 1);
                } else if (idx !== -1) {
                    next[idx] = { ...next[idx], ...newRec };
                } else {
                    next.push(newRec);
                }
            } else if (eventType === 'DELETE' && oldRec) {
                next = next.filter(s => s.id !== oldRec.id);
            }

            return next;
        });
    });
    const [userLocation, setUserLocation] = useState(null);
    const [iframeModal, setIframeModal] = useState({ isOpen: false, url: '', title: '' });

    // ─── Filter State ───
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTour, setSelectedTour] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [selectedState, setSelectedState] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const [dateRange, setDateRange] = useState('all'); // BUG FIX: default 'all' not '60d'
    // '60d' default was hiding 51% of series (105/206 have null start_date, all filtered out)
    const [distanceFilter, setDistanceFilter] = useState('all');
    const searchInputRef = useRef(null);
    const [searchFocused, setSearchFocused] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [favorites, setFavorites] = useState(() => {
        if (typeof window === 'undefined') return {};
        try {
            // Bug #7 Fix: guard against SecurityError in restricted contexts (private browsing, iframe)
            const stored = localStorage.getItem('pnm_series_favorites');
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {}; // graceful degradation — favorites just won't persist
        }
    });

    // ─── Cross-Tab Favorites Sync ───
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleStorage = (e) => {
            if (e.key === 'pnm_series_favorites') {
                try { setFavorites(JSON.parse(e.newValue || '{}')); }
                catch { setFavorites({}); }
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    // ─── URL Deep-link ───
    useEffect(() => {
        if (!router.isReady || isInitialized) return;
        const safeString = (val) => Array.isArray(val) ? val[0] : val;
        const q = safeString(router.query.q);
        const range = safeString(router.query.range);
        const tour = safeString(router.query.tour);
        const distance = safeString(router.query.distance);
        const sort = safeString(router.query.sort);

        if (q) {
            setSearchQuery(q);
            if (!range) setDateRange('all');
        }
        if (range && ['7d','14d','30d','60d','90d','6m','1y','all'].includes(range)) setDateRange(range);
        if (tour) setSelectedTour(tour);
        if (distance && ['50','100','250','500','1000'].includes(distance)) setDistanceFilter(distance);
        if (sort) setSortBy(sort);
        setIsInitialized(true);
    }, [router.isReady, router.query, isInitialized]);

    // ─── URL sync ───
    useEffect(() => {
        if (!isInitialized || !router.isReady) return;
        const params = {};
        if (searchQuery) params.q = searchQuery;
        if (dateRange !== 'all') params.range = dateRange;
        if (selectedTour !== 'all') params.tour = selectedTour;
        if (distanceFilter !== 'all') params.distance = distanceFilter;
        if (sortBy !== 'date') params.sort = sortBy;
        
        // Use clean Next.js object syntax to avoid DOM URL serialization bugs
        router.replace(
            { pathname: router.pathname, query: params },
            undefined, 
            { shallow: true }
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, dateRange, selectedTour, distanceFilter, sortBy, isInitialized, router.isReady]);

    // ─── Keyboard shortcut ─── (stable ref: no re-register on every searchQuery change)
    const searchQueryRef = useRef(searchQuery);
    searchQueryRef.current = searchQuery;
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            if (e.key === 'Escape' && searchQueryRef.current) {
                setSearchQuery('');
                searchInputRef.current?.blur();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []); // empty deps — no re-registration on every keystroke

    // Haversine distance imported from geoUtils.js
    // ─── Distance filter: auto-request geolocation ───
    const handleDistanceChange = useCallback((val) => {
        if (val === 'all') { setDistanceFilter('all'); return; }
        if (userLocation) { setDistanceFilter(val); return; }
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            // BUG FIX: Don't setDistanceFilter BEFORE GPS resolves (causes empty results for ~10s)
            // Instead: wait for position then apply filter atomically
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setDistanceFilter(val); // Applied AFTER location is set
                },
                () => {
                    // Never block JS thread with alert() — show accessible notification instead
                    console.warn('[Geo] Location access required for distance filter');
                    setDistanceFilter('all');
                },
                { timeout: 10000, enableHighAccuracy: false }
            );
        } else {
            console.warn('[Geo] Geolocation not supported');
            setDistanceFilter('all');
        }
    }, [userLocation]);

    // ─── Initial GPS for map centering ONLY ───
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                () => {} // silent fail
            );
        }
    }, []);

    const menuConfig = getMenuConfig('events');
    // ─── Fetch series data ───
    useEffect(() => { setAllSeries(initialSeries); setLoading(false); }, [initialSeries]);

    // ─── Fetch all venues for coordinate lookup ───
    useEffect(() => {
        let isMounted = true;
        const abortController = new AbortController();
        fetch('/data/all-venues.json', { signal: abortController.signal })
            .then(r => r.json())
            .then(json => {
                if (!isMounted) return;
                const v = json.venues || json.data || json || [];
                setAllVenues(Array.isArray(v) ? v : []);
            })
            .catch((e) => {
                if (!isMounted || e.name === 'AbortError') return;
                setAllVenues([]);
            });
        return () => { isMounted = false; abortController.abort(); };
    }, []);

    const findVenueCoords = useCallback((series) => {
        return resolveEntityCoordinates(series, allVenues);
    }, [allVenues]);

    // ─── Get unique tours from series data ───
    const availableTours = useMemo(() => {
        const tours = new Set();
        allSeries.forEach(s => {
            const tour = (s.tour || s.tour_code || s.short_name || '').toUpperCase();
            // Exclude scraper default values — only show real recognized tour brands
            if (tour && tour !== 'INDEPENDENT' && TOUR_COLORS[tour]) tours.add(tour);
        });
        return Array.from(tours).sort();
    }, [allSeries]);

    // ─── Get unique states from series data ───
    const availableStates = useMemo(() => {
        const states = new Set();
        allSeries.forEach(s => {
            const state = (s.state || '').toUpperCase().trim();
            if (state) states.add(state);
        });
        return Array.from(states).sort();
    }, [allSeries]);

    // ─── Date range cutoff computation ───
    // BUG FIX: Recalculate at midnight so users who leave the page open overnight see
    // correct date boundaries without needing to reload/change filter
    const [nowTick, setNowTick] = useState(0);
    useEffect(() => {
        const msUntilMidnight = () => {
            const n = new Date();
            const midnight = new Date(n); midnight.setHours(24, 0, 0, 0);
            return midnight.getTime() - n.getTime();
        };
        let timer;
        const scheduleMidnightRefresh = () => {
            timer = setTimeout(() => {
                setNowTick(t => t + 1); // force recalc
                scheduleMidnightRefresh(); // set tomorrow's timer
            }, msUntilMidnight());
        };
        scheduleMidnightRefresh();
        return () => clearTimeout(timer);
    }, []);
    const dateRangeCutoff = useMemo(() => {
        // eslint-disable-next-line no-unused-vars
        void nowTick; // dependency: recompute when midnight tick fires
        if (dateRange === 'all') return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const daysMap = {
            '7d': 7, '14d': 14, '30d': 30, '60d': 60, '90d': 90,
            '6m': 180, '1y': 365,
        };
        const days = daysMap[dateRange];
        if (!days) return null;
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() + days);
        return { start: now, end: cutoff };
    // BUG FIX: nowTick was missing here — midnight refresh never fired
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, nowTick]);

    // ─── Deferred Filter States for 120hz Unblocked Input ───
    const deferredSearchQuery = useDeferredValue(searchQuery);

    // ─── Filtered & sorted series ───
    const filteredSeries = useMemo(() => {
        let result = [...allSeries];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Date range filter — show currently running + upcoming within window
        if (dateRangeCutoff) {
            result = result.filter(s => {
                if (!s.start_date) return false;
                // Bug #9 Fix: guard against non-ISO start_date values like "TBD" or "Spring 2026"
                const startMs = Date.parse(s.start_date + 'T00:00:00');
                if (isNaN(startMs)) return false;
                const startDate = new Date(startMs);
                const endMs = s.end_date ? Date.parse(s.end_date + 'T23:59:59') : startMs;
                const endDate = new Date(isNaN(endMs) ? startMs : endMs);
                const isRunning = endDate >= today && startDate <= today;
                const isUpcoming = startDate > today && startDate <= dateRangeCutoff.end;
                return isRunning || isUpcoming;
            });
        }

        // Status filter
        if (selectedStatus !== 'all') {
            result = result.filter(s => {
                const live = isSeriesLive(s.start_date, s.end_date);
                const upcoming = !live && isSeriesUpcoming(s.start_date, 60);
                if (selectedStatus === 'live') return live;
                if (selectedStatus === 'upcoming') return upcoming;
                return true;
            });
        }

        // Tour filter
        if (selectedTour !== 'all') {
            result = result.filter(s => {
                const tour = (s.tour || s.tour_code || s.short_name || '').toUpperCase();
                return tour === selectedTour;
            });
        }

        // State filter
        if (selectedState !== 'all') {
            result = result.filter(s => {
                return (s.state || '').toUpperCase().trim() === selectedState;
            });
        }

        // Search filter (uses deferred value to never block input thread)
        if (deferredSearchQuery.trim()) {
            const q = deferredSearchQuery.toLowerCase().trim();
            result = result.filter(s =>
                cleanHtml(s.name || s.series_name || '').toLowerCase().includes(q) ||
                (s.tour || '').toLowerCase().includes(q) ||
                (s.short_name || '').toLowerCase().includes(q) ||
                (s.city || '').toLowerCase().includes(q) ||
                (s.state || '').toLowerCase().includes(q) ||
                (s.venue || s.venue_name || '').toLowerCase().includes(q)
            );
        }

        // Distance filter
        if (distanceFilter !== 'all' && userLocation) {
            const maxMiles = parseInt(distanceFilter, 10);
            if (!isNaN(maxMiles)) {
                result = result.filter(s => {
                    const coords = findVenueCoords(s);
                    if (coords && coords.latitude && coords.longitude) {
                        const dist = haversineDistance(userLocation.lat, userLocation.lng, coords.latitude, coords.longitude);
                        return dist <= maxMiles;
                    }
                    // [PS4 FIX] No coordinates: keep in list rather than silently hiding.
                    // Series without coords may still be within radius — don't exclude them.
                    return true;
                });
            }
        }

        // Sort
        switch (sortBy) {
            case 'date':
                result.sort((a, b) => (a.start_date || 'z').localeCompare(b.start_date || 'z'));
                break;
            case 'name':
                result.sort((a, b) => cleanHtml(a.name || a.series_name || '').localeCompare(cleanHtml(b.name || b.series_name || '')));
                break;
            case 'tour':
                result.sort((a, b) => (a.tour || 'z').localeCompare(b.tour || 'z'));
                break;
            case 'events':
                result.sort((a, b) => (b.events_count || b.total_events || 0) - (a.events_count || a.total_events || 0));
                break;
            case 'distance':
                if (userLocation) {
                    // Pre-calculate to avoid O(N^2) bottleneck mapping findVenueCoords inside sort comparator
                    const distCache = new Map();
                    result.forEach(s => {
                        const c = findVenueCoords(s);
                        distCache.set(s, c ? haversineDistance(userLocation.lat, userLocation.lng, c.latitude, c.longitude) : Infinity);
                    });
                    result.sort((a, b) => distCache.get(a) - distCache.get(b));
                }
                break;
            default: break;
        }

        return result;
    }, [allSeries, selectedTour, selectedStatus, selectedState, deferredSearchQuery, sortBy, dateRangeCutoff, distanceFilter, userLocation, findVenueCoords]);

    // ─── Stats ───
    const liveCount = useMemo(() => filteredSeries.filter(s => isSeriesLive(s.start_date, s.end_date)).length, [filteredSeries]);
    const totalEvents = useMemo(() => filteredSeries.reduce((acc, s) => acc + (s.events_count || s.total_events || 0), 0), [filteredSeries]);

    // ─── Build map markers ───
    const seriesVenuesForMap = useMemo(() => {
        if (filteredSeries.length === 0) return [];
        const markers = [];
        const coordsOffsetMap = {};

        filteredSeries.forEach(series => {
            const venueMatch = findVenueCoords(series);
            if (!venueMatch || !venueMatch.latitude || !venueMatch.longitude) return;

            let renderLat = venueMatch.latitude;
            let renderLng = venueMatch.longitude;

            // Offset jitter for overlapping pins
            const offsetKey = `${renderLat.toFixed(1)}_${renderLng.toFixed(1)}`;
            if (coordsOffsetMap[offsetKey] === undefined) coordsOffsetMap[offsetKey] = 0;
            const shiftIndex = coordsOffsetMap[offsetKey];
            const shiftPattern = [0, 0.008, -0.008, 0.016, -0.016, 0.024, -0.024];
            renderLng += (shiftPattern[shiftIndex % shiftPattern.length] || 0);
            coordsOffsetMap[offsetKey]++;

            const live = isSeriesLive(series.start_date, series.end_date);
            const seriesName = cleanHtml(series.name || series.series_name || 'Poker Series');
            const rawTourString = String(series.tour || series.tour_code || series.short_name || series.series_name || series.name || '').toUpperCase();
            
            // Aggressive substring matching for tour logos
            let matchedTourCode = null;
            if (rawTourString.includes('WSOPC') || rawTourString.includes('WSOP CIRCUIT')) matchedTourCode = 'WSOPC';
            else if (rawTourString.includes('WSOP')) matchedTourCode = 'WSOP';
            else if (rawTourString.includes('WPT')) matchedTourCode = 'WPT';
            else if (rawTourString.includes('MSPT')) matchedTourCode = 'MSPT';
            else if (rawTourString.includes('RGPS') || rawTourString.includes('RUNGOOD')) matchedTourCode = 'RGPS';
            else if (rawTourString.includes('PGT')) matchedTourCode = 'PGT';
            else if (rawTourString.includes('NAPT')) matchedTourCode = 'NAPT';
            else {
                // Fallback exact match attempt
                matchedTourCode = Object.keys(TOUR_LOGO_MAP || {}).find(k => rawTourString.includes(k));
            }

            // Logo cascade: (1) series own logo_url → (2) known tour brand logo → (3) resolved venue logo
            // Most poker_series rows have logo_url=null so the TOUR_LOGO_MAP fallback is critical
            const seriesLogoUrl = series.logo_url
                || (matchedTourCode ? TOUR_LOGO_MAP[matchedTourCode] : null)
                || venueMatch?.logo_url
                || venueMatch?.profile_photo_url
                || '';
            markers.push({
                id: `series-${series.id || series.series_uid || seriesName}`,
                name: seriesName,
                city: series.city || venueMatch.city || '',
                state: series.state || venueMatch.state || '',
                latitude: renderLat,
                longitude: renderLng,
                venue_type: live ? 'casino' : 'poker_club', // casino=white=live, poker_club=green=upcoming
                trust_score: 5,
                is_open: live,
                logo_url: seriesLogoUrl, // ← renders as the circle image on the map dot
                // Series-specific metadata for popups
                detailUrl: series.id ? `/hub/series/${series.id}` : null,
                series_start: series.start_date,
                series_end: series.end_date,
                dates: series.start_date && series.end_date
                    ? `${formatDateShort(series.start_date)} – ${formatDateShort(series.end_date)}`
                    : '',
                is_running: live,
            });
        });

        return markers;
    }, [filteredSeries, findVenueCoords]);

    // ─── Active filter count ───
    // Bug #10 Fix: baseline is 'all' (matching initial state), not '60d'.
    // '60d' was the old default, now we use 'all' so Clear All badge doesn't appear on fresh load.
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (searchQuery) count++;
        if (dateRange !== 'all') count++; // baseline is 'all', not '60d'
        if (selectedTour !== 'all') count++;
        if (selectedStatus !== 'all') count++;
        if (selectedState !== 'all') count++;
        if (distanceFilter !== 'all') count++;
        return count;
    }, [searchQuery, dateRange, selectedTour, selectedStatus, selectedState, distanceFilter]);

    // ─── Favorites toggle ───
    const toggleFavorite = useCallback((seriesId, e) => {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        setFavorites(prev => {
            let current = prev;
            try {
                const stored = localStorage.getItem('pnm_series_favorites');
                if (stored) current = JSON.parse(stored);
            } catch (e) { console.warn('[App] Handled exception:', e); }
            const next = { ...current };
            if (next[seriesId]) delete next[seriesId];
            else next[seriesId] = Date.now();
            try { localStorage.setItem('pnm_series_favorites', JSON.stringify(next)); } catch (e) { console.warn('[App] Handled exception:', e); }
            return next;
        });
    }, []);

    // ─── Reset all filters ───
    // Bug #1/#2 Fix: reset to 'all' not '60d' — must match initial state default
    const resetFilters = useCallback(() => {
        setSearchQuery('');
        setDateRange('all'); // matches useState default on line 252
        setSelectedTour('all');
        setSelectedStatus('all');
        setSelectedState('all');
        setDistanceFilter('all');
        setSortBy('date');
    }, []);

    return (
        <>
            <Head>
                <title>Poker Series — Live Tournament Series Directory | Smarter.Poker</title>
                <meta name="description" content="Browse all live and upcoming poker tournament series. Filter by tour (WSOP, WPT, MSPT, RGPS), date, buy-in, and location." />
                <meta property="og:title" content="Poker Series Directory | Smarter.Poker" />
                <meta property="og:description" content="Live and upcoming poker series tracked in real-time. Find your next big tournament." />
            </Head>

            <div className="pnm-page">
                {/* Space Background */}
                <div className="space-bg" />
                <div className="space-overlay" />

                {/* Header */}
                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} onBackClick={() => {
                    router.back();
                }} />

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={isMenuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* ═══ PAGE TITLE ═══ */}
                <div className="pnm-title-bar">
                    <h1 className="pnm-title">POKER SERIES</h1>
                    <p className="pnm-subtitle">
                        {filteredSeries.length} Series &bull; {liveCount} Live Now &bull; {totalEvents} Events
                    </p>

                    {/* ═══ MAIN SEARCH BAR ═══ */}
                    <form className="tours-search-bar" onSubmit={e => e.preventDefault()}>
                        <div className={`tours-search-wrap${searchFocused ? ' focused' : ''}`}>
                            <svg className="tours-search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="tours-search-bar-input outline-none focus:outline-none focus:ring-0"
                                placeholder="Search Series, Venues, Cities, States... (Ctrl+K)"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setSearchFocused(false)}
                                autoComplete="off"
                                aria-label="Search poker series"
                                id="series-search"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="tours-search-clear"
                                    onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                                    aria-label="Clear search"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* ═══ TOP FILTERS BAR — outside title bar, full-width row ═══ */}
                <div className="pnm-top-filters">
                    <div className="pnm-top-filters-inner">
                        <select className="pnm-filter-select" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} aria-label="Filter by status">
                            <option value="all">Status: All</option>
                            <option value="live">Status: Live Now</option>
                            <option value="upcoming">Status: Upcoming</option>
                        </select>

                        <select className="pnm-filter-select" value={selectedTour} onChange={e => setSelectedTour(e.target.value)} aria-label="Filter by tour">
                            <option value="all">Tour: All</option>
                            {availableTours.map(tour => (
                                <option key={tour} value={tour}>{tour}</option>
                            ))}
                        </select>

                        <select className="pnm-filter-select" value={selectedState} onChange={e => setSelectedState(e.target.value)} aria-label="Filter by state">
                            <option value="all">State: All</option>
                            {availableStates.map(st => (
                                <option key={st} value={st}>{st}</option>
                            ))}
                        </select>

                        <select className="pnm-filter-select" value={dateRange} onChange={e => setDateRange(e.target.value)} aria-label="Filter by date range">
                            <option value="all">Dates: All</option>
                            <option value="7d">Next 7 Days</option>
                            <option value="14d">Next 2 Weeks</option>
                            <option value="30d">Next 30 Days</option>
                            <option value="60d">Next 2 Months</option>
                            <option value="90d">Next 3 Months</option>
                            <option value="6m">Next 6 Months</option>
                            <option value="1y">Next Year</option>
                        </select>

                        <select className="pnm-filter-select" value={distanceFilter} onChange={e => handleDistanceChange(e.target.value)} aria-label="Filter by distance">
                            <option value="all">Within: Any Distance</option>
                            <option value="50">Within 50 Miles</option>
                            <option value="100">Within 100 Miles</option>
                            <option value="250">Within 250 Miles</option>
                            <option value="500">Within 500 Miles</option>
                            <option value="1000">Within 1,000 Miles</option>
                        </select>

                        <select className="pnm-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort by">
                            <option value="date">Sort: Start Date</option>
                            <option value="name">Sort: Name A-Z</option>
                            <option value="tour">Sort: Tour</option>
                            <option value="events">Sort: Most Events</option>
                            <option value="distance">Sort: Nearest To You</option>
                        </select>

                        {activeFilterCount > 0 && (
                            <button className="pnm-filter-clear-btn" onClick={resetFilters}>
                                Clear All
                            </button>
                        )}
                    </div>
                </div>

                {/* ═══ MAP ═══ */}
                <div className="tours-map-container" style={{ margin: '0 auto', maxWidth: '1400px', width: '100%', padding: '0 20px', boxSizing: 'border-box' }}>
                    <MapErrorBoundary>
                        <VenueMap
                            venues={seriesVenuesForMap}
                            userLocation={userLocation}
                            centerLocation={userLocation || undefined}
                            radiusMiles={distanceFilter !== 'all' ? distanceFilter : undefined}
                            hideLegend={true}
                            uniformColor="#ffffff"
                            disableClustering={true}
                            onOpenIframeModal={(url, title) => setIframeModal({ isOpen: true, url: safeHref(url), title })}
                        />
                    </MapErrorBoundary>
                </div>

                        {/* ═══ RESULTS BAR ═══ */}
                        <div className="tours-results-bar" style={{ margin: '0 auto', maxWidth: '1400px', width: '100%', padding: '0 20px', boxSizing: 'border-box' }}>
                            <div className="tours-results-count">
                                <strong>{filteredSeries.length}</strong> {filteredSeries.length === 1 ? 'Series' : 'Series Found'}
                                {liveCount > 0 && <span className="tours-stops-count"> &bull; {liveCount} Live Now</span>}
                                {totalEvents > 0 && <span className="tours-stops-count"> &bull; {totalEvents} Events</span>}
                                {searchQuery && <span className="tours-results-query"> &mdash; &ldquo;{searchQuery}&rdquo;</span>}
                                {dateRange !== 'all' && <span className="tours-results-query"> &bull; {{
                                    '7d': 'Next 7 Days', '14d': 'Next 2 Weeks', '30d': 'Next 30 Days',
                                    '60d': 'Next 2 Months', '90d': 'Next 3 Months', '6m': 'Next 6 Months', '1y': 'Next Year'
                                }[dateRange]}</span>}
                                {distanceFilter !== 'all' && <span className="tours-results-query"> &bull; Within {distanceFilter} Miles</span>}
                            </div>
                        </div>

                        {/* ═══ SERIES CARDS GRID ═══ */}
                        {loading ? (
                            <div className="tours-grid" style={{ margin: '0 auto', maxWidth: '1400px', width: '100%', padding: '0 20px', boxSizing: 'border-box' }}>
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="tour-card skeleton-pulse" style={{ pointerEvents: 'none' }}>
                                        <div className="tour-card-banner" style={{ background: 'rgba(255, 255, 255, 0.05)', height: '140px' }} />
                                        <div className="tour-card-content" style={{ padding: '20px' }}>
                                            <div style={{ width: '40%', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', marginBottom: '12px' }} />
                                            <div style={{ width: '80%', height: '24px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '6px', marginBottom: '16px' }} />
                                            <div style={{ width: '60%', height: '14px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', marginBottom: '16px' }} />
                                            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px' }}>
                                                <div style={{ width: '45%', height: '36px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }} />
                                                <div style={{ width: '45%', height: '36px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filteredSeries.length === 0 ? (
                            <div className="tours-empty">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
                                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <h3>No Matching Series</h3>
                                <p>No series match your current filters{searchQuery ? ` for "${searchQuery}"` : ''}{dateRange !== 'all' ? ` within ${{'7d':'7 days','14d':'2 weeks','30d':'30 days','60d':'2 months','90d':'3 months','6m':'6 months','1y':'1 year'}[dateRange]}` : ''}.</p>
                                <button className="tours-empty-reset" onClick={resetFilters}>
                                    Reset All Filters
                                </button>
                            </div>
                        ) : (
                            <div className="tours-grid" style={{ margin: '0 auto', maxWidth: '1400px', width: '100%', padding: '0 20px', boxSizing: 'border-box' }}>
                                {filteredSeries.map((series, idx) => {
                                    const rawTourCode = (series.tour || series.tour_code || series.short_name || '').toUpperCase();
                                    const isKnownTour = rawTourCode && rawTourCode !== 'INDEPENDENT' && TOUR_COLORS[rawTourCode];
                                    const tourCode = isKnownTour ? rawTourCode : '';
                                    const colors = TOUR_COLORS[rawTourCode] || TOUR_COLORS.default;
                                    const seriesName = cleanHtml(series.name || series.series_name || 'Poker Series');
                                    const venueName = cleanHtml(series.venue || series.venue_name || '');
                                    const live = isSeriesLive(series.start_date, series.end_date);
                                    const upcoming = !live && isSeriesUpcoming(series.start_date, 60);
                                    const seriesType = series.series_type || 'regional';
                                    // Only use SERIES_TYPE_INFO for non-regional known types
                                    const typeInfo = (seriesType !== 'regional' && SERIES_TYPE_INFO[seriesType])
                                        ? SERIES_TYPE_INFO[seriesType]
                                        : deriveSeriesCategory(seriesName, series.city);
                                    // Badge label: known tour code OR derived venue name
                                    const badgeLabel = tourCode || deriveVenueBadge(series, seriesName);
                                    const evtCount = series.events_count || series.total_events || series.event_count || 0;
                                    // BUG FIX: Use series_uid as primary key (stable across data sources)
                                    // series.id is index-based from JSON fallback vs real DB int — unstable
                                    const isFav = !!(favorites[series.series_uid || series.id]);
                                    const favKey = series.series_uid || series.id;
                                    // BUG FIX: idx + 1 is position-based — wrong when filtered list changes order.
                                    // Use stable real DB id or series_uid-derived slug; omit link if neither available.
                                    const detailUrl = series.id ? '/hub/series/' + series.id : null;
                                    const location = [series.city, series.state].filter(Boolean).join(', ') || '';

                                    // Build event preview (up to 5)
                                    const events = series.events || [];
                                    const upcomingEvents = events.filter(e => {
                                        if (!e.start_date) return true;
                                        const d = new Date(e.start_date + 'T00:00:00');
                                        return d >= new Date(new Date().toDateString());
                                    }).slice(0, 5);

                                    return (
                                        <div
                                            key={series.series_uid || series.id || idx}
                                            className="tour-card-premium"
                                            style={{
                                                borderColor: colors.border + 'A6',
                                                '--card-accent': colors.border,
                                                cursor: detailUrl ? 'pointer' : 'default',
                                            }}
                                            onClick={() => { if (detailUrl) router.push(detailUrl); }}
                                        >
                                            {/* Favorite Button */}
                                            <button
                                                className={'tour-fav-btn' + (isFav ? ' active' : '')}
                                                onClick={e => toggleFavorite(favKey, e)}
                                                aria-label="Favorite series"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? '#ef4444' : 'none'} stroke={isFav ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                                                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                                                </svg>
                                            </button>

                                            {/* Card Header — Square Logo + Badge col + Type pill */}
                                            <div className="tour-card-header" style={{ alignItems: 'flex-start' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                                                    {/* Square venue logo — top-left corner */}
                                                    {series.logo_url && (
                                                        <div style={{
                                                            width: 58,
                                                            height: 58,
                                                            flexShrink: 0,
                                                            borderRadius: 8,
                                                            overflow: 'hidden',
                                                            border: '1px solid rgba(255,255,255,0.12)',
                                                            background: 'rgba(0,0,0,0.35)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}>
                                                            <img
                                                                src={series.logo_url}
                                                                alt={seriesName}
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'contain',
                                                                    display: 'block',
                                                                    padding: 4,
                                                                    boxSizing: 'border-box',
                                                                }}
                                                                loading="lazy"
                                                                onError={e => { e.target.parentElement.style.display = 'none'; }}
                                                            />
                                                        </div>
                                                    )}
                                                    {/* Tour badge + series name stacked */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                                                        <div
                                                            className="tour-code-badge"
                                                            style={{ background: colors.bg, border: '1px solid ' + colors.border, alignSelf: 'flex-start' }}
                                                        >
                                                            <span style={{ color: colors.text, fontSize: isKnownTour ? 14 : 11, fontWeight: 800, letterSpacing: isKnownTour ? '0.5px' : '0.3px', textTransform: 'uppercase' }}>
                                                                {badgeLabel}
                                                            </span>
                                                        </div>
                                                        {/* Series Name lives inside header col when logo present */}
                                                        <h4 className="tour-card-name" style={{ margin: 0 }}>{seriesName}</h4>
                                                    </div>
                                                </div>
                                                <span
                                                    className="tour-type-pill"
                                                    style={{ color: typeInfo.color, borderColor: typeInfo.color + '40', background: typeInfo.color + '15', flexShrink: 0 }}
                                                >
                                                    {typeInfo.label}
                                                </span>
                                            </div>

                                            {/* Venue + Location with LIVE/UPCOMING badge */}
                                            <div className="tour-card-location-live">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={live ? '#22c55e' : upcoming ? '#60a5fa' : 'currentColor'} strokeWidth="2" style={{ flexShrink: 0 }}>
                                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                                                    </svg>
                                                    {live && (
                                                        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 11, letterSpacing: '0.3px' }}>
                                                            LIVE NOW
                                                        </span>
                                                    )}
                                                    {upcoming && !live && (
                                                        <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 11, letterSpacing: '0.3px' }}>
                                                            UPCOMING
                                                        </span>
                                                    )}
                                                    {!live && !upcoming && (
                                                        <span style={{ color: 'rgba(148,163,184,0.6)', fontWeight: 600, fontSize: 11 }}>
                                                            SCHEDULED
                                                        </span>
                                                    )}
                                                </div>
                                                {venueName && <span className="tour-stop-venue">{venueName}</span>}
                                                {location && <span className="tour-stop-location">{location}</span>}
                                            </div>

                                            {/* Date Range */}
                                            {(series.start_date || series.end_date) && (
                                                <div className="tour-card-buyins">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                                    </svg>
                                                    <span>
                                                        {formatSeriesDateRange(series.start_date, series.end_date)}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Buy-In + Guarantee + Event Count Tags */}
                                            <div className="tour-card-tags">
                                                {evtCount > 0 && (
                                                    <span className="tour-region-tag" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: 'rgba(34,197,94,0.85)' }}>
                                                        {evtCount} Events
                                                    </span>
                                                )}
                                                {series.main_event_buyin && (
                                                    <span className="tour-region-tag" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.3)', color: '#ffffff' }}>
                                                        {formatMoney(series.main_event_buyin)} Main
                                                    </span>
                                                )}
                                                {(series.total_guaranteed || series.main_event_guaranteed) && (
                                                    <span className="tour-region-tag" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.3)', color: '#ffffff' }}>
                                                        {formatMoney(series.total_guaranteed || series.main_event_guaranteed)} GTD
                                                    </span>
                                                )}
                                            </div>

                                            {/* Event Preview (up to 5 events) */}
                                            {upcomingEvents.length > 0 && (
                                                <div className="tour-card-series">
                                                    <div className="tour-series-header">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                                        </svg>
                                                        Events ({events.length})
                                                    </div>
                                                    {upcomingEvents.map((evt, i) => (
                                                        <div key={evt.id || evt.event_uid || i} className="tour-series-item">
                                                            <span className="tour-series-name">{cleanHtml(evt.event_name || evt.name || `Event ${i + 1}`)}</span>
                                                            <span className="tour-series-dates">
                                                                {evt.buy_in ? formatMoney(evt.buy_in) : formatDateShort(evt.start_date)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {events.length > 5 && (
                                                        <div className="tour-series-more">
                                                            +{events.length - 5} more event{events.length - 5 > 1 ? 's' : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Card Footer */}
                                            <div className="tour-card-footer">
                                                <span className="tour-card-established"></span>
                                                <div className="tour-card-actions">
                                                    {detailUrl && <span className="tour-action-btn primary">View Schedule</span>}
                                                    {series.source_url && (
                                                        <a
                                                            href={safeHref(series.source_url)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="tour-action-btn"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            Source
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
    
                <FullScreenPageOverlay
                    isOpen={iframeModal.isOpen}
                    onClose={() => setIframeModal({ isOpen: false, url: '', title: '' })}
                    url={iframeModal.url}
                    title={iframeModal.title}
                />

                {/* ═══════════════════════════════════════ */}
                {/* STYLES — Matching Poker Tours layout   */}
                {/* ═══════════════════════════════════════ */}
                <style>{`
                    .pnm-page {
                        min-height: 100vh;
                        padding-bottom: 70px;
                        display: flex;
                        flex-direction: column;
                        position: relative;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                    }

                    /* ═══ PAGE TITLE BAR ═══ */
                    .pnm-title-bar {
                        text-align: center;
                        padding: clamp(12px, 2vh, 28px) 20px clamp(8px, 1.5vh, 12px);
                        position: relative;
                        flex-shrink: 0;
                    }

                    /* ═══ TOP FILTERS BAR ═══ */
                    .pnm-top-filters {
                        width: 100%;
                        padding: 8px 20px 10px;
                        background: rgba(6, 14, 26, 0.6);
                        border-top: 1px solid rgba(255,255,255,0.1);
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                        flex-shrink: 0;
                    }
                    .pnm-top-filters-inner {
                        display: flex;
                        flex-direction: row;
                        flex-wrap: nowrap;
                        align-items: stretch;
                        gap: 8px;
                        max-width: 1400px;
                        margin: 0 auto;
                        overflow-x: auto;
                        scrollbar-width: none;
                        -webkit-overflow-scrolling: touch;
                    }
                    .pnm-top-filters-inner::-webkit-scrollbar { display: none; }
                    .pnm-filter-select {
                        flex: 1 1 140px;
                        min-width: 120px;
                        max-width: 200px;
                        height: 36px;
                        padding: 0 10px 0 10px;
                        background: rgba(12, 22, 40, 0.85);
                        border: 1.5px solid rgba(255,255,255,0.25);
                        border-radius: 8px;
                        color: #ffffff;
                        font-size: 12px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        outline: none;
                        appearance: auto;
                        transition: border-color 0.2s;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        box-sizing: border-box;
                    }
                    .pnm-filter-select:hover, .pnm-filter-select:focus {
                        border-color: rgba(255,255,255,0.55);
                    }
                    .pnm-filter-select option {
                        background: #0c1423;
                        color: #e2e8f0;
                    }
                    .pnm-filter-clear-btn {
                        flex-shrink: 0;
                        height: 36px;
                        padding: 0 14px;
                        background: rgba(255,255,255,0.12);
                        border: 1.5px solid rgba(255,255,255,0.3);
                        border-radius: 8px;
                        color: #ffffff;
                        font-size: 12px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        transition: all 0.2s;
                        white-space: nowrap;
                    }
                    .pnm-filter-clear-btn:hover {
                        background: rgba(255,255,255,0.22);
                        border-color: rgba(255,255,255,0.5);
                    }
                    .pnm-title {
                        font-size: clamp(22px, 3.5vw, 36px);
                        font-weight: 900;
                        letter-spacing: clamp(1.5px, 0.3vw, 3px);
                        margin: 0;
                        background: linear-gradient(135deg, #ffffff 0%, #e2e8f0 40%, #ffffff 60%, #94a3b8 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        text-shadow: none;
                        filter: drop-shadow(0 0 20px rgba(255,255,255,0.3));
                    }
                    .pnm-subtitle {
                        margin: clamp(3px, 0.5vh, 6px) 0 0;
                        font-size: clamp(11px, 1.2vw, 14px);
                        color: rgba(148,163,184,0.6);
                        letter-spacing: 1px;
                        font-weight: 500;
                    }

                    /* ═══ MAIN SEARCH BAR ═══ */
                    .tours-search-bar {
                        max-width: 680px;
                        margin: 16px auto 0;
                        width: 100%;
                        padding: 0 16px;
                    }
                    .tours-search-wrap {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 0 16px;
                        height: 52px;
                        background: rgba(6, 21, 37, 0.7);
                        backdrop-filter: blur(16px);
                        -webkit-backdrop-filter: blur(16px);
                        border: 1.5px solid rgba(255,255,255,0.2);
                        border-radius: 14px;
                        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
                        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
                    }
                    .tours-search-wrap.focused {
                        /* Removed per user request to prevent secondary rectangle */
                    }
                    .tours-search-bar-icon {
                        flex-shrink: 0;
                        color: rgba(255,255,255,0.5);
                        transition: color 0.3s;
                    }
                    .tours-search-wrap.focused .tours-search-bar-icon {
                        color: #ffffff;
                    }
                    .tours-search-bar-input {
                        flex: 1;
                        background: transparent;
                        border: none !important;
                        color: #e2e8f0;
                        font-size: 15px;
                        font-family: inherit;
                        font-weight: 500;
                        outline: none !important;
                        min-width: 0;
                        letter-spacing: 0.2px;
                        box-shadow: none !important;
                    }
                    .tours-search-bar-input:focus {
                        outline: none !important;
                        box-shadow: none !important;
                        border: none !important;
                    }
                    .tours-search-bar-input::placeholder {
                        color: rgba(148,163,184,0.4);
                        font-weight: 400;
                    }
                    .tours-search-clear {
                        flex-shrink: 0;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        border: none;
                        background: rgba(255,255,255,0.08);
                        color: rgba(148,163,184,0.6);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .tours-search-clear:hover {
                        background: rgba(239,68,68,0.15);
                        color: #ef4444;
                    }

                    /* ═══ DATE DROPDOWN ═══ */
                    .tours-date-divider {
                        width: 1px;
                        height: 28px;
                        background: rgba(255,255,255,0.2);
                        flex-shrink: 0;
                    }
                    .tours-date-select {
                        flex-shrink: 0;
                        background: transparent;
                        border: none;
                        color: #ffffff;
                        font-size: 13px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        outline: none;
                        padding: 6px 4px;
                        appearance: auto;
                        min-width: 120px;
                    }
                    .tours-date-select option {
                        background: #0c1423;
                        color: #e2e8f0;
                    }

                    /* ═══ SIDEBAR + MAIN LAYOUT ═══ */
                    .pnm-layout {
                        display: flex;
                        width: 100%;
                        max-width: 1600px;
                        margin: 0 auto;
                        min-height: calc(100vh - 160px);
                        gap: 0;
                    }

                    /* ═══ LEFT SIDEBAR ═══ */
                    .pnm-sidebar {
                        width: clamp(130px, 12vw, 175px);
                        min-width: clamp(130px, 12vw, 175px);
                        flex-shrink: 0;
                        background: linear-gradient(180deg, rgba(12,20,35,0.97) 0%, rgba(8,14,26,0.99) 100%);
                        border-right: 2px solid rgba(148,163,184,0.12);
                        padding: 6px 0;
                        position: sticky;
                        top: 64px;
                        height: calc(100vh - 64px);
                        overflow-y: auto;
                        overflow-x: hidden;
                        z-index: 50;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.3);
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255,255,255,0.3) transparent;
                    }
                    .pnm-sidebar::-webkit-scrollbar { width: 4px; }
                    .pnm-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.25); border-radius: 2px; }

                    .sidebar-nav {
                        display: flex;
                        flex-direction: column;
                        gap: 1px;
                        padding: 0 6px;
                        margin-bottom: 10px;
                    }

                    .sidebar-tab {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 100%;
                        padding: 7px 8px;
                        border-radius: 6px;
                        background: transparent;
                        border: 1.5px solid transparent;
                        cursor: pointer;
                        transition: all 0.2s;
                        color: rgba(148,163,184,0.65);
                        position: relative;
                        text-align: left;
                    }
                    .sidebar-tab:hover {
                        background: rgba(148,163,184,0.06);
                        color: rgba(200,214,229,0.85);
                    }
                    .sidebar-tab.active {
                        background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(148,163,184,0.06) 100%);
                        border-color: rgba(255,255,255,0.3);
                        color: #ffffff;
                        box-shadow: inset 0 0 12px rgba(255,255,255,0.06), 0 0 8px rgba(255,255,255,0.08);
                    }
                    .sidebar-tab.active::before {
                        content: '';
                        position: absolute;
                        left: 0;
                        top: 6px;
                        bottom: 6px;
                        width: 3px;
                        background: #ffffff;
                        border-radius: 0 3px 3px 0;
                        box-shadow: 0 0 8px rgba(255,255,255,0.4);
                    }
                    .sidebar-tab-icon {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 24px;
                        height: 24px;
                        flex-shrink: 0;
                    }
                    .sidebar-tab-label {
                        font-size: 12px;
                        font-weight: 600;
                        white-space: nowrap;
                    }
                    .sidebar-tab-count {
                        margin-left: auto;
                        font-size: 11px;
                        font-weight: 700;
                        color: rgba(148,163,184,0.4);
                        min-width: 18px;
                        text-align: center;
                    }
                    .sidebar-tab.active .sidebar-tab-count { color: rgba(255,255,255,0.6); }

                    /* ═══ SIDEBAR FILTERS ═══ */
                    .sidebar-filters {
                        padding: 0 8px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                        margin-top: 6px;
                        padding-top: 8px;
                    }
                    .sidebar-filter-group { margin-bottom: 10px; }
                    .sidebar-filter-group label {
                        display: block;
                        font-size: 11px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 4px;
                        padding: 0 2px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .sidebar-select {
                        width: 100%;
                        padding: 7px 8px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 6px;
                        color: #e2e8f0;
                        font-size: 12px;
                        font-family: inherit;
                        cursor: pointer;
                        appearance: auto;
                    }
                    .sidebar-select:focus { border-color: rgba(255,255,255,0.4); outline: none; }

                    .sidebar-active-filters {
                        margin-top: 6px;
                        padding: 8px;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                    }
                    .sidebar-active-filters-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        font-size: 11px;
                        color: rgba(255,255,255,0.7);
                        font-weight: 600;
                    }
                    .sidebar-clear-btn {
                        background: none;
                        border: 1px solid rgba(239,68,68,0.25);
                        color: rgba(239,68,68,0.7);
                        font-size: 10px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        padding: 3px 8px;
                        border-radius: 4px;
                        transition: all 0.2s;
                    }
                    .sidebar-clear-btn:hover {
                        background: rgba(239,68,68,0.1);
                        color: #ef4444;
                    }

                    /* ═══ MAIN CONTENT ═══ */
                    .pnm-main {
                        flex: 1;
                        min-width: 0;
                        padding: 0 clamp(10px, 1.5vw, 20px) 20px;
                    }

                    /* ═══ MAP CONTAINER ═══ */
                    .tours-map-container {
                        margin-bottom: 16px;
                        border-radius: 12px;
                        overflow: hidden;
                    }

                    /* ═══ RESULTS BAR ═══ */
                    .tours-results-bar {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        flex-wrap: wrap;
                        gap: 12px;
                        padding: 12px 16px;
                        margin-bottom: 16px;
                        background: linear-gradient(90deg, rgba(12,20,35,0.9) 0%, rgba(8,14,26,0.9) 100%);
                        border: 1px solid rgba(148,163,184,0.1);
                        border-radius: 10px;
                    }
                    .tours-results-count {
                        font-size: 14px;
                        color: rgba(148,163,184,0.7);
                    }
                    .tours-results-count strong {
                        color: #ffffff;
                        font-weight: 800;
                    }
                    .tours-stops-count {
                        color: rgba(34,197,94,0.7);
                        font-weight: 600;
                        font-size: 13px;
                    }
                    .tours-results-query {
                        color: rgba(255,255,255,0.6);
                        font-style: italic;
                        font-size: 13px;
                    }
                    .tours-results-actions {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .tours-clear-all-btn {
                        padding: 6px 14px;
                        border-radius: 6px;
                        border: 1px solid rgba(239,68,68,0.25);
                        background: rgba(239,68,68,0.08);
                        color: rgba(239,68,68,0.8);
                        font-size: 12px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        transition: all 0.2s;
                        white-space: nowrap;
                    }
                    .tours-clear-all-btn:hover {
                        background: rgba(239,68,68,0.15);
                        border-color: rgba(239,68,68,0.4);
                        color: #ef4444;
                    }
                    .tours-results-sort {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        color: rgba(148,163,184,0.5);
                    }
                    .tours-results-sort select {
                        padding: 6px 10px;
                        background: rgba(0,0,0,0.35);
                        border: 1px solid rgba(148,163,184,0.15);
                        border-radius: 6px;
                        color: #ffffff;
                        font-size: 12px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                    }

                    /* ═══ SERIES CARDS GRID ═══ */
                    .tours-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                    }

                    /* ═══ PREMIUM SERIES CARD ═══ */
                    .tour-card-premium {
                        position: relative;
                        background: linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(10,15,28,0.98) 100%);
                        border: 2px solid var(--card-accent, rgba(100,116,139,0.4));
                        border-radius: 14px;
                        padding: 18px 20px 14px;
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow:
                            0 2px 12px rgba(0,0,0,0.3),
                            0 0 10px rgba(100,116,139,0.1),
                            inset 0 1px 0 rgba(255,255,255,0.04);
                        overflow: hidden;
                    }
                    .tour-card-premium::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 3px;
                        background: linear-gradient(90deg, transparent, var(--card-accent, rgba(100,116,139,0.5)), transparent);
                        opacity: 1;
                        transition: opacity 0.3s;
                    }
                    .tour-card-premium:hover {
                        transform: translateY(-2px);
                        box-shadow:
                            0 8px 32px rgba(0,0,0,0.4),
                            0 0 18px rgba(255,255,255,0.15),
                            inset 0 1px 0 rgba(255,255,255,0.06);
                    }

                    /* Card Header */
                    .tour-card-header {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 12px;
                    }
                    .tour-code-badge {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        padding: 6px 14px;
                        border-radius: 6px;
                        min-width: 60px;
                    }
                    .tour-type-pill {
                        font-size: 11px;
                        font-weight: 600;
                        padding: 3px 10px;
                        border-radius: 20px;
                        border: 1px solid;
                        letter-spacing: 0.3px;
                        margin-left: auto;
                    }

                    .tour-card-name {
                        font-size: 17px;
                        font-weight: 700;
                        color: #fff;
                        margin: 0 0 8px;
                        line-height: 1.3;
                    }

                    .tour-card-location-live {
                        display: flex;
                        flex-direction: column;
                        gap: 3px;
                        margin: 0 0 10px;
                        padding: 8px 10px;
                        background: rgba(0,0,0,0.25);
                        border: 1px solid rgba(148,163,184,0.08);
                        border-radius: 8px;
                    }
                    .tour-stop-venue {
                        font-size: 13px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.85);
                        padding-left: 20px;
                    }
                    .tour-stop-location {
                        font-size: 11px;
                        color: rgba(148,163,184,0.6);
                        padding-left: 20px;
                    }

                    .tour-card-buyins {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.85);
                        font-weight: 600;
                        margin-bottom: 10px;
                    }

                    .tour-card-tags {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-bottom: 10px;
                    }
                    .tour-region-tag {
                        padding: 3px 10px;
                        border-radius: 6px;
                        background: rgba(59,130,246,0.1);
                        border: 1px solid rgba(59,130,246,0.2);
                        color: rgba(59,130,246,0.8);
                        font-size: 11px;
                        font-weight: 600;
                    }

                    .tour-card-series {
                        margin-bottom: 12px;
                        padding: 10px 12px;
                        background: rgba(0,0,0,0.2);
                        border: 1px solid rgba(148,163,184,0.06);
                        border-radius: 8px;
                    }
                    .tour-series-header {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 11px;
                        font-weight: 700;
                        color: rgba(148,163,184,0.5);
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 8px;
                    }
                    .tour-series-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 4px 0;
                        border-top: 1px solid rgba(148,163,184,0.06);
                    }
                    .tour-series-item:first-of-type { border-top: none; }
                    .tour-series-name {
                        font-size: 12px;
                        color: rgba(255,255,255,0.8);
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        max-width: 60%;
                    }
                    .tour-series-dates {
                        font-size: 11px;
                        color: rgba(34,197,94,0.7);
                        font-weight: 600;
                        white-space: nowrap;
                    }
                    .tour-series-more {
                        font-size: 11px;
                        color: rgba(148,163,184,0.4);
                        text-align: center;
                        padding-top: 6px;
                        border-top: 1px solid rgba(148,163,184,0.06);
                        margin-top: 4px;
                        font-style: italic;
                    }

                    .tour-card-footer {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-top: auto;
                        padding-top: 12px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                    }
                    .tour-card-established {
                        font-size: 11px;
                        color: rgba(148,163,184,0.4);
                        font-weight: 500;
                    }
                    .tour-card-actions {
                        display: flex;
                        gap: 8px;
                        margin-left: auto;
                    }
                    .tour-action-btn {
                        padding: 6px 14px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        text-decoration: none;
                        background: rgba(255,255,255,0.06);
                        border: 1px solid rgba(148,163,184,0.12);
                        color: rgba(255,255,255,0.7);
                    }
                    .tour-action-btn:hover {
                        background: rgba(255,255,255,0.1);
                        border-color: rgba(148,163,184,0.25);
                        color: #fff;
                    }
                    .tour-action-btn.primary {
                        background: linear-gradient(135deg, #ffffff, #94a3b8);
                        border: none;
                        color: #000;
                        font-weight: 700;
                        letter-spacing: 0.3px;
                    }
                    .tour-action-btn.primary:hover {
                        box-shadow: 0 4px 16px rgba(255,255,255,0.3);
                        transform: translateY(-1px);
                    }

                    .tour-fav-btn {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        background: rgba(0,0,0,0.4);
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 50%;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.2s;
                        z-index: 2;
                    }
                    .tour-fav-btn:hover {
                        background: rgba(239,68,68,0.15);
                        border-color: rgba(239,68,68,0.3);
                    }
                    .tour-fav-btn.active {
                        background: rgba(239,68,68,0.15);
                        border-color: rgba(239,68,68,0.4);
                    }

                    /* Loading & Empty States */
                    .tours-loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 16px;
                        padding: 60px 20px;
                        color: rgba(255,255,255,0.6);
                        font-size: 14px;
                        font-weight: 600;
                    }
                    .tours-spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(255,255,255,0.15);
                        border-top-color: #ffffff;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    .tours-empty {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 12px;
                        padding: 60px 20px;
                        text-align: center;
                    }
                    .tours-empty h3 {
                        font-size: 18px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.7);
                        margin: 0;
                    }
                    .tours-empty p {
                        font-size: 13px;
                        color: rgba(148,163,184,0.5);
                        margin: 0;
                        max-width: 400px;
                    }
                    .tours-empty-reset {
                        margin-top: 8px;
                        padding: 10px 24px;
                        border-radius: 8px;
                        border: 1.5px solid rgba(255,255,255,0.3);
                        background: rgba(255,255,255,0.08);
                        color: #ffffff;
                        font-size: 13px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        transition: all 0.25s;
                    }
                    .tours-empty-reset:hover {
                        background: rgba(255,255,255,0.15);
                        border-color: rgba(255,255,255,0.5);
                        box-shadow: 0 0 16px rgba(255,255,255,0.1);
                    }

                    /* ═══ SKELETON ═══ */
                    .skeleton-pulse {
                        animation: skeletonPulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                    }
                    @keyframes skeletonPulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }

                    /* ═══ SPACE BACKGROUND ═══ */
                    .space-bg {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 60%),
                            linear-gradient(180deg, #020408 0%, #0a1628 30%, #0d1b2a 50%, #0a1628 70%, #020408 100%);
                        z-index: -2;
                    }
                    .space-bg::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background-image:
                            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px);
                        background-size: 40px 40px;
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 50% 0%, rgba(148,163,184,0.05) 0%, transparent 50%),
                            linear-gradient(180deg, rgba(3,7,18,0.4) 0%, transparent 15%, transparent 85%, rgba(3,7,18,0.6) 100%);
                        z-index: -1;
                    }

                    .universal-header { flex-shrink: 0; }
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                    /* ═══ MOBILE ═══ */
                    @media (max-width: 768px) {
                        .pnm-title-bar {
                            padding: clamp(6px, 1.5vh, 14px) 14px clamp(4px, 1vh, 10px);
                        }
                        .pnm-title {
                            font-size: clamp(20px, 5.5vw, 28px);
                            letter-spacing: clamp(1px, 0.4vw, 2px);
                        }
                        .tours-search-bar { padding: 0 10px; margin-top: 12px; }
                        .tours-search-wrap { height: 46px; border-radius: 12px; padding: 0 12px; }
                        .tours-search-bar-input { font-size: 13px; }
                        .tours-date-select { font-size: 12px; min-width: 100px; }
                        .pnm-layout { flex-direction: column; }
                        .pnm-sidebar {
                            width: 100%;
                            min-width: 100%;
                            height: auto;
                            flex-shrink: 0;
                            max-height: none;
                            border-right: none;
                            border-bottom: 2px solid rgba(148,163,184,0.12);
                            box-shadow: 0 4px 24px rgba(0,0,0,0.3);
                            padding: 6px 0 8px;
                            position: sticky;
                            top: 56px;
                            z-index: 100;
                        }
                        .sidebar-nav {
                            flex-direction: row;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            scrollbar-width: none;
                            gap: 4px;
                            padding: 0 10px;
                            margin-bottom: 6px;
                        }
                        .sidebar-nav::-webkit-scrollbar { display: none; }
                        .sidebar-tab {
                            flex-direction: column;
                            gap: 3px;
                            padding: 8px 12px;
                            min-width: 60px;
                            align-items: center;
                            text-align: center;
                        }
                        .sidebar-tab.active::before { display: none; }
                        .sidebar-tab.active {
                            box-shadow: inset 0 -2px 0 #ffffff, inset 0 0 8px rgba(255,255,255,0.08);
                        }
                        .sidebar-tab-label { font-size: 10px; }
                        .sidebar-tab-icon { width: 20px; height: 20px; }
                        .sidebar-tab-count { display: none; }
                        .sidebar-filters {
                            padding: 0 10px 6px;
                            display: flex;
                            flex-wrap: wrap;
                            gap: 6px;
                            align-items: flex-start;
                        }
                        .sidebar-filter-group { margin-bottom: 0; flex: 1; min-width: 120px; }
                        .sidebar-active-filters { flex-basis: 100%; }
                        .pnm-main { padding: 0 10px 40px; }
                        .tours-grid {
                            grid-template-columns: 1fr;
                        }
                        .tour-card-name { font-size: 15px; }
                        .tours-results-bar { flex-direction: column; align-items: flex-start; gap: 8px; }
                        .tours-results-actions { width: 100%; justify-content: space-between; }
                    }

                    @media (max-width: 480px) {
                        .tours-results-bar {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 8px;
                            padding: 10px 14px;
                        }
                        .tour-card-premium {
                            padding: 14px 16px 12px;
                        }
                    }
                `}</style>
            </div>
        </>
    );
}


// ═══════════════════════════════════════════════
// ON-DEMAND STATIC DATA (ISR)
// ═══════════════════════════════════════════════
import { supabaseAdmin } from '../../src/lib/supabaseAdmin';

export async function getStaticProps() {
    try {
        // NOTE: poker_series uses 'series_name' (not 'name'), and lacks venue/latitude/longitude/country/logo_url
        // tournament_series uses 'name' (not 'series_name'), and lacks venue_id/logo_url/latitude/longitude/country
        // Each table gets its own column list to avoid "column does not exist" ISR errors.
        const psColumns = 'id, series_name, start_date, end_date, city, state, logo_url, series_uid, is_suppressed, venue_id, created_at, updated_at, tour_code, main_event_buyin, total_guaranteed, events_count, is_featured, short_name';
        const tsColumns = 'id, name, start_date, end_date, venue, city, state, series_uid, is_suppressed, tour_code, main_event_buyin, main_event_guaranteed, events_count, is_featured, short_name';

        const [psRes, tsRes] = await Promise.all([
            supabaseAdmin.from('poker_series').select(psColumns).or('is_suppressed.is.null,is_suppressed.eq.false').order('start_date', { ascending: true }).range(0, 999),
            supabaseAdmin.from('tournament_series').select(tsColumns).or('is_suppressed.is.null,is_suppressed.eq.false').order('start_date', { ascending: true }).range(0, 499)
        ]);

        if (psRes.error) throw psRes.error;
        if (tsRes.error) throw tsRes.error;

        // Normalize poker_series rows: map series_name -> name so downstream code is unified
        const normalizedPs = (psRes.data || []).map(ps => ({ ...ps, name: ps.series_name }));

        let allData = [];
        if (tsRes.data) allData = [...tsRes.data];
        for (const ps of normalizedPs) {
            const uid = ps.series_uid;
            if (!uid || !allData.some(t => t.series_uid === uid)) allData.push(ps);
        }

        return {
            props: { initialSeries: allData },
            revalidate: 60, // 60 second Edge caching
        };
    } catch (e) {
        console.warn('ISR Build Failed:', e.message);
        return { props: { initialSeries: [] }, revalidate: 60 };
    }
}
