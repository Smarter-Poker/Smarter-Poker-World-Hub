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
                { id: 'training-help', label: 'How do I play this game?', icon: '🎯', message: 'How do I play this training game?' },
                { id: 'training-progress', label: 'View My Progress', icon: '📊', message: 'Show me my training progress' },
                { id: 'training-difficulty', label: 'Change Difficulty', icon: '⚡', message: 'How do I change game difficulty?' },
                { id: 'training-rewards', label: 'Training Rewards', icon: '💎', message: 'What rewards do I get from training?' },
            ];
        }

        // Diamond Store page
        if (currentPath.includes('/diamond-store')) {
            return [
                { id: 'store-bundles', label: 'Best Bundle?', icon: '💰', message: 'What is the best diamond bundle?' },
                { id: 'store-checkout', label: 'How to Checkout', icon: '🛒', message: 'How do I complete checkout?' },
                { id: 'store-vip', label: 'VIP Benefits', icon: '👑', message: 'What are VIP membership benefits?' },
                { id: 'store-orders', label: 'My Orders', icon: '📦', message: 'Where can I see my order history?' },
            ];
        }

        // Social Media page
        if (currentPath.includes('/social-media')) {
            return [
                { id: 'social-post', label: 'How to Post', icon: '📝', message: 'How do I create a post?' },
                { id: 'social-friends', label: 'Add Friends', icon: '👥', message: 'How do I add friends?' },
                { id: 'social-privacy', label: 'Privacy Settings', icon: '🔒', message: 'How do I change privacy settings?' },
                { id: 'social-reels', label: 'Upload Reels', icon: '🎬', message: 'How do I upload video reels?' },
            ];
        }

        // Settings page
        if (currentPath.includes('/settings')) {
            return [
                { id: 'settings-profile', label: 'Edit Profile', icon: '👤', message: 'How do I edit my profile?' },
                { id: 'settings-avatar', label: 'Change Avatar', icon: '🎨', message: 'How do I change my avatar?' },
                { id: 'settings-notifications', label: 'Notifications', icon: '🔔', message: 'How do I manage notifications?' },
                { id: 'settings-account', label: 'Account Security', icon: '🔐', message: 'How do I secure my account?' },
            ];
        }

        // Default actions for Hub
        return [
            { id: 'go-to-training', label: 'Go to Training', icon: '🎯', navigate: '/hub/training' },
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
