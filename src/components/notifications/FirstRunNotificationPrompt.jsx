/**
 * FirstRunNotificationPrompt -- the one-time "turn on notifications" modal.
 *
 * Replaces the OneSignal-backed NotificationPrompt. Now drives the self-hosted
 * VAPID flow in src/lib/push-client.js.
 *
 * RULES
 *   - Shows exactly ONCE per account per browser (localStorage sp_firstrun_notif_<uid>).
 *   - On iOS Safari BEFORE the app is installed, shows Add-to-Home-Screen
 *     steps instead of nothing. See the iOS note below.
 *   - Never shows on the landing page or inside onboarding, which run their own flows.
 *   - Never shows if permission is already granted AND this device is subscribed.
 *   - If permission is 'denied', shows unblock instructions instead of a dead button.
 *   - Three states: ask, blocked, success.
 *
 * DELIBERATE: the Enable button calls enablePush() synchronously inside the
 * click handler. iOS only honours Notification.requestPermission() while the
 * originating tap gesture is alive, so nothing may be awaited before it.
 *
 * THE iOS DEAD END (fixed 2026-08-25, Dan)
 * ----------------------------------------
 * "I get actual real notifications in real time [on PepNationLab]... this is
 * not working or functional for smarter.poker."
 *
 * Every piece of the push stack was already here and correct -- VAPID keys,
 * the subscribe API, push_outbox, the dispatch cron, and a service worker
 * with push/notificationclick/pushsubscriptionchange handlers, all verified
 * live. The pipeline had delivered exactly one push, ever, and 1,376 rows sat
 * in push_outbox marked skipped/no_subscription. push_subscriptions held zero
 * active rows.
 *
 * Nobody could enrol from a phone. On iOS, PushManager does not exist in
 * Safari at all -- web push works ONLY once the site is installed to the Home
 * Screen and opened as a standalone app. So isWebPushSupported() returned
 * false and this component returned silently, showing the iPhone user
 * nothing. The Add-to-Home-Screen copy DID exist, but only inside the
 * 'blocked' branch, which iOS Safari can never reach: permission there is
 * 'default', not 'denied', and the effect had already returned above it.
 *
 * So the one instruction that would have unblocked every iPhone user was
 * written, shipped, and unreachable. The 'install' state below is the fix.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
    enablePush, isWebPushSupported, notificationPermission,
    hasLocalSubscription, isIos, isIosStandalonePwa,
} from '../../lib/push-client';
import InstallAppSheet from '../pwa/InstallAppSheet';

/**
 * ONE re-offer, on purpose. Read this before changing the suffix again.
 *
 * This prompt asks once per account per browser and then closes that door for
 * good. Between 2026-08-19 and 2026-08-29 the door was being closed against a
 * question nobody could answer yes to: /sw.js — the only worker on this origin
 * with a `push` handler — could not install at all, because one entry in its
 * precache manifest 404'd (PR #929). Everyone who saw this sheet in that window
 * and said Not Now, or tapped Enable and hit the error, had
 * `sp_firstrun_notif_<uid>` written anyway, permanently.
 *
 * Measured the day the worker was fixed: 1 subscribed user out of 1,023
 * profiles, against 2,437 pushes in seven days skipped for `no_subscription`.
 * Shipping the fix without this line would have fixed push for an audience that
 * could never be asked again.
 *
 * `_v2` gives everybody exactly one more ask. It is NOT a re-prompt lever to
 * reach for whenever enrolment looks low — bumping it again re-asks a thousand
 * people who already said no, and the honest reading of a second no is that
 * they meant the first one. Bump it only if the enrolment path is broken again
 * in a way that made their answer meaningless, and say here what broke.
 *
 * MUST stay in step with Club Arena's copy of this key
 * (club-arena src/components/notifications/FirstRunPushPrompt.tsx). Same
 * origin, same device, one subscription behind both apps: if one app re-offers
 * and the other does not, a player gets asked twice about the same thing.
 */
