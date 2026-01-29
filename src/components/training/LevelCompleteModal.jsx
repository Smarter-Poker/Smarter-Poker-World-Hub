/**
 * LevelCompleteModal — Shows results after completing a training level
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';

const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
    },
    modal: {
        background: 'linear-gradient(180deg, #1a1a3a 0%, #0a0a1a 100%)',
        borderRadius: '20px',
        padding: '32px',
        maxWidth: '400px',
        width: '90%',
        border: '2px solid rgba(255,255,255,0.1)',
        textAlign: 'center',
    },
    icon: {
        fontSize: '64px',
        marginBottom: '16px',
    },
    title: {
        color: '#fff',
        fontSize: '28px',
        fontWeight: '700',
        marginBottom: '8px',
    },
    subtitle: {
        color: '#94a3b8',
        fontSize: '16px',
        marginBottom: '24px',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '24px',
    },
    statBox: {
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '12px',
        padding: '12px',
    },
    statValue: {
        color: '#fff',
        fontSize: '24px',
        fontWeight: '700',
    },
    statLabel: {
        color: '#64748b',
        fontSize: '12px',
        marginTop: '4px',
    },
    xpRow: {
        background: 'linear-gradient(135deg, #f59e0b20, #d9770620)',
        border: '1px solid #f59e0b40',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '24px',
    },
    xpValue: {
        color: '#f59e0b',
        fontSize: '32px',
        fontWeight: '800',
    },
    buttonRow: {
        display: 'flex',
        gap: '12px',
    },
    button: {
        flex: 1,
        padding: '14px 24px',
        borderRadius: '10px',
        border: 'none',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        fontFamily: 'inherit',
    },
    primaryBtn: {
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        color: '#fff',
    },
    secondaryBtn: {
        background: 'rgba(255,255,255,0.1)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)',
    },
};

export default function LevelCompleteModal({
    level,
    passed,
    correctCount,
    totalQuestions,
    xpEarned,
    bestStreak,
    passThreshold,
    onNextLevel,
    onRetry,
    onExit,
    isMaxLevel = false,
}) {
    const accuracy = Math.round((correctCount / totalQuestions) * 100);

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.icon}>
                    {passed ? '🏆' : '💪'}
                </div>

                <h2 style={{
                    ...styles.title,
                    color: passed ? '#22c55e' : '#f59e0b'
                }}>
                    {passed
                        ? (isMaxLevel ? 'Game Mastered!' : 'Level Complete!')
                        : 'Level Failed'}
                </h2>

                <p style={styles.subtitle}>
                    {passed
                        ? (isMaxLevel
                            ? 'You achieved 100% mastery!'
                            : `You passed Level ${level}!`)
                        : `You needed ${passThreshold}% to pass`}
                </p>

                <div style={styles.statsGrid}>
                    <div style={styles.statBox}>
                        <div style={styles.statValue}>{correctCount}/{totalQuestions}</div>
                        <div style={styles.statLabel}>Correct</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statValue}>{accuracy}%</div>
                        <div style={styles.statLabel}>Accuracy</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statValue}>{bestStreak}</div>
                        <div style={styles.statLabel}>Best Streak</div>
                    </div>
                    <div style={styles.statBox}>
                        <div style={styles.statValue}>Lv.{level}</div>
                        <div style={styles.statLabel}>Level</div>
                    </div>
                </div>

                <div style={styles.xpRow}>
                    <div style={styles.statLabel}>XP Earned</div>
                    <div style={styles.xpValue}>+{xpEarned}</div>
                </div>

                <div style={styles.buttonRow}>
                    <button style={{ ...styles.button, ...styles.secondaryBtn }} onClick={onExit}>
                        Exit
                    </button>
                    {passed ? (
                        isMaxLevel ? (
                            <button style={{ ...styles.button, ...styles.primaryBtn }} onClick={onExit}>
                                Celebrate!
                            </button>
                        ) : (
                            <button style={{ ...styles.button, ...styles.primaryBtn }} onClick={onNextLevel}>
                                Next Level
                            </button>
                        )
                    ) : (
                        <button style={{ ...styles.button, ...styles.primaryBtn }} onClick={onRetry}>
                            Try Again
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
