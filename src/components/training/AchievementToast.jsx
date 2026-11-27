/**
 * ACHIEVEMENT TOAST
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Notification component for newly unlocked achievements
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function AchievementToast({ achievements = [], onDismiss }) {
    const [visible, setVisible] = useState(achievements.length > 0);
    const [currentIndex, setCurrentIndex] = useState(0);

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
        }, 6000); // Keep the notice visible long enough to read.

        return () => clearTimeout(timer);
    }, [visible, currentIndex, achievements.length, onDismiss]);

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
                    <span style={styles.icon}>{achievement.icon || '★'}</span>
                </div>
                <div style={styles.content}>
                    <div style={styles.label}>Achievement Unlocked!</div>
                    <div style={styles.name}>{achievement.name}</div>
                    {achievement.diamond_reward > 0 && (
                        <div style={styles.reward}>
                            +{achievement.diamond_reward} Diamonds
                        </div>
                    )}
                </div>
                <div style={styles.actions}>
                    <button
                        type="button"
                        disabled
                        aria-label="Achievement feed sharing is unavailable"
                        title="Feed Sharing Reopens After Verified Achievement Settlement Is Certified"
                        style={{ ...styles.shareBtn, cursor: 'not-allowed', opacity: 0.55 }}
                    >
                        Share Unavailable
                    </button>
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
        gap: 14,
        padding: '16px 18px',
        background: 'linear-gradient(165deg, #0c2031 0%, #040d18 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
        border: '2px solid transparent',
        borderRadius: 16,
        boxShadow: '0 14px 40px rgba(0, 0, 0, 0.72), 0 0 24px rgba(81, 201, 255, 0.22)',
        zIndex: 99999,
        minWidth: 280,
    },
    iconWrapper: {
        width: 52,
        height: 52,
        background: 'linear-gradient(180deg, #51c9ff 0%, #0873ff 18%, #022695 100%)',
        border: '1px solid #b9efff',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
    },
    icon: {
        fontSize: 26,
    },
    content: {
        flex: 1,
    },
    label: {
        fontSize: 12,
        fontWeight: 700,
        color: '#8de6ff',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    name: {
        fontSize: 16,
        fontWeight: 700,
        color: '#f3f7fb',
        marginTop: 2,
    },
    reward: {
        fontSize: 14,
        fontWeight: 600,
        color: '#8de6ff',
        marginTop: 4,
    },
    actions: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
    },
    shareBtn: {
        background: 'linear-gradient(180deg, #51c9ff 0%, #0873ff 10%, #0648e2 38%, #022695 82%, #0b71c4 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 18%, #e6f7ff 45%, #4c6470 72%, #e6f4fa 100%) border-box',
        border: '2px solid transparent',
        borderRadius: 10,
        color: '#ffffff',
        fontSize: 13,
        cursor: 'pointer',
        minHeight: 44,
        padding: '8px 12px',
        fontWeight: 700,
    },
    closeBtn: {
        background: 'linear-gradient(180deg, #34434c 0%, #0d1b25 12%, #030a0e 52%, #07151d 86%, #142e3b 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 18%, #e6f7ff 45%, #4c6470 72%, #e6f4fa 100%) border-box',
        border: '2px solid transparent',
        borderRadius: 10,
        color: '#f3f7fb',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        minWidth: 44,
        minHeight: 44,
        padding: 0,
    }
};
