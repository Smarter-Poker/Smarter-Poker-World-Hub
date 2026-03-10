/**
 * CLUB ARENA — Messages | Full Feature Parity with Social Messenger
 * Full-featured messaging: video/voice calls, media uploads, GIFs, reactions
 * Uses Social messaging infrastructure with club member filtering
 */
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import SEOHead from '../../../src/components/seo/SEOHead';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import { haptic } from '../../../src/lib/club-arena/haptic';
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh';
import { createMultiDeviceAuthListener, persistSession } from '../../../src/utils/authGuard';
import { createRingTone } from '../../../src/utils/ringTone';
import useDebounce from '../../../src/hooks/useDebounce';
import usePersistedState from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import { resolveAvatarDisplay } from '../../../src/lib/resolveAvatarDisplay';
import useWalletData from '../../../src/hooks/useWalletData';
// Local helper — reads token from localStorage (same pattern as other club-arena pages)
const getAccessToken = () => {
    try {
        const cached = localStorage.getItem('smarter-poker-auth');
        if (cached) { try { const p = JSON.parse(cached); if (p?.access_token) return p.access_token; } catch (e) { /* */ } }
    } catch (_) { }
    return null;
};

// Dynamic import for LiveKit (client-side only)
const LiveKitCall = dynamic(
    () => import('../../../src/components/video/LiveKitCall'),
    { ssr: false }
);

const DynamicWallet = dynamic(
    () => import('../../../src/components/club-arena/DynamicWallet'),
    { ssr: false, loading: () => null }
);
// EmojiPicker removed — built-in quick emoji grid in MessageInput handles this
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
const ClubAnnouncementBanner = dynamic(
    () => import('../../../src/components/club-arena/ClubAnnouncementBanner'),
    { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════════════
//  SMARTERPOKER DARK COLOR PALETTE
// ═══════════════════════════════════════════════════════════════════════════

const C = {
    bg: '#18191A',
    card: '#242526',
    text: '#E4E6EB',
    textSec: '#B0B3B8',
    blue: '#0084FF',
    blueHover: '#0073E6',
    green: '#31A24C',
    red: '#E41E3F',
    border: '#3E4042',
    hoverBg: '#3A3B3C',
    ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)',
    otherBubble: '#3A3B3C',
};

// Inject CSS keyframes (once)
if (typeof document !== 'undefined' && !document.getElementById('club-messages-anim')) {
    const style = document.createElement('style');
    style.id = 'club-messages-anim';
    style.textContent = `
        @keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    `;
    document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SVG ICONS
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
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function playMessageSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0tRXFuYz0mFTNNaWxofmh+YKStoJd/aGtbL09OYUFRYWOHeoKK');
        audio.volume = 0.3;
        audio.play().catch(() => { });
    } catch (e) { console.error("[messages.js]", e); }
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

function formatDateSeparator(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function isSameDay(ts1, ts2) {
    if (!ts1 || !ts2) return false;
    const d1 = new Date(ts1), d2 = new Date(ts2);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

// URL detection regex for clickable links
const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

function renderTextWithLinks(text) {
    if (!text || typeof text !== 'string') return text;
    const parts = text.split(URL_REGEX);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
        // Reset regex lastIndex since it's global
        URL_REGEX.lastIndex = 0;
        if (URL_REGEX.test(part)) {
            URL_REGEX.lastIndex = 0;
            const display = part.length > 50 ? part.substring(0, 47) + '...' : part;
            return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#58A6FF', textDecoration: 'underline', wordBreak: 'break-all' }}>{display}</a>;
        }
        return part;
    });
}

// Quick reaction emoji set
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// ═══════════════════════════════════════════════════════════════════════════
//  AVATAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Avatar({ src, name, size = 40, online, showOnline = true }) {
    const resolved = resolveAvatarDisplay(src, name || '');

    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            <img src={resolved} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} loading="lazy"
                onError={(e) => {
                    e.target.src = resolveAvatarDisplay(null, name || '');
                }}
            />
            {showOnline && online && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.3, height: size * 0.3, borderRadius: '50%', background: C.green, border: `2px solid ${C.card}` }} />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOAST COMPONENT
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
            position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
            background: toast.type === 'error' ? C.red : toast.type === 'info' ? C.blue : C.green,
            color: 'white', padding: '12px 24px', borderRadius: 24, fontSize: 14, fontWeight: 500,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999,
        }}>
            {toast.message}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ⌨ MESSAGE INPUT COMPONENT (Full-featured)
// ═══════════════════════════════════════════════════════════════════════════

