/**
 * GAME COST POPUP - Club Arena Console Design
 * One-time notification shown to non-VIP users about per-game diamond costs
 * Dismisses permanently via localStorage + Supabase
 *
 * Uses the shared image-backed Trivia console with measured live-copy zones
 * and painted action plates.
 *
 * 2026-05-07 - VIP-status race fix:
 *   Treat `isVip == null/undefined` as "not yet known, never show".
 *   Previously, callers that initialised VIP state to `false` while an
 *   async DiamondEngine.isVIP() call was in-flight would mount this
 *   popup with `isVip={false}`. The 2500ms internal delay was meant to
 *   absorb the async window, but if the network/RLS check exceeded that
 *   delay the popup briefly flashed for VIP users before the parent
 *   re-render unmounted it.
 *   Callers can now pass `isVip={null}` (or omit) until VIP status has
 *   actually resolved. The component does an explicit `=== false` check
 *   to decide visibility and to gate the dismissal effect, so no popup
 *   work happens before the answer is in.
 */

import { useState, useEffect } from 'react';
import { checkPopupDismissed, dismissPopup, GAME_COST } from '../../lib/gates/perGameGate';
import TriviaConsoleDialog from '../trivia/console/TriviaConsoleDialog';

/**
 * @param {Object} props
 * @param {string} props.userId - User UUID
 * @param {string} props.pageKey - Unique page identifier (e.g., 'training', 'trivia_cash')
 * @param {boolean|null|undefined} props.isVip - VIP flag. true → never show. false → show after dismissal check + delay. null/undefined → status not yet known, never show.
 * @param {number} [props.cost] - Override default GAME_COST
 * @param {Function} [props.onDismiss] - Callback when popup is dismissed
 */
export default function GameCostPopup({ userId, pageKey, featureKey, isVip, cost = GAME_COST, onDismiss }) {
    const key = pageKey || featureKey;
    const [show, setShow] = useState(false);
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        // Guard: never show for VIP users, when status is still unknown, or when userId hasn't resolved.
        // 2026-05-07 - explicit `isVip !== false` fixes the race where callers
        // initialise VIP state to `false` while DiamondEngine.isVIP() is still
        // running. We ONLY proceed when isVip is the literal boolean `false`.
        if (isVip !== false || !userId) return;
        // Phase 72: cancellation guard prevents setShow / setDismissed from
        // firing on an unmounted component when the user navigates away
        // during the async checkPopupDismissed or the 2500ms delay.
        let cancelled = false;
        let showTimer = null;
        async function checkDismissal() {
            const isDismissed = await checkPopupDismissed(userId, key);
            if (cancelled) return;
            if (!isDismissed) {
                setDismissed(false);
                // Delay 2500ms so any in-flight VIP check has a chance to flip
                // the parent state and unmount us before we show.
                showTimer = setTimeout(() => {
                    if (!cancelled) setShow(true);
                }, 2500);
            }
        }
        checkDismissal();
        return () => {
            cancelled = true;
            if (showTimer) clearTimeout(showTimer);
        };
    }, [userId, key, isVip]);

    const handleDismiss = async () => {
        try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        setShow(false);
        setDismissed(true);
        await dismissPopup(userId, key);
        onDismiss?.();
    };

    const handleUpgrade = () => {
        try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        handleDismiss();
        window.top.location.href = '/hub/diamond-store#vip';
    };

    // Final visibility gate. `isVip !== false` covers both `true` (real VIP)
    // and `null/undefined` (status not yet known). Both must keep popup hidden.
    if (isVip !== false || dismissed || !show) return null;

    return (
        <TriviaConsoleDialog
            open={show}
            onClose={handleDismiss}
            eyebrow="Diamond Entry Notice"
            title="Table Entry"
            subtitle={`Each Game Costs ${cost} Diamonds`}
            pill="Non-VIP"
            secondaryAction={{ label: 'Got It', onClick: handleDismiss }}
            primaryAction={{ label: 'Upgrade To VIP', onClick: handleUpgrade }}
        >
            <p className="trivia-console-copy">
                This Game Costs {cost} Diamonds Per Entry. VIP Members Play Free.
            </p>
        </TriviaConsoleDialog>
    );
}
