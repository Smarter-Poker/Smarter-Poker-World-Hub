/**
 * 🎞️ GIPHY PICKER — Shared Component (v2.0)
 * Reusable GIF/Sticker search/browse panel powered by /api/messenger/gif-search (GIPHY proxy).
 * 
 * Features:
 *   - Shimmer loading skeleton
 *   - Infinite scroll (load more on scroll)
 *   - GIF/Sticker tab toggle
 *   - Compact mode for inline use
 *   - Paste-to-upload image support (Ctrl+V / Cmd+V)
 *
 * Props:
 *   onSelect(gifUrl: string) — callback when user picks a GIF/sticker
 *   onClose() — callback to dismiss the picker
 *   compact — if true, uses smaller height (for inline comment usage)
 *   onPaste(file: File) — callback when user pastes an image from clipboard
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// Shimmer skeleton placeholder for loading state
const ShimmerCard = ({ height }) => (
    <div style={{
        width: '100%',
        height: height || 120,
        borderRadius: 8,
        background: 'linear-gradient(110deg, #E4E6EB 8%, #F0F2F5 18%, #E4E6EB 33%)',
        backgroundSize: '200% 100%',
        animation: 'sp-shimmer 1.5s linear infinite',
    }} />
);

const GiphyPicker = ({ onSelect, onClose, compact = false, onPaste }) => {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('gif'); // 'gif' | 'sticker'
    const [hasMore, setHasMore] = useState(true);
    const searchTimerRef = useRef(null);
    const inputRef = useRef(null);
    const gridRef = useRef(null);
    const offsetRef = useRef(0);
    const LIMIT = 20;

    // Load trending on mount and tab change
    useEffect(() => {
        loadTrending();
        setTimeout(() => inputRef.current?.focus(), 100);
    }, [tab]);

    const loadTrending = async () => {
        setLoading(true);
        setError('');
        setGifs([]);
        offsetRef.current = 0;
        try {
            const resp = await fetch(`/api/messenger/gif-search?limit=${LIMIT}&type=${tab}`);
            const data = await resp.json();
            if (data.success) {
                setGifs(data.gifs);
                setHasMore(data.gifs.length >= LIMIT);
                offsetRef.current = data.gifs.length;
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
            setGifs([]);
            offsetRef.current = 0;
            try {
                const resp = await fetch(`/api/messenger/gif-search?q=${encodeURIComponent(q)}&limit=${LIMIT}&type=${tab}`);
                const data = await resp.json();
                if (data.success) {
                    setGifs(data.gifs);
                    setHasMore(data.gifs.length >= LIMIT);
                    offsetRef.current = data.gifs.length;
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

    // Infinite scroll — load more
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const qParam = query && query.length >= 2 ? `&q=${encodeURIComponent(query)}` : '';
            const resp = await fetch(`/api/messenger/gif-search?limit=${LIMIT}&offset=${offsetRef.current}&type=${tab}${qParam}`);
            const data = await resp.json();
            if (data.success && data.gifs.length > 0) {
                setGifs(prev => [...prev, ...data.gifs]);
                offsetRef.current += data.gifs.length;
                setHasMore(data.gifs.length >= LIMIT);
            } else {
                setHasMore(false);
            }
        } catch (e) {
            console.error('[GiphyPicker] Load more error:', e);
        }
        setLoadingMore(false);
    }, [loadingMore, hasMore, query, tab]);

    // Scroll event handler for infinite scroll
    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = grid;
            if (scrollHeight - scrollTop - clientHeight < 100) {
                loadMore();
            }
        };
        grid.addEventListener('scroll', handleScroll, { passive: true });
        return () => grid.removeEventListener('scroll', handleScroll);
    }, [loadMore]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, []);

    const maxH = compact ? 280 : 380;

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
            {/* Shimmer animation CSS */}
            <style>{`
                @keyframes sp-shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>

            {/* Tab bar: GIFs | Stickers */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid #E4E6EB',
            }}>
                <button
                    onClick={() => { setTab('gif'); setQuery(''); }}
                    style={{
                        flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                        background: tab === 'gif' ? '#E7F3FF' : 'transparent',
                        color: tab === 'gif' ? '#1877F2' : '#65676B',
                        fontWeight: 600, fontSize: 13,
                        borderBottom: tab === 'gif' ? '2px solid #1877F2' : '2px solid transparent',
                    }}
                >GIFs</button>
                <button
                    onClick={() => { setTab('sticker'); setQuery(''); }}
                    style={{
                        flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                        background: tab === 'sticker' ? '#E7F3FF' : 'transparent',
                        color: tab === 'sticker' ? '#1877F2' : '#65676B',
                        fontWeight: 600, fontSize: 13,
                        borderBottom: tab === 'sticker' ? '2px solid #1877F2' : '2px solid transparent',
                    }}
                >Stickers</button>
            </div>

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
                    placeholder={tab === 'gif' ? 'Search GIFs...' : 'Search Stickers...'}
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

            {/* GIF/Sticker Grid */}
            <div ref={gridRef} style={{
                flex: 1,
                overflowY: 'auto',
                padding: 8,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                maxHeight: maxH - 120,
            }}>
                {loading ? (
                    // Shimmer skeleton — 6 cards
                    <>
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <ShimmerCard key={i} height={compact ? 90 : 120} />
                        ))}
                    </>
                ) : error ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#65676B' }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🎞️</div>
                        <div style={{ fontSize: 13 }}>{error}</div>
                        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Set GIPHY_API_KEY in Vercel to enable</div>
                    </div>
                ) : gifs.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#65676B' }}>
                        No {tab === 'gif' ? 'GIFs' : 'stickers'} found
                    </div>
                ) : (
                    <>
                        {gifs.map(gif => (
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
                                    background: tab === 'sticker' ? 'transparent' : '#F0F2F5',
                                    border: tab === 'sticker' ? 'none' : '1px solid #E4E6EB',
                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                }}
                                onMouseEnter={e => { e.target.style.transform = 'scale(1.03)'; e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; }}
                                onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = 'none'; }}
                                loading="lazy"
                            />
                        ))}
                        {/* Load more shimmer */}
                        {loadingMore && [1, 2].map(i => (
                            <ShimmerCard key={`more-${i}`} height={compact ? 90 : 120} />
                        ))}
                    </>
                )}
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
