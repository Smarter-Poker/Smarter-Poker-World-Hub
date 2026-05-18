/**
 * useVenueRealtime — Poll-based replacement for the global-venues-sync channel
 * ═══════════════════════════════════════════════════════════════════════════════
 * Previously opened a postgres_changes subscription on 5 tables with no row
 * filter, broadcasting every venue/tournament/series change to every visitor.
 *
 * Replacement: 5-minute setInterval that calls the onUpdate callback, which
 * triggers SWR to revalidate. Keeps identical interface — callers unchanged.
 *
 * Also preserves:
 *  - Immediate onUpdate() call on mount (same as the old first-subscribe skip)
 *  - Tab visibility recovery (missed updates while hidden)
 *  - triggerRefresh() for imperative refreshes (e.g. user action)
 */
import { useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function useVenueRealtime(onUpdate) {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    const missedUpdateRef = useRef(false);
    const intervalRef = useRef(null);

    const triggerRefresh = useCallback(() => {
        onUpdateRef.current?.(null);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Fire immediately on mount so callers get fresh data on first render
        // (mirrors old behaviour: SWR already fetches on mount, so we pass null
        //  here to mean "no specific payload — just revalidate")
        onUpdateRef.current?.(null);

        // Poll every 5 minutes
        intervalRef.current = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) {
                // Tab backgrounded — skip this tick but flag stale
                missedUpdateRef.current = true;
                return;
            }
            onUpdateRef.current?.(null);
        }, POLL_INTERVAL_MS);

        // Tab visibility recovery: catch up if we skipped ticks while hidden
        const handleVisibilityChange = () => {
            if (!document.hidden && missedUpdateRef.current) {
                console.debug('[VenueRealtime] Recovering missed poll from background state...');
                missedUpdateRef.current = false;
                onUpdateRef.current?.(null);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []);

    return triggerRefresh;
}
