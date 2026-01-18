/**
 * 🎨 LOADING SPINNER
 * Animated loading spinner with multiple variants
 */

import { motion } from 'framer-motion';
import { rotate } from '../../utils/animations';

export default function LoadingSpinner({
    size = 40,
    color = '#00d4ff',
    variant = 'circle',
}) {
    if (variant === 'circle') {
        return (
            <motion.div
                variants={rotate}
                animate="animate"
                style={{
                    width: size,
                    height: size,
                    border: `3px solid rgba(255, 255, 255, 0.1)`,
                    borderTop: `3px solid ${color}`,
                    borderRadius: '50%',
                }}
            />
        );
    }

    if (variant === 'dots') {
        return (
            <div style={{ display: 'flex', gap: 8 }}>
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        animate={{
                            y: [0, -10, 0],
                        }}
                        transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            delay: i * 0.2,
                        }}
                        style={{
                            width: size / 4,
                            height: size / 4,
                            borderRadius: '50%',
                            background: color,
                        }}
                    />
                ))}
            </div>
        );
    }

    if (variant === 'pulse') {
        return (
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.5, 1],
                }}
                transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
                style={{
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    background: color,
                }}
            />
        );
    }

    return null;
}
