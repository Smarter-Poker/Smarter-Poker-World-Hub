/**
 * 🎨 SKELETON LOADER
 * Smooth loading states with shimmer effect
 */

import { motion } from 'framer-motion';

const shimmerVariants = {
    animate: {
        backgroundPosition: ['200% 0', '-200% 0'],
        transition: {
            duration: 2,
            ease: 'linear',
            repeat: Infinity,
        },
    },
};

export function SkeletonBox({ width = '100%', height = 20, style = {} }) {
    return (
        <motion.div
            variants={shimmerVariants}
            animate="animate"
            style={{
                width,
                height,
                borderRadius: 8,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
                backgroundSize: '200% 100%',
                ...style,
            }}
        />
    );
}

export function SkeletonCard() {
    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            padding: 20,
        }}>
            <SkeletonBox height={24} width="60%" style={{ marginBottom: 12 }} />
            <SkeletonBox height={16} width="100%" style={{ marginBottom: 8 }} />
            <SkeletonBox height={16} width="90%" style={{ marginBottom: 8 }} />
            <SkeletonBox height={16} width="70%" />
        </div>
    );
}

export function SkeletonAvatar({ size = 48 }) {
    return (
        <motion.div
            variants={shimmerVariants}
            animate="animate"
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
                backgroundSize: '200% 100%',
            }}
        />
    );
}

export default SkeletonBox;
