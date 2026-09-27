/**
 * FirstRunNotificationPrompt -- the World Hub's notification opt-in host.
 *
 * 2026-09-27: it is no longer only a one-time modal. It hosts every opt-in
 * ask: the first visit, plus the meaningful moments features announce with
 * requestPushNudge() (the Messenger invoice workspace here; joining a club and
 * a first rakeback receipt in Club Arena). WHEN an ask may appear is decided
 * by src/lib/push/enrollment-nudge.mjs: a Not Now starts a cool-down instead of
 * closing the door, at most one ask a day, never when this device is already
 * on, turned off by the person, or blocked, and never for Dan's receipts.
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
    hasLocalSubscription, isIos, isIosStandalonePwa, isOptedOut,
} from '../../lib/push-client';
import {
    decideNudge, readNudgeState, writeLedger, recordShown, recordDismissed,
    NUDGE_EVENT, takePendingNudge,
} from '../../lib/push/enrollment-nudge.mjs';
import InstallAppSheet from '../pwa/InstallAppSheet';

/**
 * The legacy one-time key. Still WRITTEN when the person answers, because the
 * other app's older bundle (and the E2E harnesses) read it as "already asked".
 * It is no longer a permanent door: enrollment-nudge.mjs reads it as one
 * earlier Not Now and applies the cool-down. See the history below.
 *
 * ONE re-offer, on purpose (2026-08-29). Between 2026-08-19 and 2026-08-29
 * /sw.js could not install at all (PR #929), so everyone asked in that window
 * had this key written against a question nobody could answer yes to. `_v2`
 * gave everybody exactly one more ask. Do not bump it as a re-prompt lever.
 *
 * MUST stay in step with Club Arena's copy of this key
 * (club-arena src/components/notifications/FirstRunPushPrompt.tsx).
 */
const KEY_PREFIX = 'sp_firstrun_notif_v2_';
const SHOW_DELAY_MS = 20_000; // let the user land before asking for anything
// A moment the person just created (opening the invoice workspace) is asked
// about promptly, but not in the same frame as the thing they came to do.
const MOMENT_DELAY_MS = 2_500;

// The install nudge keeps its OWN cool-down key: installing is a multi-step
// manual action a user may reasonably defer, and marking it done forever would
// mean the real permission prompt never appears either.
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

const COPY = {
    first_run: {
        title: 'Never Miss A Game',
        body: 'Turn On Notifications And We Will Alert You When A Seat Opens, A Friend Goes Live, A Game Fills Up, Or Someone Messages You. You Can Fine-Tune Exactly Which Alerts You Get At Any Time.',
    },
    invoice_workspace: {
        title: 'Get Invoice Updates On This Device',
        body: 'Turn On Notifications And We Will Tell You When A New Invoice Or Club Statement Arrives. You Can Change This Any Time In Settings.',
    },
    rakeback_receipt: {
        title: 'Get Your Rakeback Receipts On This Device',
        body: 'Turn On Notifications And We Will Tell You When A Rakeback Receipt Is Posted To Your Account. You Can Change This Any Time In Settings.',
    },
    club_joined: {
        title: 'Stay In Touch With Your Club',
        body: 'Turn On Notifications And We Will Tell You When A Seat Opens, A Tournament You Registered For Starts, Or Your Club Messages You.',
    },
};

function isSuppressed(path) {
    return SUPPRESSED_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));
}

function isAutomatedBrowser() {
    // An automation-driven browser is not a person and is never asked: it
    // cannot consent, and a sheet over an unattended journey blocks the run.
    try { return typeof navigator !== 'undefined' && navigator.webdriver === true; } catch { return false; }
}

