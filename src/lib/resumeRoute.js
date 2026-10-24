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
 * error pages, the root, and anything carrying authError=, which is a
 * sign-out landing.
 *
 * THE HUB IS RECORDED, AND IT IS THE DEFAULT (Dan, 2026-10-24). Dan, verbatim:
 * "WHEN I ADD SMARTER.POKER TO THE DESKTOP, IT CONSTANTLY LOADS FROM THE
 * SETTINGS PAGE, INSTEAD OF THE HUB ... ANYTIME YOU 'REOPEN' THE HOMEPAGE APP
 * IT SHOULD OPEN TO THE LAST PAGE YOU WERE ON, AND THE DEFAULT BEING THE HUB
 * PAGE."
 *
 * Why it did that. The first version refused to RECORD /hub as well as refusing
 * to restore to it. The install sheet tells players to install from Settings,
 * so the last route on file at install time was /hub/settings - and because a
 * visit to the Hub was never written, nothing ever replaced it. Every launch
 * went to Settings, however many times the player went back to the Hub.
 *
 * So the two questions are now separate:
 *   isResumable(path)  - worth leaving start_url for on launch (never /hub:
 *                        the app is already there).
 *   isRecordable(path) - worth remembering as "where you were". /hub is, so
 *                        a player who closes the app on the Hub reopens on
 *                        the Hub.
 *
 * There is no age limit. "ANYTIME you reopen" means a week later too; with no
 * record at all (first launch, cleared storage) the app opens on start_url,
 * which is the Hub.
 */

export const LAST_ROUTE_KEY = 'sp:last-route';
export const SESSION_ALIVE_KEY = 'sp:session-alive';

/** The default destination, and the manifest's start_url. */
export const HUB_PATH = '/hub';

const NOT_RECORDABLE = [
    /^\/$/,
    /^\/auth(\/|$)/,
    /^\/(404|500|_error)(\/|$)/,
];

function pathnameOf(path) {
    return path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
}

/**
 * True when `path` is a place worth remembering as where the player was:
 * every real page, the Hub included.
 */
export function isRecordable(path) {
    if (typeof path !== 'string') return false;
    if (path.charAt(0) !== '/') return false;
    if (path.charAt(1) === '/') return false; // protocol-relative: an open redirect
    if (path.indexOf('authError=') !== -1) return false;
    const pathname = pathnameOf(path);
    for (const re of NOT_RECORDABLE) {
        if (re.test(pathname)) return false;
    }
    return true;
}

/**
 * True when `path` (an as-path: pathname plus optional query and hash) is a
 * place worth leaving start_url for on launch. The bare Hub is recordable but
 * not resumable: a launch is already standing on it.
 */
export function isResumable(path) {
    if (!isRecordable(path)) return false;
    return pathnameOf(path) !== HUB_PATH;
}

/**
 * Record `path` as the place to reopen on. A no-op for anything not
 * recordable, and never throws: storage can be absent, full, or refused in a
 * private window, and none of that is worth breaking a page over.
 */
export function recordLastRoute(path) {
    if (!isRecordable(path)) return false;
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
    HUB_PATH,
    isRecordable,
    isResumable,
    recordLastRoute,
    installLastRouteRecorder,
};
