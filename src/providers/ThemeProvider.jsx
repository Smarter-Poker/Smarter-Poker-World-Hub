/**
 * THEME PROVIDER — Dark Mode Support
 * Provides global theme context with localStorage persistence
 */

import { createContext, useContext, useState, useEffect } from 'react';

// Theme definitions
export const themes = {
    light: {
        name: 'light',
        bg: '#F0F2F5',
        card: '#FFFFFF',
        text: '#050505',
        textSec: '#65676B',
        border: '#DADDE1',
        blue: '#1877F2',
        blueHover: '#166FE5',
        green: '#42B72A',
        gold: '#FFD700',
        red: '#E41E3F',
        hoverBg: 'rgba(0,0,0,0.05)',
    },
    dark: {
        name: 'dark',
        bg: '#18191A',
        card: '#242526',
        text: '#E4E6EB',
        textSec: '#B0B3B8',
        border: '#3E4042',
        blue: '#2D88FF',
        blueHover: '#1877F2',
        green: '#31A24C',
        gold: '#FFD700',
        red: '#F02849',
        hoverBg: 'rgba(255,255,255,0.1)',
    },
};

const ThemeContext = createContext({
    theme: themes.light,
    isDark: false,
    toggleTheme: () => { },
    setTheme: () => { },
});

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Load preference from localStorage on mount
    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem('smarter-poker-theme');
        if (saved === 'dark') {
            setIsDark(true);
        } else if (saved === 'light') {
            setIsDark(false);
        } else {
            // Check system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setIsDark(prefersDark);
        }
    }, []);

    // Save preference when it changes
    useEffect(() => {
        if (mounted) {
            localStorage.setItem('smarter-poker-theme', isDark ? 'dark' : 'light');

            // Apply CSS variables to document root
            const theme = isDark ? themes.dark : themes.light;
            const root = document.documentElement;
            root.style.setProperty('--bg', theme.bg);
            root.style.setProperty('--card', theme.card);
            root.style.setProperty('--text', theme.text);
            root.style.setProperty('--text-sec', theme.textSec);
            root.style.setProperty('--border', theme.border);
            root.style.setProperty('--blue', theme.blue);
            root.style.setProperty('--hover-bg', theme.hoverBg);

            // Add class to body for global styling
            document.body.classList.toggle('dark-mode', isDark);
        }
    }, [isDark, mounted]);

    const toggleTheme = () => setIsDark(prev => !prev);
    const setTheme = (themeName) => setIsDark(themeName === 'dark');

    const value = {
        theme: isDark ? themes.dark : themes.light,
        isDark,
        toggleTheme,
        setTheme,
    };

    // Prevent flash of wrong theme
    if (!mounted) {
        return <div style={{ visibility: 'hidden' }}>{children}</div>;
    }

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

// Hook to use theme in any component
export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

// Quick-access hook that just returns the color object
export function useColors() {
    const { theme } = useTheme();
    return theme;
}
