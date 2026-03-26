import React, { useState, useEffect, useRef } from 'react';
import VenueCard from './VenueCard'; // If needed, though we can just render the games list inline

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

export default function LiveGamesFeed({ userLocation }) {
    const [liveGames, setLiveGames] = useState([]);
    const [liveLoading, setLiveLoading] = useState(false);
    
    // Search & Autocomplete state
    const [liveSearchQuery, setLiveSearchQuery] = useState('');
    const [liveVenueList, setLiveVenueList] = useState([]);
    const [liveVenueSuggestions, setLiveVenueSuggestions] = useState([]);
    const [selectedLiveVenue, setSelectedLiveVenue] = useState(null);
    const [showLiveSuggestions, setShowLiveSuggestions] = useState(false);
    
    const liveSearchInputRef = useRef(null);
    const liveRefreshRef = useRef(null);

    // Fetch the full Bravo venue list for search suggestions
    const fetchLiveVenueList = async () => {
        try {
            const res = await fetch('/api/poker/live-tables?list=true');
            if (!res.ok) return;
            const json = await res.json();
            setLiveVenueList(json.venues || []);
        } catch (e) {
            console.error('Fetch venue list error:', e);
        }
    };

    // Fetch live games for a specific venue
    const fetchLiveGames = async (venueSlug) => {
        if (!venueSlug) return;
        setLiveLoading(true);
        try {
            const res = await fetch('/api/poker/live-tables?venue=' + encodeURIComponent(venueSlug));
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const json = await res.json();
            let games = [];
            if (json.venues && Array.isArray(json.venues)) {
                json.venues.forEach(v => {
                    (v.games || []).forEach(g => {
                        const name = g.game || '';
                        let gameType = 'NLH';
                        if (/PLO|omaha/i.test(name)) gameType = /big\s?o/i.test(name) ? 'Big O' : 'PLO';
                        else if (/limit\s+holdem/i.test(name) && !/no\s+limit/i.test(name)) gameType = 'Limit';
                        else if (/stud/i.test(name)) gameType = 'Stud';
                        else if (/mixed|mix/i.test(name)) gameType = 'Mixed';
                        else if (/dealer/i.test(name)) gameType = 'DC';
                        else if (/tourney|tournament/i.test(name)) gameType = 'Tournament';
                        
                        const stakesMatch = name.match(/(\d+)-(\d+)/);
                        const stakes = stakesMatch ? `$${stakesMatch[1]}/$${stakesMatch[2]}` : '';
                        
                        games.push({
                            venue_id: v.bravo_slug,
                            venue_name: v.venue_name,
                            game_type: gameType,
                            stakes: stakes,
                            table_count: g.tables_running || 0,
                            wait_time: g.players_waiting > 0 ? g.players_waiting : null,
                            game_name_raw: name,
                            created_at: v.last_updated,
                        });
                    });
                });
            }
            setLiveGames(games);
        } catch (e) {
            console.error('Fetch live games error:', e);
            setLiveGames([]);
        }
        setLiveLoading(false);
    };

    // Pre-fetch venue list on mount, set up auto-refresh
    useEffect(() => {
        if (liveVenueList.length === 0) fetchLiveVenueList();
        
        if (selectedLiveVenue) {
            fetchLiveGames(selectedLiveVenue.slug);
            liveRefreshRef.current = setInterval(() => fetchLiveGames(selectedLiveVenue.slug), LIVE_REFRESH_MS);
        }
        return () => { if (liveRefreshRef.current) clearInterval(liveRefreshRef.current); };
    }, [selectedLiveVenue]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLiveSearchInput = (value) => {
        setLiveSearchQuery(value);
        if (value.trim().length >= 2) {
            const q = value.trim().toLowerCase();
            const matches = liveVenueList.filter(v =>
                v.name && v.name.toLowerCase().includes(q)
            ).slice(0, 8);
            setLiveVenueSuggestions(matches);
            setShowLiveSuggestions(matches.length > 0);
        } else {
            setLiveVenueSuggestions([]);
            setShowLiveSuggestions(false);
        }
    };

    const handleSelectLiveVenue = (venue) => {
        setSelectedLiveVenue(venue);
        setLiveSearchQuery(venue.name);
        setShowLiveSuggestions(false);
        setLiveGames([]);
    };

    const handleClearLiveVenue = () => {
        setSelectedLiveVenue(null);
        setLiveSearchQuery('');
        setLiveGames([]);
        setShowLiveSuggestions(false);
    };

    const totalTables = liveGames.reduce((sum, g) => sum + (g.table_count || 0), 0);

    return (
        <div style={{ padding: '0 16px 40px' }}>
            {/* Context Header */}
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e0e8f0', margin: '0 0 4px' }}>Live Games Dashboard</h2>
                <p style={{ fontSize: 13, color: 'rgba(200,214,229,0.5)', margin: 0 }}>
                    Powered by Bravo Poker Live. Data refreshes every 15 minutes.
                </p>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: 24, zIndex: 10 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(13,17,23,0.95)', border: '1px solid rgba(48,54,61,0.8)',
                    borderRadius: 14, padding: '12px 16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(200,214,229,0.5)" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={liveSearchInputRef}
                        type="text"
                        value={liveSearchQuery}
                        onChange={(e) => handleLiveSearchInput(e.target.value)}
                        onFocus={() => { if (liveVenueSuggestions.length > 0) setShowLiveSuggestions(true); }}
                        placeholder="Search for a casino..."
                        style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            color: '#e0e8f0', fontSize: 15, fontWeight: 500, fontFamily: 'inherit'
                        }}
                    />
                    {selectedLiveVenue && (
                        <button onClick={handleClearLiveVenue} style={{
                            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8,
                            padding: '6px 10px', color: '#e0e8f0', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            transition: 'background 0.2s'
                        }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                           onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                            Clear
                        </button>
                    )}
                </div>

                {/* Autocomplete Dropdown */}
                {showLiveSuggestions && liveVenueSuggestions.length > 0 && (
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                        background: 'rgba(13,17,23,0.98)', backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(212,168,83,0.4)', borderRadius: 12,
                        overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                    }}>
                        {liveVenueSuggestions.map((v, i) => (
                            <div key={v.slug || i} onClick={() => handleSelectLiveVenue(v)} style={{
                                padding: '14px 16px', cursor: 'pointer',
                                borderBottom: i < liveVenueSuggestions.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                display: 'flex', alignItems: 'center', gap: 12,
                                transition: 'background 0.15s',
                            }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(212,168,83,0.15)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(212,168,83,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2.5">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                                    </svg>
                                </div>
                                <div>
                                    <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{v.name}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* No venue selected — landing state */}
            {!selectedLiveVenue && !liveLoading && (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(13,17,23,0.6)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <circle cx="12" cy="12" r="4" fill="rgba(239,68,68,0.3)" />
                            <circle cx="12" cy="12" r="7" strokeOpacity="0.5" />
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                        </svg>
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#e0e8f0', margin: '0 0 8px' }}>Select a Casino</p>
                    <p style={{ fontSize: 14, color: 'rgba(200,214,229,0.5)', margin: '0 auto', maxWidth: 300, lineHeight: 1.5 }}>
                        Search for a casino above to instantly view all live games and waitlists currently running.
                    </p>
                </div>
            )}

            {/* Loading state */}
            {liveLoading && renderSkeletons(4)}

            {/* Selected venue — Empty state */}
            {selectedLiveVenue && !liveLoading && liveGames.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(13,17,23,0.6)', borderRadius: 16, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#e0e8f0', margin: '0 0 8px' }}>No Live Games Found</p>
                    <p style={{ fontSize: 14, color: 'rgba(200,214,229,0.5)', margin: '0 auto 16px', maxWidth: 300, lineHeight: 1.5 }}>
                        There are no games currently reported running at {selectedLiveVenue.name}.
                    </p>
                    <button onClick={() => fetchLiveGames(selectedLiveVenue.slug)} style={{
                        padding: '10px 24px', background: 'rgba(212,168,83,0.15)',
                        border: '1px solid rgba(212,168,83,0.4)', borderRadius: 10,
                        color: '#d4a853', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}>{liveLoading ? 'Checking...' : 'Check Again'}</button>
                </div>
            )}

            {/* Selected venue — Results */}
            {selectedLiveVenue && liveGames.length > 0 && (
                <div className="live-games-results">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e8f0' }}>
                                {totalTables} table{totalTables !== 1 ? 's' : ''} running
                            </span>
                        </div>
                        <button onClick={() => fetchLiveGames(selectedLiveVenue.slug)} disabled={liveLoading} style={{
                            background: 'transparent', border: 'none', color: '#58a6ff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                        }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: liveLoading ? 'spin 1s linear infinite' : 'none' }}>
                                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path d="M9 12l2 2 4-4" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* Venue Card header */}
                    <div style={{
                        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 16, overflow: 'hidden',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.4)',
                    }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>{selectedLiveVenue.name}</h3>
                            <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.5px' }}>LIVE</span>
                        </div>
                        
                        <div style={{ padding: 12 }}>
                            {liveGames.map((game, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', borderRadius: 12,
                                    background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                }}>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <div style={{ background: 'rgba(88,166,255,0.1)', color: '#58a6ff', width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>
                                            {game.game_type}
                                        </div>
                                        <div>
                                            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
                                                {game.stakes || game.game_name_raw || 'Unknown'}
                                            </div>
                                            <div style={{ color: 'rgba(200,214,229,0.5)', fontSize: 12 }}>
                                                {game.table_count} table{game.table_count !== 1 ? 's' : ''} running
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {game.wait_time !== null && game.wait_time !== undefined && (
                                            <div style={{
                                                color: game.wait_time <= 3 ? '#22c55e' : game.wait_time <= 10 ? '#d4a853' : '#ef4444',
                                                fontSize: 14, fontWeight: 700, marginBottom: 2
                                            }}>
                                                {game.wait_time === 0 ? 'No wait' : `${game.wait_time} waiting`}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div style={{ padding: '12px 24px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', fontWeight: 500 }}>
                                Updated {liveGames[0]?.created_at ? new Date(liveGames[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recently'}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.3)', fontWeight: 600, letterSpacing: '0.5px' }}>
                                VIA BRAVO POKER LIVE
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
