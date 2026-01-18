/**
 * 🔥 StreakFire Component - Animated Fire Effect for Streaks
 * God-Mode Stack - Gamification Visual
 * 
 * Features:
 * - Animated flame particles
 * - Intensity scales with streak count
 * - Pulsing glow effect
 * - CSS-based for performance
 */

import { motion } from 'framer-motion';

export default function StreakFire({
    streak = 0,
    size = 'medium',
    showCount = true,
}) {
    // Intensity based on streak
    const intensity = Math.min(streak / 30, 1); // Max at 30-day streak
    const isOnFire = streak >= 3;

    const sizeMap = {
        small: { container: 40, font: 14, icon: 20 },
        medium: { container: 60, font: 20, icon: 28 },
        large: { container: 80, font: 28, icon: 40 },
    };
    const sizes = sizeMap[size] || sizeMap.medium;

    if (streak === 0) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                opacity: 0.5,
            }}>
                <span style={{ fontSize: sizes.icon }}>🔥</span>
                {showCount && (
                    <span style={{
                        fontSize: sizes.font,
                        fontWeight: 700,
                        color: 'rgba(255, 255, 255, 0.5)',
                    }}>
                        0
                    </span>
                )}
            </div>
        );
    }

    return (
        <motion.div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                position: 'relative',
            }}
            animate={isOnFire ? {
                scale: [1, 1.05, 1],
            } : {}}
            transition={{
                duration: 0.5,
                repeat: Infinity,
                repeatType: 'reverse',
            }}
        >
            {/* Fire Container */}
            <div style={{
                position: 'relative',
                width: sizes.container,
                height: sizes.container,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {/* Glow Effect */}
                <motion.div
                    style={{
                        position: 'absolute',
                        inset: -10,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, rgba(255, 100, 0, ${0.3 + intensity * 0.4}), transparent 70%)`,
                        filter: 'blur(8px)',
                    }}
                    animate={{
                        opacity: [0.5 + intensity * 0.3, 0.8 + intensity * 0.2, 0.5 + intensity * 0.3],
                        scale: [1, 1.1, 1],
                    }}
                    transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />

                {/* Fire Particles */}
                {isOnFire && [...Array(3)].map((_, i) => (
                    <motion.div
                        key={i}
                        style={{
                            position: 'absolute',
                            width: 6 + Math.random() * 6,
                            height: 6 + Math.random() * 6,
                            borderRadius: '50%',
                            background: `linear-gradient(to top, #ff4500, #ff6600, #ffcc00)`,
                            left: '50%',
                            bottom: '30%',
                            filter: 'blur(1px)',
                        }}
                        animate={{
                            y: [-10, -30 - Math.random() * 20],
                            x: [0, (Math.random() - 0.5) * 20],
                            opacity: [1, 0],
                            scale: [1, 0.5],
                        }}
                        transition={{
                            duration: 0.6 + Math.random() * 0.4,
                            repeat: Infinity,
                            delay: i * 0.2,
                            ease: 'easeOut',
                        }}
                    />
                ))}

                {/* Fire Emoji */}
                <motion.span
                    style={{
                        fontSize: sizes.icon,
                        position: 'relative',
                        zIndex: 1,
                        filter: `drop-shadow(0 0 ${4 + intensity * 8}px rgba(255, 100, 0, ${0.5 + intensity * 0.5}))`,
                    }}
                    animate={isOnFire ? {
                        rotate: [-3, 3, -3],
                        y: [0, -2, 0],
                    } : {}}
                    transition={{
                        duration: 0.3,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                >
                    🔥
                </motion.span>
            </div>

            {/* Streak Count */}
            {showCount && (
                <motion.span
                    style={{
                        fontSize: sizes.font,
                        fontWeight: 800,
                        fontFamily: 'Orbitron, sans-serif',
                        background: isOnFire
                            ? 'linear-gradient(135deg, #ff6600, #ff4500, #ff0000)'
                            : 'linear-gradient(135deg, #ff8c00, #ff6600)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        textShadow: isOnFire ? '0 0 20px rgba(255, 100, 0, 0.5)' : 'none',
                    }}
                    animate={isOnFire ? {
                        scale: [1, 1.05, 1],
                    } : {}}
                    transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        repeatType: 'reverse',
                    }}
                >
                    {streak}
                </motion.span>
            )}

            {/* Streak Label for large size */}
            {size === 'large' && (
                <span style={{
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.6)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                }}>
                    day streak
                </span>
            )}
        </motion.div>
    );
}
