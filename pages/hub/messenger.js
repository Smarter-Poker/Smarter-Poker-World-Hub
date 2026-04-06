/**
 *  SMARTER.POKER MESSENGER V2.0
 * Full-featured SmarterPoker Messenger clone with premium design
 * Real-time chat, read receipts, typing indicators, and poker-themed UI
 * Enhanced with: optimistic updates, message reactions, sound notifications
 */

import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import Image from 'next/image';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getAccessToken, ensureAuthReady } from '../../src/lib/authUtils';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { HubErrorBoundary } from '../../src/components/ui/HubErrorBoundary';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { messengerPreferences } from '../../src/services/preferences-service';
import ReportBugWidget from '../../src/components/ui/ReportBugWidget';
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';
import useTrainingBus from '../../src/hooks/useTrainingBus';

// Dynamic import for LiveKit (client-side only)
const LiveKitCall = dynamic(
    () => import('../../src/components/video/LiveKitCall'),
    { ssr: false }
);

// Dynamic import for Jarvis AI Widget (client-side only)
const JarvisMessengerWidget = dynamic(
    () => import('../../src/world/components/Jarvis/JarvisMessengerWidget'),
    { ssr: false }
);

// God-Mode Stack
import { useMessengerStore } from '../../src/stores/messengerStore';
import { useOneSignal } from '../../src/contexts/OneSignalContext';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import { createRingTone } from '../../src/utils/ringTone';
import { createMultiDeviceAuthListener, withRetry, getCircuit, isOnline } from '../../src/utils/authGuard';
import { useActiveIdentity } from '../../src/contexts/ActiveIdentityContext';
// BottomNavBar intentionally removed from messenger — input area was blocked

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 COLOR PALETTE - Premium Poker Theme
// ═══════════════════════════════════════════════════════════════════════════

const C = {
    bg: '#F0F2F5',
    bgDark: '#1C1E21',
    card: '#FFFFFF',
    cardDark: '#242526',
    text: '#050505',
    textDark: '#E4E6EB',
    textSec: '#65676B',
    textSecDark: '#B0B3B8',
    blue: '#0084FF',
    blueHover: '#0073E6',
    green: '#31A24C',
    purple: '#8A2BE2',
    gold: '#FFD700',
    red: '#E41E3F',
    border: '#E4E6EB',
    borderDark: '#3E4042',
    hoverBg: '#E4E6EB',
    hoverBgDark: '#3A3B3C',
    ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)',
    otherBubble: '#E4E6EB',
    otherBubbleDark: '#3A3B3C',
    pokerGreen: '#35654d',
    pokerFelt: '#1a472a',
    chipGold: '#FFD700',
    cardRed: '#E41E3F',
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS & HOOKS
// ═══════════════════════════════════════════════════════════════════════════

