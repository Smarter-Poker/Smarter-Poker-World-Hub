import React, { useEffect, useState } from 'react';
import SheetShell from './SheetShell';
import { useComposeStore } from '../../../../stores/composeStore';

/**
 * LocationPickerSheet — search + GPS-suggested venues.
 * Reuses the existing /api/venues/search endpoint (used by check-in modal).
 * Stores the picked venue into composeStore.location as
 *   { name, lat, lng, place_id }
 */
export default function LocationPickerSheet({ onClose }) {
    const location = useComposeStore(s => s.location);
    const setLocation = useComposeStore(s => s.setLocation);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const q = query.trim();
            // For empty query, attempt a GPS-based "nearby" search if geolocation
            // is available. Otherwise show recent picks.
            try {
                setLoading(true);
                let url = '/api/venues/search?limit=20';
                if (q) {
                    url += `&q=${encodeURIComponent(q)}`;
                } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
                    const pos = await new Promise((res) => {
                        navigator.geolocation.getCurrentPosition(
                            (p) => res(p),
                            () => res(null),
                            { timeout: 4000, enableHighAccuracy: false, maximumAge: 5 * 60 * 1000 },
                        );
                    });
                    if (pos?.coords) {
                        url += `&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`;
                    }
                }
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!cancelled) {
                    setResults(Array.isArray(json?.venues) ? json.venues : []);
                }
            } catch (_) {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        const t = setTimeout(run, query ? 250 : 0);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query]);

    const handlePick = (venue) => {
        setLocation({
            name: venue.name,
            lat: venue.lat ?? null,
            lng: venue.lng ?? null,
            place_id: venue.id ?? venue.place_id ?? null,
        });
        onClose?.();
    };

    const handleClear = () => {
        setLocation(null);
        onClose?.();
    };

    return (
        <SheetShell title="Location" onClose={onClose}>
            <div style={{ padding: 16 }}>
                <div style={{
                    background: '#f0f2f5', borderRadius: 10,
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                }}>
                    <span aria-hidden="true">&#x1F50D;</span>
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search location"
                        style={{
                            flex: 1, border: 'none', background: 'transparent',
                            outline: 'none', fontSize: 15, color: '#050505',
                        }}
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            aria-label="Clear"
                            style={{
                                background: '#bcc0c4', border: 'none', color: '#fff',
                                width: 18, height: 18, borderRadius: 9,
                                fontSize: 11, cursor: 'pointer', padding: 0,
                            }}
                        >&#x2715;</button>
                    )}
                </div>

                {location && (
                    <button
                        onClick={handleClear}
                        style={{
                            marginTop: 12, background: 'none', border: '1px solid #e4e6eb',
                            borderRadius: 6, padding: '8px 12px', fontSize: 13,
                            color: '#1877F2', fontWeight: 600, cursor: 'pointer',
                        }}
                    >Remove location ({location.name})</button>
                )}
            </div>

            <div>
                {loading && (
                    <div style={{ padding: 16, color: '#65676B', fontSize: 14 }}>Searching…</div>
                )}
                {!loading && results.length === 0 && query && (
                    <div style={{ padding: 16, color: '#65676B', fontSize: 14 }}>No matches.</div>
                )}
                {!loading && results.length === 0 && !query && (
                    <div style={{ padding: 16, color: '#65676B', fontSize: 14 }}>
                        Allow location access to see nearby venues, or search above.
                    </div>
                )}
                {results.map((v) => (
                    <button
                        key={v.id || v.place_id || v.name}
                        onClick={() => handlePick(v)}
                        style={{
                            width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                            padding: '12px 16px', background: 'none', border: 'none',
                            borderTop: '1px solid #e4e6eb', cursor: 'pointer', textAlign: 'left',
                        }}
                    >
                        <span aria-hidden="true" style={{ fontSize: 20, width: 28, textAlign: 'center', color: '#65676B' }}>&#x1F4CD;</span>
                        <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: '#050505' }}>{v.name}</span>
                            {(v.city || v.state) && (
                                <span style={{ display: 'block', fontSize: 12, color: '#65676B', marginTop: 2 }}>
                                    {[v.city, v.state].filter(Boolean).join(', ')}
                                </span>
                            )}
                        </span>
                    </button>
                ))}
            </div>
        </SheetShell>
    );
}
