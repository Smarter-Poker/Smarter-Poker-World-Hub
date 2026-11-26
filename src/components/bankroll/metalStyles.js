/** Console materials shared by Bankroll, Toke and their portaled tools.
 * Keep literal colors here for chart renderers that also receive these values.
 */
const ice = '#86daff';
const silver = '#bdd0e2';
const rim = '#57728b';
const iceGlow = 'rgba(79, 178, 239, .28)';
const cobalt = 'linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba)';
const control = 'linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c)';
const panel = 'linear-gradient(155deg, #182d43, #0b1c2c 43%, #050e18 87%)';

export const METAL = {
    darkest: '#040d18',
    base: '#0a1829',
    mid: '#172d42',
    elevated: '#20394f',
    highlight: rim,
    light: '#aabdd0',
    primary: '#72c6ff',
    primaryGlow: iceGlow,
    primaryDim: 'rgba(56, 143, 216, .17)',
    cyan: ice,
    cyanGlow: iceGlow,
    cyanDim: 'rgba(56, 143, 216, .17)',
    success: '#60dc9f',
    successGlow: 'rgba(45, 185, 112, .25)',
    warning: ice,
    warn: ice,
    warningGlow: iceGlow,
    danger: '#ff7770',
    dangerGlow: 'rgba(213, 66, 53, .28)',
    // Legacy API names used by older component-local presets.
    gold: ice,
    goldGlow: iceGlow,
    purple: silver,
    purpleGlow: iceGlow,
    textPrimary: '#f2f7ff',
    textSecondary: silver,
    textMuted: '#9caec1',
};

export const GRADIENTS = {
    metalSurface: panel,
    metalButton: control,
    cyanAction: cobalt,
    goldPremium: control,
    purplePro: cobalt,
    darkPanel: panel,
    fbButton: control,
    fbPrimary: '#0c55c0',
};

const edgeShadow = 'inset 0 1px 0 rgba(203, 232, 252, .22), 0 2px 6px rgba(0, 6, 13, .42)';
export const GLOWS = {
    cyan: '0 1px 6px rgba(35, 115, 196, .25)',
    cyanSubtle: edgeShadow,
    gold: edgeShadow,
    success: '0 1px 3px rgba(0, 0, 0, .3)',
    danger: '0 1px 3px rgba(0, 0, 0, .3)',
    card: edgeShadow,
    elevated: '0 8px 26px rgba(0, 6, 13, .56)',
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
        background: GRADIENTS.darkPanel,
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
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif" ,
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
        color: METAL.textPrimary,
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
        fontFamily: "var(--font-rajdhani), sans-serif" ,
        color: '#fff',
        textShadow: `0 0 10px ${METAL.cyanGlow}`,
    },
    statLabel: {
        fontSize: 12,
        color: METAL.textSecondary,
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
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.05em',
    },
    badgeCyan: {
        background: METAL.cyanDim,
        border: `1px solid ${METAL.cyan}`,
        color: METAL.cyan,
    },
    badgeGold: {
        background: METAL.cyanDim,
        border: `1px solid ${METAL.highlight}`,
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
        color: METAL.textMuted,
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
    },
    emptyTitle: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: METAL.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        margin: '0 0 8px',
    },
    emptyHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        color: METAL.textMuted,
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
        color: METAL.textPrimary,
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
        background: GRADIENTS.cyanAction,
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: METAL.textPrimary,
        boxShadow: GLOWS.gold,
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

