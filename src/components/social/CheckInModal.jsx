/**
 * CheckInModal.jsx — Venue picker for social media check-ins.
 * Searches poker venues by name/city, shows GPS-nearby results,
 * auto-suggests recent check-in venues, and displays today's check-in counts.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

// Venue card sub-component with optional check-in count badge
function VenueCard({ venue, onSelect, checkinCount }) {
    return (
        <button
            onClick={() => onSelect(venue)}
            style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '10px 8px', border: 'none', background: 'transparent',
                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f2f5'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 14, fontWeight: 600, color: '#1c1e21',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{venue.name}</div>
                <div style={{ fontSize: 12, color: '#65676B', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{[venue.city, venue.state].filter(Boolean).join(', ')}</span>
                    {venue.distance != null && <span>· {venue.distance < 1 ? '<1' : Math.round(venue.distance)} Mi</span>}
                </div>
            </div>
            {/* Check-in count badge */}
            {checkinCount > 0 && (
                <div style={{
                    padding: '3px 8px', borderRadius: 12,
                    background: '#FFF3E0', color: '#E65100',
                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}>
                    {checkinCount} Today
                </div>
            )}
        </button>
    );
}

export default function CheckInModal({ onSelect, onClose, userId }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [nearbyVenues, setNearbyVenues] = useState([]);
    const [recentVenues, setRecentVenues] = useState([]); // Auto-suggest recent check-ins
    const [checkinCounts, setCheckinCounts] = useState({}); // { venueId: count }
    const [userStats, setUserStats] = useState({ total: 0, venues: 0 }); // User check-in stats
    const inputRef = useRef(null);
    const debounceRef = useRef(null);
    const isMountedRef = useRef(true);

    // Track mount state for async guard
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Auto-focus search input on mount
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(timer);
    }, []);

    // Fetch user's recent check-in venues (auto-suggest)
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/poker/checkins?user_id=${userId}`);
                const data = await res.json();
                if (cancelled || !data.success) return;
                const checkins = data.checkins || [];
                // Track stats
                const uniqueVenueIds = new Set(checkins.map(c => c.venue_id));
                if (isMountedRef.current) {
                    setUserStats({ total: checkins.length, venues: uniqueVenueIds.size });
                }
                // De-duplicate by venue_id, keep most recent, limit to 3
                const seen = new Set();
                const unique = [];
                for (const c of checkins) {
                    if (!seen.has(c.venue_id)) {
                        seen.add(c.venue_id);
                        unique.push(c);
                    }
                    if (unique.length >= 3) break;
                }
                // Resolve venue names from the venues API
                if (unique.length > 0 && isMountedRef.current) {
                    const venuePromises = unique.map(c =>
                        fetch(`/api/poker/venues?id=${c.venue_id}`).then(r => r.json()).catch(() => null)
                    );
                    const venueResults = await Promise.all(venuePromises);
                    if (cancelled) return;
                    const resolved = venueResults
                        .map((vr, i) => {
                            const venueData = vr?.data?.[0] || vr?.venues?.[0] || (Array.isArray(vr) ? vr[0] : null);
                            if (!venueData) return null;
                            return { ...venueData, lastCheckin: unique[i].created_at };
                        })
                        .filter(Boolean);
                    if (isMountedRef.current) setRecentVenues(resolved);
                }
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, [userId]);

    // Fetch nearby venues on mount if GPS available (with unmount guard)
    useEffect(() => {
        let cancelled = false;
        if (!navigator.geolocation) return;
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude, longitude } = pos.coords;
                    const res = await fetch(`/api/poker/venues?lat=${latitude}&lng=${longitude}&radius=80&limit=8`);
                    const data = await res.json();
                    if (cancelled) return;
                    const venues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                    const mapped = venues.map(v => ({ ...v, distance: v.distance_mi ?? v.distance ?? null }));
                    setNearbyVenues(mapped);
                    // Batch-fetch check-in counts for nearby venues
                    if (mapped.length > 0) {
                        fetchCheckinCounts(mapped.map(v => v.id));
                    }
                } catch { /* silent */ }
                if (!cancelled) setGpsLoading(false);
            },
            () => { if (!cancelled) setGpsLoading(false); },
            { enableHighAccuracy: true, timeout: 6000 }
        );
        return () => { cancelled = true; };
    }, []);

    // Batch-fetch check-in counts for a list of venue IDs
    const fetchCheckinCounts = useCallback(async (venueIds) => {
        try {
            const results = await Promise.all(
                venueIds.map(id =>
                    fetch(`/api/poker/checkins?venue_id=${id}&count_only=true`)
                        .then(r => r.json())
                        .catch(() => ({ success: false }))
                )
            );
            if (!isMountedRef.current) return;
            const counts = {};
            results.forEach((r, i) => {
                if (r.success && r.count > 0) counts[String(venueIds[i])] = r.count;
            });
            setCheckinCounts(prev => ({ ...prev, ...counts }));
        } catch { /* silent */ }
    }, []);

    // Search venues by query (with unmount guard for in-flight fetches)
    const searchVenues = useCallback(async (q) => {
        if (!q.trim()) { if (isMountedRef.current) setResults([]); return; }
        if (isMountedRef.current) setLoading(true);
        try {
            const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(q)}&limit=10`);
            const data = await res.json();
            const venues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
            if (isMountedRef.current) {
                setResults(venues);
                // Fetch check-in counts for integer-ID venues in results
                const intIds = venues.map(v => parseInt(v.id, 10)).filter(n => !isNaN(n) && n > 0);
                if (intIds.length > 0) fetchCheckinCounts(intIds);
            }
        } catch { if (isMountedRef.current) setResults([]); }
        if (isMountedRef.current) setLoading(false);
    }, [fetchCheckinCounts]);

    // Cleanup debounce timer on unmount to prevent memory leak
    useEffect(() => {
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, []);

    // Debounced search
    const handleSearch = (val) => {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchVenues(val), 300);
    };

    const handleSelect = (venue) => {
        onSelect?.(venue);
        onClose?.();
    };

    const displayVenues = query.trim() ? results : nearbyVenues;
    const sectionLabel = query.trim() ? 'Search Results' : (nearbyVenues.length > 0 ? 'Nearby Venues' : '');
    const showRecent = !query.trim() && recentVenues.length > 0;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(0,0,0,0.6)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440,
                    maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 16px 12px', borderBottom: '1px solid #e4e6ea',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1c1e21' }}>
                        Check In
                    </h3>
                    {userStats.venues > 0 && (
                        <span style={{
                            fontSize: 11, fontWeight: 600, color: '#1877F2',
                            padding: '3px 8px', borderRadius: 10, background: '#E7F3FF',
                            marginRight: 'auto', marginLeft: 12,
                        }}>
                            {userStats.venues} {userStats.venues === 1 ? 'venue' : 'venues'} Visited
                        </span>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            width: 32, height: 32, borderRadius: '50%', border: 'none',
                            background: '#e4e6ea', cursor: 'pointer', fontSize: 16,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#606770',
                        }}
                    >×</button>
                </div>

                {/* Search */}
                <div style={{ padding: '12px 16px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: '#f0f2f5', borderRadius: 20, padding: '8px 14px',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#65676B" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => handleSearch(e.target.value)}
                            placeholder="Search venues..."
                            style={{
                                flex: 1, border: 'none', background: 'transparent', outline: 'none',
                                fontSize: 15, color: '#1c1e21',
                            }}
                        />
                        {query && (
                            <button
                                onClick={() => { setQuery(''); setResults([]); }}
                                style={{
                                    border: 'none', background: 'none', cursor: 'pointer',
                                    color: '#65676B', fontSize: 14, padding: 0,
                                }}
                            >×</button>
                        )}
                    </div>
                </div>

                {/* Results */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
                    {/* Recent Check-Ins (auto-suggest) */}
                    {showRecent && (
                        <>
                            <div style={{
                                padding: '4px 8px 8px', fontSize: 12, fontWeight: 600,
                                color: '#65676B', textTransform: 'uppercase', letterSpacing: 0.5,
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#65676B" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                                Recent
                            </div>
                            {recentVenues.map(v => (
                                <VenueCard key={`recent-${v.id}`} venue={v} onSelect={handleSelect} checkinCount={checkinCounts[String(v.id)]} />
                            ))}
                            {nearbyVenues.length > 0 && (
                                <div style={{ height: 1, background: '#e4e6ea', margin: '8px 8px 4px' }} />
                            )}
                        </>
                    )}

                    {/* Section Label */}
                    {sectionLabel && (
                        <div style={{
                            padding: '4px 8px 8px', fontSize: 12, fontWeight: 600,
                            color: '#65676B', textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>
                            {sectionLabel}
                        </div>
                    )}

                    {(loading || gpsLoading) && !displayVenues.length && (
                        <div style={{ padding: 24, textAlign: 'center', color: '#65676B', fontSize: 14 }}>
                            Finding Venues...
                        </div>
                    )}

                    {!loading && !gpsLoading && displayVenues.length === 0 && !showRecent && (
                        <div style={{ padding: 24, textAlign: 'center', color: '#65676B', fontSize: 14 }}>
                            {query ? 'No venues found' : 'Enable location or search for a venue'}
                        </div>
                    )}

                    {displayVenues.map(v => (
                        <VenueCard key={v.id} venue={v} onSelect={handleSelect} checkinCount={checkinCounts[String(v.id)]} />
                    ))}
                </div>
            </div>
        </div>
    );
}
