/**
 * chunkRecovery — shared stale-chunk detection and reload budgeting
 * ═══════════════════════════════════════════════════════════════════════════
 * After a Vercel deploy the previous build's JS chunks 404. A page that was
 * already open then dies the moment it touches a dynamic import.
 *
 * ChunkLoadRecovery listens on window 'error' and 'unhandledrejection' and
 * reloads. That works for an uncaught failure -- but a React error boundary
 * CATCHES the error, and a caught error never reaches those listeners. So the
 * one case where the user is staring at a dead screen ("... Temporarily
 * Unavailable") was precisely the case the recovery could not see.
 *
 * These helpers are the shared half. ChunkLoadRecovery uses them for the
 * window-level path; HubErrorBoundary and PageErrorBoundary use them from
 * componentDidCatch so a boundary-caught chunk error recovers the same way.
 * One reload budget, shared across all three, so they cannot loop against
 * each other.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const RELOAD_COUNTER_KEY = 'chunk_reload_count';
const RELOAD_TIMESTAMP_KEY = 'chunk_reload_timestamp';
const MAX_RELOADS = 2;
const RELOAD_WINDOW_MS = 60000;

export function isChunkError(error) {
    if (!error) return false;
    const msg = String(error.message || error).toLowerCase();
    return (
        msg.includes('loading chunk') ||
        msg.includes('chunkloaderror') ||
        msg.includes('loading css chunk') ||
        msg.includes('failed to fetch dynamically imported module') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('importing a module script failed') ||
        error.name === 'ChunkLoadError'
    );
}

/**
 * Returns true and spends one unit of the reload budget, or false when the
 * budget is exhausted. Two reloads per 60s -- enough to pick up a fresh build,
 * not enough to loop forever on a genuinely broken deploy.
 */
export function canAutoReload() {
    if (typeof window === 'undefined') return false;

    try {
        const count = parseInt(localStorage.getItem(RELOAD_COUNTER_KEY) || '0', 10);
        const timestamp = parseInt(localStorage.getItem(RELOAD_TIMESTAMP_KEY) || '0', 10);
        const now = Date.now();

        if (now - timestamp > RELOAD_WINDOW_MS) {
            localStorage.setItem(RELOAD_COUNTER_KEY, '1');
            localStorage.setItem(RELOAD_TIMESTAMP_KEY, String(now));
            return true;
        }

        if (count < MAX_RELOADS) {
            localStorage.setItem(RELOAD_COUNTER_KEY, String(count + 1));
            return true;
        }

        return false;
    } catch (_) {
        return false; // localStorage unavailable (private browsing)
    }
}

export default { isChunkError, canAutoReload };
