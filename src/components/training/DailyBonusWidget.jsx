/**
 * 🎁 DAILY BONUS WIDGET
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows daily bonus status and claim button on training lobby
 * Features:
 * - Flying diamond animation to balance
 * - Sound effect on claim
 * - Counter animation (runs up like a timer)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { trainingSounds } from '../../utils/trainingSounds';

export default function DailyBonusWidget({ userId, onBonusClaimed }) {
    const [bonusData, setBonusData] = useState(null);
    const [claiming, setClaiming] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showAnimation, setShowAnimation] = useState(false);
    const [countingUp, setCountingUp] = useState(false);
    const [displayedAmount, setDisplayedAmount] = useState(0);
    const containerRef = useRef(null);

    useEffect(() => {
        if (userId) {
            checkBonus();
        }
    }, [userId]);

    const checkBonus = async () => {
        try {
            const res = await fetch(`/api/training/daily-bonus?userId=${userId}`);
            const data = await res.json();
            if (data.success) {
                setBonusData(data);
            }
        } catch (e) {
            console.error('[DailyBonusWidget] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const animateCounter = (targetAmount) => {
        setCountingUp(true);
        setDisplayedAmount(0);

        const duration = 1500; // 1.5 seconds
        const steps = 30;
        const increment = targetAmount / steps;
        let current = 0;
        let step = 0;

        const interval = setInterval(() => {
            step++;
            current = Math.min(Math.round(increment * step), targetAmount);
            setDisplayedAmount(current);

            // Play tick sound every few steps
            if (step % 5 === 0) {
                try { trainingSounds.menuTick?.(); } catch (e) { }
            }

            if (step >= steps) {
                clearInterval(interval);
                setDisplayedAmount(targetAmount);
                setCountingUp(false);
            }
        }, duration / steps);
    };

    const claimBonus = async () => {
        setClaiming(true);
        try {
            const res = await fetch('/api/training/daily-bonus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, claimNow: true })
            });
            const data = await res.json();
            if (data.success && data.claimed) {
                // Play success sound
                try { trainingSounds.achievementUnlocked?.(); } catch (e) { }

                // Show flying diamond animation
                setShowAnimation(true);

                // Start counter animation after a brief delay
                setTimeout(() => {
                    animateCounter(data.totalAwarded);
                }, 300);

                // Hide widget after animation completes
                setTimeout(() => {
                    onBonusClaimed?.(data.totalAwarded);
                    setBonusData({ ...bonusData, available: false, alreadyClaimed: true });
                }, 2500);
            }
        } catch (e) {
            console.error('[DailyBonusWidget] Claim error:', e);
        } finally {
            setClaiming(false);
        }
    };

    if (loading) return null;
    if (!bonusData?.available) return null;

    return (
        <motion.div
            ref={containerRef}
            style={styles.container}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
            <div style={styles.glow} />

            {/* Flying Diamonds Animation */}
            <AnimatePresence>
                {showAnimation && (
                    <>
                        {[...Array(8)].map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{
                                    opacity: 1,
                                    scale: 1,
                                    x: 0,
                                    y: 0
                                }}
                                animate={{
                                    opacity: [1, 1, 0],
                                    scale: [1, 1.2, 0.5],
                                    x: [0, (i % 2 === 0 ? -30 : 30) + Math.random() * 60, 200],
                                    y: [0, -40 - Math.random() * 40, -150]
                                }}
                                transition={{
                                    duration: 1.2,
                                    delay: i * 0.08,
                                    ease: 'easeOut'
                                }}
                                style={styles.flyingDiamond}
                            >
                                💎
                            </motion.div>
                        ))}
                    </>
                )}
            </AnimatePresence>

            <div style={styles.content}>
                <div style={styles.icon}>🎁</div>
                <div style={styles.info}>
                    {showAnimation ? (
                        <>
                            <div style={styles.claimedTitle}>Bonus Claimed!</div>
                            <motion.div
                                style={styles.countingAmount}
                                animate={{ scale: countingUp ? [1, 1.1, 1] : 1 }}
                                transition={{ repeat: countingUp ? Infinity : 0, duration: 0.3 }}
                            >
                                💎 +{displayedAmount}
                            </motion.div>
                        </>
                    ) : (
                        <>
                            <div style={styles.title}>Daily Bonus Ready!</div>
                            <div style={styles.amount}>
                                <span style={styles.diamonds}>💎 {bonusData.totalBonus}</span>
                                {bonusData.streakBonus > 0 && (
                                    <span style={styles.streakBadge}>
                                        +{bonusData.streakBonus} 🔥
                                    </span>
                                )}
                            </div>
                            {bonusData.nextStreakBonus && (
                                <div style={styles.nextMilestone}>
                                    {bonusData.nextStreakBonus.daysUntil} more days = +{bonusData.nextStreakBonus.bonus}💎
                                </div>
                            )}
                        </>
                    )}
                </div>
                {!showAnimation && (
                    <motion.button
                        style={styles.claimButton}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={claimBonus}
                        disabled={claiming}
                    >
                        {claiming ? '...' : 'Claim'}
                    </motion.button>
                )}
            </div>
        </motion.div>
    );
}

const styles = {
    container: {
        position: 'relative',
        margin: '16px',
        padding: '16px 20px',
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 107, 53, 0.15))',
        borderRadius: '16px',
        border: '2px solid rgba(255, 215, 0, 0.4)',
        overflow: 'hidden'
    },
    glow: {
        position: 'absolute',
        top: '-50%',
        left: '-50%',
        width: '200%',
        height: '200%',
        background: 'radial-gradient(circle at center, rgba(255, 215, 0, 0.2), transparent 60%)',
        animation: 'pulse 2s ease-in-out infinite',
        pointerEvents: 'none'
    },
    content: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        zIndex: 1
    },
    icon: {
        fontSize: '40px',
        animation: 'bounce 1s ease-in-out infinite'
    },
    info: {
        flex: 1
    },
    title: {
        fontSize: '16px',
        fontWeight: 700,
        color: '#FFD700',
        marginBottom: '4px'
    },
    claimedTitle: {
        fontSize: '16px',
        fontWeight: 700,
        color: '#4ADE80',
        marginBottom: '4px'
    },
    amount: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    diamonds: {
        fontSize: '22px',
        fontWeight: 700,
        color: '#fff'
    },
    countingAmount: {
        fontSize: '28px',
        fontWeight: 800,
        color: '#00E0FF',
        textShadow: '0 0 20px rgba(0, 224, 255, 0.5)'
    },
    streakBadge: {
        fontSize: '12px',
        fontWeight: 600,
        padding: '2px 8px',
        background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
        borderRadius: '10px',
        color: '#fff'
    },
    nextMilestone: {
        fontSize: '11px',
        color: '#9ca3af',
        marginTop: '4px'
    },
    claimButton: {
        padding: '12px 28px',
        background: 'linear-gradient(135deg, #FFD700, #FF6B35)',
        border: 'none',
        borderRadius: '12px',
        color: '#000',
        fontWeight: 700,
        fontSize: '16px',
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(255, 215, 0, 0.4)'
    },
    flyingDiamond: {
        position: 'absolute',
        fontSize: '24px',
        zIndex: 100,
        left: '50%',
        top: '50%',
        pointerEvents: 'none'
    }
};
