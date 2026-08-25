/**
 * PWA INSTALL — one helper, every platform.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS (2026-08-25, Dan)
 * ---------------------------------
 * Installing is not a nice-to-have here. It is the gate on push
 * notifications: iOS exposes no Push API to Safari at all, and Android
 * treats an installed app's notifications very differently from a tab's.
 * Production had 0 active push subscriptions and 1,376 notifications
 * skipped for `no_subscription`, so the install path is load-bearing.
 *
 * TWO REAL BUGS THIS REPLACES
 *
 * 1. THE LISTENER WAS REGISTERED TOO LATE (Android/Chrome/Edge).
 *    PWAInstallPrompt attached its `beforeinstallprompt` listener inside
 *    the .then() of an async server round-trip. Chrome fires that event
 *    once, early, usually before that fetch resolves — so the listener
 *    was attached after the only event it would ever get. The banner
 *    could not appear, and no error was produced. Capturing at MODULE
 *    scope, at import time, is the documented way to hold it.
 *
 * 2. THE SAME .then() RETURNED ITS CLEANUP INTO A PROMISE.
 *    `return () => window.removeEventListener(...)` inside a .then()
 *    callback returns to the promise chain, not to useEffect. React never
 *    saw it, so the listener was never removed either.
 *
 * iOS Safari never fires `beforeinstallprompt` at all — Apple has no
 * install API — so there the honest answer is 'ios-instructions' and the
 * caller shows the Share -> Add to Home Screen steps.
 */

const INSTALLED_KEY = 'sp_pwa_installed';

/**
 * The key the PREVIOUS build wrote when a user installed.
 *
 * Renaming the key orphaned it: anyone who installed under the old build
 * carries `pwa_installed`, nothing new looked at it, and they were treated
 * as never-installed and re-offered an app they already had. Read-only —
 * nothing writes the legacy name any more. A rename is a stale-localStorage
 * bug unless the old name is read on the way past.
 */
const LEGACY_INSTALLED_KEY = 'pwa_installed';

/** @type {Event & { prompt: () => Promise<void>, userChoice: Promise<{outcome: string}> } | null} */
let deferred = null;
const subscribers = new Set();

function notify() {
    subscribers.forEach((fn) => {
        try { fn(); } catch { /* a bad subscriber must not break the rest */ }
    });
}

function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

// Module scope, at import time. See bug 1 above — this MUST run before
// Chrome fires the event, which a component effect cannot guarantee.
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        // Chrome/Edge/Android fire this ONLY when the app is installable and
        // not already installed. Preventing the default suppresses Chrome's
        // own mini-infobar so our UI owns the moment.
        e.preventDefault();
        deferred = e;
        notify();
    });

    window.addEventListener('appinstalled', () => {
        deferred = null;
        safeSet(INSTALLED_KEY, '1');
        notify();
    });
}

/** Subscribe to install-availability changes. Returns an unsubscribe fn. */
export function subscribeInstallState(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}

/** True when a native install can be triggered right now (Android/desktop). */
export function canPromptInstall() {
    return deferred !== null;
}

/** The page is running as the installed app (standalone / iOS home screen). */
export function isRunningAsApp() {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
        window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches === true ||
        // iOS Safari's non-standard flag, still the only signal on older iOS.
        window.navigator.standalone === true
    );
}

/** We have previously confirmed an install on this device/profile. */
export function isKnownInstalled() {
    if (typeof window === 'undefined') return false;
    if (isRunningAsApp()) return true;
    if (safeGet(INSTALLED_KEY) === '1') return true;

    // The old build stored the string 'true', not '1', so this must be a
    // truthy check rather than an equality or the bug survives. Migrate it
    // forward so the lookup costs nothing next visit.
    const legacy = safeGet(LEGACY_INSTALLED_KEY);
    if (legacy) {
        safeSet(INSTALLED_KEY, '1');
        return true;
    }
    return false;
}

/** iOS (including iPadOS, which reports as MacIntel with touch points). */
export function isIos() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

/**
 * iOS Safari specifically. Add to Home Screen exists ONLY in Safari — the
 * iOS Chrome/Firefox/Edge share sheets do not offer it, so telling a
 * Chrome-on-iPhone user to "tap Share" sends them somewhere with no such
 * option. Callers should say "open this in Safari first".
 */
export function isIosSafari() {
    if (!isIos()) return false;
    const ua = navigator.userAgent || '';
    return /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/** iOS, but in a browser that cannot install at all. */
export function isIosNonSafari() {
    return isIos() && !isIosSafari();
}

/**
 * Trigger the native install where the platform allows it, and report
 * honestly where it does not.
 *
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'|'ios-instructions'|'ios-needs-safari'|'already-installed'>}
 */
export async function triggerInstall() {
    if (isRunningAsApp()) return 'already-installed';

    if (deferred) {
        try {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            // The event is single-use; Chrome will fire a fresh one if the
            // user declines and the app stays installable.
            deferred = null;
            if (choice?.outcome === 'accepted') safeSet(INSTALLED_KEY, '1');
            notify();
            return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
        } catch {
            deferred = null;
            notify();
            return 'unavailable';
        }
    }

    if (isIosNonSafari()) return 'ios-needs-safari';
    if (isIos()) return 'ios-instructions';
    return 'unavailable';
}

/**
 * Can this device install at all? Used to decide whether offering an
 * install affordance is honest. Android/desktop before the event has
 * fired still counts, because Chrome may fire it a moment later.
 */
export function isInstallable() {
    if (typeof window === 'undefined') return false;
    if (isRunningAsApp()) return false;
    return Boolean(deferred) || isIos();
}

export const PWA_INSTALLED_KEY = INSTALLED_KEY;
