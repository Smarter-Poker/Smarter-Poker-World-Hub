/* ═══════════════════════════════════════════════════════════════════════════
   WORLD THEME PROVIDER — Applies per-world theming based on route
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import { useEffect } from 'react';

// Route to world ID mapping
const ROUTE_TO_WORLD = {
    '/hub/social-media': 'social-hub',
    '/hub/diamond-arena': 'diamond-arena',
    '/hub/trivia': 'trivia',
    '/hub/training': 'training',
    '/hub/news': 'news',
    '/hub/diamond-arcade': 'diamond-arcade',
    '/hub/personal-assistant': 'personal-assistant',
    '/hub/memory-games': 'memory-games',
    '/hub/memory-campaign': 'memory-games',
    '/hub/bankroll-manager': 'bankroll-manager',
    '/hub/poker-near-me': 'poker-near-me',
    '/hub/diamond-store': 'marketplace',
    '/hub/club-arena': 'club-arena',
    '/hub/video-library': 'video-library',
    '/hub/reels': 'social-hub',
    '/hub/lives': 'social-hub',
    '/hub/messenger': 'social-hub',
    '/hub/profile': 'social-hub',
    '/hub/user': 'social-hub',
};

// Get world ID from pathname (handles dynamic routes)
function getWorldFromPath(pathname) {
    // Check exact matches first
    if (ROUTE_TO_WORLD[pathname]) {
        return ROUTE_TO_WORLD[pathname];
    }

    // Check prefix matches for dynamic routes
    for (const [route, world] of Object.entries(ROUTE_TO_WORLD)) {
        if (pathname.startsWith(route)) {
            return world;
        }
    }

    // Default to club-arena style for hub pages without specific theme
    if (pathname.startsWith('/hub')) {
        return 'club-arena';
    }

    // No theme for non-hub pages
    return null;
}

export function WorldThemeProvider({ children }) {
    const router = useRouter();

    useEffect(() => {
        const worldId = getWorldFromPath(router.pathname);

        // Remove all world classes
        const body = document.body;
        const existingClasses = Array.from(body.classList).filter(c => c.startsWith('world-'));
        existingClasses.forEach(c => body.classList.remove(c));

        // Add new world class
        if (worldId) {
            body.classList.add(`world-${worldId}`);
        }

        return () => {
            // Cleanup on unmount
            if (worldId) {
                body.classList.remove(`world-${worldId}`);
            }
        };
    }, [router.pathname]);

    return children;
}

export default WorldThemeProvider;
