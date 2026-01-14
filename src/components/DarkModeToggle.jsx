/**
 * DARK MODE TOGGLE — Premium animated toggle switch
 */

import { useTheme } from '../providers/ThemeProvider';

export function DarkModeToggle({ size = 'medium' }) {
    const { isDark, toggleTheme } = useTheme();

    const sizes = {
        small: { width: 44, height: 24, knob: 18 },
        medium: { width: 56, height: 28, knob: 22 },
        large: { width: 68, height: 34, knob: 28 },
    };

    const s = sizes[size] || sizes.medium;
    const knobOffset = isDark ? s.width - s.knob - 3 : 3;

    return (
        <button
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
                width: s.width,
                height: s.height,
                borderRadius: s.height / 2,
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.3s ease',
                background: isDark
                    ? 'linear-gradient(135deg, #1a1a3e 0%, #2d2d5a 100%)'
                    : 'linear-gradient(135deg, #87CEEB 0%, #FFD700 100%)',
                boxShadow: isDark
                    ? 'inset 0 2px 4px rgba(0,0,0,0.3)'
                    : 'inset 0 2px 4px rgba(0,0,0,0.1)',
            }}
        >
            {/* Stars (visible in dark mode) */}
            <span style={{
                position: 'absolute',
                top: 4,
                left: 6,
                fontSize: s.knob * 0.4,
                opacity: isDark ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }}>✨</span>

            {/* Cloud (visible in light mode) */}
            <span style={{
                position: 'absolute',
                top: 3,
                right: 6,
                fontSize: s.knob * 0.45,
                opacity: isDark ? 0 : 1,
                transition: 'opacity 0.3s ease',
            }}>☁️</span>

            {/* Knob with sun/moon */}
            <span style={{
                position: 'absolute',
                top: 3,
                left: knobOffset,
                width: s.knob,
                height: s.knob,
                borderRadius: '50%',
                background: isDark ? '#E8E8E8' : '#FFD700',
                boxShadow: isDark
                    ? '0 2px 4px rgba(0,0,0,0.3)'
                    : '0 2px 4px rgba(0,0,0,0.2), 0 0 8px rgba(255,215,0,0.4)',
                transition: 'left 0.3s ease, background 0.3s ease, box-shadow 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: s.knob * 0.6,
            }}>
                {isDark ? '🌙' : '☀️'}
            </span>
        </button>
    );
}

// Simple text-based toggle for compact spaces
export function DarkModeButton() {
    const { isDark, toggleTheme, theme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: theme.card,
                color: theme.text,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                transition: 'all 0.2s ease',
            }}
        >
            <span style={{ fontSize: 18 }}>{isDark ? '☀️' : '🌙'}</span>
            {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>
    );
}
