/**
 * GAME COST POPUP — Futuristic Metal Card Design
 * One-time notification shown to non-VIP users about per-game diamond costs
 * Dismisses permanently via localStorage + Supabase
 *
 * Uses a pre-rendered metal card PNG (/images/diamond-cost-popup.png)
 * with invisible hit-target overlays on the "Got It!" and "Upgrade To VIP" buttons.
 */

import { useState, useEffect } from 'react';
import { checkPopupDismissed, dismissPopup, GAME_COST } from '../../lib/gates/perGameGate';

/**
 * @param {Object} props
 * @param {string} props.userId - User UUID
 * @param {string} props.pageKey - Unique page identifier (e.g., 'training', 'trivia_cash')
 * @param {boolean} props.isVip - Whether user is VIP (if true, popup never shows)
 * @param {number} [props.cost] - Override default GAME_COST
 * @param {Function} [props.onDismiss] - Callback when popup is dismissed
 */
export default function GameCostPopup({ userId, pageKey, featureKey, isVip, cost = GAME_COST, onDismiss }) {
    const key = pageKey || featureKey;
    const [show, setShow] = useState(false);
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        // Guard: never show for VIP users, and wait for userId to resolve
        if (isVip || !userId) return;
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
                // Delay 2500ms to ensure DiamondEngine.isVIP() has time to resolve
                // (avoids race condition where popup flashes before VIP status loads)
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
        window.location.href = '/hub/diamond-store#vip';
    };

    if (isVip || dismissed || !show) return null;

    return (
        <div style={s.overlay} onClick={handleDismiss}>
            {/* Metal card container — click inside doesn't dismiss */}
            <div
                style={s.cardWrap}
                onClick={(e) => e.stopPropagation()}
            >
                {/* The pre-rendered metal card PNG */}
                <img
                    src="/images/diamond-cost-popup.png"
                    alt="Diamond Cost — Each game costs diamonds. VIP members play free."
                    style={s.cardImage}
                    draggable={false}
                />

                {/* ── Invisible hit-target overlays ────────────────────────── */}

                {/* Close "X" button — top-right of metal card */}
                <button
                    onClick={handleDismiss}
                    style={s.closeHit}
                    aria-label="Close"
                />

                {/* "Got It!" button — bottom-left of metal card */}
                <button
                    onClick={handleDismiss}
                    style={s.gotItHit}
                    aria-label="Got It"
                />

                {/* "Upgrade To VIP" button — bottom-right of metal card */}
                <button
                    onClick={handleUpgrade}
                    style={s.upgradeHit}
                    aria-label="Upgrade to VIP"
                />
            </div>
        </div>
    );
}

// ── Hit-target positioning ──────────────────────────────────────
// All positions are % of the card image dimensions (803 × 888 original).
// The image is rendered at max 380px width, aspect ratio preserved.
const s = {
    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
        animation: 'fadeIn 0.3s ease-out',
    },
    cardWrap: {
        position: 'relative',
        width: '100%', maxWidth: 380,
        // Maintain aspect ratio of 803:888
        aspectRatio: '803 / 888',
        animation: 'fadeIn 0.35s ease-out',
    },
    cardImage: {
        position: 'absolute',
        inset: 0,
        width: '100%', height: '100%',
        objectFit: 'contain',
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // Subtle glow for premium effect
        filter: 'drop-shadow(0 8px 40px rgba(35,116,225,0.25)) drop-shadow(0 2px 10px rgba(0,0,0,0.5))',
    },

    // Shared: kill all hover/focus outlines on invisible hit targets
    _hitBase: {
        background: 'transparent',
        border: 'none', cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        zIndex: 2,
    },

    // ── Close "X" button hit target ────────────────────────────────
    closeHit: {
        position: 'absolute',
        top: '8.5%', right: '5%',
        width: '11%', height: '7%',
        background: 'transparent',
        border: 'none', cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        zIndex: 2,
        borderRadius: '50%',
    },

    // ── "Got It!" button hit target ────────────────────────────────
    gotItHit: {
        position: 'absolute',
        bottom: '9%', left: '8%',
        width: '38%', height: '8.5%',
        background: 'transparent',
        border: 'none', cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        zIndex: 2,
        borderRadius: 8,
    },

    // ── "Upgrade To VIP" button hit target ─────────────────────────
    upgradeHit: {
        position: 'absolute',
        bottom: '9%', right: '8%',
        width: '38%', height: '8.5%',
        background: 'transparent',
        border: 'none', cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        zIndex: 2,
        borderRadius: 8,
    },
};
