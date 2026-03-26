import React, { useState, useEffect, useRef, useMemo } from 'react';
import VenueCard from './VenueCard';

const LIVE_REFRESH_MS = 2 * 60 * 1000; // 2 minutes auto-refresh

// Skeletons for loading state
const renderSkeletons = (count = 4) => (
    <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
        {Array.from({ length: count }).map((_, i) => (
            <div key={`skel-${i}`} style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex', gap: '16px'
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
    userLocation, 
    allVenues = [], 
    favorites = {}, 
    checkinCounts = {}, 
    onToggleFavorite, 
    onNavigate,
    renderMap
}) {
    const [liveData, setLiveData] = useState([]);
    const [liveLoading, setLiveLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [stateFilter, setStateFilter] = useState('all');

    const liveRefreshRef = useRef(null);

    // Fetch live games for ALL venues
    const fetchAllLiveGames = async () => {
        setLiveLoading(true);
        try {
            const res = await fetch('/api/poker/live-tables');
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            
            let aggregatedVenues = [];
            if (json.venues && Array.isArray(json.venues)) {
                aggregatedVenues = json.venues.map(v => {
                    const totalTables = v.games.reduce((sum, g) => sum + (g.tables_running || 0), 0);
                    const totalWaiting = v.games.reduce((sum, g) => sum + (g.players_waiting || 0), 0);
                    return {
                        bravo_slug: v.bravo_slug,
                        last_updated: v.last_updated,
                        tables_running: totalTables,
                        players_waiting: totalWaiting,
                        games: v.games
                    };
                });
            }
            setLiveData(aggregatedVenues);
        } catch (e) {
            console.error('Fetch all live games error:', e);
            setLiveData([]);
        }
        setLiveLoading(false);
    };

    useEffect(() => {
        fetchAllLiveGames();
        liveRefreshRef.current = setInterval(fetchAllLiveGames, LIVE_REFRESH_MS);
        return () => { if (liveRefreshRef.current) clearInterval(liveRefreshRef.current); };
    }, []);

    // Intersect live data with the full venues array
    const liveVenues = useMemo(() => {
        if (!liveData.length || !allVenues.length) return [];
        
        const liveMap = new Map();
        liveData.forEach(ld => liveMap.set(ld.bravo_slug, ld));

        const matched = [];
        for (const v of allVenues) {
            if (v.bravo_slug && liveMap.has(v.bravo_slug)) {
                const ld = liveMap.get(v.bravo_slug);
                if (ld.tables_running > 0) {
                    matched.push({
                        ...v,
                        live_data: ld
                    });
                }
            }
        }
        return matched;
    }, [allVenues, liveData]);

    // Apply filters and sort
    const filteredVenues = useMemo(() => {
        let results = liveVenues;
        
        if (stateFilter !== 'all') {
            results = results.filter(v => v.state === stateFilter);
        }
        
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            results = results.filter(v => 
                (v.name && v.name.toLowerCase().includes(lower)) ||
                (v.city && v.city.toLowerCase().includes(lower))
            );
        }

        // Default sort: distance if Location available, else tables running
        if (userLocation) {
            const dist = (v) => {
                if (!v.latitude || !v.longitude) return 99999;
                const R = 3959;
                const dLat = (v.latitude - userLocation.lat) * Math.PI / 180;
                const dLon = (v.longitude - userLocation.lng) * Math.PI / 180;
                const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(userLocation.lat*Math.PI/180)*Math.cos(v.latitude*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
                return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            };
            results = [...results].sort((a, b) => dist(a) - dist(b));
        } else {
            results = [...results].sort((a, b) => (b.live_data?.tables_running || 0) - (a.live_data?.tables_running || 0));
        }

        return results;
    }, [liveVenues, stateFilter, searchQuery, userLocation]);

    const totalActiveTables = filteredVenues.reduce((sum, v) => sum + (v.live_data?.tables_running || 0), 0);

    return (
        <div style={{ padding: '0 16px 40px' }}>
            {/* Header and View Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: '#e0e8f0', margin: '0 0 4px', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        Live Cash Games
                        <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.5px' }}>LIVE</span>
                    </h2>
                    <p style={{ fontSize: 13, color: 'rgba(200,214,229,0.5)', margin: 0 }}>
                        <span style={{ color: '#d4a853', fontWeight: 700 }}>{totalActiveTables}</span> tables running across <span style={{ color: '#fff', fontWeight: 700 }}>{filteredVenues.length}</span> venues.
                    </p>
                </div>

                {/* View Toggle */}
                <div style={{ display: 'flex', background: 'rgba(22,27,34,0.6)', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, overflow: 'hidden' }}>
                    <button 
                        onClick={() => setViewMode('list')}
                        style={{ padding: '6px 12px', background: viewMode === 'list' ? 'rgba(88,166,255,0.15)' : 'transparent', border: 'none', color: viewMode === 'list' ? '#58a6ff' : '#8b949e', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        List
                    </button>
                    <button 
                        onClick={() => setViewMode('map')}
                        style={{ padding: '6px 12px', background: viewMode === 'map' ? 'rgba(88,166,255,0.15)' : 'transparent', border: 'none', color: viewMode === 'map' ? '#58a6ff' : '#8b949e', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                        Map
                    </button>
                </div>
            </div>

            {/* Filters Row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.4)" strokeWidth="2" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input 
                        type="text" 
                        placeholder="Search venues or cities..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid rgba(48,54,61,0.6)', background: 'rgba(13,17,23,0.8)', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} 
                    />
                </div>
                <select 
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '8px 12px', color: '#e0e8f0', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', outline: 'none', minWidth: 100 }}
                >
                    <option value="all">All States</option>
                    {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(st => (
                        <option key={st} value={st}>{st}</option>
                    ))}
                </select>
                <button onClick={fetchAllLiveGames} disabled={liveLoading} style={{ background: 'transparent', border: '1px solid rgba(48,54,61,0.6)', borderRadius: 8, padding: '8px', color: '#8b949e', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Refresh Live Data">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: liveLoading ? 'spin 1s linear infinite' : 'none' }}>
                        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M9 12l2 2 4-4"/>
                    </svg>
                </button>
            </div>

            {/* Content Area */}
            {liveLoading && liveVenues.length === 0 ? (
                renderSkeletons(5)
            ) : filteredVenues.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(13,17,23,0.6)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.1)', marginTop: 24 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#e0e8f0', margin: '0 0 8px' }}>No Live Games Found</p>
                    <p style={{ fontSize: 14, color: 'rgba(200,214,229,0.5)', margin: '0 auto 16px', maxWidth: 300, lineHeight: 1.5 }}>
                        {searchQuery || stateFilter !== 'all' 
                            ? 'No venues match your current filters.' 
                            : 'There are no live games reported via Bravo Poker at this time.'}
                    </p>
                </div>
            ) : viewMode === 'list' ? (
                <div style={{ display: 'grid', gap: 12 }}>
                    {filteredVenues.map(v => (
                        <div key={v.id} style={{ position: 'relative' }}>
                            <VenueCard
                                venue={v}
                                isFavorited={!!favorites[v.id]}
                                onFavorite={(e) => { e?.stopPropagation(); onToggleFavorite && onToggleFavorite(v.id, v); }}
                                onNavigate={(url) => onNavigate && onNavigate(url, v)}
                                userLocation={userLocation}
                                checkinCount={checkinCounts[String(v.id)] || 0}
                            />
                            {/* In-Card Games Table Summary (Hover/Click expansion not full UI, just summary) */}
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 16px', display: 'flex', gap: 16, overflowX: 'auto', borderRadius: '0 0 12px 12px', marginTop: -10, position: 'relative', zIndex: 1 }}>
                                {v.live_data.games.slice(0, 3).map((g, i) => (
                                    <div key={i} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: 3, background: '#ef4444' }} />
                                        <span style={{ color: '#c9d1d9', fontSize: 11, fontWeight: 600 }}>{g.tables_running}x {g.game}</span>
                                    </div>
                                ))}
                                {v.live_data.games.length > 3 && (
                                    <div style={{ color: '#8b949e', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                                        +{v.live_data.games.length - 3} more
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                renderMap ? renderMap(filteredVenues) : null
            )}
        </div>
    );
}
