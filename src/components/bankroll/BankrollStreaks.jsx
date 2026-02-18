/**
 * BANKROLL STREAKS COMPONENT
 * Gamification with logging streaks and achievements
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// Clean Facebook-style achievements (no emojis)
const ACHIEVEMENTS = [
    { key: 'first_log', name: 'First Entry', icon: '', desc: 'Log your first session', diamonds: 10 },
    { key: 'streak_7', name: 'Week Warrior', icon: '', desc: '7-day logging streak', diamonds: 50 },
    { key: 'streak_30', name: 'Monthly Master', icon: '', desc: '30-day logging streak', diamonds: 200 },
    { key: 'streak_100', name: 'Century Club', icon: '', desc: '100-day logging streak', diamonds: 500 },
    { key: 'win_streak_5', name: 'Hot Streak', icon: '', desc: '5 winning sessions in a row', diamonds: 100 },
    { key: 'sessions_50', name: 'Dedicated Player', icon: '', desc: 'Log 50 sessions', diamonds: 150 },
    { key: 'sessions_100', name: 'Pro Logger', icon: '', desc: 'Log 100 sessions', diamonds: 300 },
    { key: 'positive_month', name: 'Green Month', icon: '', desc: 'Finish a month profitable', diamonds: 100 },
];

export default function BankrollStreaks({ userId, streakData, isLoading }) {
    const [expanded, setExpanded] = useState(false);

    const streak = streakData || {
        currentStreak: 0,
        longestStreak: 0,
        totalLogs: 0,
        winStreak: 0,
        lossStreak: 0,
        achievements: [],
    };

    const unlockedAchievements = streak.achievements || [];
    const lockedAchievements = ACHIEVEMENTS.filter(
        a => !unlockedAchievements.includes(a.key)
    );

    const getStreakMessage = (days) => {
        if (days === 0) return "Start your streak today!";
        if (days === 1) return "Keep it up!";
        if (days < 7) return "Building momentum...";
        if (days < 30) return "You're on fire!";
        return "Legendary streak!";
    };

    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingSkeleton}>
                    <div style={styles.skeletonLine} />
                    <div style={styles.skeletonCircle} />
                </div>
            </div>
        );
    }

    if (!userId) {
        return (
            <div style={styles.container}>
                <div style={styles.signInPrompt}>
                    <span>Sign In To Track Streaks</span>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Streak Counter */}
            <div style={styles.streakHeader}>
                <div style={styles.streakMain}>
                    <motion.div
                        style={styles.streakNumber}
                        animate={{ scale: streak.currentStreak > 0 ? [1, 1.05, 1] : 1 }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        {streak.currentStreak}
                    </motion.div>
                    <div style={styles.streakLabel}>
                        <span>Day Streak</span>
                        <span style={styles.streakMessage}>
                            {getStreakMessage(streak.currentStreak)}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => setExpanded(!expanded)}
                    style={styles.expandBtn}
                >
                    {expanded ? '▲' : '▼'}
                </button>
            </div>

            {/* Quick Stats */}
            <div style={styles.statsRow}>
                <div style={styles.statItem}>
                    <span style={styles.statValue}>{streak.longestStreak}</span>
                    <span style={styles.statLabel}>Best</span>
                </div>
                <div style={styles.statItem}>
                    <span style={styles.statValue}>{streak.totalLogs}</span>
                    <span style={styles.statLabel}>Total</span>
                </div>
                <div style={styles.statItem}>
                    <span style={{ ...styles.statValue, color: '#22c55e' }}>
                        {streak.winStreak}
                    </span>
                    <span style={styles.statLabel}>Win Streak</span>
                </div>
            </div>

            {/* Expanded Achievements */}
            {expanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    style={styles.achievementsSection}
                >
                    <div style={styles.sectionTitle}>Achievements</div>

                    {/* Unlocked */}
                    {unlockedAchievements.length > 0 && (
                        <div style={styles.achievementGrid}>
                            {ACHIEVEMENTS.filter(a => unlockedAchievements.includes(a.key))
                                .map(ach => (
                                    <div key={ach.key} style={styles.achievement}>
                                        <span style={styles.achievementIcon}>{ach.icon}</span>
                                        <span style={styles.achievementName}>{ach.name}</span>
                                        <span style={styles.achievementCheck}>✓</span>
                                    </div>
                                ))}
                        </div>
                    )}

                    {/* Locked */}
                    <div style={styles.lockedSection}>
                        <div style={styles.lockedTitle}>Coming Up</div>
                        <div style={styles.achievementGrid}>
                            {lockedAchievements.slice(0, 4).map(ach => (
                                <div key={ach.key} style={{ ...styles.achievement, opacity: 0.5 }}>
                                    <span style={styles.achievementIcon}>{ach.icon}</span>
                                    <span style={styles.achievementName}>{ach.name}</span>
                                    <span style={styles.diamondReward}>{ach.diamonds}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(135deg, rgba(40,20,20,0.9), rgba(60,30,30,0.8))',
        borderRadius: 12,
        border: '1px solid rgba(255,107,53,0.3)',
        padding: 14,
        marginBottom: 16,
    },
    streakHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    streakMain: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    streakNumber: {
        fontSize: 36,
        fontWeight: 800,
        background: 'linear-gradient(135deg, #ff6b35, #ff9f1c)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1,
    },
    streakLabel: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        color: '#fff',
        fontSize: 14,
        fontWeight: 500,
    },
    streakMessage: {
        fontSize: 14,
        color: '#888',
    },
    expandBtn: {
        padding: 8,
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: 6,
        color: '#888',
        cursor: 'pointer',
    },
    statsRow: {
        display: 'flex',
        justifyContent: 'space-around',
        padding: '10px 0',
        borderTop: '1px solid rgba(255,255,255,0.1)',
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
    },
    statValue: {
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
    },
    statLabel: {
        fontSize: 14,
        color: '#666',
        textTransform: 'uppercase',
    },
    achievementsSection: {
        paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.1)',
        marginTop: 12,
        overflow: 'hidden',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#ff6b35',
        marginBottom: 10,
    },
    achievementGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
    },
    achievement: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
    },
    achievementIcon: {
        fontSize: 16,
    },
    achievementName: {
        flex: 1,
        fontSize: 14,
        color: '#fff',
    },
    achievementCheck: {
        color: '#22c55e',
        fontSize: 14,
    },
    diamondReward: {
        fontSize: 14,
        color: '#2374e1',
    },
    lockedSection: {
        marginTop: 12,
    },
    lockedTitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    loadingSkeleton: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 10,
    },
    skeletonLine: {
        flex: 1,
        height: 20,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 4,
    },
    skeletonCircle: {
        width: 40,
        height: 40,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '50%',
    },
    signInPrompt: {
        display: 'flex',
        justifyContent: 'center',
        padding: 20,
        color: '#666',
        fontSize: 14,
    },
};
