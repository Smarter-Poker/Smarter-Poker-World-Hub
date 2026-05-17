/**
 * 🎨 PAGE TRANSITION WRAPPER
 * Smooth Framer Motion transitions for all pages with accessibility & mobile-first scaling
 */

import { motion, useReducedMotion } from 'framer-motion';

const pageVariantsFull = {
    initial: { opacity: 0, y: 20, scale: 0.98 },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
    },
    exit: { opacity: 0, y: -20, scale: 0.98, transition: { duration: 0.3 } },
};

const pageVariantsReduced = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.15 } },
    exit:    { opacity: 0, transition: { duration: 0.1  } },
};

export default function PageTransition({ children, className = '' }) {
    const reduce = useReducedMotion();
    const variants = reduce ? pageVariantsReduced : pageVariantsFull;

    return (
        <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
            className={className}
            style={{ width: '100%', minHeight: '100dvh' }}
        >
            {children}
        </motion.div>
    );
}
