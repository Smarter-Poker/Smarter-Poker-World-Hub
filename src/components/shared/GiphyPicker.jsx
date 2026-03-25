/**
 * 🎞️ GIPHY PICKER — Shared Component
 * Reusable GIF search/browse panel powered by /api/messenger/gif-search (GIPHY proxy).
 * Used by: SmarterPokerMessenger, ClubArenaMessenger, PostCard Comments
 *
 * Props:
 *   onSelect(gifUrl: string) — callback when user picks a GIF
 *   onClose() — callback to dismiss the picker
 *   compact — if true, uses smaller height (for inline comment usage)
 */

import React, { useState, useEffect, useRef } from 'react';

const GiphyPicker = ({ onSelect, onClose, compact = false }) => {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const searchTimerRef = useRef(null);
    const inputRef = useRef(null);

    // Load trending on mount
    useEffect(() => {
        loadTrending();
        // Auto-focus search input
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    const loadTrending = async () => {
        setLoading(true);
        setError('');
        try {
            const resp = await fetch('/api/messenger/gif-search?limit=20');
            const data = await resp.json();
            if (data.success) {
                setGifs(data.gifs);
            } else {
                setError(data.error || 'Failed to load GIFs');
            }
        } catch (e) {
            console.error('[GiphyPicker] Load error:', e);
            setError('Unable to connect to GIF service');
        }
        setLoading(false);
    };

    const handleSearch = (q) => {
        setQuery(q);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (!q || q.length < 2) {
            loadTrending();
            return;
        }
        searchTimerRef.current = setTimeout(async () => {
            setLoading(true);
            setError('');
            try {
                const resp = await fetch(`/api/messenger/gif-search?q=${encodeURIComponent(q)}&limit=20`);
                const data = await resp.json();
                if (data.success) {
                    setGifs(data.gifs);
                } else {
                    setError(data.error || 'Search failed');
                }
            } catch (e) {
                console.error('[GiphyPicker] Search error:', e);
                setError('Unable to search GIFs');
            }
            setLoading(false);
        }, 300);
    };

    useEffect(() => {
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, []);

    const maxH = compact ? 240 : 340;

    return (
        <div style={{
            background: '#FFFFFF',
            borderRadius: 12,
            boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
            maxHeight: maxH,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #E4E6EB',
        }}>
            {/* Header with search */}
            <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid #E4E6EB',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
            }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Search GIFs..."
                    style={{
                        flex: 1,
                        border: 'none',
                        background: '#F0F2F5',
                        borderRadius: 20,
                        padding: '8px 12px',
                        fontSize: 14,
                        outline: 'none',
                        color: '#050505',
                    }}
                />
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#65676B', fontSize: 18, padding: '0 4px',
                            lineHeight: 1,
                        }}
                        title="Close"
                    >×</button>
                )}
            </div>

            {/* GIF Grid */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 8,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                maxHeight: maxH - 80,
            }}>
                {loading ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#65676B' }}>
                        <div style={{ fontSize: 14 }}>Loading GIFs...</div>
                    </div>
                ) : error ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#65676B' }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🎞️</div>
                        <div style={{ fontSize: 13 }}>{error}</div>
                        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Set GIPHY_API_KEY in Vercel to enable</div>
                    </div>
                ) : gifs.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#65676B' }}>No GIFs found</div>
                ) : gifs.map(gif => (
                    <img
                        key={gif.id}
                        src={gif.preview || gif.url}
                        alt={gif.title}
                        onClick={() => onSelect?.(gif.url)}
                        style={{
                            width: '100%',
                            height: compact ? 90 : 120,
                            objectFit: 'cover',
                            borderRadius: 8,
                            cursor: 'pointer',
                            background: '#F0F2F5',
                            border: '1px solid #E4E6EB',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => { e.target.style.transform = 'scale(1.03)'; e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = 'none'; }}
                        loading="lazy"
                    />
                ))}
            </div>

            {/* Footer */}
            <div style={{
                padding: '4px 12px',
                textAlign: 'center',
                fontSize: 10,
                color: '#65676B',
                borderTop: '1px solid #E4E6EB',
            }}>
                Powered by GIPHY
            </div>
        </div>
    );
};

export default GiphyPicker;
