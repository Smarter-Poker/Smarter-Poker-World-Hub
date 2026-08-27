/**
 * PA_DESIGN_SPEC v2 — "Jarvis Command Deck"
 * ═══════════════════════════════════════════════════════════════════════════
 * Single source of truth for the Personal Assistant surfaces (Sandbox, Leak
 * Finder, hamburger menu). Mobile-first, 375x667 baseline.
 *
 * Do not invent tokens. Import from here instead of re-declaring hex values.
 */
import React from 'react';

export const T = {
    // Smarter.Poker surfaces (darkest -> lightest)
    bg: '#020609',        // obsidian page background
    surface: '#07111B',   // primary instrument panels
    surface2: '#10202B',  // controls, nested rows, inactive tabs
    surface3: '#1B3342',  // hover/pressed controls and drag handles
    border: '#35566A',    // steel hairline
    borderHi: '#7898AA',  // chrome edge / focused-adjacent
    // text
    text: '#EEF8FF',      // primary
    textMuted: '#B7D0DD', // secondary / values
    textDim: '#8295A2',   // labels, captions, disabled, placeholders
    // accent + status
    accent: '#63E7FF',      // signal cyan
    accentPress: '#078ED6', // electric blue
    accentSoft: 'rgba(99,231,255,0.12)',
    success: '#4DE0A5',
    successSoft: 'rgba(77,224,165,0.12)',
    warn: '#FFC66D',
    warnSoft: 'rgba(255,198,109,0.12)',
    danger: '#FF6B7A',
    dangerSoft: 'rgba(255,107,122,0.12)',
    purple: '#B9A7FF', // GTO / solver / "study" semantics
    purpleSoft: 'rgba(185,167,255,0.12)',
    // scrims
    scrim: 'rgba(0,3,6,0.78)',
    glassEdge: 'rgba(216,251,255,0.16)',
};

export const F = { h1: 22, h2: 18, h3: 16, body: 15, bodySm: 14, label: 13, caption: 12, input: 16 };

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const R = { sm: 2, md: 4, lg: 6, sheet: '8px 8px 0 0', pill: 999 };

export const E = {
    card: 'inset 0 1px 0 rgba(216,251,255,0.08), 0 10px 22px rgba(0,0,0,0.34)',
    raised: 'inset 0 1px 0 rgba(216,251,255,0.14), 0 16px 34px rgba(0,0,0,0.52)',
    sheet: 'inset 0 1px 0 rgba(216,251,255,0.18), 0 -12px 42px rgba(0,0,0,0.72), 0 0 28px rgba(0,142,214,0.12)',
};

export const Z = {
    base: 1, felt: 10, feltCards: 20, sticky: 50, bottomNav: 100,
    backdrop: 900, sheet: 901, popover: 950, toast: 1000,
};

export const FONT = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
export const DISPLAY_FONT = "'Rajdhani','Arial Narrow',sans-serif";
export const DATA_FONT = "'IBM Plex Mono','SFMono-Regular',Consolas,monospace";

/** Numeric readouts (EV, equity, pot) share this treatment. */
export const numeric = { fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 };

export const card = {
    background: `linear-gradient(180deg, rgba(23,41,56,0.96), ${T.surface} 24%, #03090E)`, border: `1px solid ${T.borderHi}`, borderRadius: R.md,
    padding: S.lg, boxShadow: E.card, boxSizing: 'border-box', width: '100%', maxWidth: '100%',
};

export const cardCompact = { ...card, padding: S.md, borderRadius: R.sm };

export function btn(variant = 'primary', opts = {}) {
    const base = {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S.sm,
        minHeight: 44, minWidth: 44, padding: '0 18px', borderRadius: R.sm,
        fontSize: F.bodySm, fontWeight: 700, fontFamily: DISPLAY_FONT, lineHeight: 1,
        letterSpacing: '0.025em',
        cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        transition: 'transform .12s ease, background .12s ease, opacity .12s ease',
        boxSizing: 'border-box', border: '1px solid transparent', width: opts.block ? '100%' : 'auto',
    };
    const v = {
        primary: { background: `linear-gradient(180deg, #2A6D94 0%, #0A3856 18%, #061826 78%, #154C6C 100%)`, color: '#FFFFFF', borderColor: '#72DFFF', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5), inset 0 -2px 0 rgba(0,0,0,.65), 0 0 16px rgba(7,142,214,.2)' },
        secondary: { background: `linear-gradient(180deg, #263946, #0A141C 22%, #050B10 78%, #17242D)`, color: T.text, borderColor: T.borderHi, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14), inset 0 -2px 0 rgba(0,0,0,.6)' },
        ghost: { background: 'transparent', color: T.textMuted, borderColor: 'transparent' },
        danger: { background: T.dangerSoft, color: T.danger, borderColor: 'rgba(255,107,122,0.4)' },
        success: { background: T.successSoft, color: T.success, borderColor: 'rgba(77,224,165,0.4)' },
    }[variant] || {};
    const dis = opts.disabled ? { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' } : null;
    return { ...base, ...v, ...dis };
}

/** Icon-only button: 44x44 circle. Always pair with an aria-label. */
export function iconBtn(opts = {}) {
    return {
        width: 44, height: 44, minWidth: 44, minHeight: 44, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%', background: opts.transparent ? 'transparent' : T.surface2,
        border: '1px solid transparent', color: opts.color || T.text, padding: 0,
        cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        transition: 'transform .12s ease, background .12s ease',
        ...(opts.disabled ? { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' } : null),
    };
}

export const sheetBackdrop = {
    position: 'fixed', inset: 0, background: T.scrim, zIndex: Z.backdrop,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    WebkitBackdropFilter: 'blur(2px)', backdropFilter: 'blur(2px)',
};

export const sheet = {
    width: '100%', maxWidth: 680,
    background: `linear-gradient(180deg, #132633 0, ${T.surface} 52px, #03090E 100%)`,
    border: `1px solid ${T.borderHi}`, borderBottom: 0,
    borderRadius: R.sheet, boxShadow: E.sheet, zIndex: Z.sheet,
    maxHeight: '85dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    paddingBottom: 'env(safe-area-inset-bottom,0px)',
};

export const sheetGrip = { width: 54, height: 3, borderRadius: R.pill, background: T.accent, boxShadow: `0 0 12px ${T.accent}`, margin: '10px auto 6px' };

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
