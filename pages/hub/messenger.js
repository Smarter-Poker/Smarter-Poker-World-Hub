/**
 * 💬 SMARTER.POKER MESSENGER
 * Full-featured Facebook Messenger clone with premium design
 * Real-time chat, read receipts, typing indicators, and poker-themed UI
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 COLOR PALETTE - Premium Poker Theme
// ═══════════════════════════════════════════════════════════════════════════

const C = {
    // Core colors
    bg: '#F0F2F5',
    bgDark: '#1C1E21',
    card: '#FFFFFF',
    cardDark: '#242526',

    // Text
    text: '#050505',
    textDark: '#E4E6EB',
    textSec: '#65676B',
    textSecDark: '#B0B3B8',

    // Accent
    blue: '#0084FF',
    blueHover: '#0073E6',
    green: '#31A24C',
    purple: '#8A2BE2',
    gold: '#FFD700',

    // UI Elements
    border: '#E4E6EB',
    borderDark: '#3E4042',
    hoverBg: '#E4E6EB',
    hoverBgDark: '#3A3B3C',

    // Message bubbles
    ownBubble: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)',
    otherBubble: '#E4E6EB',
    otherBubbleDark: '#3A3B3C',

    // Poker themed
    pokerGreen: '#35654d',
    pokerFelt: '#1a472a',
    chipGold: '#FFD700',
    cardRed: '#E41E3F',
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

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
                <img
                    src={src}
                    alt={name}
                    style={{
                        width: size,
                        height: size,
                        borderRadius: '50%',
                        objectFit: 'cover',
                    }}
                />
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
            {showOnline && online && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: size * 0.3,
                        height: size * 0.3,
                        borderRadius: '50%',
                        background: C.green,
                        border: '2px solid white',
                    }}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 MESSAGE INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function MessageInput({ onSend, disabled }) {
    const [text, setText] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const inputRef = useRef(null);

    const emojis = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '😎', '🤔', '👏', '💯', '♠️', '♥️', '♦️', '♣️', '🃏', '🎰'];

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
        <div style={{
            padding: '12px 16px',
            background: C.card,
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
        }}>
            {/* Action buttons */}
            <button style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'transparent', cursor: 'pointer', fontSize: 20, color: C.blue,
            }}>➕</button>

            <button style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'transparent', cursor: 'pointer', fontSize: 20, color: C.blue,
            }}>📷</button>

            <button style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'transparent', cursor: 'pointer', fontSize: 20, color: C.blue,
            }}>🎁</button>

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
                    onChange={e => setText(e.target.value)}
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
                    }}
                />

                <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 20,
                        padding: 4,
                    }}
                >😊</button>

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

            {/* Send button */}
            <button
                onClick={handleSend}
                disabled={!text.trim()}
                style={{
                    width: 36, height: 36, borderRadius: '50%', border: 'none',
                    background: text.trim() ? C.blue : 'transparent',
                    cursor: text.trim() ? 'pointer' : 'default',
                    fontSize: 18,
                    color: text.trim() ? 'white' : C.blue,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {text.trim() ? '➤' : '👍'}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 💬 MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function MessageBubble({ message, isOwn, showAvatar, sender, showTime, isLastInGroup }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: isOwn ? 'row-reverse' : 'row',
            alignItems: 'flex-end',
            gap: 8,
            marginBottom: isLastInGroup ? 16 : 2,
            paddingLeft: isOwn ? 60 : 12,
            paddingRight: isOwn ? 12 : 60,
        }}>
            {/* Avatar */}
            {!isOwn && (
                showAvatar ? (
                    <Avatar src={sender?.avatar_url} name={sender?.username} size={28} showOnline={false} />
                ) : (
                    <div style={{ width: 28 }} />
                )
            )}

            {/* Bubble */}
            <div style={{
                maxWidth: '70%',
                padding: '8px 12px',
                borderRadius: 18,
                background: isOwn ? C.ownBubble : C.otherBubble,
                color: isOwn ? 'white' : C.text,
                fontSize: 15,
                lineHeight: 1.4,
                borderBottomRightRadius: isOwn && !isLastInGroup ? 4 : 18,
                borderBottomLeftRadius: !isOwn && !isLastInGroup ? 4 : 18,
                wordBreak: 'break-word',
            }}>
                {message.content || message.text}
            </div>

            {/* Timestamp (on hover) */}
            {showTime && (
                <span style={{
                    fontSize: 11,
                    color: C.textSec,
                    whiteSpace: 'nowrap',
                    alignSelf: 'center',
                }}>
                    {formatMessageTime(message.created_at || message.timestamp)}
                </span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 CONVERSATION LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════

function ConversationItem({ conversation, isActive, onClick, currentUserId }) {
    const otherUser = conversation.otherUser || conversation.participants?.find(p => p.id !== currentUserId);
    const lastMsg = conversation.last_message_preview || conversation.lastMessage;
    const isUnread = conversation.unreadCount > 0;

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
            }}
            onMouseEnter={e => !isActive && (e.currentTarget.style.background = C.hoverBg)}
            onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
        >
            <Avatar
                src={otherUser?.avatar_url}
                name={otherUser?.username || otherUser?.name}
                size={56}
                online={otherUser?.online}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: isUnread ? 600 : 500,
                    fontSize: 15,
                    color: C.text,
                    marginBottom: 2,
                }}>
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
                    {lastMsg?.slice(0, 35)}{lastMsg?.length > 35 ? '...' : ''}
                    <span style={{ color: C.textSec }}> · {timeAgo(conversation.last_message_at)}</span>
                </div>
            </div>

            {isUnread && (
                <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: C.blue,
                }} />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SEARCH BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function SearchBar({ value, onChange, onSearchUser, searchResults, onSelectUser, inputRef, composing }) {
    return (
        <div style={{ padding: '12px 16px', position: 'relative' }}>
            {composing && (
                <div style={{
                    marginBottom: 12,
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, #0084FF 0%, #0066CC 100%)',
                    borderRadius: 8,
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 500,
                }}>
                    ✨ New Message - Search for a user below
                </div>
            )}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                background: C.bg,
                borderRadius: 24,
                padding: '0 12px',
                border: composing ? `2px solid ${C.blue}` : 'none',
            }}>
                <span style={{ color: C.textSec, marginRight: 8 }}>🔍</span>
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

