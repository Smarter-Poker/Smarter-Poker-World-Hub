/**
 * 🎨 ANIMATED CARD
 * Reusable card with hover effects and animations
 */

import { motion } from 'framer-motion';

const cardVariants = {
    initial: {
        opacity: 0,
        y: 20,
    },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.4,
            ease: [0.25, 0.1, 0.25, 1],
        },
    },
    hover: {
        y: -8,
        boxShadow: '0 12px 40px rgba(0, 212, 255, 0.2)',
        transition: {
            duration: 0.3,
            ease: 'easeOut',
        },
    },
    tap: {
        scale: 0.98,
        transition: {
            duration: 0.1,
            ease: 'easeIn',
        },
    },
};

export default function AnimatedCard({
    children,
    onClick,
    style = {},
    delay = 0,
    hoverable = true,
    clickable = false,
    ...props
}) {
    const baseStyles = {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '20px',
        cursor: clickable ? 'pointer' : 'default',
        ...style,
    };

    return (
        <motion.div
            variants={cardVariants}
            initial="initial"
            animate="animate"
            whileHover={hoverable ? 'hover' : {}}
            whileTap={clickable ? 'tap' : {}}
            onClick={clickable ? onClick : undefined}
            style={baseStyles}
            transition={{ delay }}
            {...props}
        >
            {children}
        </motion.div>
    );
}
