/**
 * SERVICE WORKER UPDATER — the reason "nothing changed" kept being true.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25, repeatedly: "LITERALLY NOTHING CHANGED, PUSHED OR
 * PUBLISHED." Every time, the code WAS merged and WAS live on the server —
 * verified against production, not assumed. His device was serving a cached
 * app shell from a service worker that had taken control weeks earlier and
 * was never replaced.
 *
 * WHY THE APP GOT STUCK, AND WHY IT COULD NOT UNSTICK ITSELF
 *
 * A new service worker installs, then sits in `waiting` until every client
 * of the old one goes away. On a phone, "every client" means fully closing
 * the app from the app switcher — not backgrounding it, not pull-to-refresh.
 * People do not do that, so the old worker kept control indefinitely.
 *
 * next.config.js caches /_next/static with CacheFirst (correct on its own —
 * webpack hashes the filename when content changes). But the HTML that names
 * those new hashed files is itself served by the old worker, so the browser
 * never learns the new filenames exist. The app is frozen at whatever build
 * was current when the worker took over.
 *
 * The obvious fix — skipWaiting in the worker — CANNOT DEPLOY ITSELF. It
 * lives in the new worker, and the new worker is the one that cannot take
 * over. The old worker predates it and will never call it. Something in the
 * PAGE has to reach across and tell the waiting worker to activate.
 *
 * That is this component. On every load it:
 *   1. asks the browser to re-check for a new worker (registration.update()),
 *   2. if one is waiting, tells it to skip waiting,
 *   3. reloads exactly once when control actually changes.
 *
 * The reload is guarded by a sessionStorage flag: without it, a worker that
 * activates and immediately claims can drive controllerchange -> reload ->
 * controllerchange in a loop, which is a worse bug than a stale build.
 */
import { useEffect } from 'react';

const RELOAD_GUARD = 'sp_sw_reloaded_at';
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * Never destroy a live decision by reloading underneath the player. The new
 * worker already controls the next navigation after `controllerchange`; the
 * current document can safely finish its session on the assets it loaded.
 */
function isLiveGameplaySession() {
    try {
        return /^\/hub\/training\/(?:arena|play)\//.test(window.location.pathname);
    } catch {
        // If location is unavailable, preserving the current document is the
        // only fail-closed choice.
        return true;
    }
}

function recentlyReloaded() {
    try {
        const at = Number(sessionStorage.getItem(RELOAD_GUARD) || 0);
        return Date.now() - at < RELOAD_COOLDOWN_MS;
    } catch {
        // sessionStorage throws in some private modes. Treat as "yes, recently"
        // so a storage failure can never produce a reload loop.
        return true;
    }
}

function markReloaded() {
    try { sessionStorage.setItem(RELOAD_GUARD, String(Date.now())); } catch { /* ignore */ }
}

/** Ask a waiting worker to take over now rather than at some future cold start. */
function promote(reg) {
    if (reg?.waiting) {
        try { reg.waiting.postMessage({ type: 'SP_SKIP_WAITING' }); } catch { /* ignore */ }
    }
}

export default function ServiceWorkerUpdater() {
    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;

        let cancelled = false;

        const onControllerChange = () => {
            if (cancelled) return;
            if (isLiveGameplaySession()) return;
            // A different worker is now in charge, so the HTML and chunks this
            // page is running came from the OLD one. Reload to pick up the new
            // build. Once per minute at most.
            if (recentlyReloaded()) return;
            markReloaded();
            window.location.reload();
        };

        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        (async () => {
            try {
                const reg = await navigator.serviceWorker.getRegistration('/');
                if (!reg || cancelled) return;

                // Anything already waiting from a previous visit.
                promote(reg);

                // And check the network for something newer. This is the call
                // that was missing entirely: without it the browser only looks
                // for a new worker on its own schedule, which on an installed
                // PWA can be a very long time.
                try { await reg.update(); } catch { /* offline; try next load */ }
                if (cancelled) return;

                promote(reg);

                // A worker found by update() arrives as `installing` and only
                // becomes `waiting` once it finishes. Catch that transition.
                const installing = reg.installing;
                if (installing) {
                    installing.addEventListener('statechange', () => {
                        if (installing.state === 'installed') promote(reg);
                    });
                }
            } catch {
                // Never let update machinery break the page it is updating.
            }
        })();

        return () => {
            cancelled = true;
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, []);

    return null;
}
