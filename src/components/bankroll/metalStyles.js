/**
 * BANKROLL STYLES
 * SmarterPoker Dark theme for Bankroll Manager
 * Clean, sleek, professional styling
 */

// SmarterPoker Dark Color Palette
export const METAL = {
    // Core backgrounds (SmarterPoker Dark)
    darkest: '#18191a',    // Deepest background
    base: '#242526',       // Standard surface
    mid: '#3a3b3c',        // Elevated surfaces
    highlight: '#4e4f50',  // Borders and dividers
    light: '#65676b',      // Secondary text

    // SmarterPoker blue accent
    primary: '#2374e1',    // SmarterPoker blue
    primaryGlow: 'rgba(35, 116, 225, 0.4)',
    primaryDim: 'rgba(35, 116, 225, 0.15)',

    // Keep cyan for backwards compat but make it FB blue
    cyan: '#2374e1',
    cyanGlow: 'rgba(35, 116, 225, 0.4)',
    cyanDim: 'rgba(35, 116, 225, 0.15)',

    // Status colors
    success: '#31a24c',    // SmarterPoker green
    successGlow: 'rgba(49, 162, 76, 0.4)',
    warning: '#f7b928',    // SmarterPoker warning
    warningGlow: 'rgba(247, 185, 40, 0.4)',
    danger: '#f02849',     // SmarterPoker red
    dangerGlow: 'rgba(240, 40, 73, 0.4)',

    // Premium accents
    gold: '#f7b928',
    goldGlow: 'rgba(247, 185, 40, 0.4)',
    purple: '#9b59b6',
    purpleGlow: 'rgba(155, 89, 182, 0.4)',

    // Text colors
    textPrimary: '#e4e6eb',
    textSecondary: '#b0b3b8',
    textMuted: '#8a8d91',
};

// Gradient presets (SmarterPoker style - subtle, clean)
export const GRADIENTS = {
    metalSurface: 'linear-gradient(180deg, #3a3b3c 0%, #242526 100%)',
    metalButton: 'linear-gradient(180deg, #3a3b3c 0%, #2d2e2f 100%)',
    cyanAction: 'linear-gradient(135deg, #2374e1 0%, #1a5fc9 100%)',
    goldPremium: 'linear-gradient(135deg, #f7b928 0%, #d9a520 100%)',
    purplePro: 'linear-gradient(135deg, #9b59b6 0%, #7c4a99 100%)',
    darkPanel: 'linear-gradient(180deg, #242526 0%, #18191a 100%)',
    // SmarterPoker button styles
    fbButton: 'linear-gradient(180deg, #3a3b3c 0%, #333435 100%)',
    fbPrimary: '#2374e1',
};

// Shadow presets (clean, subtle - no neon glow)
export const GLOWS = {
    cyan: '0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(35, 116, 225, 0.15)',
    cyanSubtle: '0 1px 2px rgba(0, 0, 0, 0.1)',
    gold: '0 1px 2px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(247, 185, 40, 0.15)',
    success: '0 1px 2px rgba(0, 0, 0, 0.2)',
    danger: '0 1px 2px rgba(0, 0, 0, 0.2)',
    // SmarterPoker-style subtle shadows
    card: '0 1px 2px rgba(0, 0, 0, 0.2)',
    elevated: '0 2px 12px rgba(0, 0, 0, 0.25)',
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
    @keyframes glowPulse {
        0%, 100% { box-shadow: 0 0 10px rgba(0, 212, 255, 0.3), 0 0 20px rgba(0, 212, 255, 0.1); }
        50% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.6), 0 0 40px rgba(0, 212, 255, 0.3); }
    }
    @keyframes buttonPop {
        0% { transform: scale(1); }
        50% { transform: scale(0.97); }
        100% { transform: scale(1); }
    }
    @keyframes successFlash {
        0% { background-color: rgba(34, 197, 94, 0); }
        50% { background-color: rgba(34, 197, 94, 0.3); }
        100% { background-color: rgba(34, 197, 94, 0); }
    }
    @keyframes borderGlow {
        0%, 100% { border-color: rgba(0, 212, 255, 0.3); }
        50% { border-color: rgba(0, 212, 255, 0.8); }
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideIn {
        from { opacity: 0; transform: translateX(-20px); }
        to { opacity: 1; transform: translateX(0); }
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
        fontFamily: "var(--font-orbitron), 'Rajdhani', sans-serif" ,
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
        fontFamily: "var(--font-orbitron), sans-serif" ,
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
        animation: 'fadeIn 0.2s ease-out',
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
        animation: 'fadeIn 0.3s ease-out',
    },

    // Empty state styling
    emptyState: {
        textAlign: 'center',
        padding: '32px 16px',
        color: 'rgba(255,255,255,0.4)',
    },
    emptyIcon: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        height: 56,
        margin: '0 auto 16px',
        background: METAL.cyanDim,
        border: `1px dashed ${METAL.cyan}`,
        borderRadius: '50%',
        color: METAL.cyan,
        opacity: 0.6,
        animation: 'float 3s ease-in-out infinite',
    },
    emptyTitle: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        margin: '0 0 8px',
    },
    emptyHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        color: 'rgba(255,255,255,0.35)',
        margin: 0,
    },

    // Loading shimmer effect
    shimmerContainer: {
        background: `linear-gradient(90deg, ${METAL.base} 0%, ${METAL.mid} 50%, ${METAL.base} 100%)`,
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s infinite linear',
        borderRadius: 8,
    },

    // Interactive card with hover state (use with className + CSS)
    interactiveCard: {
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 12,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
    },

    // Action button with glow pulse 
    glowButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 24px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 8,
        color: '#000',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        cursor: 'pointer',
        boxShadow: GLOWS.cyanSubtle,
        transition: 'transform 0.15s, box-shadow 0.2s',
    },

    // Floating badge
    floatingBadge: {
        position: 'absolute',
        top: -8,
        right: -8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: METAL.gold,
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 700,
        color: '#000',
        boxShadow: GLOWS.gold,
        animation: 'float 2s ease-in-out infinite',
    },
};

// Helper function to merge styles
export const mergeStyles = (...styles) => Object.assign({}, ...styles);

// Hover effect helper (for use with onMouseEnter/onMouseLeave)
export const hoverEffects = {
    cardHover: {
        borderColor: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
        transform: 'translateY(-2px)',
    },
    buttonHover: {
        transform: 'scale(1.02)',
        boxShadow: GLOWS.cyan,
    },
    glowHover: {
        animation: 'glowPulse 1.5s ease-in-out infinite',
    },
};

export default { METAL, GRADIENTS, GLOWS, ANIMATIONS, metalStyles, mergeStyles, hoverEffects };

