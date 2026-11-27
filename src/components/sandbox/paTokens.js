/**
 * PA_DESIGN_SPEC v2 · "Jarvis Command Deck"
 * ═══════════════════════════════════════════════════════════════════════════
 * Single source of truth for the Personal Assistant surfaces (Sandbox, Leak
 * Finder, hamburger menu). Mobile-first, 375x667 baseline.
 *
 * Do not invent tokens. Import from here instead of re-declaring hex values.
 */
import React from 'react';

export const T = {
    // Smarter.Poker surfaces aligned to the approved MTT Lobby & Arena Workspace system
    bg: '#040D18',        // approved MTT lobby obsidian-navy canvas
    surface: '#091727',   // primary panel surface (--arena-panel base)
    surface2: '#13253A',  // controls, compact rows, inactive tabs (--arena-row base)
    surface3: '#1E3853',  // hover/pressed controls and elevated accents
    border: '#688299',    // approved metallic steel rail
    borderHi: '#AEC0D0',  // approved top-lit steel rim
    // text (WCAG AA >= 4.5:1 on dark navy)
    text: '#F1F5FC',      // primary ink
    textMuted: '#B6C8D6', // secondary ink / values
    textDim: '#9AABBA',   // labels, captions, disabled, placeholders
    // accent + status
    accent: '#63E7FF',      // signal cyan (kept for contract compatibility; pairs with #56D8FF / #83DEFF)
    accentPress: '#087CFA', // approved MTT lobby active royal blue
    accentSoft: 'rgba(8,124,250,0.18)',
    success: '#4DE0A5',
    successSoft: 'rgba(77,224,165,0.14)',
    warn: '#86DAFF',
    warnSoft: 'rgba(134,218,255,0.14)',
    danger: '#FF6B7A',
    dangerSoft: 'rgba(255,107,122,0.14)',
    purple: '#63E7FF', // #SMARTERDESIGN ice-cyan accent (never purple/amber text)
    purpleSoft: 'rgba(99,231,255,0.14)',
    // scrims
    scrim: 'rgba(2,7,14,0.82)',
    glassEdge: 'rgba(174,192,208,0.22)',
};

export const F = { h1: 22, h2: 18, h3: 16, body: 15, bodySm: 14, label: 13, caption: 12, input: 16 };

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const R = { sm: 6, md: 7, lg: 9, sheet: '10px 10px 0 0', pill: 999 };

export const E = {
    card: 'none',
    raised: '0 8px 24px rgba(0,0,0,0.42)',
    sheet: 'inset 0 1px 0 rgba(174,192,208,0.28), 0 -10px 32px rgba(0,0,0,0.72)',
};

export const Z = {
    base: 1, felt: 10, feltCards: 20, sticky: 50, bottomNav: 100,
    backdrop: 950, sheet: 951, popover: 980, toast: 1000,
};

/** High-contrast 4-color poker deck tokens (#SmarterDesign obsidian bevel cards). */
export const SUITS = Object.freeze({ c: '♣', d: '♦', h: '♥', s: '♠' });
export const SUIT_COLORS = Object.freeze({
    c: '#4DE0A5',
    d: '#56D8FF',
    h: '#FF6B7A',
    s: '#F1F5FC',
});

export const FONT = "Arial,'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
export const DISPLAY_FONT = "'Arial Narrow','Rajdhani',Arial,sans-serif";
export const DATA_FONT = "'IBM Plex Mono','SFMono-Regular',Consolas,monospace";

/** Numeric readouts (EV, equity, pot) share this treatment. */
export const numeric = { fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 };

export const card = {
    background: 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
    border: '5px solid transparent',
    borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
    borderRadius: R.md,
    padding: S.md,
    boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
};

export const cardCompact = {
    ...card,
    background: 'linear-gradient(155deg, #162b40 0%, #0a1929 48%, #040d18 92%)',
    border: '3px solid transparent',
    borderImage: "url('/images/smarterdesign/chrome-stat.webp') 11 / 4px stretch",
    padding: S.md,
    borderRadius: R.md,
};

