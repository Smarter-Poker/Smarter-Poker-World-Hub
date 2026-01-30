/* ═══════════════════════════════════════════════════════════════════════════
   QUICK ACTIONS — Common action buttons for Jarvis Live Help
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useRouter } from 'next/router';

interface QuickAction {
    id: string;
    label: string;
    icon: string;
    action: () => void;
    category: 'navigation' | 'support' | 'feature';
}

interface QuickActionsProps {
    onActionClick?: (actionId: string) => void;
}

export function QuickActions({ onActionClick }: QuickActionsProps) {
    const router = useRouter();

    const actions: QuickAction[] = [
        {
            id: 'go-to-training',
            label: 'Go to Training',
            icon: '🎯',
            category: 'navigation',
            action: () => {
                router.push('/hub/training');
                onActionClick?.('go-to-training');
            }
        },
        {
            id: 'go-to-diamond-store',
            label: 'Diamond Store',
            icon: '💎',
            category: 'navigation',
            action: () => {
                router.push('/hub/diamond-store');
                onActionClick?.('go-to-diamond-store');
            }
        },
        {
            id: 'go-to-club-arena',
            label: 'Club Arena',
            icon: '♠️',
            category: 'navigation',
            action: () => {
                window.location.href = 'https://club.smarter.poker';
                onActionClick?.('go-to-club-arena');
            }
        },
        {
            id: 'go-to-social',
            label: 'Social Hub',
            icon: '👥',
            category: 'navigation',
            action: () => {
                router.push('/hub/social-media');
                onActionClick?.('go-to-social');
            }
        },
        {
            id: 'how-to-create-club',
            label: 'How to Create Club',
            icon: '🏛️',
            category: 'feature',
            action: () => {
                onActionClick?.('how-to-create-club');
            }
        },
        {
            id: 'how-to-buy-diamonds',
            label: 'How to Buy Diamonds',
            icon: '💰',
            category: 'feature',
            action: () => {
                onActionClick?.('how-to-buy-diamonds');
            }
        },
        {
            id: 'contact-support',
            label: 'Contact Support',
            icon: '📧',
            category: 'support',
            action: () => {
                window.location.href = 'mailto:support@smarter.poker';
                onActionClick?.('contact-support');
            }
        },
        {
            id: 'view-settings',
            label: 'Settings',
            icon: '⚙️',
            category: 'navigation',
            action: () => {
                router.push('/hub/settings');
                onActionClick?.('view-settings');
            }
        }
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px 0',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            marginTop: '12px'
        }}>
            <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '4px'
            }}>
                Quick Actions
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px'
            }}>
                {actions.map(action => (
                    <button
                        key={action.id}
                        onClick={action.action}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                    >
                        <span style={{ fontSize: '14px' }}>{action.icon}</span>
                        <span style={{ flex: 1, textAlign: 'left' }}>{action.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * Get suggested message for quick action
 */
export function getQuickActionMessage(actionId: string): string {
    const messages: Record<string, string> = {
        'how-to-create-club': 'How do I create a poker club in Club Arena?',
        'how-to-buy-diamonds': 'How do I buy diamonds from the Diamond Store?',
    };

    return messages[actionId] || '';
}
