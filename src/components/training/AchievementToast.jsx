/**
 * 🏅 ACHIEVEMENT TOAST
 * ═══════════════════════════════════════════════════════════════════════════
 * Notification component for newly unlocked achievements
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function AchievementToast({ achievements = [], onDismiss, userId }) {
    const [visible, setVisible] = useState(achievements.length > 0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        if (achievements.length === 0) return;
        setVisible(true);
        setCurrentIndex(0);
    }, [achievements]);

    useEffect(() => {
        if (!visible || achievements.length === 0) return;

        const timer = setTimeout(() => {
            if (currentIndex < achievements.length - 1) {
                setCurrentIndex(i => i + 1);
            } else {
                setVisible(false);
                onDismiss?.();
            }
        }, 6000); // Increased to give time to share

        return () => clearTimeout(timer);
    }, [visible, currentIndex, achievements.length, onDismiss]);

    const handleShare = async (achievement) => {
        if (!userId || sharing) return;
        setSharing(true);

        try {
            const res = await fetch('/api/training/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    shareType: 'achievement',
                    data: {
                        name: achievement.name,
                        description: achievement.description,
                        icon: achievement.icon,
                        diamonds: achievement.diamond_reward
                    }
                })
            });

            const data = await res.json();
            if (data.success) {
                // Show confirmation
                alert('🎉 Shared to your feed!');
            }
        } catch (error) {
            console.error('Share error:', error);
        } finally {
            setSharing(false);
        }
    };

    const achievement = achievements[currentIndex];
    if (!achievement || !visible) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ x: 400, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 400, opacity: 0 }}
                transition={{ type: 'spring', damping: 20 }}
                style={styles.container}
            >
                <div style={styles.iconWrapper}>
                    <span style={styles.icon}>{achievement.icon || '🏅'}</span>
                </div>
                <div style={styles.content}>
                    <div style={styles.label}>Achievement Unlocked!</div>
                    <div style={styles.name}>{achievement.name}</div>
                    {achievement.diamond_reward > 0 && (
                        <div style={styles.reward}>
                            +{achievement.diamond_reward} 💎
                        </div>
                    )}
                </div>
                <div style={styles.actions}>
                    {userId && (
                        <button
                            onClick={() => handleShare(achievement)}
                            disabled={sharing}
                            style={styles.shareBtn}
                        >
                            {sharing ? '...' : '📢'}
                        </button>
                    )}
                    <button
                        onClick={() => { setVisible(false); onDismiss?.(); }}
                        style={styles.closeBtn}
                    >
                        ✕
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

const styles = {
    container: {
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        border: '2px solid #fbbf24',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(251, 191, 36, 0.3)',
        zIndex: 99999,
        minWidth: 280,
    },
    iconWrapper: {
        width: 56,
        height: 56,
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        fontSize: 28,
    },
    content: {
        flex: 1,
    },
    label: {
        fontSize: 11,
        fontWeight: 600,
        color: '#fbbf24',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    name: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        marginTop: 2,
    },
    reward: {
        fontSize: 14,
        fontWeight: 600,
        color: '#22d3ee',
        marginTop: 4,
    },
    actions: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    shareBtn: {
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 16,
        cursor: 'pointer',
        padding: '8px 12px',
        fontWeight: 600,
    },
    closeBtn: {
        background: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 16,
        cursor: 'pointer',
        padding: 4,
    }
};

