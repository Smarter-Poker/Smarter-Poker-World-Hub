/**
 * 💬 SMARTER.POKER MESSENGER V2.0
 * Full-featured Facebook Messenger clone with premium design
 * Real-time chat, read receipts, typing indicators, and poker-themed UI
 * Enhanced with: optimistic updates, message reactions, sound notifications
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '../../src/lib/supabase';
import { BrainHomeButton } from '../../src/components/navigation/WorldNavHeader';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// God-Mode Stack
import { useMessengerStore } from '../../src/stores/messengerStore';

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

function MessageInput({ onSend, onTyping, disabled }) {
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

    const handleChange = (e) => {
        setText(e.target.value);
        // Broadcast typing indicator
        if (onTyping && e.target.value.length > 0) {
            onTyping();
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
// 🔔 TOAST NOTIFICATION COMPONENT
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
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.type === 'error' ? C.red : C.green,
            color: 'white',
            padding: '12px 24px',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
        }}>
            <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
            <span>{toast.message}</span>
            <button
                onClick={onDismiss}
                style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', marginLeft: 8 }}
            >✕</button>
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
// 💬 MESSAGE BUBBLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════


function MessageBubble({ message, isOwn, showAvatar, sender, showTime, isLastInGroup, onRetry, onReact, onDelete, currentUserId }) {
    const [showReactions, setShowReactions] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [reactions, setReactions] = useState(message.reactions || []);
    const status = message.status || 'sent';

    const StatusIcon = () => {
        if (!isOwn) return null;
        if (status === 'sending') return <span style={{ opacity: 0.7, fontSize: 10 }}>○</span>;
        if (status === 'failed') return (
            <span
                onClick={() => onRetry?.(message)}
                style={{ color: '#E41E3F', fontSize: 10, cursor: 'pointer' }}
                title="Failed - tap to retry"
            >⚠</span>
        );
        if (status === 'read' || message.is_read) {
            return <span style={{ color: '#0084FF', fontSize: 10 }} title="Read">✓✓</span>;
        }
        // Delivered/sent
        return <span style={{ color: '#31A24C', fontSize: 10 }} title="Delivered">✓</span>;
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

        // Call parent handler for DB persistence
        if (onReact) {
            await onReact(message.id, emoji);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Delete this message?')) return;
        setShowMenu(false);
        if (onDelete) {
            await onDelete(message.id);
        }
    };

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
            onMouseEnter={() => setShowReactions(true)}
            onMouseLeave={() => { setShowReactions(false); setShowMenu(false); }}
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
                {/* Reaction picker */}
                {showReactions && status !== 'sending' && (
                    <div style={{
                        position: 'absolute',
                        [isOwn ? 'left' : 'right']: '100%',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        marginLeft: isOwn ? 0 : 4,
                        marginRight: isOwn ? 4 : 0,
                        display: 'flex',
                        gap: 2,
                        background: C.card,
                        borderRadius: 16,
                        padding: '4px 6px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 10,
                    }}>
                        {['❤️', '👍', '😂', '😮', '😢'].map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleReaction(emoji)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                    padding: 4,
                                    borderRadius: 4,
                                    transition: 'background 0.2s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >{emoji}</button>
                        ))}
                        {isOwn && (
                            <>
                                <div style={{ width: 1, background: C.border, margin: '4px 2px' }} />
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        padding: 4,
                                        color: C.textSec,
                                    }}
                                >⋯</button>
                            </>
                        )}
                    </div>
                )}

                {/* Context menu for own messages */}
                {showMenu && isOwn && (
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
                        minWidth: 120,
                    }}>
                        <button
                            onClick={handleDelete}
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
                        >🗑️ Delete</button>
                    </div>
                )}

                <div style={{
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
    // Zustand Global State (replaces UI-related useState)
    const selectedConversation = useMessengerStore((s) => s.selectedConversation);
    const setSelectedConversation = useMessengerStore((s) => s.setSelectedConversation);
    const showNewChat = useMessengerStore((s) => s.showNewChat);
    const setShowNewChat = useMessengerStore((s) => s.setShowNewChat);
    const showSearch = useMessengerStore((s) => s.showSearch);
    const setShowSearch = useMessengerStore((s) => s.setShowSearch);

    // Local state (keep for data/session)
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

    const messagesEndRef = useRef(null);
    const searchTimeout = useRef(null);
    const searchInputRef = useRef(null);
    const typingTimeout = useRef(null);
    const messageSearchTimeout = useRef(null);

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

                    // Load friends for quick access
                    const { data: friendships } = await supabase
                        .from('friendships')
                        .select('friend_id, friend:profiles!friendships_friend_id_fkey(id, username, full_name, avatar_url)')
                        .eq('user_id', authUser.id)
                        .eq('status', 'accepted');

                    if (friendships) {
                        setFriends(friendships.map(f => f.friend).filter(Boolean));
                    }
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
            }, async (payload) => {
                const newMsg = payload.new;
                // Skip if this is our own message (already added via optimistic update)
                if (newMsg.sender_id === user.id) return;

                // Play sound for incoming message
                playMessageSound();

                // Fetch sender profile for enrichment
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .eq('id', newMsg.sender_id)
                    .single();

                setMessages(prev => {
                    // Check for duplicates
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, { ...newMsg, profiles: profile }];
                });

                // Update conversation preview
                setConversations(prev => prev.map(c =>
                    c.id === activeConversation.id
                        ? { ...c, last_message_preview: newMsg.content, last_message_at: newMsg.created_at }
                        : c
                ));
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [user, activeConversation]);

    // Typing indicator broadcast
    useEffect(() => {
        if (!user || !activeConversation) return;

        const typingChannel = supabase
            .channel(`typing:${activeConversation.id}`)
            .on('broadcast', { event: 'typing' }, (payload) => {
                // Someone else is typing
                if (payload.payload.userId !== user.id) {
                    setOtherTyping(true);
                    // Clear after 3 seconds
                    setTimeout(() => setOtherTyping(false), 3000);
                }
            })
            .subscribe();

        return () => supabase.removeChannel(typingChannel);
    }, [user, activeConversation]);

    // Broadcast our typing state
    const broadcastTyping = () => {
        if (!user || !activeConversation) return;
        supabase.channel(`typing:${activeConversation.id}`).send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: user.id, username: user.username },
        });
    };

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

        // Optimistic update - show message immediately
        const tempId = `temp-${Date.now()}`;
        const optimisticMsg = {
            id: tempId,
            content: content.trim(),
            created_at: new Date().toISOString(),
            sender_id: user.id,
            profiles: { id: user.id, username: user.username, avatar_url: user.avatar_url },
            status: 'sending',
        };
        setMessages(prev => [...prev, optimisticMsg]);
        setConversations(prev => prev.map(c =>
            c.id === activeConversation.id
                ? { ...c, last_message_preview: content, last_message_at: new Date().toISOString() }
                : c
        ));

        try {
            const { data, error } = await supabase.rpc('fn_send_message', {
                p_conversation_id: activeConversation.id,
                p_sender_id: user.id,
                p_content: content,
            });

            if (error) throw error;

            // Replace optimistic message with real one
            setMessages(prev => prev.map(m =>
                m.id === tempId
                    ? { ...m, id: data, status: 'sent' }
                    : m
            ));
        } catch (e) {
            console.error('Send message error:', e);
            // Mark message as failed
            setMessages(prev => prev.map(m =>
                m.id === tempId ? { ...m, status: 'failed' } : m
            ));
            setToast({ type: 'error', message: 'Failed to send message. Tap to retry.' });
        }
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

    // Handle message deletion
    const handleDeleteMessage = async (messageId) => {
        if (!user) return;
        try {
            const { data: success, error } = await supabase.rpc('fn_delete_message', {
                p_message_id: messageId,
                p_user_id: user.id,
            });

            if (error) throw error;

            if (success) {
                // Update UI to show deleted message
                setMessages(prev => prev.map(m =>
                    m.id === messageId
                        ? { ...m, content: '[Message deleted]', is_deleted: true }
                        : m
                ));
                setToast({ type: 'success', message: 'Message deleted' });
            } else {
                setToast({ type: 'error', message: 'Could not delete message' });
            }
        } catch (e) {
            console.error('Delete message error:', e);
            setToast({ type: 'error', message: 'Failed to delete message' });
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

    // Update user presence on mount/unmount
    useEffect(() => {
        if (!user) return;

        // Set online on mount
        const updatePresence = async (isOnline) => {
            try {
                await supabase.rpc('fn_update_presence', {
                    p_user_id: user.id,
                    p_is_online: isOnline,
                });
            } catch (e) {
                console.error('Presence update error:', e);
            }
        };

        updatePresence(true);

        // Set offline on unmount or page close
        const handleUnload = () => updatePresence(false);
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            window.removeEventListener('beforeunload', handleUnload);
            updatePresence(false);
        };
    }, [user]);

    // Calculate total unread count
    useEffect(() => {
        const total = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        setTotalUnreadCount(total);
    }, [conversations]);
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
            <Head>
                <title>Messenger | Smarter.Poker</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .messenger-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .messenger-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .messenger-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .messenger-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .messenger-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .messenger-page { zoom: 1.5; } }
                    @keyframes bounce {
                        0%, 60%, 100% { transform: translateY(0); }
                        30% { transform: translateY(-4px); }
                    }
                `}</style>
            </Head>

            {/* Toast Notifications */}
            <Toast toast={toast} onDismiss={() => setToast(null)} />

            <div className="messenger-page" style={{
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
                    {/* Header - Facebook Messenger Style */}
                    <div style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Back Button */}
                            <Link href="/hub/social-media" style={{ textDecoration: 'none' }}>
                                <button style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: C.bg, border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 18, color: C.text,
                                }}>←</button>
                            </Link>
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.blue }}>messenger</h1>
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

                    {/* Stories / Active Friends Row - Facebook Style */}
                    {friends.length > 0 && (
                        <div style={{
                            padding: '12px 0 8px',
                            borderBottom: `1px solid ${C.border}`,
                        }}>
                            <div style={{
                                display: 'flex',
                                overflowX: 'auto',
                                gap: 16,
                                padding: '0 16px',
                                scrollbarWidth: 'none',
                            }}>
                                {/* Create Story */}
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer',
                                    minWidth: 60,
                                }}>
                                    <div style={{
                                        width: 56, height: 56, borderRadius: '50%',
                                        border: `2px dashed ${C.textSec}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 24, color: C.textSec,
                                    }}>+</div>
                                    <span style={{ fontSize: 11, color: C.textSec, whiteSpace: 'nowrap' }}>Your story</span>
                                </div>

                                {/* Friends avatars */}
                                {friends.slice(0, 10).map(friend => (
                                    <div
                                        key={friend.id}
                                        onClick={() => handleStartConversation(friend)}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 4,
                                            cursor: 'pointer',
                                            minWidth: 60,
                                        }}
                                    >
                                        <div style={{ position: 'relative' }}>
                                            <div style={{
                                                width: 56, height: 56, borderRadius: '50%',
                                                border: `3px solid ${C.blue}`,
                                                padding: 2,
                                            }}>
                                                <Avatar src={friend.avatar_url} name={friend.full_name || friend.username} size={48} showOnline={false} />
                                            </div>
                                            {/* Online dot */}
                                            <div style={{
                                                position: 'absolute', bottom: 2, right: 2,
                                                width: 14, height: 14, borderRadius: '50%',
                                                background: C.green, border: '2px solid white',
                                            }} />
                                        </div>
                                        <span style={{
                                            fontSize: 11, color: C.text,
                                            whiteSpace: 'nowrap',
                                            maxWidth: 60,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>{(friend.full_name || friend.username || '').split(' ')[0]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Conversations or Friends List */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {/* Show friends as conversation rows when no conversations exist */}
                        {conversations.length === 0 && friends.length > 0 ? (
                            friends.map(friend => (
                                <div
                                    key={friend.id}
                                    onClick={() => handleStartConversation(friend)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '12px 16px',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = C.hoverBg}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ position: 'relative' }}>
                                        <Avatar src={friend.avatar_url} name={friend.full_name || friend.username} size={56} showOnline={false} />
                                        {/* Online indicator */}
                                        <div style={{
                                            position: 'absolute', bottom: 2, right: 2,
                                            width: 14, height: 14, borderRadius: '50%',
                                            background: C.green, border: '2px solid white',
                                        }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 15, color: C.text, marginBottom: 2 }}>
                                            {friend.full_name || friend.username}
                                        </div>
                                        <div style={{
                                            fontSize: 13,
                                            color: C.textSec,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}>
                                            Tap to start chatting · Active now
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : conversations.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                                <div style={{ color: C.text, fontWeight: 500, marginBottom: 4 }}>No conversations yet</div>
                                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>Add friends to start messaging!</div>
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
                                    }}>Search for people</button>
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
                        }}>Back to Social Hub</Link>
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
                                        <button
                                            onClick={() => setShowMessageSearch(!showMessageSearch)}
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: showMessageSearch ? C.bg : 'transparent',
                                                border: 'none', cursor: 'pointer', fontSize: 18,
                                                color: C.blue,
                                            }}
                                            title="Search messages"
                                        >🔍</button>
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
                                                <span style={{ color: C.textSec, marginRight: 8 }}>🔍</span>
                                                <input
                                                    type="text"
                                                    value={messageSearchQuery}
                                                    onChange={e => {
                                                        setMessageSearchQuery(e.target.value);
                                                        handleMessageSearch(e.target.value);
                                                    }}
                                                    placeholder="Search in this conversation..."
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
                                                    >✕</button>
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
                                                    onReact={handleReaction}
                                                    onDelete={handleDeleteMessage}
                                                    currentUserId={user.id}
                                                />
                                            );
                                        })
                                    )}
                                    {/* Typing indicator */}
                                    {otherTyping && <TypingIndicator name={otherUser?.username} />}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Message Input */}
                                <MessageInput onSend={handleSendMessage} onTyping={broadcastTyping} />
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
                </main >
            </div >
        </>
    );
}
