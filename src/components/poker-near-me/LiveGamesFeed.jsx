import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { haversineMiles, timeAgo, getHeatLevel, parseMinStake, getVenueLogoUrl, getVenueLogoFallback, estimateWaitTime, saveFilters, loadFilters, isStaleData, getInitialsColor } from './pnm-utils';
import { normalizeGameName } from './normalize-game';
import { busEmit } from '../../engine/EventBus';
import ReportGameModal from './ReportGameModal';

// ─── HTML entity decoder (handles &amp; &lt; &gt; &quot; &#39; etc.) ───
function decodeHtmlEntities(str) {
    if (!str || typeof str !== 'string') return str || '';
    // First pass: decode double-encoded entities (e.g. &amp;amp; → &amp; → &)
    let result = str.replace(/&amp;amp;/gi, '&amp;');
    // Second pass: decode standard HTML entities
    result = result
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
    // Fix pipe separators in venue names (e.g. "Casino|Resort" → "Casino Resort")
    result = result.replace(/\|/g, ' ');
    // Collapse multiple spaces
    result = result.replace(/\s{2,}/g, ' ').trim();
    return result;
}

// ─── Normalize venue name for fuzzy matching ───
function normalizeVenueName(name) {
    if (!name) return '';
    return decodeHtmlEntities(name)
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/'/g, '')
        .replace(/-/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Significant words for word-overlap matching ───
// Stop words: common venue, location, and tournament-series terms that cause false positives
const STOP_WORDS = new Set([
    'casino', 'resort', 'hotel', 'poker', 'room', 'the', 'and', 'at', 'of', 'in',
    'bar', 'lounge', 'club', 'card', 'house', 'center', 'spa',
    'las', 'vegas', 'city', 'park', 'lake', 'valley', 'north', 'south', 'east', 'west',
    'series', 'classic', 'championship', 'tournament',
]);
function getSignificantWords(normalized) {
    return normalized.split(' ').filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}
// Tour/series entries should never be matched as physical venues
const SERIES_PATTERN = /\b(series|classic|championship|circuit)\b/i;

// Dynamically import map to avoid SSR issues
const VenueMap = dynamic(() => import('./VenueMap'), { ssr: false });

const LIVE_REFRESH_MS = 2 * 60 * 1000; // 2 minutes
const COLLAPSE_THRESHOLD = 5; // Show first N games, collapse rest
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — show warning banner

// Skeleton loading
const renderSkeletons = (count = 4) => (
    <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
        {Array.from({ length: count }).map((_, i) => (
            <div key={`skel-${i}`} style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '12px', padding: '16px', display: 'flex', gap: '16px'
            }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.05)', animation: 'lgf-pulse 1.5s infinite' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ width: '60%', height: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 8, animation: 'lgf-pulse 1.5s infinite' }} />
                    <div style={{ width: '40%', height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 4, animation: 'lgf-pulse 1.5s infinite' }} />
                </div>
            </div>
        ))}
    </div>
);

/**
 * NAVIGATION GUARD: resolve a venue id that /hub/venues/[id] can actually serve.
 *
 * BUG FIX: this used to be a UUID regex, but poker_venues.id is a bigint — see
 * supabase/migrations/20260408_create_venue_daily_tournaments.sql (`venue_id bigint
 * REFERENCES public.poker_venues(id)`) and data/all-venues.json (`"id": 2140`). The
 * test therefore NEVER matched and every card click and every Details button in the
 * feed was swallowed. The guard's real intent is to skip unmatched live rows, whose
 * id falls back to the bravo_slug string — that intent is preserved here.
 *
 * @returns {string|null} the id to navigate to, or null when there is no detail page
 */
function resolveVenueDetailId(rawId) {
    if (rawId === null || rawId === undefined) return null;
    const asString = String(rawId).trim();
    if (!asString) return null;
    // Numeric bigint id (the normal case).
    if (/^\d+$/.test(asString) && Number(asString) > 0) return asString;
    // Tolerate UUID-shaped ids in case any venue source supplies one.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(asString)) return asString;
    return null; // bravo_slug fallback — no detail page available yet
}

/**
 * SOURCE BADGE: Shows the data source for a venue's live data.
 *
 * BUG FIX: this used to label anything sourced 'bravo' as "LIVE DATA", but the
 * simulator writes rows that keep source='bravo' — /api/poker/live-tables flags those
 * separately via is_simulated / data_quality: 'modeled_estimate'. A modelled table
 * count was therefore presented as a real-time scrape. Modelled rows now read
 * "ESTIMATED".
 */
function SourceBadge({ source, isSimulated }) {
    if (isSimulated) {
        return (
            <span style={{
                fontSize: 10, letterSpacing: '0.3px',
                color: 'rgba(245,158,11,0.95)',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.3)',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 800,
                textTransform: 'uppercase',
            }} title="Modelled from observed history — not a live scrape">
                ESTIMATED
            </span>
        );
    }
    const isLive = source === 'bravo' || source === 'pokeratlas';
    return (
        <span style={{
            fontSize: 10, letterSpacing: '0.3px',
            color: isLive ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.9)',
            background: isLive ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.12)',
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 800,
            textTransform: 'uppercase',
        }}>
            {isLive ? 'LIVE DATA' : 'CATALOG'}
        </span>
    );
}

// ─── GAME TYPE FILTER CHIPS ─── (Cash Games only)
const GAME_TYPE_FILTERS = [
    { key: 'all', label: 'All Games' },
    { key: 'nlh', label: 'NLH' },
    { key: 'plo', label: 'PLO' },
    { key: 'mixed', label: 'Mixed' },
];

function matchesGameType(gameName, filterKey) {
    if (!filterKey || filterKey === 'all') return true;
    if (filterKey === 'none') return false; 
    const g = ((gameName || '')).toLowerCase();
    if (filterKey === 'nlh') return g.includes('hold') || g.includes('nlh') || g.includes('no limit holdem') || g.includes('no-limit hold');
    if (filterKey === 'plo') return g.includes('omaha') || g.includes('plo') || g.includes('big o');
    if (filterKey === 'plo8') return g.includes('plo8') || g.includes('omaha hi') || g.includes('omaha 8') || g.includes('o8') || g.includes('big o');
    if (filterKey === 'mixed') return g.includes('mix') || g.includes('horse') || g.includes('triple draw') || g.includes('2-7') || g.includes('badugi');
    if (filterKey === 'stud') return g.includes('stud');
    if (filterKey === 'other') return !g.includes('hold') && !g.includes('nlh') && !g.includes('omaha') && !g.includes('plo') && !g.includes('stud'); // anything not NLH/PLO/Stud
    return false;
}

// ─── STAKES PARSING ───
const STAKES_FILTERS = [
    { key: 'any', label: 'Any Stakes' },
    { key: '1', label: '1/2+' },
    { key: '2', label: '2/5+' },
    { key: '5', label: '5/10+' },
    { key: '10', label: '10/20+' },
    { key: '25', label: '25/50+' },
];

// parseMinStake is now imported from ./pnm-utils

function venueHasStakes(games, minStake) {
    if (minStake === 'any' || !minStake) return true;
    const threshold = parseInt(minStake);
    return (games || []).some(g => {
        if (!g) return false;
        // Primary: parse stakes from the game name (e.g. "NLH 1/2", "PLO 2/5")
        const fromName = g.game ? parseMinStake(g.game) : 0;
        if (fromName >= threshold) return true;
        // Fallback: parse from g.buyin field — PokerAtlas stores "1/2" or "$1/$2" here
        const fromBuyin = g.buyin ? parseMinStake(String(g.buyin)) : 0;
        return fromBuyin >= threshold;
    });
}

