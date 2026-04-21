import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { haptic } from '../../lib/club-arena/haptic';
import { Z_INDEX } from '../../lib/zIndexAuthority';
import { eventBus } from '../../engine/EventBus';

export default function TableChatHUD({ tableId, userId, isMuted = false }) {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isOpen, setIsOpen] = useState(false); // Mobile toggle
    const [unreadCount, setUnreadCount] = useState(0);
    const [mutedPlayers, setMutedPlayers] = useState([]);
    const chatRef = useRef(null);
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    // Load muted players from localStorage and listen for updates
    useEffect(() => {
        const loadMutes = () => {
            try {
                const mutedStr = localStorage.getItem('ca_muted_players');
                setMutedPlayers(mutedStr ? JSON.parse(mutedStr) : []);
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        };
        loadMutes();
        window.addEventListener('ca_mute_updated', loadMutes);
        return () => window.removeEventListener('ca_mute_updated', loadMutes);
    }, []);

    // Load recent messages
    useEffect(() => {
        if (!tableId) return;

        const loadMessages = async () => {
            const { data } = await supabase
                .from('table_chat')
                .select('*')
                .eq('table_id', tableId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data) setMessages(data.reverse());
        };

        loadMessages();

        // Subscribe to real-time chat
        const channel = supabase
            .channel(`table_chat:${tableId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'table_chat',
                filter: `table_id=eq.${tableId}`
            }, (payload) => {
                const msg = payload.new;
                setMessages(prev => [...prev.slice(-49), msg]);

                // Phase 7: Broadcast to EventBus so Multi-Table tab badges react
                try { eventBus.emit('chat_message_received', { tableId: msg.table_id || tableId }); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

                // Trigger haptic and show unread if closed
                if (!isOpen) {
                    setUnreadCount(c => c + 1);
                    if (msg.message_type === 'dealer' || msg.message_type === 'system') {
                        haptic('notification');
                    } else {
                        haptic('tap');
                    }
                }

                // Auto-scroll to bottom
                setTimeout(() => {
                    if (chatRef.current) {
                        chatRef.current.scrollTop = chatRef.current.scrollHeight;
                    }
                }, 50);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [tableId, isOpen]);

    // Scroll to bottom when opening
    useEffect(() => {
        if (isOpen && chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
            setUnreadCount(0);
        }
    }, [isOpen]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || isMuted || !userId) return;

        const text = newMessage.trim();
        setNewMessage(''); // Optimistic clear

        // Optimistic insert
        const optMsg = {
            id: `temp-${Date.now()}`,
            table_id: tableId,
            sender_id: userId,
            sender_name: 'You', // Gets replaced by DB trigger
            message: text,
            message_type: 'player',
            created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev.slice(-49), optMsg]);
        haptic('tap');

        // Route through hardened API (sanitization + rate limiting + mute enforcement)
        const token = (typeof localStorage !== 'undefined' && (() => {
            try { const a = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}'); return a?.access_token; } catch { return null; }
        })()) || null;

        const resp = await fetch('/api/club-arena/table-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ action: 'send', tableId, message: text }),
        });

        if (!resp.ok) {
            console.error('Failed to send message:', resp.status);
            // Revert optimistic insert on failure
            setMessages(prev => prev.filter(m => m.id !== optMsg.id));
        }
    };

    // Responsive positioning:
    // On Desktop: Pinned to bottom-left of the table view.
    // On Mobile: A floating chat bubble that opens a modal-like HUD.

    if (isMobile && !isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={styles.chatBubbleTrigger}
            >
                💬
                {unreadCount > 0 && <span style={styles.unreadBadge}>{unreadCount}</span>}
            </button>
        );
    }

    return (
        <div style={{ ...styles.container, ...(isMobile ? styles.mobileContainerFull : styles.desktopContainer) }}>
            {/* Header */}
            <div style={styles.header}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E4E6EB' }}>Table Chat</span>
                {isMobile && (
                    <button onClick={() => setIsOpen(false)} style={styles.closeBtn}>×</button>
                )}
            </div>

            {/* Message History */}
            <div style={styles.messageList} ref={chatRef}>
                {messages.length === 0 && (
                    <div style={styles.emptyState}>No messages yet. Say hi!</div>
                )}

                {messages.filter(msg => !mutedPlayers.includes(msg.sender_id)).map((msg) => {
                    const isDealer = msg.message_type === 'dealer' || msg.message_type === 'system';
                    const isMe = msg.sender_id === userId;

                    return (
                        <div key={msg.id} style={{
                            ...styles.messageRow,
                            justifyContent: isDealer ? 'center' : (isMe ? 'flex-end' : 'flex-start')
                        }}>
                            {isDealer ? (
                                <div style={styles.dealerPill}>
                                    <span style={{ color: '#F1C40F', marginRight: 4 }}>♠️</span>
                                    {msg.message}
                                </div>
                            ) : (
                                <div style={{
                                    ...styles.playerBubble,
                                    background: isMe ? '#2374E1' : 'rgba(255,255,255,0.1)',
                                    color: '#FFF',
                                    borderBottomRightRadius: isMe ? 2 : 12,
                                    borderBottomLeftRadius: isMe ? 12 : 2
                                }}>
                                    {!isMe && (
                                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
                                            {msg.sender_name || 'Player'}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 12, lineHeight: 1.4, wordBreak: 'break-word' }}>
                                        {msg.message}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Input Area */}
            {isMuted ? (
                <div style={styles.mutedBar}>You are muted from table chat.</div>
            ) : (
                <form onSubmit={handleSendMessage} style={styles.inputArea}>
                    {/* Quick Chat Phrases */}
                    <div style={{ display: 'flex', gap: 3, marginBottom: 4, flexWrap: 'wrap' }}>
                        {['nh', 'ty', 'gg', 'lol', 'wp', 'gl'].map(phrase => (
                            <button
                                key={phrase}
                                type="button"
                                onClick={() => {
                                    // Auto-send quick phrase
                                    setNewMessage('');
                                    // Send via API directly
                                    const token = (typeof localStorage !== 'undefined' && (() => {
                                        try { const a = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}'); return a?.access_token; } catch { return null; }
                                    })()) || null;
                                    fetch('/api/club-arena/table-chat', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                        body: JSON.stringify({ action: 'send', tableId, message: phrase }),
                                    }).catch(() => {});
                                    // Optimistic insert
                                    setMessages(prev => [...prev.slice(-49), {
                                        id: `temp-${Date.now()}`, table_id: tableId, sender_id: userId,
                                        sender_name: 'You', message: phrase, message_type: 'player',
                                        created_at: new Date().toISOString()
                                    }]);
                                    haptic('tap');
                                }}
                                style={{
                                    background: 'rgba(255,255,255,0.08)', color: '#B0B3B8', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                {phrase}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Say something..."
                        style={styles.chatInput}
                        maxLength={120}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        style={{ ...styles.sendBtn, opacity: newMessage.trim() ? 1 : 0.5 }}
                    >
                        ➤
                    </button>
                    </div>
                </form>
            )}
        </div>
    );
}

const styles = {
    // Layout
    container: {
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: Z_INDEX.FLOATING_CHAT || 900,
        overflow: 'hidden'
    },
    desktopContainer: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        width: 300,
        height: 400,
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    },
    mobileContainerFull: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.9)',
        zIndex: 9999, // Over everything on mobile
    },
    chatBubbleTrigger: {
        position: 'absolute',
        bottom: 80, // Above bottom nav
        right: 20,
        width: 48,
        height: 48,
        borderRadius: 24,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        color: '#FFF',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        zIndex: Z_INDEX.FLOATING_CHAT || 900,
    },
    unreadBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        background: '#E74C3C',
        color: '#FFF',
        fontSize: 10,
        fontWeight: 800,
        width: 20,
        height: 20,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #000'
    },

    // Header
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.4)',
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        color: '#E4E6EB',
        fontSize: 24,
        lineHeight: 1,
        padding: 0,
        cursor: 'pointer'
    },

    // Message Area
    messageList: {
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },
    emptyState: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 'auto',
        marginBottom: 'auto'
    },
    messageRow: {
        display: 'flex',
        width: '100%',
    },
    playerBubble: {
        maxWidth: '80%',
        padding: '8px 12px',
        borderRadius: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
    },
    dealerPill: {
        background: 'rgba(241, 196, 15, 0.15)',
        border: '1px solid rgba(241, 196, 15, 0.3)',
        color: '#F1C40F',
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 12px',
        borderRadius: 12,
        maxWidth: '90%',
        textAlign: 'center'
    },

    // Input
    inputArea: {
        display: 'flex',
        alignItems: 'center',
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        gap: '8px'
    },
    chatInput: {
        flex: 1,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: '8px 16px',
        color: '#FFF',
        fontSize: 13,
        outline: 'none',
    },
    sendBtn: {
        background: '#2374E1',
        border: 'none',
        color: '#FFF',
        width: 32,
        height: 32,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'opacity 0.2s'
    },
    mutedBar: {
        padding: '12px',
        textAlign: 'center',
        color: '#E74C3C',
        fontSize: 11,
        fontWeight: 600,
        background: 'rgba(231, 76, 60, 0.1)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
    }
};
