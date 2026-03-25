/**
 * CheckInModal.jsx — Venue picker for social media check-ins.
 * Searches poker venues by name/city and shows GPS-nearby results.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function CheckInModal({ onSelect, onClose }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [nearbyVenues, setNearbyVenues] = useState([]);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    // Auto-focus search input on mount
    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    // Fetch nearby venues on mount if GPS available
    useEffect(() => {
        if (!navigator.geolocation) return;
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude, longitude } = pos.coords;
                    const res = await fetch(`/api/poker/venues?lat=${latitude}&lng=${longitude}&radius=80&limit=8`);
                    const data = await res.json();
                    const venues = data?.data || data?.venues || (Array.isArray(data) ? data : []);
                    // Map distance_mi from venue API to distance for display
                    setNearbyVenues(venues.map(v => ({ ...v, distance: v.distance_mi ?? v.distance ?? null })));
                } catch { /* silent */ }
                setGpsLoading(false);
            },
            () => setGpsLoading(false),
            { enableHighAccuracy: true, timeout: 6000 }
        );
    }, []);

    // Search venues by query
    const searchVenues = useCallback(async (q) => {
        if (!q.trim()) { setResults([]); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(q)}&limit=10`);
            const data = await res.json();
            setResults(data?.data || data?.venues || (Array.isArray(data) ? data : []));
        } catch { setResults([]); }
        setLoading(false);
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
                            Finding venues...
                        </div>
                    )}

                    {!loading && !gpsLoading && displayVenues.length === 0 && (
                        <div style={{ padding: 24, textAlign: 'center', color: '#65676B', fontSize: 14 }}>
                            {query ? 'No venues found' : 'Enable location or search for a venue'}
                        </div>
                    )}

                    {displayVenues.map(v => (
                        <button
                            key={v.id}
                            onClick={() => handleSelect(v)}
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
                                }}>{v.name}</div>
                                <div style={{ fontSize: 12, color: '#65676B' }}>
                                    {[v.city, v.state].filter(Boolean).join(', ')}
                                    {v.distance != null && ` · ${v.distance < 1 ? '<1' : Math.round(v.distance)} mi`}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