function LiveGamesFeed({
    venues = [], 
    userLocation, 
    favorites = {}, 
    handleToggleFavorite, 
    checkinCounts = {}, 
    router, 
    openVenueModal,
    setSelectedVenueForReview,
    user,
    selectedCity = null,
    globalFilters = null,
    setGlobalFilters = null
}) {
    // ─── REPORT GAME MODAL STATE ───
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportVenue, setReportVenue] = useState(null);
    const [reportSuccess, setReportSuccess] = useState(null);
    // ─── STATE ───
    const [liveData, setLiveData] = useState({}); // Mapping: bravo_slug -> live data
    const [liveLoading, setLiveLoading] = useState(true);
    const [lastRefreshTime, setLastRefreshTime] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    // ─── SCRAPER FALLBACK STATE ───
    // When scrapers return 0 venues we NEVER wipe the feed — preserve last-known data
    const [isScraperDead, setIsScraperDead] = useState(false);
    const lastGoodLiveDataRef = useRef(null);
    // Global stats from API metadata
    const [globalStats, setGlobalStats] = useState({ venues: 0, tables: 0, waiting: 0, lastScrape: null, dataMode: null });
    const [isDataStale, setIsDataStale] = useState(false);
    
    // ─── REALTIME BUFFER STATE ───
    const realtimeBufferRef = useRef([]);
    const flushTimerRef = useRef(null);

    // ─── Filters & Persistence ───
    // [LGF1 FIX] Was read at render time on every re-render— moved to useRef so localStorage
    // is only read once on mount, not on every parent-triggered re-render.
    const savedFiltersRef = useRef(null);
    if (savedFiltersRef.current === null) {
        savedFiltersRef.current = typeof window !== 'undefined' ? loadFilters('lgf', {}) : {};
    }
    const savedFilters = savedFiltersRef.current;
    const [mapExpanded, setMapExpanded] = useState(savedFilters.mapExpanded ?? true);

    // ─── GPS LOCATION CARRYOVER — restore from localStorage when prop is null ───
    const [restoredLocation, setRestoredLocation] = useState(null);
    const [locationCity, setLocationCity] = useState('');
    const [locationState, setLocationState] = useState('');
    useEffect(() => {
        if (userLocation) {
            // Prop is available — use it and read city/state from localStorage
            try {
                setLocationCity(localStorage.getItem('pnm_last_city') || '');
                setLocationState(localStorage.getItem('pnm_last_state') || '');
            } catch { /* */ }
            return;
        }
        // No prop — try restoring from localStorage
        if (typeof window === 'undefined') return;
        try {
            // Check sp-user-gps first (main PNM page key)
            const spGps = localStorage.getItem('sp-user-gps');
            if (spGps) {
                const parsed = JSON.parse(spGps);
                if (parsed.lat && parsed.lng && parsed.time && (Date.now() - parsed.time) < 86400000) {
                    setRestoredLocation({ lat: parsed.lat, lng: parsed.lng });
                    setLocationCity(parsed.label?.split(',')[0]?.trim() || '');
                    setLocationState(parsed.label?.split(',')[1]?.trim() || '');
                    return;
                }
            }
            // Fallback: lobby page's GPS key
            const lobbyLoc = localStorage.getItem('pnm_last_location');
            const lobbyEnabled = localStorage.getItem('pnm_location_enabled');
            if (lobbyLoc && lobbyEnabled === '1') {
                const parsed = JSON.parse(lobbyLoc);
                if (parsed.lat && parsed.lng) {
                    setRestoredLocation({ lat: parsed.lat, lng: parsed.lng });
                    setLocationCity(localStorage.getItem('pnm_last_city') || '');
                    setLocationState(localStorage.getItem('pnm_last_state') || '');
                }
            }
        } catch { /* ignore corrupt data */ }
    }, [userLocation]);

    // [LGF-A1 FIX] Memoize effectiveLocation — was an inline const that created a new {lat,lng}
    // object every render when selectedCity is truthy. New object → calcDist identity changes →
    // mergedVenues useMemo recalculates (400+ venue filter/sort) on EVERY parent re-render.
    const effectiveLocation = useMemo(() => {
        return userLocation || (selectedCity ? { lat: selectedCity.latitude || selectedCity.lat, lng: selectedCity.longitude || selectedCity.lng } : restoredLocation);
    }, [userLocation, selectedCity, restoredLocation]);
    
    // If globalFilters are provided by the parent, use them. Otherwise, fall back to internal local state.
    const [internalFilterState, setInternalFilterState] = useState(savedFilters.filterState || 'all');
    const [internalFilterRadius, setInternalFilterRadius] = useState(() => {
        // Cap any persisted radius at 150 miles — old localStorage may hold stale values (250, 500)
        const raw = savedFilters.filterRadius;
        if (!raw || raw === 'any') {
            const hasLocation = !!(userLocation) || !!(typeof window !== 'undefined' && (
                localStorage.getItem('sp-user-gps') || (localStorage.getItem('pnm_last_location') && localStorage.getItem('pnm_location_enabled') === '1')
            ));
            return hasLocation ? '50' : 'any';
        }
        const parsed = Number(raw);
        return isNaN(parsed) ? '50' : String(Math.min(parsed, 150));
    });
    const [internalFilterSort, setInternalFilterSort] = useState(savedFilters.filterSort || 'distance');
    const [internalFilterGameType, setInternalFilterGameType] = useState(savedFilters.filterGameType || 'all');
    const [internalFilterStakes, setInternalFilterStakes] = useState(savedFilters.filterStakes || 'any');

    const filterState = globalFilters ? (globalFilters.selectedState || 'all') : internalFilterState;
    const filterRadius = globalFilters ? 
        (globalFilters.radius === 'any' || globalFilters.radius === 'Any' ? 'any' : String(Math.min(Number(globalFilters.radius) || 50, 150))) 
        : internalFilterRadius;
    
    // Map main UI gameType to LiveGamesFeed format if needed
    let computedGameType = internalFilterGameType;
    if (globalFilters) {
        if (globalFilters.gameType === 'cash') computedGameType = 'all'; // 'cash' parent = show all cash game types
        else if (globalFilters.gameType === 'mtt') computedGameType = 'none'; // tournaments ONLY, so hide tables
        else computedGameType = globalFilters.gameType || 'all'; // 'all', 'nlh', 'plo', 'mixed'
    }
    const filterGameType = computedGameType;

    // Map main UI stakes ($1/2, $2/5) to LGF stakes (1, 2)
    let computedStakes = internalFilterStakes;
    if (globalFilters) {
        // FilterPanel stores stakes without $ prefix: '1/2', '2/5', '5/10', '10/20'
        if (globalFilters.stakes === '1/2' || globalFilters.stakes === '$1/2') computedStakes = '1';
        else if (globalFilters.stakes === '2/5' || globalFilters.stakes === '$2/5') computedStakes = '2';
        else if (globalFilters.stakes === '5/10' || globalFilters.stakes === '$5/10' || globalFilters.stakes === '$5/10+') computedStakes = '5';
        else if (globalFilters.stakes === '10/20' || globalFilters.stakes === '$10/20' || globalFilters.stakes === '$10/20+') computedStakes = '10';
        else computedStakes = 'any'; // 'all', undefined, unknown → show everything
    }
    const filterStakes = computedStakes;

    const filterSort = internalFilterSort;
    const setFilterRadius = (val) => {
        if (globalFilters && setGlobalFilters) {
            setGlobalFilters(prev => ({ ...prev, radius: String(val).toLowerCase() === 'any' ? 'any' : Number(val) }));
        } else {
            setInternalFilterRadius(val);
        }
    };
    const setFilterSort = setInternalFilterSort;

    // Persist filters on change (only if internal)
    useEffect(() => {
        if (!globalFilters) {
            saveFilters('lgf', { mapExpanded, filterState: internalFilterState, filterRadius: internalFilterRadius, filterSort: internalFilterSort, filterGameType: internalFilterGameType, filterStakes: internalFilterStakes });
        }
    }, [mapExpanded, internalFilterState, internalFilterRadius, internalFilterSort, internalFilterGameType, internalFilterStakes, globalFilters]);

    // location snap removed to prevent overwriting persistent 'any' user choice
    
    // Single Venue drill-down (from autocomplete or clicking a card)
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState(null);
    
    // Collapsible breakdowns
    const [expandedBreakdowns, setExpandedBreakdowns] = useState({});
    
    const debounceTimerRef = useRef(null);
    const busEmitDebounceRef = useRef(null);
    const countdownRef = useRef(null);
    // FIX: locationAppliedRef was used in handleResetFilters (line 699) but never declared.
    // Without this, handleResetFilters() throws a ReferenceError in strict mode / React 18.
    const locationAppliedRef = useRef(!!userLocation);

    // ─── CONSOLIDATED DISTANCE CALC (uses effectiveLocation) ───
    const calcDist = useCallback((v) => {
        if (!effectiveLocation || !v.latitude || !v.longitude) return 99999;
        return haversineMiles(effectiveLocation.lat, effectiveLocation.lng, v.latitude, v.longitude);
    }, [effectiveLocation]);

    // ─── FETCH LIVE DATA ───
    const fetchGlobalLiveData = useCallback(async (isRealtimeEvent = false) => {
        if (!isRealtimeEvent) setLiveLoading(true);
        if (isRealtimeEvent) setIsRefreshing(true);
        try {
            const url = isRealtimeEvent 
                ? `/api/poker/live-tables?_t=${Date.now()}`
                : '/api/poker/live-tables';
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                const mapping = {};
                (json.venues || []).forEach(v => {
                    const totalTables = (v.games || []).reduce((acc, g) => acc + ((g && g.tables_running) || 0), 0);
                    const totalWait = (v.games || []).reduce((acc, g) => acc + ((g && g.players_waiting) || 0), 0);
                    const sources = (v.games || []).map(g => g ? g.source : null).filter(Boolean);
                    const primarySource = sources.includes('bravo') ? 'bravo' : (sources[0] || 'bravo');
                    mapping[v.bravo_slug] = { ...v, totalTables, totalWait, primarySource };
                });

                // ── SCRAPER FALLBACK POLICY ──────────────────────────────────────
                // If the API returns 0 venues (scraper dead/offline), we NEVER wipe
                // the feed. Instead we keep the last-known data and show an amber
                // 'Using Cached Data' banner so the page always has content.
                // ────────────────────────────────────────────────────────────────
                if (Object.keys(mapping || {}).length > 0) {
                    setLiveData(prev => {
                        const next = { ...mapping };
                        // Per-venue fallback: if a venue was successfully scraped previously but is MISSING
                        // from the current payload (due to Cloudflare 403 or scraper crash), preserve it
                        // for up to 4 hours to prevent flickering to 0 tables (static catalog fallback).
                        for (const key of Object.keys(prev || {})) {
                            if (!next[key]) {
                                const lastAge = prev[key].last_updated ? (Date.now() - new Date(prev[key].last_updated).getTime()) : Infinity;
                                if (lastAge < 14400000) { // 4 hours
                                    next[key] = prev[key];
                                    console.warn(`[LGF] Venue ${key} missing from live payload. Preserving cache (Age: ${Math.round(lastAge/60000)}m).`);
                                }
                            }
                        }
                        lastGoodLiveDataRef.current = next;
                        return next;
                    });
                    setIsScraperDead(false);
                } else if (lastGoodLiveDataRef.current && Object.keys(lastGoodLiveDataRef.current || {}).length > 0) {
                    // Scrapers returned nothing (0 venues total) — preserve last-known data silently
                    console.warn('[LGF] Scraper returned 0 venues — preserving last-known data, feed intact.');
                    setIsScraperDead(true);
                } else {
                    // Very first load with 0 venues — nothing to preserve
                    setLiveData(mapping);
                    setIsScraperDead(true);
                }

                // Store global stats from API metadata
                if (json.metadata) {
                    setGlobalStats({
                        venues: json.metadata.venues_with_live_data || 0,
                        tables: json.metadata.total_tables_running || 0,
                        waiting: json.metadata.total_players_waiting || 0,
                        lastScrape: json.metadata.last_scrape || null,
                        // 'estimated' means these counts are modelled from weeks of
                        // real observed history, not a live scrape. Label accordingly.
                        dataMode: json.metadata.data_mode || null,
                    });
                }
                setLastRefreshTime(new Date());
                // Check staleness
                if (json.metadata?.last_scrape) {
                    const age = Date.now() - new Date(json.metadata.last_scrape).getTime();
                    setIsDataStale(age > STALE_THRESHOLD_MS);
                }
                
                // Notify rest of platform (Game Trends & Heatmaps)
                busEmit.dataMutated('live_tables');
            } else {
                // HTTP error — preserve last-known data
                if (lastGoodLiveDataRef.current && Object.keys(lastGoodLiveDataRef.current || {}).length > 0) {
                    console.warn('[LGF] API HTTP error — preserving last-known data.');
                    setIsScraperDead(true);
                    // Do NOT clear isDataStale — offline data continues aging.
                }
            }
        } catch (e) {
            console.warn('Fetch global live data error:', e);
            // Network failure — preserve last-known data
            if (lastGoodLiveDataRef.current && Object.keys(lastGoodLiveDataRef.current || {}).length > 0) {
                setIsScraperDead(true);
                // Do NOT clear isDataStale — offline data continues aging.
            }
        }
        setLiveLoading(false);
        setIsRefreshing(false);
    }, []);

    // ─── AUTO-REFRESH POLLING ───
    // Re-enable 2-minute polling so live data NEVER goes stale.
    // Realtime subscription handles individual row mutations; polling is the safety net
    // for full-cycle refreshes when a complete new scrape batch arrives.
    // PERFORMANCE FIX: this was a 1-SECOND interval that committed a new
    // `refreshCountdown` state value on every tick — re-rendering the whole feed
    // (up to 200 venue cards) once per second, forever — even though the countdown
    // was never displayed anywhere. It also called fetchGlobalLiveData INSIDE the
    // setState updater, which React may double-invoke under StrictMode, firing
    // duplicate refreshes. A plain interval at the real refresh period does the job.
    useEffect(() => {
        countdownRef.current = setInterval(() => {
            fetchGlobalLiveData(true);
        }, LIVE_REFRESH_MS);
        return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }, [fetchGlobalLiveData]);

    useEffect(() => {
        fetchGlobalLiveData();
        
        // [LGF2 FIX] Was static channel name 'public:venue_live_tables'.
        // If component mounts twice (React strict mode / parent remount), both instances
        // share the same channel. removeChannel() on first unmount kills it for both,
        // leaving the second with a zombie subscription that never delivers events.
        // Now uses a unique randomized name (same pattern as useVenueRealtime.js).
        const channelName = `lgf-live-tables-${Math.random().toString(36).substring(2, 10)}`;
        const liveChannel = supabase.channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_live_tables' }, (payload) => {
                if (!payload) return;
                const { eventType } = payload;

                if (eventType === 'DELETE') {
                    // Trigger a debounced full re-fetch when ANY game is deleted (table broken/closed)
                    // We must fetchGlobalLiveData because Supabase default replica identity only provides the row id
                    // on DELETEs, making it impossible to confidently map the deletion to a specific venue/game locally.
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = setTimeout(() => fetchGlobalLiveData(true), 2000);
                    return;
                }

                if (eventType !== 'UPDATE' && eventType !== 'INSERT') return;
                const newRec = payload.new;
                if (!newRec?.bravo_slug || !newRec?.game_name) return; // Guard null game fields
                
                // Buffer the incoming realtime payloads
                realtimeBufferRef.current.push(newRec);

                // Flush buffer to React state every 800ms to prevent render thrashing
                if (!flushTimerRef.current) {
                    flushTimerRef.current = setTimeout(() => {
                        flushTimerRef.current = null;
                        const buffer = [...realtimeBufferRef.current];
                        realtimeBufferRef.current = [];
                        
                        setLiveData(prev => {
                            const nextState = { ...prev };
                            let needsRefetch = false;

                            for (const rec of buffer) {
                                const match = nextState[rec.bravo_slug];
                                if (!match) {
                                    needsRefetch = true;
                                    continue;
                                }
                                
                                const nextV = { ...match, games: [...(match.games || [])] };
                                const mappedGame = {
                                    game: String(rec.game_name).trim(),
                                    tables_running: rec.tables_running || 0,
                                    players_waiting: rec.players_waiting || 0,
                                    source: rec.source || 'bravo',
                                    buyin: rec.buyin_range || null,
                                    runs: rec.runs_schedule || null,
                                    data_quality: rec.data_quality || null,
                                    _rowId: rec.id, // track DB row for dedup
                                };
                                
                                const gameIdx = nextV.games.findIndex(g => g && g.game === mappedGame.game);
                                if (gameIdx !== -1) {
                                    nextV.games[gameIdx] = mappedGame;
                                } else {
                                    nextV.games.push(mappedGame);
                                }
                                
                                nextV.totalTables = (nextV.games || []).reduce((acc, g) => acc + ((g && g.tables_running) || 0), 0);
                                nextV.totalWait = (nextV.games || []).reduce((acc, g) => acc + ((g && g.players_waiting) || 0), 0);
                                
                                nextState[rec.bravo_slug] = nextV;
                            }

                            if (needsRefetch) {
                                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                                debounceTimerRef.current = setTimeout(() => fetchGlobalLiveData(true), 2000);
                            }
                            
                            return nextState;
                        });
                    }, 800);
                }
                // Notify rest of platform (Game Trends & Heatmaps) of instantaneous change via EventBus
                // DEBOUNCED: Prevents DDOSing companion API routes during rapid batch mutations
                if (busEmitDebounceRef.current) clearTimeout(busEmitDebounceRef.current);
                busEmitDebounceRef.current = setTimeout(() => {
                    busEmit.dataMutated('live_tables');
                }, 1500);
            })
            .subscribe();

        return () => { 
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (busEmitDebounceRef.current) clearTimeout(busEmitDebounceRef.current);
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
            if (liveChannel) supabase.removeChannel(liveChannel);
        };
    }, [fetchGlobalLiveData]);

    // ─── FILTER & MERGE (with fallback to last-known data) ───
    const mergedVenues = useMemo(() => {
        const liveEntries = Object.values(liveData || {});

        // Build multi-layer lookups from parent venues for enrichment
        const venueByName = {};       // exact lowercase name → venue
        const venueBySlug = {};       // exact slug/bravo_slug → venue
        const venueByNormName = {};   // normalized name → venue
        const venueWordIndex = [];    // [{words: [...], venue}] for word-overlap matching
        for (const v of venues) {
            if (v.name) {
                venueByName[v.name.toLowerCase()] = v;
                const norm = normalizeVenueName(v.name);
                if (norm) venueByNormName[norm] = v;
                const sigWords = getSignificantWords(norm);
                if (sigWords.length > 0) venueWordIndex.push({ words: sigWords, venue: v });
            }
            if (v.bravo_slug) venueBySlug[v.bravo_slug] = v;
            // Also index by 'slug' — all-venues.json uses 'slug' not 'bravo_slug'
            if (v.slug && !venueBySlug[v.slug]) venueBySlug[v.slug] = v;
            // Track PA slugs so external sources match perfectly without hard aliases
            if (v.pokeratlas_slug && !venueBySlug[v.pokeratlas_slug]) venueBySlug[v.pokeratlas_slug] = v;
        }

        // 4-layer parent venue finder: slug → stripped slug → decoded name → word overlap
        // Hardcoded alias fallback for critical mismatches not correctly populated in poker_venues
        const KNOWN_ALIASES = {
            'grand-victoria-casino-elgin': 'grand-victoria-casino-il',
            'rivers-casino-des-plaines': 'rivers-casino-il',
            'wind-creek-chicago-southland': 'wind-creek-chicago-southland-il',
            'rivers-casino-philadelphia': 'rivers-casino-philadelphia',
            'rivers-casino-portsmouth': 'rivers-casino-portsmouth',
            'horseshoe-hammond': 'horseshoe-hammond-hammond',
            'pa-horseshoe-hammond': 'horseshoe-hammond-hammond'
        };

        const findParentVenue = (bravoSlug, venueName) => {
            if (!bravoSlug && !venueName) return null;
            
            // Layer 1: Exact slug match
            if (bravoSlug && venueBySlug[bravoSlug]) return venueBySlug[bravoSlug];
            // Layer 1.5: Alias match 
            if (bravoSlug && KNOWN_ALIASES[bravoSlug] && venueBySlug[KNOWN_ALIASES[bravoSlug]]) {
                return venueBySlug[KNOWN_ALIASES[bravoSlug]];
            }
            // Layer 2: Strip pa- prefix from bravo slug
            if (bravoSlug && bravoSlug.startsWith('pa-')) {
                const stripped = bravoSlug.slice(3);
                if (venueBySlug[stripped]) return venueBySlug[stripped];
            }
            // Layer 3: HTML-decoded exact name match
            const decodedName = decodeHtmlEntities(venueName || '');
            if (decodedName && venueByName[decodedName.toLowerCase()]) return venueByName[decodedName.toLowerCase()];
            // Layer 3b: Normalized name match (strips &→and, punctuation, etc.)
            const normName = normalizeVenueName(venueName);
            if (normName && venueByNormName[normName]) return venueByNormName[normName];
            // Layer 4: Significant word overlap (≥0.6 score, skip series/tour entries)
            if (normName) {
                const queryWords = getSignificantWords(normName);
                if (queryWords.length >= 1) {
                    let bestMatch = null;
                    let bestScore = 0;
                    for (const entry of venueWordIndex) {
                        // Skip tour/series entries — they're not physical venues
                        if (SERIES_PATTERN.test(entry.venue.name || '')) continue;
                        if (entry.venue.venue_type === 'series' || entry.venue.venue_type === 'tour') continue;
                        const shared = queryWords.filter(w => entry.words.includes(w)).length;
                        const score = shared / Math.max(queryWords.length, entry.words.length);
                        const minShared = queryWords.length >= 2 ? 2 : 1;
                        if (shared >= minShared && score >= 0.6 && score > bestScore) {
                            bestScore = score;
                            bestMatch = entry.venue;
                        }
                    }
                    if (bestMatch) return bestMatch;
                }
            }
            return null;
        };

        let list = [];

        // PRIMARY: Map live data when available
        const liveMapped = liveEntries.map(liveEntry => {
            const parentVenue = findParentVenue(liveEntry.bravo_slug, liveEntry.venue_name);
            const logoUrl = getVenueLogoUrl(parentVenue || { website: null });
            const waitEst = liveEntry.totalWait > 0 
                ? estimateWaitTime(liveEntry.totalWait, liveEntry.totalTables) 
                : null;
            
            return {
                bravo_slug: liveEntry.bravo_slug,
                name: parentVenue?.name || decodeHtmlEntities(liveEntry.venue_name),
                venue_name: parentVenue?.name || decodeHtmlEntities(liveEntry.venue_name),
                totalTables: liveEntry.totalTables || 0,
                totalWait: liveEntry.totalWait || 0,
                games: liveEntry.games || [],
                last_updated: liveEntry.last_updated,
                primarySource: liveEntry.primarySource || 'bravo',
                id: parentVenue?.id || liveEntry.bravo_slug,
                latitude: parentVenue?.latitude || null,
                longitude: parentVenue?.longitude || null,
                state: parentVenue?.state || null,
                city: parentVenue?.city || null,
                venue_type: parentVenue?.venue_type || 'casino',
                trust_score: parentVenue?.trust_score || 0,
                address: parentVenue?.address || '',
                phone: parentVenue?.phone || '',
                website: parentVenue?.website || '',
                logo_url: logoUrl,
                logoUrl,
                is_social_page: parentVenue?.is_social_page || false,
                social_page_id: parentVenue?.social_page_id || null,
                // Carried through so the card can show the venue's REAL spread when
                // the live feed reports no games (see the stakes fallback below).
                stakes_cash: parentVenue?.stakes_cash || null,
                waitEstimate: waitEst,
                // PROVENANCE: /api/poker/live-tables publishes is_simulated (every game
                // modelled) and has_simulated_data (some games modelled). These were
                // dropped here, so a modelled table count rendered with a pulsing green
                // dot and a red "LIVE DATA" badge. Carry them to the card.
                is_simulated: !!liveEntry.is_simulated,
                has_simulated_data: !!liveEntry.has_simulated_data,
                _hasParentVenue: !!parentVenue,
                _isLive: true,
            };
        });

        // DEDUP FIX: Build the exclusion set from BOTH id AND bravo_slug.
        // When parentVenue is null, v.id falls back to liveEntry.bravo_slug (a string).
        // The catalog filter uses v.id (DB UUID) — so without bravo_slug in the set,
        // unmatched live venues would appear TWICE (once from liveData, once from catalogMapped).
        const liveIds = new Set();
        const liveSlugs = new Set();
        liveMapped.forEach(v => {
            if (v.id) liveIds.add(v.id);
            if (v.bravo_slug) liveSlugs.add(v.bravo_slug);
        });
        const catalogMapped = venues
            .filter(v => v.games_offered && v.games_offered.length > 0 && v.poker_tables > 0)
            .filter(v => !liveIds.has(v.id) && !liveSlugs.has(v.bravo_slug) && !liveSlugs.has(v.slug)) // Exclude those already in live data
            .map(v => {
                const logoUrl = getVenueLogoUrl(v);
                return {
                    bravo_slug: v.bravo_slug || v.slug || `venue-${v.id}`,
                    name: v.name,
                    venue_name: v.name,
                    totalTables: v.poker_tables || 0,
                    totalWait: 0,
                    games: (v.games_offered || []).map(g => ({ game: g, tables_running: 0, source: 'catalog' })),
                    last_updated: null,
                    primarySource: 'catalog',
                    id: v.id,
                    latitude: v.latitude,
                    longitude: v.longitude,
                    state: v.state,
                    city: v.city,
                    venue_type: v.venue_type || 'casino',
                    trust_score: v.trust_score || 0,
                    address: v.address || '',
                    phone: v.phone || '',
                    website: v.website || '',
                    logo_url: logoUrl,
                    logoUrl,
                    is_social_page: v.is_social_page || false,
                    social_page_id: v.social_page_id || null,
                    stakes_cash: v.stakes_cash || null,
                    waitEstimate: null,
                    is_simulated: false,
                    has_simulated_data: false,
                    _hasParentVenue: true,
                    _isLive: false,
                };
            });

        // Combine them so the feed has both active live tables and static known poker rooms
        list = [...liveMapped, ...catalogMapped];

        // Single venue override
        if (selectedVenue) {
            const selectedSlug = selectedVenue.bravo_slug || selectedVenue.id;
            return list.filter(v => v.bravo_slug === selectedSlug || v.id === selectedVenue.id);
        }

        // 1. Filter by State
        if (filterState !== 'all') {
            list = list.filter(v => v.state === filterState);
        }

        // 2. Filter by Distance
        // POLICY: Live venues whose parent record couldn't be matched (no lat/lng) must
        // NOT be silently dropped when a radius filter is active — they have real game data
        // and may be near the user; we just haven't linked them to coordinates yet.
        // Strategy: split into located vs unlocated, distance-filter only located ones, // then append ONLY unlocated LIVE venues at the end so active feed always has content.
        if (effectiveLocation && filterRadius !== 'any') {
            const located = list.filter(v => v.latitude && v.longitude);
            // Append unlocated venues ONLY if they have active live data (_isLive === true).
            // Unlocated catalog venues should be dropped to avoid spamming the local feed with unverified locations.
            const unlocatedActive = list.filter(v => (!v.latitude || !v.longitude) && v._isLive);
            
            const effectiveRadius = isNaN(Number(filterRadius)) ? 50 : Number(filterRadius);
            const inRadius = located.filter(v => calcDist(v) <= effectiveRadius);
            list = [...inRadius, ...unlocatedActive];
        }

        // 3. Filter by Game Type
        if (filterGameType !== 'all') {
            list = list.filter(v => (v.games || []).some(g => g && matchesGameType(g.game, filterGameType)));
        }

        // 4. Filter by Stakes
        if (filterStakes !== 'any') {
            list = list.filter(v => venueHasStakes(v.games || [], filterStakes));
        }

        // 5. Sort
        list.sort((a, b) => {
            if (filterSort === 'tables') {
                if (b.totalTables !== a.totalTables) return b.totalTables - a.totalTables;
                return b.totalWait - a.totalWait;
            }
            if (filterSort === 'distance') return calcDist(a) - calcDist(b);
            if (filterSort === 'trust') return (b.trust_score || 0) - (a.trust_score || 0);
            return 0;
        });

        return list;
    }, [venues, liveData, filterState, filterRadius, filterSort, filterGameType, filterStakes, effectiveLocation, selectedVenue, calcDist]);

    // ─── SEARCH LOGIC ───
    // While `selectedVenue` is set, mergedVenues collapses to that one venue, so
    // searching it would return no suggestion for any other room. Keep the last
    // un-drilled-down list to match against, so editing the query keeps working.
    const searchPoolRef = useRef([]);
    useEffect(() => {
        if (!selectedVenue) searchPoolRef.current = mergedVenues;
    }, [selectedVenue, mergedVenues]);

    const handleSearchInput = (value) => {
        setSearchQuery(value);
        // Editing the query also releases the single-venue drill-down.
        if (selectedVenue) setSelectedVenue(null);
        const searchPool = selectedVenue ? searchPoolRef.current : mergedVenues;
        if (value.trim().length >= 2) {
            const q = value.trim().toLowerCase();
            const matches = searchPool
                .filter(v => decodeHtmlEntities(v.name || '').toLowerCase().includes(q))
                .slice(0, 8)
                .map(v => ({ id: v.id || v.bravo_slug, bravo_slug: v.bravo_slug || v.id, name: decodeHtmlEntities(v.name), totalTables: v.totalTables || 0 }));
            setSearchSuggestions(matches);
            setShowSuggestions(matches.length > 0);
        } else {
            setSearchSuggestions([]);
            setShowSuggestions(false);
        }
    };

    const handleSelectSuggestion = (v) => {
        setSelectedVenue(v);
        setSearchQuery(v.name);
        setShowSuggestions(false);
    };

    const handleClearSearch = () => {
        setSelectedVenue(null);
        setSearchQuery('');
        setShowSuggestions(false);
    };

    const handleResetFilters = () => {
        const newRadius = effectiveLocation ? '50' : 'any';
        if (globalFilters && setGlobalFilters) {
            // Delegate to parent global state — reset all applicable filters
            setGlobalFilters(prev => ({
                ...prev,
                radius: String(newRadius).toLowerCase() === 'any' ? 'any' : Number(newRadius),
                gameType: 'all',
                stakes: 'all',
                selectedState: 'all',
            }));
        } else {
            // Standalone mode — reset internal filter state
            setInternalFilterRadius(newRadius);
            setInternalFilterState('all');
            setInternalFilterGameType('all');
            setInternalFilterStakes('any');
        }
        setSearchQuery('');
        setSelectedVenue(null);
        locationAppliedRef.current = !!effectiveLocation; // Prevent auto-snap from re-firing
    };

    const toggleBreakdown = (slug) => {
        setExpandedBreakdowns(prev => ({ ...prev, [slug]: !prev[slug] }));
    };

    // ─── RENDER: TABLE BREAKDOWN ───
    const renderTableBreakdown = (venueSlug, venueGames) => {
        if (!venueGames || venueGames.length === 0) return null;
        
        const isExpanded = expandedBreakdowns[venueSlug];
        const needsCollapse = venueGames.length > COLLAPSE_THRESHOLD;
        const displayGames = needsCollapse && !isExpanded 
            ? [...venueGames].sort((a, b) => ((b && b.tables_running) || 0) - ((a && a.tables_running) || 0)).slice(0, COLLAPSE_THRESHOLD) 
            : venueGames;
        const hiddenCount = venueGames.length - COLLAPSE_THRESHOLD;

        return (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(224,232,240,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Game Breakdown</span>
                </div>
                {displayGames.map((g, i) => {
                    if (!g || typeof g.game !== 'string') return null;
                    const normalized = normalizeGameName(g.game);
                    const isPASource = g.source === 'pokeratlas';
                    return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, fontSize: 12, padding: '2px 0' }}>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', marginRight: 8 }}>
                            <span style={{ color: '#8b949e', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                {normalized.canonical !== 'Unknown' ? normalized.canonical : g.game}
                            </span>
                            {g.buyin && (
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                                    Buy-in: {g.buyin}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                            {g.players_waiting > 0 && <span style={{ color: '#ffffff', fontSize: 11 }}>{g.players_waiting} waiting</span>}
                            {isPASource ? (
                                <span style={{ color: '#ffffff', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>
                                    {g.runs || `~${g.tables_running} est.`}
                                </span>
                            ) : (
                                <span style={{ color: '#3fb950', fontWeight: 700, whiteSpace: 'nowrap' }}>{g.tables_running} {g.tables_running === 1 ? 'table' : 'tables'}</span>
                            )}
                        </div>
                    </div>
                    );
                })}
                {needsCollapse && (
                    <button 
                        onClick={() => toggleBreakdown(venueSlug)} 
                        style={{ 
                            display: 'block', width: '100%', marginTop: 6, padding: '5px 0', 
                            background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', 
                            borderRadius: 6, color: '#ffffff', fontSize: 11, fontWeight: 600, 
                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' 
                        }}
                    >
                        {isExpanded ? 'Show Less' : `Show All ${venueGames.length} Games (+${hiddenCount} more)`}
                    </button>
                )}
            </div>
        );
    };

    // ─── GAME TYPE COLOR MAPPING ───
    const getGameChipStyle = (gameName) => {
        if (!gameName || typeof gameName !== 'string') return {};
        const upper = gameName.toUpperCase();
        if (upper.includes('PLO') || upper.includes('OMAHA')) return { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.22)' }; // Blue for PLO
        if (upper.includes('NLH') || upper.includes('NO LIMIT') || upper.includes('HOLDEM') || upper.includes("HOLD'EM")) return { bg: 'rgba(255,255,255,0.12)', color: '#ffffff', border: 'rgba(255,255,255,0.22)' };
        if (upper.includes('LIMIT') && !upper.includes('NO LIMIT')) return { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.22)' };
        if (upper.includes('MIXED') || upper.includes('HORSE') || upper.includes('8-GAME')) return { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: 'rgba(6,182,212,0.22)' };
        if (upper.includes('STUD')) return { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.22)' }; // Red for 7-Stud
        if (upper.includes('BIG O')) return { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.22)' };
        return {};
    };

    // ─── RENDER: LIVE VENUE CARD (PREMIUM UPGRADE) ───
    const renderLiveVenueCard = (v, index) => {
        const dist = calcDist(v);
        // BUG FIX: catalog rows set totalTables = poker_tables (room CAPACITY, no live
        // data), so a closed 30-table room was scoring HOT. Only live counts are heat.
        const heat = getHeatLevel(v._isLive ? v.totalTables : 0);
        const isFav = favorites && favorites[v.id];
        // Modelled (simulated) rows must never be dressed up as a real-time scrape.
        const isModelled = !!(v.is_simulated || v.has_simulated_data);
        const initColor = getInitialsColor(v.id || 0);
        const venueInitials = (v.name || '?').split(/[\s-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const trustScore = v.trust_score || 0;
        const trustPct = Math.round((trustScore / 5) * 100);
        const trustColor = trustScore >= 4.5 ? '#22c55e' : trustScore >= 4.0 ? '#3b82f6' : trustScore >= 3.0 ? '#f59e0b' : '#ef4444';
        const trustLabel = trustScore >= 4.5 ? 'Excellent' : trustScore >= 4.0 ? 'Good' : trustScore >= 3.0 ? 'Moderate' : 'Low';
        // Venue type border — full color frames per mockup
        const vType = (v.venue_type || '').toLowerCase();
        let venueAccentColor = 'rgba(255,255,255,0.28)';
        if (vType === 'casino') venueAccentColor = '#ffffff';
        else if (vType === 'poker_club' || vType === 'card_room') venueAccentColor = '#4ade80';
        else if (vType === 'charity') venueAccentColor = '#3b82f6';
        else if (vType === 'home_game') venueAccentColor = '#f59e0b';
        else if (['poker_tour', 'tour', 'tour_stop', 'series'].includes(vType)) venueAccentColor = '#ef4444';
        
        const venueBorder = `2px solid ${venueAccentColor}`;
        // Collect unique game type chips from breakdown
        const gameTypeChips = (() => {
            if (!v.games || v.games.length === 0) return [];
            const seen = new Set();
            return v.games.map(g => {
                if (!g || !g.game || typeof g.game !== 'string') return null;
                const norm = normalizeGameName(g.game);
                const label = norm.canonical !== 'Unknown' ? norm.canonical : g.game;
                if (seen.has(label)) return null;
                seen.add(label);
                return label;
            }).filter(Boolean).slice(0, 5);
        })();
        
        return (
            <div 
                key={v.bravo_slug || v.id || `venue-${index}`} 
                style={{ 
                    position: 'relative',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: `lgf-fadeInUp 0.3s ease-out ${Math.min(index * 0.04, 0.4)}s both`,
                }}
            >
                {/* Venue Card */}
                <div style={{ 
                    position: 'relative',
                    background: 'linear-gradient(160deg, rgba(16,24,36,0.95) 0%, rgba(10,16,26,0.98) 100%)', 
                    border: venueBorder, 
                    borderRadius: 14, 
                    overflow: 'hidden', 
                    padding: '16px 18px 14px',
                    boxShadow: `0 4px 20px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.05)`,
                    transition: 'all 0.2s ease',
                    cursor: router ? 'pointer' : 'default',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                }}
                onClick={() => {
                    // For unmatched parents, v.id falls back to bravo_slug (e.g. 'horseshoe-hammond').
                    // Navigating to /hub/venues/horseshoe-hammond returns 404 — only navigate for real ids.
                    const detailId = resolveVenueDetailId(v.id);
                    if (!detailId) return; // Unmatched venue — no detail page available yet
                    if (openVenueModal) openVenueModal(`/hub/venues/${detailId}`);
                    else if (router) router.push(`/hub/venues/${detailId}`);
                }}
                >
                    {/* Top accent gradient line */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 2,
                        background: `linear-gradient(90deg, ${heat.color}, ${heat.color}55, transparent)`,
                    }} />
                    {/* === HEADER ZONE === */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0, alignItems: 'center' }}>
                            {/* Venue Logo — 54px premium */}
                            {v.logoUrl ? (
                                <img 
                                    src={v.logoUrl} alt="" loading="lazy"
                                    style={{ width: 54, height: 54, borderRadius: 10, objectFit: 'contain', flexShrink: 0, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.9)', padding: 4 }}
                                    onError={(e) => {
                                        const fallback = getVenueLogoFallback(v);
                                        if (fallback && e.target.src !== fallback) {
                                            e.target.src = fallback;
                                        } else {
                                            e.target.style.display = 'none';
                                        }
                                    }}
                                />
                            ) : (
                                <div style={{ width: 54, height: 54, borderRadius: 10, background: initColor.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: initColor.text, flexShrink: 0, border: `1px solid ${initColor.border}` }}>
                                    {venueInitials}
                                </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                                    {v.name}
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                    {(v.city || v.state) && (
                                        <span style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)' }}>
                                            {[v.city, v.state].filter(Boolean).join(', ')}
                                        </span>
                                    )}
                                    <SourceBadge source={v.primarySource} isSimulated={isModelled} />
                                </div>
                            </div>
                        </div>
                        {/* Right: Fav + Distance */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                            {handleToggleFavorite && (
                                <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(v.id, v); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, transition: 'transform 0.2s' }}
                                    title={isFav ? 'Remove From Saved' : 'Save Venue'}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? '#ef4444' : 'none'} stroke={isFav ? '#ef4444' : 'rgba(255,255,255,0.45)'} strokeWidth="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                                    </svg>
                                </button>
                            )}
                            {effectiveLocation && v.latitude && dist < 99999 && (
                                <span style={{ fontSize: 11, color: '#3fb950', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                                    {dist < 1 ? `${(dist * 5280).toFixed(0)} ft` : `${dist.toFixed(1)} mi`}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* === LIVE BADGES === */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {/* BUG FIX: catalog rows carry poker_tables (room capacity) in
                            totalTables and have no live feed at all, yet this badge used to
                            render "{n} Tables Running" with a pulsing live dot for them —
                            a closed 30-table room advertised "30 Tables Running". Live rows
                            keep the running badge; catalog rows state capacity honestly. */}
                        {v._isLive && isModelled ? (
                            /* Modelled counts: no pulsing "live" dot, no "Running" claim. */
                            <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                title="Modelled from weeks of observed history — not a live scrape">
                                {v.totalTables} Table{v.totalTables !== 1 ? 's' : ''} Estimated
                            </span>
                        ) : v._isLive ? (
                            <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.35)', boxShadow: '0 0 12px rgba(34,197,94,0.2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', animation: 'lgf-pulse 1.5s ease-in-out infinite' }} />
                                {v.totalTables} Table{v.totalTables !== 1 ? 's' : ''} Running
                            </span>
                        ) : (
                            v.totalTables > 0 && (
                                <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.18)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    {v.totalTables} Table{v.totalTables !== 1 ? 's' : ''}
                                </span>
                            )
                        )}

                        {!v._isLive && (
                            <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', textTransform: 'uppercase' }}>No Live Data</span>
                        )}
                    </div>

                    {/* === GAME TYPE CHIPS (color-coded) === */}
                    {gameTypeChips.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {gameTypeChips.map((g, idx) => {
                                const chipStyle = getGameChipStyle(g);
                                return (
                                    <span key={g || idx} style={{
                                        padding: '4px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: 600,
                                        background: chipStyle.bg || 'rgba(255,255,255,0.06)',
                                        color: chipStyle.color || 'rgba(255,255,255,0.65)',
                                        border: `1px solid ${chipStyle.border || 'rgba(255,255,255,0.1)'}`,
                                    }}>{g}</span>
                                );
                            })}
                        </div>
                    )}

                    {/* Game Breakdown — COLLAPSIBLE (flex-grow pushes rest to bottom) */}
                    <div style={{ flex: 1 }}>
                        {(!v.games || v.games.length === 0) ? (
                            /* BUG FIX: this used to hardcode "STAKES PLAYED $1/$2 $2/$5" for
                               EVERY venue with no game data — placeholder numbers presented as
                               that venue's real spread. Show the venue's actual stakes_cash
                               when we have it, otherwise say plainly that we have no data. */
                            <div style={{ padding: '8px 0', marginTop: 4 }}>
                                {Array.isArray(v.stakes_cash) && v.stakes_cash.length > 0 ? (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Stakes Played {v.stakes_cash.slice(0, 4).join('  ')}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        No live game data
                                    </span>
                                )}
                            </div>
                        ) : (
                            renderTableBreakdown(v.bravo_slug || v.id || `venue-${index}`, v.games)
                        )}
                    </div>

                    {/* === ACTION BAR === */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {user && (
                                <button onClick={(e) => { e.stopPropagation(); setReportVenue({ id: v.id, name: v.name, city: v.city, state: v.state }); setReportModalOpen(true); }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.25)', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    Report
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {(openVenueModal || router) && resolveVenueDetailId(v.id) && (
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    const detailId = resolveVenueDetailId(v.id);
                                    if (!detailId) return;
                                    if (openVenueModal) openVenueModal(`/hub/venues/${detailId}`);
                                    else if (router) router.push(`/hub/venues/${detailId}`);
                                }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(110,231,239,0.12)', color: '#6ee7ef', border: '1px solid rgba(110,231,239,0.25)', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                                    Details
                                </button>
                            )}
                        </div>
                    </div>

                    {/* === TRUST SCORE BAR === */}
                    {trustScore > 0 && (
                        <div style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: trustColor }}>Trust: {trustLabel}</span>
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: trustColor }}>{trustScore}/5</span>
                            </div>
                            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${trustPct}%`, borderRadius: 3, background: `linear-gradient(90deg, ${trustColor}, ${trustColor}77)`, boxShadow: `0 0 8px ${trustColor}33`, transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                            </div>
                        </div>
                    )}

                    {/* Last Updated — RELATIVE TIME with Stale Indicator */}
                    {v.last_updated && (() => {
                        const staleInfo = isStaleData(v.last_updated);
                        return (
                            <div style={{ marginTop: 6, fontSize: 10, color: staleInfo.stale ? 'rgba(245,158,11,0.6)' : 'rgba(200,214,229,0.25)', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}
                                title={new Date(v.last_updated).toLocaleString()}>
                                {staleInfo.stale && (<span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', fontWeight: 700, textTransform: 'uppercase' }}>STALE</span>)}
                                Updated {staleInfo.age}
                            </div>
                        );
                    })()}
                </div>
            </div>
        );
    };

    // ─── DYNAMIC STATE OPTIONS (only show states that actually have live data) ───
    // Uses same 4-layer matching as mergedVenues to avoid state-filter lockout
    const availableStates = useMemo(() => {
        // Build lookups (same as merge, but reads from unfiltered liveData to prevent lockout)
        const bySlug = {};
        const byName = {};
        const byNorm = {};
        const wordIdx = [];
        for (const pv of venues) {
            if (pv.bravo_slug) bySlug[pv.bravo_slug] = pv;
            if (pv.slug) bySlug[pv.slug] = pv;
            // AUDIT FIX: was missing pokeratlas_slug — PA-sourced venues couldn't resolve state,
            // causing the state-filter dropdown to silently exclude PA venues from its options.
            if (pv.pokeratlas_slug && !bySlug[pv.pokeratlas_slug]) bySlug[pv.pokeratlas_slug] = pv;
            if (pv.name) {
                byName[pv.name.toLowerCase()] = pv;
                const norm = normalizeVenueName(pv.name);
                if (norm) byNorm[norm] = pv;
                const sw = getSignificantWords(norm);
                if (sw.length > 0) wordIdx.push({ words: sw, venue: pv });
            }
        }
        const findParent = (slug, name) => {
            if (slug && bySlug[slug]) return bySlug[slug];
            if (slug && slug.startsWith('pa-') && bySlug[slug.slice(3)]) return bySlug[slug.slice(3)];
            const decoded = decodeHtmlEntities(name || '');
            if (decoded && byName[decoded.toLowerCase()]) return byName[decoded.toLowerCase()];
            const norm = normalizeVenueName(name);
            if (norm && byNorm[norm]) return byNorm[norm];
            if (norm) {
                const qw = getSignificantWords(norm);
                if (qw.length >= 1) {
                    let best = null, bestS = 0;
                    for (const e of wordIdx) {
                        if (SERIES_PATTERN.test(e.venue.name || '')) continue;
                        if (e.venue.venue_type === 'series' || e.venue.venue_type === 'tour') continue;
                        const shared = qw.filter(w => e.words.includes(w)).length;
                        const sc = shared / Math.max(qw.length, e.words.length);
                        const minSh = qw.length >= 2 ? 2 : 1;
                        if (shared >= minSh && sc >= 0.6 && sc > bestS) { bestS = sc; best = e.venue; }
                    }
                    if (best) return best;
                }
            }
            return null;
        };
        const states = new Set();
        Object.values(liveData || {}).forEach(v => {
            const parent = findParent(v.bravo_slug, v.venue_name);
            if (parent?.state) states.add(parent.state);
        });
        return Array.from(states).sort();
    }, [liveData, venues]);

    return (
        <div style={{ padding: '0 0 40px' }}>
            {/* ─── CONTROLS ───
                STUB FIX: this row used to hold a "Filters" button that toggled
                `sidebarOpen`, but no element with class `lgf-sidebar` was ever rendered —
                tapping Filters on mobile did nothing at all. The button, its state and the
                orphan `.lgf-sidebar` CSS are gone (filters come from the parent page).
                In its place the venue search box that handleSearchInput /
                handleSelectSuggestion / handleClearSearch were written for — and which was
                never bound to any input — is now rendered, so the single-venue drill-down
                (`selectedVenue`) is reachable again. */}
            <div style={{ marginBottom: 12, padding: '0 16px' }}>
                <div style={{ position: 'relative', maxWidth: 420, marginLeft: 'auto' }}>
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => handleSearchInput(e.target.value)}
                        onFocus={() => { if (searchSuggestions.length > 0) setShowSuggestions(true); }}
                        onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
                        placeholder="Search venues..."
                        aria-label="Search live venues"
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '9px 34px 9px 12px', borderRadius: 10,
                            background: 'rgba(22,27,34,0.9)', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                        }}
                    />
                    {(searchQuery || selectedVenue) && (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            aria-label="Clear search"
                            style={{
                                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                                fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 4, fontFamily: 'inherit',
                            }}
                        >
                            ×
                        </button>
                    )}
                    {showSuggestions && searchSuggestions.length > 0 && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                            background: 'rgba(13,17,23,0.98)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        }}>
                            {searchSuggestions.map((s) => (
                                <button
                                    key={s.bravo_slug || s.id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleSelectSuggestion(s)}
                                    style={{
                                        display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                                        gap: 8, padding: '9px 12px', background: 'transparent', border: 'none',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e0e8f0',
                                        fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                                    }}
                                >
                                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                    {s.totalTables > 0 && (
                                        <span style={{ flexShrink: 0, fontSize: 11, color: '#3fb950', fontWeight: 700 }}>{s.totalTables}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* GPS Location Banner removed — now displayed at top of sidebar in parent page */}

            {/* ─── SCRAPER OFFLINE BANNER ─── */}
            {isScraperDead && !selectedVenue && (
                <div style={{
                    margin: '0 16px 12px', padding: '10px 16px', borderRadius: 10,
                    background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: '0 2px 8px rgba(245,158,11,0.08)'
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Using Cached Data — Intelligence Engines Are Syncing</div>
                        <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.7)', marginTop: 1 }}>
                            Live scrapers are temporarily offline. Showing last-known game data — no information has been lost.
                        </div>
                    </div>
                    <button
                        onClick={() => fetchGlobalLiveData(true)}
                        disabled={isRefreshing}
                        style={{ flexShrink: 0, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 7, padding: '5px 10px', color: '#f59e0b', fontSize: 11, fontWeight: 700, cursor: isRefreshing ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                        {isRefreshing ? 'Retrying...' : 'Retry'}
                    </button>
                </div>
            )}

            {/* ─── MODELLED DATA BANNER ───
                /api/poker/live-tables reports metadata.data_mode ('live' | 'mixed' |
                'estimated'). It was captured into globalStats.dataMode and then never
                rendered, so modelled table counts were presented to users as a live
                scrape. Surface it. */}
            {(globalStats.dataMode === 'estimated' || globalStats.dataMode === 'mixed') && !selectedVenue && (
                <div style={{
                    margin: '0 16px 12px', padding: '10px 16px', borderRadius: 10,
                    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
                            {globalStats.dataMode === 'estimated' ? 'Estimated Table Counts' : 'Some Table Counts Are Estimated'}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.75)', marginTop: 1 }}>
                            Cards marked ESTIMATED are modelled from weeks of observed history, not a live scrape.
                        </div>
                    </div>
                </div>
            )}

            {/* ─── STALE DATA BANNER ─── */}
            {isDataStale && !isScraperDead && !selectedVenue && (
                <div style={{
                    margin: '0 16px 16px', padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    boxShadow: '0 4px 12px rgba(245,158,11,0.1)'
                }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>Live Data May Be Outdated</div>
                        <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginTop: 2 }}>
                            Last Network Sync: {globalStats.lastScrape ? timeAgo(globalStats.lastScrape) : 'Unknown'}. Intelligence Engines May Be Experiencing Delays.
                        </div>
                    </div>
                </div>
            )}

            {/* ─── SIDEBAR + CONTENT LAYOUT ─── */}
            
            {/* ─── NEW VERTICAL LAYOUT ─── */}
            <div className="lgf-layout" style={{ display: 'flex', flexDirection: 'column', padding: '0 16px' }}>

            {/* ─── 1. COLLAPSIBLE MAP ─── */}
            {!selectedVenue && (
                <div style={{ background: 'rgba(13,17,23,0.95)', borderRadius: 14, overflow: 'visible', border: '1px solid rgba(48,54,61,0.8)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', marginBottom: 16, position: 'relative' }}>
                    <div onClick={() => setMapExpanded(!mapExpanded)} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '14px 14px 0 0' }}>
                        <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Live Games Map</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" style={{ transform: mapExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}><polyline points="6 9 12 15 18 9" /></svg>
                    </div>
                    {mapExpanded && (
                        <div style={{ height: 400, borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
                            <VenueMap venues={mergedVenues.filter(v => v.latitude && v.longitude)} userLocation={effectiveLocation} radiusMiles={filterRadius} />
                        </div>
                    )}
                </div>
            )}

            {/* ─── 2. HORIZONTAL CONTROL BAR (Removed to unify with global filters) ─── */}
<div className="lgf-main" style={{ flex: 1, minWidth: 0 }}>
                {liveLoading && Object.keys(liveData || {}).length === 0 ? (
                    renderSkeletons(4)
                ) : (
                    <>
                        {/* Header stat bar */}
                        {!selectedVenue && (
                            <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '7px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.5)' }}>
                                <span style={{ fontSize: 12, color: '#c9d1d9', fontWeight: 600 }}>
                                    {/* The list below is hard-capped at 200 cards; say so
                                        rather than reporting a total the list never reaches. */}
                                    {mergedVenues.length > 200 ? (
                                        <>Showing <span style={{ color: '#ef4444', fontWeight: 800 }}>200</span> of {mergedVenues.length} Live Venues</>
                                    ) : (
                                        <><span style={{ color: '#ef4444', fontWeight: 800 }}>{mergedVenues.length}</span> Live Venues</>
                                    )}
                                    {filterGameType !== 'all' && <span style={{ color: '#3fb950' }}> · {filterGameType.toUpperCase()}</span>}
                                    {filterStakes !== 'any' && <span style={{ color: '#ffffff' }}> · {filterStakes}/+</span>}
                                </span>
                                <button 
                                    onClick={() => fetchGlobalLiveData(true)} 
                                    disabled={isRefreshing}
                                    style={{ 
                                        background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)', 
                                        borderRadius: 6, padding: '4px 10px', color: '#ffffff', fontSize: 11, 
                                        fontWeight: 600, cursor: isRefreshing ? 'wait' : 'pointer', fontFamily: 'inherit',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={isRefreshing ? { animation: 'lgf-spin 1s linear infinite' } : {}}>
                                        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0115-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 01-15 6.7L3 16" />
                                    </svg>
                                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>

                            {/* Color Coded Map Legend for Venues */}
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, padding: '0 4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px rgba(255,255,255,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Casino</span></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px rgba(74,222,128,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Poker Club</span></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Charity</span></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8', boxShadow: '0 0 6px rgba(148,163,184,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Home Game</span></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }} /> <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Poker Tour</span></div>
                            </div>
                            </>
                        )}

                        {mergedVenues.length === 0 ? (
                            isScraperDead ? (
                                // ── SCRAPER DEAD + NO CACHED DATA: show warm placeholder, never a hard "no games" ──
                                <div style={{ textAlign: 'center', padding: 40, background: 'rgba(13,17,23,0.6)', borderRadius: 16, border: '1px dashed rgba(245,158,11,0.2)' }}>
                                    <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,0.6)" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    </div>
                                    <p style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', margin: '0 0 4px' }}>Intelligence Engines Are Syncing</p>
                                    <p style={{ fontSize: 13, color: 'rgba(245,158,11,0.6)', marginBottom: 16 }}>Live game data is being refreshed. Check back in a few minutes.</p>
                                    <button onClick={() => fetchGlobalLiveData(true)} disabled={isRefreshing} style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: 13, fontWeight: 700, cursor: isRefreshing ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                                        {isRefreshing ? 'Retrying...' : 'Retry Now'}
                                    </button>
                                </div>
                            ) : (
                            <div style={{ textAlign: 'center', padding: 40, background: 'rgba(13,17,23,0.6)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                                </div>
                                <p style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0', margin: '0 0 4px' }}>No Games In This Area</p>
                                <p style={{ fontSize: 13, color: 'rgba(200,214,229,0.5)', marginBottom: 16 }}>Try Expanding Your Filters Or Search Radius.</p>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button onClick={handleResetFilters} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(110,231,239,0.1)', border: '1px solid rgba(110,231,239,0.3)', color: '#6ee7ef', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        Reset Filters
                                    </button>
                                    {user && (
                                        <button onClick={() => { setReportVenue(null); setReportModalOpen(true); }} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                            Report A Game
                                        </button>
                                    )}
                                </div>
                            </div>
                            )
                        ) : (
                            (
                                /* UX FIX: gridTemplateColumns was an inline
                                   `repeat(2, 1fr)` with no media-query override, so at the
                                   375px mobile baseline each card got ~170px — and an inline
                                   style cannot be overridden from a stylesheet. Moved to
                                   `.lgf-venue-grid`, which collapses to one column <= 768px. */
                                <div className="lgf-venue-grid" style={{ display: 'grid', gap: 14, paddingBottom: 24, alignItems: 'stretch' }}>
                                    {mergedVenues.slice(0, 200).map((v, i) => renderLiveVenueCard(v, i))}
                                </div>
                            )
                        )}
                    </>
                )}
            </div>
            {/* end lgf-layout */}
            </div>

            {/* ─── REPORT GAME MODAL ─── */}
            <ReportGameModal
                venue={reportVenue}
                isOpen={reportModalOpen}
                onClose={() => { setReportModalOpen(false); setReportVenue(null); }}
                onSubmit={(game) => {
                    setReportSuccess(reportVenue?.name || 'Venue');
                    setTimeout(() => setReportSuccess(null), 4000);
                    fetchGlobalLiveData(true);
                }}
                user={user}
                userLocation={effectiveLocation}
                allVenues={mergedVenues}
            />

            {/* ─── REPORT SUCCESS TOAST ─── */}
            {reportSuccess && (
                <div style={{
                    position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
                    padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    boxShadow: '0 8px 32px rgba(34,197,94,0.4)', zIndex: 9999,
                    animation: 'lgf-fadeInUp 0.3s ease-out',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    Game Reported At {reportSuccess}
                </div>
            )}

            {/* ─── FLOATING REPORT BUTTON ─── */}
            {user && !reportModalOpen && (
                <button
                    onClick={() => { setReportVenue(null); setReportModalOpen(true); }}
                    style={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #ffffff, #cbd5e1)',
                        border: '2px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 6px 24px rgba(255,255,255,0.5)',
                        color: '#000', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    title="Report A Live Game"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                </button>
            )}

            {/* ─── SCOPED CSS ─── */}
            <style>{`
                @keyframes lgf-pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                @keyframes lgf-spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes lgf-fadeInUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                /* Venue grid: two columns on desktop, single column on mobile.
                   The orphan .lgf-sidebar / .lgf-filter-toggle rules that used to live
                   here styled elements that were never rendered — removed with the
                   dead Filters button. */
                .lgf-venue-grid { grid-template-columns: repeat(2, 1fr); }
                @media (max-width: 768px) {
                    .lgf-layout { flex-direction: column !important; }
                    .lgf-venue-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}

// ─── ERROR BOUNDARY — page NEVER shows raw crash screen ───
class LiveGamesFeedErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
        this._retryTimer = null;
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(err, info) {
        console.warn('[LiveGamesFeed] Caught render error:', err, info?.componentStack);
        if (this._retryTimer) clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => this.setState({ hasError: false }), 8000);
    }
    componentWillUnmount() { if (this._retryTimer) clearTimeout(this._retryTimer); }
    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: 'rgba(13,17,23,0.8)', borderRadius: 16, border: '1px solid rgba(245,158,11,0.2)', margin: '0 16px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                        <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/>
                        <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/>
                    </svg>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>Intelligence Engines Syncing</div>
                <div style={{ fontSize: 12, color: 'rgba(245,158,11,0.65)', marginBottom: 20 }}>Live data is refreshing. Retrying automatically...</div>
                <button onClick={() => this.setState({ hasError: false })} style={{ padding: '9px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', cursor: 'pointer', fontFamily: 'inherit' }}>Retry Now</button>
            </div>
        );
    }
}

const _LiveGamesFeedWrapped = (props) => (
    <LiveGamesFeedErrorBoundary>
        <LiveGamesFeed {...props} />
    </LiveGamesFeedErrorBoundary>
);
_LiveGamesFeedWrapped.displayName = 'LiveGamesFeed';
export default _LiveGamesFeedWrapped;
