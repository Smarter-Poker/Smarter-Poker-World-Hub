/**
 * 🎉 LevelUpOverlay Component - Full-Screen Level Up Celebration
 * God-Mode Stack - Gamification
 * 
 * Features:
 * - Full-screen overlay with backdrop blur
 * - Animated level badge
 * - Confetti explosion
 * - Sound effect trigger
 * - Auto-dismiss after animation
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

export default function LevelUpOverlay({
    isVisible = false,
    level = 1,
    title = 'Level Up!',
    subtitle,
    rewards = [],
    onComplete,
    autoDismissMs = 4000,
}) {
    const [show, setShow] = useState(isVisible);

    useEffect(() => {
        setShow(isVisible);

        if (isVisible) {
            // Trigger confetti burst
            const duration = 3000;
            const end = Date.now() + duration;

            const frame = () => {
                confetti({
                    particleCount: 3,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0, y: 0.7 },
                    colors: ['#FFD700', '#00D4FF', '#00ff88'],
                });
                confetti({
                    particleCount: 3,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1, y: 0.7 },
                    colors: ['#FFD700', '#00D4FF', '#00ff88'],
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            };
            frame();

            // Center burst
            setTimeout(() => {
                confetti({
                    particleCount: 100,
                    spread: 100,
                    origin: { y: 0.5 },
                    colors: ['#FFD700', '#00D4FF', '#00ff88', '#ff6600'],
                });
            }, 500);

            // Auto dismiss
            if (autoDismissMs > 0) {
                const timer = setTimeout(() => {
                    setShow(false);
                    if (onComplete) onComplete();
                }, autoDismissMs);
                return () => clearTimeout(timer);
            }
        }
    }, [isVisible, autoDismissMs, onComplete]);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0, 0, 0, 0.8)',
                        backdropFilter: 'blur(10px)',
                    }}
                    onClick={() => {
                        setShow(false);
                        if (onComplete) onComplete();
                    }}
                >
                    {/* Content Container */}
                    <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{
                            type: 'spring',
                            stiffness: 200,
                            damping: 15,
                            delay: 0.1,
                        }}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 24,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Level Badge */}
                        <motion.div
                            style={{
                                width: 150,
                                height: 150,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #FFD700, #ff8c00, #ff6600)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 0 60px rgba(255, 215, 0, 0.6), 0 0 120px rgba(255, 215, 0, 0.3)',
                                position: 'relative',
                            }}
                            animate={{
                                scale: [1, 1.1, 1],
                                boxShadow: [
                                    '0 0 60px rgba(255, 215, 0, 0.6), 0 0 120px rgba(255, 215, 0, 0.3)',
                                    '0 0 80px rgba(255, 215, 0, 0.8), 0 0 160px rgba(255, 215, 0, 0.4)',
                                    '0 0 60px rgba(255, 215, 0, 0.6), 0 0 120px rgba(255, 215, 0, 0.3)',
                                ],
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: 'easeInOut',
                            }}
                        >
                            {/* Inner Ring */}
                            <div style={{
                                width: 130,
                                height: 130,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '3px solid rgba(255, 215, 0, 0.5)',
                            }}>
                                <span style={{
                                    fontSize: 48,
                                    fontWeight: 900,
                                    fontFamily: 'Orbitron, sans-serif',
                                    color: '#FFD700',
                                    textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
                                }}>
                                    {level}
                                </span>
                            </div>

                            {/* Orbiting Star */}
                            <motion.div
                                style={{
                                    position: 'absolute',
                                    width: 24,
                                    height: 24,
                                }}
                                animate={{
                                    rotate: 360,
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: 'linear',
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    top: -80,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    fontSize: 20,
                                }}>
                                    ⭐
                                </span>
                            </motion.div>
                        </motion.div>

                        {/* Title */}
                        <motion.h1
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            style={{
                                fontSize: 48,
                                fontWeight: 900,
                                fontFamily: 'Orbitron, sans-serif',
                                background: 'linear-gradient(135deg, #FFD700, #00D4FF)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                textAlign: 'center',
                                margin: 0,
                                textShadow: '0 0 40px rgba(255, 215, 0, 0.3)',
                            }}
                        >
                            {title}
                        </motion.h1>

                        {/* Subtitle */}
                        {subtitle && (
                            <motion.p
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                style={{
                                    fontSize: 18,
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    textAlign: 'center',
                                    margin: 0,
                                }}
                            >
                                {subtitle}
                            </motion.p>
                        )}

                        {/* Rewards */}
                        {rewards.length > 0 && (
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                style={{
                                    display: 'flex',
                                    gap: 16,
                                    marginTop: 16,
                                }}
                            >
                                {rewards.map((reward, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.6 + i * 0.1, type: 'spring' }}
                                        style={{
                                            padding: '12px 20px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            borderRadius: 12,
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        <span>{reward.icon}</span>
                                        <span style={{
                                            fontWeight: 700,
                                            color: '#FFD700',
                                        }}>
                                            +{reward.amount}
                                        </span>
                                        <span style={{
                                            color: 'rgba(255, 255, 255, 0.7)',
                                            fontSize: 14,
                                        }}>
                                            {reward.label}
                                        </span>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}

                        {/* Tap to continue */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ delay: 1, duration: 2, repeat: Infinity }}
                            style={{
                                fontSize: 14,
                                color: 'rgba(255, 255, 255, 0.5)',
                                marginTop: 24,
                            }}
                        >
                            Tap anywhere to continue
                        </motion.p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
