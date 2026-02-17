/* ═══════════════════════════════════════════════════════════════════════════
   DYNAMIC QUICK ACTIONS — Page-based conversation starters
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useRouter } from 'next/router';

interface DynamicQuickActionsProps {
    onActionClick?: (actionId: string, message?: string) => void;
}

export function DynamicQuickActions({ onActionClick }: DynamicQuickActionsProps) {
    const router = useRouter();
    const currentPath = router.pathname;

    // Detect current page and return relevant actions
    const getPageActions = () => {
        // Training page
        if (currentPath.includes('/training')) {
            return [
                { id: 'training-help', label: 'How Do I Play This Game?', icon: '🎯', message: 'How Do I Play This Training Game?' },
                { id: 'training-progress', label: 'View My Progress', icon: '📊', message: 'Show Me My Training Progress' },
                { id: 'training-difficulty', label: 'Change Difficulty', icon: '⚡', message: 'How Do I Change Game Difficulty?' },
                { id: 'training-rewards', label: 'Training Rewards', icon: '💎', message: 'What Rewards Do I Get From Training?' },
            ];
        }

        // Diamond Store page
        if (currentPath.includes('/diamond-store')) {
            return [
                { id: 'store-bundles', label: 'Best Bundle?', icon: '💰', message: 'What Is The Best Diamond Bundle?' },
                { id: 'store-checkout', label: 'How To Checkout', icon: '🛒', message: 'How Do I Complete Checkout?' },
                { id: 'store-vip', label: 'VIP Benefits', icon: '👑', message: 'What Are VIP Membership Benefits?' },
                { id: 'store-orders', label: 'My Orders', icon: '📦', message: 'Where Can I See My Order History?' },
            ];
        }

        // Social Media page
        if (currentPath.includes('/social-media')) {
            return [
                { id: 'social-post', label: 'How To Post', icon: '📝', message: 'How Do I Create A Post?' },
                { id: 'social-friends', label: 'Add Friends', icon: '👥', message: 'How Do I Add Friends?' },
                { id: 'social-privacy', label: 'Privacy Settings', icon: '🔒', message: 'How Do I Change Privacy Settings?' },
                { id: 'social-reels', label: 'Upload Reels', icon: '🎬', message: 'How Do I Upload Video Reels?' },
            ];
        }

        // Settings page
        if (currentPath.includes('/settings')) {
            return [
                { id: 'settings-profile', label: 'Edit Profile', icon: '👤', message: 'How Do I Edit My Profile?' },
                { id: 'settings-avatar', label: 'Change Avatar', icon: '🎨', message: 'How Do I Change My Avatar?' },
                { id: 'settings-notifications', label: 'Notifications', icon: '🔔', message: 'How Do I Manage Notifications?' },
                { id: 'settings-account', label: 'Account Security', icon: '🔐', message: 'How Do I Secure My Account?' },
            ];
        }

        // Default actions for Hub
        return [
            { id: 'go-to-training', label: 'Go To Training', icon: '🎯', navigate: '/hub/training' },
            { id: 'go-to-diamond-store', label: 'Diamond Store', icon: '💎', navigate: '/hub/diamond-store' },
            { id: 'go-to-club-arena', label: 'Club Arena', icon: '♠️', navigate: 'https://club.smarter.poker' },
            { id: 'go-to-social', label: 'Social Hub', icon: '👥', navigate: '/hub/social-media' },
        ];
    };

    const actions = getPageActions();

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
                        onClick={() => {
                            if ('navigate' in action && action.navigate) {
                                if (action.navigate.startsWith('http')) {
                                    window.location.href = action.navigate;
                                } else {
                                    router.push(action.navigate);
                                }
                            }
                            if ('message' in action && action.message) {
                                onActionClick?.(action.id, action.message);
                            }
                        }}
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
