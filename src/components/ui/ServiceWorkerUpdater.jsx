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
 *
 * THE FIRST-CLAIM DOUBLE LOAD (Dan, 2026-09-01: "the world hub page is doing
 * this weird glitch where it loads, then glitches and 'reloads' a 2nd time")
 *
 * Step 3 above says "reloads exactly once when control CHANGES". There is a
 * second way controllerchange fires that is not a change at all: the very
 * first visit. The custom root worker skips waiting, retires release-scoped
 * caches, and only then claims clients, so on a page that loaded with NO
 * controller the new worker still takes control during that visit -- and
 * controllerchange fires on a document whose HTML and chunks came straight
 * off the network.
 * There is no old build to escape, and the reload bought nothing: it simply
 * threw the rendered page away and drew it again.
 *
 * That is one visible double load for every uncontrolled entry -- a new
 * device, cleared site data, a private window, or any session after the
 * worker was evicted -- and the sessionStorage cooldown does not suppress it,
 * because a fresh session starts with an empty sessionStorage by definition.
 *
 * Fix: remember whether this document had a controller when the effect
 * mounted. Reload only on a genuine REPLACEMENT (had one, now a different
 * one). The uncontrolled -> controlled transition is recorded and ignored.
 */
import { useEffect } from 'react';
import {
    hasActiveTriviaRun,
    subscribeToActiveTriviaRuns,
} from '../../lib/trivia/activeRunSignal.mjs';
import { hasUnsentText, trackTyping } from '../../lib/pwa/unsentText.mjs';

const RELOAD_GUARD = 'sp_sw_reloaded_at';
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * Never destroy a live decision by reloading underneath the player. The new
 * worker already controls the next navigation after `controllerchange`; the
 * current document can safely finish its session on the assets it loaded.
 */
function isLiveTrainingGameplaySession() {
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

/**
 * The last decisions this tab's updater made, newest last, kept in
 * sessionStorage so they survive the reload they lead to. Read by the upgrade
 * test and by anyone asking why an open page did or did not take a build.
 */
const DECISION_LOG = 'sp_sw_decisions';
function noteDecision(decision) {
    try {
        const log = JSON.parse(sessionStorage.getItem(DECISION_LOG) || '[]');
        log.push({ at: Date.now(), decision });
        sessionStorage.setItem(DECISION_LOG, JSON.stringify(log.slice(-20)));
    } catch { /* storage unavailable */ }
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
        let triviaReloadDeferred = false;
        let callReloadDeferred = false;
        let draftTimer = null;
        const typing = trackTyping(document);

        // Whether this document was already being served by a worker. Captured
        // BEFORE anything is promoted, because it is the only thing that
        // distinguishes "a newer build took over" from "a worker took over for
        // the first time", and only the first of those is worth a reload.
        const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

        const reloadForUpdatedWorker = () => {
            if (cancelled) return;
            if (recentlyReloaded()) { noteDecision('cooldown'); return; }
            noteDecision('reload');
            markReloaded();
            window.location.reload();
        };

        const onControllerChange = () => {
            if (cancelled) return;
            // FIRST CLAIM, NOT AN UPDATE. This page loaded uncontrolled, so its
            // HTML and chunks came from the network and are already current.
            // Reloading here is the double load Dan reported and it corrects
            // nothing. The new worker serves the NEXT navigation either way.
            noteDecision('controllerchange');
            if (!hadControllerAtLoad) noteDecision('first-claim');
            if (!hadControllerAtLoad) return;
            if (isLiveTrainingGameplaySession()) { noteDecision('held-training'); return; }
            // A server-issued Trivia session is an actual live decision, not a
            // route guess. Let it settle or unmount before replacing its page.
            if (hasActiveTriviaRun()) {
                triviaReloadDeferred = true;
                noteDecision('held-trivia');
                return;
            }
            // Never reload under a ringing or connected call: it would drop
            // it. CallProvider announces sp-call-idle when the call is over.
            if (typeof window !== 'undefined' && window.__spCallActive) {
                callReloadDeferred = true;
                noteDecision('held-call');
                return;
            }
            // Never wipe text the person typed and has not sent. Look again
            // every five seconds and reload once every box is empty (sent or
            // cleared) and nothing else is holding the page.
            if (hasUnsentText(typing.typed)) {
                noteDecision('held-draft');
                if (!draftTimer) {
                    draftTimer = setInterval(() => {
                        if (cancelled || hasUnsentText(typing.typed) || window.__spCallActive || hasActiveTriviaRun()) return;
                        clearInterval(draftTimer);
                        draftTimer = null;
                        reloadForUpdatedWorker();
                    }, 5000);
                }
                return;
            }
            // A different worker is now in charge, so the HTML and chunks this
            // page is running came from the OLD one. Reload to pick up the new
            // build. Once per minute at most.
            reloadForUpdatedWorker();
        };

        const unsubscribeFromTriviaRuns = subscribeToActiveTriviaRuns((active) => {
            if (active || !triviaReloadDeferred) return;
            triviaReloadDeferred = false;
            reloadForUpdatedWorker();
        });

        const onCallIdle = () => {
            if (!callReloadDeferred) return;
            callReloadDeferred = false;
            // The call is over, but a typed reply still holds the page.
            if (hasUnsentText(typing.typed)) { onControllerChange(); return; }
            reloadForUpdatedWorker();
        };
        window.addEventListener('sp-call-idle', onCallIdle);

        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        // A PAGE THAT STAYS OPEN STILL UPDATES (2026-10-31). The check below
        // ran only when a page loaded, so an installed app resumed from the
        // background kept running the build it first loaded until something
        // forced a full reload. Look again whenever the page becomes visible,
        // and every 15 minutes while it stays visible.
        const recheck = async () => {
            try {
                const reg = await navigator.serviceWorker.getRegistration('/');
                if (!reg || cancelled) return;
                await reg.update();
                noteDecision(reg.installing ? 'update-found' : reg.waiting ? 'update-waiting' : 'update-none');
                promote(reg);
                const installing = reg.installing;
                if (installing) installing.addEventListener('statechange', () => { noteDecision(`worker-${installing.state}`); if (installing.state === 'installed') promote(reg); });
            } catch { /* offline or refused; the next look will try again */ }
        };
        const onVisible = () => { if (document.visibilityState === 'visible') void recheck(); };
        document.addEventListener('visibilitychange', onVisible);
        const recheckTimer = setInterval(() => { if (document.visibilityState === 'visible') void recheck(); }, 15 * 60 * 1000);

        (async () => {
            try {
                let reg = await navigator.serviceWorker.getRegistration('/');

                // next-pwa still builds /sw.js, but this component owns its
                // registration so browsers that refuse Service Workers can
                // return `undefined` without tripping Workbox Window's
                // unconditional `registration.waiting` access. Never register
                // the generated production worker during local development.
                if (!reg && !cancelled && process.env.NODE_ENV === 'production') {
                    try {
                        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                    } catch {
                        // Private browsing, policy controls, or an unavailable
                        // worker must not become an unhandled page rejection.
                        return;
                    }
                }
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
            unsubscribeFromTriviaRuns();
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            window.removeEventListener('sp-call-idle', onCallIdle);
            document.removeEventListener('visibilitychange', onVisible);
            clearInterval(recheckTimer);
            if (draftTimer) clearInterval(draftTimer);
            typing.stop();
        };
    }, []);

    return null;
}
