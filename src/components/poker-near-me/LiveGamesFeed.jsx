import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { haversineMiles, timeAgo, getHeatLevel, parseMinStake, getVenueLogoUrl, getVenueLogoFallback, estimateWaitTime, saveFilters, loadFilters, isStaleData, getInitialsColor } from './pnm-utils';
import { normalizeGameName } from './normalize-game';
import { busEmit } from '../../engine/EventBus';
import ReportGameModal from './ReportGameModal';

// Dynamically import map to avoid SSR issues
const VenueMapPanel = dynamic(() => import('./VenueMapPanel'), { ssr: false });

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
 * SOURCE BADGE: Shows the data source for a venue's live data.
 * Source badge shows whether data is real-time or catalog-estimated.
 */
function SourceBadge({ source }) {
    const isBravo = source === 'bravo';
    return (
        <span style={{
            fontSize: 10, letterSpacing: '0.3px',
            color: isBravo ? 'rgba(239,68,68,0.9)' : 'rgba(212,168,83,0.9)',
            background: isBravo ? 'rgba(239,68,68,0.12)' : 'rgba(212,168,83,0.12)',
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 800,
            textTransform: 'uppercase',
        }}>
            {isBravo ? 'LIVE DATA' : 'CATALOG'}
        </span>
    );
}

// ─── GAME TYPE FILTER CHIPS ───
const GAME_TYPE_FILTERS = [
    { key: 'all', label: 'All Games' },
    { key: 'nlh', label: 'NLH' },
    { key: 'plo', label: 'PLO' },
    { key: 'mixed', label: 'Mixed' },
    { key: 'stud', label: 'Stud' },
];

function matchesGameType(gameName, filterKey) {
    if (filterKey === 'all') return true;
    const g = (gameName || '').toLowerCase();
    if (filterKey === 'nlh') return g.includes('hold') || g.includes('nlh') || g.includes('no limit holdem') || g.includes('no-limit hold');
    if (filterKey === 'plo') return g.includes('omaha') || g.includes('plo') || g.includes('big o');
    if (filterKey === 'mixed') return g.includes('mix') || g.includes('horse') || g.includes('triple draw') || g.includes('2-7') || g.includes('badugi');
    if (filterKey === 'stud') return g.includes('stud');
    return true;
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
    return games.some(g => parseMinStake(g.game) >= threshold);
}


