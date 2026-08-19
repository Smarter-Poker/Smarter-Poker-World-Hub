/**
 * reportClientCrash — ship an error-boundary crash somewhere it survives
 *
 * Called from componentDidCatch in HubErrorBoundary and PageErrorBoundary.
 * Does three things, each independently wrapped so no failure can turn one
 * dead section into a dead page:
 *
 *   1. POST to /api/client-crash, which writes public.client_crash_log.
 *      This is the only path that outlives the tab.
 *   2. Mirror into sessionStorage under 'sp-page-crash-log' so the user (or
 *      whoever is looking over their shoulder) can read it without a network
 *      round-trip.
 *   3. console.warn, for anyone with devtools open.
 *
 * Deliberately fire-and-forget: no await, keepalive so it still lands if the
 * user navigates away, and a per-page cap so a render loop cannot hammer the
 * endpoint.
 */

const MAX_REPORTS_PER_PAGE = 5;
let reportsSent = 0;

export function buildCrashPayload({ boundary, section, error, componentStack }) {
    const inIframe = (() => {
        try { return typeof window !== 'undefined' && window.parent !== window; }
        catch (_) { return true; } // cross-origin access throws => we are framed
    })();

    return {
        boundary,
        section: section || null,
        route: typeof window !== 'undefined' ? window.location.pathname : 'SSR',
        url: typeof window !== 'undefined' ? window.location.href : 'SSR',
        errorName: error?.name || 'Error',
        message: String(error?.message || error || '').slice(0, 1000),
        stack: String(error?.stack || '').slice(0, 6000),
        componentStack: String(componentStack || '').slice(0, 6000),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        embedded: inIframe,
        t: new Date().toISOString(),
    };
}

export function reportClientCrash({ boundary, section, error, componentStack, userId }) {
    const payload = buildCrashPayload({ boundary, section, error, componentStack });

    try {
        console.warn(
            `[${boundary === 'hub' ? 'HubErrorBoundary' : 'PageErrorBoundary'}] "${section || 'page'}" crashed —`,
            payload.message,
            componentStack
        );
    } catch (_) { /* console can be absent in exotic embedders */ }

    // sessionStorage mirror — readable immediately, dies with the tab
    try {
        if (typeof sessionStorage !== 'undefined') {
            const log = JSON.parse(sessionStorage.getItem('sp-page-crash-log') || '[]');
            log.push(payload);
            sessionStorage.setItem('sp-page-crash-log', JSON.stringify(log.slice(-10)));
        }
    } catch (_) { /* private mode / quota */ }

    // Durable sink
    try {
        if (typeof fetch !== 'function') return payload;
        if (reportsSent >= MAX_REPORTS_PER_PAGE) return payload;
        reportsSent += 1;
        fetch('/api/client-crash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({ ...payload, userId: userId || null }),
        }).catch(() => { /* reporting must never surface */ });
    } catch (_) { /* fetch unavailable or blocked */ }

    return payload;
}

export default reportClientCrash;
