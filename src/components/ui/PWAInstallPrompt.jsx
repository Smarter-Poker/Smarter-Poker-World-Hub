/**
 * PWA INSTALL PROMPT — the banner that offers the app.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Rewritten 2026-08-25 (Dan: "MAKE SURE THAT SMARTER.POKER HAS A full PWA
 * install layer that walks you into installing... THIS NEEDS TO WORK FOR
 * ANDROID USERS AS WELL").
 *
 * WHAT WAS WRONG
 *
 * 1. IT COULD NOT FIRE ON ANDROID. The `beforeinstallprompt` listener was
 *    attached inside the .then() of an async server round-trip. Chrome
 *    fires that event once, early — almost always before that fetch
 *    resolved — so the listener was registered after the only event it
 *    would ever receive. No error, no banner, ever. The capture now lives
 *    at module scope in src/lib/pwaInstall.js, which is the documented fix.
 *
 * 2. THE CLEANUP WAS RETURNED INTO A PROMISE. `return () => remove...`
 *    inside a .then() returns to the promise chain, not to useEffect, so
 *    the listener was never removed either.
 *
 * 3. IT HAD NO iOS PATH AT ALL. iOS Safari never fires
 *    `beforeinstallprompt` — Apple has no install API — so iPhone users
 *    were never offered the app. That matters more than convenience:
 *    iOS exposes no Push API outside an installed app, so on iPhone this
 *    banner is the entry point to notifications existing at all.
 *
 * 4. "ONE CLICK = PERMANENT" OUTLIVED ITS PURPOSE. A single tap on Later
 *    suppressed the banner forever, on this device AND by IP. In
 *    production that had already locked out 26 IPs permanently, and with
 *    it their only route to push. Installing is still permanent — you
 *    cannot install twice — but declining is now a 30-day cooldown. The
 *    anti-nag intent is kept; the one-way door is not.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    isRunningAsApp, isKnownInstalled, isInstallable, canPromptInstall,
    isIos, subscribeInstallState, PWA_INSTALLED_KEY,
} from '../../lib/pwaInstall';
import { promptInteractionCss, promptPanel, promptPrimary, promptSecondary, promptEyebrow } from '../pwa/promptMaterials';
import InstallAppSheet from '../pwa/InstallAppSheet';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { installPromptDelay } from '../../lib/signupExperience.mjs';

const DISMISS_UNTIL_KEY = 'sp_pwa_prompt_snooze_until';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

/** Fire-and-forget analytics. Never blocks or breaks the UI. */
function recordOnServer(action) {
    try {
        fetch('/api/pwa/prompt-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        }).catch(() => {});
    } catch { /* ignore */ }
}

function snoozed() {
    const until = Number(safeGet(DISMISS_UNTIL_KEY) || 0);
    return until > Date.now();
}

function snooze() {
    safeSet(DISMISS_UNTIL_KEY, String(Date.now() + SNOOZE_MS));
}

export default function PWAInstallPrompt() {
    const { pathname } = useRouter();
    const [authUser, setAuthUser] = useState(null);
    const [show, setShow] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    const mountedRef = useRef(true);
    const timerRef = useRef(null);
    const alreadyCountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    useEffect(() => {
        let active = true;
        // INITIAL_SESSION supplies the hydrated session; subsequent events
        // cover sign-in, refresh and sign-out without a competing session read.
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (active) setAuthUser(session?.user || null);
        });
        return () => { active = false; data?.subscription?.unsubscribe(); };
    }, []);

    const evaluate = useCallback(() => {
        if (!mountedRef.current) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        const delay = installPromptDelay(authUser, pathname);
        if (delay === null || delay > 0) {
            setShow(false);
            setSheetOpen(false);
            if (delay !== null) timerRef.current = setTimeout(evaluate, delay);
            return;
        }

        // Already running as the app, or known installed on this device.
        if (isRunningAsApp()) {
            safeSet(PWA_INSTALLED_KEY, '1');
            // The previous build recorded this; the rewrite dropped it, which
            // would have silently killed the only signal for how many devices
            // run standalone. evaluate() re-runs on every install-state
            // change, so it needs a guard or it fires repeatedly.
            if (!alreadyCountedRef.current) {
                alreadyCountedRef.current = true;
                recordOnServer('standalone_detected');
            }
            setShow(false);
            return;
        }
        if (isKnownInstalled()) { setShow(false); return; }
        if (snoozed()) { setShow(false); return; }

        // Show when the platform can actually do something:
        //   - Android / desktop Chrome / Edge once the event has landed
        //   - iOS at any point, because the path there is instructions
        if (isInstallable()) setShow(true);
    }, [authUser, pathname]);

    useEffect(() => {
        // Re-evaluate whenever install availability changes — this is what
        // makes Android work: beforeinstallprompt may land after mount.
        const unsub = subscribeInstallState(evaluate);

        // Both initial evaluation and availability events use the same
        // account-age gate. The remaining delay survives route changes.
        evaluate();

        return () => {
            unsub();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [evaluate]);

    const handleOpen = () => {
        setSheetOpen(true);
        setShow(false);
    };

    const handleLater = () => {
        setShow(false);
        snooze();
        recordOnServer('later');
    };

    const handleSheetClose = () => {
        setSheetOpen(false);
        if (isRunningAsApp() || isKnownInstalled()) {
            recordOnServer('installed');
        } else {
            // Closing the sheet without installing is still a decline, but a
            // soft one — snooze rather than a permanent block.
            snooze();
        }
    };

    if (installPromptDelay(authUser, pathname) !== 0) return null;

    if (sheetOpen) {
        return (
            <InstallAppSheet
                onClose={handleSheetClose}
                // Was hardcoded to the iPhone wording and shown to Android
                // users too, where it is untrue: Android receives push from a
                // plain browser tab. Say what is true for THIS device.
                reason={
                    isIos() && !isRunningAsApp()
                        ? 'Required on iPhone for notifications'
                        : 'Faster, and alerts land like any other app'
                }
            />
        );
    }

    if (!show) return null;

    const oneTap = canPromptInstall();

    return (
        <div data-startup-prompt="install" className="sp-pwa-install-bar" style={S.bar} role="dialog" aria-label="Install Smarter Poker">
            <div className="sp-pwa-install-spade" style={S.spade} aria-hidden="true">♠</div>
            <div className="sp-pwa-install-copy" style={S.copy}>
                <div style={promptEyebrow}>Smarter.Poker App</div>
                <div className="sp-pwa-install-title" style={S.title}><span style={{ display: 'block' }}>Your Seat...</span><span style={{ display: 'block' }}>Always Within Reach.</span></div>
                <div className="sp-pwa-install-sub" style={S.sub}>
                    {isIos() && !oneTap
                        ? 'Add To Your Home Screen For Seat Alerts And Messages.'
                        : 'Seat Alerts And Messages, Straight To Your Phone.'}
                </div>
            </div>
            <div className="sp-pwa-install-actions" style={S.actions}>
                <button className="sp-pwa-install-later" onClick={handleLater} style={S.later} type="button">Later</button>
                <button className="sp-pwa-install-action" onClick={handleOpen} style={S.install} type="button">
                    {oneTap ? 'Install' : 'Show Me'}
                </button>
            </div>
            <style>{promptInteractionCss + `
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                @media (max-width: 720px) {
                    .sp-pwa-install-bar {
                        bottom: calc(64px + env(safe-area-inset-bottom, 0px)) !important;
                        width: calc(100% - 16px) !important;
                        padding: 10px 12px !important;
                        gap: 10px !important;
                        border-radius: 12px !important;
                    }
                    .sp-pwa-install-spade { font-size: 24px !important; }
                    .sp-pwa-install-title { font-size: 15px !important; }
                    .sp-pwa-install-sub {
                        font-size: 12px !important;
                        line-height: 1.25;
                        white-space: normal;
                    }
                    .sp-pwa-install-actions { gap: 8px !important; width: 100%; justify-content: flex-end; }
                    .sp-pwa-install-bar { flex-wrap: wrap; }
                    .sp-pwa-install-copy { flex-basis: calc(100% - 70px); }
                    .sp-pwa-install-later, .sp-pwa-install-action {
                        min-height: 42px;
                        padding: 5px 10px !important;
                        border-radius: 12px !important;
                    }
                }
                @media (max-width: 360px) {
                    .sp-pwa-install-bar { gap: 7px !important; padding: 8px 9px !important; }
                    .sp-pwa-install-spade { display: none; }
                    .sp-pwa-install-title { font-size: 15px !important; }
                    .sp-pwa-install-sub { font-size: 12px !important; }
                    .sp-pwa-install-later, .sp-pwa-install-action {
                        min-height: 44px;
                        padding-inline: 8px !important;
                        font-size: 12px !important;
                    }
                }
            `}</style>
        </div>
    );
}

const S = {
    bar: {
        ...promptPanel, position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)', maxWidth: 560, boxSizing: 'border-box',
        padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16,
        zIndex: 9999, animation: 'slideUp 0.3s ease',
    },
    spade: { fontSize: 32, flexShrink: 0, color: '#b8e7ff', width: 48, height: 48,
        display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid #536676',
        background: 'linear-gradient(145deg, #334552, #101b25)',
        boxShadow: 'inset 0 1px 0 #8194a0, 0 4px 12px #020507' },
    copy: { flex: 1, minWidth: 0 },
    title: { fontWeight: 700, color: '#f3f7fc', fontSize: 16, lineHeight: 1.3, marginBottom: 5 },
    sub: { color: '#b3c2d1', fontSize: 12, lineHeight: 1.5 },
    actions: { display: 'flex', gap: 8, flexShrink: 0 },
    later: promptSecondary,
    install: promptPrimary,
};
