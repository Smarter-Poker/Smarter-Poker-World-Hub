/**
 * 🔥 TRAINING STREAK COMPONENT
 * Shows current streak, milestones, and claimable rewards
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function TrainingStreak({ userId, compact = false, onStreakUpdate }) {
    const [streak, setStreak] = useState(null);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(null);

    useEffect(() => {
        if (userId) fetchStreak();
    }, [userId]);

    const fetchStreak = async () => {
        try {
            const res = await fetch(`/api/training/streak?userId=${userId}`);
            const data = await res.json();
            if (data.success) {
                setStreak(data.streak);
            }
        } catch (error) {
            console.error('Failed to fetch streak:', error);
        }
        setLoading(false);
    };

    const claimMilestone = async (days) => {
        setClaiming(days);
        try {
            const res = await fetch('/api/training/streak', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, milestoneDays: days })
            });
            const data = await res.json();
            if (data.success) {
                fetchStreak();
                onStreakUpdate?.({ claimed: data.claimed, diamonds: data.diamondsAwarded });
            }
        } catch (error) {
            console.error('Failed to claim:', error);
        }
        setClaiming(null);
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loading}>Loading streak...</div>
            </div>
        );
    }

    const currentStreak = streak?.currentStreak || 0;
    const nextMilestone = streak?.nextMilestone;
    const claimable = streak?.claimableMilestones || [];

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h3 style={styles.title}>🔥 Training Streak</h3>
            </div>

            {/* Current Streak Display */}
            <div style={styles.streakDisplay}>
                <motion.div
                    style={styles.streakNumber}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                >
                    {currentStreak}
                </motion.div>
                <div style={styles.streakLabel}>
                    {currentStreak === 1 ? 'Day' : 'Days'}
                </div>
                {streak?.longestStreak > currentStreak && (
                    <div style={styles.longestStreak}>
                        Personal Best: {streak.longestStreak} days
                    </div>
                )}
            </div>

            {/* Claimable Rewards */}
            {claimable.length > 0 && (
                <div style={styles.claimableSection}>
                    <div style={styles.claimableTitle}>🎁 Claim Your Rewards!</div>
                    {claimable.map(m => (
                        <motion.button
                            key={m.days}
                            onClick={() => claimMilestone(m.days)}
                            disabled={claiming === m.days}
                            style={styles.claimBtn}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <span>{m.name}</span>
                            <span style={styles.claimReward}>
                                💎 {m.diamonds}
                            </span>
                        </motion.button>
                    ))}
                </div>
            )}

            {/* Next Milestone */}
            {nextMilestone && (
                <div style={styles.nextMilestone}>
                    <div style={styles.nextLabel}>Next Milestone</div>
                    <div style={styles.nextInfo}>
                        <span>{nextMilestone.name}</span>
                        <span style={{ color: '#888' }}>
                            {nextMilestone.days - currentStreak} days to go
                        </span>
                    </div>
                    <div style={styles.progressBar}>
                        <div
                            style={{
                                ...styles.progressFill,
                                width: `${(currentStreak / nextMilestone.days) * 100}%`
                            }}
                        />
                    </div>
                    <div style={styles.rewardPreview}>
                        Reward: 💎 {nextMilestone.diamonds}
                    </div>
                </div>
            )}

            {/* Milestones Overview (non-compact) */}
            {!compact && streak?.allMilestones && (
                <div style={styles.allMilestones}>
                    <div style={styles.milestonesTitle}>All Milestones</div>
                    <div style={styles.milestoneGrid}>
                        {streak.allMilestones.map(m => (
                            <div
                                key={m.days}
                                style={{
                                    ...styles.milestone,
                                    opacity: m.achieved ? 1 : 0.4,
                                    borderColor: m.claimed ? '#22c55e' : m.achieved ? '#ffd700' : '#333'
                                }}
                            >
                                <div style={styles.mDays}>{m.days}d</div>
                                <div style={styles.mReward}>💎 {m.diamonds}</div>
                                {m.claimed && <span style={styles.claimed}>✓</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(0,0,0,0.8), rgba(40,20,20,0.9))',
        borderRadius: 16,
        border: '1px solid rgba(255,107,53,0.3)',
        padding: 20
    },
    header: {
        marginBottom: 16
    },
    title: {
        margin: 0,
        fontSize: 18,
        fontWeight: 700,
        color: '#ff6b35'
    },
    loading: {
        textAlign: 'center',
        padding: 20,
        color: '#666'
    },
    streakDisplay: {
        textAlign: 'center',
        padding: '20px 0'
    },
    streakNumber: {
        fontSize: 64,
        fontWeight: 800,
        background: 'linear-gradient(135deg, #ff6b35, #ff9f1c)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
    },
    streakLabel: {
        fontSize: 16,
        color: '#888',
        marginTop: -8
    },
    longestStreak: {
        marginTop: 8,
        fontSize: 12,
        color: '#666'
    },
    claimableSection: {
        background: 'rgba(255,215,0,0.1)',
        borderRadius: 12,
        padding: 12,
        marginTop: 16
    },
    claimableTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#ffd700',
        marginBottom: 10
    },
    claimBtn: {
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        background: 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,215,0,0.1))',
        border: '1px solid rgba(255,215,0,0.5)',
        borderRadius: 10,
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        marginBottom: 8
    },
    claimReward: {
        color: '#00d4ff',
        fontWeight: 600
    },
    nextMilestone: {
        marginTop: 20,
        padding: 16,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 12
    },
    nextLabel: {
        fontSize: 11,
        color: '#666',
        textTransform: 'uppercase',
        marginBottom: 6
    },
    nextInfo: {
        display: 'flex',
        justifyContent: 'space-between',
        color: '#fff',
        fontSize: 14,
        marginBottom: 10
    },
    progressBar: {
        height: 6,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #ff6b35, #ff9f1c)',
        borderRadius: 3
    },
    rewardPreview: {
        marginTop: 8,
        fontSize: 12,
        color: '#00d4ff'
    },
    allMilestones: {
        marginTop: 20
    },
    milestonesTitle: {
        fontSize: 12,
        color: '#888',
        marginBottom: 10
    },
    milestoneGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8
    },
    milestone: {
        padding: 8,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        border: '1px solid',
        textAlign: 'center',
        position: 'relative'
    },
    mDays: {
        fontSize: 12,
        fontWeight: 600,
        color: '#fff'
    },
    mReward: {
        fontSize: 10,
        color: '#888'
    },
    claimed: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 16,
        height: 16,
        background: '#22c55e',
        borderRadius: '50%',
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    }
};

export default TrainingStreak;
