/**
 * OutOfDiamondsModal: the "you need N diamonds to play" gate.
 *
 * Mobile phase 2 (Preflop Charts is its only caller): `useModalHistory` so
 * the phone back gesture closes it, `useScrimDismiss` so only a tap that
 * STARTED on the backdrop dismisses it, a bottom sheet with a drag handle
 * and a 44x44 X at or below 600px, 44px actions, and no hover-only state.
 * The CSS lives in the component so the gate stays self-contained wherever
 * it is mounted next.
 */
import React from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';

const CSS = `
.sp-ood-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
.sp-ood-modal { position: relative; background: linear-gradient(135deg, #1a0a2a, #0a0a12); border-radius: 24px; padding: 32px; max-width: 420px; width: 100%; text-align: center; border: 2px solid rgba(255, 107, 0, 0.5); box-shadow: 0 0 60px rgba(255, 107, 0, 0.3); box-sizing: border-box; color: #fff; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.sp-ood-handle { display: none; }
.sp-ood-close { position: absolute; top: 12px; right: 12px; width: 44px; height: 44px; min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.06); color: #fff; font-size: 22px; line-height: 1; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.sp-ood-close:active { background: rgba(255, 255, 255, 0.14); }
.sp-ood-close:focus-visible { outline: 2px solid #FFD700; outline-offset: 2px; }
.sp-ood-icon { margin: 8px 0 16px; }
.sp-ood-title { font-family: Rajdhani, Inter, sans-serif; font-size: 28px; font-weight: 900; color: #ff6b00; margin: 0 0 8px; }
.sp-ood-copy { color: rgba(255,255,255,0.7); font-size: 16px; margin: 0 0 24px; line-height: 1.6; }
.sp-ood-copy strong { color: #FFD700; }
.sp-ood-vip { background: linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(0, 212, 255, 0.2)); border-radius: 16px; padding: 20px; margin-bottom: 24px; border: 1px solid rgba(138, 43, 226, 0.3); }
.sp-ood-vip-kicker { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
.sp-ood-vip-price { font-family: Rajdhani, Inter, sans-serif; font-size: 32px; font-weight: 900; color: #fff; margin-bottom: 4px; }
.sp-ood-vip-price span { font-size: 16px; opacity: 0.7; }
.sp-ood-vip-note { color: #00ff88; font-size: 14px; font-weight: 600; }
.sp-ood-actions { display: flex; gap: 12px; }
.sp-ood-later, .sp-ood-buy { flex: 1; min-height: 48px; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
.sp-ood-later { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; }
.sp-ood-later:active { background: rgba(255,255,255,0.18); }
.sp-ood-buy { background: linear-gradient(135deg, #ff6b00, #ff0066); border: none; color: #fff; }
.sp-ood-buy:active { filter: brightness(1.1); }
.sp-ood-later:focus-visible, .sp-ood-buy:focus-visible { outline: 2px solid #FFD700; outline-offset: 2px; }
@media (max-width: 600px) {
  .sp-ood-overlay { align-items: flex-end; padding: 0; }
  .sp-ood-modal { max-width: 100%; max-height: 92dvh; overflow-y: auto; border-radius: 16px 16px 0 0; border-bottom: none; padding: 8px 20px calc(20px + env(safe-area-inset-bottom, 0px)); }
  .sp-ood-handle { display: block; width: 44px; height: 4px; margin: 4px auto 14px; border-radius: 999px; background: rgba(255, 255, 255, 0.28); }
  .sp-ood-actions { position: sticky; bottom: 0; padding-top: 8px; background: linear-gradient(180deg, rgba(10, 10, 18, 0), #0a0a12 30%); }
}
`;

function OutOfDiamondsModal({ isOpen, onClose, gameCost = 5, isVIP = false }) {
    useModalHistory(!!isOpen, onClose);
    const scrim = useScrimDismiss(onClose);

    if (!isOpen) return null;

    return (
        <div className="sp-ood-overlay" {...scrim}>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div
                className="sp-ood-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sp-ood-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sp-ood-handle" aria-hidden="true" />
                <button type="button" className="sp-ood-close sp-icon-btn" onClick={onClose} aria-label="Close">
                    ×
                </button>
                <div className="sp-ood-icon"><svg width='64' height='64' viewBox='0 0 24 24' fill='none' aria-hidden="true"><path d='M12 2L2 9l10 13 10-13L12 2z' fill='#00D4FF' /><path d='M12 2L2 9h20L12 2z' fill='#00B8E6' /></svg></div>
                <h2 id="sp-ood-title" className="sp-ood-title">OUT OF DIAMONDS</h2>
                <p className="sp-ood-copy">
                    You Need <strong>{gameCost} Diamonds</strong> To Play This Game.
                </p>

                {!isVIP && (
                    <div className="sp-ood-vip">
                        <div className="sp-ood-vip-kicker">GET VIP FOR</div>
                        <div className="sp-ood-vip-price">$19.99<span>/Month</span></div>
                        <div className="sp-ood-vip-note">UNLIMITED ACCESS. No Diamonds Needed</div>
                    </div>
                )}

                <div className="sp-ood-actions">
                    <button type="button" className="sp-ood-later" onClick={onClose}>
                        Maybe Later
                    </button>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/hub/diamond-store?tab=vip" className="sp-ood-buy">
                        Get Diamonds
                    </a>
                </div>
            </div>
        </div>
    );
}
export default OutOfDiamondsModal;