export default function FirstRunNotificationPrompt({ userId }) {
    const router = useRouter();
    const [state, setState] = useState(null); // null | 'ask' | 'install' | 'blocked' | 'success'
    const [moment, setMoment] = useState('first_run');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const timer = useRef(null);
    const mounted = useRef(true);
    const openRef = useRef(false);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    useEffect(() => { openRef.current = Boolean(state); }, [state]);

    const markDone = useCallback(() => {
        try { localStorage.setItem(`${KEY_PREFIX}${userId}`, String(Date.now())); } catch { /* private mode */ }
    }, [userId]);

    /**
     * Decide, and if the policy allows it, show. Everything about WHETHER is in
     * enrollment-nudge.mjs; this only reads the device honestly.
     */
    const show = useCallback(async (requested) => {
        if (!userId || openRef.current || !mounted.current) return;
        if (isAutomatedBrowser()) return;
        const path = router.pathname || '';
        if (isSuppressed(path)) return;

        // iOS Safari has no PushManager until the site is installed to the
        // Home Screen and opened standalone. That is a prerequisite, not a dead
        // end, so the policy may offer the install steps instead of nothing.
        const permission = notificationPermission();
        let device = { supported: true, iosNeedsInstall: false, permission, subscribed: false, optedOut: isOptedOut() };
        if (!isWebPushSupported()) {
            device = { ...device, supported: false, iosNeedsInstall: isIos() && !isIosStandalonePwa() };
        } else if (permission === 'granted') {
            device.subscribed = await hasLocalSubscription();
        }
        if (!mounted.current || openRef.current) return;

        const now = Date.now();
        const stored = readNudgeState(typeof window !== 'undefined' ? window.localStorage : null, userId);
        const decision = decideNudge({ userId, moment: requested, now, device, ...stored });
        if (!decision.show) {
            if (decision.reason === 'already_on') markDone(); // older bundles agree
            return;
        }
        writeLedger(window.localStorage, userId, recordShown(stored.ledger, now));
        setMoment(requested);
        setError(null);
        openRef.current = true;
        if (decision.variant === 'install') setState('install');
        else setState('ask');
    }, [userId, router.pathname, markDone]);

    // The first-visit ask, after the person has had time to land.
    useEffect(() => {
        if (!userId || typeof window === 'undefined') return undefined;
        if (isSuppressed(router.pathname || '')) return undefined;
        timer.current = setTimeout(() => { void show('first_run'); }, SHOW_DELAY_MS);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [userId, router.pathname, show]);

    // Meaningful moments announced by features (requestPushNudge).
    useEffect(() => {
        if (!userId || typeof window === 'undefined') return undefined;
        let momentTimer = null;
        const onNudge = (e) => {
            const m = e?.detail?.moment;
            if (!m) return;
            try { window.__spPendingPushNudge = null; } catch { /* ignore */ }
            if (momentTimer) clearTimeout(momentTimer);
            momentTimer = setTimeout(() => { void show(m); }, MOMENT_DELAY_MS);
        };
        window.addEventListener(NUDGE_EVENT, onNudge);
        const pending = takePendingNudge();
        if (pending) momentTimer = setTimeout(() => { void show(pending); }, MOMENT_DELAY_MS);
        return () => {
            window.removeEventListener(NUDGE_EVENT, onNudge);
            if (momentTimer) clearTimeout(momentTimer);
        };
    }, [userId, show]);

    const close = () => { openRef.current = false; setState(null); };

    const handleEnable = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        // DELIBERATE: nothing is awaited before enablePush(). iOS only honours
        // the permission dialog while the originating tap gesture is alive.
        const result = await enablePush();
        if (!mounted.current) return;
        setBusy(false);

        // ONLY AN ANSWER SPENDS THE ASK. Success and a DENIED permission are
        // real answers; a technical failure leaves the door open.
        if (result.ok || notificationPermission() === 'denied') markDone();
        if (result.ok) {
            setState('success');
            setTimeout(() => { if (mounted.current) close(); }, 2600);
        } else if (notificationPermission() === 'denied') {
            setState('blocked');
        } else {
            setError(result.error || 'Could not enable notifications.');
        }
    };

    const handleDismiss = () => {
        const storage = typeof window !== 'undefined' ? window.localStorage : null;
        const stored = readNudgeState(storage, userId);
        if (state === 'install') {
            // The install nudge is deferrable, not answerable: its own cool-down
            // key, so the real permission prompt still runs once installed.
            try {
                localStorage.setItem(`${IOS_KEY_PREFIX}${userId}`, String(Date.now()));
            } catch { /* private mode */ }
            writeLedger(storage, userId, recordDismissed(stored.ledger, Date.now(), stored.legacyAskedAt));
        } else if (state === 'ask') {
            // Not Now: a cool-down, not a permanent no.
            writeLedger(storage, userId, recordDismissed(stored.ledger, Date.now(), stored.legacyAskedAt));
            markDone();
        }
        close();
    };

    if (!state) return null;

    // ── The install path uses the SHARED sheet ────────────────────────────
    // One install UI for the whole site: it upgrades itself to a one-tap
    // native install when Chrome offers one, and tells iOS Chrome/Firefox
    // users to switch to Safari.
    if (state === 'install') {
        return (
            <InstallAppSheet
                onClose={handleDismiss}
                reason="Required on iPhone for notifications"
            />
        );
    }

    const copy = COPY[moment] || COPY.first_run;
    // The first visit keeps its modal. A moment the person just created gets a
    // card that does not block the page they are using.
    const modal = moment === 'first_run' || state === 'blocked';

    return (
        <div
            role="dialog"
            aria-modal={modal ? 'true' : 'false'}
            aria-label="Enable notifications"
            data-push-nudge={moment}
            style={modal ? {
                position: 'fixed', inset: 0, zIndex: 99998,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)', padding: '16px',
                paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            } : {
                position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 99998,
                display: 'flex', justifyContent: 'center', pointerEvents: 'none',
                padding: '16px', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            }}
            onClick={modal ? handleDismiss : undefined}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 420, borderRadius: 18,
                    background: '#111827', color: '#fff', pointerEvents: 'auto',
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
                        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{copy.title}</h3>
                        <p style={{ marginTop: 8, fontSize: 14, color: '#9CA3AF', lineHeight: 1.5 }}>
                            {copy.body}
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
