/**
 * NOTIFICATION PROMPT — Push subscription CTA
 * Shows a non-intrusive prompt to enable push notifications
 * - Only appears ONCE per user (60s after first login)
 * - Remembers the choice permanently via localStorage + server-side IP tracking
 * - Works across ALL pages: /hub/*, /commander/*, and all other routes
 * - Never reappears after Yes or No is clicked, even if cache is cleared
 * - Server-side tracking by IP ensures persistence across cache clears
 */
import { useState, useEffect } from 'react';
import { useOneSignal } from '../../contexts/OneSignalContext';

const PROMPT_KEY = 'push_prompt_responded'; // universal key — shared across all pages/routes

/**
 * Check server-side if this IP already dismissed the notification prompt.
 * Returns true if server confirms this IP already responded.
 * Falls back to false on any error (so prompt shows — better than being stuck).
 */
async function checkServerDismissed() {
    try {
        const res = await fetch('/api/notifications/prompt-status', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return false;
        const data = await res.json();
        return data.dismissed === true;
    } catch {
        return false; // Network error → assume not dismissed
    }
}

/**
 * Record on server that this IP responded to the notification prompt.
 * Fire-and-forget — never blocks the UI.
 */
function recordOnServer(action, userId) {
    try {
        fetch('/api/notifications/prompt-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, user_id: userId }),
        }).catch(() => { }); // Silently ignore errors
    } catch {
        // Silently ignore
    }
}

export default function NotificationPrompt({ userId, onDismiss }) {
    const { isInitialized, isSubscribed, subscribe, setExternalUserId, permission, playerId } = useOneSignal();
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    // ─── Guard: Check IMMEDIATELY on mount if user already responded ───
    useEffect(() => {
        if (typeof window === 'undefined' || !userId) return;

        // Check localStorage first — this is the fast/primary client-side mechanism
        const alreadyResponded = localStorage.getItem(PROMPT_KEY);

        // If already responded, already subscribed, or permission denied → NEVER show
        if (alreadyResponded) {
            return; // Hard stop — user already made their choice
        }
        if (isSubscribed) {
            // User is already subscribed — mark as responded so we never ask again
            localStorage.setItem(PROMPT_KEY, `subscribed_${Date.now()}`);
            recordOnServer('subscribed', userId); // Also record server-side
            return;
        }
        if (permission === 'denied') {
            // Browser denied — mark as responded so we never ask again
            localStorage.setItem(PROMPT_KEY, `denied_${Date.now()}`);
            recordOnServer('denied', userId); // Also record server-side
            return;
        }

        // ─── Server-side IP check (catches cache clears, different browsers same IP) ───
        checkServerDismissed().then(serverDismissed => {
            if (serverDismissed) {
                // Server says this IP already responded — set localStorage to stay in sync
                localStorage.setItem(PROMPT_KEY, `server_confirmed_${Date.now()}`);
                return; // Don't show prompt
            }

            // Only show if OneSignal is initialized and user hasn't responded anywhere
            if (isInitialized && !isSubscribed && permission !== 'denied') {
                // 60 second delay after page load (first login experience)
                const timer = setTimeout(() => {
                    // Double-check localStorage right before showing (race condition guard)
                    const check = localStorage.getItem(PROMPT_KEY);
                    if (!check) {
                        setVisible(true);
                    }
                }, 60000);
                // Store timer ref for cleanup
                window.__notifPromptTimer = timer;
            }
        });

        return () => {
            if (window.__notifPromptTimer) {
                clearTimeout(window.__notifPromptTimer);
            }
        };
    }, [isInitialized, isSubscribed, permission, userId]);

    // Link user ID when initialized AND we have a playerId - ALWAYS try to link if subscribed
    useEffect(() => {
        if (isInitialized && userId && playerId && isSubscribed) {
            if (process.env.NODE_ENV === 'development') console.log('[NotificationPrompt] Attempting to link user:', userId, 'playerId:', playerId);
            setExternalUserId(userId);
        }
    }, [isInitialized, userId, isSubscribed, playerId, setExternalUserId]);

    // ─── Persistence: mark as responded in BOTH localStorage AND server ───
    const markResponded = (action) => {
        const value = `${action}_${Date.now()}`;
        try {
            localStorage.setItem(PROMPT_KEY, value);
            // Verify the write succeeded
            const verify = localStorage.getItem(PROMPT_KEY);
            if (!verify) {
                console.error('[NotificationPrompt] localStorage write FAILED, retrying...');
                localStorage.setItem(PROMPT_KEY, value);
            }
        } catch (err) {
            console.error('[NotificationPrompt] localStorage error:', err);
        }
        // Always record server-side as backup (fire-and-forget)
        recordOnServer(action, userId);
    };

    const handleEnable = async () => {
        setLoading(true);
        markResponded('yes'); // Mark FIRST, before async operations
        setVisible(false);   // Hide immediately
        try {
            const success = await subscribe();
            if (success && userId) {
                await setExternalUserId(userId);
            }
        } catch (error) {
            console.error('Failed to enable notifications:', error);
        }
        setLoading(false);
    };

    const handleDismiss = () => {
        markResponded('no');
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
