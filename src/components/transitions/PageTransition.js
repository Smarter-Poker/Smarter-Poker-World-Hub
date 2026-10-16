/**
 * 🎨 PAGE TRANSITION WRAPPER
 * Smooth Framer Motion transitions for all pages with accessibility & mobile-first scaling
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// FIRST LOAD PAINTS, LATER NAVIGATIONS FADE (2026-10-16). The entrance
// variant starts at opacity 0, so on a full page load every server-rendered
// word and image stayed invisible until the JavaScript had downloaded, React
// had hydrated and framer-motion had run the fade. On a phone that put the
// page's Largest Contentful Paint behind hydration: Personal Assistant
// 3.1-3.9s on its 2.5s budget, and Trivia's lobby art 3.1-3.6s on 3.5s.
// The fade only means something when one page replaces another, so it is
// kept for client-side navigations and skipped for the document's first
// render. This flag is false on the server and on the first client render
// (identical markup, no hydration mismatch) and becomes true once the first
// page has mounted.
let firstPageHasMounted = false;

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

export default function PageTransition({ children, className = '', disableInitialAnimation = false }) {
    // A disabled initial animation is an availability contract, not merely an
    // animation preference. Leaving these pages mounted in motion.div still
    // lets WebKit briefly re-apply the opacity variant while its main thread is
    // busy hydrating a large page. The server had already painted the page, so
    // that late opacity write could blank every control until the animation
    // scheduler caught up. Use ordinary DOM for the explicitly static path so
    // its header is visible and interactive on every frame.
    if (disableInitialAnimation) {
        return (
            <div className={className} style={{ width: '100%', minHeight: '100dvh' }}>
                {children}
            </div>
        );
    }

    return <AnimatedPage className={className}>{children}</AnimatedPage>;
}

function AnimatedPage({ children, className }) {
    // Fixed per mounted page: true only for pages mounted after the first one.
    const [animateEntrance] = useState(() => firstPageHasMounted);
    useEffect(() => { firstPageHasMounted = true; }, []);
    return (
        <motion.div
            initial={animateEntrance ? 'initial' : false}
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
