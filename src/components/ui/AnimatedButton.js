/**
 * 🎨 ANIMATED BUTTON
 * Reusable button with micro-interactions
 */

import { motion } from 'framer-motion';

const buttonVariants = {
    hover: {
        scale: 1.05,
        transition: {
            duration: 0.2,
            ease: 'easeOut',
        },
    },
    tap: {
        scale: 0.95,
        transition: {
            duration: 0.1,
            ease: 'easeIn',
        },
    },
};

export default function AnimatedButton({
    children,
    onClick,
    style = {},
    variant = 'primary',
    disabled = false,
    ...props
}) {
    const baseStyles = {
        padding: '12px 24px',
        borderRadius: '8px',
        border: 'none',
        fontSize: '16px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...style,
    };

    const variantStyles = {
        primary: {
            background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
            color: '#fff',
            boxShadow: '0 4px 15px rgba(0, 212, 255, 0.3)',
        },
        secondary: {
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
        },
        success: {
            background: 'linear-gradient(135deg, #00ff88, #00cc66)',
            color: '#000',
            boxShadow: '0 4px 15px rgba(0, 255, 136, 0.3)',
        },
        danger: {
            background: 'linear-gradient(135deg, #ff4444, #cc0000)',
            color: '#fff',
            boxShadow: '0 4px 15px rgba(255, 68, 68, 0.3)',
        },
    };

    return (
        <motion.button
            variants={buttonVariants}
            whileHover={disabled ? {} : 'hover'}
            whileTap={disabled ? {} : 'tap'}
            onClick={disabled ? undefined : onClick}
            style={{ ...baseStyles, ...variantStyles[variant] }}
            {...props}
        >
            {children}
        </motion.button>
    );
}
