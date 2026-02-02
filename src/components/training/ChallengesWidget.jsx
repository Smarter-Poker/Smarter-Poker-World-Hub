/**
 * 🎯 CHALLENGES WIDGET
 * ═══════════════════════════════════════════════════════════════════════════
 * Displays weekly/monthly challenges with progress on training lobby
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function ChallengesWidget({ userId, onChallengeClaimed }) {
    const [challenges, setChallenges] = useState({ weekly: [], monthly: [] });
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(null);

    useEffect(() => {
        if (userId) {
            fetchChallenges();
        }
    }, [userId]);

    const fetchChallenges = async () => {
        try {
            const res = await fetch(`/api/training/challenges?userId=${userId}`);
            const data = await res.json();
            if (data.success) {
                setChallenges({
                    weekly: data.weekly || [],
                    monthly: data.monthly || []
                });
            }
        } catch (e) {
            console.error('[ChallengesWidget] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const claimReward = async (challenge) => {
        if (!userId) return;
        setClaiming(challenge.id);

        try {
            const res = await fetch('/api/training/challenges', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    challengeId: challenge.id,
                    periodKey: challenge.periodKey
                })
            });
            const data = await res.json();
            if (data.success) {
                onChallengeClaimed?.(data.claimed);
                fetchChallenges(); // Refresh
            }
        } catch (e) {
            console.error('[ChallengesWidget] Claim error:', e);
        } finally {
            setClaiming(null);
        }
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingText}>Loading challenges...</div>
            </div>
        );
    }

    // Get top 2 challenges to show (prioritize incomplete, then completed unclaimed)
    const displayChallenges = [
        ...challenges.weekly.filter(c => !c.completed).slice(0, 1),
        ...challenges.monthly.filter(c => !c.completed).slice(0, 1),
        ...challenges.weekly.filter(c => c.completed && !c.claimed).slice(0, 1),
        ...challenges.monthly.filter(c => c.completed && !c.claimed).slice(0, 1),
    ].slice(0, 3);

    if (displayChallenges.length === 0) {
        return null; // Hide if no active challenges
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <span style={styles.title}>🎯 Active Challenges</span>
                <span style={styles.viewAll}>View All →</span>
            </div>

            <div style={styles.challengesList}>
                {displayChallenges.map((challenge, i) => (
                    <motion.div
                        key={challenge.id}
                        style={{
                            ...styles.challengeCard,
                            borderColor: challenge.completed ? '#FFD700' : 'rgba(255,255,255,0.1)'
                        }}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <div style={styles.challengeIcon}>{challenge.icon}</div>
                        <div style={styles.challengeInfo}>
                            <div style={styles.challengeName}>{challenge.name}</div>
                            <div style={styles.challengeProgress}>
                                {challenge.progress}/{challenge.target_value}
                                <span style={styles.challengeType}>
                                    {challenge.challenge_type === 'weekly' ? '📅 Weekly' : '📆 Monthly'}
                                </span>
                            </div>
                            <div style={styles.progressBar}>
                                <div
                                    style={{
                                        ...styles.progressFill,
                                        width: `${challenge.percentage}%`,
                                        background: challenge.completed
                                            ? 'linear-gradient(90deg, #FFD700, #FF6B35)'
                                            : '#00E0FF'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={styles.challengeReward}>
                            {challenge.completed && !challenge.claimed ? (
                                <button
                                    onClick={() => claimReward(challenge)}
                                    disabled={claiming === challenge.id}
                                    style={styles.claimButton}
                                >
                                    {claiming === challenge.id ? '...' : 'Claim'}
                                </button>
                            ) : (
                                <span style={styles.diamondReward}>
                                    💎 {challenge.diamond_reward}
                                </span>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    container: {
        margin: '16px',
        background: 'linear-gradient(180deg, rgba(255,215,0,0.05), transparent)',
        borderRadius: '16px',
        padding: '16px',
        border: '1px solid rgba(255,215,0,0.2)'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
    },
    title: {
        fontSize: '16px',
        fontWeight: 700,
        color: '#FFD700'
    },
    viewAll: {
        fontSize: '12px',
        color: '#9ca3af',
        cursor: 'pointer'
    },
    challengesList: {
        display: 'grid',
        gap: '10px'
    },
    challengeCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: '#1a1a1a',
        padding: '12px',
        borderRadius: '12px',
        border: '1px solid'
    },
    challengeIcon: {
        fontSize: '28px'
    },
    challengeInfo: {
        flex: 1
    },
    challengeName: {
        fontSize: '14px',
        fontWeight: 600,
        marginBottom: '4px',
        color: '#fff'
    },
    challengeProgress: {
        fontSize: '12px',
        color: '#9ca3af',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px'
    },
    challengeType: {
        fontSize: '10px',
        color: '#6b7280'
    },
    progressBar: {
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '2px',
        overflow: 'hidden'
    },
    progressFill: {
        height: '100%',
        borderRadius: '2px',
        transition: 'width 0.3s ease'
    },
    challengeReward: {
        textAlign: 'right'
    },
    diamondReward: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#00E0FF'
    },
    claimButton: {
        padding: '6px 16px',
        background: 'linear-gradient(135deg, #FFD700, #FF6B35)',
        border: 'none',
        borderRadius: '6px',
        color: '#000',
        fontWeight: 700,
        fontSize: '13px',
        cursor: 'pointer'
    },
    loadingText: {
        color: '#9ca3af',
        textAlign: 'center',
        padding: '20px'
    }
};