// Phase 3: Sound preference gate — only play if messageSounds is enabled
let _soundPrefsRef = { messageSounds: true };
function setSoundPrefsRef(prefs) { _soundPrefsRef = prefs; }
function playMessageSound() {
    if (!_soundPrefsRef.messageSounds) return; // Respect preference
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0tRXFuYz0mFTNNaWxofmh+YKStoJd/aGtbL09OYUFRYWOHeoKK');
        audio.volume = 0.3;
        audio.play().catch(() => { });
    } catch (e) { console.error("[messenger.js]", e); }
}

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return date.toLocaleDateString();
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDateHeader(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 smarter-poker-style SVG ICONS
// ═══════════════════════════════════════════════════════════════════════════

const PhoneIcon = ({ size = 20, color = '#0084FF' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
);

const VideoIcon = ({ size = 20, color = '#0084FF' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
);

const SearchIcon = ({ size = 20, color = '#0084FF' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
);

const InfoIcon = ({ size = 20, color = '#0084FF' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
// 🖼️ AVATAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Avatar({ src, name, size = 40, online, showOnline = true }) {
    const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
    const colors = ['#1877F2', '#42B72A', '#F02849', '#8B5CF6', '#F59E0B', '#EC4899'];
    const bgColor = colors[name?.charCodeAt(0) % colors.length || 0];

    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            {src ? (
                <img
                    src={src}
                    alt={name}
                    style={{
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        objectFit: 'cover',
                    }}
                    loading="lazy" />
            ) : (
                <div
                    style={{
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        background: bgColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: size * 0.4,
                    }}
                >
                    {initials}
                </div>
            )}
            {showOnline && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: size * 0.3,
                        height: size * 0.3,
                        borderRadius: '50%',
                        background: online ? C.green : '#E41E3F',
                        border: '2px solid white',
                        boxShadow: online ? '0 0 4px rgba(49,162,76,0.6)' : '0 0 4px rgba(228,30,63,0.4)',
                    }}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MESSAGE INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

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

    // Long-press state for thumbs-up button (emoji picker on hold)
    const thumbsLongPress = useRef(null);
    const thumbsTouchMoved = useRef(false);
    const didLongPress = useRef(false); // Prevents onClick from firing after long-press opens emoji picker

    const handleSend = () => {
        if (!text.trim()) return;
        onSend(text.trim());
        setText('');
        setShowEmoji(false);
        // P6: Haptic feedback on message send
        if (navigator.vibrate) navigator.vibrate(15);
        inputRef.current?.focus();
        // P7: Reset textarea height after send
        if (inputRef.current) inputRef.current.style.height = 'auto';
    };

    // Send thumbs up as a quick message (only if long-press didn't fire)
    const handleThumbsUp = () => {
        if (didLongPress.current) { didLongPress.current = false; return; }
        onSend('👍');
        if (navigator.vibrate) navigator.vibrate(15);
    };

    // Long-press on thumbs-up opens emoji picker
    const handleThumbsTouchStart = () => {
        thumbsTouchMoved.current = false;
        didLongPress.current = false;
        thumbsLongPress.current = setTimeout(() => {
            if (!thumbsTouchMoved.current) {
                didLongPress.current = true;
                setShowEmoji(true);
                setShowGifPicker(false);
                if (navigator.vibrate) navigator.vibrate(30);
            }
        }, 400);
    };
    const handleThumbsTouchMove = () => {
        thumbsTouchMoved.current = true;
        if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; }
    };
    const handleThumbsTouchEnd = () => {
        if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleChange = (e) => {
        setText(e.target.value);
        // P7: Auto-grow textarea
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
        }
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
            console.error('GIF load error:', e);
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
                console.error('GIF search error:', e);
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
            alignItems: 'flex-end',
            gap: 8,
            position: 'relative',
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
                <textarea
                    ref={inputRef}
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Aa"
                    disabled={disabled}
                    rows={1}
                    style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        padding: '10px 0',
                        fontSize: 15,
                        outline: 'none',
                        color: '#050505',
                        resize: 'none',
                        overflow: 'hidden',
                        lineHeight: 1.4,
                        maxHeight: 120,
                        fontFamily: 'inherit',
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

                {/* C4 FIX: Emoji picker with larger mobile touch targets */}
                {showEmoji && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: 8,
                        background: C.card,
                        borderRadius: 12,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        padding: 10,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 6,
                        zIndex: 100,
                        minWidth: 200,
                    }}>
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => { setText(prev => prev + emoji); setShowEmoji(false); if (navigator.vibrate) navigator.vibrate(10); }}
                                style={{
                                    width: 44, height: 44, border: 'none', borderRadius: 10,
                                    background: 'transparent', cursor: 'pointer', fontSize: 24,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.15s',
                                }}
                                onTouchStart={e => e.currentTarget.style.background = C.hoverBg}
                                onTouchEnd={e => e.currentTarget.style.background = 'transparent'}
                            >{emoji}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* Send button OR thumbs-up button */}
            {text.trim() ? (
                <button
                    onClick={handleSend}
                    style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: C.blue,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        flexShrink: 0,
                    }}
                    title="Send Message"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                        <path d="M2 21l21-9L2 3v7l15 2-15 2z" fill="white" />
                    </svg>
                </button>
            ) : (
                <button
                    onClick={handleThumbsUp}
                    onTouchStart={handleThumbsTouchStart}
                    onTouchMove={handleThumbsTouchMove}
                    onTouchEnd={handleThumbsTouchEnd}
                    onMouseDown={() => {
                        didLongPress.current = false;
                        thumbsLongPress.current = setTimeout(() => {
                            didLongPress.current = true;
                            setShowEmoji(true);
                            setShowGifPicker(false);
                        }, 400);
                    }}
                    onMouseUp={() => { if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; } }}
                    style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        flexShrink: 0,
                        fontSize: 22,
                        transition: 'transform 0.15s',
                    }}
                    title="Tap to send 👍 — Hold for emoji picker"
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; if (thumbsLongPress.current) { clearTimeout(thumbsLongPress.current); thumbsLongPress.current = null; } }}>
                    👍
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Toast({ toast, onDismiss }) {
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => onDismiss(), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast, onDismiss]);

    if (!toast) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 130,
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? C.red : toast.type === 'success' ? C.green : C.blue,
            color: 'white',
            padding: '12px 24px',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: '90vw',
        }}>
            <span>{toast.type === 'error' ? '!' : toast.type === 'success' ? '>' : 'i'}</span>
            <span>{toast.message}</span>
            <button
                onClick={onDismiss}
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', marginLeft: 8 }}
            >×</button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ⌨️ TYPING INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function TypingIndicator({ name }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            color: C.textSec,
            fontSize: 13,
        }}>
            <div style={{ display: 'flex', gap: 3 }}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', background: C.textSec,
                        animation: `bounce 1.4s infinite ${i * 0.2}s`,
                    }} />
                ))}
            </div>
            <span>{name} is typing...</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 💀 SKELETON LOADING COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function ConversationSkeleton({ count = 6 }) {
    return (
        <div style={{ padding: '8px 0' }}>
            {Array.from({ length: count }).map((_, i) => {
                const nameW = 100 + ((i * 37) % 60);
                const prevW = 140 + ((i * 53) % 80);
                return (
                <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                }}>
                    {/* Avatar skeleton */}
                    <div style={{
                        width: 50, height: 50, borderRadius: '50%',
                        background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s infinite',
                        flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                        {/* Name skeleton */}
                        <div style={{
                            width: nameW, height: 14, borderRadius: 7,
                            background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s infinite',
                            marginBottom: 8,
                        }} />
                        {/* Message preview skeleton */}
                        <div style={{
                            width: prevW, height: 12, borderRadius: 6,
                            background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s infinite',
                        }} />
                    </div>
                </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 😀 EMOJI PICKER PANEL
// ═══════════════════════════════════════════════════════════════════════════

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🎯', '💎', '♠️', '♥️'];

// EmojiPickerPanel removed — reaction picker is inline in MessageBubble

// ═══════════════════════════════════════════════════════════════════════════
// 📭 EMPTY CONVERSATION STATE
// ═══════════════════════════════════════════════════════════════════════════

function EmptyConversationState() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '60px 24px', textAlign: 'center',
        }}>
            <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: `linear-gradient(135deg, ${C.blue}22, ${C.blue}11)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, marginBottom: 20,
                border: `2px dashed ${C.blue}44`,
            }}>💬</div>
            <h3 style={{ margin: '0 0 8px', color: C.text, fontSize: 18, fontWeight: 600 }}>
                No Conversations Yet
            </h3>
            <p style={{ margin: '0 0 20px', color: C.textSec, fontSize: 14, lineHeight: 1.5 }}>
                Add friends and start chatting! Your poker network is waiting.
            </p>
            <Link href="/hub/friends" style={{
                padding: '10px 24px', background: C.blue,
                color: 'white', borderRadius: 20,
                fontWeight: 600, fontSize: 14,
                textDecoration: 'none',
                transition: 'opacity 0.2s',
            }}>Find Friends</Link>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 FAVICON BADGE UTILITY
// ═══════════════════════════════════════════════════════════════════════════

// P4 FIX: Reuse cached favicon image to prevent DOM/memory leak
let _faviconImg = null;
function updateFaviconBadge(count) {
    if (typeof document === 'undefined') return;
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    
    if (count <= 0) {
        link.href = '/favicon.ico';
        document.head.appendChild(link);
        return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    // Reuse cached image to avoid repeated Image() allocations
    if (!_faviconImg) {
        _faviconImg = new window.Image();
        _faviconImg.src = '/favicon.ico';
    }
    
    const draw = () => {
        ctx.drawImage(_faviconImg, 0, 0, 32, 32);
        ctx.beginPath();
        ctx.arc(24, 8, 9, 0, 2 * Math.PI);
        ctx.fillStyle = '#E41E3F';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(count > 9 ? '9+' : String(count), 24, 8.5);
        link.href = canvas.toDataURL('image/png');
        document.head.appendChild(link);
    };
    
    if (_faviconImg.complete) draw();
    else _faviconImg.onload = draw;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 LINK PREVIEW DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function MessageContent({ content }) {
    if (!content || typeof content !== 'string') return <span>{content}</span>;

    // GIF message: [GIF](url)
    const gifMatch = content.match(/^\[GIF\]\((.+?)\)$/);
    if (gifMatch) {
        return (
            <img
                src={gifMatch[1]}
                alt="GIF"
                style={{ maxWidth: 260, maxHeight: 260, borderRadius: 8, display: 'block' }}
                loading="lazy"
            />
        );
    }

    // Forwarded message prefix
    const isForwarded = content.startsWith('[Forwarded] ');
    const displayContent = isForwarded ? content.slice(12) : content;
    
    const parts = displayContent.split(URL_REGEX);
    if (parts.length === 1 && !isForwarded) return <span>{content}</span>;
    
    return (
        <span>
            {isForwarded && <span style={{ display: 'block', fontSize: 11, color: '#58a6ff', marginBottom: 4, fontStyle: 'italic' }}>Forwarded</span>}
            {parts.map((part, i) => {
                URL_REGEX.lastIndex = 0; // Reset BEFORE test to prevent alternate-skip
                if (URL_REGEX.test(part)) {
                    return (
                        <a
                            key={i}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: '#58a6ff',
                                textDecoration: 'underline',
                                wordBreak: 'break-all',
                            }}
                        >{part}</a>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════


function MessageBubble({ message, isOwn, showAvatar, sender, showTime, isLastInGroup, onRetry, onReact, onDelete, onEdit, onForward, onCallBack, currentUserId }) {
    const senderIsVip = sender?.is_vip || false;
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [reactions, setReactions] = useState(message.reactions || []);
    const status = message.status || 'sent';
    // C3 FIX: Long-press support for mobile touch devices
    const longPressTimer = useRef(null);
    const touchMoved = useRef(false);

    const handleTouchStart = (e) => {
        touchMoved.current = false;
        longPressTimer.current = setTimeout(() => {
            if (!touchMoved.current) {
                setShowReactions(true);
                // P6: Haptic feedback on long press
                if (navigator.vibrate) navigator.vibrate(30);
            }
        }, 400); // 400ms long press threshold
    };

    const handleTouchMove = () => {
        touchMoved.current = true;
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    // Dismiss reaction picker and context menu when clicking/tapping outside
    useEffect(() => {
        if (!showReactions && !showMenu) return;
        const dismiss = () => { setShowReactions(false); setShowMenu(false); };
        // Delay to avoid the triggering touch/click from immediately dismissing
        const t = setTimeout(() => document.addEventListener('click', dismiss), 50);
        return () => { clearTimeout(t); document.removeEventListener('click', dismiss); };
    }, [showReactions, showMenu]);

    const StatusIcon = () => {
        if (!isOwn) return null;
        if (status === 'sending') return <span style={{ opacity: 0.7, fontSize: 10 }}>○</span>;
        if (status === 'failed') return (
            <span
                onClick={() => onRetry?.(message)}
                style={{ color: '#E41E3F', fontSize: 10, cursor: 'pointer' }}
                title="Failed - Tap To Retry"
            >⚠</span>
        );
        if (status === 'read' || message.is_read) {
            return <span style={{ color: '#0084FF', fontSize: 10 }} title="Read">{'\u2713\u2713'}</span>;
        }
        // Delivered/sent
        return <span style={{ color: '#31A24C', fontSize: 10 }} title="Delivered">{'\u2713'}</span>;
    };

    const handleReaction = async (emoji) => {
        // Optimistic update
        const hasReaction = reactions.some(r => r.reaction === emoji && r.user_id === currentUserId);
        if (hasReaction) {
            setReactions(prev => prev.filter(r => !(r.reaction === emoji && r.user_id === currentUserId)));
        } else {
            setReactions(prev => [...prev, { reaction: emoji, user_id: currentUserId }]);
        }
        setShowReactions(false);
        // P6: Haptic feedback on reaction
        if (navigator.vibrate) navigator.vibrate(15);

        // Call parent handler for DB persistence
        if (onReact) {
            await onReact(message.id, emoji);
        }
    };


    // Note: Delete is handled inline via the context menu buttons below,
    // which call onDelete(message.id, 'for_me'|'for_everyone') directly.

    // Group reactions by emoji
    const groupedReactions = reactions.reduce((acc, r) => {
        acc[r.reaction] = (acc[r.reaction] || 0) + 1;
        return acc;
    }, {});

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: isOwn ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: 8,
                marginBottom: isLastInGroup ? 16 : 2,
                paddingLeft: isOwn ? 60 : 12,
                paddingRight: isOwn ? 12 : 60,
                opacity: status === 'sending' ? 0.7 : 1,
                position: 'relative',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Avatar */}
            {!isOwn && (
                showAvatar ? (
                    <Avatar src={sender?.avatar_url} name={sender?.username} size={28} showOnline={false} />
                ) : (
                    <div style={{ width: 28 }} />
                )
            )}

            {/* Bubble with reactions */}
            <div style={{ position: 'relative', maxWidth: '70%' }}>
                {/* Reaction picker — long-press activated, appears ABOVE the bubble */}
                {showReactions && status !== 'sending' && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: isOwn ? 'auto' : 0,
                        right: isOwn ? 0 : 'auto',
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        background: C.card,
                        borderRadius: 24,
                        padding: '6px 8px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        zIndex: 50,
                        animation: 'reactionPopIn 0.18s ease-out',
                    }}>
                        {REACTION_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={(e) => { e.stopPropagation(); handleReaction(emoji); }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: 22,
                                    padding: '4px 5px',
                                    borderRadius: 8,
                                    transition: 'transform 0.15s, background 0.15s',
                                    lineHeight: 1,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.35)'; e.currentTarget.style.background = C.hoverBg; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'transparent'; }}
                            >{emoji}</button>
                        ))}
                        {/* Context menu trigger */}
                        <>
                            <div style={{ width: 1, height: 24, background: C.border, margin: '0 2px' }} />
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                    padding: '4px 6px',
                                    color: C.textSec,
                                    borderRadius: 8,
                                }}
                            >⋯</button>
                        </>
                    </div>
                )}

                {/* Context menu for own messages */}
                {showMenu && (
                    <div style={{
                        position: 'absolute',
                        [isOwn ? 'left' : 'right']: '100%',
                        top: '100%',
                        marginLeft: isOwn ? 0 : 4,
                        background: C.card,
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        overflow: 'hidden',
                        zIndex: 20,
                        minWidth: 180,
                    }}>
                        {/* Copy to clipboard */}
                        {!message.is_deleted && (
                            <button
                                onClick={() => {
                                    const text = message.content || message.text || '';
                                    navigator.clipboard?.writeText(text).then(() => {
                                        if (navigator.vibrate) navigator.vibrate(10);
                                    }).catch(() => {});
                                    setShowMenu(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '10px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    color: C.text,
                                    fontSize: 14,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >Copy Text</button>
                        )}
                        <button
                            onClick={() => {
                                onDelete(message.id, 'for_me');
                                setShowMenu(false);
                            }}
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '10px 16px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                color: C.text,
                                fontSize: 14,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Delete For Me</button>
                        {isOwn && !message.is_deleted && (Date.now() - new Date(message.created_at).getTime()) < 300000 && (
                            <button
                                onClick={() => {
                                    onEdit?.(message);
                                    setShowMenu(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '10px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    color: C.text,
                                    fontSize: 14,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >Edit Message</button>
                        )}
                        {!message.is_deleted && (
                            <button
                                onClick={() => {
                                    onForward?.(message);
                                    setShowMenu(false);
                                }}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '10px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    color: C.blue,
                                    fontSize: 14,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >Forward</button>
                        )}
                        {isOwn && (
                        <button
                            onClick={() => {
                                onDelete(message.id, 'for_everyone');
                                setShowMenu(false);
                            }}
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '10px 16px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                color: C.red,
                                fontSize: 14,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Delete For Everyone</button>
                        )}
                    </div>
                )}

                <div style={{
                    padding: '8px 12px',
                    borderRadius: 18,
                    background: isOwn ? C.ownBubble : (senderIsVip ? 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,215,0,0.03))' : C.otherBubble),
                    color: isOwn ? 'white' : C.text,
                    fontSize: 15,
                    lineHeight: 1.4,
                    borderBottomRightRadius: isOwn && !isLastInGroup ? 4 : 18,
                    borderBottomLeftRadius: !isOwn && !isLastInGroup ? 4 : 18,
                    wordBreak: 'break-word',
                    overflow: 'hidden',
                    ...(senderIsVip && !isOwn ? {
                        borderLeft: '3px solid #FFD700',
                        boxShadow: '0 0 6px rgba(255,215,0,0.15)',
                    } : {}),
                }}>
                    {/* Render media content (images/videos) */}
                    {(() => {
                        const content = message.content || message.text || '';

                        // Check for call receipt: [CALL_RECEIPT]{"type":"video","duration":135,"status":"completed"}
                        if (content.startsWith('[CALL_RECEIPT]')) {
                            const raw = content.replace('[CALL_RECEIPT]', '');
                            // Parse structured JSON or fall back to legacy plain text
                            let receiptData = null;
                            try {
                                receiptData = JSON.parse(raw);
                            } catch (_) {
                                // Legacy format: "Voice call - 2m 15s"
                                receiptData = { type: raw.toLowerCase().includes('video') ? 'video' : 'voice', status: 'completed', duration: 0, legacyText: raw };
                            }
                            const st = receiptData.status || 'completed';
                            const tp = receiptData.type || 'voice';
                            const dur = receiptData.duration || 0;
                            const isVideo = tp === 'video';
                            const icon = isVideo ? '📹' : '📞';

                            // Duration string
                            let durationStr = '';
                            if (dur > 0) {
                                durationStr = dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`;
                            }

                            // Status-based styling
                            const statusConfig = {
                                completed: { color: '#4caf50', bg: 'rgba(76,175,80,0.1)', label: `${isVideo ? 'Video' : 'Voice'} Call`, sublabel: durationStr },
                                missed: { color: '#f44336', bg: 'rgba(244,67,54,0.1)', label: `Missed ${isVideo ? 'Video' : 'Voice'} Call`, sublabel: '' },
                                declined: { color: '#9e9e9e', bg: 'rgba(158,158,158,0.08)', label: `${isVideo ? 'Video' : 'Voice'} Call Declined`, sublabel: '' },
                                cancelled: { color: '#9e9e9e', bg: 'rgba(158,158,158,0.08)', label: `${isVideo ? 'Video' : 'Voice'} Call Cancelled`, sublabel: '' },
                            };
                            const cfg = statusConfig[st] || statusConfig.completed;

                            return (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 14px', borderRadius: 14,
                                    background: cfg.bg, margin: '-4px -8px',
                                    border: `1px solid ${cfg.color}22`,
                                }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: `${cfg.color}22`, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', fontSize: 18,
                                        flexShrink: 0,
                                    }}>
                                        {st === 'missed' ? <span style={{ color: cfg.color, fontSize: 20 }}>↩</span> : icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: cfg.color }}>
                                            {receiptData.legacyText || cfg.label}
                                        </div>
                                        {(cfg.sublabel || receiptData.legacyText) && (
                                            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                                {receiptData.legacyText ? '' : cfg.sublabel}
                                            </div>
                                        )}
                                    </div>
                                    {st === 'missed' && !isOwn && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCallBack?.(tp === 'video' ? 'video' : 'audio'); }}
                                            style={{
                                                background: '#4caf50', color: 'white', border: 'none',
                                                borderRadius: 20, padding: '6px 14px', fontSize: 12,
                                                fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                                            }}
                                        >
                                            Call Back
                                        </button>
                                    )}
                                </div>
                            );
                        }


                        // Check for image markdown: [Image](url) or 📷 [Image](url) - support both
                        const imageMatch = content.match(/(?:📷\s*)?\[Image\]\(([^)]+)\)/);
                        const imageUrl = imageMatch?.[1] || message.media_url;

                        // Check for video markdown: [Video](url) or  [Video](url) - support both
                        const videoMatch = content.match(/(?:\s*)?\[Video\]\(([^)]+)\)/);
                        const videoUrl = videoMatch?.[1];

                        // Check if content is just a direct image/video URL
                        const directImageUrl = content.match(/^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?$/i);
                        const directVideoUrl = content.match(/^https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?$/i);

                        if (imageUrl || directImageUrl) {
                            const url = imageUrl || directImageUrl[0];
                            return (
                                <div style={{ margin: '-8px -12px', borderRadius: 18, overflow: 'hidden' }}>
                                    <img
                                        src={url}
                                        alt="Shared Image"
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: 300,
                                            display: 'block',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => window.open(url, '_blank')}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.insertAdjacentHTML('afterend', '<span>Image Failed To Load</span>');
                                        }}
                                    />
                                </div>
                            );
                        }

                        if (videoUrl || directVideoUrl) {
                            const url = videoUrl || directVideoUrl[0];
                            return (
                                <div style={{ margin: '-8px -12px', borderRadius: 18, overflow: 'hidden' }}>
                                    <video
                                        src={url}
                                        controls
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: 300,
                                            display: 'block',
                                            borderRadius: 12,
                                        }}
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.insertAdjacentHTML('afterend', '<span>Video Failed To Load</span>');
                                        }}
                                    />
                                </div>
                            );
                        }

                        // Regular text content - make URLs clickable
                        // Check if it's a call invite
                        const isCallInvite = (content.includes('Call Started!') && content.includes('smarter-poker'));

                        // Convert URLs to clickable links
                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                        const parts = content.split(urlRegex);

                        return (
                            <div style={isCallInvite ? {
                                background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,132,255,0.1)',
                                padding: 8,
                                borderRadius: 12,
                                margin: '-4px -8px',
                            } : {}}>
                                {parts.map((part, i) => {
                                    urlRegex.lastIndex = 0; // Reset BEFORE test to prevent alternate-skip
                                    if (urlRegex.test(part)) {
                                        return (
                                            <a
                                                key={i}
                                                href={part}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    color: isOwn ? '#90CAF9' : C.blue,
                                                    textDecoration: 'underline',
                                                    wordBreak: 'break-all',
                                                }}
                                            >
                                                {(() => {
                                                    if (part.includes('meet.jit.si')) return '🔗 Join Call';
                                                    try { return new URL(part).hostname.replace('www.', ''); } catch { return part; }
                                                })()}
                                            </a>
                                        );
                                    }
                                    // Preserve newlines
                                    return part.split('\n').map((line, j) => (
                                        <span key={`${i}-${j}`}>
                                            {j > 0 && <br />}
                                            {line}
                                        </span>
                                    ));
                                })}
                            </div>
                        );
                    })()}
                </div>

                {/* Display reactions */}
                {Object.keys(groupedReactions).length > 0 && (
                    <div style={{
                        position: 'absolute',
                        bottom: -8,
                        [isOwn ? 'left' : 'right']: 8,
                        display: 'flex',
                        gap: 2,
                        background: C.card,
                        borderRadius: 10,
                        padding: '2px 4px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                        fontSize: 12,
                    }}>
                        {Object.entries(groupedReactions).map(([emoji, count]) => (
                            <span key={emoji} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {emoji}{count > 1 && <span style={{ fontSize: 10, color: C.textSec }}>{count}</span>}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Time & Status */}
            {showTime && (
                <span style={{
                    fontSize: 11,
                    color: C.textSec,
                    whiteSpace: 'nowrap',
                    alignSelf: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                }}>
                    {message.is_edited && !message.is_deleted && <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Edited · </span>}
                    {formatMessageTime(message.created_at || message.timestamp)}
                    <StatusIcon />
                </span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CONVERSATION LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

function ConversationItem({ conversation, isActive, onClick, currentUserId, onlineUsers, isPinned, onPin, onDelete }) {
    const otherUser = conversation.otherUser || conversation.participants?.find(p => p.id !== currentUserId);
    const lastMsg = conversation.last_message_preview || conversation.lastMessage;
    const isUnread = conversation.unreadCount > 0;
    // Real-time online status from Supabase Presence channel
    const isOtherOnline = onlineUsers?.has?.(otherUser?.id) || false;
    // Conversation context menu (long-press on mobile)
    const [showConvoMenu, setShowConvoMenu] = useState(false);
    const convoLongPress = useRef(null);
    const convoTouchMoved = useRef(false);

    // Close context menu on any click outside
    useEffect(() => {
        if (!showConvoMenu) return;
        const handleClickAway = () => setShowConvoMenu(false);
        // Delay to avoid the initial right-click from immediately closing the menu
        const t = setTimeout(() => document.addEventListener('click', handleClickAway), 50);
        return () => { clearTimeout(t); document.removeEventListener('click', handleClickAway); };
    }, [showConvoMenu]);

    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                cursor: 'pointer',
                background: isActive ? C.hoverBg : 'transparent',
                borderRadius: 8,
                margin: '2px 8px',
                transition: 'background 0.15s',
                position: 'relative',
            }}
            onMouseEnter={e => !isActive && (e.currentTarget.style.background = C.hoverBg)}
            onMouseLeave={e => { !isActive && (e.currentTarget.style.background = 'transparent'); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setShowConvoMenu(true); }}
            onTouchStart={() => {
                convoTouchMoved.current = false;
                convoLongPress.current = setTimeout(() => {
                    if (!convoTouchMoved.current) {
                        setShowConvoMenu(true);
                        if (navigator.vibrate) navigator.vibrate(25);
                    }
                }, 500);
            }}
            onTouchMove={() => { convoTouchMoved.current = true; clearTimeout(convoLongPress.current); }}
            onTouchEnd={() => clearTimeout(convoLongPress.current)}
        >
            {/* Conversation context menu */}
            {showConvoMenu && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 8,
                        background: C.card,
                        borderRadius: 10,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        zIndex: 50,
                        minWidth: 160,
                        overflow: 'hidden',
                    }}
                >
                    <button
                        onClick={() => { onPin?.(conversation.id); setShowConvoMenu(false); }}
                        style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: C.text, fontSize: 14 }}
                        onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >{isPinned ? 'Unpin' : 'Pin To Top'}</button>
                    <button
                        onClick={() => { onDelete?.(conversation.id); setShowConvoMenu(false); }}
                        style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: C.red, fontSize: 14 }}
                        onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >Delete Conversation</button>
                </div>
            )}

            <Avatar
                src={otherUser?.avatar_url}
                name={otherUser?.username || otherUser?.name}
                size={56}
                online={isOtherOnline}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: isUnread ? 600 : 500,
                    fontSize: 15,
                    color: C.text,
                    marginBottom: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                }}>
                    {/* P9: Pin indicator */}
                    {isPinned && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={C.blue} style={{ flexShrink: 0, opacity: 0.7 }}>
                            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                        </svg>
                    )}
                    {otherUser?.username || otherUser?.name || 'Unknown'}
                </div>
                <div style={{
                    fontSize: 13,
                    color: isUnread ? C.text : C.textSec,
                    fontWeight: isUnread ? 500 : 400,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {(() => {
                        // Clean up message preview - strip [CALL_RECEIPT] prefix and parse JSON
                        let preview = lastMsg || '';
                        if (preview.startsWith('[CALL_RECEIPT]')) {
                            const rawReceipt = preview.replace('[CALL_RECEIPT]', '');
                            try {
                                const rd = JSON.parse(rawReceipt);
                                const tp = rd.type === 'video' ? '📹' : '📞';
                                const st = rd.status || 'completed';
                                const dur = rd.duration || 0;
                                const durStr = dur > 0 ? (dur >= 60 ? ` • ${Math.floor(dur / 60)}m ${dur % 60}s` : ` • ${dur}s`) : '';
                                const statusLabel = st === 'completed' ? '' : st === 'missed' ? 'Missed ' : st === 'declined' ? 'Declined ' : 'Cancelled ';
                                preview = `${tp} ${statusLabel}${rd.type === 'video' ? 'Video' : 'Voice'} call${durStr}`;
                            } catch (_) {
                                preview = rawReceipt; // Legacy plain text
                            }
                        }
                        const displayText = preview.slice(0, 35) + (preview.length > 35 ? '...' : '');
                        return displayText;
                    })()}
                    <span style={{ color: C.textSec }}> · {timeAgo(conversation.last_message_at)}</span>
                </div>
            </div>

            {isUnread && (
                <div style={{
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    background: C.blue,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '0 5px',
                }}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SEARCH BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SearchBar({ value, onChange, onSearchUser, searchResults, onSelectUser, inputRef, composing }) {
    return (
        <div style={{ padding: '12px 16px', position: 'relative' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                background: C.bg,
                borderRadius: 24,
                padding: '0 12px',
                border: composing ? `2px solid ${C.blue}` : 'none',
            }}>
                <span style={{ color: C.textSec, marginRight: 8 }}></span>
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={e => { onChange(e.target.value); onSearchUser?.(e.target.value); }}
                    placeholder={composing ? "Type a name to start chatting..." : "Search Messenger"}
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
            </div>

            {/* Search results dropdown */}
            {searchResults?.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 16,
                    right: 16,
                    background: C.card,
                    borderRadius: 12,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    maxHeight: 240,
                    overflowY: 'auto',
                }}>
                    {searchResults.map(user => (
                        <div
                            key={user.id}
                            onClick={() => onSelectUser?.(user)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 16px',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <Avatar src={user.avatar_url} name={user.username} size={40} />
                            <div>
                                <div style={{ fontWeight: 500 }}>{user.username}</div>
                                {user.full_name && <div style={{ fontSize: 13, color: C.textSec }}>{user.full_name}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📱 MAIN MESSENGER PAGE
// ═══════════════════════════════════════════════════════════════════════════

function MessengerPage() {
    // Zustand Global State (replaces UI-related useState)
    const selectedConversation = useMessengerStore((s) => s.selectedConversation);
    const setSelectedConversation = useMessengerStore((s) => s.setSelectedConversation);
    const showNewChat = useMessengerStore((s) => s.showNewChat);
    const setShowNewChat = useMessengerStore((s) => s.setShowNewChat);
    const showSearch = useMessengerStore((s) => s.showSearch);
    const setShowSearch = useMessengerStore((s) => s.setShowSearch);
    const cachedConversations = useMessengerStore((s) => s.conversations);
    const setCachedConversations = useMessengerStore((s) => s.setConversations);
    const hasCachedConversations = useMessengerStore((s) => s.hasCachedConversations);

    // 🚌 EventBus session tracking + DATA_MUTATED listener
    useTrainingBus('messenger');

    // Refresh friends sidebar when friendships change on other pages
    useEffect(() => {
        let debounceTimer = null;
        let mounted = true;
        const unsub = eventBus.on(EventType.DATA_MUTATED, (payload) => {
            if (payload?.entity === 'friends') {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    if (!mounted) return;
                    try {
                        const token = getAccessToken();
                        const resp = await fetch('/api/friends?action=list', {
                            headers: { 'Authorization': 'Bearer ' + token }
                        }).then(r => r.json()).catch(() => ({ data: { friends: [] } }));
                        if (mounted && resp?.data?.friends) setFriends(resp.data.friends);
                    } catch (e) { /* silent */ }
                }, 800);
            }
        });
        return () => { mounted = false; clearTimeout(debounceTimer); unsub(); };
    }, []);

    // Identity switching
    const { isClubMode, clubPage, hasClubPage } = useActiveIdentity();

    // 🛡️ INSTANT AUTH: Initialize user synchronously from localStorage
    // Prevents "Sign In" flash while async profile fetch completes
    const [user, setUser] = useState(() => {
        if (typeof window === 'undefined') return null;
        try {
            const authUser = getAuthUser();
            if (authUser) {
                return {
                    ...authUser,
                    username: authUser.user_metadata?.poker_alias || authUser.email?.split('@')[0],
                    avatar_url: authUser.user_metadata?.avatar_url || null,
                    full_name: authUser.user_metadata?.full_name || null,
                };
            }
        } catch (_) {}
        return null;
    });
    const [loading, setLoading] = useState(!hasCachedConversations());
    const [conversations, setConversations] = useState(cachedConversations);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isMobile, setIsMobile] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [composing, setComposing] = useState(false);
    const [toast, setToast] = useState(null);
    const [isTyping, setIsTyping] = useState(false);
    const [otherTyping, setOtherTyping] = useState(false);
    // New enhanced features
    const [messageSearchQuery, setMessageSearchQuery] = useState('');
    const [messageSearchResults, setMessageSearchResults] = useState([]);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [friends, setFriends] = useState([]); // Friends list for quick access
    // Jitsi Call State
    const [showCall, setShowCall] = useState(false);
    const [callType, setCallType] = useState('video'); // 'audio' or 'video'
    const [callRoomName, setCallRoomName] = useState('');
    const [showUserInfo, setShowUserInfo] = useState(false);
    const [showPushPrompt, setShowPushPrompt] = useState(false);
    const [pushPromptHandled, setPushPromptHandled] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('messenger_push_prompt_handled') === '1';
        }
        return false;
    });
    // Editing State
    const [editingMessage, setEditingMessage] = useState(null); // message being edited
    const [editText, setEditText] = useState('');
    // Forward State
    const [forwardingMessage, setForwardingMessage] = useState(null); // message to forward
    // Online Presence
    const [otherUserStatus, setOtherUserStatus] = useState('offline'); // 'online' | 'away' | 'offline'
    const [otherUserLastSeen, setOtherUserLastSeen] = useState(null);
    // Pinned Conversations
    const [pinnedConvoIds, setPinnedConvoIds] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('sp-pinned-conversations') || '[]');
        } catch { return []; }
    });
    // Hidden messages (delete-for-me persistence)
    const [hiddenMessageIds] = useState(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]'));
        } catch { return new Set(); }
    });
    // Incoming Call State (for seamless calling like Snapchat/WhatsApp)
    const [incomingCall, setIncomingCall] = useState(null); // { callerId, callerName, callerAvatar, callType, roomName }
    const [callingUser, setCallingUser] = useState(null); // Track who we're calling
    const [isVip, setIsVip] = useState(false); // VIP status for Jarvis daily limits
    const incomingCallAudioRef = useRef(null);
    // outgoingCallAudioRef removed - using Web Audio API createRingTone() instead
    const outgoingRingToneRef = useRef(null); // Web Audio API ring tone (more reliable)
    const callTimeoutRef = useRef(null);
    const callStartTimeRef = useRef(null); // Track call start for duration
    // BUG-3 FIX: Refs to avoid stale closures in long-lived Realtime signaling listener
    const showCallRef = useRef(false);
    const callingUserRef = useRef(null);

    // Hamburger Menu State
    const [menuOpen, setMenuOpen] = useState(false);
    const [preferences, setPreferences] = useState({
        notifications: true,
        readReceipts: true,
        activeStatus: true,
        messageSounds: true
    });
    // Ref mirror of preferences to avoid stale closures in long-lived WebSocket callbacks
    const preferencesRef = useRef(preferences);
    useEffect(() => { preferencesRef.current = preferences; setSoundPrefsRef(preferences); }, [preferences]);
    // Phase 3: Connection status state
    const [connectionStatus, setConnectionStatus] = useState('connected'); // 'connected' | 'reconnecting' | 'disconnected'
    // Phase 3: Scroll-to-bottom FAB state
    const [showScrollDown, setShowScrollDown] = useState(false);

    // OneSignal Push Notifications
    const { isInitialized: pushReady, isSubscribed: pushSubscribed, subscribe: subscribePush, setExternalUserId } = useOneSignal();

    // Load preferences from service (localStorage + Supabase)
    useEffect(() => {
        messengerPreferences.get(user?.id).then(prefs => {
            setPreferences(prefs);
        });
    }, [user]);

    // Preference update handler with Supabase sync
    const updatePreference = async (key, value) => {
        const updated = { ...preferences, [key]: value };
        setPreferences(updated);
        await messengerPreferences.update(user?.id, { [key]: value });

        // 📲 PUSH NOTIFICATIONS: Hook toggle into OneSignal subscribe/unsubscribe
        if (key === 'notifications') {
            if (value && pushReady && subscribePush) {
                try {
                    await subscribePush();
                    setToast({ type: 'success', message: 'Push Notifications Enabled' });
                } catch (e) {
                    console.error('[Messenger] Push subscribe error:', e);
                }
            } else if (!value && pushReady) {
                // Note: OneSignal doesn't have a direct unsubscribe in the hook,
                // but disabling the preference stops sound + visual notifications
                setToast({ type: 'info', message: 'Notifications Disabled' });
            }
        }
    };

    // Global unread count for header badge - refresh after reading messages
    const { refreshUnread } = useUnreadCount();

    const messagesEndRef = useRef(null);
    const searchTimeout = useRef(null);
    const searchInputRef = useRef(null);
    const typingTimeout = useRef(null);
    const messageSearchTimeout = useRef(null);
    const activeConversationRef = useRef(null);
    const profileCacheRef = useRef(new Map()); // Cache sender profiles to avoid repeated fetches
    const messagesContainerRef = useRef(null); // Scroll container for pagination position preservation

    // Keep ref in sync so global RT channel can read it without re-subscribing
    useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);
    // DEEP-SWEEP FIX: callTypeRef prevents stale closure in broadcast handlers
    const callTypeRef = useRef(callType);
    useEffect(() => { callTypeRef.current = callType; }, [callType]);

    // Menu config with handlers
    const menuConfig = getMenuConfig('messenger', user, preferences, {
        setNotifications: (val) => updatePreference('notifications', val),
        setReadReceipts: (val) => updatePreference('readReceipts', val),
        setActiveStatus: (val) => updatePreference('activeStatus', val),
        setMessageSounds: (val) => updatePreference('messageSounds', val)
    });

    // Check for mobile
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Phase 3: Keyboard shortcuts (Escape closes panels)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showUserInfo) { setShowUserInfo(false); return; }
                if (showMessageSearch) { setShowMessageSearch(false); return; }
                if (forwardingMessage) { setForwardingMessage(null); return; }
                if (editingMessage) { setEditingMessage(null); setEditText(''); return; }
                if (menuOpen) { setMenuOpen(false); return; }
                // On mobile, Escape navigates back to sidebar
                if (isMobile && activeConversation) { setActiveConversation(null); setShowSidebar(true); return; }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showUserInfo, showMessageSearch, forwardingMessage, editingMessage, menuOpen, isMobile, activeConversation]);

    // Phase 3: Connection status monitor (navigator.onLine + Supabase health)
    useEffect(() => {
        const goOnline = () => setConnectionStatus('connected');
        const goOffline = () => setConnectionStatus('disconnected');
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        if (!navigator.onLine) setConnectionStatus('disconnected');
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);


    // Load user and conversations — PARALLEL init with cache-first render
    useEffect(() => {
        async function init() {
            try {
                // BULLETPROOF: Use authUtils instead of getSafeUser (avoids AbortError)
                let authUser = getAuthUser();

                // FALLBACK: If sync localStorage check fails, try async session check
                // This catches browser restarts, stale tabs, and token refresh scenarios
                if (!authUser) {
                    try {
                        authUser = await ensureAuthReady(supabase);
                    } catch (_) {
                        // Session check failed — user is genuinely not logged in
                    }
                }

                if (authUser) {
                    const token = getAccessToken();
                    const headers = { 'Authorization': 'Bearer ' + token };

                    // PARALLEL: Fire all 3 independent API calls at once
                    const [profileResult, convoResult, friendsResult] = await Promise.allSettled([
                        // 1. Profile
                        fetch('/api/user/get-header-stats', {
                            method: 'POST',
                            headers: { ...headers, 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        }).then(r => r.json()).catch(() => ({})),
                        // 2. Conversations
                        loadConversations(authUser.id),
                        // 3. Friends
                        fetch('/api/friends?action=list', { headers })
                            .then(r => r.json()).catch(() => ({ data: { friends: [] } }))
                    ]);

                    // Process profile
                    const profileResp = profileResult.status === 'fulfilled' ? profileResult.value : {};
                    const prof = profileResp?.profile || {};
                    setUser({
                        ...authUser,
                        username: prof.username || authUser.email?.split('@')[0],
                        avatar_url: prof.avatar_url,
                        full_name: prof.full_name,
                        is_vip: prof.is_vip
                    });
                    setIsVip(!!prof.is_vip);

                    // Process friends
                    const friendsResp = friendsResult.status === 'fulfilled' ? friendsResult.value : {};
                    if (friendsResp?.data?.friends) {
                        setFriends(friendsResp.data.friends);
                    }
                }
            } catch (e) {
                console.error('Init error:', e);
            }
            setLoading(false);
        }
        init();
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════
    // PROFILE SYNC: Update local user state when profile is edited
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        let debounceTimer = null;
        const handleProfileUpdated = (e) => {
            // OPTIMISTIC: Instant UI update from event.detail (no network needed)
            const d = e?.detail;
            if (d && (d.full_name || d.avatar_url || d.username)) {
                setUser(prev => ({
                    ...prev,
                    ...(d.full_name ? { full_name: d.full_name } : {}),
                    ...(d.username ? { username: d.username } : {}),
                    ...(d.avatar_url ? { avatar_url: d.avatar_url } : {}),
                }));
            }
            // VERIFY: Debounced fetch confirms and fills remaining fields
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    const authUser = getAuthUser();
                    if (!authUser) return;
                    const token = getAccessToken();
                    const resp = await fetch('/api/user/get-header-stats', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({})
                    }).then(r => r.json()).catch(() => ({}));
                    const p = resp?.profile;
                    if (p?.username || p?.avatar_url) {
                        setUser(prev => ({
                            ...prev,
                            username: p.username || prev?.username,
                            avatar_url: p.avatar_url ?? prev?.avatar_url,
                            full_name: p.full_name || prev?.full_name,
                        }));
                    }
                } catch { /* non-critical */ }
            }, 300);
        };

        window.addEventListener('profile-updated', handleProfileUpdated);

        // Cross-tab: BroadcastChannel avatar sync
        let avatarBc = null;
        try {
            avatarBc = new BroadcastChannel('smarter_poker_avatar_sync');
            avatarBc.onmessage = () => handleProfileUpdated();
        } catch { /* BroadcastChannel not supported */ }

        return () => {
            clearTimeout(debounceTimer);
            window.removeEventListener('profile-updated', handleProfileUpdated);
            if (avatarBc) avatarBc.close();
        };
    }, []);

    //  MULTI-DEVICE RESILIENCE: Listen for auth changes from ANY device
    // This handles: token refresh, login from another device, session recovery
    useEffect(() => {
        const cleanup = createMultiDeviceAuthListener(supabase, async (authUser, event) => {

            if (!authUser) {
                // User signed out - clear state
                setUser(null);
                setConversations([]);
                setMessages([]);
                setActiveConversation(null);
                return;
            }

            // User is authenticated (from any device) - ensure we have latest data
            if (authUser.id !== user?.id || event === 'TOKEN_REFRESHED') {
                // Update user state
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, is_vip')
                    .eq('id', authUser.id)
                    .maybeSingle();

                setUser({ ...authUser, ...(profile || {}) });
                setIsVip(!!profile?.is_vip);

                // Reload conversations (uses API-first approach, resilient to RLS)
                await loadConversations(authUser.id);
            }
        }, 500); // 500ms debounce to handle rapid token events

        return cleanup;
    }, [user?.id]); // Re-subscribe if user changes

    // Check for pending calls when messenger opens (for users coming from push notification)
    useEffect(() => {
        if (!user?.id) return;

        const ac = new AbortController();

        async function checkPendingCalls(signal) {
            try {
                const pendingToken = getAccessToken();
                const res = await fetch(`/api/calls/pending?userId=${user.id}`, {
                    headers: pendingToken ? { Authorization: `Bearer ${pendingToken}` } : {},
                    signal,
                });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const result = await res.json();

                if (result.success && result.pendingCall) {
                    const call = result.pendingCall;

                    // Show incoming call UI
                    setIncomingCall({
                        callerId: call.callerId,
                        callerName: call.callerName,
                        callerAvatar: call.callerAvatar,
                        callType: call.callType,
                        roomName: call.roomName,
                        pendingCallId: call.id, // Store ID for cleanup
                    });

                    // Play incoming call sound
                    if (incomingCallAudioRef.current) {
                        incomingCallAudioRef.current.loop = true;
                        incomingCallAudioRef.current.play().catch(() => { });
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.error('[Pending calls]', e);
            }
        }

        checkPendingCalls(ac.signal);
        return () => ac.abort();
    }, [user?.id]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 📡 GLOBAL Background Listener: Listen for messages in ANY conversation (to update sidebar/badges)
    // Uses activeConversationRef instead of state to avoid re-subscribing on every conversation switch
    useEffect(() => {
        if (!user?.id) return;
        
        const channel = supabase.channel('global_messenger_changes')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_messages'
            }, async (payload) => {
                const newMsg = payload.new;
                // Ignore our own messages
                if (newMsg.sender_id === user.id) return;
                
                // Fire global event bus so the badge universally updates everywhere
                if (typeof window !== 'undefined' && eventBus) {
                    eventBus.emit(EventType.MESSAGE_RECEIVED, { conversationId: newMsg.conversation_id, senderId: newMsg.sender_id }, 'FullMessenger');
                }

                // Read activeConversation from ref (stable — no re-subscribe on switch)
                const currentActive = activeConversationRef.current;

                // If it's NOT the active conversation, we need to manually update the conversation sidebar
                if (!currentActive || currentActive.id !== newMsg.conversation_id) {
                    // Only play sound if user has message sounds enabled (read from ref to avoid stale closure)
                    if (preferencesRef.current.messageSounds !== false) playMessageSound();
                    
                    setConversations(prev => {
                        const exists = prev.find(c => c.id === newMsg.conversation_id);
                        let updated;
                        if (exists) {
                            updated = prev.map(c => 
                                c.id === newMsg.conversation_id 
                                    ? { ...c, last_message_preview: newMsg.content, last_message_at: newMsg.created_at, unreadCount: (c.unreadCount || 0) + 1 }
                                    : c
                            );
                        } else {
                            // Ideally fetch the new conversation details here, but for now just skip creating a ghost thread
                            return prev;
                        }
                        
                        return updated.sort((a, b) => {
                            const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                            const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                            return timeB - timeA;
                        });
                    });
                }
            })
            .subscribe((status) => {
                // Phase 3 BUGFIX: Wire channel status into connectionStatus
                if (status === 'SUBSCRIBED') setConnectionStatus('connected');
                else if (status === 'CHANNEL_ERROR') setConnectionStatus('disconnected');
                else if (status === 'TIMED_OUT') setConnectionStatus('reconnecting');
            });

        return () => supabase.removeChannel(channel);
    }, [user?.id]);

    // Subscribe to real-time messages for ACTIVE conversation
    useEffect(() => {
        if (!user || !activeConversation) return;

        const channel = supabase
            .channel(`conversation:${activeConversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, async (payload) => {
                const newMsg = payload.new;
                // Skip if this is our own message (already added via optimistic update)
                if (newMsg.sender_id === user.id) return;

                // Play sound for incoming message (respect preferences — read from ref to avoid stale closure)
                if (preferencesRef.current.messageSounds !== false) playMessageSound();

                // Fetch sender profile (cached to avoid N queries for same sender)
                let profile = profileCacheRef.current.get(newMsg.sender_id);
                if (!profile) {
                    const { data } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url, is_vip')
                        .eq('id', newMsg.sender_id)
                        .maybeSingle();
                    profile = data;
                    if (profile) profileCacheRef.current.set(newMsg.sender_id, profile);
                }

                setMessages(prev => {
                    // Check for duplicates
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, { ...newMsg, profiles: profile || null }];
                });

                // Update conversation preview and re-sort to move to top
                setConversations(prev => {
                    const updated = prev.map(c =>
                        c.id === activeConversation.id
                            ? { ...c, last_message_preview: newMsg.content, last_message_at: newMsg.created_at }
                            : c
                    );
                    // Re-sort by last_message_at (most recent first)
                    return updated.sort((a, b) => {
                        const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                        const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                        return timeB - timeA;
                    });
                });
            })
            // Real-time UPDATE — catches edits, delete-for-everyone, and reactions
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'social_messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, (payload) => {
                const updatedMsg = payload.new;
                setMessages(prev => prev.map(m => {
                    if (m.id !== updatedMsg.id) return m;
                    // Detect real edit: content changed AND message not deleted
                    const wasEdited = m.is_edited || (updatedMsg.content !== m.content && !updatedMsg.is_deleted);
                    return { ...m, content: updatedMsg.content, is_deleted: updatedMsg.is_deleted, updated_at: updatedMsg.updated_at, is_edited: wasEdited };
                }));
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [user, activeConversation]);

    // Typing indicator broadcast
    const typingTimerRef = useRef(null);
    useEffect(() => {
        if (!user || !activeConversation) return;

        const typingChannel = supabase
            .channel(`typing:${activeConversation.id}`)
            .on('broadcast', { event: 'typing' }, (payload) => {
                // Someone else is typing
                if (payload.payload.userId !== user.id) {
                    setOtherTyping(true);
                    // Clear previous timer to prevent accumulation
                    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                    typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3000);
                }
            })
            .on('broadcast', { event: 'read_receipt' }, (payload) => {
                // Other user read our messages — update ✓✓ checkmarks in real-time
                if (payload.payload.readerId !== user.id) {
                    setMessages(prev => prev.map(m =>
                        m.sender_id === user.id ? { ...m, is_read: true, status: 'read' } : m
                    ));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(typingChannel);
            // Clean up any pending typing timeout on conversation switch
            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
                typingTimerRef.current = null;
            }
            setOtherTyping(false);
        };
    }, [user, activeConversation]);

    // ═══════════════════════════════════════════════════════════════════════════
    // 📞 CALL SIGNALING VIA SUPABASE REALTIME
    // Listen for incoming calls, call accepted/declined, call ended
    // BUG-3 FIX: Use refs for showCall/callingUser to avoid channel teardown on state changes
    // ═══════════════════════════════════════════════════════════════════════════
    // Keep refs in sync with state (prevents stale closures in broadcast handlers)
    useEffect(() => { showCallRef.current = showCall; }, [showCall]);
    useEffect(() => { callingUserRef.current = callingUser; }, [callingUser]);

    useEffect(() => {
        if (!user) return;

        const callChannel = supabase
            .channel(`call-signal:${user.id}`)
            .on('broadcast', { event: 'incoming_call' }, (payload) => {
                const { callerId, callerName, callerAvatar, callType, roomName } = payload.payload;

                // Don't show incoming call if we're already in a call (read from ref, not state)
                if (showCallRef.current) return;

                // 🔒 TAB CLAIM: Only one tab should handle the call
                // Use localStorage to prevent multiple tabs from all ringing
                const claimKey = `call_claim_${roomName}`;
                const existingClaim = localStorage.getItem(claimKey);
                const now = Date.now();

                // If another tab claimed this call within the last 30 seconds, ignore
                if (existingClaim && (now - parseInt(existingClaim)) < 30000) {
                    return;
                }

                // Claim this call for this tab
                localStorage.setItem(claimKey, now.toString());

                // Clean up old claims after 35 seconds
                setTimeout(() => localStorage.removeItem(claimKey), 35000);

                setIncomingCall({ callerId, callerName, callerAvatar, callType, roomName });

                // Play ringing sound
                if (incomingCallAudioRef.current) {
                    incomingCallAudioRef.current.loop = true;
                    incomingCallAudioRef.current.play().catch(() => { });
                }

                // Auto-decline after 30 seconds
                callTimeoutRef.current = setTimeout(() => {
                    handleDeclineCall('timeout');
                }, 30000);
            })
            .on('broadcast', { event: 'call_declined' }, (payload) => {
                // Read from ref to avoid stale closure
                if (callingUserRef.current) {
                    const reason = payload.payload.reason === 'timeout' ? 'No answer' : 'Call declined';
                    setToast({ type: 'info', message: reason });

                    // ── CALL RECEIPT: Save missed/declined receipt as message in chat ──
                    // DEEP-SWEEP FIX: Use refs to avoid stale closure (this handler is created once at mount)
                    const receiptStatus = payload.payload.reason === 'timeout' ? 'missed' : 'declined';
                    const currentConvo = activeConversationRef.current;
                    const currentCallType = callTypeRef.current;
                    if (currentConvo?.id && user?.id) {
                        const receiptPayload = JSON.stringify({
                            type: currentCallType,
                            duration: 0,
                            status: receiptStatus,
                        });
                        supabase.rpc('fn_send_message', {
                            p_conversation_id: currentConvo.id,
                            p_sender_id: user.id,
                            p_content: `[CALL_RECEIPT]${receiptPayload}`,
                        }).catch(() => {});
                    }

                    // ── MISSED CALL NOTIFICATION: Only for timeout (not for active decline) ──
                    // Declined = callee pressed Decline (they already know). Missed = timeout (they need to know).
                    if (receiptStatus === 'missed' && currentConvo?.otherUser?.id && user?.id) {
                        const token = getAccessToken();
                        fetch('/api/messenger/insert-missed-call-notification', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({
                                calleeId: currentConvo.otherUser.id,
                                callType: currentCallType,
                                reason: receiptStatus,
                            }),
                        }).catch(() => {});
                    }

                    setCallingUser(null);
                    // BUG-8 FIX: Also close the call modal — caller shouldn't stay in empty room
                    setShowCall(false);
                    setCallRoomName('');
                    // Stop outgoing ring (Web Audio only now)
                    if (outgoingRingToneRef.current) {
                        outgoingRingToneRef.current.stop();
                        outgoingRingToneRef.current = null;
                    }
                }
            })
            .on('broadcast', { event: 'call_accepted' }, (payload) => {
                // The caller's call is already showing, just clear the "calling" state
                setCallingUser(null);
                // Track call start time for call receipt
                callStartTimeRef.current = Date.now();
                // Stop outgoing ring - call connected! (Web Audio only now)
                if (outgoingRingToneRef.current) outgoingRingToneRef.current.stop();
            })
            .on('broadcast', { event: 'call_ended' }, (payload) => {
                setShowCall(false);
                setCallRoomName('');
                setCallingUser(null);
                setToast({ type: 'info', message: 'Call Ended' });
                // Stop any ringing (Web Audio only now)
                if (outgoingRingToneRef.current) outgoingRingToneRef.current.stop();
                // BUG-7 FIX: Also stop incoming ring audio if it was playing
                if (incomingCallAudioRef.current) {
                    incomingCallAudioRef.current.pause();
                    incomingCallAudioRef.current.currentTime = 0;
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(callChannel);
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        };
    }, [user]); // BUG-3 FIX: Only re-subscribe when user changes, not on showCall/callingUser

    // Handle accepting incoming call
    const handleAcceptCall = async () => {
        if (!incomingCall || !user) return;

        // Stop ringing
        if (incomingCallAudioRef.current) {
            incomingCallAudioRef.current.pause();
            incomingCallAudioRef.current.currentTime = 0;
        }
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

        // Notify caller that we accepted (subscribe, send, then cleanup)
        try {
            const channel = supabase.channel(`call-signal:${incomingCall.callerId}`);
            await new Promise((resolve, reject) => {
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') resolve();
                    else if (status === 'CHANNEL_ERROR') reject(new Error('Channel error'));
                });
            });
            await channel.send({
                type: 'broadcast',
                event: 'call_accepted',
                payload: { accepterId: user.id }
            });
            // Cleanup after a short delay
            setTimeout(() => supabase.removeChannel(channel), 1000);
        } catch (e) {
        }

        // Join the call
        callStartTimeRef.current = Date.now(); // Track start time for receipt
        setCallRoomName(incomingCall.roomName);
        setCallType(incomingCall.callType);
        setShowCall(true);

        // Cancel pending call in database
        if (incomingCall.pendingCallId) {
            fetch('/api/calls/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ callId: incomingCall.pendingCallId }),
            }).catch(() => { });
        }

        setIncomingCall(null);
    };

    // Handle declining incoming call
    const handleDeclineCall = async (reason = 'declined') => {
        if (!incomingCall) return;

        // Stop ringing
        if (incomingCallAudioRef.current) {
            incomingCallAudioRef.current.pause();
            incomingCallAudioRef.current.currentTime = 0;
        }
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

        // Notify caller that we declined (subscribe, send, then cleanup)
        try {
            const channel = supabase.channel(`call-signal:${incomingCall.callerId}`);
            await new Promise((resolve, reject) => {
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') resolve();
                    else if (status === 'CHANNEL_ERROR') reject(new Error('Channel error'));
                });
            });
            await channel.send({
                type: 'broadcast',
                event: 'call_declined',
                payload: { declinerId: user?.id, reason }
            });
            // Cleanup after a short delay
            setTimeout(() => supabase.removeChannel(channel), 1000);
        } catch (e) {
        }

        // Cancel pending call in database
        if (incomingCall.pendingCallId) {
            fetch('/api/calls/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({ callId: incomingCall.pendingCallId }),
            }).catch(() => { });
        }

        setIncomingCall(null);
    };

    // Broadcast our typing state — reuse the existing typing channel subscription
    // Phase 3 BUGFIX: Throttle to max once every 2s to prevent flooding Supabase
    const lastTypingBroadcast = useRef(0);
    const broadcastTyping = () => {
        if (!user || !activeConversation) return;
        const now = Date.now();
        if (now - lastTypingBroadcast.current < 2000) return; // Throttle: max once per 2s
        lastTypingBroadcast.current = now;
        // Supabase reuses channels with the same name, so this is safe
        const ch = supabase.channel(`typing:${activeConversation.id}`);
        ch.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: user.id, username: user.username },
        }).catch(() => { /* channel not yet subscribed is fine */ });
    };

    const loadConversations = async (userId) => {
        //  HARDENED: Circuit breaker + offline detection + retry + guaranteed fallback
        const circuit = getCircuit('messenger-conversations', { failureThreshold: 3, resetTimeout: 30000 });


        // Check offline - return cached data if available
        if (!isOnline()) {
            // Keep existing conversations if we have them
            return;
        }

        try {
            // PRIMARY: Use API with service_role + circuit breaker
            const result = await circuit.execute(
                async () => {
                    const token = getAccessToken();
                    const resp = await fetch('/api/messenger/get-conversations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ userId }),
                    });
                    if (!resp.ok) throw new Error(`API returned ${resp.status}`);
                    return await resp.json();
                },
                // Fallback when circuit is OPEN - use empty (don't crash)
                async () => ({ success: true, conversations: conversations || [] })
            );

            if (result.success && Array.isArray(result.conversations)) {
                setConversations(result.conversations);
                setCachedConversations(result.conversations); // Persist to cache for instant load
                return;
            }
        } catch (apiErr) {
        }

        // FALLBACK 1: Try direct Supabase query with retry
        try {
            const { data, error } = await withRetry(
                async () => {
                    const { data: participations, error: partError } = await supabase
                        .from('social_conversation_participants')
                        .select(`
                            conversation_id,
                            last_read_at,
                            social_conversations (
                                id,
                                last_message_at,
                                last_message_preview,
                                is_group
                            )
                        `)
                        .eq('user_id', userId)
                        .order('social_conversations(last_message_at)', { ascending: false });

                    if (partError) throw partError;
                    return { data: participations, error: null };
                },
                { maxAttempts: 2, baseDelayMs: 500, circuitName: 'supabase-conversations' }
            );

            if (!data || data.length === 0) {
                setConversations([]);
                return;
            }

            // BATCHED ENRICHMENT: Fetch ALL other participants in ONE query (not per-conversation)
            const conversationIds = data.map(p => p.conversation_id);

            // Batch 1: All other participants across all conversations
            const { data: allParticipants } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id, user_id, profiles(id, username, avatar_url, is_vip)')
                .in('conversation_id', conversationIds)
                .neq('user_id', userId);

            // Build lookup: conversationId → [participants]
            const participantsByConvo = {};
            (allParticipants || []).forEach(p => {
                if (!participantsByConvo[p.conversation_id]) participantsByConvo[p.conversation_id] = [];
                participantsByConvo[p.conversation_id].push(p);
            });

            // Batch 2: Unread counts — single query for ALL candidate messages
            const earliestRead = data.reduce((earliest, p) => {
                const ts = p.last_read_at || '1970-01-01';
                return ts < earliest ? ts : earliest;
            }, data[0].last_read_at || '1970-01-01');

            let unreadByConvo = {};
            try {
                const { data: unreadMsgs } = await supabase
                    .from('social_messages')
                    .select('conversation_id, created_at')
                    .in('conversation_id', conversationIds)
                    .neq('sender_id', userId)
                    .eq('is_deleted', false)
                    .gt('created_at', earliestRead)
                    .limit(5000);

                // Count per-conversation using per-conversation last_read_at
                const readMap = new Map(data.map(p => [p.conversation_id, p.last_read_at || '1970-01-01']));
                (unreadMsgs || []).forEach(msg => {
                    const lastRead = readMap.get(msg.conversation_id);
                    if (lastRead && msg.created_at > lastRead) {
                        unreadByConvo[msg.conversation_id] = (unreadByConvo[msg.conversation_id] || 0) + 1;
                    }
                });
            } catch (e) { console.error('[messenger.js] Unread batch failed:', e); }

            // Assemble enriched conversations
            const enriched = data.map(p => {
                const otherParticipants = participantsByConvo[p.conversation_id] || [];
                let otherUser = null;

                if (otherParticipants.length === 1) {
                    otherUser = otherParticipants[0]?.profiles;
                    if (!otherUser && otherParticipants[0]?.user_id) {
                        otherUser = { id: otherParticipants[0].user_id, username: 'User', avatar_url: null };
                    }
                } else if (otherParticipants.length > 1) {
                    otherUser = otherParticipants[0]?.profiles;
                    if (otherUser) {
                        otherUser = { ...otherUser, isGroupChat: true, participantCount: otherParticipants.length + 1 };
                    }
                }

                return {
                    id: p.conversation_id,
                    ...p.social_conversations,
                    otherUser,
                    unreadCount: unreadByConvo[p.conversation_id] || 0,
                    last_read_at: p.last_read_at,
                };
            });

            // Sort and set - filter out conversations without other users
            const sorted = enriched
                .filter(c => c.otherUser)
                .sort((a, b) => {
                    const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                    const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                    return timeB - timeA;
                });
            setConversations(sorted);
        } catch (e) {
            console.error('[MESSENGER] All fallbacks failed:', e);
            // FINAL FALLBACK: Don't crash - keep existing conversations or set empty
            if (!conversations || conversations.length === 0) {
                setConversations([]);
            }
        }
    };

    const loadMessages = async (conversationId) => {
        setLoadingMessages(true);
        setHasMoreMessages(true); // Reset on new conversation
        try {

            // Use API route to bypass RLS issues
            const msgToken = getAccessToken();
            const response = await fetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
                },
                body: JSON.stringify({ conversationId, userId: user.id, limit: 50 }),
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();

            if (result.success && result.messages) {
                // Filter out hidden messages — re-read from localStorage for freshness
                const freshHiddenIds = (() => {
                    try { return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]')); }
                    catch { return hiddenMessageIds; }
                })();
                const filtered = result.messages.filter(m => !freshHiddenIds.has(m.id));
                setMessages(filtered);
                setHasMoreMessages(result.messages.length >= 50);
            } else {
                setMessages([]);
                setHasMoreMessages(false);
            }

            // Mark as read - use API with service role to bypass RLS
            try {
                const readToken = getAccessToken();
                await fetch('/api/messenger/mark-read', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(readToken ? { Authorization: `Bearer ${readToken}` } : {}),
                    },
                    body: JSON.stringify({ conversationId, userId: user.id }),
                });
            } catch (e) {
                console.error('Mark read failed:', e);
            }

            // M2 FIX: Only broadcast read receipt if readReceipts preference is enabled
            // Read from ref to avoid stale closure in long-lived callback
            if (preferencesRef.current.readReceipts !== false) {
                try {
                    const typingCh = supabase.channel(`typing:${conversationId}`);
                    typingCh.send({
                        type: 'broadcast',
                        event: 'read_receipt',
                        payload: { readerId: user.id, conversationId },
                    }).catch(() => {});
                } catch { /* non-critical */ }
            }

            //  Immediately refresh global unread count to clear header badge
            if (refreshUnread) refreshUnread();

        } catch (e) {
            console.error('Load messages error:', e);
        }
        setLoadingMessages(false);
    };

    // Load older messages (pagination — triggered when scrolling to top)
    const loadOlderMessages = useCallback(async () => {
        if (!activeConversation || loadingOlderMessages || !hasMoreMessages || messages.length === 0) return;
        setLoadingOlderMessages(true);
        try {
            const container = messagesContainerRef.current;
            const prevScrollHeight = container?.scrollHeight || 0;
            const oldestMsg = messages[0];
            const msgToken = getAccessToken();
            const response = await fetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: activeConversation.id,
                    userId: user.id,
                    before: oldestMsg.created_at,
                    limit: 50,
                }),
            });
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const result = await response.json();
            if (result.success && result.messages?.length > 0) {
                // Filter out hidden messages — re-read from localStorage for freshness
                const freshHiddenIds = (() => {
                    try { return new Set(JSON.parse(localStorage.getItem('sp-hidden-messages') || '[]')); }
                    catch { return new Set(); }
                })();
                const filteredOlder = result.messages.filter(m => !freshHiddenIds.has(m.id));
                setMessages(prev => [...filteredOlder, ...prev]);
                setHasMoreMessages(result.messages.length >= 50);
                // Preserve scroll position after prepending older messages
                requestAnimationFrame(() => {
                    if (container) {
                        container.scrollTop = container.scrollHeight - prevScrollHeight;
                    }
                });
            } else {
                setHasMoreMessages(false);
            }
        } catch (e) {
            console.error('Load older messages error:', e);
        }
        setLoadingOlderMessages(false);
    }, [activeConversation, loadingOlderMessages, hasMoreMessages, messages, user]);

    const handleSelectConversation = async (conversation) => {
        setActiveConversation(conversation);
        setShowScrollDown(false); // Phase 3 BUGFIX: Reset FAB when switching conversations
        if (isMobile) setShowSidebar(false);

        // Special handling for Jarvis AI
        if (conversation.isJarvis) {
            // 🟢 Jarvis is ALWAYS online — force status immediately
            setOtherUserStatus('online');
            setOtherUserLastSeen(null);

            // Load Jarvis conversation from localStorage
            const saved = localStorage.getItem('jarvis_messenger_history');
            if (saved) {
                try {
                    const history = JSON.parse(saved);
                    setMessages(history);
                } catch (e) {
                    console.error('Failed to load Jarvis history:', e);
                    setMessages([{
                        id: 'welcome',
                        content: "Hey! I'm Jarvis, your poker AI assistant. Ask me anything about strategy, hand analysis, or GTO concepts.",
                        created_at: new Date().toISOString(),
                        sender_id: 'jarvis',
                        profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                        isJarvis: true
                    }]);
                }
            } else {
                // Show welcome message
                setMessages([{
                    id: 'welcome',
                    content: "Hey! I'm Jarvis, your poker AI assistant. Ask me anything about strategy, hand analysis, or GTO concepts.",
                    created_at: new Date().toISOString(),
                    sender_id: 'jarvis',
                    profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                    isJarvis: true
                }]);
            }
            return;
        }

        // Regular conversation handling
        await loadMessages(conversation.id);

        // Update local unread count
        setConversations(prev => prev.map(c =>
            c.id === conversation.id ? { ...c, unreadCount: 0 } : c
        ));

        // Check online presence of the other user
        if (conversation.otherUser?.id) {
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('last_seen_at')
                    .eq('id', conversation.otherUser.id)
                    .maybeSingle();
                if (profile?.last_seen_at) {
                    const diff = Date.now() - new Date(profile.last_seen_at).getTime();
                    setOtherUserLastSeen(profile.last_seen_at);
                    setOtherUserStatus(diff < 120000 ? 'online' : 'offline'); // 2 min threshold
                } else {
                    setOtherUserStatus('offline');
                    setOtherUserLastSeen(null);
                }
            } catch { setOtherUserStatus('offline'); }
        }
    };

    const handleSendMessage = async (content) => {
        if (!user || !activeConversation || !content.trim()) return;

        // Special handling for Jarvis AI
        if (activeConversation.isJarvis) {
            // ── Jarvis Daily Usage Limiter (5/day for free users, unlimited for VIP) ──
            const JARVIS_DAILY_LIMIT = 5;
            const today = new Date().toISOString().split('T')[0];
            const usageKey = `jarvis_daily_usage_${today}`;
            const currentUsage = parseInt(localStorage.getItem(usageKey) || '0', 10);

            if (!isVip && currentUsage >= JARVIS_DAILY_LIMIT) {
                const limitMsg = {
                    id: `jarvis-limit-${Date.now()}`,
                    content: `⚡ You've used all ${JARVIS_DAILY_LIMIT} free Jarvis messages today. Upgrade to **VIP** for unlimited Jarvis AI access, advanced analytics, and more!\n\n👑 [Upgrade to VIP →](/hub/diamond-store)`,
                    created_at: new Date().toISOString(),
                    sender_id: 'jarvis',
                    profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                    isJarvis: true
                };
                setMessages(prev => [...prev, limitMsg]);
                return;
            }

            // Increment daily usage for non-VIP
            if (!isVip) {
                localStorage.setItem(usageKey, String(currentUsage + 1));
            }
            const userMsg = {
                id: `user-${Date.now()}`,
                content: content.trim(),
                created_at: new Date().toISOString(),
                sender_id: user.id,
                profiles: { id: user.id, username: user.username, avatar_url: user.avatar_url },
                isUser: true
            };

            setMessages(prev => {
                const updated = [...prev, userMsg];
                localStorage.setItem('jarvis_messenger_history', JSON.stringify(updated));
                return updated;
            });

            // Show typing indicator
            const typingMsg = {
                id: 'typing',
                content: 'Thinking...',
                created_at: new Date().toISOString(),
                sender_id: 'jarvis',
                profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                isJarvis: true,
                isTyping: true
            };
            setMessages(prev => [...prev, typingMsg]);

            try {
                const jarvisToken = getAccessToken();
                const response = await fetch('/api/geeves/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(jarvisToken ? { Authorization: `Bearer ${jarvisToken}` } : {}),
                    },
                    body: JSON.stringify({
                        message: content,
                        context: 'messenger',
                        history: messages.slice(-6).map(m => ({
                            role: m.isUser ? 'user' : 'assistant',
                            content: m.content
                        }))
                    })
                });

                if (!response.ok) throw new Error(`Request failed (${response.status})`);
                const data = await response.json();

                // Remove typing indicator and add response
                setMessages(prev => {
                    const withoutTyping = prev.filter(m => m.id !== 'typing');
                    const jarvisMsg = {
                        id: `jarvis-${Date.now()}`,
                        content: data.response || data.message || "I'm having trouble processing that. Try asking again.",
                        created_at: new Date().toISOString(),
                        sender_id: 'jarvis',
                        profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                        isJarvis: true
                    };
                    const updated = [...withoutTyping, jarvisMsg];
                    localStorage.setItem('jarvis_messenger_history', JSON.stringify(updated));
                    return updated;
                });
            } catch (error) {
                console.error('Jarvis chat error:', error);
                setMessages(prev => {
                    const withoutTyping = prev.filter(m => m.id !== 'typing');
                    const errorMsg = {
                        id: `jarvis-error-${Date.now()}`,
                        content: "Connection issue. Please try again.",
                        created_at: new Date().toISOString(),
                        sender_id: 'jarvis',
                        profiles: { id: 'jarvis', username: 'jarvis', full_name: 'Jarvis', avatar_url: null },
                        isJarvis: true
                    };
                    const updated = [...withoutTyping, errorMsg];
                    localStorage.setItem('jarvis_messenger_history', JSON.stringify(updated));
                    return updated;
                });
            }
            return;
        }

        // Regular message handling
        // Optimistic update - show message immediately
        const tempId = `temp-${Date.now()}`;
        const optimisticMsg = {
            id: tempId,
            content: content.trim(),
            created_at: new Date().toISOString(),
            sender_id: user.id,
            profiles: isClubMode && clubPage
                ? { id: user.id, username: clubPage.name, avatar_url: clubPage.avatar_url, is_club_identity: true }
                : { id: user.id, username: user.username, avatar_url: user.avatar_url },
            status: 'sending',
        };
        setMessages(prev => [...prev, optimisticMsg]);
        // Update conversation preview and re-sort to move to top
        setConversations(prev => {
            const updated = prev.map(c =>
                c.id === activeConversation.id
                    ? { ...c, last_message_preview: content, last_message_at: new Date().toISOString() }
                    : c
            );
            // Re-sort by last_message_at (most recent first)
            return updated.sort((a, b) => {
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                return timeB - timeA;
            });
        });

        try {
            // Route through API for XSS sanitization, rate limiting, and auth verification
            const sendToken = getAccessToken();
            const sendResp = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sendToken ? { Authorization: `Bearer ${sendToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: activeConversation.id,
                    content: content,
                }),
            });
            const sendResult = await sendResp.json();
            if (!sendResp.ok || !sendResult.success) throw new Error(sendResult.error || 'Send failed');
            const data = sendResult.msgId;

            // Replace optimistic message with real one (use server-sanitized content)
            setMessages(prev => prev.map(m =>
                m.id === tempId
                    ? { ...m, id: data, content: sendResult.content || m.content, status: 'sent' }
                    : m
            ));

            // Notify header to refresh unread badges
            busEmit.dataMutated('messenger');
        } catch (e) {
            console.error('Send message error:', e);
            // Mark message as failed
            setMessages(prev => prev.map(m =>
                m.id === tempId ? { ...m, status: 'failed' } : m
            ));
            setToast({ type: 'error', message: 'Failed To Send Message. Tap To Retry.' });
        }
    };

    // Retry handler for failed messages — removes failed msg and re-sends
    const handleRetryMessage = (failedMsg) => {
        if (!failedMsg?.content) return;
        setMessages(prev => prev.filter(m => m.id !== failedMsg.id));
        handleSendMessage(failedMsg.content);
    };

    // Handle message reaction
    const handleReaction = async (messageId, emoji) => {
        if (!user) return;
        try {
            await supabase.rpc('fn_toggle_message_reaction', {
                p_message_id: messageId,
                p_user_id: user.id,
                p_reaction: emoji,
            });
        } catch (e) {
            console.error('Reaction error:', e);
            // Reactions are optimistically updated, so failure is already handled in UI
        }
    };

    // Handle message deletion (SmarterPoker-style: delete for me vs delete for everyone)
    const handleDeleteMessage = async (messageId, deleteType = 'for_me') => {
        if (!user) return;

        // For Jarvis messages, just remove from localStorage
        if (activeConversation?.isJarvis) {
            setMessages(prev => {
                const updated = deleteType === 'all'
                    ? []
                    : prev.filter(m => m.id !== messageId);
                localStorage.setItem('jarvis_messenger_history', JSON.stringify(updated));
                return updated;
            });
            setToast({ type: 'success', message: deleteType === 'all' ? 'All messages deleted' : 'Message deleted' });
            return;
        }

        try {
            if (deleteType === 'for_everyone') {
                // Delete for everyone (only if you sent it)
                const { data: success, error } = await supabase.rpc('fn_delete_message', {
                    p_message_id: messageId,
                    p_user_id: user.id,
                });

                if (error) throw error;

                if (success) {
                    setMessages(prev => prev.map(m =>
                        m.id === messageId
                            ? { ...m, content: '[Message deleted]', is_deleted: true }
                            : m
                    ));
                    setToast({ type: 'success', message: 'Message Deleted For Everyone' });
                } else {
                    setToast({ type: 'error', message: 'Could Not Delete Message' });
                }
            } else {
                // Delete for me only — persist to localStorage so it survives refresh
                const hiddenKey = 'sp-hidden-messages';
                try {
                    const existing = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
                    const updated = [...existing, messageId].slice(-1000); // FIFO: keep last 1000
                    localStorage.setItem(hiddenKey, JSON.stringify(updated));
                } catch { /* localStorage full or corrupted */ }
                setMessages(prev => prev.filter(m => m.id !== messageId));
                setToast({ type: 'success', message: 'Message Removed' });
            }
        } catch (e) {
            console.error('Delete message error:', e);
            setToast({ type: 'error', message: 'Failed To Delete Message' });
        }
    };

    // Handle message editing (inline edit → API call)
    const handleEditMessage = async (message) => {
        setEditingMessage(message);
        setEditText(message.content);
    };

    const handleEditSave = async () => {
        if (!editingMessage || !editText.trim() || !user) return;
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/messenger/edit-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    messageId: editingMessage.id,
                    userId: user.id,
                    content: editText.trim(),
                }),
            });
            const result = await resp.json();
            if (result.success) {
                // Use server-returned sanitized content (not raw editText) for UI parity
                const sanitizedContent = result.content || editText.trim();
                setMessages(prev => prev.map(m =>
                    m.id === editingMessage.id
                        ? { ...m, content: sanitizedContent, is_edited: true }
                        : m
                ));
                setToast({ type: 'success', message: 'Message Edited' });
            } else {
                setToast({ type: 'error', message: result.error || 'Edit Failed' });
            }
        } catch (e) {
            console.error('Edit message error:', e);
            setToast({ type: 'error', message: 'Failed To Edit Message' });
        }
        setEditingMessage(null);
        setEditText('');
    };

    const handleEditCancel = () => {
        setEditingMessage(null);
        setEditText('');
    };

    // Handle forwarding a message to another conversation
    const handleForwardMessage = (message) => {
        setForwardingMessage(message);
    };

    const handleForwardSend = async (targetConversation) => {
        if (!forwardingMessage || !targetConversation || !user) return;
        try {
            const content = `[Forwarded] ${forwardingMessage.content}`;
            const token = getAccessToken();
            const resp = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: targetConversation.id,
                    senderId: user.id,
                    content,
                }),
            });
            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || `Forward failed (${resp.status})`);
            }
            setToast({ type: 'success', message: `Message Forwarded To ${targetConversation.otherUser?.username || 'Conversation'}` });
        } catch (e) {
            console.error('Forward error:', e);
            setToast({ type: 'error', message: 'Failed To Forward Message' });
        }
        setForwardingMessage(null);
    };

    // Handle GIF send — sends GIF URL as a message
    const handleGifSend = (gifUrl) => {
        if (!gifUrl) return;
        handleSendMessage(`[GIF](${gifUrl})`);
    };

    // Pin/Unpin conversation
    const handleTogglePin = (conversationId) => {
        setPinnedConvoIds(prev => {
            const updated = prev.includes(conversationId)
                ? prev.filter(id => id !== conversationId)
                : [...prev, conversationId].slice(0, 5); // max 5 pinned
            localStorage.setItem('sp-pinned-conversations', JSON.stringify(updated));
            return updated;
        });
    };

    // Handle media (photo/video) upload
    const handleMediaUpload = async (file) => {
        if (!user || !activeConversation || !file) {
            return;
        }


        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            setToast({ type: 'error', message: 'Only Images And Videos Are Supported' });
            return;
        }

        // File size limit: 10MB for images, 50MB for videos
        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setToast({ type: 'error', message: `File too large. Max ${isVideo ? '50MB' : '10MB'}` });
            return;
        }

        // Optimistic UI update
        const tempId = `temp-${Date.now()}`;
        const mediaPreview = URL.createObjectURL(file);
        const tempMessage = {
            id: tempId,
            content: isImage ? `Photo` : `Video`,
            media_url: mediaPreview,
            media_type: isImage ? 'image' : 'video',
            created_at: new Date().toISOString(),
            sender_id: user.id,
            status: 'sending',
            profiles: { id: user.id, username: user.user_metadata?.username, avatar_url: user.user_metadata?.avatar_url },
            _blobUrl: mediaPreview, // Track for cleanup
        };
        setMessages(prev => [...prev, tempMessage]);
        setToast({ type: 'success', message: 'Uploading...' });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        try {
            // Upload to Supabase Storage - use user-media bucket which exists
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/messages/${Date.now()}.${fileExt}`;


            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('user-media')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                throw uploadError;
            }


            // Get public URL
            const { data: urlData } = supabase.storage
                .from('user-media')
                .getPublicUrl(fileName);


            // Send message with media URL — route through API for XSS sanitization + rate limiting
            const content = isImage
                ? `[Image](${urlData.publicUrl})`
                : `[Video](${urlData.publicUrl})`;

            const mediaToken = getAccessToken();
            const mediaResp = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(mediaToken ? { Authorization: `Bearer ${mediaToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: activeConversation.id,
                    content: content,
                }),
            });
            const mediaResult = await mediaResp.json();
            if (!mediaResp.ok || !mediaResult.success) throw new Error(mediaResult.error || 'Send failed');

            // Update message with real data
            setMessages(prev => prev.map(m =>
                m.id === tempId
                    ? { ...m, id: mediaResult.msgId, content, media_url: urlData.publicUrl, status: 'sent' }
                    : m
            ));

            // Revoke blob URL to prevent memory leak
            URL.revokeObjectURL(mediaPreview);

            // Notify header to refresh unread badges
            busEmit.dataMutated('messenger');

            setToast({ type: 'success', message: `${isImage ? 'Photo' : 'Video'} sent!` });
        } catch (e) {
            console.error('Media upload error:', e);
            setMessages(prev => prev.map(m =>
                m.id === tempId ? { ...m, status: 'failed' } : m
            ));
            // Revoke blob URL on failure too to prevent memory leak
            URL.revokeObjectURL(mediaPreview);
            setToast({ type: 'error', message: `Upload failed: ${e.message || 'Unknown error'}` });
        }
    };

    const handleSearchUser = useCallback((query) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            try {
                const escaped = query.replace(/[%_\\]/g, '\\$&');
                const { data } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .or(`username.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
                    .neq('id', user?.id)
                    .limit(10);

                setSearchResults(data || []);
            } catch (e) {
                console.error('Search error:', e);
            }
        }, 300);
    }, [user]);

    const handleStartConversation = async (otherUser) => {
        if (!user) return;
        setSearchQuery('');
        setSearchResults([]);

        try {
            // Get or create conversation
            const { data: convId } = await supabase.rpc('fn_get_or_create_conversation', {
                user1_id: user.id,
                user2_id: otherUser.id,
            });

            const newConv = {
                id: convId,
                otherUser,
                last_message_preview: null,
                last_message_at: new Date().toISOString(),
                unreadCount: 0,
            };

            // Add to list if not exists
            setConversations(prev => {
                const exists = prev.find(c => c.id === convId);
                if (exists) return prev;
                return [newConv, ...prev];
            });

            handleSelectConversation(newConv);
        } catch (e) {
            console.error('Start conversation error:', e);
        }
    };

    // Handle message search within a conversation
    const handleMessageSearch = useCallback((query) => {
        if (messageSearchTimeout.current) clearTimeout(messageSearchTimeout.current);

        if (!query || query.length < 2 || !activeConversation) {
            setMessageSearchResults([]);
            return;
        }

        messageSearchTimeout.current = setTimeout(async () => {
            try {
                const { data, error } = await supabase.rpc('fn_search_messages', {
                    p_conversation_id: activeConversation.id,
                    p_user_id: user.id,
                    p_query: query,
                });

                if (error) throw error;
                setMessageSearchResults(data || []);
            } catch (e) {
                console.error('Message search error:', e);
            }
        }, 300);
    }, [activeConversation, user]);

    // ════════════════════════════════════════════════════════████████████████
    // 🟢🔴 REAL-TIME PRESENCE: WebSocket-based online/offline tracking
    // Uses Supabase Realtime Presence channel for instant green/red dot updates
    // ════════════════════════════════════════════════════════████████████████
    useEffect(() => {
        if (!user?.id) return;

        // 1. Update DB presence (for cross-page last_seen_at persistence)
        // M3 FIX: Only broadcast presence if activeStatus preference is enabled
        const updateDbPresence = async (isOnlineNow) => {
            try {
                // If active status is disabled, always report offline
                const effectiveOnline = preferencesRef.current.activeStatus !== false ? isOnlineNow : false;
                await supabase.rpc('fn_update_presence', {
                    p_user_id: user.id,
                    p_is_online: effectiveOnline,
                });
            } catch (e) {
                console.error('[Presence] DB update error:', e);
            }
        };

        updateDbPresence(true);

        // 2. Join global Presence channel — all messenger users share this channel
        const presenceChannel = supabase.channel('messenger-online', {
            config: { presence: { key: user.id } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                const onlineSet = new Set(Object.keys(state));
                setOnlineUsers(onlineSet);
                console.log('[Presence] Sync — online users:', onlineSet.size);

                // Update active conversation's other user status in real-time
                if (activeConversationRef.current?.otherUser?.id) {
                    const otherId = activeConversationRef.current.otherUser.id;
                    setOtherUserStatus(onlineSet.has(otherId) ? 'online' : 'offline');
                }
            })
            .on('presence', { event: 'join' }, ({ key }) => {
                setOnlineUsers(prev => new Set([...prev, key]));
                // Instant green dot if the joining user is the active chat partner
                if (activeConversationRef.current?.otherUser?.id === key) {
                    setOtherUserStatus('online');
                }
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
                // Instant red dot if the leaving user is the active chat partner
                if (activeConversationRef.current?.otherUser?.id === key) {
                    setOtherUserStatus('offline');
                    setOtherUserLastSeen(new Date().toISOString());
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // M3 FIX: Only track presence if activeStatus preference is enabled
                    if (preferencesRef.current.activeStatus !== false) {
                        await presenceChannel.track({
                            online_at: new Date().toISOString(),
                            user_id: user.id,
                        });
                    }
                }
            });

        // 3. Set offline on unmount or page close
        const handleUnload = () => {
            updateDbPresence(false);
            presenceChannel.untrack();
        };
        window.addEventListener('beforeunload', handleUnload);

        // 4. Handle visibility changes (tab switch = away)
        const handleVisibility = () => {
            if (document.hidden) {
                presenceChannel.untrack();
            } else {
                presenceChannel.track({
                    online_at: new Date().toISOString(),
                    user_id: user.id,
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            document.removeEventListener('visibilitychange', handleVisibility);
            supabase.removeChannel(presenceChannel);
            updateDbPresence(false);
        };
    }, [user?.id]);

    // Calculate total unread count + favicon badge
    useEffect(() => {
        const total = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        setTotalUnreadCount(total);
        // Update browser tab title with unread badge
        if (typeof document !== 'undefined') {
            document.title = total > 0 ? `(${total}) Messenger | Smarter.Poker` : 'Messenger | Smarter.Poker';
        }
        // Update favicon with red badge
        updateFaviconBadge(total);
        // Cleanup: reset favicon and title when leaving messenger
        return () => {
            if (typeof document !== 'undefined') {
                document.title = 'Smarter.Poker';
                updateFaviconBadge(0);
            }
        };
    }, [conversations]);

    // Sync local conversations state to Zustand/localStorage cache
    // This ensures re-entry renders current data (RT updates, mark-read, sent messages)
    useEffect(() => {
        if (conversations.length > 0) {
            setCachedConversations(conversations);
        }
    }, [conversations]);

    // 📲 Link OneSignal to user ID for push notifications
    useEffect(() => {
        let cancelled = false;
        let promptTimer = null;

        if (user?.id && pushReady && setExternalUserId) {
            // Link user's Supabase ID to OneSignal for targeted notifications
            setExternalUserId(user.id);

            // Check Supabase for cross-device persistence (if localStorage missed it)
            if (!pushPromptHandled && !pushSubscribed) {
                supabase.from('profiles').select('messenger_preferences').eq('id', user.id).maybeSingle().then(({ data }) => {
                    if (cancelled) return;
                    if (data?.messenger_preferences?.pushPromptHandled) {
                        setPushPromptHandled(true);
                        try { localStorage.setItem('messenger_push_prompt_handled', '1'); } catch {}
                        return;
                    }
                    // User hasn't handled it — show prompt after 3s delay
                    promptTimer = setTimeout(() => {
                        if (!cancelled) setShowPushPrompt(true);
                    }, 3000);
                });
            }
        }

        return () => {
            cancelled = true;
            if (promptTimer) clearTimeout(promptTimer);
        };
    }, [user?.id, pushReady, pushSubscribed, pushPromptHandled, setExternalUserId]);

    // Start a Jitsi call - Now uses real-time signaling for instant popup
    const startCall = async (type) => {
        if (!activeConversation || !user) return;

        // BUG-9 FIX: Prevent double-click or calling while already in a call
        if (callingUser || showCall) {
            return;
        }

        const otherUser = activeConversation?.otherUser;

        // 🔒 CRITICAL VALIDATION: Ensure we're calling the right person
        if (!otherUser?.id) {
            setToast({ type: 'error', message: 'Cannot Start Call - User Not Found' });
            console.error('❌ CALL ERROR: otherUser is missing!', { activeConversation });
            return;
        }

        // Block calls in group chats - only 1-on-1 calls are supported
        if (otherUser.isGroupChat) {
            setToast({ type: 'error', message: 'Calls Are Only Available In 1-on-1 Conversations' });
            return;
        }

        // NEVER call yourself - this would be a bug
        if (otherUser.id === user.id) {
            setToast({ type: 'error', message: 'Cannot Call Yourself' });
            console.error('❌ CALL ERROR: Attempted to call self!', { otherUser, currentUser: user.id });
            return;
        }

        // Generate unique room name: smarter-poker-{conversationId}-{timestamp}
        const roomName = `smarter-poker-${activeConversation.id.slice(0, 8)}-${Date.now()}`;
        const callerName = user.user_metadata?.full_name || user.user_metadata?.username || user.user_metadata?.poker_alias || 'Someone';
        const callerAvatar = user.user_metadata?.avatar_url || null;

        // Set calling state to show "Calling..." UI
        setCallingUser(otherUser);
        setCallType(type);

        // 📞 Send real-time call signal to the other user
        // CRITICAL: Must subscribe before sending broadcast
        try {
            const channel = supabase.channel(`call-signal:${otherUser.id}`);
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Channel timeout')), 5000);
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        clearTimeout(timeout);
                        resolve();
                    } else if (status === 'CHANNEL_ERROR') {
                        clearTimeout(timeout);
                        reject(new Error('Channel error'));
                    }
                });
            });

            await channel.send({
                type: 'broadcast',
                event: 'incoming_call',
                payload: {
                    callerId: user.id,
                    callerName: callerName,
                    callerAvatar: callerAvatar,
                    callType: type,
                    roomName: roomName,
                }
            });

            // Cleanup channel after a delay (receiver has their own listener)
            setTimeout(() => supabase.removeChannel(channel), 2000);

            // 📱 Create pending call in database (for offline users)
            try {
                const callToken = getAccessToken();
                await fetch('/api/calls/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(callToken ? { Authorization: `Bearer ${callToken}` } : {}),
                    },
                    body: JSON.stringify({
                        callerId: user.id,
                        calleeId: otherUser.id,
                        callerName: callerName,
                        callerAvatar: callerAvatar,
                        callType: type,
                        roomName: roomName,
                    }),
                });
            } catch (e) {
            }


            // Also send push notification for users not on the page
            // This will make their phone RING like a real call!
            try {
                const pushRes = await fetch('/api/notifications/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`,
                        message: `${callerName} is calling you`,
                        url: `https://smarter.poker/hub/messenger`,
                        externalUserIds: [otherUser.id],
                        // 📞 CALL-SPECIFIC: Makes the phone ring like a real call!
                        isCall: true,
                        callType: type,
                        roomName: roomName,
                        callerId: user.id,
                    }),
                });
                if (!pushRes.ok) throw new Error(`Request failed (${pushRes.status})`);
                const pushResult = await pushRes.json();
                if (!pushRes.ok || pushResult.error) {
                }
            } catch (pushError) {
            }
        } catch (e) {
            console.error('Failed to send call signal:', e);
            setToast({ type: 'error', message: 'Failed To Call. Please Try Again.' });
            setCallingUser(null);
            return;
        }

        // Start the call immediately for the caller
        setCallRoomName(roomName);
        setShowCall(true);

        //  Play outgoing ring sound while waiting for answer
        // BUG-4 FIX: Always stop and clear existing ring tone before creating new one
        if (outgoingRingToneRef.current) {
            outgoingRingToneRef.current.stop();
            outgoingRingToneRef.current = null;
        }
        outgoingRingToneRef.current = createRingTone();
        if (outgoingRingToneRef.current) {
            outgoingRingToneRef.current.start();
        }

        setToast({ type: 'info', message: `Calling ${otherUser.full_name || otherUser.username}...` });
    };

    // End call - notify the other party
    const endCall = async () => {
        // BUG-7 FIX: Stop ALL audio sources immediately
        if (outgoingRingToneRef.current) {
            outgoingRingToneRef.current.stop();
            outgoingRingToneRef.current = null;
        }
        if (incomingCallAudioRef.current) {
            incomingCallAudioRef.current.pause();
            incomingCallAudioRef.current.currentTime = 0;
        }

        // Notify the other user that call ended (subscribe, send, then cleanup)
        if (activeConversation?.otherUser?.id) {
            try {
                const channel = supabase.channel(`call-signal:${activeConversation.otherUser.id}`);
                await new Promise((resolve) => {
                    const timeout = setTimeout(resolve, 2000); // Don't block UI for too long
                    channel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            clearTimeout(timeout);
                            resolve();
                        }
                    });
                });
                await channel.send({
                    type: 'broadcast',
                    event: 'call_ended',
                    payload: { enderId: user?.id }
                });
                setTimeout(() => supabase.removeChannel(channel), 1000);
            } catch (e) {
            }
        }

        // Save call receipt as structured JSON message
        if (activeConversation?.id && user?.id) {
            let receiptStatus = 'completed';
            let callDuration = 0;

            if (callStartTimeRef.current) {
                // Call was connected — save completed receipt with duration
                callDuration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                receiptStatus = 'completed';
            } else {
                // Call was never connected — caller hung up before answer = cancelled
                receiptStatus = 'cancelled';
            }

            const receiptPayload = JSON.stringify({
                type: callType,
                duration: callDuration,
                status: receiptStatus,
            });

            try {
                await supabase.rpc('fn_send_message', {
                    p_conversation_id: activeConversation.id,
                    p_sender_id: user.id,
                    p_content: `[CALL_RECEIPT]${receiptPayload}`,
                });
            } catch (e) {
            }
        }
        callStartTimeRef.current = null;

        // Cancel any pending call in database (in case call wasn't answered)
        if (activeConversation?.otherUser?.id && user?.id) {
            fetch('/api/calls/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
                body: JSON.stringify({
                    callerId: user.id,
                    calleeId: activeConversation.otherUser.id
                }),
            }).catch(() => { });
        }

        setShowCall(false);
        setCallRoomName('');
        setCallingUser(null);
        setToast({ type: 'info', message: 'Call Ended' });
    };

    // BUG-4 FIX: Clean up ring tone AudioContext on component unmount
    useEffect(() => {
        return () => {
            if (outgoingRingToneRef.current) {
                outgoingRingToneRef.current.stop();
                outgoingRingToneRef.current = null;
            }
            if (incomingCallAudioRef.current) {
                incomingCallAudioRef.current.pause();
            }
            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
            }
        };
    }, []);

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
                background: C.bg,
                display: 'flex',
            }}>
                {/* Skeleton sidebar */}
                <div style={{
                    width: 360, background: C.card,
                    borderRight: `1px solid ${C.border}`,
                }}>
                    <div style={{ padding: '12px 16px' }}>
                        <div style={{
                            width: 140, height: 28, borderRadius: 8,
                            background: `linear-gradient(110deg, ${C.bg} 8%, ${C.border} 18%, ${C.bg} 33%)`,
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s infinite',
                        }} />
                    </div>
                    <ConversationSkeleton count={8} />
                </div>
                {/* Skeleton chat area */}
                <div style={{
                    flex: 1, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{ textAlign: 'center', color: C.textSec }}>
                        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>💬</div>
                        <div>Loading Messenger...</div>
                    </div>
                </div>
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}</style>
            </div>
        );
    }

    // Not logged in — only show after loading completes to prevent flash
    if (!user && !loading) {
        return (
            <>
                <SEOHead
                    title="Messenger — Direct Messages"
                    description="Chat With Friends And Poker Players Directly On Smarter.Poker Messenger."
                    canonical="/hub/messenger"
                />
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: C.bg,
                }}>
                    <div style={{
                        textAlign: 'center',
                        padding: 40,
                        background: C.card,
                        borderRadius: 16,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}></div>
                        <h2 style={{ margin: '0 0 8px', color: C.text }}>Sign In To Messenger</h2>
                        <p style={{ color: C.textSec, marginBottom: 24 }}>Connect With Your Poker Network</p>
                        <Link href="/auth/login" style={{
                            display: 'inline-block',
                            padding: '12px 32px',
                            background: C.blue,
                            color: 'white',
                            borderRadius: 8,
                            fontWeight: 600,
                            textDecoration: 'none',
                        }}>Log In</Link>
                    </div>
                </div>
            </>
        );
    }

    const otherUser = activeConversation?.otherUser;

    return (
        <>
            <Head>
                <title>Messenger | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <style>{`
                    /* MOBILE-FIRST MESSENGER */
                    .messenger-page { 
                        width: 100%; 
                        max-width: 100%; 
                        margin: 0 auto; 
                        overflow-x: hidden;
                        /* Account for UniversalHeader height */
                        height: calc(100vh - 54px);
                        height: calc(100dvh - 54px);
                    }
                    
                    /* Mobile-specific messenger styles */
                    @media (max-width: 768px) {
                        .messenger-page {
                            /* Account for UniversalHeader only (54px) — BottomNavBar removed from messenger */
                            height: calc(100vh - 54px);
                            height: calc(100dvh - 54px);
                        }
                        
                        /* Smaller avatars on mobile */
                        .messenger-page img[src*="avatar"],
                        .messenger-page [style*="borderRadius: '50%'"] {
                            max-width: 44px;
                            max-height: 44px;
                        }
                        
                        /* Conversation list - tighter padding */
                        .messenger-page aside {
                            padding: 0;
                        }
                        
                        /* Message bubbles - wider on mobile */
                        .messenger-page [style*="paddingLeft: 60px"],
                        .messenger-page [style*="paddingRight: 60px"] {
                            padding-left: 8px !important;
                            padding-right: 8px !important;
                        }
                    }
                    
                    @keyframes bounce {
                        0%, 60%, 100% { transform: translateY(0); }
                        30% { transform: translateY(-4px); }
                    }
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.1); opacity: 0.8; }
                    }
                    @keyframes reactionPopIn {
                        0% { transform: scale(0.7); opacity: 0; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                    /* shimmer defined in loading fallback */
                `}</style>
            </Head>

            {/* UNIVERSAL HEADER - Mobile responsive with diamond/XP */}
            <UniversalHeader
                pageDepth={2}
                onMenuClick={() => setMenuOpen(true)}
            />

            {/* Hamburger Menu */}
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="left"
                theme="dark"
                user={user}
                showProfile={true}
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />

            {/* Forward Message Modal */}
            {forwardingMessage && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => setForwardingMessage(null)}>
                    <div style={{
                        background: C.card, borderRadius: 12, width: 360, maxHeight: 480,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 16 }}>
                            Forward Message
                            <button onClick={() => setForwardingMessage(null)} style={{
                                float: 'right', background: 'none', border: 'none', cursor: 'pointer',
                                color: C.textSec, fontSize: 20,
                            }}>×</button>
                        </div>
                        <div style={{ padding: '8px 0', maxHeight: 360, overflowY: 'auto' }}>
                            {conversations.filter(c => c.id !== activeConversation?.id && !c.isJarvis).map(conv => (
                                <button
                                    key={conv.id}
                                    onClick={() => handleForwardSend(conv)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        width: '100%', padding: '10px 16px', border: 'none',
                                        background: 'transparent', cursor: 'pointer', textAlign: 'left',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <Avatar src={conv.otherUser?.avatar_url} name={conv.otherUser?.username} size={36} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{conv.otherUser?.username || conv.otherUser?.full_name}</div>
                                    </div>
                                </button>
                            ))}
                            {conversations.filter(c => c.id !== activeConversation?.id && !c.isJarvis).length === 0 && (
                                <div style={{ textAlign: 'center', padding: 20, color: C.textSec }}>No other conversations to forward to</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            <Toast toast={toast} onDismiss={() => setToast(null)} />

            {/* Push Notification Subscription Banner */}
            {showPushPrompt && !pushSubscribed && (
                <div style={{
                    position: 'fixed',
                    bottom: isMobile ? 70 : 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #1877F2, #0A5DC7)',
                    color: 'white',
                    padding: '12px 20px',
                    borderRadius: 12,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    maxWidth: 400,
                }}>
                    <span style={{ fontSize: 28 }}></span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Enable Call Notifications</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>Get Notified When Someone Calls You</div>
                    </div>
                    <button
                        onClick={async () => {
                            const success = await subscribePush();
                            // Persist choice permanently — never ask again
                            setPushPromptHandled(true);
                            try { localStorage.setItem('messenger_push_prompt_handled', '1'); } catch {}
                            if (user?.id) {
                                // Safe JSONB merge — preserves existing messenger_preferences
                                const { data: cur } = await supabase.from('profiles').select('messenger_preferences').eq('id', user.id).maybeSingle();
                                const merged = { ...(cur?.messenger_preferences || {}), pushPromptHandled: true };
                                supabase.from('profiles').update({ messenger_preferences: merged }).eq('id', user.id).then(() => {});
                            }
                            setShowPushPrompt(false);
                            if (success) {
                                setToast({ type: 'success', message: 'Push Notifications Enabled!' });
                            }
                        }}
                        style={{
                            padding: '8px 16px',
                            background: 'white',
                            color: '#1877F2',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >Enable</button>
                    <button
                        onClick={async () => {
                            // Persist dismissal permanently — never ask again
                            setPushPromptHandled(true);
                            try { localStorage.setItem('messenger_push_prompt_handled', '1'); } catch {}
                            if (user?.id) {
                                // Safe JSONB merge — preserves existing messenger_preferences
                                const { data: cur } = await supabase.from('profiles').select('messenger_preferences').eq('id', user.id).maybeSingle();
                                const merged = { ...(cur?.messenger_preferences || {}), pushPromptHandled: true };
                                supabase.from('profiles').update({ messenger_preferences: merged }).eq('id', user.id).then(() => {});
                            }
                            setShowPushPrompt(false);
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 18,
                            opacity: 0.7,
                        }}
                    >×</button>
                </div>
            )}

            {/* Ringing Audio for Incoming Calls */}
            <audio
                ref={incomingCallAudioRef}
                src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0tRXFuYz0mFTNNaWxofmh+YKStoJd/aGtbL09OYUFRYWOHeoKK"
            />



            {/* Outgoing Ring: Using Web Audio API createRingTone() instead */}

            {/* ════════════════════════════════════════════════════════
                BUG-2 FIX: "CALLING..." OVERLAY - Shows while waiting for answer
                ════════════════════════════════════════════════════════ */}
            {callingUser && !showCall && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 24,
                        padding: 40,
                        textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        maxWidth: 360,
                        width: '90%',
                    }}>
                        {/* Call Type Icon */}
                        <div style={{
                            fontSize: 48,
                            marginBottom: 16,
                            animation: 'pulse 1.5s infinite',
                        }}>
                            {callType === 'video' ? '\ud83d\udcf9' : '\ud83d\udcde'}
                        </div>

                        {/* Callee Avatar */}
                        <div style={{
                            width: 100,
                            height: 100,
                            borderRadius: '50%',
                            margin: '0 auto 16px',
                            background: callingUser.avatar_url
                                ? `url(${callingUser.avatar_url}) center/cover`
                                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 40,
                            color: 'white',
                            border: '3px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 0 0 4px rgba(0,132,255,0.3), 0 0 30px rgba(0,132,255,0.4)',
                            animation: 'ring 1.5s infinite',
                        }}>
                            {!callingUser.avatar_url && (callingUser.username?.[0]?.toUpperCase() || callingUser.full_name?.[0]?.toUpperCase() || '?')}
                        </div>

                        {/* Callee Name */}
                        <h2 style={{
                            color: 'white',
                            fontSize: 24,
                            fontWeight: 600,
                            margin: '0 0 8px 0',
                        }}>
                            {callingUser.full_name || callingUser.username || 'User'}
                        </h2>

                        {/* Status */}
                        <p style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: 16,
                            margin: '0 0 32px 0',
                        }}>
                            Calling...
                        </p>

                        {/* Cancel Button */}
                        <button
                            onClick={() => {
                                setCallingUser(null);
                                if (outgoingRingToneRef.current) {
                                    outgoingRingToneRef.current.stop();
                                    outgoingRingToneRef.current = null;
                                }
                                endCall();
                            }}
                            style={{
                                width: 70,
                                height: 70,
                                borderRadius: '50%',
                                border: 'none',
                                background: 'linear-gradient(135deg, #ff4757 0%, #c0392b 100%)',
                                color: 'white',
                                fontSize: 28,
                                cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(255,71,87,0.4)',
                                transition: 'transform 0.2s',
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                            title="Cancel Call"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════
                INCOMING CALL POPUP - Shows when someone calls you
                ════════════════════════════════════════════════════════ */}
            {incomingCall && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 24,
                        padding: 40,
                        textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        maxWidth: 360,
                        width: '90%',
                    }}>
                        {/* BUG-6 FIX: Call Type Icon — show actual icons, not plain text */}
                        <div style={{
                            fontSize: 48,
                            marginBottom: 16,
                            animation: 'pulse 1.5s infinite',
                        }}>
                            {incomingCall.callType === 'video' ? '📹' : '📞'}
                        </div>

                        {/* Caller Avatar */}
                        <div style={{
                            width: 100,
                            height: 100,
                            borderRadius: '50%',
                            margin: '0 auto 16px',
                            background: incomingCall.callerAvatar
                                ? `url(${incomingCall.callerAvatar}) center/cover`
                                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 40,
                            color: 'white',
                            border: '3px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 0 0 4px rgba(0,132,255,0.3), 0 0 30px rgba(0,132,255,0.4)',
                            animation: 'ring 1.5s infinite',
                        }}>
                            {!incomingCall.callerAvatar && (incomingCall.callerName?.[0]?.toUpperCase() || '?')}
                        </div>

                        {/* Caller Name */}
                        <h2 style={{
                            color: 'white',
                            fontSize: 24,
                            fontWeight: 600,
                            margin: '0 0 8px 0',
                        }}>
                            {incomingCall.callerName}
                        </h2>

                        {/* Call Type Label */}
                        <p style={{
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: 16,
                            margin: '0 0 32px 0',
                        }}>
                            Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call...
                        </p>

                        {/* Accept / Decline Buttons */}
                        <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
                            <button
                                onClick={() => handleDeclineCall('declined')}
                                style={{
                                    width: 70,
                                    height: 70,
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #ff4757 0%, #c0392b 100%)',
                                    color: 'white',
                                    fontSize: 28,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 20px rgba(255,71,87,0.4)',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                title="Decline"
                            >
                                ×
                            </button>
                            <button
                                onClick={handleAcceptCall}
                                style={{
                                    width: 70,
                                    height: 70,
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #00b894 0%, #27ae60 100%)',
                                    color: 'white',
                                    fontSize: 28,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 20px rgba(0,184,148,0.4)',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                title="Accept"
                            >
                                📞
                            </button>
                        </div>
                    </div>

                    {/* Ring Animation Keyframes */}
                    <style>{`
                        @keyframes ring {
                            0%, 100% { box-shadow: 0 0 0 4px rgba(0,132,255,0.3), 0 0 30px rgba(0,132,255,0.4); }
                            50% { box-shadow: 0 0 0 8px rgba(0,132,255,0.2), 0 0 50px rgba(0,132,255,0.6); }
                        }
                        @keyframes pulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.1); }
                        }
                    `}</style>
                </div>
            )}

            {/* LiveKit Video Call Modal - True seamless WhatsApp/Snapchat style */}
            {showCall && callRoomName && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: '#000',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* Call Header */}
                    <div style={{
                        padding: '12px 16px',
                        background: 'rgba(0,0,0,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #333',
                        zIndex: 10,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {callType === 'video' ? <VideoIcon size={24} color="white" /> : <PhoneIcon size={24} color="white" />}
                            <div>
                                <div style={{ color: 'white', fontWeight: 600 }}>
                                    {callType === 'video' ? 'Video' : 'Voice'} Call with {activeConversation?.otherUser?.username || 'User'}
                                </div>
                                <div style={{ color: '#888', fontSize: 12 }}>Smarter Poker Video</div>
                            </div>
                        </div>
                        <button
                            onClick={endCall}
                            style={{
                                padding: '10px 20px',
                                background: '#E53935',
                                color: 'white',
                                border: 'none',
                                borderRadius: 8,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            📵 End Call
                        </button>
                    </div>
                    {/* LiveKit Video Component — BUG-1 FIX: Pass auth token for API calls */}
                    <LiveKitCall
                        roomName={callRoomName}
                        participantName={user?.user_metadata?.username || user?.user_metadata?.poker_alias || 'User'}
                        participantId={user?.id}
                        callType={callType}
                        otherUserName={activeConversation?.otherUser?.username}
                        onEnd={endCall}
                        authToken={getAccessToken()}
                    />
                </div>
            )}

            <div className="messenger-page" style={{
                display: 'flex',
                background: C.bg,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
            }}>
                {/* ════════════════════════════════════════════════════════
                    LEFT SIDEBAR - Conversation List
                    ════════════════════════════════════════════════════════ */}
                <aside style={{
                    width: isMobile ? '100%' : 360,
                    background: C.card,
                    borderRight: `1px solid ${C.border}`,
                    display: (isMobile && !showSidebar) ? 'none' : 'flex',
                    flexDirection: 'column',
                    height: '100%',
                }}>
                    {/* Header - SmarterPoker Messenger Style */}
                    <div style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.blue }}>Messenger</h1>
                            {/* M6: Unread badge on sidebar header */}
                            {totalUnreadCount > 0 && (
                                <div style={{
                                    minWidth: 22, height: 22, borderRadius: 11,
                                    background: C.red, color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: 700, padding: '0 6px',
                                }}>{totalUnreadCount > 99 ? '99+' : totalUnreadCount}</div>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                setComposing(true);
                                setTimeout(() => searchInputRef.current?.focus(), 100);
                            }}
                            title="New Message"
                            style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: composing ? C.blue : C.bg,
                                border: 'none', cursor: 'pointer', fontSize: 16,
                                color: composing ? 'white' : C.text,
                                transition: 'all 0.2s',
                            }}>✏️</button>
                    </div>

                    {/* Search */}
                    <SearchBar
                        value={searchQuery}
                        onChange={setSearchQuery}
                        onSearchUser={handleSearchUser}
                        searchResults={searchResults}
                        onSelectUser={(user) => {
                            handleStartConversation(user);
                            setComposing(false);
                        }}
                        inputRef={searchInputRef}
                        composing={composing}
                    />


                    {/* Conversations List - Only show actual conversations with messages */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {conversations.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                <div style={{ color: C.text, fontWeight: 500, marginBottom: 4 }}>No Conversations Yet</div>
                                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>Search For People To Start Messaging!</div>
                                <button
                                    onClick={() => {
                                        setComposing(true);
                                        setTimeout(() => searchInputRef.current?.focus(), 100);
                                    }}
                                    style={{
                                        padding: '12px 24px',
                                        background: C.blue,
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 24,
                                        fontWeight: 600,
                                        fontSize: 15,
                                        cursor: 'pointer',
                                        marginTop: 16,
                                    }}>Search For People</button>
                            </div>
                        ) : (
                            <>
                                {/* Jarvis AI - Locked at Top */}
                                <div
                                    onClick={() => handleSelectConversation({
                                        id: 'jarvis-ai',
                                        isJarvis: true,
                                        otherUser: {
                                            id: 'jarvis',
                                            username: 'jarvis',
                                            full_name: 'Jarvis',
                                            avatar_url: null
                                        },
                                        last_message_preview: 'Your Poker AI Assistant',
                                        last_message_at: new Date().toISOString(),
                                        unreadCount: 0
                                    })}
                                    style={{
                                        padding: '12px 16px',
                                        cursor: 'pointer',
                                        background: activeConversation?.id === 'jarvis-ai'
                                            ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 150, 255, 0.1))'
                                            : '#2a2a2a',
                                        borderBottom: `1px solid ${C.border}`,
                                        borderLeft: activeConversation?.id === 'jarvis-ai' ? '3px solid #00D4FF' : '3px solid transparent',
                                        transition: 'all 0.2s',
                                        position: 'relative'
                                    }}
                                    onMouseEnter={e => {
                                        if (activeConversation?.id !== 'jarvis-ai') {
                                            e.currentTarget.style.background = 'rgba(0, 212, 255, 0.05)';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (activeConversation?.id !== 'jarvis-ai') {
                                            e.currentTarget.style.background = '#2a2a2a';
                                        }
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {/* Jarvis Avatar */}
                                        <Image src="/images/jarvis-avatar.png" alt="Jarvis AI" width={1024} height={682} style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            boxShadow: '0 2px 8px rgba(0, 212, 255, 0.3)',
                                            border: '2px solid #00D4FF',
                                            position: 'relative'
                                        }} />
                                        {/* Always Online Indicator */}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: 36,
                                            width: 14,
                                            height: 14,
                                            borderRadius: '50%',
                                            background: C.green,
                                            border: '2px solid white'
                                        }} />

                                        {/* Jarvis Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                marginBottom: 4
                                            }}>
                                                <span style={{
                                                    fontWeight: 600,
                                                    fontSize: 15,
                                                    color: '#00D4FF'
                                                }}>Jarvis</span>
                                            </div>
                                            <div style={{
                                                fontSize: 13,
                                                color: '#00D4FF',
                                                lineHeight: 1.3
                                            }}>
                                                Your Personal Smarter.Poker Coach - Always Online Always Available! Ask Me Anything...
                                            </div>
                                        </div>
                                    </div>
                                </div>



                                {/* Regular Conversations */}
                                {conversations.filter(conv => {
                                    if (!searchQuery) return true;
                                    const q = searchQuery.toLowerCase();
                                    const otherName = conv.otherUser?.full_name?.toLowerCase() || '';
                                    const otherUsername = conv.otherUser?.username?.toLowerCase() || '';
                                    return otherName.includes(q) || otherUsername.includes(q);
                                }).sort((a, b) => {
                                    // Pinned conversations always sort to top (using localStorage-backed state)
                                    const aPinned = pinnedConvoIds.includes(a.id);
                                    const bPinned = pinnedConvoIds.includes(b.id);
                                    if (aPinned && !bPinned) return -1;
                                    if (!aPinned && bPinned) return 1;
                                    return 0; // Preserve existing chronological order
                                }).map(conv => (
                                    <ConversationItem
                                        key={conv.id}
                                        conversation={conv}
                                        isActive={activeConversation?.id === conv.id}
                                        onClick={() => handleSelectConversation(conv)}
                                        currentUserId={user.id}
                                        onlineUsers={onlineUsers}
                                        isPinned={pinnedConvoIds.includes(conv.id)}
                                        onPin={(id) => {
                                            setPinnedConvoIds(prev => {
                                                const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
                                                try { localStorage.setItem('sp-pinned-conversations', JSON.stringify(next)); } catch {}
                                                return next;
                                            });
                                        }}
                                        onDelete={async (id) => {
                                            // Optimistic UI: remove immediately
                                            setConversations(prev => prev.filter(c => c.id !== id));
                                            if (activeConversation?.id === id) {
                                                setActiveConversation(null);
                                                setShowSidebar(true);
                                            }
                                            // Persist: delete from Supabase so it doesn't reappear on refresh
                                            try {
                                                const token = getAccessToken();
                                                await fetch('/api/messenger/delete-conversation', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                    },
                                                    body: JSON.stringify({ conversationId: id, userId: user.id }),
                                                });
                                                busEmit.dataMutated('messenger');
                                            } catch (e) {
                                                console.error('[Messenger] Delete conversation failed:', e);
                                                // Re-fetch to restore if delete failed
                                                loadConversations(user.id);
                                            }
                                        }}
                                    />
                                ))}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: 12,
                        borderTop: `1px solid ${C.border}`,
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}>
                        <ReportBugWidget contextPath="/hub/messenger" />
                        
                        <Link href="/hub/social-media" style={{
                            color: C.blue, fontSize: 14, fontWeight: 500, textDecoration: 'none',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28, borderRadius: '50%', background: C.bg,
                                fontSize: 14, color: C.text,
                            }}>←</span>
                            Back To Social Hub
                        </Link>
                    </div>
                </aside>

                {/* ════════════════════════════════════════════════════════
                    RIGHT PANEL - Chat Window
                    ════════════════════════════════════════════════════════ */}
                <main style={{
                    flex: 1,
                    display: (isMobile && showSidebar) ? 'none' : 'flex',
                    flexDirection: 'column',
                    background: C.card,
                    position: 'relative', // Phase 3 BUGFIX: anchor for scroll-to-bottom FAB
                }}>
                    {
                        activeConversation ? (
                            <>
                                {/* Chat Header */}
                                <div style={{
                                    padding: '10px 16px',
                                    borderBottom: `1px solid ${C.border}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    background: C.card,
                                }}>
                                    {isMobile && (
                                        <button
                                            onClick={() => {
                                                setShowSidebar(true);
                                                setActiveConversation(null);
                                            }}
                                            style={{
                                                background: C.bg, border: 'none', cursor: 'pointer',
                                                fontSize: 16, padding: '6px 10px',
                                                borderRadius: 8, color: C.blue, fontWeight: 600,
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                marginRight: 4,
                                            }}
                                            aria-label="Back to conversations"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="15 18 9 12 15 6" />
                                            </svg>
                                            Back
                                        </button>
                                    )}

                                    <Link href={`/hub/user/${otherUser?.username}`}>
                                        <Avatar src={otherUser?.avatar_url} name={otherUser?.username} size={40} online={otherUserStatus === 'online'} />
                                    </Link>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 15 }}>{otherUser?.username}</div>
                                        <div style={{ fontSize: 12, color: otherUserStatus === 'online' ? C.green : C.textSec }}>
                                            {otherUserStatus === 'online' ? 'Active Now' : otherUserLastSeen ? `Active ${(() => {
                                                const diff = Date.now() - new Date(otherUserLastSeen).getTime();
                                                const mins = Math.floor(diff / 60000);
                                                if (mins < 1) return 'just now';
                                                if (mins < 60) return `${mins}m ago`;
                                                const hrs = Math.floor(mins / 60);
                                                if (hrs < 24) return `${hrs}h ago`;
                                                return `${Math.floor(hrs / 24)}d ago`;
                                            })()}` : 'Offline'}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={() => setShowMessageSearch(!showMessageSearch)}
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: showMessageSearch ? C.bg : 'transparent',
                                                border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}
                                            title="Search Messages"
                                        ><SearchIcon size={20} /></button>
                                        <button
                                            onClick={() => startCall('audio')}
                                            title="Voice Call"
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}><PhoneIcon size={20} /></button>
                                        <button
                                            onClick={() => startCall('video')}
                                            title="Video Call"
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}><VideoIcon size={20} /></button>
                                        <button
                                            onClick={() => setShowUserInfo(!showUserInfo)}
                                            title="User Info"
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: showUserInfo ? C.bg : 'transparent', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}><InfoIcon size={20} /></button>
                                    </div>
                                </div >

                                {/* Message Search Bar */}
                                {
                                    showMessageSearch && (
                                        <div style={{
                                            padding: '8px 16px',
                                            borderBottom: `1px solid ${C.border}`,
                                            background: C.bg,
                                            position: 'relative',
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                background: C.card,
                                                borderRadius: 20,
                                                padding: '0 12px',
                                                border: `1px solid ${C.border}`,
                                            }}>
                                                <span style={{ color: C.textSec, marginRight: 8 }}></span>
                                                <input
                                                    type="text"
                                                    value={messageSearchQuery}
                                                    onChange={e => {
                                                        setMessageSearchQuery(e.target.value);
                                                        handleMessageSearch(e.target.value);
                                                    }}
                                                    placeholder="Search In This Conversation..."
                                                    style={{
                                                        flex: 1,
                                                        border: 'none',
                                                        background: 'transparent',
                                                        padding: '8px 0',
                                                        fontSize: 14,
                                                        outline: 'none',
                                                    }}
                                                />
                                                {messageSearchQuery && (
                                                    <button
                                                        onClick={() => { setMessageSearchQuery(''); setMessageSearchResults([]); }}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: C.textSec, fontSize: 14,
                                                        }}
                                                    >×</button>
                                                )}
                                            </div>

                                            {/* Search Results Dropdown */}
                                            {messageSearchResults.length > 0 && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: 16,
                                                    right: 16,
                                                    background: C.card,
                                                    borderRadius: 8,
                                                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                                                    maxHeight: 240,
                                                    overflowY: 'auto',
                                                    zIndex: 100,
                                                }}>
                                                    <div style={{ padding: '8px 12px', fontSize: 12, color: C.textSec, borderBottom: `1px solid ${C.border}` }}>
                                                        {messageSearchResults.length} result{messageSearchResults.length !== 1 ? 's' : ''}
                                                    </div>
                                                    {messageSearchResults.map(result => (
                                                        <div
                                                            key={result.id}
                                                            onClick={() => {
                                                                // Scroll to message (future: highlight it)
                                                                const el = document.getElementById(`msg-${result.id}`);
                                                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                setShowMessageSearch(false);
                                                                setMessageSearchQuery('');
                                                                setMessageSearchResults([]);
                                                            }}
                                                            style={{
                                                                padding: '10px 12px',
                                                                borderBottom: `1px solid ${C.border}`,
                                                                cursor: 'pointer',
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                        >
                                                            <div style={{ fontSize: 13, color: C.text, marginBottom: 2 }}>
                                                                {result.content.slice(0, 80)}{result.content.length > 80 ? '...' : ''}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: C.textSec }}>
                                                                {timeAgo(result.created_at)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                }

                                {/* Messages */}
                                {/* Phase 3: Connection status banner */}
                                {connectionStatus !== 'connected' && (
                                    <div style={{
                                        padding: '6px 16px',
                                        background: connectionStatus === 'reconnecting' ? '#FFA500' : C.red,
                                        color: 'white',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                    }}>
                                        <span style={{ animation: connectionStatus === 'reconnecting' ? 'pulse 1.5s infinite' : 'none' }}>
                                            {connectionStatus === 'reconnecting' ? '⟳' : '!'}
                                        </span>
                                        {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Connection Lost'}
                                    </div>
                                )}

                                <div
                                    ref={messagesContainerRef}
                                    onScroll={(e) => {
                                        // Infinite scroll — load older messages when near top
                                        if (e.target.scrollTop < 100 && hasMoreMessages && !loadingOlderMessages) {
                                            loadOlderMessages();
                                        }
                                        // Phase 3: Show scroll-to-bottom FAB when scrolled up
                                        // BUGFIX: Only call setState when value actually changes to avoid re-renders on every scroll frame
                                        const el = e.target;
                                        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                                        const shouldShow = distFromBottom > 200;
                                        setShowScrollDown(prev => prev === shouldShow ? prev : shouldShow);
                                    }}
                                    style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '16px 0',
                                    position: 'relative',
                                }}>
                                    {/* Loading older messages indicator */}
                                    {loadingOlderMessages && (
                                        <div style={{ textAlign: 'center', padding: '12px 0', color: C.textSec, fontSize: 13 }}>
                                            Loading older messages...
                                        </div>
                                    )}
                                    {/* User info header */}
                                    <div style={{ textAlign: 'center', marginBottom: 24, padding: '0 20px' }}>
                                        <Avatar src={otherUser?.avatar_url} name={otherUser?.username} size={80} showOnline={false} />
                                        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 17 }}>{otherUser?.username}</div>
                                        <div style={{ color: C.textSec, fontSize: 13 }}>Smarter.Poker Member</div>
                                        <Link href={`/hub/user/${otherUser?.username}`} style={{
                                            display: 'inline-block',
                                            marginTop: 12,
                                            padding: '8px 16px',
                                            background: C.bg,
                                            borderRadius: 8,
                                            color: C.text,
                                            textDecoration: 'none',
                                            fontSize: 14,
                                            fontWeight: 500,
                                        }}>View Profile</Link>
                                    </div>

                                    {loadingMessages ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                                            Loading messages...
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: C.textSec }}>
                                            <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                                            Say hi to start the conversation!
                                        </div>
                                    ) : (() => {
                                        const _today = new Date();
                                        const _yesterday = new Date(_today);
                                        _yesterday.setDate(_today.getDate() - 1);
                                        return (
                                        messages.map((msg, i) => {
                                            const isOwn = msg.sender_id === user.id;
                                            const prevMsg = messages[i - 1];
                                            const nextMsg = messages[i + 1];
                                            const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                                            const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;

                                            // Date divider — show between messages on different days
                                            const msgDate = new Date(msg.created_at);
                                            const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;
                                            const showDateDivider = !prevDate ||
                                                msgDate.toDateString() !== prevDate.toDateString();

                                            let dateLabel = '';
                                            if (showDateDivider) {
                                                if (msgDate.toDateString() === _today.toDateString()) dateLabel = 'Today';
                                                else if (msgDate.toDateString() === _yesterday.toDateString()) dateLabel = 'Yesterday';
                                                else dateLabel = msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: msgDate.getFullYear() !== _today.getFullYear() ? 'numeric' : undefined });
                                            }

                                            return (
                                                <Fragment key={msg.id}>
                                                    {showDateDivider && (
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: 12,
                                                            padding: '12px 16px', margin: '4px 0',
                                                        }}>
                                                            <div style={{ flex: 1, height: 1, background: C.border }} />
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: C.textSec, whiteSpace: 'nowrap',
                                                                letterSpacing: '0.3px',
                                                            }}>{dateLabel}</span>
                                                            <div style={{ flex: 1, height: 1, background: C.border }} />
                                                        </div>
                                                    )}
                                                    <MessageBubble
                                                        message={msg}
                                                        isOwn={isOwn}
                                                        showAvatar={showAvatar}
                                                        sender={msg.profiles}
                                                        showTime={isLastInGroup}
                                                        isLastInGroup={isLastInGroup}
                                                        onRetry={handleRetryMessage}
                                                        onReact={handleReaction}
                                                        onDelete={handleDeleteMessage}
                                                        onEdit={handleEditMessage}
                                                        onForward={handleForwardMessage}
                                                        onCallBack={startCall}
                                                        currentUserId={user.id}
                                                    />
                                                </Fragment>
                                            );
                                        })
                                    ); })()}
                                    {/* Typing indicator */}
                                    {otherTyping && <TypingIndicator name={otherUser?.username} />}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Phase 3: Scroll-to-bottom FAB */}
                                {showScrollDown && (
                                    <button
                                        onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                                        style={{
                                            position: 'absolute',
                                            bottom: 80,
                                            right: 20,
                                            width: 40,
                                            height: 40,
                                            borderRadius: '50%',
                                            background: C.card,
                                            border: `1px solid ${C.border}`,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            zIndex: 20,
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)'; }}
                                        aria-label="Scroll to bottom"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                    </button>
                                )}

                                {/* Identity Banner - shows when messaging as Club Page */}
                                {isClubMode && clubPage && hasClubPage && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '6px 16px',
                                        background: '#E7F3FF',
                                        borderTop: `1px solid ${C.border}`,
                                        fontSize: 13, color: '#1877F2'
                                    }}>
                                        <div style={{
                                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                            background: clubPage.avatar_url ? `url(${clubPage.avatar_url}) center/cover` : '#1877F2',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', fontSize: 9, fontWeight: 700
                                        }}>
                                            {!clubPage.avatar_url && (clubPage.name?.[0] || 'C')}
                                        </div>
                                        <span style={{ fontWeight: 600 }}>Messaging as {clubPage.name}</span>
                                    </div>
                                )}
                                {/* Message Input */}
                                {/* Edit bar — shows when editing a message */}
                                {editingMessage && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 16px', background: '#E7F3FF',
                                        borderTop: `1px solid ${C.border}`,
                                    }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 11, color: C.blue, fontWeight: 600 }}>Editing Message</div>
                                            <input
                                                type="text" value={editText}
                                                onChange={e => setEditText(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') handleEditCancel(); }}
                                                style={{
                                                    width: '100%', border: 'none', background: 'transparent',
                                                    fontSize: 14, outline: 'none', color: C.text,
                                                }}
                                                autoFocus
                                            />
                                        </div>
                                        <button onClick={handleEditCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 18 }}>×</button>
                                        <button onClick={handleEditSave} style={{ background: C.blue, border: 'none', borderRadius: 6, color: 'white', padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Save</button>
                                    </div>
                                )}

                                <MessageInput onSend={handleSendMessage} onTyping={broadcastTyping} onMediaUpload={handleMediaUpload} onGifSend={handleGifSend} />
                            </>
                        ) : (
                            /* No conversation selected */
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column',
                                color: C.textSec,
                            }}>
                                <div style={{ fontSize: 80, marginBottom: 16 }}></div>
                                <h2 style={{ margin: 0, color: C.text, fontWeight: 600 }}>Select A Conversation</h2>
                                <p style={{ marginTop: 8, color: C.textSec }}>Choose From Your Existing Chats Or Search For Someone New</p>
                            </div>
                        )}
                </main >

                {/* Jarvis is now integrated as a conversation in the list */}
            </div >
        </>
    );
}

export default function MessengerPageWithBoundary() {
    return (
        <HubErrorBoundary name="Messenger">
            <MessengerPage />
            {/* BottomNavBar intentionally removed — messenger is full-screen chat; the nav bar was overlaying the message input area and blocking user interaction */}
        </HubErrorBoundary>
    );
}
