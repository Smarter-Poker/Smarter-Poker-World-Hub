/**
 * 🥚 useEasterEggSweep — the client half of easter egg discovery
 * ═══════════════════════════════════════════════════════════════════════════
 * Asks the server to re-check which easter eggs this user has earned, and
 * celebrates whatever comes back. The egg catalog is 67 achievements deep and,
 * until now, nothing in the app could trigger a single one of them.
 *
 * WHAT THIS HOOK DELIBERATELY DOES NOT DO
 *   It does not decide that an egg was earned, name an egg, or send an amount.
 *   It posts an empty authenticated request to /api/rewards/eggs/evaluate and
 *   renders the answer. Every proof runs server-side against the database (see
 *   src/lib/rewards/eggVerifiers.js). A client that cannot make a claim cannot
 *   forge one — which matters here, because the egg keys ship in the JS bundle
 *   and the eggs are worth up to the full 500 ◆ monthly cap.
 *
 * WHEN IT SWEEPS
 *   On sign-in, and on the `sp-egg-check` window event that game surfaces fire
 *   after something that could plausibly unlock an egg (session finished, level
 *   passed, referral qualified, big balance change). Sweeps are throttled per
 *   tab so a chatty page cannot hammer the endpoint; the server rate-limits
 *   independently, and re-sweeping an owned egg is idempotent and pays nothing.
 *
 * USAGE
 *   Mounted once, globally, by <EasterEggWatcher /> in pages/_app.js. Anywhere
 *   that finishes a scoring event can nudge it:
 *       window.dispatchEvent(new Event('sp-egg-check'))
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef } from 'react';
import { getFreshAccessToken } from '../lib/authUtils';
import toast from '../stores/toastStore';
import { busEmit } from '../engine/EventBus';

/** Minimum gap between sweeps from one device. */
const SWEEP_THROTTLE_MS = 5 * 60 * 1000;

/** Event any surface can fire to request a sweep. */
export const EGG_CHECK_EVENT = 'sp-egg-check';

/**
 * PERF (2026-08-24): the throttle timestamp used to live in a useRef, which is
 * re-created on every mount - and this hook mounts globally, so it remounts on
 * navigation. Combined with the mount sweep passing force:true, effectively
 * every session start fired a full sweep: up to 40 verifiers, each 1-3 awaited
 * Supabase queries. Persisting the timestamp in localStorage makes the
 * five-minute throttle mean what it says, per user, across mounts and tabs.
 */
const SWEEP_TS_KEY = 'sp-egg-sweep-ts';

function readLastSweep(userId) {
    if (typeof window === 'undefined' || !userId) return 0;
    try {
        const raw = window.localStorage.getItem(`${SWEEP_TS_KEY}:${userId}`);
        const ts = raw ? Number(raw) : 0;
        return Number.isFinite(ts) ? ts : 0;
    } catch (_) {
        // Private browsing / storage disabled - fall back to "never swept".
        // Losing the throttle is strictly better than losing the sweep.
        return 0;
    }
}

function writeLastSweep(userId, ts) {
    if (typeof window === 'undefined' || !userId) return;
    try {
        window.localStorage.setItem(`${SWEEP_TS_KEY}:${userId}`, String(ts));
    } catch (_) {
        // Storage unavailable - the in-memory ref still throttles this mount.
    }
}

export default function useEasterEggSweep(userId) {
    const lastSweepRef = useRef(0);
    const inFlightRef = useRef(false);

    const sweep = useCallback(async ({ force = false } = {}) => {
        if (!userId) return null;
        if (inFlightRef.current) return null;
        const lastSweep = Math.max(lastSweepRef.current, readLastSweep(userId));
        if (!force && Date.now() - lastSweep < SWEEP_THROTTLE_MS) return null;

        inFlightRef.current = true;
        try {
            // getFreshAccessToken is the repo's sanctioned client-side token
            // source: it reads the stored session and refreshes it when stale,
            // without the network round-trip the auth guard exists to prevent.
            const token = await getFreshAccessToken();
            // No token means no identity; the endpoint would 401 anyway.
            if (!token) return null;

            const res = await fetch('/api/rewards/eggs/evaluate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: '{}',
            });
            const sweptAt = Date.now();
            lastSweepRef.current = sweptAt;
            writeLastSweep(userId, sweptAt);

            if (!res.ok) return null;
            const data = await res.json();
            const awarded = Array.isArray(data?.awarded) ? data.awarded : [];
            if (!awarded.length) return data;

            for (const egg of awarded) {
                toast.success(
                    `🥚 ${egg.name} unlocked — +${egg.diamonds} 💎`,
                    6000,
                );
            }
            if (data.totalDiamonds > 0) {
                busEmit.diamondsEarned(data.totalDiamonds, 'Easter egg');
            }
            return data;
        } catch (err) {
            // A failed sweep is never worth interrupting the user for — the
            // eggs stay claimable, and the next sweep picks them up.
            console.warn('[EggSweep] check failed:', err?.message || err);
            return null;
        } finally {
            inFlightRef.current = false;
        }
    }, [userId]);

    // Sweep once when a user becomes known (sign-in, hard reload while signed in).
    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        // Slight delay so the sweep never competes with first paint.
        // NOT forced (2026-08-24): this used to pass force:true, which bypassed
        // the throttle on every single mount. The persisted timestamp above now
        // decides - a genuine first sign-in still sweeps immediately, a route
        // change five seconds later does not.
        const t = setTimeout(() => { if (!cancelled) sweep(); }, 4000);
        return () => { cancelled = true; clearTimeout(t); };
    }, [userId, sweep]);

    // Sweep on demand when a game surface says something scoreable happened.
    useEffect(() => {
        if (typeof window === 'undefined' || !userId) return undefined;
        const handler = () => { sweep(); };
        window.addEventListener(EGG_CHECK_EVENT, handler);
        return () => window.removeEventListener(EGG_CHECK_EVENT, handler);
    }, [userId, sweep]);

    return sweep;
}

/** Fire-and-forget nudge for any surface that just finished something scoreable. */
export function requestEggCheck() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(EGG_CHECK_EVENT));
}
