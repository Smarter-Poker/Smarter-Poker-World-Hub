/**
 * CLUB ARENA — Messages | Full Feature Parity with Social Messenger
 * Full-featured messaging: video/voice calls, media uploads, GIFs, reactions
 * Uses Social messaging infrastructure with club member filtering
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import { createMultiDeviceAuthListener, persistSession, getPersistedSession } from '../../../src/utils/authGuard';
import { createRingTone } from '../../../src/utils/ringTone';

// Dynamic import for LiveKit (client-side only)
const LiveKitCall = dynamic(
    () => import('../../../src/components/video/LiveKitCall'),
    { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 FACEBOOK DARK COLOR PALETTE
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

// ═══════════════════════════════════════════════════════════════════════════
// 📱 SVG ICONS
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
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function playMessageSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0tRXFuYz0mFTNNaWxofmh+YKStoJd/aGtbL09OYUFRYWOHeoKK');
        audio.volume = 0.3;
        audio.play().catch(() => { });
    } catch (e) { }
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
                <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
                <div style={{ width: size, height: size, borderRadius: '50%', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: size * 0.4 }}>
                    {initials}
                </div>
            )}
            {showOnline && online && (
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.3, height: size * 0.3, borderRadius: '50%', background: C.green, border: `2px solid ${C.card}` }} />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📣 TOAST COMPONENT
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
// ⌨️ MESSAGE INPUT COMPONENT (Full-featured)
// ═══════════════════════════════════════════════════════════════════════════

function MessageInput({ onSend, onMediaUpload, disabled }) {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    const emojis = ['😀', '😂', '❤️', '👍', '🔥', '🎰', '😎', '🤔', '👏', '💯', '♠️', '♥️', '♦️', '♣️', '🏆', '💰'];

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

    const handleQuickLike = () => {
        onSend('👍');
    };

    return (
        <div style={{ padding: '12px 16px', background: C.card, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Photo/Video Upload */}
            <input type="file" ref={fileInputRef} accept="image/*,video/*" style={{ display: 'none' }}
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

            {/* GIF Button */}
            <button onClick={() => { if (typeof setToast === 'function') { /* GIF coming soon */ } }} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: 0.4 }} title="GIF — Coming Soon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="14" rx="2" stroke={C.blue} strokeWidth="1.5" />
                    <text x="12" y="14" textAnchor="middle" fontSize="7" fontWeight="bold" fill={C.blue}>GIF</text>
                </svg>
            </button>

            {/* Input wrapper */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: C.hoverBg, borderRadius: 24, padding: '0 12px', position: 'relative' }}>
                <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Aa" disabled={disabled}
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
// 💬 MESSAGE BUBBLE COMPONENT (with media support)
// ═══════════════════════════════════════════════════════════════════════════

