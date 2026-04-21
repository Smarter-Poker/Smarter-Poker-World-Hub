import React, { useState, useRef } from 'react';
import C from './MessengerTheme';

function MessageInput({ onSend, onTyping, onMediaUpload, onGifSend, disabled }) {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifSearchQuery, setGifSearchQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loadingGifs, setLoadingGifs] = useState(false);
    const [gifError, setGifError] = useState('');
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const gifSearchTimer = useRef(null);

    const emojis = ['😀', '😂', '❤️', '👍', '🔥', '😮', '😎', '🤔', '👏', '💯', '♠️', '♥️', '♦️', '♣️', '🃏', '🎰'];

    const handleSend = () => {
        if (!text.trim()) return;
        onSend(text.trim());
        setText('');
        setShowEmoji(false);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleChange = (e) => {
        setText(e.target.value);
        // Broadcast typing indicator
        if (onTyping && e.target.value.length > 0) {
            onTyping();
        }
    };

    // GIF picker functions
    const loadTrendingGifs = async () => {
        setLoadingGifs(true);
        setGifError('');
        try {
            const resp = await fetch('/api/messenger/gif-search?limit=20');
            const data = await resp.json();
            if (data.success) {
                setGifs(data.gifs);
            } else {
                setGifError(data.error || 'Failed to load GIFs');
            }
        } catch (e) {
            console.warn('GIF load error:', e);
            setGifError('Unable to connect to GIF service');
        }
        setLoadingGifs(false);
    };

    const searchGifs = (query) => {
        if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current);
        setGifSearchQuery(query);
        if (!query || query.length < 2) {
            loadTrendingGifs();
            return;
        }
        gifSearchTimer.current = setTimeout(async () => {
            setLoadingGifs(true);
            setGifError('');
            try {
                const resp = await fetch(`/api/messenger/gif-search?q=${encodeURIComponent(query)}&limit=20`);
                const data = await resp.json();
                if (data.success) {
                    setGifs(data.gifs);
                } else {
                    setGifError(data.error || 'Search failed');
                }
            } catch (e) {
                console.warn('GIF search error:', e);
                setGifError('Unable to search GIFs');
            }
            setLoadingGifs(false);
        }, 300);
    };

    const handleGifToggle = () => {
        const opening = !showGifPicker;
        setShowGifPicker(opening);
        setShowEmoji(false);
        if (opening) loadTrendingGifs();
    };

    return (
        <div style={{
            padding: '12px 16px',
            background: C.card,
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
        }}>
            {/* Photo/Video Upload Button */}
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !onMediaUpload) return;
                    setUploading(true);
                    try {
                        await onMediaUpload(file);
                    } finally {
                        setUploading(false);
                        e.target.value = '';
                    }
                }}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
                    background: 'transparent', cursor: uploading ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: uploading ? 0.5 : 1, padding: 0,
                }}
                title="Send Photo Or Video"
            >
                {uploading ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}>
                        <circle cx="12" cy="12" r="10" stroke={C.blue} strokeWidth="2" fill="none" strokeDasharray="31.4" strokeLinecap="round">
                            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                        </circle>
                    </svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}>
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke={C.blue} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>

            {/* GIF button */}
            <button
                onClick={handleGifToggle}
                style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
                    background: showGifPicker ? C.bg : 'transparent', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
                title="Send GIF"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="14" rx="2" stroke={C.blue} strokeWidth="1.5" />
                    <text x="12" y="14" textAnchor="middle" fontSize="7" fontWeight="bold" fill={C.blue}>GIF</text>
                </svg>
            </button>

            {/* GIF Picker Panel */}
            {showGifPicker && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0,
                    marginBottom: 4, background: C.card, borderRadius: 12,
                    boxShadow: '0 -4px 16px rgba(0,0,0,0.15)', zIndex: 200,
                    maxHeight: 340, display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                        <input
                            type="text" value={gifSearchQuery}
                            onChange={e => searchGifs(e.target.value)}
                            placeholder="Search GIFs..."
                            style={{
                                width: '100%', border: 'none', background: C.bg,
                                borderRadius: 20, padding: '8px 12px', fontSize: 14,
                                outline: 'none', color: C.text,
                            }}
                            autoFocus
                        />
                    </div>
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: 8,
                        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 8, maxHeight: 280,
                    }}>
                        {loadingGifs ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: C.textSec }}>Loading...</div>
                        ) : gifError ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: C.textSec }}>
                                <div style={{ fontSize: 24, marginBottom: 8 }}>🎞️</div>
                                <div style={{ fontSize: 13 }}>{gifError}</div>
                                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Set GIPHY_API_KEY in Vercel to enable</div>
                            </div>
                        ) : gifs.length === 0 ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: C.textSec }}>No GIFs found</div>
                        ) : gifs.map(gif => (
                            <img
                                key={gif.id} src={gif.preview || gif.url} alt={gif.title}
                                onClick={() => {
                                    onGifSend?.(gif.url);
                                    setShowGifPicker(false);
                                    setGifSearchQuery('');
                                }}
                                style={{
                                    width: '100%', height: 120, objectFit: 'cover',
                                    borderRadius: 8, cursor: 'pointer',
                                    background: C.bg, border: `1px solid ${C.border}`,
                                }}
                                loading="lazy"
                            />
                        ))}
                    </div>
                    <div style={{ padding: '4px 12px', textAlign: 'center', fontSize: 10, color: C.textSec, borderTop: `1px solid ${C.border}` }}>
                        Powered by GIPHY
                    </div>
                </div>
            )}

            {/* Input wrapper */}
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                background: C.bg,
                borderRadius: 24,
                padding: '0 12px',
                position: 'relative',
            }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Aa"
                    disabled={disabled}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        padding: '10px 0',
                        fontSize: 15,
                        outline: 'none',
                        color: '#050505',
                    }}
                />

                <button
                    onClick={() => { setShowEmoji(!showEmoji); setShowGifPicker(false); }}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    title="Choose Emoji"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke={C.blue} strokeWidth="1.5" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="9" cy="10" r="1" fill={C.blue} />
                        <circle cx="15" cy="10" r="1" fill={C.blue} />
                    </svg>
                </button>

                {/* Emoji picker */}
                {showEmoji && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: 8,
                        background: C.card,
                        borderRadius: 12,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        padding: 8,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(8, 1fr)',
                        gap: 4,
                        zIndex: 100,
                    }}>
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => { setText(prev => prev + emoji); setShowEmoji(false); }}
                                style={{
                                    width: 32, height: 32, border: 'none', borderRadius: 8,
                                    background: 'transparent', cursor: 'pointer', fontSize: 18,
                                }}
                            >{emoji}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* Send button - SmarterPoker Messenger style */}
            <button
                onClick={handleSend}
                disabled={!text.trim()}
                style={{
                    width: 32, height: 32, borderRadius: '50%', border: 'none',
                    background: text.trim() ? C.blue : 'transparent',
                    cursor: text.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                }}
                title={text.trim() ? "Send message" : "Send like"}
            >
                {text.trim() ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                        <path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="white" />
                    </svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}>
                        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" stroke={C.blue} strokeWidth="1.5" fill="none" />
                    </svg>
                )}
            </button>
        </div>
    );
}

export default MessageInput;
