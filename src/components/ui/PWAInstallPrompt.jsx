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
import InstallAppSheet from '../pwa/InstallAppSheet';

const DISMISS_UNTIL_KEY = 'sp_pwa_prompt_snooze_until';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SHOW_DELAY_MS = 25_000; // let people actually land before selling them an app

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

    const evaluate = useCallback(() => {
        if (!mountedRef.current) return;

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
    }, []);

    useEffect(() => {
        // Re-evaluate whenever install availability changes — this is what
        // makes Android work: beforeinstallprompt may land after mount.
        const unsub = subscribeInstallState(evaluate);

        // And evaluate once after a delay, for iOS (no event will ever come)
        // and for the case where the event fired before this component
        // mounted, which the module-scope capture in pwaInstall.js retains.
        timerRef.current = setTimeout(evaluate, SHOW_DELAY_MS);

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
        <div style={S.bar} role="dialog" aria-label="Install Smarter Poker">
            <div style={S.spade} aria-hidden="true">♠</div>
            <div style={S.copy}>
                <div style={S.title}>Install Smarter.Poker</div>
                <div style={S.sub}>
                    {isIos() && !oneTap
                        ? 'Add to your Home Screen to get alerts'
                        : 'Get seat alerts and messages on your phone'}
                </div>
            </div>
            <div style={S.actions}>
                <button onClick={handleLater} style={S.later} type="button">Later</button>
                <button onClick={handleOpen} style={S.install} type="button">
                    {oneTap ? 'Install' : 'Show Me'}
                </button>
            </div>
            <style>{`
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(20px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

const S = {
    bar: {
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)', maxWidth: 420,
        background: 'linear-gradient(135deg, #1a1f2e, #0f1318)',
        border: '1px solid rgba(255,215,0,0.3)', borderRadius: 16,
        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
        zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.3s ease',
    },
    spade: { fontSize: 36, flexShrink: 0 },
    copy: { flex: 1, minWidth: 0 },
    title: { fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 2 },
    sub: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
    actions: { display: 'flex', gap: 8, flexShrink: 0 },
    later: {
        background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8, color: 'rgba(255,255,255,0.5)', padding: '6px 12px',
        fontSize: 12, cursor: 'pointer',
    },
    install: {
        background: 'linear-gradient(135deg, #FFD700, #FF8C00)', border: 'none',
        borderRadius: 8, color: '#0a0a15', padding: '6px 14px',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
    },
};
