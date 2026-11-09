/**
 * CHALLENGES WIDGET (#SMARTERCASINOREALISM)
 * ---------------------------------------------------------------------------
 * Displays weekly/monthly challenges with progress on training lobby
 * ---------------------------------------------------------------------------
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { authedFetch } from '../../lib/authUtils';

export default function ChallengesWidget({ userId }) {
    const [challenges, setChallenges] = useState({ weekly: [], monthly: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            fetchChallenges();
        }
    }, [userId]);

    const fetchChallenges = async () => {
        try {
            const res = await authedFetch(`/api/training/challenges?userId=${userId}`);
            const data = await res.json();
            if (data.success) {
                setChallenges({
                    weekly: data.weekly || [],
                    monthly: data.monthly || []
                });
            }
        } catch (e) {
            console.warn('[ChallengesWidget] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingText}>Loading Challenges...</div>
            </div>
        );
    }

    // Get top challenges to show (prioritize incomplete, then completed unclaimed)
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
                <div style={styles.headerTitleGroup}>
                    <span style={styles.kicker}>Smarter Casino Realism · Challenge Telemetry</span>
                    <span style={styles.title}>Active Challenges</span>
                </div>
                <Link href="/hub/training/challenges" style={styles.viewAll}>
                    View All ›
                </Link>
            </div>

            <div style={styles.challengesList}>
                {displayChallenges.map((challenge, i) => (
                    <motion.div
                        key={challenge.id}
                        style={{
                            ...styles.challengeCard,
                            borderColor: challenge.completed ? '#f2b84b' : '#2f4552'
                        }}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <div style={styles.challengeIcon}>
                            {challenge.challenge_type === 'weekly' ? 'W' : 'M'}
                        </div>
                        <div style={styles.challengeInfo}>
                            <div style={styles.challengeName}>{challenge.name}</div>
                            <div style={styles.challengeProgress}>
                                {challenge.progress}/{challenge.target_value}
                                <span style={styles.challengeType}>
                                    {challenge.challenge_type === 'weekly' ? 'Weekly' : 'Monthly'}
                                </span>
                            </div>
                            <div style={styles.progressBar}>
                                <div
                                    style={{
                                        ...styles.progressFill,
                                        width: `${challenge.percentage}%`,
                                        background: challenge.completed
                                            ? 'linear-gradient(90deg, #b87e1b, #f2b84b)'
                                            : 'linear-gradient(90deg, #0d6a8c, #25c8ff)'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={styles.challengeReward}>
                            {challenge.completed && !challenge.claimed ? (
                                <span
                                    style={{ ...styles.statusBadge, color: '#f2b84b', borderColor: 'rgba(242,184,75,0.45)' }}
                                    title="Claims Reopen After Verified Challenge Settlement Is Certified"
                                >
                                    Verified Claim Pending
                                </span>
                            ) : (
                                <span style={styles.statusBadge}>
                                    Tracking Paused
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
        background: 'linear-gradient(180deg, #0c171e, #050c10)',
        borderRadius: '2px',
        padding: '16px',
        border: '1px solid #354d5b',
        boxShadow: 'inset 0 0 0 3px #020608, inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 32px rgba(0,0,0,0.45)'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '10px',
        borderBottom: '1px solid #1f333f'
    },
    headerTitleGroup: {
        display: 'grid',
        gap: '2px'
    },
    kicker: {
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#f2b84b',
        fontFamily: 'var(--font-orbitron), Orbitron, sans-serif'
    },
    title: {
        fontSize: '18px',
        fontWeight: 700,
        color: '#f0f7fa',
        fontFamily: 'var(--font-rajdhani), Rajdhani, sans-serif'
    },
    viewAll: {
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: '34px',
        padding: '0 12px',
        border: '1px solid #25c8ff',
        borderRadius: '2px',
        background: 'linear-gradient(180deg, #102a38, #07131a)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#dff6ff',
        textDecoration: 'none',
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
        background: 'linear-gradient(180deg, #101d25, #070e13)',
        padding: '12px',
        borderRadius: '2px',
        border: '1px solid #2f4552',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
    },
    challengeIcon: {
        width: '36px',
        height: '36px',
        display: 'grid',
        placeItems: 'center',
        border: '1px solid #3c5665',
        borderRadius: '2px',
        background: '#050c10',
        color: '#25c8ff',
        fontSize: '13px',
        fontWeight: 800,
        fontFamily: 'var(--font-orbitron), Orbitron, sans-serif'
    },
    challengeInfo: {
        flex: 1
    },
    challengeName: {
        fontSize: '14px',
        fontWeight: 700,
        marginBottom: '4px',
        color: '#edf5f8'
    },
    challengeProgress: {
        fontSize: '12px',
        color: '#8da3af',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '6px',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace'
    },
    challengeType: {
        fontSize: '10px',
        color: '#f2b84b',
        textTransform: 'uppercase',
        letterSpacing: '0.08em'
    },
    progressBar: {
        height: '6px',
        background: '#03080b',
        border: '1px solid #263944',
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
    statusBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 8px',
        border: '1px solid rgba(37,200,255,0.35)',
        borderRadius: '2px',
        background: 'rgba(37,200,255,0.08)',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#7ddfff'
    },
    loadingText: {
        color: '#8da3af',
        textAlign: 'center',
        padding: '20px',
        fontSize: '12px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase'
    }
};
