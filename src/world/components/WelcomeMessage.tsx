/* ═══════════════════════════════════════════════════════════════════════════
   WELCOME BACK — Shows below header with user's name
   Only shows on home screen, after 8+ hours away, all white text
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

// Session tracking keys
const LAST_VISIT_KEY = 'hub-last-visit-timestamp';
const WELCOME_SHOWN_KEY = 'hub-welcome-shown-this-session';
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

// Mock user data
const MOCK_USER = {
    username: 'PokerPro',
};

// Check if we should show welcome (8+ hours since last visit)
function shouldShowWelcome(): boolean {
    // CRITICAL: Don't show "Welcome Back" if user just logged in
    // This fixes mobile private mode where localStorage may fail but sessionStorage works
    const justLoggedIn = sessionStorage.getItem('just_authenticated');
    if (justLoggedIn === 'true') {
        return false; // Fresh login - don't show "Welcome Back"
    }

    const shownThisSession = sessionStorage.getItem(WELCOME_SHOWN_KEY);
    if (shownThisSession === 'true') {
        return false; // Already shown this session
    }

    // Try to get last visit from localStorage (may fail in private mode)
    let lastVisit: string | null = null;
    try {
        lastVisit = localStorage.getItem(LAST_VISIT_KEY);
    } catch (e) {
        // localStorage blocked in private mode - treat as first visit
        return false;
    }

    if (!lastVisit) {
        // No last visit recorded - this could be:
        // 1. True first visit
        // 2. Private mode where localStorage is blocked
        // 3. User cleared their data
        // Be conservative: only show if we can confirm they're returning
        return false;
    }

    const timeSinceLastVisit = Date.now() - parseInt(lastVisit, 10);
    return timeSinceLastVisit >= EIGHT_HOURS_MS;
}

// Mark welcome as shown and update last visit time
function markWelcomeShown(): void {
    sessionStorage.setItem(WELCOME_SHOWN_KEY, 'true');
    try {
        localStorage.setItem(LAST_VISIT_KEY, Date.now().toString());
    } catch (e) {
        // localStorage blocked in private mode - that's okay, sessionStorage tracks this session
    }
}

interface WelcomeBackProps {
    isOnHomeScreen?: boolean;
}

export function WelcomeBack({ isOnHomeScreen = true }: WelcomeBackProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const user = MOCK_USER;

    // Check if we should show welcome on mount
    useEffect(() => {
        if (isOnHomeScreen && shouldShowWelcome()) {
            setShouldRender(true);
            // Fade in after small delay
            const timer = setTimeout(() => setIsVisible(true), 200);
            // Mark as shown
            markWelcomeShown();
            return () => clearTimeout(timer);
        }
    }, [isOnHomeScreen]);

    // Hide when leaving home screen
    useEffect(() => {
        if (!isOnHomeScreen) {
            setIsVisible(false);
            const timer = setTimeout(() => setShouldRender(false), 500);
            return () => clearTimeout(timer);
        }
    }, [isOnHomeScreen]);

    if (!shouldRender) return null;

    return (
        <div
            style={{
                position: 'absolute',
                top: 75,
                left: '50%',
                transform: 'translateX(-50%)',
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.6s ease',
                textAlign: 'center',
                zIndex: 15,
            }}
        >
            <span
                style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 28,
                    fontWeight: 600,
                    color: '#ffffff',
                    textShadow: '0 2px 15px rgba(0, 0, 0, 0.6)',
                    letterSpacing: '0.02em',
                }}
            >
                Welcome Back, {user.username}
            </span>
        </div>
    );
}

export default WelcomeBack;
