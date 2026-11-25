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
    warn: '#FFC66D',
    warnSoft: 'rgba(255,198,109,0.14)',
    danger: '#FF6B7A',
    dangerSoft: 'rgba(255,107,122,0.14)',
    purple: '#B9A7FF', // GTO / solver / "study" semantics
    purpleSoft: 'rgba(185,167,255,0.14)',
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
    backdrop: 900, sheet: 901, popover: 950, toast: 1000,
};

export const FONT = "Arial,'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
export const DISPLAY_FONT = "'Arial Narrow','Rajdhani',Arial,sans-serif";
export const DATA_FONT = "'IBM Plex Mono','SFMono-Regular',Consolas,monospace";

/** Numeric readouts (EV, equity, pot) share this treatment. */
export const numeric = { fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 };

export const card = {
    background: 'radial-gradient(ellipse at 90% -40%, rgba(30,56,83,0.45), transparent 63%), linear-gradient(145deg, #091727, #030B14 74%)',
    border: `1px solid ${T.border}`,
    borderTopColor: T.borderHi,
    borderRadius: R.md,
    padding: S.md,
    boxShadow: E.card,
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
};

export const cardCompact = {
    ...card,
    background: 'linear-gradient(108deg, #13253A, #060E18 72%)',
    padding: S.md,
    borderRadius: R.md,
};

export function btn(variant = 'primary', opts = {}) {
    const base = {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S.sm,
        minHeight: 44, minWidth: 44, padding: '0 16px', borderRadius: R.sm,
        fontSize: F.bodySm, fontWeight: 700, fontFamily: DISPLAY_FONT, lineHeight: 1.15,
        letterSpacing: '0.015em',
        cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        transition: 'background .12s ease, opacity .12s ease, border-color .12s ease',
        boxSizing: 'border-box', border: '1px solid transparent', width: opts.block ? '100%' : 'auto',
    };
    const v = {
        primary: {
            background: 'linear-gradient(180deg, #087CFA 0%, #0044AC 55%, #002B68 100%)',
            color: '#FFFFFF',
            borderColor: '#56D8FF',
            borderTopColor: '#B3EAFF',
            boxShadow: 'none',
        },
        secondary: {
            background: 'linear-gradient(180deg, #152639 0%, #06111E 65%)',
            color: '#DCE5EF',
            borderColor: T.border,
            borderTopColor: T.borderHi,
            boxShadow: 'none',
        },
        ghost: { background: 'transparent', color: T.textMuted, borderColor: 'transparent' },
        danger: { background: T.dangerSoft, color: T.danger, borderColor: 'rgba(255,107,122,0.5)' },
        success: { background: T.successSoft, color: T.success, borderColor: 'rgba(77,224,165,0.5)' },
        purple: { background: T.purpleSoft, color: T.purple, borderColor: 'rgba(185,167,255,0.5)' },
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
    background: `linear-gradient(180deg, #0D1E32 0, ${T.surface} 52px, #040D18 100%)`,
    border: `1px solid ${T.borderHi}`, borderBottom: 0,
    borderRadius: R.sheet, boxShadow: E.sheet, zIndex: Z.sheet,
    maxHeight: '85dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
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
