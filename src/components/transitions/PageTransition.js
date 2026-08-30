/**
 * 🎨 PAGE TRANSITION WRAPPER
 * Smooth Framer Motion transitions for all pages with accessibility & mobile-first scaling
 */

import { motion } from 'framer-motion';

// Keep the first server and client frame identical. Reading the user's motion
// preference during hydration previously changed the inline transform between
// SSR and the browser, producing a warning on every page using this wrapper.
// A short opacity transition preserves polish without vestibular movement or
// hydration-dependent markup.
const pageVariants = {
    initial: { opacity: 0 },
    animate: {
        opacity: 1,
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
    },
    exit: { opacity: 0, transition: { duration: 0.12 } },
};

export default function PageTransition({ children, className = '' }) {
    return (
        <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            className={className}
            style={{ width: '100%', minHeight: '100dvh' }}
        >
            {children}
        </motion.div>
    );
}
