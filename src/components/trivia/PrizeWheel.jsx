/**
 * PRIZE WHEEL COMPONENT - Spin-to-win reward system
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

import { useState, useCallback, useRef, useEffect } from 'react';
import { busEmit } from '../../engine/EventBus';
import { supabase } from '../../lib/supabase';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';
import { formatTriviaDisplayNumber } from '../../lib/trivia/formatTriviaDisplayNumber';

const SPIN_DURATION_MS = 4000;

// Prize pool configuration.
// NOTE: the 'mystery' segment used to award an item_type of 'mystery_box'
// that nothing in the app ever opened, displayed or consumed - a dead-end
// reward. Until a box-opening flow exists it pays real diamonds while
// keeping the "???" surprise reveal.
const PRIZES = [
    { id: 'diamond_5', label: '5', color: '#45adff', weight: 30, reward: { type: 'diamonds', amount: 5 } },
    { id: 'diamond_10', label: '10', color: '#45adff', weight: 25, reward: { type: 'diamonds', amount: 10 } },
    { id: 'diamond_25', label: '25', color: '#45adff', weight: 15, reward: { type: 'diamonds', amount: 25 } },
    { id: 'diamond_50', label: '50', color: '#ffd700', weight: 10, reward: { type: 'diamonds', amount: 50 } },
    { id: 'diamond_100', label: '100', color: '#ffd700', weight: 5, reward: { type: 'diamonds', amount: 100 } },
    { id: 'streak_shield', label: 'Shield', color: '#e4e7ec', weight: 8, reward: { type: 'streak_shield', amount: 1 } },
    { id: 'free_entry', label: 'Free Play', color: '#c8ffd2', weight: 5, reward: { type: 'arcade_ticket', amount: 1 } },
    { id: 'mystery', label: 'Mystery', color: '#f02849', weight: 2, reward: { type: 'diamonds', amount: 15 } },
];

// Weighted random selection (fallback only - see trust model above)
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
    prizeId = null, // server-resolved outcome - preferred
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
                // Server already applied any multiplier - never re-apply.
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
            // amount to 1..5 and increments atomically - so it is safe to
            // expose to the browser and it cannot lose a concurrent grant the
            // way the old read-modify-write could.
            //
            // Errors are still surfaced rather than swallowed: a failed write
            // used to still call onComplete(), so the user saw a "+1 streak
            // shield" toast for an item that never persisted.
            // A server-resolved non-diamond prize was already inserted by
            // fn_trivia_prize_wheel_spin in the same transaction as the roll.
            // Granting it again here doubled every shield/ticket award.
            // The client RPC remains only for the legacy local-roll fallback.
            if (result.reward.type !== 'diamonds' && result.reward.serverResolved !== true) {
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
                // failure - the opposite of the retry the copy promises.
                if (_persistFailed) {
                    claimingRef.current = false;
                    if (isMountedRef.current) {
                        setClaimError('Could Not Save Your Prize. Tap Claim To Retry.');
                    }
                    onComplete({ ...result.reward, persistFailed: true });
                    return;
                }
            }

            onComplete(result.reward);
        }
    };

    const segmentAngle = 360 / PRIZES.length;
    const canClose = Boolean(onClose && !isSpinning && !result && !hasSpunRef.current);

    return (
        <div className="prize-wheel-overlay">
            <TriviaConsoleDialog
                open
                onClose={canClose ? onClose : undefined}
                closeOnBackdrop={canClose}
                eyebrow="Daily Reward"
                title="Prize Wheel"
                subtitle={isSpinning ? 'Resolving Your Reward' : result ? 'Reward Ready To Claim' : 'One Spin Per Perfect Game'}
                pill={streakMultiplier > 1 ? `${streakMultiplier}x Bonus` : 'Perfect Run'}
            >
                <div className="prize-wheel-container">
                    <p className="title">Daily Spin</p>

                    {streakMultiplier > 1 && (
                        <div className="multiplier-notice">
                            {streakMultiplier}x Streak Bonus Active!
                        </div>
                    )}

                    {/* Wheel */}
                    <div className="wheel-wrapper" role="img" aria-label="Prize Wheel With Eight Reward Slots">
                        <div className="wheel-pointer">Winning Slot</div>
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
                                            <span>{prize.label}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="wheel-center">
                            <span>Daily Spin</span>
                        </div>
                    </div>

                    {/* Result display */}
                    {result && (
                        <div className="result-display" style={{ '--prize-color': result.prize.color }} role="status" aria-live="polite">
                            <div className="result-text">
                                <span className="result-label">You Won!</span>
                                <span className="result-amount">
                                    {result.reward.type === 'diamonds' && `${formatTriviaDisplayNumber(result.reward.amount)} Diamonds`}
                                    {result.reward.type === 'streak_shield' && 'Streak Shield'}
                                    {result.reward.type === 'arcade_ticket' && 'Free Arcade Entry'}
                                </span>
                                {/* Make the streak multiplier visible - it was
                                    previously applied silently at claim time,
                                    hiding the value of the streak system. */}
                                {result.reward.type === 'diamonds' && result.reward.appliedMultiplier > 1 && (
                                    <span className="result-breakdown">
                                        {formatTriviaDisplayNumber(result.reward.baseAmount)} X {formatTriviaDisplayNumber(result.reward.appliedMultiplier)} Streak Bonus
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {claimError && <div className="claim-error" role="alert">{claimError}</div>}

                    {/* Action button */}
                    {!result ? (
                        <button
                            type="button"
                            className="wheel-action"
                            onClick={spin}
                            disabled={isSpinning || hasSpunRef.current}
                        >
                            {isSpinning ? 'Spinning...' : 'Spin The Wheel'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="wheel-action"
                            onClick={handleClaim}
                        >
                            {claimError ? 'Retry Claim' : 'Claim Reward'}
                        </button>
                    )}

                    {/* Skip is only an escape hatch BEFORE the spin. Leaving it
                        up during/after the spin let a player discard a prize
                        they had already won with one mis-tap - and, combined
                        with re-opening the wheel, fish for a better roll. */}
                    {onClose && !isSpinning && !result && !hasSpunRef.current && (
                        <button className="skip-btn" type="button" onClick={onClose}>
                            Skip
                        </button>
                    )}
                </div>
            </TriviaConsoleDialog>

            <style>{`
                .prize-wheel-overlay {
                    display: contents;
                }
                
                .prize-wheel-overlay .prize-wheel-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 18px;
                    width: 100%;
                    min-width: 0;
                    color: #e4e7ec;
                    font-family: Inter, system-ui, sans-serif;
                }
                
                .prize-wheel-overlay .title {
                    margin: 0;
                    color: #45adff;
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                    font-size: 18px;
                    font-weight: 800;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                }
                
                .prize-wheel-overlay .multiplier-notice {
                    width: 100%;
                    padding: 10px 0;
                    border-top: 1px solid #050607;
                    border-bottom: 1px solid #050607;
                    color: #ffd700;
                    font-size: 14px;
                    font-weight: 700;
                    text-align: center;
                }
                
                /* 280px cramped the labels at segment edges on 375px phones */
                .prize-wheel-overlay .wheel-wrapper {
                    position: relative;
                    width: min(310px, 76vw);
                    height: min(310px, 76vw);
                    margin-top: 18px;
                }
                
                .prize-wheel-overlay .wheel-pointer {
                    position: absolute;
                    top: -28px;
                    left: 50%;
                    transform: translateX(-50%);
                    color: #45adff;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    white-space: nowrap;
                    z-index: 10;
                }
                
                .prize-wheel-overlay .wheel {
                    width: 100%;
                    height: 100%;
                    position: relative;
                }
                
                .prize-wheel-overlay .wheel-segment {
                    position: absolute;
                    width: 50%;
                    height: 50%;
                    left: 50%;
                    top: 0;
                    transform-origin: 0% 100%;
                }
                
                .prize-wheel-overlay .segment-content {
                    position: absolute;
                    left: 10%;
                    top: 30%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    color: var(--segment-color);
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                }
                
                .prize-wheel-overlay .wheel-center {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 96px;
                    min-height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-top: 1px solid #45adff;
                    border-bottom: 1px solid #45adff;
                    color: #f4f7fb;
                    font-family: 'Roboto Condensed', Inter, system-ui, sans-serif;
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    text-align: center;
                    text-transform: uppercase;
                }
                
                .prize-wheel-overlay .result-display {
                    width: 100%;
                    padding: 14px 0;
                    border-top: 1px solid var(--prize-color);
                    border-bottom: 1px solid var(--prize-color);
                    animation: resultPop 0.5s ease-out;
                }
                
                @keyframes resultPop {
                    0% { transform: scale(0.5); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
                
                .prize-wheel-overlay .result-text {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                }
                
                .prize-wheel-overlay .result-label {
                    font-size: 12px;
                    color: #9aa5b3;
                    text-transform: uppercase;
                }
                
                .prize-wheel-overlay .result-amount {
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--prize-color);
                }
                
                .prize-wheel-overlay .result-breakdown {
                    font-size: 12px;
                    color: #9aa5b3;
                    margin-top: 2px;
                }

                .prize-wheel-overlay .claim-error {
                    width: 100%;
                    padding: 10px 0;
                    border-top: 1px solid #f02849;
                    border-bottom: 1px solid #f02849;
                    color: #ff5b6e;
                    font-size: 12px;
                    text-align: center;
                }

                .prize-wheel-overlay .wheel-action,
                .prize-wheel-overlay .skip-btn {
                    width: 100%;
                    min-height: 44px;
                    padding: 12px 8px;
                    border: 0;
                    border-top: 1px solid #050607;
                    border-bottom: 1px solid #050607;
                    color: #9aa5b3;
                    background: transparent;
                    font: 800 14px/1.2 'Roboto Condensed', Inter, system-ui, sans-serif;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    cursor: pointer;
                    touch-action: manipulation;
                }

                .prize-wheel-overlay .wheel-action {
                    color: #45adff;
                }

                .prize-wheel-overlay .wheel-action:active,
                .prize-wheel-overlay .skip-btn:active {
                    color: #f4f7fb;
                }

                .prize-wheel-overlay .wheel-action:disabled {
                    color: #657180;
                    cursor: wait;
                }

                .prize-wheel-overlay .wheel-action:focus-visible,
                .prize-wheel-overlay .skip-btn:focus-visible {
                    outline: 2px solid #8fd4ff;
                    outline-offset: 2px;
                }

                @media (prefers-reduced-motion: reduce) {
                    .prize-wheel-overlay .result-display {
                        animation: none;
                    }
                }
            `}</style>
        </div>
    );
}
