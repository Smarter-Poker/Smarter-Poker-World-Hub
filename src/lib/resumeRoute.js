/**
 * THE APP REOPENS WHERE YOU LEFT IT (Dan, 2026-09-13)
 *
 * Dan, verbatim: "Smarter.poker app should ALWAYS open back up from exactly
 * where you left off and inside of on the page you left off on. Not just back
 * to the world hub."
 *
 * Why it did not. The installed PWA is described by public/manifest.json
 * (start_url /hub, display standalone). iOS relaunches a standalone web app
 * at start_url whenever it has discarded the page - after a phone call, a
 * memory squeeze, a day in the background - and nothing anywhere recorded
 * where the player actually was. A player who closed the app on a poker
 * table or a training drill came back to the World Hub every single time.
 *
 * The contract, shared with Club Arena (a separate SPA behind the
 * /hub/club-arena rewrite on the SAME origin, so it shares this storage):
 *
 *   localStorage['sp:last-route']    = JSON.stringify({ path, at })
 *   sessionStorage['sp:session-alive'] = '1'
 *
 * Both halves write the same two keys on every route change and whenever the
 * page is hidden. The RESTORE side lives in pages/_document.js as an inline
 * script that runs before React, because the whole point is to leave /hub
 * before it paints. sessionStorage survives in-app navigation and dies with a
 * killed PWA, which is what lets that script tell a launch from a navigation.
 *
 * What is never recorded: /auth (the login flow must not be a destination),
 * error pages, the bare /hub and the root - restoring to those is restoring to
 * nowhere - and anything carrying authError=, which is a sign-out landing.
 */

export const LAST_ROUTE_KEY = 'sp:last-route';
export const SESSION_ALIVE_KEY = 'sp:session-alive';

/** A route older than this is not "where you left off", it is history. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const NOT_RESUMABLE = [
    /^\/$/,
    /^\/hub\/?$/,
    /^\/auth(\/|$)/,
    /^\/(404|500|_error)(\/|$)/,
];

/**
 * True when `path` (an as-path: pathname plus optional query and hash) is a
 * place worth reopening the app on.
 */
export function isResumable(path) {
    if (typeof path !== 'string') return false;
    if (path.charAt(0) !== '/') return false;
    if (path.charAt(1) === '/') return false; // protocol-relative: an open redirect
    if (path.indexOf('authError=') !== -1) return false;
    const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
    for (const re of NOT_RESUMABLE) {
        if (re.test(pathname)) return false;
    }
    return true;
}

/**
 * Record `path` as the place to reopen on. A no-op for anything not
 * resumable, and never throws: storage can be absent, full, or refused in a
 * private window, and none of that is worth breaking a page over.
 */
export function recordLastRoute(path) {
    if (!isResumable(path)) return false;
    try {
        window.localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify({ path, at: Date.now() }));
    } catch (_err) {
        // storage unavailable
    }
    try {
        window.sessionStorage.setItem(SESSION_ALIVE_KEY, '1');
    } catch (_err) {
        // storage unavailable
    }
    return true;
}

function currentAsPath() {
    if (typeof window === 'undefined' || !window.location) return null;
    const { pathname, search, hash } = window.location;
    return `${pathname}${search || ''}${hash || ''}`;
}

/**
 * Wire the recorder to a Next.js router. Records the current location at
 * once, again after every completed client-side navigation, and again when
 * the page is hidden (pagehide fires on iOS when the app is backgrounded;
 * visibilitychange covers the browsers that skip it). Returns a cleanup
 * that removes all three listeners.
 */
export function installLastRouteRecorder(router) {
    if (typeof window === 'undefined') return () => {};

    const recordCurrent = () => {
        const path = currentAsPath();
        if (path) recordLastRoute(path);
    };
    const onRouteChangeComplete = (url) => {
        recordLastRoute(typeof url === 'string' ? url : currentAsPath());
    };
    const onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            recordCurrent();
        }
    };

    recordCurrent();

    const events = router && router.events;
    if (events && typeof events.on === 'function') {
        events.on('routeChangeComplete', onRouteChangeComplete);
    }
    window.addEventListener('pagehide', recordCurrent);
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
        if (events && typeof events.off === 'function') {
            events.off('routeChangeComplete', onRouteChangeComplete);
        }
        window.removeEventListener('pagehide', recordCurrent);
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisibilityChange);
        }
    };
}

export default {
    LAST_ROUTE_KEY,
    SESSION_ALIVE_KEY,
    MAX_AGE_MS,
    isResumable,
    recordLastRoute,
    installLastRouteRecorder,
};
