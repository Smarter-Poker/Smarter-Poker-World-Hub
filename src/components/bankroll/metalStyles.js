/**
 * BANKROLL METAL UI STYLES
 * Futuristic Metal design system for Bankroll Pro Tools
 * Based on the official Smarter.Poker Metal UI standards v2026
 */

// Metal Color Palette
export const METAL = {
    // Core backgrounds
    darkest: '#0a0a15',    // Absolute depth
    base: '#0d1117',       // Standard surface
    mid: '#1a2332',        // Layer elevation
    highlight: '#3d4f5f',  // Machined edges
    light: '#4a5a6a',      // Rivets & accents

    // Neon accents
    cyan: '#00D4FF',
    cyanGlow: 'rgba(0, 212, 255, 0.6)',
    cyanDim: 'rgba(0, 212, 255, 0.15)',

    // Status colors
    success: '#22c55e',
    successGlow: 'rgba(34, 197, 94, 0.4)',
    warning: '#f59e0b',
    warningGlow: 'rgba(245, 158, 11, 0.4)',
    danger: '#ef4444',
    dangerGlow: 'rgba(239, 68, 68, 0.4)',

    // Premium
    gold: '#f59e0b',
    goldGlow: 'rgba(245, 158, 11, 0.5)',
    purple: '#a855f7',
    purpleGlow: 'rgba(168, 85, 247, 0.4)',
};

// Gradient presets
export const GRADIENTS = {
    metalSurface: 'linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%)',
    metalButton: 'linear-gradient(180deg, #2a3a4a 0%, #1a2a3a 100%)',
    cyanAction: 'linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)',
    goldPremium: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    purplePro: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
    darkPanel: 'linear-gradient(180deg, rgba(0,20,40,0.9), rgba(0,10,20,0.95))',
};

// Glow / shadow presets (5-layer neon stack)
export const GLOWS = {
    cyan: `
        0 0 2px #ffffff,
        0 0 4px #00D4FF,
        0 0 10px rgba(0, 212, 255, 0.6),
        0 0 20px rgba(0, 212, 255, 0.4),
        0 0 40px rgba(0, 212, 255, 0.2)
    `,
    cyanSubtle: '0 0 10px rgba(0, 212, 255, 0.3), 0 0 20px rgba(0, 212, 255, 0.15)',
    gold: `
        0 0 2px #ffffff,
        0 0 4px #f59e0b,
        0 0 10px rgba(245, 158, 11, 0.6),
        0 0 20px rgba(245, 158, 11, 0.4)
    `,
    success: '0 0 8px rgba(34, 197, 94, 0.5), 0 0 16px rgba(34, 197, 94, 0.25)',
    danger: '0 0 8px rgba(239, 68, 68, 0.5), 0 0 16px rgba(239, 68, 68, 0.25)',
};

// Animations (CSS keyframes as strings)
export const ANIMATIONS = `
    @keyframes metalGlow {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.05); opacity: 0.8; }
    }
    @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
    }
    @keyframes scanLine {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100%); }
    }
    @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
    }
    @keyframes boltRotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(90deg); }
    }
`;

// Base Metal Component Styles
export const metalStyles = {
    // Metal Frame / Panel
    panel: {
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 12,
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
    },

    // Premium panel with glow
    premiumPanel: {
        background: `linear-gradient(180deg, rgba(0, 20, 40, 0.95), rgba(5, 15, 30, 0.98))`,
        border: `2px solid ${METAL.cyan}`,
        borderRadius: 16,
        padding: 24,
        boxShadow: GLOWS.cyanSubtle,
        position: 'relative',
    },

    // LED strip accent (top edge)
    ledStrip: {
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 3,
        background: METAL.cyan,
        borderRadius: '0 0 4px 4px',
        boxShadow: GLOWS.cyan,
    },

    // Corner bolts
    cornerBolt: {
        position: 'absolute',
        width: 8,
        height: 8,
        background: `radial-gradient(circle, ${METAL.light} 30%, ${METAL.mid} 70%)`,
        borderRadius: '50%',
        border: `1px solid ${METAL.highlight}`,
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.5)',
    },

    // Section header
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
        fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: METAL.cyan,
    },

    // Metal button - primary action
    buttonPrimary: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 28px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontSize: 14,
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        boxShadow: GLOWS.cyanSubtle,
        transition: 'transform 0.2s, box-shadow 0.2s',
    },

    // Metal button - secondary
    buttonSecondary: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 24px',
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: '#fff',
        fontSize: 13,
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
    },

    // Metal input field (inset)
    input: {
        width: '100%',
        padding: '12px 16px',
        background: METAL.darkest,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontFamily: "'Rajdhani', sans-serif",
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)',
        outline: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
    },

    // Stat display
    statBox: {
        padding: 16,
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 10,
        textAlign: 'center',
    },
    statValue: {
        fontSize: 28,
        fontWeight: 800,
        fontFamily: "'Orbitron', sans-serif",
        color: '#fff',
        textShadow: `0 0 10px ${METAL.cyanGlow}`,
    },
    statLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginTop: 4,
    },

    // Badge variants
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.05em',
    },
    badgeCyan: {
        background: METAL.cyanDim,
        border: `1px solid ${METAL.cyan}`,
        color: METAL.cyan,
    },
    badgeGold: {
        background: 'rgba(245, 158, 11, 0.15)',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        color: METAL.gold,
    },
    badgeSuccess: {
        background: 'rgba(34, 197, 94, 0.15)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        color: METAL.success,
    },

    // Modal overlay
    modalOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
    },

    // Modal container
    modal: {
        width: '100%',
        maxWidth: 420,
        background: `linear-gradient(180deg, #1a2a3a 0%, #0d1520 100%)`,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 20,
        padding: 28,
        position: 'relative',
        boxShadow: `0 0 40px rgba(0,0,0,0.6), ${GLOWS.cyanSubtle}`,
    },
};

// Helper function to merge styles
export const mergeStyles = (...styles) => Object.assign({}, ...styles);

export default { METAL, GRADIENTS, GLOWS, ANIMATIONS, metalStyles, mergeStyles };
