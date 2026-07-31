/**
 * PRIZE WHEEL COMPONENT — Spin-to-win reward system
 * Appears after completing daily trivia
 *
 * TRUST MODEL (read before changing):
 * This component is NOT meant to be the authority on what a spin is worth.
 * Pass `prizeId` (and optionally `prizeAmount`) from a server-resolved spin
 * and the wheel simply animates to that segment and reports it back. The
 * built-in weighted roll is a development/offline fallback only, and the
 * payload it reports is flagged `serverResolved: false` so callers can refuse
 * to credit it. See CROSS-FILE REQUEST in the fixer report: a
 * SECURITY DEFINER RPC (one spin per perfect game, weighted roll + atomic
 * credit, returns the prize id) still needs to be added on the DB side.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Gem, Shield, Ticket, Gift, Star, Zap } from 'lucide-react';
import HexButton from '../ui/HexButton';
import MetalFrame from '../ui/MetalFrame';
import { busEmit } from '../../engine/EventBus';
import { supabase } from '../../lib/supabase';

const SPIN_DURATION_MS = 4000;

// Prize pool configuration.
// NOTE: the 'mystery' segment used to award an item_type of 'mystery_box'
// that nothing in the app ever opened, displayed or consumed — a dead-end
// reward. Until a box-opening flow exists it pays real diamonds while
// keeping the "???" surprise reveal.
const PRIZES = [
    { id: 'diamond_5', label: '5', icon: Gem, color: '#00d4ff', weight: 30, reward: { type: 'diamonds', amount: 5 } },
    { id: 'diamond_10', label: '10', icon: Gem, color: '#00d4ff', weight: 25, reward: { type: 'diamonds', amount: 10 } },
    { id: 'diamond_25', label: '25', icon: Gem, color: '#00d4ff', weight: 15, reward: { type: 'diamonds', amount: 25 } },
    { id: 'diamond_50', label: '50', icon: Gem, color: '#ffd700', weight: 10, reward: { type: 'diamonds', amount: 50 } },
    { id: 'diamond_100', label: '100', icon: Gem, color: '#ffd700', weight: 5, reward: { type: 'diamonds', amount: 100 } },
    { id: 'streak_shield', label: 'Shield', icon: Shield, color: '#a78bfa', weight: 8, reward: { type: 'streak_shield', amount: 1 } },
    { id: 'free_entry', label: 'Free Play', icon: Ticket, color: '#22c55e', weight: 5, reward: { type: 'arcade_ticket', amount: 1 } },
    { id: 'mystery', label: '???', icon: Gift, color: '#f472b6', weight: 2, reward: { type: 'diamonds', amount: 15 } },
];

// Weighted random selection (fallback only — see trust model above)
function selectPrize() {
    const totalWeight = PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const prize of PRIZES) {
        random -= prize.weight;
        if (random <= 0) return prize;
    }

    return PRIZES[0];
}

function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
}

function vibrate(pattern) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
}

export default function PrizeWheel({
    onComplete,
    onClose,
    streakMultiplier = 1,
    prizeId = null, // server-resolved outcome — preferred
    prizeAmount = null // server-resolved amount (multiplier already applied)
}) {
    const [isSpinning, setIsSpinning] = useState(false);
    const [result, setResult] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [claimError, setClaimError] = useState(null);
    const [reduceMotion] = useState(prefersReducedMotion);
    const wheelRef = useRef(null);
    const claimingRef = useRef(false);
    const hasSpunRef = useRef(false);

    // Phase 69 parity: the 4s spin-resolution timeout had no cleanup and no
    // mounted guard, so closing mid-spin set state on an unmounted component.
    const spinTimeoutRef = useRef(null);
    const tickTimeoutsRef = useRef([]);
    const isMountedRef = useRef(true);
    useEffect(() => () => {
        isMountedRef.current = false;
        if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
        for (const id of tickTimeoutsRef.current) clearTimeout(id);
        tickTimeoutsRef.current = [];
    }, []);

    const spin = useCallback(() => {
        // One spin, ever. Re-spinning was previously possible by closing and
        // re-opening the wheel on the same perfect score.
        if (isSpinning || hasSpunRef.current || result) return;
        hasSpunRef.current = true;

        setIsSpinning(true);

        // Prefer a server-resolved prize; fall back to the local roll.
        const serverPrize = prizeId ? PRIZES.find(p => p.id === prizeId) : null;
        const prize = serverPrize || selectPrize();
        const serverResolved = !!serverPrize;
        const prizeIndex = PRIZES.findIndex(p => p.id === prize.id);

        // Landing math is only valid when the wheel is rotated by WHOLE
        // revolutions from a normalized base. The old `5 + Math.random() * 3`
        // added a fractional turn, so the segment under the pointer routinely
        // differed from the prize that was actually awarded.
        const segAngle = 360 / PRIZES.length;
        const targetAngle = 360 - (prizeIndex * segAngle) - (segAngle / 2);
        const spins = 5 + Math.floor(Math.random() * 4); // 5-8 whole turns
        const base = rotation - (rotation % 360);
        const finalRotation = base + (spins * 360) + targetAngle;

        setRotation(finalRotation);

        // Haptic ticks that decay like the cubic-bezier easing (skipped when
        // the user asked for reduced motion).
        if (!reduceMotion) {
            const offsets = [0, 400, 850, 1350, 1900, 2450, 2950, 3400, 3750, 3950];
            for (const offset of offsets) {
                const id = setTimeout(() => { if (isMountedRef.current) vibrate(8); }, offset);
                tickTimeoutsRef.current.push(id);
            }
        }

        const resolve = () => {
            if (!isMountedRef.current) return;
            setIsSpinning(false);

            const baseAmount = prize.reward.amount;
            const finalReward = { ...prize.reward, prizeId: prize.id, baseAmount, serverResolved };

            if (serverResolved && Number.isFinite(Number(prizeAmount))) {
                // Server already applied any multiplier — never re-apply.
                finalReward.amount = Math.max(0, Math.floor(Number(prizeAmount)));
                finalReward.appliedMultiplier = 1;
            } else if (finalReward.type === 'diamonds') {
                const mult = Number.isFinite(streakMultiplier) && streakMultiplier > 0 ? streakMultiplier : 1;
                finalReward.amount = Math.floor(baseAmount * mult);
                finalReward.appliedMultiplier = mult;
            } else {
                finalReward.appliedMultiplier = 1;
            }

            setResult({ prize, reward: finalReward });
            vibrate([12, 40, 25]);
            // Celebrate the moment the wheel lands, not two taps later.
            try { busEmit.celebration('confetti'); } catch (e) { console.warn('[PrizeWheel] celebration emit failed:', e?.message || e); }
        };

        // Reduced motion: no long spin animation, reveal (almost) at once.
        spinTimeoutRef.current = setTimeout(resolve, reduceMotion ? 250 : SPIN_DURATION_MS);
    }, [isSpinning, result, rotation, streakMultiplier, prizeId, prizeAmount, reduceMotion]);

    const handleClaim = async () => {
        if (claimingRef.current) return;
        claimingRef.current = true;
        setClaimError(null);
        if (onComplete && result) {
            // Emit EventBus for diamond rewards
            if (result.reward.type === 'diamonds' && result.reward.amount > 0) {
                busEmit.diamondsEarned(result.reward.amount, 'Prize Wheel Spin');
            }

            // Persist non-diamond items (streak_shield, arcade_ticket).
            //
            // Phase 80: this used to be a client-side SELECT → UPDATE/INSERT
            // against trivia_user_items. That table is now SELECT-only for
            // clients (migration 20260726120500 revoked INSERT/UPDATE/DELETE
            // from authenticated), because a read-then-write let a modified
            // client set `quantity` to anything. The write goes through
            // fn_trivia_grant_item, which grants to auth.uid() only, clamps the
            // amount to 1..5 and increments atomically — so it is safe to
            // expose to the browser and it cannot lose a concurrent grant the
            // way the old read-modify-write could.
            //
            // Errors are still surfaced rather than swallowed: a failed write
            // used to still call onComplete(), so the user saw a "+1 streak
            // shield" toast for an item that never persisted.
            if (result.reward.type !== 'diamonds') {
                let _persistFailed = false;
                try {
                    const { data: grant, error: rpcErr } = await supabase.rpc('fn_trivia_grant_item', {
                        p_item_type: result.reward.type,
                        p_amount: Math.max(1, Math.floor(Number(result.reward.amount) || 1)),
                    });
                    if (rpcErr) {
                        console.warn('[PrizeWheel] fn_trivia_grant_item failed:', rpcErr.message);
                        _persistFailed = true;
                    } else if (grant && grant.success === false) {
                        console.warn('[PrizeWheel] fn_trivia_grant_item rejected:', grant.error);
                        _persistFailed = true;
                    }
                } catch (e) {
                    console.warn('[PrizeWheel] Failed to persist item:', e);
                    _persistFailed = true;
                }
                // If persist failed, mark the reward so caller can decide what
                // to show. Caller (TriviaLobby/etc.) can detect persistFailed
                // and show a "we'll retry" message instead of the success toast.
                // claimingRef MUST be released here, otherwise the CLAIM
                // button stays permanently inert after one transient network
                // failure — the opposite of the retry the copy promises.
                if (_persistFailed) {
                    claimingRef.current = false;
                    if (isMountedRef.current) {
                        setClaimError('Could not save your prize. Tap Claim to retry.');
                    }
                    onComplete({ ...result.reward, persistFailed: true });
                    return;
                }
            }

            onComplete(result.reward);
        }
    };

    const segmentAngle = 360 / PRIZES.length;

    return (
        <div className="prize-wheel-overlay">
            <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                <div className="prize-wheel-container">
                    <h2 className="title">
                        <Star className="star-icon" />
                        DAILY SPIN
                        <Star className="star-icon" />
                    </h2>

                    {streakMultiplier > 1 && (
                        <div className="multiplier-notice">
                            <Zap size={14} />
                            {streakMultiplier}x Streak Bonus Active!
                        </div>
                    )}

                    {/* Wheel */}
                    <div className="wheel-wrapper">
                        <div className="wheel-pointer">▼</div>
                        <div
                            ref={wheelRef}
                            className="wheel"
                            style={{
                                transform: `rotate(${rotation}deg)`,
                                willChange: isSpinning ? 'transform' : 'auto',
                                transition: isSpinning && !reduceMotion
                                    ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
                                    : 'none'
                            }}
                        >
                            {PRIZES.map((prize, index) => {
                                const Icon = prize.icon;
                                const startAngle = index * segmentAngle;

                                return (
                                    <div
                                        key={prize.id}
                                        className="wheel-segment"
                                        style={{
                                            transform: `rotate(${startAngle}deg)`,
                                            '--segment-color': prize.color
                                        }}
                                    >
                                        <div className="segment-content" style={{ transform: `rotate(${segmentAngle / 2}deg)` }}>
                                            <Icon size={20} />
                                            <span>{prize.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="wheel-center">
                            <Gem size={24} color="#00d4ff" />
                        </div>
                    </div>

                    {/* Result display */}
                    {result && (
                        <div className="result-display" style={{ '--prize-color': result.prize.color }}>
                            <div className="result-icon">
                                {React.createElement(result.prize.icon, { size: 32 })}
                            </div>
                            <div className="result-text">
                                <span className="result-label">You Won!</span>
                                <span className="result-amount">
                                    {result.reward.type === 'diamonds' && `${result.reward.amount} Diamonds`}
                                    {result.reward.type === 'streak_shield' && 'Streak Shield'}
                                    {result.reward.type === 'arcade_ticket' && 'Free Arcade Entry'}
                                </span>
                                {/* Make the streak multiplier visible — it was
                                    previously applied silently at claim time,
                                    hiding the value of the streak system. */}
                                {result.reward.type === 'diamonds' && result.reward.appliedMultiplier > 1 && (
                                    <span className="result-breakdown">
                                        {result.reward.baseAmount} x {result.reward.appliedMultiplier} streak bonus
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {claimError && <div className="claim-error" role="alert">{claimError}</div>}

                    {/* Action button */}
                    {!result ? (
                        <HexButton
                            onClick={spin}
                            disabled={isSpinning || hasSpunRef.current}
                            variant="primary"
                            size="lg"
                        >
                            {isSpinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
                        </HexButton>
                    ) : (
                        <HexButton
                            onClick={handleClaim}
                            variant="primary"
                            size="lg"
                        >
                            {claimError ? 'RETRY CLAIM' : 'CLAIM REWARD'}
                        </HexButton>
                    )}

                    {/* Skip is only an escape hatch BEFORE the spin. Leaving it
                        up during/after the spin let a player discard a prize
                        they had already won with one mis-tap — and, combined
                        with re-opening the wheel, fish for a better roll. */}
                    {onClose && !isSpinning && !result && !hasSpunRef.current && (
                        <button className="skip-btn" type="button" onClick={onClose}>
                            Skip
                        </button>
                    )}
                </div>
            </MetalFrame>

            <style>{`
                .prize-wheel-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.85);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                }
                
                .prize-wheel-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 20px;
                    max-width: 360px;
                }
                
                .title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
                }
                
                /* :global() is styled-jsx / CSS-Modules syntax and is INVALID
                   inside a plain <style> element — browsers dropped this rule
                   entirely, so the title stars rendered unstyled. */
                .title .star-icon {
                    color: #ffd700;
                    animation: twinkle 1.5s ease-in-out infinite;
                }
                
                @keyframes twinkle {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.8); }
                }
                
                .multiplier-notice {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 14px;
                    background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #000;
                }
                
                /* 280px cramped the labels at segment edges on 375px phones */
                .wheel-wrapper {
                    position: relative;
                    width: min(320px, 80vw);
                    height: min(320px, 80vw);
                }
                
                .wheel-pointer {
                    position: absolute;
                    top: -10px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 32px;
                    color: #fff;
                    z-index: 10;
                    text-shadow: 0 0 10px #00d4ff;
                }
                
                .wheel {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: conic-gradient(
                        from 0deg,
                        ${PRIZES.map((p, i) => `${p.color}40 ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`).join(', ')}
                    );
                    border: 4px solid rgba(255, 255, 255, 0.3);
                    position: relative;
                    box-shadow: 0 0 30px rgba(0, 212, 255, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5);
                }
                
                .wheel-segment {
                    position: absolute;
                    width: 50%;
                    height: 50%;
                    left: 50%;
                    top: 0;
                    transform-origin: 0% 100%;
                }
                
                .segment-content {
                    position: absolute;
                    left: 10%;
                    top: 30%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    color: var(--segment-color);
                    font-size: 12px;
                    font-weight: 600;
                    text-shadow: 0 0 5px var(--segment-color);
                }
                
                .wheel-center {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 50px;
                    height: 50px;
                    background: radial-gradient(circle, #1a2744 0%, #0a1628 100%);
                    border: 3px solid rgba(0, 212, 255, 0.5);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
                }
                
                .result-display {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 24px;
                    background: rgba(0, 0, 0, 0.5);
                    border: 2px solid var(--prize-color);
                    border-radius: 12px;
                    animation: resultPop 0.5s ease-out;
                }
                
                @keyframes resultPop {
                    0% { transform: scale(0.5); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
                
                .result-icon {
                    color: var(--prize-color);
                    animation: bounce 0.5s ease-out;
                }
                
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                
                .result-text {
                    display: flex;
                    flex-direction: column;
                }
                
                .result-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.6);
                    text-transform: uppercase;
                }
                
                .result-amount {
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--prize-color);
                    text-shadow: 0 0 10px var(--prize-color);
                }
                
                .result-breakdown {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.55);
                    margin-top: 2px;
                }

                .claim-error {
                    padding: 10px 14px;
                    background: rgba(239, 68, 68, 0.12);
                    border: 1px solid rgba(239, 68, 68, 0.35);
                    border-radius: 8px;
                    color: #ef4444;
                    font-size: 12px;
                    text-align: center;
                }

                .skip-btn {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.4);
                    font-size: 13px;
                    cursor: pointer;
                    padding: 12px 20px;
                    min-height: 44px;
                    transition: color 0.2s;
                }

                .skip-btn:hover {
                    color: rgba(255, 255, 255, 0.7);
                }

                @media (prefers-reduced-motion: reduce) {
                    .title .star-icon,
                    .result-display,
                    .result-icon {
                        animation: none;
                    }
                    .skip-btn { transition: none; }
                }
            `}</style>
        </div>
    );
}
