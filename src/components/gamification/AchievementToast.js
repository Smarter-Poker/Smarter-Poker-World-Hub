/**
 * 🏆 AchievementToast Component - Specialized Achievement Notification
 * God-Mode Stack - Gamification
 * 
 * Features:
 * - Slide-in animation from right
 * - Achievement icon with glow
 * - Progress bar for series achievements
 * - Auto-dismiss with countdown
 * - Click to view details
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

export function AchievementToast({
    isVisible = false,
    icon = '🏆',
    title = 'Achievement Unlocked!',
    description,
    rarity = 'common', // 'common', 'rare', 'epic', 'legendary'
    progress,
    onDismiss,
    onClick,
    autoDismissMs = 5000,
}) {
    const [show, setShow] = useState(isVisible);

    const rarityColors = {
        common: { bg: '#4a5568', glow: '#718096' },
        rare: { bg: '#3182ce', glow: '#63b3ed' },
        epic: { bg: '#805ad5', glow: '#b794f4' },
        legendary: { bg: '#d69e2e', glow: '#f6e05e' },
    };
    const colors = rarityColors[rarity] || rarityColors.common;

    useEffect(() => {
        setShow(isVisible);

        if (isVisible && autoDismissMs > 0) {
            const timer = setTimeout(() => {
                setShow(false);
                if (onDismiss) onDismiss();
            }, autoDismissMs);
            return () => clearTimeout(timer);
        }
    }, [isVisible, autoDismissMs, onDismiss]);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ x: 400, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 400, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    style={{
                        position: 'fixed',
                        top: 20,
                        right: 20,
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: 16,
                        background: 'linear-gradient(135deg, rgba(20, 30, 50, 0.95), rgba(10, 20, 40, 0.98))',
                        borderRadius: 16,
                        border: `2px solid ${colors.glow}50`,
                        boxShadow: `0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px ${colors.glow}30`,
                        cursor: onClick ? 'pointer' : 'default',
                        backdropFilter: 'blur(10px)',
                        maxWidth: 350,
                    }}
                    onClick={onClick}
                    whileHover={onClick ? { scale: 1.02 } : {}}
                    whileTap={onClick ? { scale: 0.98 } : {}}
                >
                    {/* Icon Container */}
                    <motion.div
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            background: `linear-gradient(135deg, ${colors.bg}, ${colors.glow}50)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 28,
                            boxShadow: `0 0 20px ${colors.glow}40`,
                            flexShrink: 0,
                        }}
                        animate={{
                            boxShadow: [
                                `0 0 20px ${colors.glow}40`,
                                `0 0 30px ${colors.glow}60`,
                                `0 0 20px ${colors.glow}40`,
                            ],
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                    >
                        {icon}
                    </motion.div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Rarity Badge */}
                        <div style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            background: colors.bg,
                            borderRadius: 100,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: colors.glow,
                            marginBottom: 4,
                        }}>
                            {rarity}
                        </div>

                        {/* Title */}
                        <h4 style={{
                            margin: 0,
                            fontSize: 15,
                            fontWeight: 700,
                            color: '#fff',
                            fontFamily: 'Orbitron, sans-serif',
                        }}>
                            {title}
                        </h4>

                        {/* Description */}
                        {description && (
                            <p style={{
                                margin: '4px 0 0',
                                fontSize: 12,
                                color: 'rgba(255, 255, 255, 0.6)',
                                lineHeight: 1.3,
                            }}>
                                {description}
                            </p>
                        )}

                        {/* Progress Bar */}
                        {progress && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 10,
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: 4,
                                }}>
                                    <span>Progress</span>
                                    <span>{progress.current}/{progress.total}</span>
                                </div>
                                <div style={{
                                    height: 4,
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                                        transition={{ duration: 0.5, delay: 0.3 }}
                                        style={{
                                            height: '100%',
                                            background: `linear-gradient(90deg, ${colors.bg}, ${colors.glow})`,
                                            borderRadius: 2,
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Close Button */}
                    <motion.button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShow(false);
                            if (onDismiss) onDismiss();
                        }}
                        style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 20,
                            height: 20,
                            border: 'none',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '50%',
                            color: 'rgba(255, 255, 255, 0.5)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                        }}
                        whileHover={{ background: 'rgba(255, 255, 255, 0.2)' }}
                    >
                        ×
                    </motion.button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default AchievementToast;
