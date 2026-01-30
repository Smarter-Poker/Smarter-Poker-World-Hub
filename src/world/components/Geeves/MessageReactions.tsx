/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGE REACTIONS — Thumbs up/down for Jarvis responses
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface MessageReactionsProps {
    messageId: string;
    initialReaction?: 'helpful' | 'unhelpful' | null;
    onReact?: (reaction: 'helpful' | 'unhelpful') => void;
}

export function MessageReactions({ messageId, initialReaction, onReact }: MessageReactionsProps) {
    const [reaction, setReaction] = useState<'helpful' | 'unhelpful' | null>(initialReaction || null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleReaction = async (newReaction: 'helpful' | 'unhelpful') => {
        if (isSubmitting) return;

        // Toggle off if clicking same reaction
        const finalReaction = reaction === newReaction ? null : newReaction;

        setReaction(finalReaction);
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('smarter-poker-auth');
            const authData = token ? JSON.parse(token) : null;

            if (!authData?.access_token) {
                console.error('No auth token available');
                return;
            }

            const response = await fetch('/api/live-help/react', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authData.access_token}`
                },
                body: JSON.stringify({
                    messageId,
                    reaction: finalReaction
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save reaction');
            }

            onReact?.(finalReaction as any);
        } catch (error) {
            console.error('Failed to save reaction:', error);
            // Revert on error
            setReaction(initialReaction || null);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '8px',
            opacity: isSubmitting ? 0.5 : 1,
            transition: 'opacity 0.2s ease'
        }}>
            <button
                onClick={() => handleReaction('helpful')}
                disabled={isSubmitting}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: reaction === 'helpful'
                        ? 'rgba(0, 212, 255, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                    border: reaction === 'helpful'
                        ? '1px solid rgba(0, 212, 255, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: reaction === 'helpful' ? '#00d4ff' : 'rgba(255, 255, 255, 0.6)',
                    fontSize: '12px',
                    cursor: isSubmitting ? 'default' : 'pointer',
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                    if (!isSubmitting && reaction !== 'helpful') {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (reaction !== 'helpful') {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }
                }}
            >
                <span style={{ fontSize: '14px' }}>👍</span>
                <span>Helpful</span>
            </button>

            <button
                onClick={() => handleReaction('unhelpful')}
                disabled={isSubmitting}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: reaction === 'unhelpful'
                        ? 'rgba(255, 100, 100, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                    border: reaction === 'unhelpful'
                        ? '1px solid rgba(255, 100, 100, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    color: reaction === 'unhelpful' ? '#ff6464' : 'rgba(255, 255, 255, 0.6)',
                    fontSize: '12px',
                    cursor: isSubmitting ? 'default' : 'pointer',
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                    if (!isSubmitting && reaction !== 'unhelpful') {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.3)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (reaction !== 'unhelpful') {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }
                }}
            >
                <span style={{ fontSize: '14px' }}>👎</span>
                <span>Not Helpful</span>
            </button>
        </div>
    );
}