export default function MessengerPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isMobile, setIsMobile] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [composing, setComposing] = useState(false);

    const messagesEndRef = useRef(null);
    const searchTimeout = useRef(null);
    const searchInputRef = useRef(null);

    // Check for mobile
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Load user and conversations
    useEffect(() => {
        async function init() {
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url')
                        .eq('id', authUser.id)
                        .single();

                    setUser({ ...authUser, ...profile });
                    await loadConversations(authUser.id);
                }
            } catch (e) {
                console.error('Init error:', e);
            }
            setLoading(false);
        }
        init();
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Subscribe to real-time messages
    useEffect(() => {
        if (!user || !activeConversation) return;

        const channel = supabase
            .channel(`conversation:${activeConversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_messages',
                filter: `conversation_id=eq.${activeConversation.id}`,
            }, payload => {
                setMessages(prev => [...prev, payload.new]);
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [user, activeConversation]);

    const loadConversations = async (userId) => {
        try {
            // Get conversations through participants
            const { data: participations } = await supabase
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

            if (!participations) return;

            // Enrich with other participant info
            const enriched = await Promise.all(
                participations.map(async (p) => {
                    const { data: participants } = await supabase
                        .from('social_conversation_participants')
                        .select('user_id, profiles(id, username, avatar_url)')
                        .eq('conversation_id', p.conversation_id)
                        .neq('user_id', userId);

                    const otherUser = participants?.[0]?.profiles;

                    // Count unread
                    const { count } = await supabase
                        .from('social_messages')
                        .select('id', { count: 'exact', head: true })
                        .eq('conversation_id', p.conversation_id)
                        .neq('sender_id', userId)
                        .gt('created_at', p.last_read_at || '1970-01-01');

                    return {
                        id: p.conversation_id,
                        ...p.social_conversations,
                        otherUser,
                        unreadCount: count || 0,
                        last_read_at: p.last_read_at,
                    };
                })
            );

            setConversations(enriched.filter(c => c.otherUser));
        } catch (e) {
            console.error('Load conversations error:', e);
        }
    };

    const loadMessages = async (conversationId) => {
        setLoadingMessages(true);
        try {
            const { data } = await supabase
                .from('social_messages')
                .select(`
                    id,
                    content,
                    created_at,
                    sender_id,
                    profiles:sender_id (id, username, avatar_url)
                `)
                .eq('conversation_id', conversationId)
                .eq('is_deleted', false)
                .order('created_at', { ascending: true })
                .limit(100);

            setMessages(data || []);

            // Mark as read
            await supabase
                .from('social_conversation_participants')
                .update({ last_read_at: new Date().toISOString() })
                .eq('conversation_id', conversationId)
                .eq('user_id', user.id);

        } catch (e) {
            console.error('Load messages error:', e);
        }
        setLoadingMessages(false);
    };

    const handleSelectConversation = async (conversation) => {
        setActiveConversation(conversation);
        if (isMobile) setShowSidebar(false);
        await loadMessages(conversation.id);

        // Update local unread count
        setConversations(prev => prev.map(c =>
            c.id === conversation.id ? { ...c, unreadCount: 0 } : c
        ));
    };

    const handleSendMessage = async (content) => {
        if (!user || !activeConversation || !content.trim()) return;

        try {
            const { data, error } = await supabase.rpc('fn_send_message', {
                p_conversation_id: activeConversation.id,
                p_sender_id: user.id,
                p_content: content,
            });

            if (error) throw error;

            // Fetch the sent message
            const { data: msg } = await supabase
                .from('social_messages')
                .select('id, content, created_at, sender_id')
                .eq('id', data)
                .single();

            if (msg) {
                setMessages(prev => [...prev, { ...msg, profiles: { id: user.id, username: user.username, avatar_url: user.avatar_url } }]);
            }

            // Update conversation preview
            setConversations(prev => prev.map(c =>
                c.id === activeConversation.id
                    ? { ...c, last_message_preview: content, last_message_at: new Date().toISOString() }
                    : c
            ));

        } catch (e) {
            console.error('Send message error:', e);
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
                const { data } = await supabase
                    .from('profiles')
                    .select('id, username, full_name, avatar_url')
                    .ilike('username', `%${query}%`)
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

    // Loading state
    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: C.bg,
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
                    <div style={{ color: C.textSec }}>Loading Messenger...</div>
                </div>
            </div>
        );
    }

    // Not logged in
    if (!user) {
        return (
            <>
                <Head><title>Messenger | Smarter.Poker</title></Head>
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
                        <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
                        <h2 style={{ margin: '0 0 8px', color: C.text }}>Sign in to Messenger</h2>
                        <p style={{ color: C.textSec, marginBottom: 24 }}>Connect with your poker network</p>
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
            <Head><title>Messenger | Smarter.Poker</title></Head>

            <div style={{
                display: 'flex',
                height: '100vh',
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
                    height: '100vh',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Link href="/hub/social-media">
                                <Avatar src={user.avatar_url} name={user.username} size={40} />
                            </Link>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Chats</h1>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
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

                    {/* Conversations */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {conversations.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: 40,
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                                <div style={{ color: C.text, fontWeight: 500, marginBottom: 4 }}>No conversations yet</div>
                                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>Search for someone to start chatting!</div>
                                <button
                                    onClick={() => {
                                        setComposing(true);
                                        setTimeout(() => searchInputRef.current?.focus(), 100);
                                    }}
                                    style={{
                                        background: C.blue,
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 8,
                                        padding: '12px 24px',
                                        fontSize: 15,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >✏️ Start New Chat</button>
                            </div>
                        ) : (
                            conversations.map(conv => (
                                <ConversationItem
                                    key={conv.id}
                                    conversation={conv}
                                    isActive={activeConversation?.id === conv.id}
                                    onClick={() => handleSelectConversation(conv)}
                                    currentUserId={user.id}
                                />
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: 12,
                        borderTop: `1px solid ${C.border}`,
                        textAlign: 'center',
                    }}>
                        <Link href="/hub/social-media" style={{
                            color: C.blue, fontSize: 14, fontWeight: 500, textDecoration: 'none',
                        }}>← Back to Social Hub</Link>
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
                }}>
                    {activeConversation ? (
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
                                        onClick={() => setShowSidebar(true)}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            fontSize: 20, padding: 4,
                                        }}
                                    >←</button>
                                )}

                                <Link href={`/hub/user/${otherUser?.username}`}>
                                    <Avatar src={otherUser?.avatar_url} name={otherUser?.username} size={40} online />
                                </Link>

                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>{otherUser?.username}</div>
                                    <div style={{ fontSize: 12, color: C.textSec }}>Active now</div>
                                </div>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18,
                                        color: C.blue,
                                    }}>📞</button>
                                    <button style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18,
                                        color: C.blue,
                                    }}>📹</button>
                                    <button style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18,
                                        color: C.blue,
                                    }}>ℹ️</button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '16px 0',
                            }}>
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
                                ) : (
                                    messages.map((msg, i) => {
                                        const isOwn = msg.sender_id === user.id;
                                        const prevMsg = messages[i - 1];
                                        const nextMsg = messages[i + 1];
                                        const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                                        const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;

                                        return (
                                            <MessageBubble
                                                key={msg.id}
                                                message={msg}
                                                isOwn={isOwn}
                                                showAvatar={showAvatar}
                                                sender={msg.profiles}
                                                showTime={isLastInGroup}
                                                isLastInGroup={isLastInGroup}
                                            />
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Input */}
                            <MessageInput onSend={handleSendMessage} />
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
                            <div style={{ fontSize: 80, marginBottom: 16 }}>💬</div>
                            <h2 style={{ margin: 0, color: C.text, fontWeight: 600 }}>Select a conversation</h2>
                            <p style={{ marginTop: 8, color: C.textSec }}>Choose from your existing chats or search for someone new</p>
                        </div>
                    )}
                </main>
            </div>
        </>
    );
}
