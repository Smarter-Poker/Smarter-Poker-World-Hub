/**
 * CLUB ARENA — Messages | Facebook Messenger Clone
 * Full-featured messaging with Facebook Dark theme
 * Matches the Social Messenger look and feel
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

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
// ⌨️ MESSAGE INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function MessageInput({ onSend, disabled }) {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const inputRef = useRef(null);

    const emojis = ['😀', '😂', '❤️', '👍', '🔥', '🎰', '😎', '🤔', '👏', '💯', '♠️', '♥️', '♦️', '♣️'];

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

    return (
        <div style={{ padding: '12px 16px', background: C.card, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Input wrapper */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: C.hoverBg, borderRadius: 24, padding: '0 12px', position: 'relative' }}>
                <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Aa"
                    disabled={disabled}
                    style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 0', fontSize: 15, outline: 'none', color: C.text }}
                />
                <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke={C.blue} strokeWidth="1.5" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={C.blue} strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="9" cy="10" r="1" fill={C.blue} />
                        <circle cx="15" cy="10" r="1" fill={C.blue} />
                    </svg>
                </button>

                {showEmoji && (
                    <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 8, background: C.card, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, zIndex: 100 }}>
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => { setText(prev => prev + emoji); setShowEmoji(false); }}
                                style={{ width: 32, height: 32, border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 18 }}
                            >{emoji}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* Send button */}
            <button
                onClick={handleSend}
                disabled={!text.trim()}
                style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: text.trim() ? C.blue : 'transparent', cursor: text.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            >
                {text.trim() ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" stroke={C.blue} strokeWidth="1.5" fill="none" /></svg>
                )}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function MessageBubble({ message, isOwn, showAvatar, sender, showTime, isLastInGroup }) {
    return (
        <div style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: isLastInGroup ? 16 : 2, paddingLeft: isOwn ? 60 : 12, paddingRight: isOwn ? 12 : 60 }}>
            {/* Avatar */}
            {!isOwn && (showAvatar ? <Avatar src={sender?.avatar_url} name={sender?.username || sender?.alias} size={28} showOnline={false} /> : <div style={{ width: 28 }} />)}

            {/* Bubble */}
            <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isOwn ? C.ownBubble : C.otherBubble, color: 'white', fontSize: 15, lineHeight: 1.4, wordBreak: 'break-word' }}>
                {message.content || message.message}
            </div>

            {/* Time */}
            {showTime && (
                <span style={{ fontSize: 11, color: C.textSec, whiteSpace: 'nowrap', alignSelf: 'center' }}>
                    {formatMessageTime(message.created_at)}
                </span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CONVERSATION LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

function ConversationItem({ conversation, isActive, onClick, currentUserId }) {
    const otherUser = conversation.otherUser || conversation.profiles;
    const lastMsg = conversation.last_message || conversation.content;
    const isUnread = conversation.unread > 0;

    return (
        <div
            onClick={onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: 'pointer', background: isActive ? C.hoverBg : 'transparent', borderRadius: 8, margin: '2px 8px', transition: 'background 0.15s' }}
        >
            <Avatar src={otherUser?.avatar_url} name={otherUser?.username || otherUser?.alias} size={56} online={otherUser?.online} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: isUnread ? 600 : 500, fontSize: 15, color: C.text, marginBottom: 2 }}>
                    {otherUser?.alias || otherUser?.username || 'Unknown Player'}
                </div>
                <div style={{ fontSize: 13, color: isUnread ? C.text : C.textSec, fontWeight: isUnread ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lastMsg?.slice(0, 35)}{lastMsg?.length > 35 ? '...' : ''}
                    <span style={{ color: C.textSec }}> · {timeAgo(conversation.last_message_at || conversation.created_at)}</span>
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

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [clubMembers, setClubMembers] = useState([]);
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('list'); // 'list' | 'chat' | 'new'
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    // Load initial data
    useEffect(() => {
        if (clubIdParam) loadData();
    }, [clubIdParam]);

    // Auth check
    useEffect(() => {
        async function checkAuth() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                setUser({ ...session.user, ...profile });
            }
        }
        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                setUser({ ...session.user, ...profile });
            } else {
                setUser(null);
            }
        });

        return () => subscription?.unsubscribe();
    }, []);

    async function loadData() {
        try {
            // Load club
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) {
                setClub(clubData);

                // Load club members for messaging
                const { data: members } = await supabase
                    .from('club_members')
                    .select('*, profiles:user_id(id, username, alias, avatar_url)')
                    .eq('club_id', clubData.id);
                setClubMembers(members || []);

                // Load club conversations (messages between club members)
                const { data: msgData } = await supabase
                    .from('club_messages')
                    .select('*, sender:sender_id(id, username, alias, avatar_url), recipient:recipient_id(id, username, alias, avatar_url)')
                    .eq('club_id', clubData.id)
                    .order('created_at', { ascending: false });

                // Group into conversations
                const convMap = new Map();
                (msgData || []).forEach(msg => {
                    const otherId = msg.sender_id === user?.id ? msg.recipient_id : msg.sender_id;
                    const other = msg.sender_id === user?.id ? msg.recipient : msg.sender;
                    if (!convMap.has(otherId)) {
                        convMap.set(otherId, { otherUser: other, messages: [], last_message: msg.content, last_message_at: msg.created_at, unread: 0 });
                    }
                    convMap.get(otherId).messages.push(msg);
                });
                setConversations(Array.from(convMap.values()));
            }
        } catch (e) {
            console.error('[Messages] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Search club members
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        const query = searchQuery.toLowerCase();
        const results = clubMembers.filter(m =>
            m.profiles?.username?.toLowerCase().includes(query) ||
            m.profiles?.alias?.toLowerCase().includes(query)
        ).slice(0, 5);
        setSearchResults(results);
    }, [searchQuery, clubMembers]);

    // Open conversation
    const openConversation = async (conv) => {
        setActiveConversation(conv);
        setMessages(conv.messages || []);
        setView('chat');
    };

    // Start new conversation
    const startConversation = async (member) => {
        const newConv = {
            otherUser: member.profiles,
            messages: [],
            last_message: '',
            last_message_at: new Date().toISOString()
        };
        setActiveConversation(newConv);
        setMessages([]);
        setSearchQuery('');
        setView('chat');
    };

    // Send message
    const sendMessage = async (content) => {
        if (!user || !activeConversation?.otherUser) return;

        const recipientId = activeConversation.otherUser.id;

        // Optimistic update
        const newMsg = {
            id: `temp-${Date.now()}`,
            content,
            sender_id: user.id,
            recipient_id: recipientId,
            created_at: new Date().toISOString(),
            sender: user,
            status: 'sending'
        };
        setMessages(prev => [...prev, newMsg]);
        playMessageSound();

        try {
            const { data, error } = await supabase
                .from('club_messages')
                .insert({
                    club_id: club.id,
                    sender_id: user.id,
                    recipient_id: recipientId,
                    content
                })
                .select()
                .single();

            if (error) throw error;

            // Replace temp message with real one
            setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...data, sender: user, status: 'sent' } : m));
        } catch (e) {
            console.error('Failed to send:', e);
            setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'failed' } : m));
        }
    };

    // Styles
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
        lobbyBtn: { display: 'inline-block', marginTop: 20, padding: '10px 20px', background: C.blue, color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 },
    };

    // Render: Loading
    if (isLoading) {
        return (
            <>
                <Head><title>Messages | Club Arena</title></Head>
                <div style={S.page}>
                    <UniversalHeader pageDepth={2} />
                    <div style={S.emptyState}>Loading...</div>
                    <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
                </div>
            </>
        );
    }

    // Render: Not logged in
    if (!user) {
        return (
            <>
                <Head><title>Messages | Club Arena</title></Head>
                <div style={S.page}>
                    <UniversalHeader pageDepth={2} />
                    <div style={S.emptyState}>
                        <div style={S.emptyIcon}>🔒</div>
                        <p>Sign in to access messages</p>
                        <a href={`/hub/club-arena/lobby?club=${clubIdParam}`} style={S.lobbyBtn}>Back to Lobby</a>
                    </div>
                    <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
                </div>
            </>
        );
    }

    // Render: Chat View
    if (view === 'chat' && activeConversation) {
        const otherUser = activeConversation.otherUser;

        return (
            <>
                <Head><title>Chat with {otherUser?.alias || otherUser?.username} | Club Arena</title></Head>
                <div style={{ ...S.page, display: 'flex', flexDirection: 'column', height: '100vh' }}>
                    <UniversalHeader pageDepth={2} />

                    {/* Chat Header */}
                    <div style={S.chatHeader}>
                        <button onClick={() => setView('list')} style={S.backBtn}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                        </button>
                        <Avatar src={otherUser?.avatar_url} name={otherUser?.username || otherUser?.alias} size={40} />
                        <div>
                            <div style={S.chatName}>{otherUser?.alias || otherUser?.username}</div>
                            <div style={{ fontSize: 12, color: C.textSec }}>Club Member</div>
                        </div>
                    </div>

                    {/* Messages */}
                    <div style={S.messagesContainer}>
                        {messages.length === 0 ? (
                            <div style={{ ...S.emptyState, padding: '40px 20px' }}>
                                <Avatar src={otherUser?.avatar_url} name={otherUser?.username} size={80} showOnline={false} />
                                <p style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: C.text }}>{otherUser?.alias || otherUser?.username}</p>
                                <p style={{ fontSize: 14, color: C.textSec }}>Start your conversation</p>
                            </div>
                        ) : (
                            messages.map((msg, i) => {
                                const isOwn = msg.sender_id === user.id;
                                const prev = messages[i - 1];
                                const next = messages[i + 1];
                                const showAvatar = !isOwn && (!next || next.sender_id !== msg.sender_id);
                                const showTime = !next || next.sender_id !== msg.sender_id;
                                const isLastInGroup = !next || next.sender_id !== msg.sender_id;

                                return (
                                    <MessageBubble
                                        key={msg.id}
                                        message={msg}
                                        isOwn={isOwn}
                                        showAvatar={showAvatar}
                                        sender={isOwn ? user : activeConversation.otherUser}
                                        showTime={showTime}
                                        isLastInGroup={isLastInGroup}
                                    />
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <MessageInput onSend={sendMessage} />
                    <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
                </div>
            </>
        );
    }

    // Render: Conversation List (default)
    return (
        <>
            <Head><title>Messages | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />

                {/* Header */}
                <div style={S.header}>
                    <span style={S.headerTitle}>Chats</span>
                    <button onClick={() => setView('new')} style={S.newBtn} title="New Message">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill={C.blue}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                    </button>
                </div>

                {/* Search */}
                <div style={S.searchBar}>
                    <input
                        type="text"
                        placeholder="🔍  Search club members..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={S.searchInput}
                    />

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && (
                        <div style={{ marginTop: 8, background: C.card, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                            {searchResults.map(member => (
                                <div
                                    key={member.id}
                                    onClick={() => startConversation(member)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                                >
                                    <Avatar src={member.profiles?.avatar_url} name={member.profiles?.username} size={44} />
                                    <div>
                                        <div style={{ fontWeight: 600, color: C.text }}>{member.profiles?.alias || member.profiles?.username}</div>
                                        <div style={{ fontSize: 12, color: C.textSec }}>@{member.profiles?.username}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Conversations List */}
                {conversations.length > 0 ? (
                    conversations.map((conv, i) => (
                        <ConversationItem
                            key={i}
                            conversation={conv}
                            isActive={false}
                            onClick={() => openConversation(conv)}
                            currentUserId={user.id}
                        />
                    ))
                ) : (
                    <div style={S.emptyState}>
                        <div style={S.emptyIcon}>💬</div>
                        <p style={{ fontSize: 16, fontWeight: 500 }}>No messages yet</p>
                        <p style={{ fontSize: 14, marginTop: 8 }}>Search for a club member above to start chatting</p>
                    </div>
                )}

                <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
            </div>
        </>
    );
}
