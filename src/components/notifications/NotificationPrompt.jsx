/**
 * NOTIFICATION PROMPT — Push subscription CTA
 * Shows a non-intrusive prompt to enable push notifications
 * Appears after user logs in and hasn't subscribed yet
 */
import { useState, useEffect } from 'react';
import { useOneSignal } from '../../contexts/OneSignalContext';

export default function NotificationPrompt({ userId, onDismiss }) {
    const { isInitialized, isSubscribed, subscribe, setExternalUserId, permission } = useOneSignal();
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    // Check if user has already dismissed or subscribed
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const dismissedKey = `push_prompt_dismissed_${userId}`;
        const wasDismissed = localStorage.getItem(dismissedKey);

        // Only show if: initialized, not subscribed, not denied, not dismissed
        if (isInitialized && !isSubscribed && permission !== 'denied' && !wasDismissed) {
            // Delay showing prompt for better UX
            const timer = setTimeout(() => setVisible(true), 3000);
            return () => clearTimeout(timer);
        }
    }, [isInitialized, isSubscribed, permission, userId]);

    // Link user ID when initialized - ALWAYS try to link if subscribed
    useEffect(() => {
        if (isInitialized && userId) {
            // Always try to link, even if already subscribed (fixes users who subscribed before linking was added)
            console.log('[NotificationPrompt] Attempting to link user:', userId, 'isSubscribed:', isSubscribed);
            setExternalUserId(userId);
        }
    }, [isInitialized, userId, isSubscribed, setExternalUserId]);

    const handleEnable = async () => {
        setLoading(true);
        try {
            const success = await subscribe();
            if (success && userId) {
                await setExternalUserId(userId);
            }
            setVisible(false);
        } catch (error) {
            console.error('Failed to enable notifications:', error);
        }
        setLoading(false);
    };

    const handleDismiss = () => {
        const dismissedKey = `push_prompt_dismissed_${userId}`;
        localStorage.setItem(dismissedKey, 'true');
        setDismissed(true);
        setVisible(false);
        onDismiss?.();
    };

    if (!visible || dismissed) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: 16,
            padding: '16px 24px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 20px rgba(0,212,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            maxWidth: '90vw',
            width: 'fit-content',
            animation: 'slideUp 0.3s ease-out',
        }}>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>

            {/* Icon */}
            <div style={{ fontSize: 32 }}>🔔</div>

            {/* Text */}
            <div style={{ flex: 1 }}>
                <div style={{
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 15,
                    marginBottom: 4,
                }}>
                    Enable Push Notifications
                </div>
                <div style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                }}>
                    Get alerts for messages, calls & tournaments
                </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
                <button
                    onClick={handleDismiss}
                    style={{
                        padding: '8px 16px',
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: 8,
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: 13,
                        cursor: 'pointer',
                    }}
                >
                    Not now
                </button>
                <button
                    onClick={handleEnable}
                    disabled={loading}
                    style={{
                        padding: '8px 20px',
                        background: loading
                            ? 'rgba(0,212,255,0.5)'
                            : 'linear-gradient(135deg, #00D4FF 0%, #0084FF 100%)',
                        border: 'none',
                        borderRadius: 8,
                        color: 'white',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: loading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    {loading ? 'Enabling...' : 'Enable'}
                </button>
            </div>
        </div>
    );
}
