/**
 * NOTIFICATION PROMPT — Push subscription CTA
 * Shows a non-intrusive prompt to enable push notifications
 * - Only appears ONCE per user (60s after first login)
 * - Remembers the choice permanently via localStorage + server-side IP tracking
 * - Works across ALL pages: /hub/*, /commander/*, and all other routes
 * - Never reappears after Yes or No is clicked, even if cache is cleared
 * - Server-side tracking by IP ensures persistence across cache clears
 */
import { useState, useEffect, useRef, useCallback } from 'react';
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
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Silently ignore errors
    } catch {
        // Silently ignore
    }
}

export default function NotificationPrompt({ userId, onDismiss }) {
    const { isInitialized, isSubscribed, subscribe, setExternalUserId, permission, playerId } = useOneSignal();
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const mountedRef = useRef(true);    // Track if component is still mounted
    const timerRef = useRef(null);       // Timer ref (not global window)

    // ─── Cleanup on unmount ───
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    // ─── Guard: Check IMMEDIATELY on mount if user already responded ───
    useEffect(() => {
        if (typeof window === 'undefined' || !userId) return;

        // Check localStorage first — this is the fast/primary client-side mechanism
        let alreadyResponded = false;
        try {
            alreadyResponded = !!localStorage.getItem(PROMPT_KEY);
        } catch {
            // localStorage may be disabled (incognito on some browsers)
        }

        // If already responded, already subscribed, or permission denied → NEVER show
        if (alreadyResponded) {
            return; // Hard stop — user already made their choice
        }
        if (isSubscribed) {
            // User is already subscribed — mark as responded so we never ask again
            safeSetStorage(`subscribed_${Date.now()}`);
            recordOnServer('subscribed', userId);
            return;
        }
        if (permission === 'denied') {
            // Browser denied — mark as responded so we never ask again
            safeSetStorage(`denied_${Date.now()}`);
            recordOnServer('denied', userId);
            return;
        }

        // ─── Server-side IP check (catches cache clears, different browsers same IP) ───
        // Capture current values to avoid stale closure issues
        const capturedIsInit = isInitialized;
        const capturedIsSub = isSubscribed;
        const capturedPerm = permission;

        checkServerDismissed().then(serverDismissed => {
            // Guard: component may have unmounted during the async call
            if (!mountedRef.current) return;

            if (serverDismissed) {
                // Server says this IP already responded — set localStorage to stay in sync
                safeSetStorage(`server_confirmed_${Date.now()}`);
                return; // Don't show prompt
            }

            // Only show if OneSignal is initialized and user hasn't responded anywhere
            if (capturedIsInit && !capturedIsSub && capturedPerm !== 'denied') {
                let isFirstVisit = true;
                try {
                    const visited = localStorage.getItem('sp_first_visit_cleared');
                    if (!visited) {
                        localStorage.setItem('sp_first_visit_cleared', 'true');
                    } else {
                        isFirstVisit = false;
                    }
                } catch (e) { console.warn('[App] Handled exception:', e); }

                // Do not show prompt on first ever visit to prevent interrupting onboarding/first experience
                if (isFirstVisit) return;

                // 5 second delay on returning visits
                timerRef.current = setTimeout(() => {
                    // Guard: check mounted + localStorage before showing
                    if (!mountedRef.current) return;
                    // 2026-07-19 AUDIT FIX (wave-1 E2E): never interrupt an active
                    // training session — the prompt was overlaying the arena table
                    // mid-hand and covering the session-review header.
                    try {
                        const path = typeof window !== 'undefined' ? window.location.pathname : '';
                        if (path.startsWith('/hub/training/arena')) return;
                    } catch (_e) { /* fall through — showing is acceptable */ }
                    try {
                        const check = localStorage.getItem(PROMPT_KEY);
                        // Also check browser's Notification.permission — if already
                        // granted or denied at the OS level, skip our custom prompt
                        const browserPerm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
                        if (!check && browserPerm === 'default') {
                            setVisible(true);
                        } else if (!check && browserPerm !== 'default') {
                            // Browser already has an answer — persist so we never check again
                            safeSetStorage(`browser_${browserPerm}_${Date.now()}`);
                            recordOnServer(browserPerm, userId);
                        }
                    } catch {
                        // localStorage disabled — don't show (can't persist choice)
                    }
                }, 5000);
            }
        });

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isInitialized, isSubscribed, permission, userId]);

    // Link user ID when initialized AND we have a playerId - ALWAYS try to link if subscribed
    useEffect(() => {
        if (isInitialized && userId && playerId && isSubscribed) {
            if (process.env.NODE_ENV === 'development') console.debug('[NotificationPrompt] Attempting to link user:', userId, 'playerId:', playerId);
            setExternalUserId(userId);
        }
    }, [isInitialized, userId, isSubscribed, playerId, setExternalUserId]);

    // ─── Safe localStorage write (handles disabled/full/quota errors) ───
    const safeSetStorage = useCallback((value) => {
        try {
            localStorage.setItem(PROMPT_KEY, value);
            // Verify the write succeeded
            const verify = localStorage.getItem(PROMPT_KEY);
            if (!verify) {
                console.warn('[NotificationPrompt] localStorage write FAILED, retrying...');
                localStorage.setItem(PROMPT_KEY, value);
            }
        } catch (err) {
            console.warn('[NotificationPrompt] localStorage error:', err);
        }
    }, []);

    // ─── Persistence: mark as responded in BOTH localStorage AND server ───
    const markResponded = useCallback((action) => {
        const value = `${action}_${Date.now()}`;
        safeSetStorage(value);
        // Always record server-side as backup (fire-and-forget)
        recordOnServer(action, userId);
    }, [userId, safeSetStorage]);

    const handleEnable = useCallback(async () => {
        setLoading(true);
        markResponded('yes'); // Mark FIRST, before async operations
        setVisible(false);   // Hide immediately
        try {
            const success = await subscribe();
            if (success && userId) {
                await setExternalUserId(userId);
            }
        } catch (error) {
            console.warn('Failed to enable notifications:', error);
        }
        if (mountedRef.current) setLoading(false);
    }, [markResponded, subscribe, userId, setExternalUserId]);

    const handleDismiss = useCallback(() => {
        markResponded('no');
        setVisible(false);
        onDismiss?.();
    }, [markResponded, onDismiss]);

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
