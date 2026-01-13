/* ═══════════════════════════════════════════════════════════════════════════
   STREAK POPUP — Subtle toast notification for daily streaks
   Appears briefly on load, then fades out
   White/cyan theme matching site aesthetics
   Only shows when real streak data is provided (no mock data)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 STREAK MESSAGES — Title Case
// ─────────────────────────────────────────────────────────────────────────────
function getStreakMessage(days: number, multiplier: number): string {
    const ordinal = (n: number) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const messages = [
        `Nice! This Is Your ${ordinal(days)} Day In A Row!`,
        `${days} Days Strong! Keep It Up!`,
        `You're On Fire! ${ordinal(days)} Day Streak!`,
        `Wow! ${days} Consecutive Days!`,
    ];

    const bonusText = multiplier > 1
        ? ` You Earn ${multiplier}x XP And Diamonds Today!`
        : '';

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    return randomMessage + bonusText;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎉 STREAK POPUP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface StreakPopupProps {
    days?: number;        // Real streak days from database
    multiplier?: number;  // Real multiplier from database
    delay?: number;       // Delay before showing (ms)
    duration?: number;    // How long to show (ms)
}

export function StreakPopup({
    days = 0,             // Default to 0 (no mock data)
    multiplier = 1.0,     // Default to 1.0 (no mock data)
    delay = 1500,
    duration = 5000,
}: StreakPopupProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        // Don't show for day 1 or less (no streak yet)
        if (days < 2) return;

        // Generate message once
        setMessage(getStreakMessage(days, multiplier));

        // Show after delay
        const showTimer = setTimeout(() => {
            setIsVisible(true);
        }, delay);

        // Hide after duration
        const hideTimer = setTimeout(() => {
            setIsVisible(false);
        }, delay + duration);

        return () => {
            clearTimeout(showTimer);
            clearTimeout(hideTimer);
        };
    }, [days, multiplier, delay, duration]);

    // Don't render if no real streak
    if (days < 2) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 90,
                left: '50%',
                transform: `translateX(-50%) translateY(${isVisible ? '0' : '-20px'})`,
                opacity: isVisible ? 1 : 0,
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: isVisible ? 'auto' : 'none',
                zIndex: 100,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 24px',
                    background: 'linear-gradient(135deg, rgba(0, 60, 120, 0.85), rgba(0, 30, 80, 0.9))',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 16,
                    border: '1px solid rgba(0, 212, 255, 0.5)',
                    boxShadow: '0 8px 32px rgba(0, 212, 255, 0.15), 0 0 20px rgba(0, 212, 255, 0.1)',
                }}
            >
                <span
                    style={{
                        fontSize: 28,
                        animation: 'streakPulse 0.8s ease-in-out infinite alternate',
                    }}
                >
                    ⚡
                </span>
                <span
                    style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#ffffff',
                        maxWidth: 320,
                    }}
                >
                    {message}
                </span>
            </div>

            {/* Pulse animation keyframes */}
            <style>{`
                @keyframes streakPulse {
                    0% { transform: scale(1); filter: brightness(1); }
                    100% { transform: scale(1.15); filter: brightness(1.2); }
                }
            `}</style>
        </div>
    );
}

export default StreakPopup;
