/* ═══════════════════════════════════════════════════════════════════════════
   THEME TOGGLE — Dark/Light mode for Live Help panel
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeToggleProps {
    onThemeChange?: (theme: Theme) => void;
}

export function ThemeToggle({ onThemeChange }: ThemeToggleProps) {
    const [theme, setTheme] = useState<Theme>('dark');

    useEffect(() => {
        // Load saved preference or detect system preference
        const saved = localStorage.getItem('jarvis-theme') as Theme;
        if (saved) {
            setTheme(saved);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(prefersDark ? 'dark' : 'light');
        }
    }, []);

    const toggleTheme = () => {
        const newTheme: Theme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('jarvis-theme', newTheme);
        onThemeChange?.(newTheme);
    };

    return (
        <button
            onClick={toggleTheme}
            style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '50%',
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
            }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
            {theme === 'dark' ? (
                // Sun icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
                </svg>
            ) : (
                // Moon icon
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z" />
                </svg>
            )}
        </button>
    );
}

export function getThemeColors(theme: Theme) {
    if (theme === 'light') {
        return {
            background: 'rgba(255, 255, 255, 0.98)',
            border: 'rgba(0, 0, 0, 0.1)',
            text: '#000',
            textSecondary: 'rgba(0, 0, 0, 0.6)',
            userBubble: 'linear-gradient(135deg, #00d4ff, #0088ff)',
            agentBubble: 'rgba(0, 0, 0, 0.05)',
            agentBubbleBorder: 'rgba(0, 0, 0, 0.1)',
            inputBackground: 'rgba(0, 0, 0, 0.05)',
            inputBorder: 'rgba(0, 212, 255, 0.3)',
            backdrop: 'rgba(0, 0, 0, 0.3)'
        };
    }

    // Dark theme (default)
    return {
        background: 'rgba(0, 20, 40, 0.98)',
        border: 'rgba(0, 212, 255, 0.2)',
        text: '#fff',
        textSecondary: 'rgba(255, 255, 255, 0.6)',
        userBubble: 'linear-gradient(135deg, #00d4ff, #0088ff)',
        agentBubble: 'rgba(0, 212, 255, 0.1)',
        agentBubbleBorder: 'rgba(0, 212, 255, 0.2)',
        inputBackground: 'rgba(0, 20, 40, 0.6)',
        inputBorder: 'rgba(0, 212, 255, 0.3)',
        backdrop: 'rgba(0, 0, 0, 0.4)'
    };
}
