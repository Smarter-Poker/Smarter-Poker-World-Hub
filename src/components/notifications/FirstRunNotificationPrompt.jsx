/**
 * FirstRunNotificationPrompt -- the one-time "turn on notifications" modal.
 *
 * Replaces the OneSignal-backed NotificationPrompt. Now drives the self-hosted
 * VAPID flow in src/lib/push-client.js.
 *
 * RULES
 *   - Shows exactly ONCE per account per browser (localStorage sp_firstrun_notif_<uid>).
 *   - Never shows on the landing page or inside onboarding, which run their own flows.
 *   - Never shows if permission is already granted AND this device is subscribed.
 *   - If permission is 'denied', shows unblock instructions instead of a dead button.
 *   - Three states: ask, blocked, success.
 *
 * DELIBERATE: the Enable button calls enablePush() synchronously inside the
 * click handler. iOS only honours Notification.requestPermission() while the
 * originating tap gesture is alive, so nothing may be awaited before it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
    enablePush, isWebPushSupported, notificationPermission,
    hasLocalSubscription, isIos, isIosStandalonePwa,
} from '../../lib/push-client';

const KEY_PREFIX = 'sp_firstrun_notif_';
const SHOW_DELAY_MS = 20_000; // let the user land before asking for anything

const SUPPRESSED_ROUTES = ['/', '/login', '/signup', '/onboarding'];

export default function FirstRunNotificationPrompt({ userId }) {
    const router = useRouter();
    const [state, setState] = useState(null); // null | 'ask' | 'blocked' | 'success'
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const timer = useRef(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    const markDone = useCallback(() => {
        try { localStorage.setItem(`${KEY_PREFIX}${userId}`, String(Date.now())); } catch { /* private mode */ }
    }, [userId]);

    useEffect(() => {
        if (!userId || typeof window === 'undefined') return undefined;

        const path = router.pathname || '';
        if (SUPPRESSED_ROUTES.some((r) => path === r || path.startsWith(`${r}/`))) return undefined;

        let alreadyAsked = false;
        try { alreadyAsked = Boolean(localStorage.getItem(`${KEY_PREFIX}${userId}`)); } catch { /* ignore */ }
        if (alreadyAsked) return undefined;

        if (!isWebPushSupported()) {
            // Plain iOS Safari cannot do push at all. Asking would be a dead end,
            // so stay quiet rather than teach the user that the feature is broken.
            return undefined;
        }

        (async () => {
            const perm = notificationPermission();
            if (perm === 'granted' && (await hasLocalSubscription())) {
                markDone(); // nothing to ask for
                return;
            }
            timer.current = setTimeout(() => {
                if (!mounted.current) return;
                setState(perm === 'denied' ? 'blocked' : 'ask');
            }, SHOW_DELAY_MS);
        })();

        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [userId, router.pathname, markDone]);

    const handleEnable = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        const result = await enablePush();
        if (!mounted.current) return;
        setBusy(false);
        markDone();
        if (result.ok) {
            setState('success');
            setTimeout(() => { if (mounted.current) setState(null); }, 2600);
        } else if (notificationPermission() === 'denied') {
            setState('blocked');
        } else {
            setError(result.error || 'Could not enable notifications.');
        }
    };

    const handleDismiss = () => {
        markDone();
        setState(null);
    };

    if (!state) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Enable notifications"
            style={{
                position: 'fixed', inset: 0, zIndex: 99998,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)', padding: '16px',
                paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            }}
            onClick={handleDismiss}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 420, borderRadius: 18,
                    background: '#111827', color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', padding: 22,
                }}
            >
                {state === 'success' ? (
                    <>
                        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>You are all set</h3>
                        <p style={{ marginTop: 8, fontSize: 14, color: '#9CA3AF' }}>
                            Notifications are on for this device.
                        </p>
                    </>
                ) : state === 'blocked' ? (
                    <>
                        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Notifications Are Blocked</h3>
                        <p style={{ marginTop: 8, fontSize: 14, color: '#9CA3AF', lineHeight: 1.5 }}>
                            {isIos() && !isIosStandalonePwa()
                                ? 'On iPhone and iPad, add Smarter Poker to your Home Screen first. Tap Share, then Add to Home Screen, then open it from there.'
                                : 'Open your browser site settings for smarter.poker, switch Notifications to Allow, then reload this page.'}
                        </p>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            style={btnPrimary}
                        >
                            Got It
                        </button>
                    </>
                ) : (
                    <>
                        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Never Miss A Game</h3>
                        <p style={{ marginTop: 8, fontSize: 14, color: '#9CA3AF', lineHeight: 1.5 }}>
                            Turn on notifications and we will alert you when a seat opens, a friend goes
                            live, a game fills up, or someone messages you. You can fine-tune exactly
                            which alerts you get at any time.
                        </p>
                        {error && (
                            <p style={{ marginTop: 10, fontSize: 13, color: '#FCA5A5' }}>{error}</p>
                        )}
                        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                            <button type="button" onClick={handleDismiss} style={btnGhost} disabled={busy}>
                                Not Now
                            </button>
                            <button type="button" onClick={handleEnable} style={btnPrimary} disabled={busy}>
                                {busy ? 'Enabling...' : 'Enable'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const btnPrimary = {
    flex: 1, marginTop: 4, padding: '12px 16px', borderRadius: 12, border: 'none',
    background: '#14B8A6', color: '#04211E', fontSize: 15, fontWeight: 700, cursor: 'pointer',
};

const btnGhost = {
    flex: 1, marginTop: 4, padding: '12px 16px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
    color: '#D1D5DB', fontSize: 15, fontWeight: 600, cursor: 'pointer',
};