export function btn(variant = 'primary', opts = {}) {
    const base = {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S.sm,
        minHeight: 44, minWidth: 44, padding: '6px 16px', borderRadius: R.sm,
        fontSize: F.bodySm, fontWeight: 700, fontFamily: DISPLAY_FONT, lineHeight: 1.15,
        letterSpacing: '0.02em',
        cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        transition: 'filter .12s ease, opacity .12s ease, transform .1s ease',
        boxSizing: 'border-box', border: '3px solid transparent', width: opts.block ? '100%' : 'auto',
    };
    const v = {
        primary: {
            background: 'linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba)',
            color: '#FFFFFF',
            borderImage: "url('/images/smarterdesign/chrome-active.webp') 11 / 4px stretch",
            textShadow: '0 1px 2px rgba(2,9,20,0.85)',
            boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
        },
        secondary: {
            background: 'linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c)',
            color: '#F2F7FF',
            borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
            textShadow: '0 1px 2px rgba(2,9,20,0.75)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        },
        ghost: { background: 'transparent', color: T.textMuted, border: '1px solid transparent' },
        danger: {
            background: 'linear-gradient(180deg, rgba(164,34,52,0.52), rgba(74,14,24,0.82))',
            color: '#FFD6DC',
            borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
        },
        success: {
            background: 'linear-gradient(180deg, rgba(22,126,90,0.48), rgba(8,52,38,0.82))',
            color: '#D5FFF0',
            borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
        },
        purple: {
            background: 'linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba)',
            color: '#FFFFFF',
            borderImage: "url('/images/smarterdesign/chrome-active.webp') 11 / 4px stretch",
        },
    }[variant] || {};
    const dis = opts.disabled ? { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' } : null;
    return { ...base, ...v, ...dis };
}

/** Icon-only button: 44x44 circle with brushed-steel bezel. Always pair with an aria-label. */
export function iconBtn(opts = {}) {
    return {
        width: 44, height: 44, minWidth: 44, minHeight: 44, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        background: opts.transparent ? 'transparent' : 'linear-gradient(180deg, #263f58 0%, #102336 52%, #071420 100%)',
        border: opts.transparent ? '1px solid transparent' : '1.5px solid #8ea6bd',
        boxShadow: opts.transparent ? 'none' : 'inset 0 1px 0 rgba(242,247,255,0.32), 0 2px 6px rgba(0,0,0,0.45)',
        color: opts.color || T.text, padding: 0,
        cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        transition: 'transform .12s ease, filter .12s ease',
        ...(opts.disabled ? { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' } : null),
    };
}

export const sheetBackdrop = {
    position: 'fixed', inset: 0, background: T.scrim, zIndex: Z.backdrop,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    WebkitBackdropFilter: 'blur(3px)', backdropFilter: 'blur(3px)',
};

export const sheet = {
    width: '100%', maxWidth: 680,
    background: 'linear-gradient(155deg, #162b40 0%, #0b1c2c 40%, #050e18 88%)',
    border: '5px solid transparent',
    borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
    borderRadius: R.sheet, boxShadow: '0 -12px 36px rgba(0,0,0,0.82)', zIndex: Z.sheet,
    maxHeight: '88dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    paddingBottom: 'env(safe-area-inset-bottom,0px)',
};

export const sheetGrip = { width: 48, height: 4, borderRadius: R.pill, background: T.borderHi, margin: '10px auto 8px' };

export const sheetHeader = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm,
    padding: `0 ${S.lg}px ${S.md}px`, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
};

export const sheetBody = {
    padding: S.lg, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain', flex: 1, minHeight: 0,
};

export const sheetFooter = {
    padding: S.lg, borderTop: `1px solid ${T.border}`, display: 'flex', gap: S.sm,
    flexShrink: 0, background: T.surface,
};

export function pill(tone = 'neutral') {
    const m = {
        neutral: [T.textMuted, 'rgba(183,208,221,0.12)'], accent: [T.accent, T.accentSoft],
        success: [T.success, T.successSoft], warn: [T.warn, T.warnSoft],
        danger: [T.danger, T.dangerSoft], purple: [T.purple, T.purpleSoft],
    }[tone] || [T.textMuted, 'rgba(183,208,221,0.12)'];
    return {
        display: 'inline-flex', alignItems: 'center', gap: S.xs, padding: '5px 10px',
        borderRadius: R.pill, fontSize: F.caption, fontWeight: 700, lineHeight: 1.2,
        color: m[0], background: m[1], border: `1px solid ${m[0]}33`, whiteSpace: 'nowrap',
    };
}

export const sectionHeader = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm,
    marginBottom: S.md, minHeight: 28,
};

export const sectionTitle = {
    fontSize: F.label, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
    color: T.textDim, margin: 0, fontFamily: DATA_FONT,
};

export const sectionAction = { ...btn('ghost'), minHeight: 44, padding: '0 10px', fontSize: F.caption, color: T.accent };

export const emptyWrap = {
    ...card, textAlign: 'center', padding: `${S.xl}px ${S.lg}px`,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S.md,
};

export const emptyIcon = {
    width: 56, height: 56, borderRadius: '50%', background: T.surface2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim,
};

export const emptyTitle = { fontSize: F.h3, fontWeight: 700, color: T.text, margin: 0 };

export const emptyBody = { fontSize: F.bodySm, color: T.textMuted, margin: 0, maxWidth: 280, lineHeight: 1.45 };

export const skeleton = (h = 14, w = '100%') => ({ height: h, width: w, borderRadius: R.sm, background: T.surface2 });

export const errorWrap = {
    ...card, borderColor: 'rgba(255,107,122,0.4)', background: T.dangerSoft,
    display: 'flex', flexDirection: 'column', gap: S.md, alignItems: 'flex-start',
};

export const errorTitle = {
    fontSize: F.bodySm, fontWeight: 700, color: T.danger,
    display: 'flex', alignItems: 'center', gap: S.sm, margin: 0,
};

export const errorBody = { fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 };

/**
 * Every framer-motion component in these surfaces must consult this hook.
 * When true: transition {duration:0}, opacity-only enter/exit, no confetti,
 * no chart animation, no auto-playing loops.
 */
export function usePrefersReducedMotion() {
    const [r, setR] = React.useState(false);
    React.useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const m = window.matchMedia('(prefers-reduced-motion: reduce)');
        const on = () => setR(m.matches);
        on();
        if (m.addEventListener) m.addEventListener('change', on);
        else if (m.addListener) m.addListener(on);
        return () => {
            if (m.removeEventListener) m.removeEventListener('change', on);
            else if (m.removeListener) m.removeListener(on);
        };
    }, []);
    return r;
}

export default T;
