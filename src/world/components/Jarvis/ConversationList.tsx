/* ═══════════════════════════════════════════════════════════════════════════
   CONVERSATION LIST — Shows user's Jarvis conversation history
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface Conversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}

interface ConversationListProps {
    onSelectConversation: (id: string) => void;
    onClose: () => void;
}

export function ConversationList({ onSelectConversation, onClose }: ConversationListProps) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadConversations();
    }, []);

    const getAuthToken = () => {
        const authData = localStorage.getItem('smarter-poker-auth');
        if (!authData) return null;
        const parsed = JSON.parse(authData);
        return parsed.access_token;
    };

    const loadConversations = async () => {
        try {
            const token = getAuthToken();
            if (!token) return;

            const response = await fetch('/api/jarvis/conversations?limit=20', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setConversations(data.conversations);
            }
        } catch (error) {
            console.error('[Jarvis] Failed to load conversations:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div style={{
            position: 'absolute',
            top: '60px',
            left: '20px',
            right: '20px',
            background: 'rgba(30, 15, 50, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            zIndex: 10,
            maxHeight: '300px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <span style={{
                    color: '#FFD700',
                    fontSize: '13px',
                    fontWeight: 600
                }}>
                    📜 Previous Conversations
                </span>
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)',
                        cursor: 'pointer',
                        fontSize: '16px'
                    }}
                >
                    ×
                </button>
            </div>

            {/* List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px'
            }}>
                {loading ? (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: 'rgba(255, 215, 0, 0.5)'
                    }}>
                        Loading...
                    </div>
                ) : conversations.length === 0 ? (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: 'rgba(255, 215, 0, 0.5)',
                        fontSize: '13px'
                    }}>
                        No previous conversations yet
                    </div>
                ) : (
                    conversations.map((conv) => (
                        <button
                            key={conv.id}
                            onClick={() => onSelectConversation(conv.id)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'rgba(255, 215, 0, 0.05)',
                                border: '1px solid rgba(255, 215, 0, 0.1)',
                                borderRadius: '8px',
                                marginBottom: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: '#fff',
                                textAlign: 'left',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 215, 0, 0.15)';
                                e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 215, 0, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.1)';
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    color: '#FFD700',
                                    marginBottom: '2px'
                                }}>
                                    {conv.title || 'Poker Conversation'}
                                </div>
                                <div style={{
                                    fontSize: '11px',
                                    color: 'rgba(255, 255, 255, 0.5)'
                                }}>
                                    {conv.messageCount} messages • {formatDate(conv.updatedAt)}
                                </div>
                            </div>
                            <span style={{
                                color: 'rgba(255, 215, 0, 0.4)',
                                fontSize: '16px'
                            }}>
                                →
                            </span>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