const KEY_PREFIX = 'sp_firstrun_notif_v2_';
const SHOW_DELAY_MS = 20_000; // let the user land before asking for anything

// The install nudge uses its OWN key with a cooldown rather than the permanent
// "asked once" key. Installing is a multi-step manual action a user may
// reasonably defer, and marking it done forever would mean the real permission
// prompt never appears either -- the same one-way door that made a rotated
// subscription silent forever. A week is long enough not to nag.
const IOS_KEY_PREFIX = 'sp_firstrun_ios_install_';
const IOS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const SUPPRESSED_ROUTES = [
    '/',
    '/login',
    '/signup',
    '/onboarding',
    // Never interrupt a live poker decision or its session-launch control.
    '/hub/training/arena',
    '/hub/club-arena',
];

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
            // iOS Safari has no PushManager until the site is installed to the
            // Home Screen and opened standalone. That is not a dead end, it is
            // a prerequisite -- so say so, rather than showing nothing and
            // leaving the user to conclude push is broken.
            if (isIos() && !isIosStandalonePwa()) {
                let lastAsked = 0;
                try {
                    lastAsked = Number(localStorage.getItem(`${IOS_KEY_PREFIX}${userId}`) || 0);
                } catch { /* private mode */ }
                if (Date.now() - lastAsked < IOS_COOLDOWN_MS) return undefined;

                timer.current = setTimeout(() => {
                    if (mounted.current) setState('install');
                }, SHOW_DELAY_MS);
                return () => { if (timer.current) clearTimeout(timer.current); };
            }

            // Any other browser without push support genuinely cannot do this.
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

        // ONLY AN ANSWER SPENDS THE ASK.
        //
        // markDone() used to run here unconditionally, so a user who tapped
        // Enable and hit a TECHNICAL failure -- worker still installing, a
        // dropped VAPID fetch, a flaky minute of signal -- had their one and
        // only prompt recorded as spent. They wanted notifications. They said
        // so. The platform wrote down "asked, done" and never offered again.
        //
        // That is how the 2026-08-19..29 outage turned a fixable bug into a
        // permanent loss of audience. The outage is over; the mechanism is not.
        //
        // Success and a DENIED permission are both real answers and are
        // recorded. Anything else leaves the door open for the next session.
        if (result.ok || notificationPermission() === 'denied') markDone();
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
        // The install nudge is deferrable, not answerable -- record it against
        // its own cooldown key so the real permission prompt still runs once
        // the user installs and opens the app.
        if (state === 'install') {
            try {
                localStorage.setItem(`${IOS_KEY_PREFIX}${userId}`, String(Date.now()));
            } catch { /* private mode */ }
        } else {
            markDone();
        }
        setState(null);
    };

    if (!state) return null;

    // ── The install path uses the SHARED sheet ────────────────────────────
    // This component used to draw its own three-step Add-to-Home-Screen list.
    // So did the PWA install banner. Two hand-maintained copies of the same
    // instructions is exactly the duplication that had five notification
    // renderers disagreeing about routing, so there is now one install UI.
    // The shared sheet also handles what an inline list cannot: it upgrades
    // itself to a one-tap native install if Chrome fires beforeinstallprompt
    // while it is open, and it tells iOS Chrome/Firefox users to switch to
    // Safari rather than hunt for a menu item their share sheet lacks.
    if (state === 'install') {
        return (
            <InstallAppSheet
                onClose={handleDismiss}
                reason="Required on iPhone for notifications"
            />
        );
    }

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
                        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>You Are All Set</h3>
                        <p style={{ marginTop: 8, fontSize: 14, color: '#9CA3AF' }}>
                            Notifications Are On For This Device.
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
                            Turn On Notifications And We Will Alert You When A Seat Opens, A Friend Goes
                            Live, A Game Fills Up, Or Someone Messages You. You Can Fine-Tune Exactly
                            Which Alerts You Get At Any Time.
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
