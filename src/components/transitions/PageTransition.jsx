/**
 * Page Transition Component - God Mode Stack
 * Smooth animated transitions between pages
 */
import { motion } from 'framer-motion';

const pageVariants = {
    initial: {
        opacity: 0,
        y: 20,
        scale: 0.98
    },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1]
        }
    },
    exit: {
        opacity: 0,
        y: -20,
        scale: 0.98,
        transition: {
            duration: 0.3
        }
    }
};

export default function PageTransition({ children, className = '' }) {
    return (
        <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            className={className}
            style={{ width: '100%', minHeight: '100vh' }}
        >
            {children}
        </motion.div>
    );
}