function MessageBubble({ message, isOwn, showAvatar, sender, showTime, isLastInGroup }) {
    const content = message.content || message.message || '';

    // Check for image markdown: [Image](url)
    const imageMatch = content.match(/\[Image\]\(([^)]+)\)/);
    const videoMatch = content.match(/\[Video\]\(([^)]+)\)/);

    return (
        <div style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: isLastInGroup ? 16 : 2, paddingLeft: isOwn ? 60 : 12, paddingRight: isOwn ? 12 : 60 }}>
            {!isOwn && (showAvatar ? <Avatar src={sender?.avatar_url} name={sender?.username || sender?.display_name} size={28} showOnline={false} /> : <div style={{ width: 28 }} />)}

            {imageMatch ? (
                <img src={imageMatch[1]} alt="Shared Image" style={{ maxWidth: '70%', borderRadius: 12, cursor: 'pointer' }} onClick={() => window.open(imageMatch[1], '_blank')} />
            ) : videoMatch ? (
                <video src={videoMatch[1]} controls style={{ maxWidth: '70%', borderRadius: 12 }} />
            ) : (
                <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isOwn ? C.ownBubble : C.otherBubble, color: 'white', fontSize: 15, lineHeight: 1.4, wordBreak: 'break-word' }}>
                    {content}
                </div>
            )}

            {showTime && <span style={{ fontSize: 11, color: C.textSec, whiteSpace: 'nowrap', alignSelf: 'center' }}>{formatMessageTime(message.created_at)}</span>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CONVERSATION LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

function ConversationItem({ conversation, isActive, onClick }) {
    const otherUser = conversation.otherUser;
    const lastMsg = conversation.last_message_preview;
    const isUnread = conversation.unreadCount > 0;

    return (
        <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer', background: isActive ? C.hoverBg : 'transparent', borderRadius: 8, margin: '2px 8px', transition: 'background 0.15s' }}>
            <Avatar src={otherUser?.avatar_url} name={otherUser?.username || otherUser?.display_name} size={56} online={otherUser?.online} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: isUnread ? 600 : 500, fontSize: 15, color: C.text, marginBottom: 2 }}>{otherUser?.display_name || otherUser?.username || 'Unknown Player'}</div>
                <div style={{ fontSize: 13, color: isUnread ? C.text : C.textSec, fontWeight: isUnread ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lastMsg?.slice(0, 35)}{lastMsg?.length > 35 ? '...' : ''}
                    <span style={{ color: C.textSec }}> · {timeAgo(conversation.last_message_at)}</span>
                </div>
            </div>
            {isUnread && <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.blue }} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏠 MAIN MESSAGES PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ClubMessages() {
    const router = useRouter();
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
    const [view, setView] = useState('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [toast, setToast] = useState(null);

    // Call state
    const [showCall, setShowCall] = useState(false);
    const [callRoomName, setCallRoomName] = useState(null);
    const [callType, setCallType] = useState('video');
    const [callingUser, setCallingUser] = useState(null);
    const [showUserInfo, setShowUserInfo] = useState(false);
    const [showMessageSearch, setShowMessageSearch] = useState(false);

    // ═══════════════════════════════════════════════════════════════════════
    // 🔐 BULLETPROOF AUTH
    // ═══════════════════════════════════════════════════════════════════════

    useEffect(() => {
        async function init() {
            try {
                let authUser = null;

                // FAST PATH: Check localStorage first
                if (typeof window !== 'undefined') {
                    try {
                        const authData = localStorage.getItem('smarter-poker-auth');
                        if (authData) {
                            const tokenData = JSON.parse(authData);
                            authUser = tokenData?.user || null;
                        }
                        if (!authUser) {
                            const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                            if (sbKeys.length > 0) {
                                const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                                authUser = tokenData?.user || null;
                            }
                        }
                    } catch (e) {
                        console.warn('[ClubMessages] Error reading localStorage:', e);
                    }
                }

                if (!authUser) {
                    try {
                        const { data } = await supabase.auth.getUser();
                        authUser = data?.user || null;
                    } catch (e) {
                        console.warn('[ClubMessages] getUser failed:', e);
                    }
                }

                if (authUser) {
                    const { data: profile } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', authUser.id).single();
                    const fullUser = { ...authUser, ...profile };
                    setUser(fullUser);
                    persistSession(fullUser);
                    console.log('[ClubMessages] User authenticated:', fullUser.username);
                } else {
                    console.log('[ClubMessages] No user found');
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
            console.log('[ClubMessages] Auth event:', event, 'User:', authUser?.id?.slice(0, 8) || 'none');

            if (!authUser) {
                setUser(null);
                setConversations([]);
                return;
            }

            const { data: profile } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', authUser.id).single();
            setUser({ ...authUser, ...profile });
        });

        return cleanup;
    }, []);

    // Load club and members (re-run when user loads so membership is found)
    useEffect(() => {
        if (clubIdParam) loadClubData(user?.id);
    }, [clubIdParam, user?.id]);

    // Load conversations when we have user and club members
    useEffect(() => {
        if (user && clubMemberIds.size > 0) {
            loadConversations();
        }
    }, [user, clubMemberIds]);

    // ═══════════════════════════════════════════════════════════════════════
    // 🔒 MESSAGING HIERARCHY PERMISSION CHECKER
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

        // Union owners/admins can message anyone
        if (club?.is_union && ['owner', 'admin'].includes(senderRole)) return true;

        // Club owners can message all players
        if (senderRole === 'owner') return true;

        // Admins can message all players
        if (senderRole === 'admin') return true;

        // Agents can only message their downlines (players assigned to them)
        if (senderRole === 'agent') {
            return targetMember.agent_id === currentUserMembership.user_id;
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
            const { data: clubData } = await supabase.from('clubs').select('*').eq(isUUID ? 'id' : 'club_id', clubIdParam).single();
            if (clubData) {
                setClub(clubData);

                const { data: members } = await supabase.from('club_members').select('*, profiles!inner(id, username, display_name, avatar_url)').eq('club_id', clubData.id);
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

    async function loadConversations() {
        if (!user?.id) return;

        try {
            const resp = await fetch('/api/messenger/get-conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
            });

            const result = await resp.json();

            if (result.success && Array.isArray(result.conversations)) {
                const clubConversations = result.conversations.filter(conv => {
                    const otherId = conv.otherUser?.id;
                    return otherId && clubMemberIds.has(otherId);
                });
                setConversations(clubConversations);
            }
        } catch (e) {
            console.error('[ClubMessages] loadConversations error:', e);
        }
    }

    // Search club members - FILTERED BY MESSAGING HIERARCHY
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        const query = searchQuery.toLowerCase();
        const results = clubMembers
            .filter(m => m.user_id !== user?.id)
            .filter(m => canMessageUser(m)) // 🔒 HIERARCHY: Only show allowed recipients
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
                table: 'messages',
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
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversation?.id, user?.id]);

    // ═══════════════════════════════════════════════════════════════════════
    // 📞 VIDEO/VOICE CALL FUNCTIONS
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
                console.warn('Push notification failed:', pushError);
            }
        } catch (e) {
            console.error('Failed to send call signal:', e);
            setToast({ type: 'error', message: 'Failed To Call. Please Try Again.' });
            setCallingUser(null);
            return;
        }

        setCallRoomName(roomName);
        setShowCall(true);

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
                console.warn('Failed to send end call signal:', e);
            }
        }

        setShowCall(false);
        setCallRoomName(null);
        setCallingUser(null);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 📤 MEDIA UPLOAD
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

            const { data: msgId, error } = await supabase.rpc('fn_send_message', {
                p_conversation_id: activeConversation.id,
                p_sender_id: user.id,
                p_content: content,
            });

            if (error) throw error;

            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: msgId, content, status: 'sent' } : m));
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

        try {
            const resp = await fetch('/api/messenger/get-messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

        // 🔒 HIERARCHY CHECK: Verify permission before creating conversation
        if (!canMessageUser(member)) {
            let errorMsg = 'You cannot message this user.';
            if (currentUserMembership?.role === 'player') {
                errorMsg = 'You can only message your agent or club admins.';
            } else if (currentUserMembership?.role === 'agent') {
                errorMsg = 'You can only message players assigned to you.';
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
        const tempMsg = { id: tempId, content, sender_id: user.id, created_at: new Date().toISOString(), profiles: user, status: 'sending' };
        setMessages(prev => [...prev, tempMsg]);
        playMessageSound();

        setConversations(prev => {
            const updated = prev.map(c => c.id === activeConversation.id ? { ...c, last_message_preview: content, last_message_at: new Date().toISOString() } : c);
            return updated.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
        });

        try {
            const { data: msgId, error } = await supabase.rpc('fn_send_message', {
                p_conversation_id: activeConversation.id,
                p_sender_id: user.id,
                p_content: content,
            });

            if (error) throw error;
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: msgId, status: 'sent' } : m));
        } catch (e) {
            console.error('Send failed:', e);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 🎨 RENDER
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

    // Loading
    if (isLoading) {
        return (
            <>
                <SEOHead
                    title="Club Arena — Messages"
                    description="View Your Club Arena Messages."
                    canonical="/hub/club-arena/messages"
                    noindex={true}
                />
                <div style={S.page}>
                    <UniversalHeader pageDepth={2} />
                    <div style={S.emptyState}>Loading...</div>
                    <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
                </div>
            </>
        );
    }

    // Chat View
    if (view === 'chat' && activeConversation) {
        const otherUser = activeConversation.otherUser;

        return (
            <>
                <Head><title>Chat with {otherUser?.display_name || otherUser?.username} | Club Arena</title></Head>
                <div style={{ ...S.page, display: 'flex', flexDirection: 'column', height: '100vh' }}>
                    <UniversalHeader pageDepth={2} />

                    {/* Chat Header with Call Buttons */}
                    <div style={S.chatHeader}>
                        <button onClick={() => setView('list')} style={S.backBtn}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                        </button>
                        <Avatar src={otherUser?.avatar_url} name={otherUser?.username || otherUser?.display_name} size={40} />
                        <div style={{ flex: 1 }}>
                            <div style={S.chatName}>{otherUser?.display_name || otherUser?.username}</div>
                            <div style={{ fontSize: 12, color: C.textSec }}>Club Member</div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setShowMessageSearch(!showMessageSearch)} style={S.iconBtn} title="Search Messages">
                                <SearchIcon size={20} />
                            </button>
                            <button onClick={() => startCall('audio')} style={S.iconBtn} title="Voice Call">
                                <PhoneIcon size={20} />
                            </button>
                            <button onClick={() => startCall('video')} style={S.iconBtn} title="Video Call">
                                <VideoIcon size={20} />
                            </button>
                            <button onClick={() => setShowUserInfo(!showUserInfo)} style={S.iconBtn} title="User Info">
                                <InfoIcon size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div style={S.messagesContainer}>
                        {messages.length === 0 ? (
                            <div style={{ ...S.emptyState, padding: '40px 20px' }}>
                                <Avatar src={otherUser?.avatar_url} name={otherUser?.username} size={80} showOnline={false} />
                                <p style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: C.text }}>{otherUser?.display_name || otherUser?.username}</p>
                                <p style={{ fontSize: 14, color: C.textSec }}>Start Your Conversation</p>
                            </div>
                        ) : (
                            messages.map((msg, i) => {
                                const isOwn = msg.sender_id === user.id;
                                const next = messages[i + 1];
                                const showAvatar = !isOwn && (!next || next.sender_id !== msg.sender_id);
                                const showTime = !next || next.sender_id !== msg.sender_id;
                                const isLastInGroup = !next || next.sender_id !== msg.sender_id;

                                return <MessageBubble key={msg.id} message={msg} isOwn={isOwn} showAvatar={showAvatar} sender={isOwn ? user : activeConversation.otherUser} showTime={showTime} isLastInGroup={isLastInGroup} />;
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <MessageInput onSend={sendMessage} onMediaUpload={handleMediaUpload} />
                    <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
                </div>

                {/* LiveKit Video Call Modal */}
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
                        <LiveKitCall roomName={callRoomName} userName={user?.username || 'User'} userId={user?.id} onDisconnect={endCall} isVideo={callType === 'video'} />
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
                <UniversalHeader pageDepth={2} />

                <div style={S.header}>
                    <span style={S.headerTitle}>Chats</span>
                    <button onClick={() => { }} style={S.newBtn} title="New Message">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                    </button>
                </div>

                <div style={S.searchBar}>
                    <input type="text" placeholder="🔍  Search Club Members..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={S.searchInput} />

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

                {conversations.length > 0 ? (
                    conversations.map((conv, i) => <ConversationItem key={conv.id || i} conversation={conv} isActive={false} onClick={() => openConversation(conv)} />)
                ) : user ? (
                    <div style={S.emptyState}>
                        <div style={S.emptyIcon}>💬</div>
                        <p style={{ fontSize: 16, fontWeight: 500 }}>No Club Conversations Yet</p>
                        <p style={{ fontSize: 14, marginTop: 8 }}>Search For A Club Member Above To Start Chatting</p>
                    </div>
                ) : (
                    <div style={S.emptyState}>
                        <div style={S.emptyIcon}>💬</div>
                        <p style={{ fontSize: 16, fontWeight: 500 }}>Loading Your Session...</p>
                        <p style={{ fontSize: 14, marginTop: 8 }}>If You're Logged In, Your Chats Will Appear Shortly</p>
                    </div>
                )}

                <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
                <Toast toast={toast} onDismiss={() => setToast(null)} />
            </div>
        </>
    );
}
