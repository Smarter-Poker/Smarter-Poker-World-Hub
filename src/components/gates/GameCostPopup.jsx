/**
 * GAME COST POPUP
 * One-time notification shown to non-VIP users about per-game diamond costs
 * Dismisses permanently via localStorage + Supabase
 */

import { useState, useEffect } from 'react';
import { Diamond, Crown, X } from 'lucide-react';
import { checkPopupDismissed, dismissPopup, GAME_COST } from '../../lib/gates/perGameGate';

const M = {
    base: '#242526', mid: '#3a3b3c', highlight: '#4e4f50',
    cyan: '#2374e1', cyanGlow: 'rgba(35,116,225,0.4)',
    gold: '#f7b928',
};

/**
 * @param {Object} props
 * @param {string} props.userId - User UUID
 * @param {string} props.pageKey - Unique page identifier (e.g., 'training', 'trivia_cash')
 * @param {boolean} props.isVip - Whether user is VIP (if true, popup never shows)
 * @param {number} [props.cost] - Override default GAME_COST
 * @param {Function} [props.onDismiss] - Callback when popup is dismissed
 */
export default function GameCostPopup({ userId, pageKey, isVip, cost = GAME_COST, onDismiss }) {
    const [show, setShow] = useState(false);
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        // VIP users never see this popup
        if (isVip) return;

        async function checkDismissal() {
            const isDismissed = await checkPopupDismissed(userId, pageKey);
            if (!isDismissed) {
                setDismissed(false);
                // Small delay for better UX (let page load first)
                setTimeout(() => setShow(true), 800);
            }
        }
        checkDismissal();
    }, [userId, pageKey, isVip]);

    const handleDismiss = async () => {
        setShow(false);
        setDismissed(true);
        await dismissPopup(userId, pageKey);
        onDismiss?.();
    };

    if (isVip || dismissed || !show) return null;

    return (
        <div style={s.overlay}>
            <div style={s.popup}>
                {/* Close button */}
                <button onClick={handleDismiss} style={s.closeBtn}>
                    <X size={18} />
                </button>

                {/* Diamond icon */}
                <div style={s.iconWrap}>
                    <Diamond size={32} style={{ color: M.cyan, filter: `drop-shadow(0 0 12px ${M.cyanGlow})` }} />
                </div>

                <h3 style={s.title}>💎 Diamond Cost</h3>
                <p style={s.desc}>
                    Each game costs <strong style={{ color: M.cyan }}>{cost} diamonds</strong>.
                    <br />Diamonds are earned through gameplay, daily rewards, and achievements.
                </p>

                {/* VIP promo */}
                <div style={s.vipBox}>
                    <Crown size={16} style={{ color: M.gold }} />
                    <span>
                        <strong>VIP members play FREE</strong> — unlimited games, no diamond cost
                    </span>
                </div>

                <div style={s.actions}>
                    <button onClick={handleDismiss} style={s.gotItBtn}>
                        Got it!
                    </button>
                    <button onClick={() => { handleDismiss(); window.location.href = '/hub/diamond-store#vip'; }} style={s.upgradeBtn}>
                        <Crown size={14} /> Upgrade to VIP
                    </button>
                </div>
            </div>
        </div>
    );
}

const s = {
    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
        animation: 'fadeIn 0.3s ease-out',
    },
    popup: {
        position: 'relative',
        width: '100%', maxWidth: 380,
        background: `linear-gradient(180deg, #1a2a3a 0%, ${M.base} 100%)`,
        border: `2px solid ${M.highlight}`,
        borderRadius: 20, padding: '32px 24px',
        textAlign: 'center',
        boxShadow: '0 0 60px rgba(0,0,0,0.8)',
        animation: 'fadeIn 0.3s ease-out',
    },
    closeBtn: {
        position: 'absolute', top: 12, right: 12,
        background: 'none', border: 'none',
        color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
        padding: 4,
    },
    iconWrap: {
        width: 72, height: 72, margin: '0 auto 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.3)',
        border: `2px solid ${M.cyan}`,
        borderRadius: '50%',
        boxShadow: `0 0 20px ${M.cyanGlow}`,
    },
    title: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 20, fontWeight: 700,
        letterSpacing: '0.05em',
        color: '#fff', margin: '0 0 12px',
    },
    desc: {
        fontSize: 14, color: 'rgba(255,255,255,0.7)',
        lineHeight: 1.6, margin: '0 0 20px',
    },
    vipBox: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px',
        background: 'rgba(247,185,40,0.08)',
        border: `1px solid rgba(247,185,40,0.25)`,
        borderRadius: 12,
        fontSize: 13, color: 'rgba(255,255,255,0.8)',
        textAlign: 'left', marginBottom: 24,
    },
    actions: {
        display: 'flex', gap: 10,
    },
    gotItBtn: {
        flex: 1, padding: '14px 20px',
        background: `linear-gradient(135deg, ${M.cyan}, #1a5fc9)`,
        border: 'none', borderRadius: 10,
        color: '#000', fontSize: 14, fontWeight: 700,
        letterSpacing: '0.05em', cursor: 'pointer',
    },
    upgradeBtn: {
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '14px 20px',
        background: 'rgba(247,185,40,0.15)',
        border: `1px solid ${M.gold}`,
        borderRadius: 10,
        color: M.gold, fontSize: 13, fontWeight: 700,
        letterSpacing: '0.05em', cursor: 'pointer',
    },
};
