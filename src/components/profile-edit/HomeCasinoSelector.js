import { useState, useEffect, useRef, useCallback } from 'react';
import { C } from './constants';

function HomeCasinoSelector({ value, onChange }) {
    const [query, setQuery] = useState(value || '');
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const debounceRef = useRef(null);
    const containerRef = useRef(null);

    // Sync external value
    useEffect(() => { setQuery(value || ''); }, [value]);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, []);

    const searchVenues = useCallback(async (q) => {
        if (!q || q.length < 2) { setSuggestions([]); return; }
        setIsSearching(true);
        try {
            const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(q)}&limit=8`);
            if (!res.ok) { setIsSearching(false); return; }
            const data = await res.json();
            if (data.success && data.data) {
                setSuggestions(data.data);
                setShowDropdown(true);
            }
        } catch { /* noop */ } finally { setIsSearching(false); }
    }, []);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setQuery(val);
        onChange(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchVenues(val), 300);
    };

    const handleSelect = (venue) => {
        setQuery(venue.name);
        setShowDropdown(false);
        onChange(venue.name);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                    placeholder="Search 483+ venues or type a name..."
                    style={{
                        width: '100%', padding: 12, fontSize: 15,
                        background: '#ffffff', border: `1px solid ${C.border}`,
                        borderRadius: 8, color: '#000000', outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
                {isSearching && <span style={{ position: 'absolute', right: 10, color: '#2374e1', fontSize: 16 }}>⟳</span>}
            </div>
            {showDropdown && suggestions.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 8, overflow: 'hidden', zIndex: 100,
                    maxHeight: 240, overflowY: 'auto',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}>
                    {suggestions.map((venue) => (
                        <button
                            key={venue.id}
                            type="button"
                            onClick={() => handleSelect(venue)}
                            style={{
                                display: 'block', width: '100%', padding: '10px 14px',
                                background: 'none', border: 'none',
                                borderBottom: `1px solid ${C.border}`,
                                cursor: 'pointer', textAlign: 'left', color: C.text,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F0F2F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                        >
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{venue.name}</div>
                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                                {venue.city}{venue.state ? `, ${venue.state}` : ''}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default HomeCasinoSelector;
