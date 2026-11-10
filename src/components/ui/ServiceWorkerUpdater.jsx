/**
 * SERVICE WORKER UPDATER — a new build takes over the NEXT navigation, and
 * never reloads the page you are on.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS DOES
 *
 * A new service worker installs, then sits in `waiting` until every client of
 * the old one goes away. On a phone, "every client" means fully closing the
 * app from the app switcher - not backgrounding it, not pull-to-refresh.
 * People do not do that, so the old worker keeps control indefinitely, and
 * `skipWaiting` cannot fix it from inside the worker that is stuck. Something
 * in the PAGE has to reach across and tell the waiting worker to activate.
 *
 * That is this component. On every load, whenever the page becomes visible,
 * and every 15 minutes while it stays visible, it:
 *   1. asks the browser to re-check for a new worker (registration.update()),
 *   2. if one is waiting, tells it to skip waiting.
 *
 * It does NOT reload the page. See below.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THERE IS NO RELOAD HERE (Dan, 2026-11-10, and the reason it is gone)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Dan: "YOU NEED TO FIX WHAT EVER IS CAUSING A PAGE TO AUTO REFRESH WHEN ITS
 * CLICKED AND LOADED... A FEW SECONDS LATER IT INSTANTLY 'RELOADS' AGAIN ON
 * ITS OWN. THIS HAPPENS 100% OF THE TIME INSIDE OF MESSENGER, AND ALOT OF
 * TIMES FOR THE OTHER PAGES."
 *
 * This component was the cause, and its own decision log proved it. Read from
 * a Messenger tab in Dan's browser on 2026-11-10, `sp_sw_decisions` held ten
 * consecutive `controllerchange` -> `reload` pairs, and the last pair sat 1ms
 * before the surviving document's `timeOrigin` with
 * `performance.getEntriesByType('navigation')[0].type === 'reload'` - the
 * page had reloaded itself into existence. `chunk_reload_count` was null
 * throughout, so ChunkLoadRecovery never fired: every one of those reloads
 * came from here.
 *
 * The mechanism, end to end:
 *   * `worker/index.js` calls `skipWaiting()` on install and `clients.claim()`
 *     on activate, so a newly installed worker takes control of every open
 *     document immediately and `controllerchange` fires on all of them.
 *   * `update()` runs on every page load, every visibilitychange and every
 *     15 minutes. The World Hub deploys many times a day, so a newly
 *     installed worker claims the page constantly.
 *   * The old handler read a controller replacement as "the HTML and chunks
 *     this page is running came from the OLD worker" and reloaded.
 *
 * THAT PREMISE IS NO LONGER TRUE, AND THAT IS THE WHOLE BUG. The premise was
 * written when `/_next/static` page JS and HTML were cached. They are not:
 * `next.config.js` runtimeCaching serves same-origin `document` requests,
 * `/_next/static/chunks/pages/*.js` and `/_next/data/*` with **NetworkOnly**
 * (Dan-fix/mobile-white-screen) precisely so that cached HTML can never
 * reference page chunks that a deploy has replaced. Framework/vendor chunks
 * are CacheFirst but content-hashed, so a changed file has a changed name.
 *
 * So every document this app serves came straight off the network and is
 * already the build production is serving. A worker claiming it does not make
 * it stale, and it was never stale to begin with. The reload could not pick up
 * a newer build than the one already running; all it could do was throw away
 * a rendered page the player had just asked for, a few seconds after they
 * asked for it. The stale-shell problem it was written for is fixed at the
 * caching layer, where it belongs.
 *
 * Promotion still matters and stays: a waiting worker that never activates is
 * what broke push registration (`navigator.serviceWorker.ready` waits for a
 * worker to CONTROL the page) and what left old release caches in place. The
 * new worker activates, retires its old caches, claims the page, and serves
 * the NEXT navigation. Nothing has to be thrown away for that to happen.
 *
 * If a deploy ever does leave this document asking for a chunk that is gone,
 * that is a real failure with a real signal, and `ChunkLoadRecovery` plus the
 * error boundaries already own it through the shared budget in
 * `src/lib/chunkRecovery.js`. A reload fired on a healthy page is not a net;
 * it is the defect.
 *
 * WHAT THIS DELIBERATELY NO LONGER NEEDS
 *
 * Four guards used to exist here only to decide WHEN it was safe to perform
 * that reload: a live Training gameplay route, an active server-issued Trivia
 * run, a ringing or connected call (`window.__spCallActive` / `sp-call-idle`),
 * and unsent typed text. Each was a correct answer to "do not reload NOW".
 * With no reload at all, every one of them is satisfied absolutely instead of
 * conditionally, so they are gone rather than left as unreachable code for the
 * next agent to rewire. Their laws moved with them in this same commit:
 * `__tests__/sw-update.test.mjs` and
 * `__tests__/messenger-calls-work.law.test.mjs` now pin the stronger rule -
 * this component contains no reload, so it cannot interrupt a call, a hand, a
 * graded run or a half-typed message.
 *
 * DO NOT ADD A RELOAD BACK HERE. If a page is genuinely serving stale assets,
 * fix the caching rule that let it, not the document the player is reading.
 */
import { useEffect } from 'react';

/**
 * The last decisions this tab's updater made, newest last, kept in
 * sessionStorage. Read by the upgrade test, and by anyone asking why an open
 * page did or did not take a build. This log is how the 2026-11-10 reload bug
 * was identified from a live browser, so it is worth keeping.
 */
const DECISION_LOG = 'sp_sw_decisions';
function noteDecision(decision) {
    try {
        const log = JSON.parse(sessionStorage.getItem(DECISION_LOG) || '[]');
        log.push({ at: Date.now(), decision });
        sessionStorage.setItem(DECISION_LOG, JSON.stringify(log.slice(-20)));
    } catch { /* storage unavailable */ }
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

        // A new worker is now in charge. It serves the NEXT navigation; this
        // document keeps the assets it already fetched from the network. There
        // is nothing to do but record it - see the header for why reloading
        // here was the defect rather than the recovery.
        const onControllerChange = () => {
            if (cancelled) return;
            noteDecision('controllerchange');
        };

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
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            document.removeEventListener('visibilitychange', onVisible);
            clearInterval(recheckTimer);
        };
    }, []);

    return null;
}
