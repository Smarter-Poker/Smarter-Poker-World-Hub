const ACTIVE_RUN_ATTRIBUTE = 'data-trivia-active-run';
const ACTIVE_RUN_COUNT_ATTRIBUTE = 'data-trivia-active-run-count';

const activeRunOwners = new Set();
const activeRunListeners = new Set();

function publishActiveRunState(wasActive) {
    const active = activeRunOwners.size > 0;

    try {
        const root = typeof document === 'undefined' ? null : document.documentElement;
        if (root) {
            if (active) {
                root.setAttribute(ACTIVE_RUN_ATTRIBUTE, 'true');
                root.setAttribute(ACTIVE_RUN_COUNT_ATTRIBUTE, String(activeRunOwners.size));
            } else {
                root.removeAttribute(ACTIVE_RUN_ATTRIBUTE);
                root.removeAttribute(ACTIVE_RUN_COUNT_ATTRIBUTE);
            }
        }
    } catch {
        // The in-memory signal remains authoritative when DOM access is denied.
    }

    if (active === wasActive) return;
    for (const listener of activeRunListeners) {
        try { listener(active); } catch { /* one observer cannot break custody */ }
    }
}

/**
 * Acquire one live Trivia-run lease. Each hook instance owns its own lease, so
 * unmounting or settling one run cannot clear another mounted run's signal.
 */
export function acquireActiveTriviaRun() {
    const owner = {};
    const wasActive = activeRunOwners.size > 0;
    activeRunOwners.add(owner);
    publishActiveRunState(wasActive);

    let released = false;
    return () => {
        if (released) return;
        released = true;
        const activeBeforeRelease = activeRunOwners.size > 0;
        activeRunOwners.delete(owner);
        publishActiveRunState(activeBeforeRelease);
    };
}

export function hasActiveTriviaRun() {
    return activeRunOwners.size > 0;
}

/** Notify only when the aggregate signal crosses zero. */
export function subscribeToActiveTriviaRuns(listener) {
    if (typeof listener !== 'function') return () => {};
    activeRunListeners.add(listener);
    return () => activeRunListeners.delete(listener);
}
