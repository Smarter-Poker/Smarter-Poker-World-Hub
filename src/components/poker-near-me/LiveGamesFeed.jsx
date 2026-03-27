import React, { useState, useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import VenueCard from './VenueCard';

// Dynamically import map to avoid SSR issues
const VenueMapPanel = dynamic(() => import('./VenueMapPanel'), { ssr: false });

const LIVE_REFRESH_MS = 2 * 60 * 1000; // 2 minutes

const renderSkeletons = (count = 4) => (
    <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
        {Array.from({ length: count }).map((_, i) => (
            <div key={`skel-${i}`} style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '12px', padding: '16px', display: 'flex', gap: '16px'
            }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.05)', animation: 'pulse 1.5s infinite' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ width: '60%', height: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 8, animation: 'pulse 1.5s infinite' }} />
                    <div style={{ width: '40%', height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                </div>
            </div>
        ))}
        <style>{`
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
        `}</style>
    </div>
);

export default function LiveGamesFeed({ 
    venues = [], 
    userLocation, 
    favorites = {}, 
    handleToggleFavorite, 
    checkinCounts = {}, 
    router, 
    setSelectedVenueForReview 
}) {
    // ─── STATE ───
    const [liveData, setLiveData] = useState({}); // Mapping: bravo_slug -> live data
    const [liveLoading, setLiveLoading] = useState(true);
    
    // Filters
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
    const [filterState, setFilterState] = useState('all');
    const [filterRadius, setFilterRadius] = useState('50');
    const [filterSort, setFilterSort] = useState('tables'); // 'tables', 'distance', 'trust'
    
    // Single Venue drill-down (from autocomplete or clicking a card)
    const [searchQuery, setSearchQuery] = useState('');
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedVenue, setSelectedVenue] = useState(null);
    
    const refreshRef = useRef(null);
    const debounceTimerRef = useRef(null);

    // ─── FETCH LIVE DATA ───
    const fetchGlobalLiveData = async (isRealtimeEvent = false) => {
        setLiveLoading(true);
        try {
            // Fetch without venue parameter. Append timestamp if triggered by realtime WebSocket to bust Edge Cache.
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
                    mapping[v.bravo_slug] = {
                        ...v,
                        totalTables,
                        totalWait
                    };
                });
                setLiveData(mapping);
            }
        } catch (e) {
            console.error('Fetch global live data error:', e);
        }
        setLiveLoading(false);
    };

    useEffect(() => {
        fetchGlobalLiveData();
        
        // Subscribe to real-time WebSockets from Supabase
        const liveChannel = supabase.channel('public:venue_live_tables')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_live_tables' }, () => {
                // Debounce the rapid database row mutations (e.g. 500 changes) into a single API fetch
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = setTimeout(() => {
                    console.log('Live Games WebSocket: Atomic re-hydrate triggered from daemon sync.');
                    fetchGlobalLiveData(true);
                }, 2000);
            })
            .subscribe();

        // Fallback polling mechanic
        refreshRef.current = setInterval(() => fetchGlobalLiveData(true), LIVE_REFRESH_MS);
        
        return () => { 
            if (refreshRef.current) clearInterval(refreshRef.current); 
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (liveChannel) supabase.removeChannel(liveChannel);
        };
    }, []);

    // ─── FILTER & MERGE ───
    
    // Calculate distance
    const calcDist = (v) => {
        if (!userLocation || !v.latitude || !v.longitude) return 99999;
        const R = 3959;
        const dLat = (v.latitude - userLocation.lat) * Math.PI / 180;
        const dLon = (v.longitude - userLocation.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLocation.lat*Math.PI/180)*Math.cos(v.latitude*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const mergedVenues = useMemo(() => {
        // Base is venues that actually possess live data right now
        let list = venues.filter(v => v.bravo_slug && liveData[v.bravo_slug]);
        
        // Single venue override
        if (selectedVenue) {
            return list.filter(v => v.id === selectedVenue.id);
        }
        
        // 1. Filter by State
        if (filterState !== 'all') {
            list = list.filter(v => v.state === filterState);
        }
        
        // 2. Filter by Distance
        if (userLocation && filterRadius !== 'any') {
            list = list.filter(v => calcDist(v) <= Number(filterRadius));
        }
        
        // 3. Sort
        list.sort((a, b) => {
            if (filterSort === 'tables') {
                const tablesA = liveData[a.bravo_slug]?.totalTables || 0;
                const tablesB = liveData[b.bravo_slug]?.totalTables || 0;
                if (tablesB !== tablesA) return tablesB - tablesA; // primary descending
                // Tie breaker: waitlist descending
                const waitA = liveData[a.bravo_slug]?.totalWait || 0;
                const waitB = liveData[b.bravo_slug]?.totalWait || 0;
                return waitB - waitA;
            }
            if (filterSort === 'distance') {
                return calcDist(a) - calcDist(b);
            }
            if (filterSort === 'trust') {
                return (b.trust_score || 0) - (a.trust_score || 0);
            }
            return 0;
        });
        
        return list;
    }, [venues, liveData, filterState, filterRadius, filterSort, userLocation, selectedVenue]);

    // ─── SEARCH LOGIC ───
    const handleSearchInput = (value) => {
        setSearchQuery(value);
        if (value.trim().length >= 2) {
            const q = value.trim().toLowerCase();
            const matches = venues
                .filter(v => v.bravo_slug && liveData[v.bravo_slug])
                .filter(v => (v.name || '').toLowerCase().includes(q))
                .slice(0, 8);
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
        setViewMode('list'); // Force list to see drilldown
    };

    const handleClearSearch = () => {
        setSelectedVenue(null);
        setSearchQuery('');
        setShowSuggestions(false);
    };

    // ─── RENDER HELPERS ───
    const renderTableBreakdown = (venueSlug) => {
        const data = liveData[venueSlug];
        if (!data || !data.games || data.games.length === 0) return null;
        
        return (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0' }}>Live Tables Breakdown</span>
                    <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.9)', background: 'rgba(239,68,68,0.15)', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>BRAVO</span>
                </div>
                {data.games.map((g, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
                        <span style={{ color: '#8b949e', fontWeight: 600 }}>{g.game}</span>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {g.players_waiting > 0 && <span style={{ color: '#d4a853' }}>{g.players_waiting} waiting</span>}
                            <span style={{ color: '#3fb950', fontWeight: 700, minWidth: 60, textAlign: 'right' }}>{g.tables_running} tab{g.tables_running !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ padding: '0 16px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e0e8f0', margin: '0 0 4px' }}>Live Games</h2>
                    <p style={{ fontSize: 13, color: 'rgba(200,214,229,0.5)', margin: 0 }}>
                        Powered by Bravo Poker Live. Find active games instantly.
                    </p>
                </div>
                <button 
                    onClick={() => {
                        setFilterRadius('50');
                        setFilterState('all');
                        setSearchQuery('');
                        setSelectedVenue(null);
                    }}
                    style={{ 
                        background: 'linear-gradient(180deg, #3fb950 0%, #2ea043 100%)', 
                        color: '#fff', border: '1px solid rgba(255,255,255,0.1)', 
                        borderRadius: 10, padding: '8px 14px', fontSize: 13, 
                        fontWeight: 700, cursor: 'pointer', display: 'flex', 
                        alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(46,160,67,0.4)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    NEAR ME
                </button>
            </div>

            {/* ─── CONTROLS PANEL ─── */}
            <div style={{ background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                
                {/* Search Bar */}
                <div style={{ position: 'relative', marginBottom: 16, zIndex: 10 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)',
                        borderRadius: 12, padding: '10px 14px'
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.5)" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            onFocus={() => { if (searchSuggestions.length > 0) setShowSuggestions(true); }}
                            placeholder="Find a specific casino..."
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e0e8f0', fontSize: 14, fontFamily: 'inherit' }}
                        />
                        {selectedVenue && (
                            <button onClick={handleClearSearch} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#e0e8f0', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                Clear
                            </button>
                        )}
                    </div>
                    {/* Autocomplete */}
                    {showSuggestions && searchSuggestions.length > 0 && (
                        <div style={{
                            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                            background: 'rgba(22,27,34,0.95)', border: '1px solid rgba(212,168,83,0.4)', borderRadius: 12,
                            overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)'
                        }}>
                            {searchSuggestions.map((v, i) => (
                                <div key={v.id} onClick={() => handleSelectSuggestion(v)} style={{
                                    padding: '12px 14px', borderBottom: i < searchSuggestions.length - 1 ? '1px solid rgba(48,54,61,0.5)' : 'none',
                                    cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 600, display: 'flex', justifyContent: 'space-between'
                                }}>
                                    <span>{v.name}</span>
                                    <span style={{ fontSize: 12, color: '#d4a853' }}>{liveData[v.bravo_slug]?.totalTables || 0} tables</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Filters (only show if no specific venue is selected to avoid confusion) */}
                {!selectedVenue && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Map/List Toggle */}
                        <div style={{ display: 'flex', background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, overflow: 'hidden' }}>
                            <button onClick={() => setViewMode('list')} style={{
                                padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                background: viewMode === 'list' ? 'rgba(88,166,255,0.15)' : 'transparent', color: viewMode === 'list' ? '#58a6ff' : '#8b949e'
                            }}>List</button>
                            <button onClick={() => setViewMode('map')} style={{
                                padding: '6px 12px', border: 'none', borderLeft: '1px solid rgba(48,54,61,0.6)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                background: viewMode === 'map' ? 'rgba(88,166,255,0.15)' : 'transparent', color: viewMode === 'map' ? '#58a6ff' : '#8b949e'
                            }}>Map</button>
                        </div>

                        {/* State */}
                        <select value={filterState} onChange={(e) => setFilterState(e.target.value)} style={{
                            background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer'
                        }}>
                            <option value="all">All States</option>
                            {['AL','AK','AZ','CA','CO','CT','FL','IL','IN','IA','LA','MD','MA','MI','MS','MO','NV','NH','NJ','NM','NY','NC','OH','OK','OR','PA','RD','SD','TX','WA','WV'].map(st => (
                                <option key={st} value={st}>{st}</option>
                            ))}
                        </select>

                        {/* Distance */}
                        <select value={filterRadius} onChange={(e) => setFilterRadius(e.target.value)} style={{
                            background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer'
                        }}>
                            <option value="any">Any Dist</option>
                            <option value="10">10 mi</option><option value="50">50 mi</option><option value="100">100 mi</option><option value="250">250 mi</option>
                        </select>

                        {/* Sort */}
                        {viewMode === 'list' && (
                            <select value={filterSort} onChange={(e) => setFilterSort(e.target.value)} style={{
                                background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '6px 10px', color: '#c9d1d9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', marginLeft: 'auto'
                            }}>
                                <option value="tables">Most Active Games</option>
                                {userLocation && <option value="distance">Nearest</option>}
                                <option value="trust">Trust Score</option>
                            </select>
                        )}
                    </div>
                )}
            </div>

            {/* ─── CONTENT AREA ─── */}
            {liveLoading && Object.keys(liveData).length === 0 ? (
                renderSkeletons(4)
            ) : (
                <>
                    {/* Header stat */}
                    {!selectedVenue && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'rgba(22,27,34,0.8)', borderRadius: 10, border: '1px solid rgba(48,54,61,0.6)' }}>
                            <span style={{ fontSize: 13, color: '#e0e8f0', fontWeight: 600 }}>
                                <span style={{ color: '#ef4444' }}>{mergedVenues.length}</span> live venues matching filters
                            </span>
                            <button onClick={fetchGlobalLiveData} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
                        </div>
                    )}

                    {mergedVenues.length === 0 ? (
                         <div style={{ textAlign: 'center', padding: 40, background: 'rgba(13,17,23,0.6)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <div style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </div>
                            <p style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0', margin: '0 0 4px' }}>No Active Games Found</p>
                            <p style={{ fontSize: 13, color: 'rgba(200,214,229,0.5)' }}>Try expanding your distance or state filters.</p>
                         </div>
                    ) : (
                        viewMode === 'map' && !selectedVenue ? (
                            <VenueMapPanel 
                                venues={mergedVenues} 
                                userLocation={userLocation} 
                                onVenueSelect={(v) => { if(setSelectedVenueForReview) setSelectedVenueForReview(null); router.push(`/hub/venues/${v.id}`); }} 
                            />
                        ) : (
                            <div style={{ display: 'grid', gap: 16, paddingBottom: 24 }}>
                                {mergedVenues.slice(0, 50).map(v => {
                                    const dist = calcDist(v);
                                    const tables = liveData[v.bravo_slug]?.totalTables || 0;
                                    const wait = liveData[v.bravo_slug]?.totalWait || 0;

                                    return (
                                        <div key={v.id} style={{ position: 'relative' }}>
                                            {/* Distance Badge */}
                                            {userLocation && dist < 99999 && (
                                                <div style={{ position: 'absolute', top: -8, left: 16, zIndex: 10, padding: '2px 8px', borderRadius: 8, background: '#1f2937', border: '1px solid #3fb950', fontSize: 10, fontWeight: 800, color: '#3fb950', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                                    {dist < 1 ? `${(dist * 5280).toFixed(0)} ft` : `${dist.toFixed(1)} mi`} away
                                                </div>
                                            )}
                                            
                                            {/* Live Games Summary Badge */}
                                            <div style={{ position: 'absolute', top: -8, right: 16, zIndex: 10, padding: '2px 8px', borderRadius: 8, background: '#1f2937', border: '1px solid #ef4444', fontSize: 10, fontWeight: 800, color: '#ef4444', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', display: 'flex', gap: 6 }}>
                                                <span>{tables} RUNNING</span>
                                                {wait > 0 && <span style={{ color: '#d4a853' }}>| {wait} WAIT</span>}
                                            </div>

                                            <div style={{ background: '#0d1117', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 16, overflow: 'hidden', padding: 2 }}>
                                                <VenueCard 
                                                    venue={v} 
                                                    isFavorited={!!favorites[v.id]}
                                                    onFavorite={(e) => { e?.stopPropagation(); if(handleToggleFavorite) handleToggleFavorite(v.id, v); }}
                                                    onNavigate={(url) => { if (url.includes('action=review')) { if(setSelectedVenueForReview) setSelectedVenueForReview({ id: v.id, name: v.name }); } else { if(router) router.push(url); } }}
                                                    userLocation={userLocation} 
                                                    checkinCount={checkinCounts[String(v.id)] || 0} 
                                                />
                                                {/* Injected Live Games Breakdown inside VenueCard parent wrapper */}
                                                <div style={{ padding: '0 12px 12px' }}>
                                                    {renderTableBreakdown(v.bravo_slug)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}
                </>
            )}
        </div>
    );
}
