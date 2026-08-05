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

/** Minimum gap between sweeps from one tab. */
const SWEEP_THROTTLE_MS = 5 * 60 * 1000;

/** Event any surface can fire to request a sweep. */
export const EGG_CHECK_EVENT = 'sp-egg-check';

export default function useEasterEggSweep(userId) {
    const lastSweepRef = useRef(0);
    const inFlightRef = useRef(false);

    const sweep = useCallback(async ({ force = false } = {}) => {
        if (!userId) return null;
        if (inFlightRef.current) return null;
        if (!force && Date.now() - lastSweepRef.current < SWEEP_THROTTLE_MS) return null;

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
            lastSweepRef.current = Date.now();

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
        const t = setTimeout(() => { if (!cancelled) sweep({ force: true }); }, 4000);
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
