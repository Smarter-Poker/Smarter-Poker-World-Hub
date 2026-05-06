/**
 * PRIZE WHEEL COMPONENT — Spin-to-win reward system
 * Appears after completing daily trivia
 */

import React, { useState, useCallback, useRef } from 'react';
import { Gem, Shield, Ticket, Gift, Star, Zap } from 'lucide-react';
import HexButton from '../ui/HexButton';
import MetalFrame from '../ui/MetalFrame';
import { busEmit } from '../../engine/EventBus';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';

// Prize pool configuration
const PRIZES = [
    { id: 'diamond_5', label: '5', icon: Gem, color: '#00d4ff', weight: 30, reward: { type: 'diamonds', amount: 5 } },
    { id: 'diamond_10', label: '10', icon: Gem, color: '#00d4ff', weight: 25, reward: { type: 'diamonds', amount: 10 } },
    { id: 'diamond_25', label: '25', icon: Gem, color: '#00d4ff', weight: 15, reward: { type: 'diamonds', amount: 25 } },
    { id: 'diamond_50', label: '50', icon: Gem, color: '#ffd700', weight: 10, reward: { type: 'diamonds', amount: 50 } },
    { id: 'diamond_100', label: '100', icon: Gem, color: '#ffd700', weight: 5, reward: { type: 'diamonds', amount: 100 } },
    { id: 'streak_shield', label: 'Shield', icon: Shield, color: '#a78bfa', weight: 8, reward: { type: 'streak_shield', amount: 1 } },
    { id: 'free_entry', label: 'Free Play', icon: Ticket, color: '#22c55e', weight: 5, reward: { type: 'arcade_ticket', amount: 1 } },
    { id: 'mystery', label: '???', icon: Gift, color: '#f472b6', weight: 2, reward: { type: 'mystery_box', amount: 1 } },
];

// Weighted random selection
function selectPrize() {
    const totalWeight = PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const prize of PRIZES) {
        random -= prize.weight;
        if (random <= 0) return prize;
    }

    return PRIZES[0];
}

export default function PrizeWheel({
    onComplete,
    onClose,
    streakMultiplier = 1
}) {
    const [isSpinning, setIsSpinning] = useState(false);
    const [result, setResult] = useState(null);
    const [rotation, setRotation] = useState(0);
    const wheelRef = useRef(null);
    const claimingRef = useRef(false);

    const spin = useCallback(() => {
        if (isSpinning) return;

        setIsSpinning(true);

        // Select prize
        const prize = selectPrize();
        const prizeIndex = PRIZES.findIndex(p => p.id === prize.id);

        // Calculate rotation needed
        const segmentAngle = 360 / PRIZES.length;
        const targetAngle = 360 - (prizeIndex * segmentAngle) - (segmentAngle / 2);
        const spins = 5 + Math.random() * 3; // 5-8 full spins
        const finalRotation = rotation + (spins * 360) + targetAngle;

        setRotation(finalRotation);

        // After animation completes
        setTimeout(() => {
            setIsSpinning(false);

            // Apply streak multiplier to diamond rewards
            const finalReward = { ...prize.reward };
            if (finalReward.type === 'diamonds') {
                finalReward.amount = Math.floor(finalReward.amount * streakMultiplier);
            }

            setResult({ prize, reward: finalReward });
        }, 4000);
    }, [isSpinning, rotation, streakMultiplier]);

    const handleClaim = async () => {
        if (claimingRef.current) return;
        claimingRef.current = true;
        if (onComplete && result) {
            // Emit EventBus for diamond rewards
            if (result.reward.type === 'diamonds' && result.reward.amount > 0) {
                busEmit.diamondsEarned(result.reward.amount, 'Prize Wheel Spin');
                busEmit.celebration('confetti');
            }

            // Persist non-diamond items (streak_shield, arcade_ticket, mystery_box).
            // Phase 60: capture errors on all 3 supabase calls — were silently
            // swallowed, so a failed write still called onComplete() and the
            // user saw "+1 streak shield" toast without the item actually
            // persisting. Now warns visibly and skips onComplete on failure
            // so the user can re-spin or contact support.
            if (result.reward.type !== 'diamonds') {
                let _persistFailed = false;
                try {
                    const user = getAuthUser();
                    if (user) {
                        // Check if item already exists
                        const { data: existing, error: selErr } = await supabase
                            .from('trivia_user_items')
                            .select('quantity')
                            .eq('user_id', user.id)
                            .eq('item_type', result.reward.type)
                            .maybeSingle();
                        if (selErr) {
                            console.warn('[PrizeWheel] item select failed:', selErr.message);
                            _persistFailed = true;
                        } else if (existing) {
                            // Increment existing quantity
                            const { error: updErr } = await supabase
                                .from('trivia_user_items')
                                .update({ quantity: existing.quantity + result.reward.amount, updated_at: new Date().toISOString() })
                                .eq('user_id', user.id)
                                .eq('item_type', result.reward.type);
                            if (updErr) {
                                console.warn('[PrizeWheel] item update failed:', updErr.message);
                                _persistFailed = true;
                            }
                        } else {
                            // Insert new item
                            const { error: insErr } = await supabase
                                .from('trivia_user_items')
                                .insert({ user_id: user.id, item_type: result.reward.type, quantity: result.reward.amount });
                            if (insErr) {
                                console.warn('[PrizeWheel] item insert failed:', insErr.message);
                                _persistFailed = true;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[PrizeWheel] Failed to persist item:', e);
                    _persistFailed = true;
                }
                // If persist failed, mark the reward so caller can decide what
                // to show. Caller (TriviaLobby/etc.) can detect persistFailed
                // and show a "we'll retry" message instead of the success toast.
                if (_persistFailed) {
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
                                transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none'
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
                                    {result.reward.type === 'mystery_box' && 'Mystery Box'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Action button */}
                    {!result ? (
                        <HexButton
                            onClick={spin}
                            disabled={isSpinning}
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
                            CLAIM REWARD
                        </HexButton>
                    )}

                    {onClose && !isSpinning && (
                        <button className="skip-btn" onClick={onClose}>
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
                
                .title :global(.star-icon) {
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
                
                .wheel-wrapper {
                    position: relative;
                    width: 280px;
                    height: 280px;
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
                
                .skip-btn {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.4);
                    font-size: 13px;
                    cursor: pointer;
                    padding: 8px 16px;
                    transition: color 0.2s;
                }
                
                .skip-btn:hover {
                    color: rgba(255, 255, 255, 0.7);
                }
            `}</style>
        </div>
    );
}
