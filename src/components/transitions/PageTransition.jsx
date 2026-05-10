/**
 * Page Transition Component - God Mode Stack
 * Smooth animated transitions between pages.
 *
 * BUG FIX (TRAIN-PAGE-TRANSITION-1):
 *   1. Framer-motion uses JS transforms, NOT CSS animations, so the
 *      CSS-level prefers-reduced-motion guard from TRAIN-CSS-SWEEP-1 doesn't
 *      catch it. Users who've set Reduce Motion at the OS level still saw
 *      slide+scale on every page transition. Now we read framer-motion's
 *      useReducedMotion() hook and skip the slide/scale entirely (just a
 *      cross-fade, the conventional accessible alternative).
 *   2. Replaced minHeight: '100vh' with '100dvh'. Handoff §5 'viewport-units'
 *      anti-pattern: 100vh on mobile includes the address-bar area and
 *      causes scroll/jank when the bar appears or hides. 100dvh tracks the
 *      actually-visible viewport. Browser support: Chrome 108+, Safari 15.4+,
 *      Firefox 101+ — all 2022 onward. Older browsers gracefully omit
 *      min-height (page still renders fine).
 *
 *   14 training pages mount this wrapper, so the fix propagates broadly.
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
    // useReducedMotion returns true when window.matchMedia('(prefers-reduced-motion: reduce)') matches.
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
