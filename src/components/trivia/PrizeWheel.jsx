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
import styles from './PrizeWheel.module.css';

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

// Schema ink for each PRIZES colour (the table above stays the source of
// truth; this only picks the painted-console ink class that prints it).
const INK_BY_PRIZE_COLOR = Object.freeze({
    '#45adff': 'blue',
    '#ffd700': 'gold',
    '#e4e7ec': 'silver',
    '#c8ffd2': 'green',
    '#f02849': 'red',
});

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

    // Footer law: two painted plates only while the surface genuinely has two
    // actions (Spin and Skip). Skip stays printed but disabled through the
    // spin so the chassis does not jump under a moving wheel; it can never
    // fire once a spin has started (canClose is false). After the landing the
    // one remaining action (Claim) prints as a lit word on the glass.
    const primaryAction = !result
        ? {
            label: isSpinning ? 'Spinning...' : 'Spin The Wheel',
            onClick: spin,
            disabled: isSpinning || hasSpunRef.current,
        }
        : {
            label: claimError ? 'Retry Claim' : 'Claim Reward',
            onClick: handleClaim,
            ink: claimError ? 'red' : 'gold',
        };
    const secondaryAction = onClose && !result
        ? {
            label: 'Skip',
            onClick: canClose ? onClose : undefined,
            disabled: !canClose,
            ink: canClose ? 'silver' : 'muted',
        }
        : undefined;

    const resultInk = result ? (INK_BY_PRIZE_COLOR[result.prize.color] || 'silver') : 'silver';

    return (
        <div className={`prize-wheel-overlay ${styles.overlay}`}>
            <TriviaConsoleDialog
                open
                onClose={canClose ? onClose : undefined}
                closeOnBackdrop={canClose}
                eyebrow="Daily Reward"
                title="Prize Wheel"
                subtitle={isSpinning ? 'Resolving Your Reward' : result ? 'Reward Ready To Claim' : 'One Spin Per Perfect Game'}
                pill={streakMultiplier > 1 ? `${streakMultiplier}X Bonus` : 'Perfect Run'}
                primaryAction={primaryAction}
                secondaryAction={secondaryAction}
            >
                <div className={styles.container}>
                    <p className={`tc-label ${styles.kicker}`}>Daily Spin</p>

                    {streakMultiplier > 1 && (
                        <p className={`tc-ink--gold ${styles.notice}`}>
                            {streakMultiplier}X Streak Bonus Active!
                        </p>
                    )}

                    {/* Wheel: painted face (rotates), painted hub cap and
                        pointer (static). Only the eight prize labels are live
                        DOM, printed into each segment's glass and carried
                        round by the same transform as the face. */}
                    <div className={styles.stage} role="img" aria-label="Prize Wheel With Eight Reward Slots">
                        <div
                            ref={wheelRef}
                            className={styles.wheel}
                            style={{
                                transform: `rotate(${rotation}deg)`,
                                willChange: isSpinning ? 'transform' : 'auto',
                                transition: isSpinning && !reduceMotion
                                    ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
                                    : 'none'
                            }}
                        >
                            {PRIZES.map((prize, index) => {
                                const centreAngle = index * segmentAngle + segmentAngle / 2;
                                const ink = INK_BY_PRIZE_COLOR[prize.color] || 'silver';
                                return (
                                    <span
                                        key={prize.id}
                                        className={`${styles.segmentLabel} ${prize.label.length > 3 ? styles.segmentWord : ''} tc-ink--${ink}`}
                                        style={{ '--segment-angle': `${centreAngle}deg` }}
                                        aria-hidden="true"
                                    >
                                        {prize.label}
                                    </span>
                                );
                            })}
                        </div>
                        <span className={styles.hub} aria-hidden="true" />
                        <span className={styles.pointer} aria-hidden="true" />
                    </div>

                    {/* Result display */}
                    {result && (
                        <div className={`tc-rows ${styles.result}`} role="status" aria-live="polite">
                            <div className="tc-row">
                                <span className="tc-row__label">You Won!</span>
                                <span className={`tc-row__value tc-ink--${resultInk} ${styles.resultAmount}`}>
                                    {result.reward.type === 'diamonds' && `${formatTriviaDisplayNumber(result.reward.amount)} Diamonds`}
                                    {result.reward.type === 'streak_shield' && 'Streak Shield'}
                                    {result.reward.type === 'arcade_ticket' && 'Free Arcade Entry'}
                                </span>
                            </div>
                            {/* Make the streak multiplier visible - it was
                                previously applied silently at claim time,
                                hiding the value of the streak system. */}
                            {result.reward.type === 'diamonds' && result.reward.appliedMultiplier > 1 && (
                                <div className="tc-row">
                                    <span className="tc-row__label">Streak Bonus</span>
                                    <span className="tc-row__value">
                                        {formatTriviaDisplayNumber(result.reward.baseAmount)} X {formatTriviaDisplayNumber(result.reward.appliedMultiplier)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {claimError && <p className={`tc-ink--red ${styles.claimError}`} role="alert">{claimError}</p>}
                </div>
            </TriviaConsoleDialog>
        </div>
    );
}