export default function LiveGamesFeed({ 
    venues = [], 
    userLocation, 
    favorites = {}, 
    handleToggleFavorite, 
    checkinCounts = {}, 
    router, 
    setSelectedVenueForReview,
    user 
}) {
    // ─── REPORT GAME MODAL STATE ───
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportVenue, setReportVenue] = useState(null);
    const [reportSuccess, setReportSuccess] = useState(null);
    // ─── STATE ───
    const [liveData, setLiveData] = useState({}); // Mapping: bravo_slug -> live data
    const [liveLoading, setLiveLoading] = useState(true);
    const [lastRefreshTime, setLastRefreshTime] = useState(null);
    const [refreshCountdown, setRefreshCountdown] = useState(LIVE_REFRESH_MS / 1000);
    const [isRefreshing, setIsRefreshing] = useState(false);
    
    // Global stats from API metadata
    const [globalStats, setGlobalStats] = useState({ venues: 0, tables: 0, waiting: 0, lastScrape: null });
    const [isDataStale, setIsDataStale] = useState(false);

    // ─── SIDEBAR STATE ───
    const [sidebarOpen, setSidebarOpen] = useState(false);

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

    // Effective location = prop OR restored from localStorage
    const effectiveLocation = userLocation || restoredLocation;
    
    // Filters — restore from session if available
    const savedFilters = typeof window !== 'undefined' ? loadFilters('lgf', {}) : {};
    const [viewMode, setViewMode] = useState(savedFilters.viewMode || 'list');
    const [filterState, setFilterState] = useState(savedFilters.filterState || 'all');
    const [filterRadius, setFilterRadius] = useState(savedFilters.filterRadius || 'any');
    const [filterSort, setFilterSort] = useState(savedFilters.filterSort || 'tables');
    const [filterGameType, setFilterGameType] = useState(savedFilters.filterGameType || 'all');
    const [filterStakes, setFilterStakes] = useState(savedFilters.filterStakes || 'any');

    // Persist filters on change
    useEffect(() => {
        saveFilters('lgf', { viewMode, filterState, filterRadius, filterSort, filterGameType, filterStakes });
    }, [viewMode, filterState, filterRadius, filterSort, filterGameType, filterStakes]);
    
    // Single Venue drill-down (from autocomplete or clicking a card)
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState(null);
    
    // Collapsible breakdowns
    const [expandedBreakdowns, setExpandedBreakdowns] = useState({});
    
    const debounceTimerRef = useRef(null);
    const countdownRef = useRef(null);

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
                ? `/api/poker/live-tables?list=false&_t=${Date.now()}`
                : '/api/poker/live-tables?list=false';
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                const mapping = {};
                (json.venues || []).forEach(v => {
                    const totalTables = v.games.reduce((acc, g) => acc + (g.tables_running || 0), 0);
                    const totalWait = v.games.reduce((acc, g) => acc + (g.players_waiting || 0), 0);
                    const sources = v.games.map(g => g.source).filter(Boolean);
                    const primarySource = sources.includes('bravo') ? 'bravo' : (sources[0] || 'bravo');
                    mapping[v.bravo_slug] = { ...v, totalTables, totalWait, primarySource };
                });
                setLiveData(mapping);
                // Store global stats from API metadata
                if (json.metadata) {
                    setGlobalStats({
                        venues: json.metadata.venues_with_live_data || 0,
                        tables: json.metadata.total_tables_running || 0,
                        waiting: json.metadata.total_players_waiting || 0,
                        lastScrape: json.metadata.last_scrape || null,
                    });
                }
                setLastRefreshTime(new Date());
                setRefreshCountdown(LIVE_REFRESH_MS / 1000);
                // Check staleness (#3)
                if (json.metadata?.last_scrape) {
                    const age = Date.now() - new Date(json.metadata.last_scrape).getTime();
                    setIsDataStale(age > STALE_THRESHOLD_MS);
                }
                
                // Emitting DATA_MUTATED to notify the rest of the platform (like Game Trends & Heatmaps)
                busEmit.dataMutated('live_tables');
            }
        } catch (e) {
            console.error('Fetch global live data error:', e);
        }
        setLiveLoading(false);
        setIsRefreshing(false);
    }, []);

    // Countdown timer acting as visual indicator AND unified polling mechanic
    useEffect(() => {
        countdownRef.current = setInterval(() => {
            setRefreshCountdown(prev => {
                if (prev <= 1) {
                    // Fire underlying data fetch, which will synchronously reset this counter upon success
                    fetchGlobalLiveData(true);
                    return LIVE_REFRESH_MS / 1000;
                }
                return prev - 1;
            });
        }, 1000);
        return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }, [fetchGlobalLiveData]);

    useEffect(() => {
        fetchGlobalLiveData();
        
        // Subscribe to real-time WebSockets from Supabase
        const liveChannel = supabase.channel('public:venue_live_tables')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_live_tables' }, () => {
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = setTimeout(() => {
                    fetchGlobalLiveData(true);
                }, 2000);
            })
            .subscribe();

        return () => { 
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (liveChannel) supabase.removeChannel(liveChannel);
        };
    }, [fetchGlobalLiveData]);

    // ─── FILTER & MERGE (with fallback to last-known data) ───
    const mergedVenues = useMemo(() => {
        const liveEntries = Object.values(liveData);

        // Build lookups from parent venues for enrichment
        const venueByName = {};
        const venueBySlug = {};
        for (const v of venues) {
            if (v.name) venueByName[v.name.toLowerCase()] = v;
            if (v.bravo_slug) venueBySlug[v.bravo_slug] = v;
        }

        let list = [];

        if (liveEntries.length > 0) {
            // PRIMARY: Use live data when available
            list = liveEntries.map(liveEntry => {
                const parentVenue = venueBySlug[liveEntry.bravo_slug] 
                    || venueByName[(liveEntry.venue_name || '').toLowerCase()]
                    || null;
                const logoUrl = getVenueLogoUrl(parentVenue || { website: null });
                const waitEst = liveEntry.totalWait > 0 
                    ? estimateWaitTime(liveEntry.totalWait, liveEntry.totalTables) 
                    : null;
                
                return {
                    bravo_slug: liveEntry.bravo_slug,
                    name: liveEntry.venue_name,
                    venue_name: liveEntry.venue_name,
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
                    trust_score: parentVenue?.trust_score || 0,
                    address: parentVenue?.address || '',
                    phone: parentVenue?.phone || '',
                    website: parentVenue?.website || '',
                    logoUrl,
                    waitEstimate: waitEst,
                    _hasParentVenue: !!parentVenue,
                    _isLive: true,
                };
            });
        } else {
            // FALLBACK: Show last-known venue data when no live data
            list = venues
                .filter(v => v.games_offered && v.games_offered.length > 0 && v.poker_tables > 0)
                .map(v => {
                    const logoUrl = getVenueLogoUrl(v);
                    return {
                        bravo_slug: v.bravo_slug || v.slug || '',
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
                        trust_score: v.trust_score || 0,
                        address: v.address || '',
                        phone: v.phone || '',
                        website: v.website || '',
                        logoUrl,
                        waitEstimate: null,
                        _hasParentVenue: true,
                        _isLive: false,
                    };
                });
        }

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
        if (effectiveLocation && filterRadius !== 'any') {
            list = list.filter(v => {
                if (!v.latitude || !v.longitude) return true;
                return calcDist(v) <= Number(filterRadius);
            });
        }

        // 3. Filter by Game Type
        if (filterGameType !== 'all') {
            list = list.filter(v => v.games.some(g => matchesGameType(g.game, filterGameType)));
        }

        // 4. Filter by Stakes
        if (filterStakes !== 'any') {
            list = list.filter(v => venueHasStakes(v.games, filterStakes));
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
    const handleSearchInput = (value) => {
        setSearchQuery(value);
        if (value.trim().length >= 2) {
            const q = value.trim().toLowerCase();
            const matches = Object.values(liveData)
                .filter(v => (v.venue_name || '').toLowerCase().includes(q))
                .slice(0, 8)
                .map(v => ({ id: v.bravo_slug, bravo_slug: v.bravo_slug, name: v.venue_name, totalTables: v.totalTables || 0 }));
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
        setViewMode('list');
    };

    const handleClearSearch = () => {
        setSelectedVenue(null);
        setSearchQuery('');
        setShowSuggestions(false);
    };

    const handleResetFilters = () => {
        setFilterRadius('any');
        setFilterState('all');
        setFilterGameType('all');
        setFilterStakes('any');
        setSearchQuery('');
        setSelectedVenue(null);
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
            ? [...venueGames].sort((a, b) => (b.tables_running || 0) - (a.tables_running || 0)).slice(0, COLLAPSE_THRESHOLD) 
            : venueGames;
        const hiddenCount = venueGames.length - COLLAPSE_THRESHOLD;

        return (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(224,232,240,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Game Breakdown</span>
                </div>
                {displayGames.map((g, i) => {
                    const normalized = normalizeGameName(g.game);
                    const isPASource = g.source === 'pokeratlas';
                    return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, fontSize: 12, padding: '2px 0' }}>
                        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', marginRight: 8 }}>
                            <span style={{ color: '#8b949e', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                                {normalized.canonical !== 'Unknown' ? normalized.canonical : g.game}
                            </span>
                            {g.buyin && (
                                <span style={{ fontSize: 10, color: 'rgba(212,168,83,0.7)', fontWeight: 500 }}>
                                    Buy-in: {g.buyin}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                            {g.players_waiting > 0 && <span style={{ color: '#d4a853', fontSize: 11 }}>{g.players_waiting} waiting</span>}
                            {isPASource ? (
                                <span style={{ color: '#d4a853', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>
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
                            background: 'rgba(212,168,83,0.06)', border: '1.5px solid rgba(212,168,83,0.15)', 
                            borderRadius: 6, color: '#d4a853', fontSize: 11, fontWeight: 600, 
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
        if (!gameName) return {};
        const upper = gameName.toUpperCase();
        if (upper.includes('PLO') || upper.includes('OMAHA')) return { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.22)' };
        if (upper.includes('NLH') || upper.includes('NO LIMIT') || upper.includes('HOLDEM') || upper.includes("HOLD'EM")) return { bg: 'rgba(212,168,83,0.12)', color: '#d4a853', border: 'rgba(212,168,83,0.22)' };
        if (upper.includes('LIMIT') && !upper.includes('NO LIMIT')) return { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.22)' };
        if (upper.includes('MIXED') || upper.includes('HORSE') || upper.includes('8-GAME')) return { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: 'rgba(6,182,212,0.22)' };
        if (upper.includes('STUD')) return { bg: 'rgba(236,72,153,0.12)', color: '#f472b6', border: 'rgba(236,72,153,0.22)' };
        if (upper.includes('BIG O')) return { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.22)' };
        return {};
    };

    // ─── RENDER: LIVE VENUE CARD (PREMIUM UPGRADE) ───
    const renderLiveVenueCard = (v, index) => {
        const dist = calcDist(v);
        const heat = getHeatLevel(v.totalTables);
        const isFav = favorites && favorites[v.id];
        const initColor = getInitialsColor(v.id || 0);
        const venueInitials = (v.name || '?').split(/[\s-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const trustScore = v.trust_score || 0;
        const trustPct = Math.round((trustScore / 5) * 100);
        const trustColor = trustScore >= 4.5 ? '#22c55e' : trustScore >= 4.0 ? '#3b82f6' : trustScore >= 3.0 ? '#f59e0b' : '#ef4444';
        const trustLabel = trustScore >= 4.5 ? 'Excellent' : trustScore >= 4.0 ? 'Good' : trustScore >= 3.0 ? 'Moderate' : 'Low';
        // Collect unique game type chips from breakdown
        const gameTypeChips = (() => {
            if (!v.games || v.games.length === 0) return [];
            const seen = new Set();
            return v.games.map(g => {
                const norm = normalizeGameName(g.game);
                const label = norm.canonical !== 'Unknown' ? norm.canonical : g.game;
                if (seen.has(label)) return null;
                seen.add(label);
                return label;
            }).filter(Boolean).slice(0, 5);
        })();
        
        return (
            <div 
                key={v.bravo_slug} 
                style={{ 
                    position: 'relative',
                    animation: `lgf-fadeInUp 0.3s ease-out ${Math.min(index * 0.04, 0.4)}s both`,
                }}
            >
                {/* Top accent gradient line */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '14px 14px 0 0', zIndex: 2,
                    background: `linear-gradient(90deg, ${heat.color}, ${heat.color}55, transparent)`,
                }} />

                {/* Venue Card */}
                <div style={{ 
                    background: 'rgba(13,17,23,0.95)', 
                    border: `1px solid ${heat.border}`, 
                    borderRadius: 14, 
                    overflow: 'hidden', 
                    padding: '16px 18px 14px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease',
                    cursor: v._hasParentVenue && router ? 'pointer' : 'default',
                }}
                onClick={() => { if (v._hasParentVenue && router) router.push(`/hub/venues/${v.id}`); }}
                >
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
                                    <SourceBadge source={v.primarySource} />
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
                        <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.35)', boxShadow: '0 0 12px rgba(34,197,94,0.2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', animation: 'lgf-pulse 1.5s ease-in-out infinite' }} />
                            {v.totalTables} Table{v.totalTables !== 1 ? 's' : ''} Running
                        </span>
                        {v.totalWait > 0 && (
                            <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: 'rgba(212,168,83,0.12)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.3)' }}>
                                {v.totalWait} Waiting{v.waitEstimate ? ` (~${v.waitEstimate.label})` : ''}
                            </span>
                        )}
                        {!v._isLive && (
                            <span style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', textTransform: 'uppercase' }}>Last Known</span>
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

                    {/* Game Breakdown — COLLAPSIBLE */}
                    {renderTableBreakdown(v.bravo_slug, v.games)}

                    {/* === ACTION BAR === */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {user && (
                                <button onClick={(e) => { e.stopPropagation(); setReportVenue({ id: v.id, name: v.name, city: v.city, state: v.state }); setReportModalOpen(true); }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(212,168,83,0.12)', color: '#d4a853', border: '1px solid rgba(212,168,83,0.25)', fontFamily: 'inherit', transition: 'all 0.2s' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    Report
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {v._hasParentVenue && router && (
                                <button onClick={(e) => { e.stopPropagation(); router.push(`/hub/venues/${v.id}`); }}
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
    const availableStates = useMemo(() => {
        const states = new Set();
        Object.values(liveData).forEach(v => {
            // Try to find parent venue state
            const parent = venues.find(pv => pv.bravo_slug === v.bravo_slug || (pv.name && pv.name.toLowerCase() === (v.venue_name || '').toLowerCase()));
            if (parent?.state) states.add(parent.state);
        });
        return Array.from(states).sort();
    }, [liveData, venues]);

    return (
        <div style={{ padding: '0 0 40px' }}>
            {/* ─── HEADER ─── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 16px' }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e0e8f0', margin: '0 0 4px' }}>Live Games</h2>
                    <p style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', margin: 0 }}>
                        Powered By Smarter.Poker Intelligence
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Mobile filter toggle */}
                    <button onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="lgf-filter-toggle"
                        style={{
                            display: 'none', /* shown via CSS media query */
                            alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10,
                            background: sidebarOpen ? 'rgba(212,168,83,0.15)' : 'rgba(255,255,255,0.05)',
                            border: sidebarOpen ? '1px solid rgba(212,168,83,0.4)' : '1px solid rgba(255,255,255,0.1)',
                            color: sidebarOpen ? '#d4a853' : '#8b949e', fontSize: 12, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>
                        Filters
                    </button>
                    <button 
                        onClick={handleResetFilters}
                        style={{ 
                            background: 'linear-gradient(180deg, #3fb950 0%, #2ea043 100%)', 
                            color: '#fff', border: '1px solid rgba(255,255,255,0.1)', 
                            borderRadius: 10, padding: '8px 14px', fontSize: 12, 
                            fontWeight: 700, cursor: 'pointer', display: 'flex', 
                            alignItems: 'center', gap: 5, boxShadow: '0 4px 12px rgba(46,160,67,0.4)',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)', fontFamily: 'inherit',
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        RESET
                    </button>
                </div>
            </div>

            {/* ─── GPS LOCATION BANNER ─── */}
            {effectiveLocation && (locationCity || locationState) && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', marginBottom: 10,
                    background: 'linear-gradient(90deg, rgba(63,185,80,0.06), rgba(63,185,80,0.02), rgba(63,185,80,0.06))',
                    borderBottom: '1px solid rgba(63,185,80,0.1)', fontSize: 12, color: 'rgba(200,214,229,0.6)', fontWeight: 600,
                }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ color: '#3fb950' }}>Location Active</span>
                    <span style={{ color: 'rgba(200,214,229,0.35)' }}>{locationCity}{locationState ? `, ${locationState}` : ''}</span>
                </div>
            )}

            {/* ─── STALE DATA BANNER ─── */}
            {isDataStale && !selectedVenue && (
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
            <div className="lgf-layout" style={{ display: 'flex', gap: 16, padding: '0 16px' }}>

            {/* ─── GLOBAL STATS DASHBOARD ─── */}
            {!selectedVenue && globalStats.venues > 0 && (
                <div style={{ 
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, 
                    marginBottom: 14, padding: 12, borderRadius: 12,
                    background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.6)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{globalStats.venues}</div>
                        <div style={{ fontSize: 9, color: 'rgba(200,214,229,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Venues Live</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#3fb950' }}>{globalStats.tables.toLocaleString()}</div>
                        <div style={{ fontSize: 9, color: 'rgba(200,214,229,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Tables Running</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#d4a853' }}>{globalStats.waiting.toLocaleString()}</div>
                        <div style={{ fontSize: 9, color: 'rgba(200,214,229,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Players Waiting</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#d4a853' }}>
                            {refreshCountdown > 0 ? `${Math.floor(refreshCountdown / 60)}:${String(refreshCountdown % 60).padStart(2, '0')}` : '...'}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(200,214,229,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Next Refresh</div>
                    </div>
                </div>
            )}

            {/* ─── CONTROLS PANEL ─── */}
            <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 14, padding: 14, marginBottom: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                
                {/* Search Bar */}
                <div style={{ position: 'relative', marginBottom: 12, zIndex: 10 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)',
                        borderRadius: 10, padding: '9px 12px'
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            onFocus={() => { if (searchSuggestions.length > 0) setShowSuggestions(true); }}
                            placeholder="Find a specific casino..."
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit' }}
                        />
                        {selectedVenue && (
                            <button onClick={handleClearSearch} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#e0e8f0', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                                Clear
                            </button>
                        )}
                    </div>
                    {/* Autocomplete */}
                    {showSuggestions && searchSuggestions.length > 0 && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                            background: 'rgba(22,27,34,0.98)', border: '1px solid rgba(212,168,83,0.4)', borderRadius: 10,
                            overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)'
                        }}>
                            {searchSuggestions.map((v, i) => (
                                <div key={v.bravo_slug || v.id} onClick={() => handleSelectSuggestion(v)} style={{
                                    padding: '10px 14px', borderBottom: i < searchSuggestions.length - 1 ? '1px solid rgba(48,54,61,0.5)' : 'none',
                                    cursor: 'pointer', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between',
                                    transition: 'background 0.15s',
                                }}>
                                    <span>{v.name}</span>
                                    <span style={{ fontSize: 11, color: '#d4a853' }}>{v.totalTables || 0} tables</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Filters (only show when no single venue is selected) */}
                {!selectedVenue && (
                    <>
                        {/* Game Type Filter Chips */}
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                            {GAME_TYPE_FILTERS.map(f => (
                                <button key={f.key} onClick={() => setFilterGameType(f.key)} style={{
                                    padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                                    border: filterGameType === f.key ? '1px solid #3fb950' : '1px solid rgba(48,54,61,0.6)',
                                    background: filterGameType === f.key ? 'rgba(63,185,80,0.15)' : 'rgba(22,27,34,0.6)',
                                    color: filterGameType === f.key ? '#3fb950' : '#8b949e',
                                    transition: 'all 0.15s',
                                }}>{f.label}</button>
                            ))}
                        </div>

                        {/* Row: View Mode | State | Distance | Stakes | Sort */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* Map/List Toggle */}
                            <div style={{ display: 'flex', background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, overflow: 'hidden' }}>
                                <button onClick={() => setViewMode('list')} style={{
                                    padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                                    background: viewMode === 'list' ? 'rgba(212,168,83,0.15)' : 'transparent', color: viewMode === 'list' ? '#d4a853' : '#8b949e'
                                }}>List</button>
                                <button onClick={() => setViewMode('map')} style={{
                                    padding: '5px 10px', border: 'none', borderLeft: '1px solid rgba(48,54,61,0.6)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                                    background: viewMode === 'map' ? 'rgba(212,168,83,0.15)' : 'transparent', color: viewMode === 'map' ? '#d4a853' : '#8b949e'
                                }}>Map</button>
                            </div>

                            {/* State — dynamic, only shows states with active venues */}
                            <select value={filterState} onChange={(e) => setFilterState(e.target.value)} style={{
                                background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '5px 8px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer'
                            }}>
                                <option value="all">All States</option>
                                {availableStates.map(st => (
                                    <option key={st} value={st}>{st}</option>
                                ))}
                            </select>

                            {/* Distance */}
                            <select value={filterRadius} onChange={(e) => setFilterRadius(e.target.value)} style={{
                                background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '5px 8px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer'
                            }}>
                                <option value="any">Any Distance</option>
                                <option value="10">10 mi</option><option value="25">25 mi</option><option value="50">50 mi</option><option value="100">100 mi</option><option value="250">250 mi</option>
                            </select>

                            {/* Stakes */}
                            <select value={filterStakes} onChange={(e) => setFilterStakes(e.target.value)} style={{
                                background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '5px 8px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer'
                            }}>
                                {STAKES_FILTERS.map(s => (
                                    <option key={s.key} value={s.key}>{s.label}</option>
                                ))}
                            </select>

                            {/* Sort */}
                            {viewMode === 'list' && (
                                <select value={filterSort} onChange={(e) => setFilterSort(e.target.value)} style={{
                                    background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '5px 8px', color: '#c9d1d9', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 'auto'
                                }}>
                                    <option value="tables">Most Active</option>
                                    {effectiveLocation && <option value="distance">Nearest</option>}
                                    <option value="trust">Trust Score</option>
                                </select>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ─── CONTENT AREA ─── */}
            {liveLoading && Object.keys(liveData).length === 0 ? (
                renderSkeletons(4)
            ) : (
                <>
                    {/* ─── STALE DATA WARNING BANNER (#3) ─── */}
                    {isDataStale && !selectedVenue && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', marginBottom: 10, borderRadius: 10,
                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                            animation: 'lgf-fadeInUp 0.3s ease-out',
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Data May Be Stale</div>
                                <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.7)' }}>
                                    Last scraper update was {globalStats.lastScrape ? timeAgo(globalStats.lastScrape) : 'unknown'}. Live game counts may not be current.
                                </div>
                            </div>
                            <button
                                onClick={() => fetchGlobalLiveData(true)}
                                style={{
                                    marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, fontSize: 11,
                                    fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                                    background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                                    color: '#f59e0b', whiteSpace: 'nowrap',
                                }}
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Header stat bar */}
                    {!selectedVenue && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '7px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.5)' }}>
                            <span style={{ fontSize: 12, color: '#c9d1d9', fontWeight: 600 }}>
                                <span style={{ color: '#ef4444', fontWeight: 800 }}>{mergedVenues.length}</span> live venues
                                {filterGameType !== 'all' && <span style={{ color: '#3fb950' }}> · {filterGameType.toUpperCase()}</span>}
                                {filterStakes !== 'any' && <span style={{ color: '#d4a853' }}> · {filterStakes}/+</span>}
                            </span>
                            <button 
                                onClick={() => fetchGlobalLiveData(true)} 
                                disabled={isRefreshing}
                                style={{ 
                                    background: 'rgba(212,168,83,0.08)', border: '1.5px solid rgba(212,168,83,0.2)', 
                                    borderRadius: 6, padding: '4px 10px', color: '#d4a853', fontSize: 11, 
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
                    )}

                    {mergedVenues.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, background: 'rgba(13,17,23,0.6)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(212,168,83,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,83,0.4)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                            </div>
                            <p style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0', margin: '0 0 4px' }}>No Active Games Found</p>
                            <p style={{ fontSize: 13, color: 'rgba(200,214,229,0.5)', marginBottom: 16 }}>Try expanding your filters or clearing the game type.</p>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button onClick={handleResetFilters} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.3)', color: '#d4a853', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
                                    Reset All Filters
                                </button>
                                {user && (
                                    <button onClick={() => { setReportVenue(null); setReportModalOpen(true); }} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                        Report a Game
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        viewMode === 'map' && !selectedVenue ? (
                            <VenueMapPanel 
                                venues={mergedVenues.filter(v => v.latitude && v.longitude)} 
                                userLocation={effectiveLocation} 
                                onVenueSelect={(v) => { if(setSelectedVenueForReview) setSelectedVenueForReview(null); if (router) router.push(`/hub/venues/${v.id}`); }} 
                            />
                        ) : (
                            <div style={{ display: 'grid', gap: 14, paddingBottom: 24 }}>
                                {mergedVenues.slice(0, 50).map((v, i) => renderLiveVenueCard(v, i))}
                            </div>
                        )
                    )}
                </>
            )}

            {/* ─── REPORT GAME MODAL ─── */}
            <ReportGameModal
                venue={reportVenue}
                isOpen={reportModalOpen}
                onClose={() => { setReportModalOpen(false); setReportVenue(null); }}
                onSubmit={(game) => {
                    setReportSuccess(reportVenue?.name || 'Venue');
                    setTimeout(() => setReportSuccess(null), 4000);
                    // Force a live data refresh to show the community report
                    fetchGlobalLiveData(true);
                }}
                user={user}
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
                    Game reported at {reportSuccess}
                </div>
            )}

            {/* ─── FLOATING REPORT BUTTON (authenticated users only) ─── */}
            {user && !reportModalOpen && (
                <button
                    onClick={() => { setReportVenue(null); setReportModalOpen(true); }}
                    style={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
                        width: 52, height: 52, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #d4a853, #b8860b)',
                        border: '2px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 6px 24px rgba(212,168,83,0.5)',
                        color: '#000', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    title="Report a live game"
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
            `}</style>
        </div>
    );
}
