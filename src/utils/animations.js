/**
 * 🎨 GLOBAL ANIMATION VARIANTS
 * Reusable Framer Motion animation presets for consistent UX
 */

// Page transitions
export const pageTransitions = {
    fadeIn: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.3 },
    },
    slideUp: {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 },
        transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
    },
    slideDown: {
        initial: { opacity: 0, y: -20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 20 },
        transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
    },
    scale: {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
        transition: { duration: 0.3 },
    },
};

// Stagger children animations
export const staggerContainer = {
    animate: {
        transition: {
            staggerChildren: 0.1,
        },
    },
};

export const staggerItem = {
    initial: { opacity: 0, y: 20 },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.4,
            ease: [0.25, 0.1, 0.25, 1],
        },
    },
};

// Button interactions
export const buttonHover = {
    scale: 1.05,
    transition: { duration: 0.2, ease: 'easeOut' },
};

export const buttonTap = {
    scale: 0.95,
    transition: { duration: 0.1, ease: 'easeIn' },
};

// Card animations
export const cardHover = {
    y: -8,
    boxShadow: '0 12px 40px rgba(0, 212, 255, 0.2)',
    transition: { duration: 0.3, ease: 'easeOut' },
};

export const cardTap = {
    scale: 0.98,
    transition: { duration: 0.1, ease: 'easeIn' },
};

// Modal animations
export const modalBackdrop = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
};

export const modalContent = {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            duration: 0.3,
            ease: [0.25, 0.1, 0.25, 1],
        },
    },
    exit: {
        opacity: 0,
        scale: 0.9,
        y: 20,
        transition: {
            duration: 0.2,
        },
    },
};

// List animations
export const listContainer = {
    animate: {
        transition: {
            staggerChildren: 0.05,
        },
    },
};

export const listItem = {
    initial: { opacity: 0, x: -20 },
    animate: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 0.3,
        },
    },
};

// Notification/Toast animations
export const toastSlideIn = {
    initial: { opacity: 0, x: 100 },
    animate: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 0.3,
            ease: [0.25, 0.1, 0.25, 1],
        },
    },
    exit: {
        opacity: 0,
        x: 100,
        transition: {
            duration: 0.2,
        },
    },
};

// Pulse animation (for loading/active states)
export const pulse = {
    animate: {
        scale: [1, 1.05, 1],
        transition: {
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

// Shimmer animation (for loading states)
export const shimmer = {
    animate: {
        backgroundPosition: ['200% 0', '-200% 0'],
        transition: {
            duration: 2,
            ease: 'linear',
            repeat: Infinity,
        },
    },
};

// Bounce animation
export const bounce = {
    animate: {
        y: [0, -10, 0],
        transition: {
            duration: 0.6,
            repeat: Infinity,
            ease: 'easeInOut',
        },
    },
};

// Rotate animation (for spinners)
export const rotate = {
    animate: {
        rotate: 360,
        transition: {
            duration: 1,
            repeat: Infinity,
            ease: 'linear',
        },
    },
};

// Success checkmark animation
export const successCheckmark = {
    initial: { scale: 0, rotate: -180 },
    animate: {
        scale: 1,
        rotate: 0,
        transition: {
            type: 'spring',
            stiffness: 200,
            damping: 10,
        },
    },
};

// Error shake animation
export const errorShake = {
    animate: {
        x: [0, -10, 10, -10, 10, 0],
        transition: {
            duration: 0.4,
        },
    },
};

export default {
    pageTransitions,
    staggerContainer,
    staggerItem,
    buttonHover,
    buttonTap,
    cardHover,
    cardTap,
    modalBackdrop,
    modalContent,
    listContainer,
    listItem,
    toastSlideIn,
    pulse,
    shimmer,
    bounce,
    rotate,
    successCheckmark,
    errorShake,
};