function MessageInput({ onSend, onMediaUpload, disabled, onTyping, onGifToggle, showGifActive }) {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);

    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);

    const emojis = ['😂', '❤️', '👍', '🔥', '😎', '😢', '😱', '🙌', '🎉', '👀', '💯', '✌️', '🤔', '🙏', '💥', '🏆'];

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

    const handleInputChange = (e) => {
        setText(e.target.value);
        onTyping?.();
    };

    const handleQuickLike = () => {
        onSend('👍');
    };

    return (
        <div style={{ padding: '12px 16px', background: C.card, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Photo/Video/Doc Upload */}
            <input type="file" ref={fileInputRef} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: 'none' }}
                onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !onMediaUpload) return;
                    setUploading(true);
                    try { await onMediaUpload(file); }
                    finally { setUploading(false); e.target.value = ''; }
                }}
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Send Photo Or Video"
                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', cursor: uploading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.5 : 1, padding: 0 }}>
                {uploading ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}>
                        <circle cx="12" cy="12" r="10" stroke={C.blue} strokeWidth="2" fill="none" strokeDasharray="31.4" strokeLinecap="round">
                            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
                        </circle>
                    </svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke={C.blue} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>

            {/* GIF button */}
            {onGifToggle && (
                <button onClick={onGifToggle} title="Send GIF"
                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: showGifActive ? C.blue : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: showGifActive ? '#fff' : C.blue }}>GIF</span>
                </button>
            )}

            {/* P3-10: Voice Recording Button (Hold to Record) */}
            {onMediaUpload && (
                <button
                    onMouseDown={async () => {
                        try {
                            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                            const recorder = new MediaRecorder(stream);
                            mediaRecorderRef.current = recorder;
                            audioChunksRef.current = [];
                            recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
                            recorder.onstop = async () => {
                                stream.getTracks().forEach(t => t.stop());
                                clearInterval(recordingTimerRef.current);
                                setRecordingDuration(0);
                                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                                if (blob.size > 500) {
                                    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
                                    await onMediaUpload(file);
                                }
                            };
                            recorder.start();
                            setIsRecording(true);
                            setRecordingDuration(0);
                            recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
                        } catch (e) { console.error('Mic access denied:', e); }
                    }}
                    onMouseUp={() => { if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stop(); setIsRecording(false); } }}
                    onTouchStart={async (e) => {
                        e.preventDefault();
                        try {
                            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                            const recorder = new MediaRecorder(stream);
                            mediaRecorderRef.current = recorder;
                            audioChunksRef.current = [];
                            recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
                            recorder.onstop = async () => {
                                stream.getTracks().forEach(t => t.stop());
                                clearInterval(recordingTimerRef.current);
                                setRecordingDuration(0);
                                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                                if (blob.size > 500) {
                                    const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
                                    await onMediaUpload(file);
                                }
                            };
                            recorder.start();
                            setIsRecording(true);
                            setRecordingDuration(0);
                            recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
                        } catch (e) { console.error('Mic access denied:', e); }
                    }}
                    onTouchEnd={() => { if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stop(); setIsRecording(false); } }}
                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: isRecording ? C.red : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'background 0.2s' }}
                    title="Hold to record voice message"
                >
                    {isRecording ? (
                        <span style={{ fontSize: 10, color: 'white', fontWeight: 700 }}>{recordingDuration}s</span>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill={C.blue} /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill={C.blue} /></svg>
                    )}
                </button>
            )}

            {/* Input wrapper */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: C.hoverBg, borderRadius: 24, padding: '0 12px', position: 'relative' }}>
                <input ref={inputRef} type="text" value={text} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder="Aa" disabled={disabled}
                    style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 0', fontSize: 15, outline: 'none', color: C.text }} />

                <button onClick={() => setShowEmoji(!showEmoji)} title="Choose Emoji"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke={C.blue} strokeWidth="1.5" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="9" cy="10" r="1" fill={C.blue} />
                        <circle cx="15" cy="10" r="1" fill={C.blue} />
                    </svg>
                </button>

                {showEmoji && (
                    <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 8, background: C.card, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, zIndex: 100 }}>
                        {emojis.map(emoji => (
                            <button key={emoji} onClick={() => { setText(prev => prev + emoji); setShowEmoji(false); }}
                                style={{ width: 32, height: 32, border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 18 }}>{emoji}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* Send / Like button */}
            <button onClick={text.trim() ? handleSend : handleQuickLike} title={text.trim() ? "Send message" : "Send like"}
                style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: text.trim() ? C.blue : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                {text.trim() ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill={C.blue}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" stroke={C.blue} strokeWidth="1.5" fill="none" /></svg>
                )}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MESSAGE BUBBLE COMPONENT (with media support)
// ═══════════════════════════════════════════════════════════════════════════

function MessageBubble({ message, isOwn, showAvatar, sender, showTime, isLastInGroup, onRetry, onDelete, onReact, onEdit, onReply, onForward }) {
    const [showReactions, setShowReactions] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const [translatedText, setTranslatedText] = useState(null);
    const [translating, setTranslating] = useState(false);
    const content = message.content || message.message || '';
    const isFailed = message.status === 'failed';
    const isSending = message.status === 'sending';
    const isDeleted = message.is_deleted;
    const isEdited = message.updated_at && message.created_at && new Date(message.updated_at).getTime() - new Date(message.created_at).getTime() > 1000;
    const canEdit = isOwn && !isFailed && !isSending && !isDeleted && (Date.now() - new Date(message.created_at).getTime() < 5 * 60 * 1000);
    const replyRef = message.reply_to;

    // Check for image markdown: [Image](url)
    const imageMatch = content.match(/\[Image\]\(([^)]+)\)/);
    const videoMatch = content.match(/\[Video\]\(([^)]+)\)/);
    const audioMatch = content.match(/\[Audio\]\(([^)]+)\)/) || content.match(/\[voice-[^\]]*\.webm\]\(([^)]+)\)/);
    const fileMatch = content.match(/\[(File|PDF|DOC|XLS|TXT|CSV)[^\]]*\]\(([^)]+)\)/i);

    if (isDeleted) {
        return (
            <div style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: isLastInGroup ? 16 : 2, paddingLeft: isOwn ? 60 : 12, paddingRight: isOwn ? 12 : 60 }}>
                <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: 18, background: 'transparent', border: `1px solid ${C.border}`, color: C.textSec, fontSize: 14, fontStyle: 'italic' }}>
                    🚫 Message deleted
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: isLastInGroup ? 16 : 2, paddingLeft: isOwn ? 60 : 12, paddingRight: isOwn ? 12 : 60, position: 'relative' }}
            onMouseEnter={() => setShowReactions(false)}
        >
            {!isOwn && (showAvatar ? <Avatar src={sender?.avatar_url} name={sender?.username || sender?.display_name} size={28} showOnline={false} /> : <div style={{ width: 28 }} />)}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                {/* Quoted reply bubble */}
                {replyRef && (
                    <div style={{ padding: '4px 10px', marginBottom: 2, borderRadius: 12, background: 'rgba(255,255,255,0.08)', borderLeft: `3px solid ${C.blue}`, fontSize: 12, color: C.textSec, maxWidth: '100%' }}>
                        <div style={{ fontWeight: 600, fontSize: 11, color: C.blue, marginBottom: 1 }}>{replyRef.senderName || 'User'}</div>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyRef.preview?.slice(0, 60)}{replyRef.preview?.length > 60 ? '...' : ''}</div>
                    </div>
                )}
                {imageMatch ? (
                    <img src={imageMatch[1]} alt="Shared Image" style={{ maxWidth: '100%', borderRadius: 12, cursor: 'pointer' }} onClick={() => window.open(imageMatch[1], '_blank')} />
                ) : videoMatch ? (
                    <video src={videoMatch[1]} controls style={{ maxWidth: '100%', borderRadius: 12 }} />
                ) : audioMatch ? (
                    <div style={{ padding: '8px 12px', borderRadius: 16, background: isOwn ? C.ownBubble : C.otherBubble, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>🎙️</span>
                        <audio src={audioMatch[1] || audioMatch[2]} controls style={{ height: 32, maxWidth: 200 }} />
                    </div>
                ) : fileMatch ? (
                    <a href={fileMatch[2]} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: isOwn ? C.ownBubble : C.otherBubble, textDecoration: 'none', color: 'white' }}>
                        <span style={{ fontSize: 24 }}>{fileMatch[1]?.toUpperCase() === 'PDF' ? '📄' : fileMatch[1]?.toUpperCase() === 'DOC' ? '📝' : fileMatch[1]?.toUpperCase() === 'XLS' ? '📊' : '📎'}</span>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{fileMatch[1]} Document</div>
                            <div style={{ fontSize: 11, opacity: 0.7 }}>Tap to download</div>
                        </div>
                    </a>
                ) : (
                    <div style={{
                        padding: '8px 12px',
                        borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        background: isFailed ? 'rgba(228,30,63,0.3)' : isOwn ? C.ownBubble : C.otherBubble,
                        color: 'white', fontSize: 15, lineHeight: 1.4, wordBreak: 'break-word',
                        opacity: isSending ? 0.6 : 1,
                        position: 'relative',
                    }}>
                        {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { onEdit?.(message.id, editText); setIsEditing(false); } if (e.key === 'Escape') setIsEditing(false); }}
                                    autoFocus style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 8px', color: 'white', fontSize: 14, outline: 'none', width: '100%' }} />
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setIsEditing(false)} style={{ fontSize: 11, color: C.textSec, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
                                    <button onClick={() => { onEdit?.(message.id, editText); setIsEditing(false); }} style={{ fontSize: 11, color: C.blue, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                                </div>
                            </div>
                        ) : (
                            <>{renderTextWithLinks(content)}{isEdited && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>(edited)</span>}{translatedText && <div style={{ marginTop: 4, fontSize: 13, color: C.blue, fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>🌐 {translatedText}</div>}</>
                        )}

                        {/* Quick react button (on hover) */}
                        {!isFailed && !isSending && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowReactions(!showReactions); }}
                                style={{ position: 'absolute', top: -12, [isOwn ? 'left' : 'right']: -8, width: 24, height: 24, borderRadius: '50%', background: C.card, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7, padding: 0 }}
                                title="React"
                            >😀</button>
                        )}

                        {/* Reaction picker */}
                        {showReactions && (
                            <div style={{ position: 'absolute', top: -40, [isOwn ? 'left' : 'right']: 0, display: 'flex', gap: 2, background: C.card, borderRadius: 20, padding: '4px 8px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 50 }}>
                                {REACTION_EMOJIS.map(emoji => (
                                    <button key={emoji} onClick={() => { onReact?.(message.id, emoji); setShowReactions(false); }}
                                        style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, borderRadius: '50%', padding: 0 }}>
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Reactions display */}
                {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        {Object.entries(message.reactions).map(([emoji, count]) => (
                            <span key={emoji} style={{ background: C.hoverBg, borderRadius: 12, padding: '2px 6px', fontSize: 12, cursor: 'pointer' }}>{emoji} {count > 1 ? count : ''}</span>
                        ))}
                    </div>
                )}

                {/* Status indicators */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    {showTime && <span style={{ fontSize: 11, color: C.textSec, whiteSpace: 'nowrap' }}>{formatMessageTime(message.created_at)}</span>}
                    {isOwn && isSending && <span style={{ fontSize: 11, color: C.textSec }}>⏳</span>}
                    {isOwn && message.status === 'sent' && <span style={{ fontSize: 11, color: C.textSec }}>✓</span>}
                    {isOwn && message.read_at && <span style={{ fontSize: 11, color: C.blue }}>✓✓</span>}
                    {isFailed && (
                        <button onClick={() => onRetry?.(message)} style={{ fontSize: 12, color: C.red, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', fontWeight: 600 }}>
                            ⚠️ Retry
                        </button>
                    )}
                    {isOwn && !isFailed && !isSending && onDelete && (
                        <button onClick={() => onDelete?.(message.id)} style={{ fontSize: 11, color: C.textSec, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', opacity: 0.5 }} title="Delete">
                            🗑️
                        </button>
                    )}
                    {canEdit && onEdit && (
                        <button onClick={() => { setEditText(content); setIsEditing(true); }} style={{ fontSize: 11, color: C.textSec, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', opacity: 0.5 }} title="Edit (5 min window)">
                            ✏️
                        </button>
                    )}
                    {!isFailed && !isSending && !isDeleted && onReply && (
                        <button onClick={() => onReply(message)} style={{ fontSize: 11, color: C.textSec, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', opacity: 0.5 }} title="Reply">
                            ↩️
                        </button>
                    )}
                    {!isFailed && !isSending && !isDeleted && onForward && (
                        <button onClick={() => onForward(message)} style={{ fontSize: 11, color: C.textSec, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', opacity: 0.5 }} title="Forward">
                            ➤
                        </button>
                    )}
                    {/* P3-12: Auto-Translation */}
                    {!isOwn && !isDeleted && !isSending && (
                        <button onClick={async () => {
                            if (translatedText) { setTranslatedText(null); return; }
                            setTranslating(true);
                            try {
                                const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(content.slice(0, 500))}&langpair=autodetect|en`);
                                const data = await resp.json();
                                if (data.responseData?.translatedText) setTranslatedText(data.responseData.translatedText);
                            } catch (e) { console.error('Translation failed:', e); }
                            setTranslating(false);
                        }} style={{ fontSize: 11, color: translatedText ? C.blue : C.textSec, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', opacity: translatedText ? 1 : 0.5 }} title={translatedText ? 'Show original' : 'Translate'}>
                            {translating ? '⏳' : '🌐'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONVERSATION LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

function ConversationItem({ conversation, isActive, onClick, isPinned, onPin, isMuted, onMute, isArchived, onArchive }) {
    const otherUser = conversation.otherUser;
    const lastMsg = conversation.last_message_preview;
    const isUnread = conversation.unreadCount > 0;

    return (
        <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer', background: isActive ? C.hoverBg : 'transparent', borderRadius: 8, margin: '2px 8px', transition: 'background 0.15s', position: 'relative' }}>
            {isPinned && <div style={{ position: 'absolute', top: 4, left: 14, fontSize: 10, color: C.blue }}>📌</div>}
            <Avatar src={otherUser?.avatar_url} name={otherUser?.username || otherUser?.display_name} size={56} online={otherUser?.online} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: isUnread ? 600 : 500, fontSize: 15, color: C.text, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {otherUser?.display_name || otherUser?.username || 'Unknown Player'}
                    {isMuted && <span style={{ fontSize: 12 }} title="Muted">🔕</span>}
                </div>
                <div style={{ fontSize: 13, color: isUnread ? C.text : C.textSec, fontWeight: isUnread ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lastMsg?.slice(0, 35)}{lastMsg?.length > 35 ? '...' : ''}
                    <span style={{ color: C.textSec }}> · {timeAgo(conversation.last_message_at)}</span>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {onPin && (
                    <button onClick={(e) => { e.stopPropagation(); onPin(conversation.id); }} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: isPinned ? C.blue : C.textSec, opacity: isPinned ? 1 : 0.4, padding: 0 }} title={isPinned ? 'Unpin' : 'Pin'}>
                        📌
                    </button>
                )}
                {onMute && (
                    <button onClick={(e) => { e.stopPropagation(); onMute(conversation.id); }} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: C.textSec, opacity: 0.4, padding: 0 }} title={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? '🔔' : '🔕'}
                    </button>
                )}
                {onArchive && (
                    <button onClick={(e) => { e.stopPropagation(); onArchive(conversation.id); }} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: C.textSec, opacity: 0.4, padding: 0 }} title={isArchived ? 'Unarchive' : 'Archive'}>
                        {isArchived ? '📤' : '📥'}
                    </button>
                )}
            </div>
            {isUnread && (
                <div style={{
                    minWidth: conversation.unreadCount > 9 ? 22 : 18,
                    height: 18,
                    borderRadius: 9,
                    background: C.blue,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    flexShrink: 0,
                }}>
                    {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount || ''}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN MESSAGES PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ClubMessages() {
    useTrainingBus('club-arena-messages');
    usePullToRefresh({ onRefresh: () => loadConversations?.() });
    const router = useRouter();
    if (!router.isReady) return null;
    const { club: clubIdParam } = router.query;
    const messagesEndRef = useRef(null);
    const outgoingRingToneRef = useRef(null);

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [clubMembers, setClubMembers] = useState([]);
    const [clubMemberIds, setClubMemberIds] = useState(new Set());
    const [currentUserMembership, setCurrentUserMembership] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = usePersistedState('sp-prefs-ca-messages-view', 'list');
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [searchResults, setSearchResults] = useState([]);
    const [toast, setToast] = useState(null);

    // Call state
    const [showCall, setShowCall] = useState(false);
    const [callRoomName, setCallRoomName] = useState(null);
    const [callType, setCallType] = useState('video');
    const [callingUser, setCallingUser] = useState(null);
    const [showUserInfo, setShowUserInfo] = useState(false);
    const [showMessageSearch, setShowMessageSearch] = useState(false);
    const [incomingCall, setIncomingCall] = useState(null);
    const [showWallet, setShowWallet] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // Typing indicator state
    const [typingUser, setTypingUser] = useState(null);
    const typingTimeoutRef = useRef(null);
    const lastTypingBroadcast = useRef(0);

    // Message search state
    const [messageSearchQuery, setMessageSearchQuery] = useState('');

    // Reply-To state
    const [replyTo, setReplyTo] = useState(null);

    // P3-1: Unread filter
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);

    // P3-2: Muted conversations (persisted)
    const [mutedConvIds, setMutedConvIds] = usePersistedState('sp-muted-convs', []);

    // P3-3: Archived conversations (persisted)
    const [archivedConvIds, setArchivedConvIds] = usePersistedState('sp-archived-convs', []);
    const [showArchived, setShowArchived] = useState(false);

    // P3-5: Message forwarding
    const [forwardingMessage, setForwardingMessage] = useState(null);

    // P3-8: Global search
    const [showGlobalSearch, setShowGlobalSearch] = useState(false);
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState([]);
    const [globalSearchLoading, setGlobalSearchLoading] = useState(false);

    // ═══ PHASE 2 — Premium Features ═══

    // P2-1: Message Labels
    const [messageLabels, setMessageLabels] = usePersistedState('sp-msg-labels', {});

    // P2-2: Disappearing Messages
    const [disappearingConvIds, setDisappearingConvIds] = usePersistedState('sp-disappearing-convs', []);

    // P2-3: Broadcast Mode
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [broadcastText, setBroadcastText] = useState('');
    const [broadcastSending, setBroadcastSending] = useState(false);

    // P2-4: Scheduled Messages
    const [scheduledMessages, setScheduledMessages] = usePersistedState('sp-scheduled-msgs', []);
    const [showScheduler, setShowScheduler] = useState(false);
    const [scheduleTime, setScheduleTime] = useState('');

    // P2-5: Message Bookmarks
    const [bookmarks, setBookmarks] = usePersistedState('sp-msg-bookmarks', []);
    const [showBookmarks, setShowBookmarks] = useState(false);

    // P2-6: Chat Themes
    const [chatThemes, setChatThemes] = usePersistedState('sp-chat-themes', {});
    const chatThemePresets = [
        { name: 'Default', bg: C.bg },
        { name: 'Midnight', bg: 'linear-gradient(180deg, #0a0a2e 0%, #1a1a3e 100%)' },
        { name: 'Emerald', bg: 'linear-gradient(180deg, #0d1117 0%, #0a1a0a 100%)' },
        { name: 'Crimson', bg: 'linear-gradient(180deg, #1a0a0a 0%, #2a1010 100%)' },
        { name: 'Ocean', bg: 'linear-gradient(180deg, #0a1929 0%, #0d2137 100%)' },
        { name: 'Gold', bg: 'linear-gradient(180deg, #1a1500 0%, #2a2200 100%)' },
    ];

    // P2-7: Message Templates
    const [templates, setTemplates] = usePersistedState('sp-msg-templates', [
        { id: 1, text: 'Your funds are ready for pickup! 💰', label: 'Cashout' },
        { id: 2, text: 'Tournament starts in 30 minutes! 🏆 Don\'t miss it.', label: 'Tournament' },
        { id: 3, text: 'Please verify your account to continue playing.', label: 'Verify' },
        { id: 4, text: 'Welcome to the club! Let me know if you need anything. 👋', label: 'Welcome' },
    ]);
    const [showTemplates, setShowTemplates] = useState(false);

    // GIF picker state
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifSearchQuery, setGifSearchQuery] = useState('');
    const [gifResults, setGifResults] = useState([]);
    const [gifLoading, setGifLoading] = useState(false);

    // Pagination state
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const messagesContainerRef = useRef(null);

    // Online presence state
    const [onlineUsers, setOnlineUsers] = useState(new Set());

    // Pinned conversations (persisted locally, max 3)
    const [pinnedIds, setPinnedIds] = usePersistedState('sp-pinned-convs', []);

    // Wallet data (real-time balances)
    const walletData = useWalletData({ supabase, userId: user?.id, clubId: club?.id });

    // Cleanup ringtone on unmount (prevents audio leak if user navigates away during a call)
    useEffect(() => {
        return () => {
            if (outgoingRingToneRef.current) {
                outgoingRingToneRef.current.stop();
                outgoingRingToneRef.current = null;
            }
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    //  ONLINE PRESENCE TRACKER (Supabase Presence API)
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!user?.id || !club?.id) return;

        const presenceChannel = supabase.channel(`presence:club-${club.id}`, {
            config: { presence: { key: user.id } }
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                const ids = new Set(Object.keys(state));
                setOnlineUsers(ids);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        user_id: user.id,
                        username: user.username || user.display_name,
                        online_at: new Date().toISOString()
                    });
                }
            });

        return () => {
            supabase.removeChannel(presenceChannel);
        };
    }, [user?.id, club?.id]);

    // ═══════════════════════════════════════════════════════════════════════
    //  BULLETPROOF AUTH
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        async function init(signal) {
            try {
                const authUser = getAuthUser();

                if (authUser) {
                    const { data: profile } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', authUser.id).maybeSingle();
                    const fullUser = { ...authUser, ...(profile || {}) };
                    setUser(fullUser);
                    persistSession(fullUser);
                } else {
                }
            } catch (e) {
                console.error('[ClubMessages] Init error:', e);
            }
        }
        init();
    }, []);

    // Multi-device auth listener
    useEffect(() => {
        const cleanup = createMultiDeviceAuthListener(supabase, async (authUser, event) => {

            if (!authUser) {
                setUser(null);
                setConversations([]);
                return;
            }

            const { data: profile } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', authUser.id).maybeSingle();
            setUser({ ...authUser, ...(profile || {}) });
        });

        return cleanup;
    }, []);

    // Load club and members (re-run when user loads so membership is found)
    useEffect(() => {
        if (clubIdParam) loadClubData(user?.id);
    }, [clubIdParam, user?.id]);

    // Load conversations when we have user and club members
    useEffect(() => {
        let isMounted = true;
        let pollTimeout;

        const runPoll = async () => {
            if (!isMounted) return;
            if (user && clubMemberIds.size > 0) {
                await loadConversations();
            }
            if (isMounted) {
                pollTimeout = setTimeout(runPoll, 15000);
            }
        };

        runPoll();

        // Listen for real-time EventBus signals to instantly refetch conversation previews
        const offBus = bus.on('DATA_MUTATED', (source) => {
            if (source === 'message_sent' || source === 'message_read') {
                if (user && clubMemberIds.size > 0) loadConversations();
            }
        });
        const offMsg = bus.on('MESSAGE_RECEIVED', () => {
            if (user && clubMemberIds.size > 0) loadConversations();
        });

        return () => {
            isMounted = false;
            clearTimeout(pollTimeout);
            offBus();
            offMsg();
        };
    }, [user, clubMemberIds, bus]);

    // ═══════════════════════════════════════════════════════════════════════
    //  MESSAGING HIERARCHY PERMISSION CHECKER
    // Hard Laws:
    // - Union Owner/Admins can message anyone
    // - Club Owners can message all their players
    // - Agents can ONLY message their downlines (assigned players)
    // - Players can ONLY message their agent or club admins
    // ═══════════════════════════════════════════════════════════════════════
    function canMessageUser(targetMember) {
        if (!currentUserMembership || !targetMember) return false;
        if (targetMember.user_id === user?.id) return false; // Can't message yourself

        const senderRole = currentUserMembership.role;
        const targetRole = targetMember.role;

        // Club owners can message anyone in their club
        if (senderRole === 'owner') return true;

        // Admins can message anyone in their club
        if (senderRole === 'admin') return true;

        // Agents can message their downlines (assigned players) AND admins/owners (upward escalation)
        if (senderRole === 'agent') {
            const isMyDownline = targetMember.agent_id === currentUserMembership.user_id;
            const isAdminOrOwner = ['admin', 'owner'].includes(targetRole);
            return isMyDownline || isAdminOrOwner;
        }

        // Players can only message their agent or admins/owners
        if (senderRole === 'player') {
            const isMyAgent = currentUserMembership.agent_id === targetMember.user_id;
            const isAdminOrOwner = ['admin', 'owner'].includes(targetRole);
            return isMyAgent || isAdminOrOwner;
        }

        return false;
    }

    async function loadClubData(userId) {
        try {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
            const { data: clubData } = await supabase.from('clubs').select('id, name, club_id, avatar_url, settings, member_count').eq(isUUID ? 'id' : 'club_id', clubIdParam).maybeSingle();
            if (clubData) {
                setClub(clubData);

                const { data: members } = await supabase.from('club_members').select('*, profiles(id, username, display_name, avatar_url)').eq('club_id', clubData.id)
                    .limit(200) // members for messaging
                setClubMembers(members || []);

                const memberIds = new Set((members || []).map(m => m.user_id));
                setClubMemberIds(memberIds);

                // Set current user's membership for permission checking
                if (userId) {
                    const myMembership = (members || []).find(m => m.user_id === userId);
                    setCurrentUserMembership(myMembership || null);
                }
            }
        } catch (e) {
            console.error('[ClubMessages] loadClubData error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadConversations(signal) {
        if (!user?.id) return;

        try {
            const convToken = getAccessToken();
            const resp = await fetch('/api/messenger/get-conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(convToken ? { Authorization: `Bearer ${convToken}` } : {}),
                },
                body: JSON.stringify({ userId: user.id }),
            });

            const result = await resp.json();

            if (result.success && Array.isArray(result.conversations)) {
                const clubConversations = result.conversations.filter(conv => {
                    const otherId = conv.otherUser?.id;
                    if (!otherId || !clubMemberIds.has(otherId)) return false;
                    //  HIERARCHY: Only show conversations with permitted recipients
                    const otherMember = clubMembers.find(m => m.user_id === otherId);
                    return otherMember ? canMessageUser(otherMember) : false;
                });
                // Enrich with online presence
                const enriched = clubConversations.map(conv => ({
                    ...conv,
                    otherUser: conv.otherUser ? {
                        ...conv.otherUser,
                        online: onlineUsers.has(conv.otherUser.id)
                    } : conv.otherUser
                }));
                setConversations(enriched);
            }
        } catch (e) {
            console.error('[ClubMessages] loadConversations error:', e);
        }
    }

    // Search club members - FILTERED BY MESSAGING HIERARCHY
    useEffect(() => {
        if (!debouncedSearchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        const query = debouncedSearchQuery.toLowerCase();
        const results = clubMembers
            .filter(m => m.user_id !== user?.id)
            .filter(m => canMessageUser(m)) //  HIERARCHY: Only show allowed recipients
            .filter(m => m.profiles?.username?.toLowerCase().includes(query) || m.profiles?.display_name?.toLowerCase().includes(query))
            .slice(0, 5);
        setSearchResults(results);
    }, [searchQuery, clubMembers, user, currentUserMembership, club]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Real-time subscription for incoming messages
    useEffect(() => {
        if (!activeConversation?.id || !user?.id) return;

        const channel = supabase
            .channel(`messages:${activeConversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, (payload) => {
                const newMsg = payload.new;
                // Only add if not from current user (we already optimistically added our own)
                if (newMsg && newMsg.sender_id !== user.id) {
                    setMessages(prev => {
                        // Avoid duplicates
                        if (prev.some(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    playMessageSound();
                    busEmit.messageReceived(activeConversation.id, newMsg.sender_id);
                }
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversation?.id, user?.id]);

    // ═══════════════════════════════════════════════════════════════════════
    //  INCOMING CALL LISTENER
    //  Listens on call-signal:${user.id} for incoming_call and call_ended events
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!user?.id) return;
        const callChannel = supabase
            .channel(`call-signal:${user.id}`)
            .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
                // Only accept call if not already in a call
                setIncomingCall(prev => prev ? prev : {
                    callerId: payload.callerId,
                    callerName: payload.callerName,
                    callerAvatar: payload.callerAvatar,
                    callType: payload.callType || 'video',
                    roomName: payload.roomName,
                });
            })
            .on('broadcast', { event: 'call_ended' }, () => {
                // Caller hung up before we answered
                setIncomingCall(null);
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                }
            });

        return () => {
            supabase.removeChannel(callChannel);
        };
    }, [user?.id]);

    const handleAcceptCall = async () => {
        if (!incomingCall || !user) return;

        // Notify caller that we accepted (subscribe, send, then cleanup)
        try {
            const channel = supabase.channel(`call-signal:${incomingCall.callerId}`);
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, 3000);
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
                    else if (status === 'CHANNEL_ERROR') { clearTimeout(timeout); reject(new Error('Channel error')); }
                });
            });
            await channel.send({
                type: 'broadcast',
                event: 'call_accepted',
                payload: { accepterId: user.id }
            });
            setTimeout(() => supabase.removeChannel(channel), 1000);
        } catch (e) {
            console.error('[ClubMessages] Failed to send call_accepted signal:', e);
        }

        // Join the call
        setCallType(incomingCall.callType);
        setCallRoomName(incomingCall.roomName);
        setCallingUser({ id: incomingCall.callerId, display_name: incomingCall.callerName, avatar_url: incomingCall.callerAvatar });
        setIncomingCall(null);
        setShowCall(true);
        busEmit.callStarted(incomingCall.callType, incomingCall.roomName, incomingCall.callerId);
    };

    const handleRejectCall = async () => {
        if (!incomingCall) return;

        // Notify caller that we declined (subscribe, send, then cleanup)
        try {
            const channel = supabase.channel(`call-signal:${incomingCall.callerId}`);
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, 3000);
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
                    else if (status === 'CHANNEL_ERROR') { clearTimeout(timeout); reject(new Error('Channel error')); }
                });
            });
            await channel.send({
                type: 'broadcast',
                event: 'call_declined',
                payload: { declinerId: user?.id, reason: 'declined' }
            });
            setTimeout(() => supabase.removeChannel(channel), 1000);
        } catch (e) {
            console.error('[ClubMessages] Failed to send call_declined signal:', e);
        }

        setIncomingCall(null);
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  VIDEO/VOICE CALL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    const startCall = async (type = 'video') => {
        if (!user || !activeConversation?.otherUser) return;

        const otherUser = activeConversation.otherUser;
        const roomName = `club-call-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        setCallType(type);
        setCallingUser(otherUser);

        try {
            // Send call signal via Supabase Realtime
            const channel = supabase.channel(`call-signal:${otherUser.id}`);
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, 2000);
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
                });
            });

            await channel.send({
                type: 'broadcast',
                event: 'incoming_call',
                payload: {
                    callerId: user.id,
                    callerName: user.display_name || user.username,
                    callerAvatar: user.avatar_url,
                    callType: type,
                    roomName: roomName,
                }
            });

            setTimeout(() => supabase.removeChannel(channel), 2000);

            // Create pending call in DB for offline users
            try {
                const callToken = getAccessToken();
                await fetch('/api/calls/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(callToken ? { Authorization: `Bearer ${callToken}` } : {}),
                    },
                    body: JSON.stringify({
                        calleeId: otherUser.id,
                        callerName: user.display_name || user.username,
                        callerAvatar: user.avatar_url,
                        callType: type,
                        roomName: roomName,
                    }),
                });
            } catch (dbErr) {
                console.error('[ClubMessages] Failed to create pending call:', dbErr);
            }

            // Push notification for offline users
            try {
                await fetch('/api/notifications/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call`,
                        message: `${user.display_name || user.username} is calling you`,
                        url: `https://smarter.poker/hub/club-arena/messages?club=${clubIdParam}`,
                        externalUserIds: [otherUser.id],
                        isCall: true,
                        callType: type,
                        roomName: roomName,
                        callerId: user.id,
                    }),
                });
            } catch (pushError) {
            }
        } catch (e) {
            console.error('Failed to send call signal:', e);
            setToast({ type: 'error', message: 'Failed To Call. Please Try Again.' });
            setCallingUser(null);
            return;
        }

        setCallRoomName(roomName);
        setShowCall(true);
        busEmit.callStarted(type, roomName, otherUser.id);

        if (!outgoingRingToneRef.current) {
            outgoingRingToneRef.current = createRingTone();
        }
        outgoingRingToneRef.current?.start();

        setToast({ type: 'info', message: `Calling ${otherUser.display_name || otherUser.username}...` });
    };

    const endCall = async () => {
        if (outgoingRingToneRef.current) {
            outgoingRingToneRef.current.stop();
        }

        if (activeConversation?.otherUser?.id) {
            try {
                const channel = supabase.channel(`call-signal:${activeConversation.otherUser.id}`);
                await new Promise((resolve) => {
                    const timeout = setTimeout(resolve, 2000);
                    channel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
                    });
                });
                await channel.send({ type: 'broadcast', event: 'call_ended', payload: {} });
                setTimeout(() => supabase.removeChannel(channel), 500);
            } catch (e) {
            }
        }

        setShowCall(false);
        setCallRoomName(null);
        setCallingUser(null);
        busEmit.callEnded(callType, callRoomName);
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  MEDIA UPLOAD
    // ═══════════════════════════════════════════════════════════════════════

    const handleMediaUpload = async (file) => {
        if (!user || !activeConversation) return;

        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
            setToast({ type: 'error', message: 'Only Photos And Videos Are Supported' });
            return;
        }

        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setToast({ type: 'error', message: `File too large. Max ${isVideo ? '50MB' : '10MB'}` });
            return;
        }

        const tempId = `temp-${Date.now()}`;
        const tempMsg = { id: tempId, content: isImage ? 'Photo' : 'Video', sender_id: user.id, created_at: new Date().toISOString(), status: 'sending' };
        setMessages(prev => [...prev, tempMsg]);
        playMessageSound();

        try {
            const fileName = `messages/${user.id}/${Date.now()}-${file.name}`;
            const { data: uploadData, error: uploadError } = await supabase.storage.from('user-media').upload(fileName, file, { cacheControl: '3600', upsert: false });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage.from('user-media').getPublicUrl(fileName);
            const content = isImage ? `[Image](${urlData.publicUrl})` : `[Video](${urlData.publicUrl})`;

            const sendToken = getAccessToken();
            const resp = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sendToken ? { Authorization: `Bearer ${sendToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: activeConversation.id,
                    content: content
                })
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || result.message || 'Failed to send');

            const msgId = result.msgId;
            const sanitizedContent = result.content;

            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: msgId, content: sanitizedContent, status: 'sent' } : m));
            setToast({ type: 'success', message: `${isImage ? 'Photo' : 'Video'} sent!` });
        } catch (e) {
            console.error('Media upload error:', e);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
            setToast({ type: 'error', message: 'Upload Failed. Please Try Again.' });
        }
    };

    // Open conversation
    const openConversation = async (conv) => {
        setActiveConversation(conv);
        setView('chat');

        // Optimistically clear unread count locally
        setConversations(prev => prev.map(c =>
            c.id === conv.id ? { ...c, unreadCount: 0 } : c
        ));

        // Background call to mark as read
        if (user?.id) {
            const readToken = getAccessToken();
            fetch('/api/messenger/mark-read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(readToken ? { Authorization: `Bearer ${readToken}` } : {}),
                },
                body: JSON.stringify({ conversationId: conv.id, userId: user.id })
            }).catch(e => console.error('Failed to mark read:', e));
        }

        try {
            const msgToken = getAccessToken();
            const resp = await fetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
                },
                body: JSON.stringify({ conversationId: conv.id, userId: user.id }),
            });
            const result = await resp.json();
            if (result.success) {
                setMessages(result.messages || []);
            }
        } catch (e) {
            console.error('Failed to load messages:', e);
        }
    };

    // Start new conversation
    const startConversation = async (member) => {
        if (!user || !member.profiles) return;

        //  HIERARCHY CHECK: Verify permission before creating conversation
        if (!canMessageUser(member)) {
            let errorMsg = 'You cannot message this user.';
            if (currentUserMembership?.role === 'player') {
                errorMsg = 'You can only message your agent or club admins.';
            } else if (currentUserMembership?.role === 'agent') {
                errorMsg = 'You can only message your assigned players or club admins.';
            }
            setToast({ type: 'error', message: errorMsg });
            return;
        }

        setSearchQuery('');

        const existing = conversations.find(c => c.otherUser?.id === member.profiles.id);
        if (existing) {
            openConversation(existing);
            return;
        }

        try {
            const { data: convId, error } = await supabase.rpc('fn_get_or_create_conversation', {
                user1_id: user.id,
                user2_id: member.profiles.id,
            });

            if (error) throw error;

            const newConv = { id: convId, otherUser: member.profiles, last_message_preview: '', last_message_at: new Date().toISOString(), unreadCount: 0 };
            setConversations(prev => [newConv, ...prev]);
            setActiveConversation(newConv);
            setMessages([]);
            setView('chat');
        } catch (e) {
            console.error('Failed to start conversation:', e);
        }
    };

    // Send message
    const sendMessage = async (content) => {
        if (!user || !activeConversation) return;

        const tempId = `temp-${Date.now()}`;
        const currentReply = replyTo;
        const tempMsg = { id: tempId, content, sender_id: user.id, created_at: new Date().toISOString(), profiles: user, status: 'sending', reply_to: currentReply || undefined };
        setMessages(prev => [...prev, tempMsg]);
        setReplyTo(null);
        playMessageSound();

        setConversations(prev => {
            const updated = prev.map(c => c.id === activeConversation.id ? { ...c, last_message_preview: content, last_message_at: new Date().toISOString() } : c);
            return updated.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
        });

        try {
            const sendToken = getAccessToken();
            const resp = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sendToken ? { Authorization: `Bearer ${sendToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: activeConversation.id,
                    content: content
                })
            });
            const result = await resp.json();
            if (!result.success) {
                if (result.error === 'Payload too large') setToast({ type: 'error', message: result.message });
                throw new Error(result.error || result.message || 'Failed to send');
            }

            const msgId = result.msgId;
            const sanitizedContent = result.content;

            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: msgId, content: sanitizedContent, status: 'sent' } : m));
            busEmit.messageSent(activeConversation.id, activeConversation.otherUser?.id);
            busEmit.dataMutated('message_sent');
        } catch (e) {
            console.error('Send failed:', e);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  REAL-TIME MESSAGE SYNC
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!activeConversation?.id || !user?.id) return;

        const messageChannel = supabase
            .channel(`messages:${activeConversation.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'social_messages',
                    filter: `conversation_id=eq.${activeConversation.id}`
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const newMsg = payload.new;
                        if (newMsg.sender_id === user.id) return; // Ignore own

                        const fullMsg = { ...newMsg, profiles: activeConversation.otherUser };
                        setMessages(prev => {
                            if (prev.some(m => m.id === newMsg.id)) return prev;
                            return [...prev, fullMsg];
                        });

                        // Tell other components a new msg arrived
                        if (typeof busEmit.messageReceived === 'function') {
                            busEmit.messageReceived(activeConversation.id, newMsg.sender_id);
                        }

                        // Auto-mark read if tab is active
                        if (document.visibilityState === 'visible') {
                            supabase.rpc('fn_mark_conversation_read', {
                                p_conversation_id: activeConversation.id,
                                p_user_id: user.id
                            }).then(() => {
                                if (typeof busEmit.dataMutated === 'function') {
                                    busEmit.dataMutated('message_read');
                                }
                            });
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        const updatedMsg = payload.new;
                        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(messageChannel);
        };
    }, [activeConversation?.id, user?.id]);

    // ═══════════════════════════════════════════════════════════════════════
    //  TYPING INDICATORS
    // ═══════════════════════════════════════════════════════════════════════

    // Listen for other user's typing broadcasts
    useEffect(() => {
        if (!activeConversation?.id || !user?.id) return;

        const typingChannel = supabase
            .channel(`typing:${activeConversation.id}`)
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (payload.userId !== user.id) {
                    setTypingUser(payload.username || 'Someone');
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(typingChannel);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            setTypingUser(null);
        };
    }, [activeConversation?.id, user?.id]);

    // Broadcast our typing state (throttled to every 3 seconds)
    const broadcastTyping = () => {
        if (!user || !activeConversation?.id) return;
        const now = Date.now();
        if (now - lastTypingBroadcast.current < 3000) return;
        lastTypingBroadcast.current = now;

        supabase.channel(`typing:${activeConversation.id}`).send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: user.id, username: user.display_name || user.username },
        }).catch(() => { });
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  RETRY FAILED MESSAGE
    // ═══════════════════════════════════════════════════════════════════════

    const retryMessage = async (failedMsg) => {
        if (!user || !activeConversation) return;

        // Remove failed status
        setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'sending' } : m));

        try {
            const sendToken = getAccessToken();
            const resp = await fetch('/api/messenger/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(sendToken ? { Authorization: `Bearer ${sendToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: activeConversation.id,
                    content: failedMsg.content || failedMsg.message
                })
            });
            const result = await resp.json();
            if (!result.success) throw new Error(result.error || result.message || 'Failed to send');

            const msgId = result.msgId;
            const sanitizedContent = result.content;

            setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, id: msgId, content: sanitizedContent, status: 'sent' } : m));
            busEmit.messageSent(activeConversation.id, activeConversation.otherUser?.id);
            setToast({ type: 'success', message: 'Message sent!' });
        } catch (e) {
            console.error('[ClubMessages] Retry failed:', e);
            setMessages(prev => prev.map(m => m.id === failedMsg.id ? { ...m, status: 'failed' } : m));
            setToast({ type: 'error', message: 'Retry failed. Please try again.' });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  DELETE / UNSEND MESSAGE
    // ═══════════════════════════════════════════════════════════════════════

    const deleteMessage = async (messageId) => {
        if (!messageId || messageId.toString().startsWith('temp-')) return;

        // Optimistic update
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true, content: '' } : m));

        try {
            const { error } = await supabase
                .from('social_messages')
                .update({ is_deleted: true, content: '[Message deleted]' })
                .eq('id', messageId)
                .eq('sender_id', user?.id);

            if (error) throw error;
            setToast({ type: 'info', message: 'Message deleted' });
        } catch (e) {
            console.error('[ClubMessages] Delete failed:', e);
            // Revert
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: false } : m));
            setToast({ type: 'error', message: 'Failed to delete message' });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  MESSAGE EDITING (5-min window, server-side validated)
    // ═══════════════════════════════════════════════════════════════════════

    const editMessage = async (messageId, newContent) => {
        if (!messageId || !newContent?.trim() || messageId.toString().startsWith('temp-')) return;

        const oldContent = messages.find(m => m.id === messageId)?.content;

        // Optimistic update
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent.trim(), updated_at: new Date().toISOString() } : m));

        try {
            const editToken = getAccessToken();
            const resp = await fetch('/api/messenger/edit-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(editToken ? { Authorization: `Bearer ${editToken}` } : {}),
                },
                body: JSON.stringify({ messageId, content: newContent.trim() })
            });
            const result = await resp.json();
            if (!result.success) {
                throw new Error(result.error || result.message || 'Edit failed');
            }
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: result.content } : m));
            setToast({ type: 'info', message: 'Message edited' });
        } catch (e) {
            console.error('[ClubMessages] Edit failed:', e);
            // Revert
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: oldContent, updated_at: null } : m));
            setToast({ type: 'error', message: e.message || 'Failed to edit message' });
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  MESSAGE REACTIONS (optimistic — stored locally)
    // ═══════════════════════════════════════════════════════════════════════

    const reactToMessage = (messageId, emoji) => {
        setMessages(prev => prev.map(m => {
            if (m.id !== messageId) return m;
            const reactions = { ...(m.reactions || {}) };
            reactions[emoji] = (reactions[emoji] || 0) + 1;
            return { ...m, reactions };
        }));
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  GIF SEARCH (Tenor API)
    // ═══════════════════════════════════════════════════════════════════════

    const searchGifs = async (query) => {
        if (!query.trim()) {
            setGifResults([]);
            return;
        }
        setGifLoading(true);
        try {
            // Use Tenor API v2 (free tier, no API key needed for basic search)
            const resp = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&limit=12&media_filter=tinygif`);
            const data = await resp.json();
            setGifResults((data.results || []).map(g => ({
                url: g.media_formats?.tinygif?.url || g.media_formats?.gif?.url,
                preview: g.media_formats?.nanogif?.url || g.media_formats?.tinygif?.url,
                title: g.content_description || '',
            })).filter(g => g.url));
        } catch (e) {
            console.error('[ClubMessages] GIF search failed:', e);
            setGifResults([]);
        } finally {
            setGifLoading(false);
        }
    };

    const sendGif = (gifUrl) => {
        sendMessage(`[Image](${gifUrl})`);
        setShowGifPicker(false);
        setGifSearchQuery('');
        setGifResults([]);
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  PAGINATION (Load More Messages)
    // ═══════════════════════════════════════════════════════════════════════

    const loadMoreMessages = async () => {
        if (!activeConversation?.id || !user?.id || loadingMore || !hasMoreMessages) return;

        setLoadingMore(true);
        const oldestMsg = messages[0];
        const container = messagesContainerRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;

        try {
            const msgToken = getAccessToken();
            const resp = await fetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(msgToken ? { Authorization: `Bearer ${msgToken}` } : {}),
                },
                body: JSON.stringify({
                    conversationId: activeConversation.id,
                    userId: user.id,
                    before: oldestMsg?.created_at,
                    limit: 50,
                }),
            });
            const result = await resp.json();
            if (result.success && result.messages?.length > 0) {
                setMessages(prev => [...result.messages, ...prev]);
                // Preserve scroll position
                requestAnimationFrame(() => {
                    if (container) {
                        container.scrollTop = container.scrollHeight - scrollHeightBefore;
                    }
                });
                if (result.messages.length < 50) setHasMoreMessages(false);
            } else {
                setHasMoreMessages(false);
            }
        } catch (e) {
            console.error('[ClubMessages] Load more failed:', e);
        } finally {
            setLoadingMore(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  RENDER
    // ═══════════════════════════════════════════════════════════════════════

    const S = {
        page: { minHeight: '100vh', background: C.bg, paddingBottom: 80, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif' },
        header: { padding: '12px 16px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        headerTitle: { fontSize: 20, fontWeight: 700, color: C.text },
        newBtn: { width: 36, height: 36, borderRadius: '50%', border: 'none', background: C.hoverBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        searchBar: { padding: '12px 16px' },
        searchInput: { width: '100%', padding: '10px 16px', borderRadius: 24, border: 'none', background: C.hoverBg, color: C.text, fontSize: 15, outline: 'none' },
        chatHeader: { padding: '12px 16px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 },
        backBtn: { width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue },
        chatName: { fontSize: 16, fontWeight: 600, color: C.text },
        messagesContainer: { flex: 1, overflowY: 'auto', padding: '16px 0' },
        emptyState: { textAlign: 'center', padding: '60px 20px', color: C.textSec },
        emptyIcon: { fontSize: 48, marginBottom: 16 },
        iconBtn: { width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    };

    if (!clubIdParam) {
        return (
            <>
                <SEOHead
                    noindex
                    title="Club Arena — Messages"
                    description="View Your Club Arena Messages."
                    canonical="/hub/club-arena/messages"
                />
                <div style={S.page}>
                    <UniversalHeader pageDepth={2} />
                    <div style={S.emptyState}>
                        <p style={{ marginBottom: 16, fontSize: 16, fontWeight: 500 }}>Invalid Club.</p>
                        <p style={{ marginBottom: 24, fontSize: 14 }}>Please return to your Hub.</p>
                        <button onClick={() => router.push('/hub')} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.blue, padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: 600 }}>Go to Hub</button>
                    </div>
                </div>
            </>
        );
    }

    // Loading
    if (isLoading) {
        return (
            <>
                <SEOHead
                    noindex
                    title="Club Arena — Messages"
                    description="View Your Club Arena Messages."
                    canonical="/hub/club-arena/messages"
                />
                <div style={S.page}>
                    <UniversalHeader pageDepth={2} />
                    <div style={S.emptyState}>Loading...</div>
                    <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" userRole={currentUserMembership?.role} />
                </div>
            </>
        );
    }

    // Chat View
    if (view === 'chat' && activeConversation) {
        const otherUser = activeConversation.otherUser;
        const filteredMessages = messageSearchQuery.trim()
            ? messages.filter(m => (m.content || m.message || '').toLowerCase().includes(messageSearchQuery.toLowerCase()))
            : messages;

        return (
            <>
                <Head><title>Chat with {otherUser?.display_name || otherUser?.username} | Club Arena</title></Head>
                <div style={{ ...S.page, display: 'flex', flexDirection: 'column', height: '100vh' }}>
                    <UniversalHeader pageDepth={2} />

                    {/* Chat Header with Call Buttons */}
                    <div style={S.chatHeader}>
                        <button onClick={() => { setView('list'); setShowMessageSearch(false); setShowUserInfo(false); setShowGifPicker(false); }} style={S.backBtn}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                        </button>
                        <Avatar src={otherUser?.avatar_url} name={otherUser?.username || otherUser?.display_name} size={40} online={onlineUsers.has(otherUser?.id)} />
                        <div style={{ flex: 1 }}>
                            <div style={S.chatName}>{otherUser?.display_name || otherUser?.username}</div>
                            <div style={{ fontSize: 12, color: typingUser ? C.green : onlineUsers.has(otherUser?.id) ? C.green : C.textSec }}>
                                {typingUser ? `${typingUser} is typing...` : onlineUsers.has(otherUser?.id) ? '● Online' : 'Club Member'}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setShowMessageSearch(!showMessageSearch); if (showMessageSearch) setMessageSearchQuery(''); }} style={{ ...S.iconBtn, background: showMessageSearch ? C.hoverBg : 'transparent' }} title="Search Messages">
                                <SearchIcon size={20} />
                            </button>
                            <button onClick={() => startCall('audio')} style={S.iconBtn} title="Voice Call">
                                <PhoneIcon size={20} />
                            </button>
                            <button onClick={() => startCall('video')} style={S.iconBtn} title="Video Call">
                                <VideoIcon size={20} />
                            </button>
                            <button onClick={() => setShowUserInfo(!showUserInfo)} style={{ ...S.iconBtn, background: showUserInfo ? C.hoverBg : 'transparent' }} title="User Info">
                                <InfoIcon size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Search within messages bar */}
                    {showMessageSearch && (
                        <div style={{ padding: '8px 16px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                type="text"
                                value={messageSearchQuery}
                                onChange={(e) => setMessageSearchQuery(e.target.value)}
                                placeholder="Search in messages..."
                                autoFocus
                                style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: 'none', background: C.hoverBg, color: C.text, fontSize: 14, outline: 'none' }}
                            />
                            {messageSearchQuery && (
                                <span style={{ fontSize: 12, color: C.textSec, whiteSpace: 'nowrap' }}>
                                    {filteredMessages.length} {filteredMessages.length === 1 ? 'result' : 'results'}
                                </span>
                            )}
                        </div>
                    )}

                    {/* User Info Panel (slide-down) */}
                    {showUserInfo && (
                        <div style={{ padding: '16px', background: C.card, borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
                            <Avatar src={otherUser?.avatar_url} name={otherUser?.username} size={72} showOnline={false} />
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{otherUser?.display_name || otherUser?.username}</div>
                                <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>@{otherUser?.username}</div>
                                {(() => {
                                    const memberData = clubMembers.find(m => m.user_id === otherUser?.id);
                                    return memberData ? (
                                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8 }}>
                                            <span style={{ background: C.hoverBg, padding: '4px 12px', borderRadius: 12, fontSize: 12, color: C.blue, fontWeight: 600, textTransform: 'capitalize' }}>
                                                {memberData.role}
                                            </span>
                                            {memberData.agent_id && (
                                                <span style={{ background: C.hoverBg, padding: '4px 12px', borderRadius: 12, fontSize: 12, color: C.textSec }}>
                                                    Has Agent
                                                </span>
                                            )}
                                        </div>
                                    ) : null;
                                })()}
                                {/* P3-9: Agent Response Time Dashboard (for owner/admin) */}
                                {['owner', 'admin'].includes(currentUserMembership?.role) && (() => {
                                    const theirMessages = messages.filter(m => m.sender_id === otherUser?.id);
                                    const myMessages = messages.filter(m => m.sender_id === user?.id);
                                    let avgResponseMs = 0;
                                    let responseTimes = [];
                                    myMessages.forEach(myMsg => {
                                        const nextReply = theirMessages.find(tm => new Date(tm.created_at) > new Date(myMsg.created_at));
                                        if (nextReply) {
                                            responseTimes.push(new Date(nextReply.created_at).getTime() - new Date(myMsg.created_at).getTime());
                                        }
                                    });
                                    if (responseTimes.length > 0) avgResponseMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
                                    const avgStr = avgResponseMs > 0 ? (avgResponseMs < 60000 ? `${Math.round(avgResponseMs / 1000)}s` : avgResponseMs < 3600000 ? `${Math.round(avgResponseMs / 60000)}m` : `${Math.round(avgResponseMs / 3600000)}h`) : 'N/A';
                                    return (
                                        <div style={{ marginTop: 12, padding: '8px 16px', background: C.hoverBg, borderRadius: 12 }}>
                                            <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600, marginBottom: 4 }}>📊 RESPONSE ANALYTICS</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-around', gap: 8 }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{avgStr}</div>
                                                    <div style={{ fontSize: 10, color: C.textSec }}>Avg Response</div>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{theirMessages.length}</div>
                                                    <div style={{ fontSize: 10, color: C.textSec }}>Messages Sent</div>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{responseTimes.length}</div>
                                                    <div style={{ fontSize: 10, color: C.textSec }}>Replies</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div ref={messagesContainerRef} style={S.messagesContainer} onScroll={(e) => {
                        if (e.target.scrollTop === 0 && hasMoreMessages && !loadingMore) {
                            loadMoreMessages();
                        }
                    }}>
                        {/* Load more indicator */}
                        {loadingMore && (
                            <div style={{ textAlign: 'center', padding: '12px', color: C.textSec, fontSize: 13 }}>
                                Loading older messages...
                            </div>
                        )}
                        {hasMoreMessages && messages.length >= 50 && !loadingMore && (
                            <div style={{ textAlign: 'center', padding: '8px' }}>
                                <button onClick={loadMoreMessages} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.blue, padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>
                                    Load older messages
                                </button>
                            </div>
                        )}

                        {filteredMessages.length === 0 ? (
                            messageSearchQuery ? (
                                <div style={{ ...S.emptyState, padding: '40px 20px' }}>
                                    <p style={{ fontSize: 14, color: C.textSec }}>No messages matching "{messageSearchQuery}"</p>
                                </div>
                            ) : (
                                <div style={{ ...S.emptyState, padding: '40px 20px' }}>
                                    <Avatar src={otherUser?.avatar_url} name={otherUser?.username} size={80} showOnline={false} />
                                    <p style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: C.text }}>{otherUser?.display_name || otherUser?.username}</p>
                                    <p style={{ fontSize: 14, color: C.textSec }}>Start Your Conversation</p>
                                </div>
                            )
                        ) : (
                            filteredMessages.map((msg, i) => {
                                const isOwn = msg.sender_id === user.id;
                                const next = filteredMessages[i + 1];
                                const prev = filteredMessages[i - 1];
                                const showAvatar = !isOwn && (!next || next.sender_id !== msg.sender_id);
                                const showTime = !next || next.sender_id !== msg.sender_id;
                                const isLastInGroup = !next || next.sender_id !== msg.sender_id;

                                // Date separator
                                const showDateSep = !prev || !isSameDay(prev.created_at, msg.created_at);

                                return (
                                    <div key={msg.id}>
                                        {showDateSep && (
                                            <div style={{ textAlign: 'center', padding: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 16 }}>
                                                <div style={{ flex: 1, height: 1, background: C.border }} />
                                                <span style={{ fontSize: 12, color: C.textSec, fontWeight: 500, whiteSpace: 'nowrap' }}>{formatDateSeparator(msg.created_at)}</span>
                                                <div style={{ flex: 1, height: 1, background: C.border }} />
                                            </div>
                                        )}
                                        <MessageBubble
                                            message={msg}
                                            isOwn={isOwn}
                                            showAvatar={showAvatar}
                                            sender={isOwn ? user : activeConversation.otherUser}
                                            showTime={showTime}
                                            isLastInGroup={isLastInGroup}
                                            onRetry={retryMessage}
                                            onDelete={deleteMessage}
                                            onReact={reactToMessage}
                                            onEdit={editMessage}
                                            onReply={(msg) => setReplyTo({ id: msg.id, senderName: msg.sender_id === user?.id ? 'You' : (activeConversation.otherUser?.display_name || activeConversation.otherUser?.username || 'User'), preview: msg.content?.slice(0, 80) })}
                                            onForward={(msg) => setForwardingMessage({ content: msg.content, senderName: msg.sender_id === user?.id ? 'You' : (activeConversation.otherUser?.display_name || 'User') })}
                                        />
                                    </div>
                                );
                            })
                        )}

                        {/* Typing indicator */}
                        {typingUser && (
                            <div style={{ padding: '4px 12px 8px 52px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ background: C.otherBubble, borderRadius: 18, padding: '8px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.textSec, animation: 'pulse 1.2s infinite', animationDelay: '0s' }} />
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.textSec, animation: 'pulse 1.2s infinite', animationDelay: '0.3s' }} />
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.textSec, animation: 'pulse 1.2s infinite', animationDelay: '0.6s' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* GIF Picker */}
                    {showGifPicker && (
                        <div style={{ background: C.card, borderTop: `1px solid ${C.border}`, padding: 12, maxHeight: 280, overflowY: 'auto' }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={gifSearchQuery}
                                    onChange={(e) => { setGifSearchQuery(e.target.value); searchGifs(e.target.value); }}
                                    placeholder="Search GIFs..."
                                    autoFocus
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 20, border: 'none', background: C.hoverBg, color: C.text, fontSize: 14, outline: 'none' }}
                                />
                                <button onClick={() => { setShowGifPicker(false); setGifSearchQuery(''); setGifResults([]); }} style={{ background: 'transparent', border: 'none', color: C.textSec, cursor: 'pointer', fontSize: 18 }}>✕</button>
                            </div>
                            {gifLoading && <div style={{ textAlign: 'center', color: C.textSec, fontSize: 13, padding: 16 }}>Searching...</div>}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                                {gifResults.map((gif, i) => (
                                    <img key={i} src={gif.preview || gif.url} alt={gif.title} onClick={() => sendGif(gif.url)}
                                        style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                                        loading="lazy"
                                    />
                                ))}
                            </div>
                            {!gifLoading && gifSearchQuery && gifResults.length === 0 && (
                                <div style={{ textAlign: 'center', color: C.textSec, fontSize: 13, padding: 16 }}>No GIFs found</div>
                            )}
                            {!gifSearchQuery && (
                                <div style={{ textAlign: 'center', color: C.textSec, fontSize: 13, padding: 16 }}>Type to search for GIFs</div>
                            )}
                        </div>
                    )}

                    {/* P3-6: Smart Quick Replies */}
                    {messages.length > 0 && (() => {
                        const lastReceived = [...messages].reverse().find(m => m.sender_id !== user?.id && !m.is_deleted);
                        if (!lastReceived) return null;
                        const lc = (lastReceived.content || '').toLowerCase();
                        let suggestions = [];
                        if (lc.includes('?') || lc.includes('when') || lc.includes('what') || lc.includes('how')) suggestions = ['Let me check', 'I\'ll get back to you', 'Good question!'];
                        else if (lc.includes('thanks') || lc.includes('thank') || lc.includes('ty')) suggestions = ['You\'re welcome! 😊', 'Anytime!', 'Happy to help'];
                        else if (lc.includes('gg') || lc.includes('nice') || lc.includes('well played')) suggestions = ['Thanks! GG 🏆', 'You too!', 'Good game!'];
                        else if (lc.includes('hi') || lc.includes('hey') || lc.includes('hello') || lc.includes('sup')) suggestions = ['Hey! 👋', 'What\'s up?', 'How\'s it going?'];
                        else suggestions = ['Got it 👍', 'Thanks!', 'Sounds good'];
                        return (
                            <div style={{ display: 'flex', gap: 6, padding: '6px 16px', overflowX: 'auto', flexShrink: 0 }}>
                                {suggestions.map(s => (
                                    <button key={s} onClick={() => sendMessage(s)} style={{ padding: '6px 14px', borderRadius: 16, border: `1px solid ${C.border}`, background: C.hoverBg, color: C.text, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s' }}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        );
                    })()}

                    {/* Reply Preview Bar */}
                    {replyTo && (
                        <div style={{ padding: '8px 16px', background: C.card, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 3, height: 32, background: C.blue, borderRadius: 2, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: C.blue }}>{replyTo.senderName}</div>
                                <div style={{ fontSize: 12, color: C.textSec, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyTo.preview}</div>
                            </div>
                            <button onClick={() => setReplyTo(null)} style={{ background: 'transparent', border: 'none', color: C.textSec, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
                        </div>
                    )}

                    {/* Enhanced Message Input */}
                    <MessageInput onSend={(text) => { sendMessage(text); }} onMediaUpload={handleMediaUpload} onTyping={broadcastTyping} onGifToggle={() => setShowGifPicker(!showGifPicker)} showGifActive={showGifPicker} />
                    <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" userRole={currentUserMembership?.role} />
                </div>

                {/* P3-5: Forward Message Modal — fullscreen overlay */}
                {forwardingMessage && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button onClick={() => setForwardingMessage(null)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer' }}>✕</button>
                            <span style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>Forward Message</span>
                        </div>
                        <div style={{ padding: '0 16px 8px', background: C.card, margin: '0 16px', borderRadius: 12, maxHeight: 60, overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, color: C.textSec, padding: '8px 0' }}>
                                <span style={{ fontWeight: 600 }}>{forwardingMessage.senderName}:</span> {forwardingMessage.content?.slice(0, 100)}
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                            <div style={{ color: C.textSec, fontSize: 13, marginBottom: 8 }}>Select a conversation:</div>
                            {conversations.filter(c => c.id !== activeConversation?.id && !archivedConvIds.includes(c.id)).map(conv => (
                                <div key={conv.id} onClick={async () => {
                                    const fwdText = `[Forwarded from ${forwardingMessage.senderName}]\n${forwardingMessage.content}`;
                                    try {
                                        const fwdToken = getAccessToken();
                                        await fetch('/api/messenger/send-message', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', ...(fwdToken ? { Authorization: `Bearer ${fwdToken}` } : {}) },
                                            body: JSON.stringify({ conversationId: conv.id, content: fwdText })
                                        });
                                        setToast({ type: 'info', message: `Forwarded to ${conv.otherUser?.display_name || conv.otherUser?.username}` });
                                    } catch (e) {
                                        setToast({ type: 'error', message: 'Forward failed' });
                                    }
                                    setForwardingMessage(null);
                                }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer', borderRadius: 8, background: C.card, marginBottom: 4 }}>
                                    <Avatar src={conv.otherUser?.avatar_url} name={conv.otherUser?.username} size={40} />
                                    <span style={{ color: C.text, fontWeight: 500 }}>{conv.otherUser?.display_name || conv.otherUser?.username}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Incoming call notification banner — polished */}
                {incomingCall && (
                    <div style={{
                        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
                        zIndex: 9999, background: 'linear-gradient(135deg, #1877F2 0%, #0057B8 100%)', borderRadius: 16, padding: '16px 24px',
                        display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        minWidth: 320, maxWidth: 400, animation: 'slideDown 0.3s ease',
                    }}>
                        {incomingCall.callerAvatar ? (
                            <img src={incomingCall.callerAvatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
                        ) : (
                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📞</div>
                        )}
                        <div style={{ flex: 1 }}>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{incomingCall.callerName}</div>
                            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {incomingCall.callType === 'video' ? <VideoIcon size={14} color="rgba(255,255,255,0.8)" /> : <PhoneIcon size={14} color="rgba(255,255,255,0.8)" />}
                                Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call
                            </div>
                        </div>
                        <button onClick={handleAcceptCall} style={{
                            background: '#31A24C', border: 'none', borderRadius: 50, width: 44, height: 44,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }} title="Accept">
                            <PhoneIcon size={20} color="#fff" />
                        </button>
                        <button onClick={handleRejectCall} style={{
                            background: '#FA383E', border: 'none', borderRadius: 50, width: 44, height: 44,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }} title="Reject">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
                        </button>
                    </div>
                )}

                {showCall && callRoomName && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#000' }}>
                        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 12, zIndex: 10001 }}>
                            <button onClick={endCall} style={{ width: 40, height: 40, borderRadius: '50%', background: C.red, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
                            </button>
                            <div style={{ flex: 1 }}>
                                <div style={{ color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {callType === 'video' ? <VideoIcon size={24} color="white" /> : <PhoneIcon size={24} color="white" />}
                                    <span>{callType === 'video' ? 'Video' : 'Voice'} Call with {otherUser?.display_name || otherUser?.username}</span>
                                </div>
                            </div>
                        </div>
                        <LiveKitCall roomName={callRoomName} participantName={user?.username || user?.display_name || 'User'} participantId={user?.id} callType={callType} onEnd={endCall} />
                    </div>
                )}

                <Toast toast={toast} onDismiss={() => setToast(null)} />
            </>
        );
    }

    // Conversation List (default)
    return (
        <>
            <Head><title>Messages | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={user}
                    showProfile={true}
                    {...getMenuConfig('club-arena', user, {}, {})}
                />

                <div style={S.header}>
                    <span style={S.headerTitle}>Chats</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button onClick={() => setShowGlobalSearch(!showGlobalSearch)} style={{ ...S.newBtn, background: showGlobalSearch ? '#2374E1' : 'transparent' }} title="Global Search">
                            <SearchIcon size={18} />
                        </button>
                        <button onClick={() => setShowWallet(prev => !prev)} style={{ ...S.newBtn, background: showWallet ? '#2374E1' : 'transparent' }} title="Wallet">
                            💰
                        </button>
                        <button onClick={() => { setSearchQuery(''); document.querySelector('[placeholder*="Search Club"]')?.focus(); }} style={S.newBtn} title="New Message">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                        </button>
                    </div>
                </div>

                {/* P3-1: Filter Tabs */}

                {/* P3-8: Global Search Panel */}
                {showGlobalSearch && (
                    <div style={{ padding: '8px 16px', background: C.card, borderBottom: `1px solid ${C.border}` }}>
                        <input type="text" placeholder="Search all messages..." value={globalSearchQuery}
                            onChange={async (e) => {
                                const q = e.target.value;
                                setGlobalSearchQuery(q);
                                if (q.length < 2) { setGlobalSearchResults([]); return; }
                                setGlobalSearchLoading(true);
                                try {
                                    const searchToken = getAccessToken();
                                    const resp = await fetch('/api/messenger/global-search', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', ...(searchToken ? { Authorization: `Bearer ${searchToken}` } : {}) },
                                        body: JSON.stringify({ query: q, clubId: clubIdParam })
                                    });
                                    const data = await resp.json();
                                    if (data.success) setGlobalSearchResults(data.results || []);
                                } catch (e) { console.error('Global search failed:', e); }
                                setGlobalSearchLoading(false);
                            }}
                            autoFocus style={{ width: '100%', padding: '10px 16px', borderRadius: 24, border: 'none', background: C.hoverBg, color: C.text, fontSize: 14, outline: 'none' }} />
                        {globalSearchLoading && <div style={{ textAlign: 'center', color: C.textSec, fontSize: 13, padding: 8 }}>Searching...</div>}
                        {globalSearchResults.length > 0 && (
                            <div style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto' }}>
                                {globalSearchResults.map(r => (
                                    <div key={r.id} onClick={() => {
                                        const conv = conversations.find(c => c.id === r.conversation_id);
                                        if (conv) { openConversation(conv); setShowGlobalSearch(false); setGlobalSearchQuery(''); setGlobalSearchResults([]); }
                                    }} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: C.hoverBg }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                            <Avatar src={r.sender?.avatar_url} name={r.sender?.username} size={20} />
                                            <span style={{ fontSize: 12, fontWeight: 600, color: r.isOwn ? C.blue : C.text }}>{r.isOwn ? 'You' : r.sender?.display_name || r.sender?.username}</span>
                                            <span style={{ fontSize: 11, color: C.textSec }}>{timeAgo(r.created_at)}</span>
                                        </div>
                                        <div style={{ fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.content?.slice(0, 80)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!globalSearchLoading && globalSearchQuery.length >= 2 && globalSearchResults.length === 0 && (
                            <div style={{ textAlign: 'center', color: C.textSec, fontSize: 13, padding: 8 }}>No messages found</div>
                        )}
                    </div>
                )}
                <div style={{ display: 'flex', padding: '0 16px', gap: 8, borderBottom: `1px solid ${C.border}` }}>
                    {[{ label: 'All', key: 'all' }, { label: 'Unread', key: 'unread' }, { label: 'Archived', key: 'archived' }].map(tab => {
                        const isActive = tab.key === 'archived' ? showArchived : tab.key === 'unread' ? showUnreadOnly && !showArchived : !showUnreadOnly && !showArchived;
                        return (
                            <button key={tab.key} onClick={() => {
                                if (tab.key === 'all') { setShowUnreadOnly(false); setShowArchived(false); }
                                if (tab.key === 'unread') { setShowUnreadOnly(true); setShowArchived(false); }
                                if (tab.key === 'archived') { setShowArchived(true); setShowUnreadOnly(false); }
                            }} style={{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none', borderBottom: isActive ? `2px solid ${C.blue}` : '2px solid transparent', color: isActive ? C.blue : C.textSec, fontWeight: isActive ? 600 : 400, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                                {tab.label}{tab.key === 'unread' ? ` (${conversations.filter(c => c.unreadCount > 0 && !archivedConvIds.includes(c.id)).length})` : tab.key === 'archived' ? ` (${conversations.filter(c => archivedConvIds.includes(c.id)).length})` : ''}
                            </button>
                        );
                    })}
                </div>

                {showWallet && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px 12px' }}>
                        <DynamicWallet
                            {...walletData}
                            onOpenBBJ={() => { }}
                            onBuyDiamonds={() => router.push('/hub/diamond-store')}
                            onTapSlot={(slot) => {
                                if (slot === 'chips' || slot === 'promo') router.push(`/hub/club-arena/cashier?club=${clubIdParam}`);
                                if (slot === 'clubBank') router.push(`/hub/club-arena/admin?club=${clubIdParam}`);
                                if (slot === 'agent') router.push(`/hub/club-arena/agent-dashboard?club=${clubIdParam}`);
                            }}
                        />
                    </div>
                )}

                <HubErrorBoundary name="AnnouncementsBanner">
                    <ClubAnnouncementBanner clubId={clubIdParam} userRole={currentUserMembership?.role} />
                </HubErrorBoundary>

                <div style={S.searchBar}>
                    <input type="text" placeholder="  Search Club Members..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={S.searchInput} />

                    {searchResults.length > 0 && (
                        <div style={{ marginTop: 8, background: C.card, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                            {searchResults.map(member => (
                                <div key={member.user_id} onClick={() => startConversation(member)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>
                                    <Avatar src={member.profiles?.avatar_url} name={member.profiles?.username} size={44} />
                                    <div>
                                        <div style={{ fontWeight: 600, color: C.text }}>{member.profiles?.display_name || member.profiles?.username}</div>
                                        <div style={{ fontSize: 12, color: C.textSec }}>@{member.profiles?.username}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {(() => {
                    const filtered = [...conversations]
                        .filter(c => {
                            if (showArchived) return archivedConvIds.includes(c.id);
                            if (archivedConvIds.includes(c.id)) return false;
                            if (showUnreadOnly) return c.unreadCount > 0;
                            return true;
                        })
                        .sort((a, b) => {
                            const aPinned = pinnedIds.includes(a.id);
                            const bPinned = pinnedIds.includes(b.id);
                            if (aPinned && !bPinned) return -1;
                            if (!aPinned && bPinned) return 1;
                            return 0;
                        });

                    return filtered.length > 0 ? (
                        filtered.map((conv, i) => (
                            <ConversationItem
                                key={conv.id || i}
                                conversation={conv}
                                isActive={false}
                                isPinned={pinnedIds.includes(conv.id)}
                                onPin={(convId) => {
                                    setPinnedIds(prev => {
                                        if (prev.includes(convId)) return prev.filter(id => id !== convId);
                                        if (prev.length >= 3) return prev;
                                        return [...prev, convId];
                                    });
                                }}
                                isMuted={mutedConvIds.includes(conv.id)}
                                onMute={(convId) => {
                                    setMutedConvIds(prev => prev.includes(convId) ? prev.filter(id => id !== convId) : [...prev, convId]);
                                    setToast({ type: 'info', message: mutedConvIds.includes(conv.id) ? 'Unmuted' : 'Muted' });
                                }}
                                isArchived={archivedConvIds.includes(conv.id)}
                                onArchive={(convId) => {
                                    setArchivedConvIds(prev => prev.includes(convId) ? prev.filter(id => id !== convId) : [...prev, convId]);
                                    setToast({ type: 'info', message: archivedConvIds.includes(conv.id) ? 'Unarchived' : 'Archived' });
                                }}
                                onClick={() => openConversation(conv)}
                            />
                        ))
                    ) : user ? (
                        <div style={S.emptyState}>
                            <div style={S.emptyIcon}></div>
                            <p style={{ fontSize: 16, fontWeight: 500 }}>{showArchived ? 'No Archived Conversations' : showUnreadOnly ? 'All Caught Up! 🎉' : 'No Club Conversations Yet'}</p>
                            <p style={{ fontSize: 14, marginTop: 8 }}>{showArchived ? 'Archived chats will appear here' : showUnreadOnly ? 'No unread messages' : 'Search For A Club Member Above To Start Chatting'}</p>
                        </div>
                    ) : (
                        <div style={S.emptyState}>
                            <div style={S.emptyIcon}></div>
                            <p style={{ fontSize: 16, fontWeight: 500 }}>Loading Your Session...</p>
                            <p style={{ fontSize: 14, marginTop: 8 }}>If You're Logged In, Your Chats Will Appear Shortly</p>
                        </div>
                    );
                })()}

                <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" userRole={currentUserMembership?.role} />
                <Toast toast={toast} onDismiss={() => setToast(null)} />
            </div>
        </>
    );
}
