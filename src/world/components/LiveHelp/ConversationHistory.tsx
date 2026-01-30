/* ═══════════════════════════════════════════════════════════════════════════
   CONVERSATION HISTORY — Recent conversations dropdown
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface Conversation {
    id: string;
    first_message: string;
    updated_at: string;
}

interface ConversationHistoryProps {
    onSelect: (conversationId: string) => void;
    onNewConversation: () => void;
}

export function ConversationHistory({ onSelect, onNewConversation }: ConversationHistoryProps) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const loadConversations = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('smarter-poker-auth');
            const authData = token ? JSON.parse(token) : null;

            if (!authData?.access_token) return;

            const response = await fetch('/api/live-help/conversations', {
                headers: {
                    'Authorization': `Bearer ${authData.access_token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setConversations(data.conversations || []);
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadConversations();
        }
    }, [isOpen]);

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                </svg>
                History
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    width: '280px',
                    maxHeight: '400px',
                    background: 'rgba(0, 20, 40, 0.98)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                    zIndex: 100
                }}>
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                            Recent Conversations
                        </span>
                        <button
                            onClick={() => setIsOpen(false)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#fff',
                                fontSize: '18px',
                                cursor: 'pointer',
                                padding: 0,
                                width: '20px',
                                height: '20px'
                            }}
                        >
                            ×
                        </button>
                    </div>

                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {isLoading ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                                Loading...
                            </div>
                        ) : conversations.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                                No previous conversations
                            </div>
                        ) : (
                            conversations.map(conv => (
                                <div
                                    key={conv.id}
                                    onClick={() => {
                                        onSelect(conv.id);
                                        setIsOpen(false);
                                    }}
                                    style={{
                                        padding: '12px 16px',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{
                                        fontSize: '13px',
                                        color: '#fff',
                                        marginBottom: '4px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {conv.first_message}
                                    </div>
                                    <div style={{
                                        fontSize: '11px',
                                        color: 'rgba(255, 255, 255, 0.4)'
                                    }}>
                                        {new Date(conv.updated_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div style={{
                        padding: '12px 16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        <button
                            onClick={() => {
                                onNewConversation();
                                setIsOpen(false);
                            }}
                            style={{
                                width: '100%',
                                padding: '8px',
                                background: 'linear-gradient(135deg, #00d4ff, #0088ff)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            + New Conversation
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
