/**
 * NOTIFICATION PROMPT — Push subscription CTA
 * Shows a non-intrusive prompt to enable push notifications
 * - Only appears ONCE per user (60s after first login)
 * - Remembers the choice permanently via localStorage
 * - Never reappears after Yes or No is clicked
 */
import { useState, useEffect } from 'react';
import { useOneSignal } from '../../contexts/OneSignalContext';

const PROMPT_KEY = 'push_prompt_responded'; // universal key, no user suffix needed

export default function NotificationPrompt({ userId, onDismiss }) {
    const { isInitialized, isSubscribed, subscribe, setExternalUserId, permission, playerId } = useOneSignal();
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    // Check if user has already responded (Yes or No)
    useEffect(() => {
        if (typeof window === 'undefined' || !userId) return;

        const alreadyResponded = localStorage.getItem(PROMPT_KEY);

        // Never show again if user already responded, is already subscribed, or permission denied
        if (alreadyResponded || isSubscribed || permission === 'denied') return;

        // Only show if OneSignal is initialized and user hasn't responded
        if (isInitialized && !isSubscribed && permission !== 'denied') {
            // 60 second delay after page load (first login experience)
            const timer = setTimeout(() => setVisible(true), 60000);
            return () => clearTimeout(timer);
        }
    }, [isInitialized, isSubscribed, permission, userId]);

    // Link user ID when initialized AND we have a playerId - ALWAYS try to link if subscribed
    useEffect(() => {
        if (isInitialized && userId && playerId && isSubscribed) {
            if (process.env.NODE_ENV === 'development') console.log('[NotificationPrompt] Attempting to link user:', userId, 'playerId:', playerId);
            setExternalUserId(userId);
        }
    }, [isInitialized, userId, isSubscribed, playerId, setExternalUserId]);

    const markResponded = () => {
        localStorage.setItem(PROMPT_KEY, Date.now().toString());
    };

    const handleEnable = async () => {
        setLoading(true);
        try {
            const success = await subscribe();
            if (success && userId) {
                await setExternalUserId(userId);
            }
        } catch (error) {
            console.error('Failed to enable notifications:', error);
        }
        markResponded();
        setVisible(false);
        setLoading(false);
    };

    const handleDismiss = () => {
        markResponded();
        setVisible(false);
        onDismiss?.();
    };

    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'rgba(20, 25, 40, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            padding: '12px 20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            animation: 'slideUp 0.3s ease-out',
        }}>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>

            {/* Text */}
            <div style={{
                color: 'white',
                fontSize: 14,
                fontWeight: 500,
            }}>
                Allow Notifications?
            </div>

            {/* Yes/No Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
                <button
                    onClick={handleDismiss}
                    style={{
                        padding: '6px 16px',
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: 6,
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: 13,
                        cursor: 'pointer',
                        fontWeight: 500,
                    }}
                >
                    No
                </button>
                <button
                    onClick={handleEnable}
                    disabled={loading}
                    style={{
                        padding: '6px 16px',
                        background: loading ? 'rgba(0,150,255,0.5)' : '#0096FF',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: loading ? 'wait' : 'pointer',
                    }}
                >
                    {loading ? '...' : 'Yes'}
                </button>
            </div>
        </div>
    );
}
