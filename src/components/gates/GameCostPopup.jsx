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
import { VipCta, VipGhost, VipIntroPrice, vipKitStyles as kit } from '../vip/VipKit';
import { useVipIntroPrompt } from '../../lib/store/useVipIntroOffer';
import { VIP_MONTHLY_PURCHASE_PATH } from '../../lib/store/vipIntroPrompt.mjs';

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
    // Account-aware VIP price. Before the early return; asks nothing until the
    // notice is actually on screen.
    const vipOn = isVip === false && show && !dismissed;
    const vipPrompt = useVipIntroPrompt(userId || null, { enabled: vipOn });

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
        window.top.location.href = VIP_MONTHLY_PURCHASE_PATH;
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
        >
            {/* Disclosure only: this notice never charges. The destination
                page's server route owns the entry charge when a game starts. */}
            <ul className="tc-rows">
                <li className="tc-row">
                    <span className="tc-row__label">Entry Cost</span>
                    <span className="tc-row__value">{cost} Diamonds</span>
                </li>
                <li className="tc-row">
                    <span className="tc-row__label">Charged</span>
                    <span className="tc-row__value">When A Game Starts</span>
                </li>
                <li className="tc-row">
                    <span className="tc-row__label">VIP Entry</span>
                    <span className="tc-row__value tc-ink--blue">Free, Unlimited</span>
                </li>
            </ul>
            {/* The price THIS account pays for VIP, as one readout. */}
            <VipIntroPrice accountId={userId || null} enabled={vipOn} compact />
            {/* The family's painted plates. Got It is last so the dialog's
                opening focus lands on the safe choice. */}
            <div className={`${kit.kit} ${kit.dialogActions}`}>
                <VipCta
                    onClick={handleUpgrade}
                    data-vip-upgrade="monthly"
                    sub={vipPrompt.state === 'intro' ? 'Then $20/Month. Cancel Anytime.' : 'Cancel Anytime.'}
                >
                    {vipPrompt.copy.cta}
                </VipCta>
                <VipGhost onClick={handleDismiss}>Got It</VipGhost>
            </div>
        </TriviaConsoleDialog>
    );
}
