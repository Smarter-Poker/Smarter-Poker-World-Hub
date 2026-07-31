/**
 * Sandbox Sub-Components
 * - RangeMatrix (13x13 heatmap)
 * - FrequencyBar (animated action bar)
 * - classifyBoardTexture (auto-classify boards)
 * - ActionHistoryBuilder
 * - SizingSensitivity
 * - TreeVisualization
 * - OnboardingTour
 */
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Check, X as XIcon, Camera, Share2, Spade, Plus, Trash2,
    ChevronDown, ChevronUp, ChevronRight, Maximize2, AlertTriangle,
    Inbox, Flame, Target, RotateCcw, Info, Filter,
} from 'lucide-react';
import { SocialService } from '../../services/SocialService';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
// react-hot-toast matches the <Toaster> host the sandbox page mounts. The old
// `../../stores/toastStore` import rendered nowhere on this page.
import toast from 'react-hot-toast';
import { claimReward } from '../../lib/claimReward';

// ═══════════════════════════════════════════════════════════════════════════
// PA_DESIGN_SPEC v1 — "Neon Slate" tokens.
// Kept in this module (rather than a separate file) so the Sandbox surface has
// zero cross-file import risk; values are byte-identical to the shared spec.
// ═══════════════════════════════════════════════════════════════════════════
export const T = {
    bg: '#18191A',
    surface: '#242526',
    surface2: '#3A3B3C',
    surface3: '#4E4F50',
    border: '#3A3B3C',
    borderHi: '#4E4F50',
    text: '#E4E6EB',
    textMuted: '#B0B3B8',
    textDim: '#65676B',
    accent: '#4599FF',
    accentPress: '#2374E1',
    accentSoft: 'rgba(69,153,255,0.15)',
    success: '#22C55E',
    successSoft: 'rgba(34,197,94,0.15)',
    warn: '#FBBF24',
    warnSoft: 'rgba(251,191,36,0.15)',
    danger: '#EF4444',
    dangerSoft: 'rgba(239,68,68,0.15)',
    purple: '#A78BFA',
    purpleSoft: 'rgba(167,139,250,0.15)',
    scrim: 'rgba(0,0,0,0.6)',
    glassEdge: 'rgba(255,255,255,0.08)',
};

export const F = { h1: 22, h2: 18, h3: 16, body: 15, bodySm: 14, label: 13, caption: 12, input: 16 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const R = { sm: 8, md: 12, lg: 16, sheet: '20px 20px 0 0', pill: 999 };
export const E = {
    card: '0 1px 3px rgba(0,0,0,0.4)',
    raised: '0 4px 16px rgba(0,0,0,0.5)',
    sheet: '0 -8px 32px rgba(0,0,0,0.6)',
};
export const Z = { base: 1, felt: 10, feltCards: 20, sticky: 50, bottomNav: 100, backdrop: 900, sheet: 901, popover: 950, toast: 1000 };
export const FONT_STACK = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";
export const NUM = { fontVariantNumeric: 'tabular-nums' };

export const card = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md,
    padding: S.lg, boxShadow: E.card, boxSizing: 'border-box', width: '100%', maxWidth: '100%',
};
export const cardCompact = { ...card, padding: S.md, borderRadius: R.sm };

export function btn(variant = 'primary', opts = {}) {
    const base = {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S.sm,
        minHeight: 44, minWidth: 44, padding: '0 18px', borderRadius: R.sm,
        fontSize: F.bodySm, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1,
        cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        transition: 'transform .12s ease, background .12s ease, opacity .12s ease',
        boxSizing: 'border-box', border: '1px solid transparent', width: opts.block ? '100%' : 'auto',
    };
    const v = {
        primary: { background: `linear-gradient(135deg, ${T.accent}, ${T.accentPress})`, color: '#FFFFFF' },
        secondary: { background: T.surface2, color: T.text, borderColor: T.borderHi },
        ghost: { background: 'transparent', color: T.textMuted, borderColor: 'transparent' },
        danger: { background: T.dangerSoft, color: T.danger, borderColor: 'rgba(239,68,68,0.4)' },
        success: { background: T.successSoft, color: T.success, borderColor: 'rgba(34,197,94,0.4)' },
        purple: { background: T.purpleSoft, color: T.purple, borderColor: 'rgba(167,139,250,0.4)' },
    }[variant] || {};
    const dis = opts.disabled ? { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' } : null;
    return { ...base, ...v, ...dis };
}

export function iconBtn(opts = {}) {
    return {
        width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: '50%',
        background: opts.transparent ? 'transparent' : T.surface2,
        border: '1px solid transparent', color: opts.color || T.text,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0, flexShrink: 0,
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    };
}

export function pill(tone = 'neutral') {
    const m = {
        neutral: [T.textMuted, 'rgba(176,179,184,0.14)'], accent: [T.accent, T.accentSoft],
        success: [T.success, T.successSoft], warn: [T.warn, T.warnSoft],
        danger: [T.danger, T.dangerSoft], purple: [T.purple, T.purpleSoft],
    }[tone] || [T.textMuted, 'rgba(176,179,184,0.14)'];
    return {
        display: 'inline-flex', alignItems: 'center', gap: S.xs, padding: '5px 10px',
        borderRadius: R.pill, fontSize: F.caption, fontWeight: 700, lineHeight: 1.2,
        color: m[0], background: m[1], border: `1px solid ${m[0]}33`, whiteSpace: 'nowrap',
    };
}

export const sheetBackdrop = {
    position: 'fixed', inset: 0, background: T.scrim, zIndex: Z.backdrop,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    WebkitBackdropFilter: 'blur(2px)', backdropFilter: 'blur(2px)',
};
export const sheetStyle = {
    width: '100%', maxWidth: 520, background: T.surface, borderTop: `1px solid ${T.border}`,
    borderRadius: R.sheet, boxShadow: E.sheet, zIndex: Z.sheet,
    maxHeight: '85dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    paddingBottom: 'env(safe-area-inset-bottom,0px)',
};
export const sheetGrip = { width: 40, height: 4, borderRadius: R.pill, background: T.surface3, margin: '10px auto 6px', flexShrink: 0 };
export const sheetHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, padding: `0 ${S.lg}px ${S.md}px`, borderBottom: `1px solid ${T.border}`, flexShrink: 0 };
export const sheetBody = { padding: S.lg, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', flex: 1, minHeight: 0 };
export const sheetFooter = { padding: S.lg, borderTop: `1px solid ${T.border}`, display: 'flex', gap: S.sm, flexShrink: 0, background: T.surface };

export const sectionHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, marginBottom: S.md, minHeight: 28 };
export const sectionTitle = { fontSize: F.label, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: T.textDim, margin: 0 };

export const emptyWrap = { ...card, textAlign: 'center', padding: `${S.xl}px ${S.lg}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S.md };
export const emptyIcon = { width: 56, height: 56, borderRadius: '50%', background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, flexShrink: 0 };
export const emptyTitle = { fontSize: F.h3, fontWeight: 700, color: T.text, margin: 0 };
export const emptyBody = { fontSize: F.bodySm, color: T.textMuted, margin: 0, maxWidth: 280, lineHeight: 1.45 };

export const errorWrap = { ...card, borderColor: 'rgba(239,68,68,0.4)', background: T.dangerSoft, display: 'flex', flexDirection: 'column', gap: S.md, alignItems: 'flex-start' };
export const errorTitle = { fontSize: F.bodySm, fontWeight: 700, color: T.danger, display: 'flex', alignItems: 'center', gap: S.sm, margin: 0 };
export const errorBody = { fontSize: F.caption, color: T.textMuted, margin: 0, lineHeight: 1.45 };

export const skeleton = (h = 14, w = '100%') => ({ height: h, width: w, borderRadius: R.sm, background: T.surface2 });

/** prefers-reduced-motion, live-updating. Use on EVERY framer-motion component. */
export function usePrefersReducedMotion() {
    const [r, setR] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const m = window.matchMedia('(prefers-reduced-motion: reduce)');
        const on = () => setR(!!m.matches);
        on();
        if (m.addEventListener) m.addEventListener('change', on); else m.addListener(on);
        return () => { if (m.removeEventListener) m.removeEventListener('change', on); else m.removeListener(on); };
    }, []);
    return r;
}

/** Locks body scroll while `active` — restores the previous value on unmount. */
export function useBodyScrollLock(active) {
    useEffect(() => {
        if (!active || typeof document === 'undefined') return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [active]);
}

/** Escape-to-close for every overlay. */
export function useEscapeKey(active, onEscape) {
    useEffect(() => {
        if (!active || typeof window === 'undefined') return undefined;
        const h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onEscape?.(); } };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [active, onEscape]);
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDARD BOTTOM SHEET — the ONLY overlay pattern on mobile.
// Grip + 44px close + backdrop tap + Escape + body-scroll lock + dvh cap.
// ═══════════════════════════════════════════════════════════════════════════
export function BottomSheet({
    isOpen, onClose, title, subtitle, children, footer,
    maxWidth = 520, headerRight = null, bodyStyle = null, labelledBy,
}) {
    const reduce = usePrefersReducedMotion();
    useBodyScrollLock(isOpen);
    useEscapeKey(isOpen, onClose);
    const titleId = labelledBy || 'pa-sheet-title';

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="pa-sheet-backdrop"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.18 }}
                    style={sheetBackdrop}
                    onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
                >
                    <motion.div
                        role="dialog" aria-modal="true" aria-labelledby={titleId}
                        initial={reduce ? { opacity: 0 } : { y: '100%' }}
                        animate={reduce ? { opacity: 1 } : { y: 0 }}
                        exit={reduce ? { opacity: 0 } : { y: '100%' }}
                        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...sheetStyle, maxWidth }}
                    >
                        <div style={sheetGrip} aria-hidden="true" />
                        <div style={sheetHeader}>
                            <div style={{ minWidth: 0 }}>
                                <h3 id={titleId} style={{ margin: 0, fontSize: F.h3, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
                                {subtitle && <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: 2 }}>{subtitle}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexShrink: 0 }}>
                                {headerRight}
                                <button type="button" className="pa-btn" onClick={onClose} aria-label="Close" style={iconBtn()}>
                                    <XIcon size={18} strokeWidth={2} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                        <div style={{ ...sheetBody, ...(bodyStyle || {}) }}>{children}</div>
                        {footer && <div style={sheetFooter}>{footer}</div>}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/** Loading skeleton block — mirrors the real layout, never a bare spinner. */
export function SkeletonRows({ rows = 3, height = 56 }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }} aria-busy="true" aria-live="polite">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="pa-skel" style={skeleton(height)} />
            ))}
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Loading</span>
        </div>
    );
}

export function EmptyState({ icon, title, body, action }) {
    return (
        <div style={emptyWrap}>
            <div style={emptyIcon}>{icon || <Inbox size={24} strokeWidth={2} aria-hidden="true" />}</div>
            <h4 style={emptyTitle}>{title}</h4>
            {body && <p style={emptyBody}>{body}</p>}
            {action}
        </div>
    );
}

export function ErrorState({ title = 'Something went wrong', body, onRetry, retryLabel = 'Try again' }) {
    return (
        <div style={errorWrap} role="alert">
            <p style={errorTitle}><AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />{title}</p>
            {body && <p style={errorBody}>{body}</p>}
            {onRetry && (
                <button type="button" className="pa-btn" onClick={onRetry} style={btn('secondary')}>
                    <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />{retryLabel}
                </button>
            )}
        </div>
    );
}

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const BET_ACTIONS = [
    { id: 'fold', label: 'Fold' }, { id: 'check', label: 'Check' },
    { id: 'call', label: 'Call' }, { id: 'bet_33', label: 'Bet 33%' },
    { id: 'bet_50', label: 'Bet 50%' }, { id: 'bet_66', label: 'Bet 66%' },
    { id: 'bet_75', label: 'Bet 75%' }, { id: 'bet_100', label: 'Bet Pot' },
    { id: 'bet_150', label: 'Bet 150%' }, { id: 'raise', label: 'Raise' },
    { id: 'allin', label: 'All-In' }, { id: 'custom', label: 'Custom...' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ACTION GRADING — shared by QuizPanel, CoachVerdict and sandbox.js
// Bet/raise sizings are graded on BUCKETS so "Bet Small" is NOT counted as
// correct against "Bet Pot". Buckets: small <=40%, medium 41-75%, large 76-99%,
// pot >=100%.
// ═══════════════════════════════════════════════════════════════════════════
const WORD_BUCKETS = { small: 'small', third: 'small', half: 'medium', medium: 'medium', large: 'large', big: 'large', pot: 'pot', overbet: 'pot' };

export function sizeBucketFromPercent(pct) {
    if (pct == null || !Number.isFinite(pct)) return null;
    if (pct >= 100) return 'pot';
    if (pct > 75) return 'large';
    if (pct > 40) return 'medium';
    return 'small';
}

/**
 * Parse an action label ('Bet 66%', 'bet_150', 'Bet Small', 'All-In', 'Check')
 * into { type, size } where size is a bucket string or null when unknown.
 */
export function parseActionLabel(label) {
    const raw = String(label || '').trim().toLowerCase();
    if (!raw) return { type: null, size: null };

    let type = null;
    if (raw.includes('all-in') || raw.includes('all in') || raw.includes('allin') || raw.includes('shove')) type = 'allin';
    else if (raw.includes('fold')) type = 'fold';
    else if (raw.includes('check')) type = 'check';
    else if (raw.includes('raise') || raw.includes('3bet') || raw.includes('3-bet')) type = 'raise';
    else if (raw.includes('call')) type = 'call';
    else if (raw.includes('bet')) type = 'bet';
    else type = raw.split(/[\s_]/)[0] || null;

    let size = null;
    if (type === 'bet' || type === 'raise') {
        // Percent form ('Bet 66%') or solver id form ('bet_150'). Deliberately
        // NOT a bare \d+ so '3-Bet' is not read as a 3% sizing.
        const numMatch = raw.match(/(\d+(?:\.\d+)?)\s*%/) || raw.match(/^(?:bet|raise)[_\s-](\d+(?:\.\d+)?)$/);
        if (numMatch) {
            size = sizeBucketFromPercent(parseFloat(numMatch[1]));
        } else {
            for (const word of Object.keys(WORD_BUCKETS)) {
                if (raw.includes(word)) { size = WORD_BUCKETS[word]; break; }
            }
        }
    }
    return { type, size };
}

/**
 * Grade a user's action label against the GTO label.
 * Returns true only when the action type matches AND — when both labels carry a
 * usable sizing — the size buckets match too.
 */
export function gradeAction(userLabel, gtoLabel) {
    const a = parseActionLabel(userLabel);
    const b = parseActionLabel(gtoLabel);
    if (!a.type || !b.type) return false;
    if (a.type !== b.type) return false;
    // Only enforce sizing discipline when BOTH sides expose a size
    if (a.size && b.size) return a.size === b.size;
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL-ACTION ENGINE + POT MATH
// A tiny two-player state machine over actionHistory. It knows whose turn it
// is, what is legal, the amount to call, pot odds, MDF, per-player investment,
// remaining stacks, SPR and terminal states. Shared by the action builder, the
// coach picker, the felt readouts and the page's pot calculation so all four
// agree instead of each rolling its own (buggy) maths.
// ═══════════════════════════════════════════════════════════════════════════
export const ACTION_CATALOG = [
    { id: 'fold', label: 'Fold', tone: 'danger' },
    { id: 'check', label: 'Check', tone: 'neutral' },
    { id: 'call', label: 'Call', tone: 'warn' },
    { id: 'bet_33', label: 'Bet 33%', tone: 'success' },
    { id: 'bet_50', label: 'Bet 50%', tone: 'success' },
    { id: 'bet_66', label: 'Bet 66%', tone: 'success' },
    { id: 'bet_75', label: 'Bet 75%', tone: 'success' },
    { id: 'bet_100', label: 'Bet Pot', tone: 'success' },
    { id: 'bet_150', label: 'Bet 150%', tone: 'success' },
    { id: 'raise', label: 'Raise', tone: 'accent' },
    { id: 'allin', label: 'All-In', tone: 'warn' },
];

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];

function actorOf(entry, heroPosition) {
    if (!entry) return 'hero';
    if (entry.isVillain === true) return 'villain';
    if (entry.isHero === true) return 'hero';
    if (entry.position && heroPosition) return entry.position === heroPosition ? 'hero' : 'villain';
    return 'hero';
}

function betPctOf(actionId) {
    const m = String(actionId || '').match(/^bet_(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const pct = parseFloat(m[1]);
    return Number.isFinite(pct) && pct > 0 ? pct : null;
}

/**
 * Replay an action line and return the full hand state.
 *
 * @param {object} o
 * @param {number} o.basePot       starting pot in BB (blinds / manual entry)
 * @param {object[]} o.actions     action history entries
 * @param {string} o.heroPosition
 * @param {number} o.heroStack     starting stack, BB
 * @param {number} o.villainStack  starting stack, BB
 * @param {string} o.street        the street currently being built
 */
export function computeHandState({
    basePot = 1.5, actions = [], heroPosition = 'BTN',
    heroStack = 100, villainStack = 100, street = 'preflop',
} = {}) {
    const startStacks = {
        hero: Math.max(0, Number(heroStack) || 0),
        villain: Math.max(0, Number(villainStack) || 0),
    };
    const effective = Math.min(startStacks.hero, startStacks.villain);
    const invested = { hero: 0, villain: 0 };
    let committed = Math.max(0, Number(basePot) || 0); // chips already in the middle from closed streets
    let streetIn = { hero: 0, villain: 0 };
    let currentStreet = STREET_ORDER.includes(String(actions?.[0]?.street || '')) ? actions[0].street : 'preflop';
    let terminal = null;   // 'fold' | 'allin' | null
    let winner = null;
    let lastActor = null;
    let streetClosed = false;
    let actorsThisStreet = 0;

    const remainingOf = (who) => Math.max(0, effective - invested[who]);

    const closeStreet = () => {
        committed += streetIn.hero + streetIn.villain;
        streetIn = { hero: 0, villain: 0 };
        actorsThisStreet = 0;
        lastActor = null;
        streetClosed = false;
    };

    (actions || []).forEach((entry) => {
        if (terminal) return;
        const who = actorOf(entry, heroPosition);
        const other = who === 'hero' ? 'villain' : 'hero';
        const entryStreet = STREET_ORDER.includes(String(entry?.street || '')) ? entry.street : currentStreet;
        if (entryStreet !== currentStreet) { closeStreet(); currentStreet = entryStreet; }

        const potNow = committed + streetIn.hero + streetIn.villain;
        const toCall = Math.max(0, streetIn[other] - streetIn[who]);
        const id = String(entry?.action || '').toLowerCase();
        const add = (amt) => {
            const capped = Math.max(0, Math.min(amt, remainingOf(who)));
            streetIn[who] += capped;
            invested[who] += capped;
            return capped;
        };

        if (id === 'fold') {
            terminal = 'fold'; winner = other;
        } else if (id === 'check') {
            if (actorsThisStreet >= 1 && toCall === 0) streetClosed = true;
        } else if (id === 'call') {
            // A "call" with nothing to call is a check behind — it must NOT
            // invent chips (the old code added 50% of the pot).
            if (toCall > 0) { add(toCall); streetClosed = true; }
            else if (actorsThisStreet >= 1) streetClosed = true;
        } else if (id === 'raise') {
            // Raise-to = 3x the outstanding bet (2.5x if there is none to raise,
            // i.e. an open-raise off the blind), never a flat 1.5x pot.
            const target = toCall > 0 ? streetIn[other] * 3 : Math.max(potNow * 0.75, 2.5);
            add(Math.max(target - streetIn[who], toCall));
        } else if (id === 'allin') {
            add(remainingOf(who));
            if (remainingOf(who) <= 0 && remainingOf(other) <= 0) terminal = 'allin';
        } else {
            const pct = betPctOf(id);
            if (pct != null) add(potNow * (pct / 100));
        }

        if (remainingOf('hero') <= 0 && remainingOf('villain') <= 0 && !terminal) terminal = 'allin';
        lastActor = who;
        actorsThisStreet += 1;
    });

    const pot = Math.round((committed + streetIn.hero + streetIn.villain) * 10) / 10;
    const toActRaw = terminal ? null : (streetClosed ? null : (lastActor ? (lastActor === 'hero' ? 'villain' : 'hero') : 'hero'));
    const toAct = toActRaw;
    const who = toAct || 'hero';
    const other = who === 'hero' ? 'villain' : 'hero';
    const toCall = Math.max(0, Math.round((streetIn[other] - streetIn[who]) * 10) / 10);
    const facingBet = toCall > 0;
    const potOdds = facingBet && pot + toCall > 0 ? Math.round((toCall / (pot + toCall)) * 1000) / 10 : null;
    const mdf = facingBet && pot > 0 ? Math.round((pot / (pot + toCall)) * 1000) / 10 : null;
    const remaining = { hero: remainingOf('hero'), villain: remainingOf('villain') };
    const spr = pot > 0 ? Math.round((Math.min(remaining.hero, remaining.villain) / pot) * 10) / 10 : null;

    // Legal action ids for whoever is to act
    let legal;
    if (terminal) legal = [];
    else if (facingBet) legal = ['fold', 'call', 'raise', 'allin'];
    else legal = ['check', 'bet_33', 'bet_50', 'bet_66', 'bet_75', 'bet_100', 'bet_150', 'allin'];

    return {
        pot, toAct, toCall, facingBet, potOdds, mdf, spr,
        invested, remaining, effective, terminal, winner,
        streetClosed, legal, street: currentStreet || street,
        streetIn: { ...streetIn },
    };
}

/** Legal action ids for a specific actor given the current street contributions. */
export function legalActionsFor(handState, who = 'hero') {
    if (!handState || handState.terminal) return [];
    const other = who === 'hero' ? 'villain' : 'hero';
    const streetIn = handState.streetIn || { hero: 0, villain: 0 };
    const toCall = Math.max(0, (streetIn[other] || 0) - (streetIn[who] || 0));
    return toCall > 0
        ? ['fold', 'call', 'raise', 'allin']
        : ['check', 'bet_33', 'bet_50', 'bet_66', 'bet_75', 'bet_100', 'bet_150', 'allin'];
}

/** Convenience wrapper used for the page's pot readout. */
export function potFromActions(basePot, actions, opts = {}) {
    return computeHandState({ basePot, actions, ...opts }).pot;
}

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY BAR — supports a "ghost" GTO baseline behind the solid exploit bar
// ═══════════════════════════════════════════════════════════════════════════
export function FrequencyBar({ action, isOptimal, ghostFrequency = null }) {
    const reduce = usePrefersReducedMotion();
    const freq = Math.max(0, Math.min(100, Number(action?.frequency) || 0));
    const ghost = ghostFrequency == null ? null : Math.max(0, Math.min(100, Number(ghostFrequency) || 0));
    const delta = ghost == null ? null : Math.round(freq - ghost);
    return (
        <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -20 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
            transition={reduce ? { duration: 0 } : undefined}
            style={{ marginBottom: S.md }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: S.xs, gap: S.sm }}>
                <span style={{
                    color: isOptimal ? T.success : T.textMuted, fontSize: F.bodySm,
                    fontWeight: isOptimal ? 700 : 600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                }}>
                    {isOptimal && <Check size={14} strokeWidth={3} style={{ color: T.success, flexShrink: 0 }} aria-hidden="true" />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{action.label}</span>
                </span>
                <span style={{ color: isOptimal ? T.success : T.text, fontSize: F.bodySm, fontWeight: 700, ...NUM, flexShrink: 0 }}>
                    {freq}%
                    {delta != null && delta !== 0 && (
                        <span style={{ marginLeft: 6, fontSize: F.caption, color: delta > 0 ? T.warn : T.textDim }}>
                            {delta > 0 ? '+' : ''}{delta}
                        </span>
                    )}
                </span>
            </div>
            <div style={{ position: 'relative', height: 10, background: T.surface2, borderRadius: R.sm, overflow: 'hidden' }}>
                {ghost != null && (
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute', inset: 0, width: `${ghost}%`, borderRadius: R.sm,
                            background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 4px, transparent 4px 8px)',
                            border: '1px solid rgba(255,255,255,0.18)', boxSizing: 'border-box',
                        }}
                    />
                )}
                <motion.div
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${freq}%` }}
                    transition={reduce ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: R.sm, position: 'relative',
                        background: isOptimal
                            ? `linear-gradient(90deg, ${T.success}, #4ade80)`
                            : `linear-gradient(90deg, ${action.color || T.accentPress}, ${action.color || T.accentPress}88)`,
                    }}
                />
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE MATRIX (13x13)
// ═══════════════════════════════════════════════════════════════════════════
function getMatrixHandKey(row, col) {
    if (row === col) return `${RANKS[row]}${RANKS[col]}`;
    if (col > row) return `${RANKS[row]}${RANKS[col]}s`;
    return `${RANKS[col]}${RANKS[row]}o`;
}

function getMatrixColor(freq) {
    if (freq == null) return 'rgba(255,255,255,0.03)';
    if (freq >= 90) return '#22c55e'; if (freq >= 70) return '#4ade80';
    if (freq >= 50) return '#86efac'; if (freq >= 30) return '#fbbf24';
    if (freq >= 15) return '#f97316'; if (freq > 0) return '#ef4444';
    return 'rgba(255,255,255,0.03)';
}

// Module-level memoized cell — only the two cells whose selection flips re-render
// when the user sweeps across the 169-cell grid. Tap (not hover) selects, so the
// detail view is reachable on touch.
const MatrixCell = memo(function MatrixCell({ handKey, freq, isSelected, onSelect, fontSize }) {
    const select = useCallback(() => onSelect(handKey), [onSelect, handKey]);
    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`${handKey}${freq != null ? `, ${freq}%` : ', not in range'}`}
            aria-pressed={isSelected}
            onClick={select}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } }}
            onMouseEnter={() => onSelect(handKey, true)}
            style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize, fontWeight: 700, color: freq > 50 ? '#000' : T.text,
                background: getMatrixColor(freq), cursor: 'pointer', transition: 'opacity .15s',
                opacity: isSelected ? 1 : 0.85, letterSpacing: -0.4, overflow: 'hidden',
                outline: isSelected ? `2px solid ${T.text}` : 'none', outlineOffset: -2,
                touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
            }}
        >{handKey}</div>
    );
});

/**
 * 13x13 solver heatmap. Tap a cell to pin its per-action breakdown in a fixed
 * strip UNDER the grid (an absolutely-positioned tooltip clipped on mobile and
 * was hover-only, i.e. unreachable for 90% of users).
 */
export function RangeMatrix({ rangeHeatmap, selectedAction, onPickHand }) {
    const [pinned, setPinned] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const handleSelect = useCallback((hk, isHover) => {
        if (isHover) { if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)')?.matches) setPinned(hk); return; }
        setPinned(prev => (prev === hk ? null : hk));
    }, []);
    if (!rangeHeatmap?.data) return null;
    const actionId = selectedAction || rangeHeatmap.actions?.[0]?.id;
    const detail = pinned ? rangeHeatmap.data[pinned] : null;

    const grid = (fontSize) => (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1,
            background: T.surface2, borderRadius: R.sm, overflow: 'hidden', padding: 1, width: '100%',
        }}>
            {RANKS.map((_, row) => RANKS.map((_, col) => {
                const hk = getMatrixHandKey(row, col);
                const freq = rangeHeatmap.data[hk]?.[actionId] ?? null;
                return (
                    <MatrixCell key={`${row}-${col}`}
                        handKey={hk} freq={freq} fontSize={fontSize}
                        isSelected={pinned === hk}
                        onSelect={handleSelect}
                    />
                );
            }))}
        </div>
    );

    const detailStrip = (
        <div style={{
            marginTop: S.sm, minHeight: 44, display: 'flex', alignItems: 'center', gap: S.sm,
            padding: `${S.sm}px ${S.md}px`, borderRadius: R.sm, background: T.surface,
            border: `1px solid ${T.border}`, flexWrap: 'wrap',
        }}>
            {detail ? (
                <>
                    <strong style={{ fontSize: F.bodySm, color: T.text }}>{pinned}</strong>
                    {(rangeHeatmap.actions || []).slice(0, 4).map(a => (
                        <span key={a.id} style={{ fontSize: F.caption, color: a.id === actionId ? T.success : T.textMuted, ...NUM }}>
                            {a.label}: {detail[a.id] ?? 0}%
                        </span>
                    ))}
                    {onPickHand && (
                        <button type="button" className="pa-btn" onClick={() => onPickHand(pinned)}
                            style={{ ...btn('ghost'), minHeight: 44, padding: '0 10px', fontSize: F.caption, color: T.accent, marginLeft: 'auto' }}>
                            Use this hand
                        </button>
                    )}
                </>
            ) : (
                <span style={{ fontSize: F.caption, color: T.textMuted }}>Tap any cell to see its action mix.</span>
            )}
        </div>
    );

    return (
        <div>
            <div style={{ ...sectionHeader, marginBottom: S.sm }}>
                <p style={sectionTitle}>Hand grid</p>
                <button type="button" className="pa-btn" onClick={() => setExpanded(true)} aria-label="Expand range grid to full screen"
                    style={{ ...btn('ghost'), minHeight: 44, padding: '0 10px', fontSize: F.caption, color: T.accent }}>
                    <Maximize2 size={16} strokeWidth={2} aria-hidden="true" />Expand
                </button>
            </div>
            {grid(F.caption)}
            {detailStrip}
            <BottomSheet isOpen={expanded} onClose={() => setExpanded(false)} title="Range grid" subtitle="Tap a hand for its action mix" maxWidth={720}>
                {grid(F.caption)}
                {detailStrip}
            </BottomSheet>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════
const RANK_ORDER = 'AKQJT98765432';

// Connectivity is measured on the tightest 3-card window. The wheel is handled
// by also scoring A as low (rank value 13 => "1"), so A23 / A45 read connected.
function minWindowGap(rankIdxs) {
    const sorted = [...new Set(rankIdxs)].sort((a, b) => a - b);
    if (sorted.length < 3) return 99;
    let best = 99;
    for (let i = 0; i + 2 < sorted.length; i++) {
        best = Math.min(best, sorted[i + 2] - sorted[i]);
    }
    return best;
}

export function classifyBoardTexture(board) {
    const flop = board?.flop || [];
    if (flop.length < 3) return null;

    // Full runout: flop + turn + river (whatever exists)
    const cards = [...flop, board?.turn, board?.river].filter(Boolean);
    const suits = cards.map(c => String(c)[String(c).length - 1]?.toLowerCase()).filter(Boolean);
    const rankChars = cards.map(c => String(c)[0]?.toUpperCase()).filter(Boolean);
    const rankIdxs = rankChars.map(r => RANK_ORDER.indexOf(r)).filter(i => i >= 0);

    // Suit counts across the WHOLE board — used only for "is a flush already
    // possible", never for the monotone/two-tone/rainbow tag: on a complete
    // 5-card board the pigeonhole principle forces maxSuit >= 2, which would
    // make RAINBOW (and therefore DRY) unreachable and would relabel any river
    // holding three of a suit as MONOTONE.
    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Object.values(suitCounts).reduce((m, n) => Math.max(m, n), 0);
    const flushPossible = maxSuit >= 3;

    // The monotone/two-tone/rainbow tag is a property of the FLOP.
    const flopSuits = flop.map(c => String(c)[String(c).length - 1]?.toLowerCase()).filter(Boolean);
    const flopSuitCounts = {};
    flopSuits.forEach(s => { flopSuitCounts[s] = (flopSuitCounts[s] || 0) + 1; });
    const maxFlopSuit = Object.values(flopSuitCounts).reduce((m, n) => Math.max(m, n), 0);
    const isMonotone = maxFlopSuit >= 3;                   // all three flop cards same suit
    const isTwoTone = !isMonotone && maxFlopSuit === 2;    // flush draw live off the flop
    const isRainbow = maxFlopSuit <= 1;

    // Rank counts across the whole board
    const rankCounts = {};
    rankIdxs.forEach(r => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const maxRank = Object.values(rankCounts).reduce((m, n) => Math.max(m, n), 0);
    const isPaired = maxRank >= 2;
    const isTrips = maxRank >= 3;

    // Connectivity — evaluate with A high and, for the wheel, A low
    const gapHigh = minWindowGap(rankIdxs);
    const wheelIdxs = rankIdxs.map(r => (r === 0 ? 13 : r)); // A -> below 2
    const gapLow = minWindowGap(wheelIdxs);
    const gap = Math.min(gapHigh, gapLow);
    const isConnected = gap <= 4 && !isTrips;

    const isHighBoard = rankIdxs.length > 0 && Math.min(...rankIdxs) <= 4; // A=0,K=1,Q=2,J=3,T=4
    const isDry = isRainbow && !flushPossible && !isConnected && !isPaired && gap >= 6;
    const isWet = (flushPossible || isMonotone || isTwoTone) && isConnected;

    let label, color, textColor, strategy;
    if (isTrips) { label = '3-OF-A-KIND BOARD'; color = 'rgba(236,72,153,0.2)'; textColor = '#f472b6'; strategy = 'Very dry — high c-bet frequency, small sizing'; }
    else if (isMonotone) { label = 'MONOTONE'; color = 'rgba(239,68,68,0.2)'; textColor = '#fca5a5'; strategy = 'Flush-heavy board — reduce c-bet freq, check more with non-flush hands'; }
    else if (flushPossible) { label = 'FLUSH POSSIBLE'; color = 'rgba(239,68,68,0.15)'; textColor = '#fca5a5'; strategy = 'Three to a flush on board — size down and check back marginal made hands'; }
    else if (isWet) { label = 'WET / CONNECTED'; color = 'rgba(251,191,36,0.2)'; textColor = '#fde68a'; strategy = 'Many draws possible — polarize bet sizing, protect strong hands'; }
    else if (isDry) { label = 'DRY'; color = 'rgba(34,197,94,0.2)'; textColor = '#86efac'; strategy = 'Few draws — high c-bet frequency, use small sizing (25-33%)'; }
    else if (isPaired) { label = 'PAIRED'; color = 'rgba(139,92,246,0.2)'; textColor = '#c4b5fd'; strategy = 'Paired boards favor preflop raiser — c-bet with high frequency'; }
    else if (isHighBoard) { label = 'HIGH CARDS'; color = 'rgba(59,130,246,0.2)'; textColor = '#93c5fd'; strategy = 'Favors the in-position or preflop aggressor range'; }
    else { label = isTwoTone ? 'TWO-TONE' : 'RAINBOW'; color = 'rgba(100,116,139,0.2)'; textColor = '#94a3b8'; strategy = 'Standard texture — play position and range advantage'; }

    return { label, color, textColor, strategy, isMonotone, isTwoTone, isRainbow, flushPossible, isPaired, isConnected, isDry, isWet };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HISTORY BUILDER
// ═══════════════════════════════════════════════════════════════════════════
const STREET_TITLE = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

/**
 * Action-line builder.
 * - One tap per action (preset strip) instead of select → select → OK.
 * - Only LEGAL actions are offered (no Check facing a bet, no Call with
 *   nothing to call), so the analyze API never receives an impossible line.
 * - Hero/Villain toggle replaces the position dropdown that used to default to
 *   BTN regardless of the hero's actual seat.
 * - Chips grouped per street; delete is a 44x44 labelled button.
 */
export function ActionHistoryBuilder({
    actions = [], onAdd, onRemove, potSize,
    heroPosition = 'BTN', villainPosition = 'BB', street = 'preflop',
    handState = null, disabled = false,
}) {
    const [actor, setActor] = useState(null); // null => follow whose turn it is
    const [customOpen, setCustomOpen] = useState(false);
    const [customPct, setCustomPct] = useState(75);

    const state = handState || computeHandState({ basePot: potSize, actions, heroPosition, street });
    const turn = state.toAct || 'hero';
    const who = actor || turn;
    const legal = legalActionsFor(state, who);
    const outOfTurn = !!state.toAct && who !== state.toAct;

    const grouped = useMemo(() => {
        const out = [];
        (actions || []).forEach((a, i) => {
            const st = STREET_TITLE[String(a?.street || '').toLowerCase()] || STREET_TITLE[street] || 'Line';
            const bucket = out[out.length - 1];
            if (bucket && bucket.street === st) bucket.items.push({ a, i });
            else out.push({ street: st, items: [{ a, i }] });
        });
        return out;
    }, [actions, street]);

    const emit = (id, label) => {
        if (disabled) return;
        try { navigator.vibrate?.(8); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        onAdd?.({
            position: who === 'hero' ? heroPosition : villainPosition,
            action: id,
            label,
            street,
            isHero: who === 'hero',
            isVillain: who === 'villain',
        });
    };

    const actorBtn = (key, label) => (
        <button type="button" className="pa-btn" onClick={() => setActor(key)} aria-pressed={who === key}
            style={{
                ...btn(who === key ? 'primary' : 'secondary'), flex: 1, minWidth: 0, padding: '0 10px',
                fontSize: F.label,
            }}>
            {label}
        </button>
    );

    return (
        <div style={{ ...card, padding: S.md }}>
            <div style={sectionHeader}>
                <p style={sectionTitle}>Action line</p>
                <span style={{ ...pill(state.facingBet ? 'warn' : 'success'), ...NUM }}>
                    Pot {(Number(state.pot) || 0).toFixed(1)} BB
                </span>
            </div>

            {/* Live node maths — pot odds and MDF are the whole point of the builder */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm, marginBottom: S.md }}>
                {state.facingBet && <span style={{ ...pill('warn'), ...NUM }}>To call {state.toCall} BB</span>}
                {state.potOdds != null && <span style={{ ...pill('neutral'), ...NUM }}>Pot odds {state.potOdds}%</span>}
                {state.mdf != null && <span style={{ ...pill('neutral'), ...NUM }}>MDF {state.mdf}%</span>}
                {state.spr != null && <span style={{ ...pill('accent'), ...NUM }}>SPR {state.spr}</span>}
            </div>

            {grouped.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md, marginBottom: S.md }}>
                    {grouped.map(group => (
                        <div key={group.street}>
                            <div style={{ fontSize: F.caption, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                                {group.street}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.sm }}>
                                {group.items.map(({ a, i }) => (
                                    <span key={i} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 2, paddingLeft: 10,
                                        borderRadius: R.pill, background: T.surface2, border: `1px solid ${T.borderHi}`,
                                        color: T.text, fontSize: F.label, fontWeight: 600, minHeight: 44,
                                    }}>
                                        <span style={{ fontWeight: 700, color: a.isVillain ? T.warn : T.accent, marginRight: 4 }}>{a.position}</span>
                                        {a.label}
                                        <button type="button" className="pa-btn" onClick={() => onRemove?.(i)}
                                            aria-label={`Remove ${a.position} ${a.label}`}
                                            style={{ ...iconBtn({ transparent: true, color: T.danger }), width: 44, height: 44 }}>
                                            <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ color: T.textMuted, fontSize: F.bodySm, margin: `0 0 ${S.md}px`, lineHeight: 1.45 }}>
                    No actions yet — tap an action below to build the betting line.
                </p>
            )}

            {state.terminal ? (
                <div style={{ ...pill(state.terminal === 'fold' ? 'danger' : 'warn'), width: '100%', justifyContent: 'center', minHeight: 44 }}>
                    {state.terminal === 'fold' ? 'Hand over — someone folded' : 'All-in — no more actions'}
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: S.sm, marginBottom: S.sm }}>
                        {actorBtn('hero', `Hero (${heroPosition})`)}
                        {actorBtn('villain', `Villain (${villainPosition})`)}
                    </div>
                    {outOfTurn && (
                        <p style={{ fontSize: F.caption, color: T.warn, margin: `0 0 ${S.sm}px` }}>
                            It is {turn === 'hero' ? 'the hero' : 'the villain'}&apos;s turn — adding out of turn.
                        </p>
                    )}
                    <div
                        style={{
                            display: 'flex', gap: S.sm, overflowX: 'auto', paddingBottom: S.sm,
                            scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
                        }}>
                        {ACTION_CATALOG.filter(a => legal.includes(a.id)).map(a => (
                            <button key={a.id} type="button" className="pa-btn" disabled={disabled}
                                onClick={() => emit(a.id, a.label)}
                                style={{
                                    ...btn(a.tone === 'danger' ? 'danger' : a.tone === 'accent' ? 'secondary' : a.tone === 'warn' ? 'secondary' : 'success', { disabled }),
                                    scrollSnapAlign: 'start', flexShrink: 0, padding: '0 14px', fontSize: F.label,
                                }}>
                                {a.label}
                            </button>
                        ))}
                        {legal.some(id => id.startsWith('bet_')) && (
                            <button type="button" className="pa-btn" onClick={() => setCustomOpen(o => !o)}
                                aria-expanded={customOpen}
                                style={{ ...btn('secondary'), scrollSnapAlign: 'start', flexShrink: 0, padding: '0 14px', fontSize: F.label }}>
                                Custom
                                {customOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                            </button>
                        )}
                    </div>
                    {customOpen && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: S.md, marginTop: S.sm }}>
                            <input type="range" min="10" max="200" step="5" value={customPct}
                                aria-label="Custom bet size, percent of pot"
                                onChange={e => setCustomPct(Number(e.target.value))}
                                style={{ flex: 1, minWidth: 0, accentColor: T.purple, height: 44 }} />
                            <span style={{ color: T.purple, fontSize: F.body, fontWeight: 700, minWidth: 52, ...NUM }}>{customPct}%</span>
                            <button type="button" className="pa-btn" onClick={() => { emit(`bet_${customPct}`, `Bet ${customPct}%`); setCustomOpen(false); }}
                                style={{ ...btn('primary'), padding: '0 14px' }}>Add</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZING SENSITIVITY
// ═══════════════════════════════════════════════════════════════════════════
// Column definition — match on a NORMALIZED bet-size percentage, never on label
// substrings ('50%' used to also match 'Bet 150%'). The analyze API emits ids
// like `b25`/`b66`/`b100`; external solver imports may use `bet_66`.
const SIZING_COLUMNS = [
    { label: '25%', pct: 25 },
    { label: '33%', pct: 33 },
    { label: '50%', pct: 50 },
    { label: '66%', pct: 66 },
    { label: '75%', pct: 75 },
    { label: 'Pot', pct: 100 },
    { label: '150%', pct: 150 },
];

/**
 * Extract a bet-size percentage from a solver action.
 * Accepts `b66`, `bet_66`, `raise-75`, 'Bet 66%', 'Overbet 150%' and 'Bet Pot'.
 * Returns null when the action carries no usable sizing.
 */
export function betSizePercent(action) {
    if (!action) return null;
    const id = String(action.id || '').trim().toLowerCase();
    let m = id.match(/^(?:b|bet|r|raise)[_\s-]?(\d+(?:\.\d+)?)$/);
    if (m) return parseFloat(m[1]);
    const label = String(action.label || '').trim().toLowerCase();
    m = label.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) return parseFloat(m[1]);
    if (/\bpot\b/.test(label) && !/\d/.test(label)) return 100;
    return null;
}

export function SizingSensitivity({ results }) {
    if (!results?.actions) return null;
    const betActions = results.actions.filter(a =>
        betSizePercent(a) != null || /bet/i.test(String(a.label || ''))
    );
    if (betActions.length === 0) return null;

    return (
        <div style={{ ...cardCompact, background: T.surface2, marginBottom: S.md }}>
            <div style={sectionHeader}><p style={sectionTitle}>Sizing sensitivity</p></div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZING_COLUMNS.length}, minmax(0,1fr))`, gap: S.xs }}>
                {SIZING_COLUMNS.map(({ label: size, pct }) => {
                    // Sum in case the solver returns two ids that normalize to
                    // the same sizing (e.g. `b100` and 'Bet Pot').
                    const freq = Math.round(betActions.reduce((sum, a) => {
                        const p = betSizePercent(a);
                        return p != null && Math.abs(p - pct) < 0.5 ? sum + (Number(a.frequency) || 0) : sum;
                    }, 0));
                    return (
                        <div key={size} style={{ textAlign: 'center', minWidth: 0 }}>
                            <div style={{ height: 44, background: T.surface, borderRadius: R.sm, position: 'relative', overflow: 'hidden' }}>
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0, height: `${freq}%`,
                                    background: freq > 30 ? T.accent : T.accentPress, borderRadius: R.sm,
                                }} />
                            </div>
                            <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: 3 }}>{size}</div>
                            <div style={{ fontSize: F.caption, color: T.text, fontWeight: 700, ...NUM }}>{freq}%</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TREE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════
// Archetype response frequency tables — canonical copy shared by the decision
// tree, the villain simulator in the page and the coach picker.
export const VILLAIN_ACTION_TABLES = {
    calling_station: { fold: 15, call: 70, raise: 5, check: 55, bet: 35 },
    nit: { fold: 60, call: 30, raise: 10, check: 70, bet: 20 },
    lag: { fold: 15, call: 30, raise: 45, check: 30, bet: 60 },
    tag: { fold: 35, call: 40, raise: 25, check: 45, bet: 45 },
    maniac: { fold: 5, call: 25, raise: 60, check: 20, bet: 70 },
    fish: { fold: 20, call: 60, raise: 10, check: 55, bet: 30 },
    gto_neutral: { fold: 35, call: 40, raise: 25, check: 50, bet: 40 },
};

export function pickWeighted(weights) {
    const entries = Object.entries(weights || {}).filter(([, w]) => Number(w) > 0);
    if (entries.length === 0) return null;
    const total = entries.reduce((s, [, w]) => s + Number(w), 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= Number(w); if (r <= 0) return k; }
    return entries[entries.length - 1][0];
}

/** Normalised villain response distribution to a hero action id. */
export function villainResponseDistribution(archetypeId, heroActionId, texture) {
    const table = VILLAIN_ACTION_TABLES[archetypeId] || VILLAIN_ACTION_TABLES.gto_neutral;
    const id = String(heroActionId || '');
    const facingBet = /^(bet_|raise|allin)/.test(id);
    let w;
    if (facingBet) {
        w = { fold: table.fold, call: table.call, raise: table.raise };
        const pct = betSizePercent({ id }) ?? 100;
        if (pct >= 75) { w.fold *= 1.3; w.call *= 0.85; }
        if (pct <= 33) { w.fold *= 0.7; w.call *= 1.2; }
    } else {
        w = { check: table.check, bet_66: table.bet };
    }
    if (texture?.isWet || texture?.isMonotone || texture?.flushPossible) {
        if (w.raise != null) w.raise *= 1.25;
        if (w.bet_66 != null) w.bet_66 *= 1.2;
    } else if (texture?.isDry) {
        if (w.fold != null) w.fold *= 1.2;
        if (w.check != null) w.check *= 1.15;
    }
    const total = Object.values(w).reduce((s, n) => s + n, 0) || 1;
    return Object.entries(w).map(([id2, weight]) => ({
        id: id2,
        label: { fold: 'Fold', call: 'Call', raise: 'Raise', check: 'Check', bet_66: 'Bet 66%' }[id2] || id2,
        pct: Math.round((weight / total) * 100),
    })).sort((a, b) => b.pct - a.pct);
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION TREE — hero action -> simulated villain response, with the pot and
// hero equity that result from each branch. Branches are tappable so a line can
// be appended to the action history with two taps.
// ═══════════════════════════════════════════════════════════════════════════
export function TreeVisualization({ actions, archetypeId = 'gto_neutral', potSize = 0, heroEquity = null, boardTexture = null, onAppendLine }) {
    const [open, setOpen] = useState(null);
    const live = (actions || []).filter(a => Number(a.frequency) > 0);
    if (live.length === 0) return null;
    const pot = Number(potSize) || 0;

    return (
        <div style={{ ...card, padding: S.md, marginBottom: S.md }}>
            <div style={sectionHeader}>
                <p style={sectionTitle}>Decision tree</p>
                <span style={{ fontSize: F.caption, color: T.textDim }}>vs {archetypeId.replace(/_/g, ' ')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                {live.map((action) => {
                    const pct = betSizePercent(action);
                    const betAmt = pct != null ? pot * (pct / 100) : 0;
                    const responses = villainResponseDistribution(archetypeId, action.id || action.label, boardTexture);
                    const isOpen = open === (action.id || action.label);
                    return (
                        <div key={action.id || action.label} style={{ borderRadius: R.sm, border: `1px solid ${T.border}`, background: T.surface2, overflow: 'hidden' }}>
                            <button type="button" className="pa-btn" onClick={() => setOpen(isOpen ? null : (action.id || action.label))}
                                aria-expanded={isOpen}
                                style={{
                                    width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: S.sm,
                                    padding: `0 ${S.md}px`, background: 'transparent', border: 'none', color: T.text,
                                    fontSize: F.bodySm, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
                                }}>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{action.label}</span>
                                <span style={{ ...NUM, color: T.textMuted, fontSize: F.caption }}>{action.frequency}%</span>
                                {isOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
                            </button>
                            {isOpen && (
                                <div style={{ padding: `0 ${S.md}px ${S.md}px` }}>
                                    <div style={{ fontSize: F.caption, color: T.textDim, margin: `0 0 ${S.sm}px` }}>
                                        Villain responds{betAmt > 0 ? ` to ${betAmt.toFixed(1)} BB` : ''}:
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                                        {responses.map(r => {
                                            const resultPot = r.id === 'fold' ? pot
                                                : r.id === 'call' ? pot + betAmt * 2
                                                    : r.id === 'raise' ? pot + betAmt * 4
                                                        : pot + betAmt;
                                            return (
                                                <button key={r.id} type="button" className="pa-btn"
                                                    onClick={() => onAppendLine?.(action, r)}
                                                    disabled={!onAppendLine}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: S.sm, minHeight: 44,
                                                        padding: `0 ${S.md}px`, borderRadius: R.sm, textAlign: 'left',
                                                        background: T.surface, border: `1px solid ${T.border}`,
                                                        color: T.text, cursor: onAppendLine ? 'pointer' : 'default', width: '100%',
                                                    }}>
                                                    <span style={{ fontSize: F.label, fontWeight: 700, flex: 1, minWidth: 0 }}>{r.label}</span>
                                                    <span style={{ ...pill(r.id === 'fold' ? 'success' : r.id === 'raise' ? 'danger' : 'neutral'), ...NUM }}>{r.pct}%</span>
                                                    <span style={{ fontSize: F.caption, color: T.textMuted, ...NUM }}>
                                                        {r.id === 'fold' ? `+${pot.toFixed(1)} BB` : `pot ${resultPot.toFixed(1)}`}
                                                    </span>
                                                    {heroEquity != null && r.id !== 'fold' && (
                                                        <span style={{ fontSize: F.caption, color: heroEquity >= 50 ? T.success : T.warn, ...NUM }}>
                                                            {Math.round(heroEquity)}% eq
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING TOUR
// ═══════════════════════════════════════════════════════════════════════════
const TOUR_STEPS = [
    { target: 'sandbox-table', title: 'The table', text: 'Tap the dashed slots to pick your hole cards and the board. Swipe left across the felt to deal the next street, right to take the last card back.' },
    { target: 'sandbox-setup', title: 'Setup sheet', text: 'Position, stack, game type, villain archetype and felt live in this sheet. Set them once per session and get on with playing.' },
    { target: 'action-history', title: 'Action line', text: 'Build the betting line one tap at a time. Only legal actions are offered, and pot odds, MDF and SPR update as you go.' },
    { target: 'run-analysis', title: 'Analyze', text: 'The bottom bar is thumb-reachable: undo, deal, and the big Analyze button. In Coach Mode it asks for your action first.' },
    { target: 'results-panel', title: 'Results', text: 'Verdict, Deep Dive and Share tabs. The green badge means real solver data, purple means an AI approximation.' },
];

export function OnboardingTour({ isVisible, onClose, onNext, step = 0 }) {
    const reduce = usePrefersReducedMotion();
    const current = TOUR_STEPS[step] || null;
    const targetId = current?.target || null;
    const [rect, setRect] = useState(null);
    const [viewportH, setViewportH] = useState(0);
    const rafRef = useRef(null);
    const lastRectRef = useRef(null);
    useEscapeKey(isVisible, onClose);

    // Spotlight: scroll the referenced element into view and track its box so the
    // highlight ring stays glued to it. Measurement is rAF-throttled and bails
    // when nothing moved — a raw scroll listener calling setState per frame drops
    // frames badly on a mid-range phone.
    useEffect(() => {
        if (!isVisible || typeof window === 'undefined') return undefined;
        const onResize = () => setViewportH(window.innerHeight);
        onResize();
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible || !targetId || typeof document === 'undefined') { setRect(null); return undefined; }
        const el = document.getElementById(targetId);
        if (!el) { setRect(null); return undefined; }

        try { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

        let cancelled = false;
        const apply = () => {
            rafRef.current = null;
            if (cancelled) return;
            const r = el.getBoundingClientRect();
            if (!r || (r.width === 0 && r.height === 0)) { setRect(null); return; }
            const next = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
            const prev = lastRectRef.current;
            if (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height) return;
            lastRectRef.current = next;
            setRect(next);
        };
        const measure = () => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(apply);
        };
        measure();
        const settle = setTimeout(measure, 350); // after the smooth scroll lands
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            cancelled = true;
            clearTimeout(settle);
            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
            lastRectRef.current = null;
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [isVisible, targetId, step, reduce]);

    const placeBelow = !rect || (rect.top + rect.height + 220 < viewportH) || rect.top < 240;
    const cardStyle = rect
        ? {
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            ...(placeBelow
                ? { top: Math.min(Math.max(rect.top + rect.height + 16, 12), Math.max(viewportH - 220, 12)) }
                : { bottom: Math.min(Math.max(viewportH - rect.top + 16, 12), Math.max(viewportH - 60, 12)) }),
        }
        : {};

    // Four dim panels instead of a `0 0 0 9999px` box-shadow — far cheaper to
    // composite while scrolling on a phone.
    const scrim = 'rgba(0,0,0,0.7)';
    const panels = rect ? [
        { top: 0, left: 0, right: 0, height: Math.max(0, rect.top - 6) },
        { top: Math.max(0, rect.top - 6), left: 0, width: Math.max(0, rect.left - 6), height: rect.height + 12 },
        { top: Math.max(0, rect.top - 6), left: rect.left + rect.width + 6, right: 0, height: rect.height + 12 },
        { top: rect.top + rect.height + 6, left: 0, right: 0, bottom: 0 },
    ] : [];

    return (
        <AnimatePresence>
            {isVisible && current && (
                <motion.div
                    key="sandbox-tour"
                    role="dialog" aria-modal="true" aria-label={`Tour step ${step + 1}: ${current.title}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={reduce ? { duration: 0 } : undefined}
                    style={{
                        position: 'fixed', inset: 0, zIndex: Z.popover,
                        background: rect ? 'transparent' : scrim,
                        display: rect ? 'block' : 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {panels.map((p, i) => (
                        <div key={i} onClick={onClose} style={{ position: 'absolute', background: scrim, ...p }} />
                    ))}
                    {rect && (
                        <div
                            aria-hidden="true"
                            style={{
                                position: 'absolute',
                                top: rect.top - 6, left: rect.left - 6,
                                width: rect.width + 12, height: rect.height + 12,
                                borderRadius: R.md, pointerEvents: 'none',
                                border: `2px solid ${T.accent}`,
                                boxShadow: '0 0 24px rgba(69,153,255,0.55)',
                            }}
                        />
                    )}
                    <motion.div
                        initial={reduce ? { opacity: 0 } : { scale: 0.95, y: 20 }}
                        animate={reduce ? { opacity: 1 } : { scale: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
                        transition={reduce ? { duration: 0 } : undefined}
                        style={{
                            ...card, borderRadius: R.lg, padding: S.xl,
                            maxWidth: 380, width: 'calc(100% - 32px)',
                            boxShadow: E.raised, ...cardStyle,
                        }}
                    >
                        <div style={{ fontSize: F.h3, fontWeight: 800, color: T.text, marginBottom: S.sm }}>
                            {current.title}
                        </div>
                        <p style={{ color: T.textMuted, fontSize: F.bodySm, lineHeight: 1.45, margin: `0 0 ${S.lg}px` }}>
                            {current.text}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S.sm }}>
                            <span style={{ color: T.textDim, fontSize: F.caption, fontWeight: 700 }}>{step + 1} of {TOUR_STEPS.length}</span>
                            <div style={{ display: 'flex', gap: S.sm }}>
                                <button type="button" className="pa-btn" onClick={onClose} style={btn('secondary')}>Skip</button>
                                <button type="button" className="pa-btn" onClick={() => (step < TOUR_STEPS.length - 1 ? onNext() : onClose())} style={btn('primary')}>
                                    {step < TOUR_STEPS.length - 1 ? 'Next' : 'Get started'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// SHARE MODAL
// ═══════════════════════════════════════════════════════════════════════
export function ShareAnalysisModal({ isOpen, onClose, results, scenario }) {
    const [isPosting, setIsPosting] = useState(false);
    const closeTimerRef = useRef(null);

    // Never leave a pending auto-close timer behind — it would fire onClose (and
    // the parent setState) after the modal/page has already gone away.
    useEffect(() => () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, []);

    useEffect(() => {
        if (!isOpen && closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, [isOpen]);

    if (!isOpen || !results) return null;

    const shareText = `GTO Analysis: ${results.heroHand || 'Hand'} on ${scenario?.board || 'Board'}\n` +
        `Optimal: ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n` +
        `${results.isMixed ? 'Mixed Strategy' : 'Pure Strategy'}\n` +
        `Source: ${results.source}\n` +
        `Analyze your hands at Smarter.Poker`;

    const handleNativeShare = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: 'GTO Analysis — Smarter.Poker', text: shareText, url: 'https://smarter.poker/hub/personal-assistant/sandbox' });
            } else { handleCopy(); }
        } catch (e) { console.debug('Share cancelled'); }
    };
    const handleCopy = () => { navigator.clipboard?.writeText(shareText); toast.success('Copied to clipboard!'); };

    const handleInternalPost = async () => {
        try {
            setIsPosting(true);
            const user = getAuthUser();
            if (!user) {
                toast.error('You must be logged in to post.');
                return;
            }

            const socialService = new SocialService(supabase);
            const displayContent = `I just analyzed a hand in the GTO Sandbox!\n\n` +
                `**Hero:** ${results.heroHand || 'Hand'} on ${scenario?.board || 'Preflop'}\n` +
                `**Optimal line:** ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n\n` +
                `*${results.explanation?.substring(0, 150) || 'Check out my full analysis on Smarter.Poker.'}...*`;

            const newPost = await socialService.createPost({
                authorId: user.id,
                content: displayContent,
                contentType: 'text',
                visibility: 'public'
            });

            if (newPost) {
                claimReward('/api/rewards/social-post', { userId: user.id, postId: newPost.id }, 'New Post Published');
                toast.success('Posted to your feed!', 2000);
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; onClose?.(); }, 1500);
            }
        } catch (err) {
            console.warn('Feed post error:', err);
            toast.error('Failed to post to feed.');
        } finally {
            setIsPosting(false);
        }
    };

    const channels = [
        { label: isPosting ? 'Posting…' : 'Post to Smarter.Poker', onClick: handleInternalPost },
        { label: 'Copy text', onClick: handleCopy },
        { label: 'Share sheet', onClick: handleNativeShare },
        { label: 'Twitter', onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank') },
        { label: 'Facebook', onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(shareText)}`, '_blank') },
    ];

    return (
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Share analysis" labelledBy="pa-share-analysis-title">
            <div style={{
                background: T.surface2, borderRadius: R.sm, padding: S.md, marginBottom: S.lg,
                fontSize: F.bodySm, color: T.text, whiteSpace: 'pre-line', lineHeight: 1.45,
            }}>
                {shareText}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.sm }}>
                {channels.map((ch, idx) => (
                    <button key={ch.label} type="button" className="pa-btn" onClick={ch.onClick} disabled={isPosting && idx === 0}
                        style={{
                            ...btn(idx === 0 ? 'primary' : 'secondary', { disabled: isPosting && idx === 0 }),
                            gridColumn: idx === 0 ? '1 / -1' : 'auto', padding: '0 10px',
                        }}>{ch.label}</button>
                ))}
            </div>
        </BottomSheet>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STREET TIMELINE — Multi-Street Story Mode
// Shows how GTO strategy evolves across streets
// ═══════════════════════════════════════════════════════════════════════════
const STREET_SEQUENCE = ['preflop', 'flop', 'turn', 'river'];
function nextStreetLabel(streetHistory, streets) {
    const last = streetHistory?.[streetHistory.length - 1]?.street;
    const idx = STREET_SEQUENCE.indexOf(String(last || '').toLowerCase());
    if (idx >= 0 && idx < STREET_SEQUENCE.length - 1) {
        const nxt = STREET_SEQUENCE[idx + 1];
        return nxt.charAt(0).toUpperCase() + nxt.slice(1);
    }
    return streets[streetHistory?.length] || 'Next';
}

export function StreetTimeline({ streetHistory, activeStreet, onSelectStreet }) {
    if (!streetHistory || streetHistory.length === 0) return null;

    const streets = ['Flop', 'Turn', 'River'];
    return (
        <div style={{
            display: 'flex', gap: S.sm, marginBottom: S.md, background: T.surface, borderRadius: R.sm,
            padding: 6, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        }}>
            {streetHistory.map((entry, i) => {
                const isActive = activeStreet === i;
                // Label from the data, not the index — an imported scenario can
                // start on the turn, in which case streets[0] would lie.
                const streetLabel = entry?.street
                    ? String(entry.street).charAt(0).toUpperCase() + String(entry.street).slice(1)
                    : (streets[i] || `Street ${i + 1}`);
                return (
                    <button key={i} type="button" className="pa-btn" onClick={() => onSelectStreet(i)}
                        aria-pressed={isActive} aria-label={`Show ${streetLabel} analysis`}
                        style={{
                            flex: '1 0 88px', minWidth: 88, minHeight: 56, padding: `${S.sm}px 6px`, borderRadius: R.sm,
                            border: 'none', scrollSnapAlign: 'start', cursor: 'pointer', textAlign: 'center',
                            background: isActive ? T.accentSoft : 'transparent',
                            borderBottom: isActive ? `2px solid ${T.accentPress}` : '2px solid transparent',
                        }}>
                        <div style={{ fontSize: F.caption, fontWeight: 700, color: isActive ? T.accent : T.textDim, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                            {streetLabel}
                        </div>
                        {entry.results && (
                            <>
                                <div style={{ fontSize: F.caption, fontWeight: 600, color: isActive ? T.text : T.textMuted, marginTop: 2 }}>
                                    {entry.results.optimalAction?.label || '--'}
                                </div>
                                <div style={{ fontSize: F.caption, color: entry.results.ev?.hero >= 0 ? T.success : T.danger, marginTop: 1, ...NUM }}>
                                    {entry.results.ev?.heroDisplay || ''}
                                </div>
                            </>
                        )}
                    </button>
                );
            })}
            {streetHistory.length < 3 && (
                <div style={{ flex: '1 0 88px', minWidth: 88, minHeight: 56, padding: S.sm, borderRadius: R.sm, textAlign: 'center', border: `1px dashed ${T.borderHi}`, scrollSnapAlign: 'start' }}>
                    <div style={{ fontSize: F.caption, color: T.textMuted, fontWeight: 700 }}>{nextStreetLabel(streetHistory, streets)}</div>
                    <div style={{ fontSize: F.caption, color: T.textDim, marginTop: 2 }}>Deal to unlock</div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS SKELETON — Loading animation during analysis
// ═══════════════════════════════════════════════════════════════════════════
export function AnalysisSkeleton() {
    const block = { background: T.surface2, borderRadius: R.sm };
    return (
        <div style={{ ...card, padding: S.lg }} aria-busy="true" aria-live="polite">
            <div className="pa-skel" style={{ ...block, height: 28, marginBottom: S.md, width: '60%' }} />
            {[1, 0.7, 0.4, 0.2].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.sm }}>
                    <div className="pa-skel" style={{ ...block, height: 14, width: 50, flexShrink: 0 }} />
                    <div className="pa-skel" style={{ ...block, height: 14, flex: 1, maxWidth: `${w * 100}%` }} />
                </div>
            ))}
            <div className="pa-skel" style={{ ...block, height: 40, marginTop: S.lg, width: '80%' }} />
            <div className="pa-skel" style={{ ...block, height: 120, marginTop: S.md }} />
            <div style={{ textAlign: 'center', color: T.textMuted, fontSize: F.caption, marginTop: S.md }}>
                Analyzing hand…
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFLOP CHART OVERLAY — Phase 2.1
// Compact 13x13 range grid with position-specific GTO colors
// ═══════════════════════════════════════════════════════════════════════════
export function PreflopChartOverlay({ position, scenario, rangeGrid, rangePercent, onChangeScenario, onPickHand }) {
    const [picked, setPicked] = useState(null);
    if (!rangeGrid) return null;

    // 'check' is emitted for BB RFI (the BB is never first-in — an unopened pot
    // is checked through), so it needs its own swatch or every cell renders as
    // undifferentiated grey with an `undefined44` border.
    const actionColors = { raise: '#22c55e', '3bet': '#ef4444', call: '#3b82f6', check: '#6b7280', fold: 'transparent' };
    const CELL_FALLBACK = '#3A3B3C';
    const cellColor = (action) => actionColors[action] || CELL_FALLBACK;
    const cells = rangeGrid.flat();
    const hasCheck = cells.some(c => c && c.action === 'check');
    return (
        <div style={{ ...card, padding: S.md, marginBottom: S.md }}>
            <div style={sectionHeader}>
                <p style={sectionTitle}>
                    {position} range — {rangePercent}%{hasCheck ? ' (checked through)' : ''}
                </p>
                <div style={{ display: 'flex', gap: S.sm }}>
                    {['rfi', '3bet'].map(s => (
                        <button key={s} type="button" className="pa-btn" onClick={() => onChangeScenario(s)} aria-pressed={scenario === s}
                            style={{ ...btn(scenario === s ? 'primary' : 'secondary'), padding: '0 12px', fontSize: F.caption }}>
                            {s === 'rfi' ? 'Open' : '3-Bet'}
                        </button>
                    ))}
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1, fontSize: F.caption }}>
                {cells.map((cell, i) => {
                    // getRangeGrid can emit sparse rows — a null cell used to crash
                    // the whole preflop panel on `cell.inRange`.
                    if (!cell) return <div key={i} aria-hidden="true" style={{ aspectRatio: '1' }} />;
                    const isPicked = picked === cell.hand;
                    return (
                        <button key={i} type="button" onClick={() => { setPicked(cell.hand); onPickHand?.(cell.hand); }}
                            aria-label={`${cell.hand}: ${cell.inRange ? cell.action || 'in range' : 'fold'}`}
                            style={{
                                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                padding: 0, borderRadius: 2, cursor: 'pointer', overflow: 'hidden',
                                letterSpacing: -0.6, fontSize: F.caption,
                                background: cell.inRange ? cellColor(cell.action) + '33' : T.surface,
                                border: isPicked ? `1px solid ${T.text}` : cell.inRange ? `1px solid ${cellColor(cell.action)}44` : '1px solid transparent',
                                color: cell.inRange ? T.text : T.surface3,
                                fontWeight: cell.inRange ? 700 : 400,
                                touchAction: 'manipulation',
                            }}>{cell.hand}</button>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: S.md, marginTop: S.sm, fontSize: F.caption, flexWrap: 'wrap', fontWeight: 700 }}>
                <span style={{ color: actionColors.raise }}>Raise</span>
                <span style={{ color: actionColors['3bet'] }}>3-Bet</span>
                <span style={{ color: actionColors.call }}>Call</span>
                {hasCheck && <span style={{ color: actionColors.check }}>Check</span>}
                <span style={{ color: T.textDim }}>Fold</span>
            </div>
            {picked && (
                <p style={{ fontSize: F.caption, color: T.textMuted, margin: `${S.sm}px 0 0` }}>
                    Selected <strong style={{ color: T.text }}>{picked}</strong>
                    {onPickHand ? ' — loaded into the hero hand.' : '.'}
                </p>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNOUT CHART — Phase 2.2
// Shows best/worst cards for next street + improve/worsen rates
// ═══════════════════════════════════════════════════════════════════════════
export function RunoutChart({ runoutData }) {
    if (!runoutData || !runoutData.bestCards || runoutData.bestCards.length === 0) return null;

    const stat = (value, label, color) => (
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: F.h2, fontWeight: 800, color, ...NUM }}>{value}%</div>
            <div style={{ fontSize: F.caption, color: T.textMuted }}>{label}</div>
        </div>
    );
    return (
        <div style={{ ...card, padding: S.md, marginBottom: S.md }}>
            <div style={sectionHeader}><p style={sectionTitle}>Runout simulator</p></div>
            <div style={{ display: 'flex', gap: S.md, marginBottom: S.md }}>
                {stat(runoutData.improveRate, 'Improve', T.success)}
                {stat(runoutData.worsenRate, 'Worsen', T.danger)}
                {stat(runoutData.avgEquity, 'Avg equity', T.warn)}
            </div>
            <div style={{ display: 'flex', gap: S.md }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: F.caption, color: T.success, fontWeight: 700, marginBottom: S.xs }}>Best cards</div>
                    {runoutData.bestCards.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: F.caption }}>
                            <span style={{ color: T.text, fontWeight: 600 }}>{c.card}</span>
                            <span style={{ color: T.success, ...NUM }}>{c.equity}%</span>
                        </div>
                    ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: F.caption, color: T.danger, fontWeight: 700, marginBottom: S.xs }}>Worst cards</div>
                    {runoutData.worstCards.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: F.caption }}>
                            <span style={{ color: T.text, fontWeight: 600 }}>{c.card}</span>
                            <span style={{ color: T.danger, ...NUM }}>{c.equity}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLOIT TOGGLE — Phase 2.3
// Toggle between GTO and Exploitative recommendations
// ═══════════════════════════════════════════════════════════════════════════
export function ExploitToggle({ mode, onToggle, exploitTip }) {
    const isGto = mode === 'gto';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.md, flexWrap: 'wrap' }}>
            <button
                type="button" className="pa-btn"
                aria-pressed={!isGto}
                aria-label={isGto ? 'Switch to exploitative mode' : 'Switch to GTO mode'}
                onClick={() => onToggle(isGto ? 'exploit' : 'gto')}
                style={{ ...btn(isGto ? 'success' : 'secondary'), borderRadius: R.pill, padding: '0 16px', color: isGto ? T.success : T.warn }}>
                {isGto ? 'GTO' : 'Exploit'}
            </button>
            {!isGto && exploitTip && (
                <span style={{ fontSize: F.caption, color: T.warn, flex: '1 1 160px', minWidth: 0, lineHeight: 1.45 }}>{exploitTip}</span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ PANEL — Phase 3.1
// "What Would You Do?" — pick an action before seeing the GTO answer
// ═══════════════════════════════════════════════════════════════════════════
export function QuizPanel({ onGuess, correctAction, revealed, userGuess, score, prompt }) {
    // Every size bucket the grader knows about must be reachable, otherwise a
    // pot-sized GTO answer would be impossible to get right. Short labels keep
    // the 3x3 decision matrix readable at 375px; the full name is the aria-label.
    const [pending, setPending] = useState(null);
    const actions = [
        { label: 'Fold', short: 'Fold', group: 'passive' },
        { label: 'Check', short: 'Check', group: 'passive' },
        { label: 'Call', short: 'Call', group: 'passive' },
        { label: 'Bet Small', short: 'Bet S', group: 'aggro' },
        { label: 'Bet Medium', short: 'Bet M', group: 'aggro' },
        { label: 'Bet Large', short: 'Bet L', group: 'aggro' },
        { label: 'Bet Pot', short: 'Pot', group: 'aggro' },
        { label: 'Raise', short: 'Raise', group: 'aggro' },
        { label: 'All-In', short: 'All-In', group: 'aggro' },
    ];

    if (revealed) {
        const isCorrect = !!(userGuess && correctAction) && gradeAction(userGuess, correctAction);
        return (
            <div
                style={{
                    padding: S.md, borderRadius: R.md, marginBottom: S.md,
                    background: isCorrect ? T.successSoft : T.dangerSoft,
                    border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                }}>
                <div style={{ fontSize: F.h3, fontWeight: 800, color: isCorrect ? T.success : T.danger, marginBottom: S.xs, display: 'flex', alignItems: 'center', gap: S.sm }}>
                    {isCorrect ? <Check size={18} strokeWidth={3} aria-hidden="true" /> : <XIcon size={18} strokeWidth={3} aria-hidden="true" />}
                    {isCorrect ? 'Correct' : 'Incorrect'}
                </div>
                <div style={{ fontSize: F.bodySm, color: T.textMuted, lineHeight: 1.45 }}>
                    You chose <strong style={{ color: T.text }}>{userGuess}</strong> — GTO: <strong style={{ color: T.accent }}>{correctAction}</strong>
                </div>
                {score && (
                    <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: S.xs, ...NUM }}>
                        Score {score.correct}/{score.total} ({score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%) · Streak {score.streak}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ padding: S.md, borderRadius: R.md, marginBottom: S.md, background: T.accentSoft, border: `1px solid rgba(69,153,255,0.35)` }}>
            <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.accent, marginBottom: S.sm }}>What would you do?</div>
            {prompt && <p style={{ fontSize: F.bodySm, color: T.text, margin: `0 0 ${S.md}px`, lineHeight: 1.45 }}>{prompt}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: S.sm }}>
                {actions.map(a => (
                    <button key={a.label} type="button" className="pa-btn" aria-label={a.label}
                        onClick={() => { setPending(a.label); onGuess(a.label); }}
                        style={{
                            ...btn(a.group === 'passive' ? 'secondary' : 'success'),
                            minHeight: 48, padding: '0 6px', fontSize: F.label, width: '100%',
                            outline: pending === a.label ? `2px solid ${T.accent}` : 'none', outlineOffset: 2,
                        }}>{a.short}</button>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDY REPLAY CARD — Phase 3.2
// Compact flashcard view of a previous analysis
// ═══════════════════════════════════════════════════════════════════════════
export function StudyReplayCard({ session, index, total, onNext, onPrev }) {
    if (!session) return null;

    return (
        <div style={{ ...card, padding: S.md, marginBottom: S.md }}>
            <div style={sectionHeader}>
                <p style={sectionTitle}>Study card {index + 1} of {total}</p>
                <div style={{ display: 'flex', gap: S.sm }}>
                    <button type="button" className="pa-btn" onClick={onPrev} disabled={index === 0} aria-label="Previous study card"
                        style={{ ...btn('secondary', { disabled: index === 0 }), padding: '0 12px', fontSize: F.caption }}>Prev</button>
                    <button type="button" className="pa-btn" onClick={onNext} disabled={index >= total - 1} aria-label="Next study card"
                        style={{ ...btn('secondary', { disabled: index >= total - 1 }), padding: '0 12px', fontSize: F.caption }}>Next</button>
                </div>
            </div>
            <div style={{ fontSize: F.bodySm, color: T.text, marginBottom: S.xs }}>
                {session.label || `${session.hero_position || ''} ${session.hero_hand || 'Unknown'}`}
            </div>
            {session.full_analysis && (
                <div style={{ fontSize: F.caption, color: T.textMuted }}>
                    Optimal: <strong style={{ color: T.success }}>{session.full_analysis?.optimalAction?.label || 'N/A'}</strong>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCURACY BADGE — Phase 3.4
// Shows quiz accuracy % and streak in the header
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Props: stats = { correct, total, streak }.
 * Accuracy is computed here so callers can hand the raw quizScore straight
 * through. An explicit stats.accuracy is still honoured for back-compat.
 */
export function AccuracyBadge({ stats }) {
    const total = Number(stats?.total) || 0;
    if (!stats || total === 0) return null;

    const correct = Number(stats.correct) || 0;
    const accuracy = stats.accuracy != null && Number.isFinite(Number(stats.accuracy))
        ? Math.round(Number(stats.accuracy))
        : Math.round((correct / total) * 100);
    const streak = Number(stats.streak) || 0;
    const tone = accuracy >= 70 ? 'success' : accuracy >= 50 ? 'warn' : 'danger';

    return (
        <span style={{ ...pill(tone), ...NUM }} aria-label={`Quiz accuracy ${accuracy} percent, streak ${streak}`}>
            <Target size={12} strokeWidth={2} aria-hidden="true" />
            {accuracy}%
            {streak > 0 && <span style={{ color: T.warn, marginLeft: 4 }}>{streak}x</span>}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS STRIP — always-visible progress loop (accuracy, coach streak, pot,
// equity). This is the cheapest motivation loop available and every number in
// it is already computed elsewhere in the page.
// ═══════════════════════════════════════════════════════════════════════════
export function StatusStrip({ quizScore, coachStreak = 0, equity = null, pot = null, spr = null, handClass = null, dueCount = 0, onDue }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: S.sm, overflowX: 'auto', padding: `${S.sm}px 0`,
            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', minHeight: 44,
        }}>
            {handClass && <span style={{ ...pill('accent'), flexShrink: 0 }}>{handClass}</span>}
            {equity != null && Number.isFinite(Number(equity)) && (
                <span style={{ ...pill(Number(equity) >= 50 ? 'success' : 'warn'), ...NUM, flexShrink: 0 }}>{Number(equity).toFixed(1)}% eq</span>
            )}
            {pot != null && <span style={{ ...pill('neutral'), ...NUM, flexShrink: 0 }}>Pot {Number(pot).toFixed(1)} BB</span>}
            {spr != null && <span style={{ ...pill('neutral'), ...NUM, flexShrink: 0 }}>SPR {spr}</span>}
            <AccuracyBadge stats={quizScore} />
            {coachStreak > 0 && (
                <span style={{ ...pill('warn'), flexShrink: 0 }} aria-label={`Coach streak ${coachStreak}`}>
                    <Flame size={12} strokeWidth={2} aria-hidden="true" />{coachStreak}
                </span>
            )}
            {dueCount > 0 && (
                <button type="button" className="pa-btn" onClick={onDue}
                    style={{ ...btn('purple'), borderRadius: R.pill, padding: '0 14px', fontSize: F.caption, flexShrink: 0 }}>
                    Due today ({dueCount})
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD CARD — Phase 4.4
// Compact leaderboard for quiz accuracy
// ═══════════════════════════════════════════════════════════════════════════
export function LeaderboardCard({ entries }) {
    if (!entries || entries.length === 0) return null;

    return (
        <div style={{ ...card, padding: S.md, marginBottom: S.md }}>
            <div style={sectionHeader}><p style={sectionTitle}>Leaderboard</p></div>
            {entries.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S.sm, padding: '6px 0', fontSize: F.bodySm, borderBottom: i < entries.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ color: i < 3 ? T.warn : T.textMuted, fontWeight: 700, ...NUM }}>#{i + 1}</span>
                        <span style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name || 'Anonymous'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexShrink: 0 }}>
                        <span style={{ color: e.accuracy >= 70 ? T.success : T.warn, fontWeight: 700, ...NUM }}>{e.accuracy}%</span>
                        {e.streak > 0 && <span style={{ color: T.warn, fontSize: F.caption, ...NUM }}>{e.streak}x</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════════════════
// EQUITY GRAPH — Wave 2 Feature 4
// SVG line chart: tracks hero equity across streets
// ═══════════════════════════════════════════════════════════════════════════
const STREET_SHORT = { preflop: 'Pre', flop: 'Flop', turn: 'Turn', river: 'River' };
const STREET_SHORT_SEQ = ['Pre', 'Flop', 'Turn', 'River'];

export function EquityGraph({ streetHistory, currentEquity, currentStreet, onSelectStreet, verdicts }) {
    const points = useMemo(() => {
        const pts = [];
        // Archived streets come FIRST (oldest -> newest), labelled from their own
        // entry.street, then the LIVE equity for the current street is appended.
        (streetHistory || []).forEach((entry, i) => {
            if (entry?.equity == null) return;
            const key = String(entry.street || '').toLowerCase();
            pts.push({
                street: STREET_SHORT[key] || STREET_SHORT_SEQ[i] || `S${i + 1}`,
                equity: Number(entry.equity),
            });
        });
        if (currentEquity != null && Number.isFinite(Number(currentEquity))) {
            const liveKey = String(currentStreet || '').toLowerCase();
            let liveLabel = STREET_SHORT[liveKey];
            if (!liveLabel) {
                // Derive: the live street is one past the newest archived street
                const lastKey = String(streetHistory?.[streetHistory.length - 1]?.street || '').toLowerCase();
                const lastIdx = STREET_SEQUENCE.indexOf(lastKey);
                liveLabel = lastIdx >= 0
                    ? (STREET_SHORT_SEQ[Math.min(lastIdx + 1, STREET_SHORT_SEQ.length - 1)])
                    : (STREET_SHORT_SEQ[Math.min(streetHistory?.length || 0, STREET_SHORT_SEQ.length - 1)] || 'Now');
            }
            pts.push({ street: liveLabel, equity: Number(currentEquity), live: true });
        }
        return pts.filter(p => Number.isFinite(p.equity));
    }, [streetHistory, currentEquity, currentStreet]);

    if (points.length < 2) return null;

    const W = 260, H = 80, PAD = 16;
    const xStep = (W - PAD * 2) / (points.length - 1);
    const yScale = (v) => PAD + (H - PAD * 2) * (1 - v / 100);
    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${PAD + i * xStep},${yScale(p.equity)}`).join(' ');
    const areaD = lineD + ` L${PAD + (points.length - 1) * xStep},${H - PAD} L${PAD},${H - PAD} Z`;
    const lastEquity = points[points.length - 1]?.equity || 50;
    const color = lastEquity >= 50 ? '#22c55e' : '#ef4444';

    return (
        <div style={{ ...card, padding: S.md, marginBottom: S.md }}>
            <div style={sectionHeader}><p style={sectionTitle}>Equity progression</p></div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
                aria-label={`Equity by street: ${points.map(p => `${p.street} ${Math.round(p.equity)} percent`).join(', ')}`}
                style={{ display: 'block', overflow: 'visible' }}>
                {[25, 50, 75].map(v => (
                    <line key={v} x1={PAD} y1={yScale(v)} x2={W - PAD} y2={yScale(v)} stroke={T.surface2} strokeWidth="1" strokeDasharray="3,3" />
                ))}
                <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <path d={areaD} fill="url(#eqGrad)" />
                <path d={lineD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, i) => {
                    const verdict = verdicts?.[i];
                    const dot = verdict == null ? color : verdict ? T.success : T.danger;
                    return (
                        <g key={i}>
                            <circle cx={PAD + i * xStep} cy={yScale(p.equity)} r="4" fill={dot} />
                            <text x={PAD + i * xStep} y={H - 2} textAnchor="middle" fontSize="10" fill={T.textMuted}>{p.street}</text>
                            <text x={PAD + i * xStep} y={yScale(p.equity) - 8} textAnchor="middle" fontSize="10" fill={color} fontWeight="700">
                                {Math.round(p.equity)}%
                            </text>
                        </g>
                    );
                })}
            </svg>
            {onSelectStreet && points.length > 1 && (
                <div style={{ display: 'flex', gap: S.sm, marginTop: S.sm, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {points.map((p, i) => (
                        <button key={i} type="button" className="pa-btn" onClick={() => onSelectStreet(i)}
                            aria-label={`Show ${p.street} analysis`}
                            style={{ ...btn('secondary'), flexShrink: 0, padding: '0 12px', fontSize: F.caption }}>
                            {p.street} {Math.round(p.equity)}%
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION LOG MODAL — Wave 2 Feature 5
// ═══════════════════════════════════════════════════════════════════════════
const SESSION_ACTION_COLORS = { fold: '#ef4444', check: '#94a3b8', call: '#fbbf24', bet: '#22c55e', raise: '#22c55e', allin: '#f97316' };

export function SessionLogModal({ isOpen, onClose, sessionLog, onLoadEntry, onClearSession }) {
    // Two-step confirm — the journal is persisted to IndexedDB, so one stray tap
    // used to destroy it irrecoverably.
    const [confirmClear, setConfirmClear] = useState(false);
    const confirmTimerRef = useRef(null);

    const clearConfirmTimer = useCallback(() => {
        if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    }, []);
    useEffect(() => clearConfirmTimer, [clearConfirmTimer]);
    useEffect(() => {
        if (!isOpen) { clearConfirmTimer(); setConfirmClear(false); }
    }, [isOpen, clearConfirmTimer]);

    const handleClearClick = useCallback(() => {
        try { navigator.vibrate?.(30); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        if (!confirmClear) {
            setConfirmClear(true);
            clearConfirmTimer();
            confirmTimerRef.current = setTimeout(() => { confirmTimerRef.current = null; setConfirmClear(false); }, 3000);
            return;
        }
        clearConfirmTimer();
        setConfirmClear(false);
        onClearSession?.();
    }, [confirmClear, clearConfirmTimer, onClearSession]);

    // Filters + paging keep a 200-hand journal from rendering 200 shadowed rows
    // on a mid-range phone (and turn the dump into a study tool).
    const [filter, setFilter] = useState('all');
    const [limit, setLimit] = useState(24);
    useEffect(() => { if (isOpen) { setLimit(24); setFilter('all'); } }, [isOpen]);

    const ordered = useMemo(() => {
        const list = Array.isArray(sessionLog) ? [...sessionLog].reverse() : [];
        if (filter === 'correct') return list.filter(e => e.isCorrect === true);
        if (filter === 'incorrect') return list.filter(e => e.isCorrect === false);
        if (filter === 'preflop' || filter === 'flop' || filter === 'turn' || filter === 'river') {
            return list.filter(e => String(e.street || '').toLowerCase() === filter);
        }
        return list;
    }, [sessionLog, filter]);

    const visible = useMemo(() => ordered.slice(0, limit), [ordered, limit]);
    const ACTION_COLORS = SESSION_ACTION_COLORS;

    const FILTERS = [
        ['all', 'All'], ['correct', 'Correct'], ['incorrect', 'Missed'],
        ['flop', 'Flop'], ['turn', 'Turn'], ['river', 'River'],
    ];

    return (
        <BottomSheet
            isOpen={isOpen} onClose={onClose}
            title="Session log"
            subtitle={`${sessionLog?.length || 0} hands`}
            labelledBy="pa-session-log-title"
            headerRight={(sessionLog?.length > 0) ? (
                <button type="button" className="pa-btn" onClick={handleClearClick}
                    style={{ ...btn('danger'), padding: '0 12px', fontSize: F.caption }}>
                    {confirmClear ? 'Confirm?' : 'Clear'}
                </button>
            ) : null}
        >
            <div style={{ display: 'flex', gap: S.sm, overflowX: 'auto', paddingBottom: S.sm, marginBottom: S.md, WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' }}>
                {FILTERS.map(([id, label]) => (
                    <button key={id} type="button" className="pa-btn" onClick={() => { setFilter(id); setLimit(24); }} aria-pressed={filter === id}
                        style={{ ...btn(filter === id ? 'primary' : 'secondary'), borderRadius: R.pill, padding: '0 14px', fontSize: F.caption, flexShrink: 0, scrollSnapAlign: 'start' }}>
                        {label}
                    </button>
                ))}
            </div>

            {!sessionLog?.length ? (
                <EmptyState
                    icon={<Inbox size={24} strokeWidth={2} aria-hidden="true" />}
                    title="No hands yet"
                    body="Run an analysis and every hand you study lands here — filterable and replayable."
                />
            ) : ordered.length === 0 ? (
                <EmptyState
                    icon={<Filter size={24} strokeWidth={2} aria-hidden="true" />}
                    title="Nothing matches"
                    body="No hands match this filter yet."
                    action={<button type="button" className="pa-btn" onClick={() => setFilter('all')} style={btn('secondary')}>Show all</button>}
                />
            ) : (
                <>
                    {visible.map((entry, i) => {
                        const actionKey = (entry.optimalAction || '').toLowerCase().split(' ')[0];
                        const badgeColor = ACTION_COLORS[actionKey] || T.accent;
                        return (
                            <button key={entry.id || i} type="button" className="pa-btn"
                                onClick={() => { try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onLoadEntry(entry); onClose(); }}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: S.md, padding: S.md,
                                    marginBottom: S.sm, borderRadius: R.sm, minHeight: 60,
                                    background: T.surface2, border: `1px solid ${T.borderHi}`, cursor: 'pointer',
                                    textAlign: 'left', touchAction: 'manipulation',
                                }}>
                                <span style={{
                                    width: 40, height: 40, borderRadius: R.sm, background: `${badgeColor}22`, border: `1px solid ${badgeColor}44`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: F.caption, fontWeight: 700,
                                    color: badgeColor, flexShrink: 0,
                                }}>
                                    {(entry.optimalAction || '—').substring(0, 4)}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: F.bodySm, fontWeight: 700, color: T.text }}>{entry.hand} — {entry.position}</span>
                                    <span style={{ display: 'block', fontSize: F.caption, color: T.textMuted, marginTop: 2, ...NUM }}>
                                        {entry.street} · {entry.board || 'Preflop'}{entry.equity != null ? ` · ${Math.round(entry.equity)}% eq` : ''}
                                    </span>
                                </span>
                                {entry.isCorrect === true && <Check size={18} strokeWidth={3} style={{ color: T.success, flexShrink: 0 }} aria-label="Correct" />}
                                {entry.isCorrect === false && <XIcon size={18} strokeWidth={3} style={{ color: T.danger, flexShrink: 0 }} aria-label="Missed" />}
                                <ChevronRight size={18} strokeWidth={2} style={{ color: T.textDim, flexShrink: 0 }} aria-hidden="true" />
                            </button>
                        );
                    })}
                    {ordered.length > visible.length && (
                        <button type="button" className="pa-btn" onClick={() => setLimit(l => l + 24)}
                            style={{ ...btn('secondary', { block: true }), marginTop: S.sm }}>
                            Load 24 more ({ordered.length - visible.length} left)
                        </button>
                    )}
                </>
            )}
        </BottomSheet>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COACH ACTION PICKER — Wave 2 Feature 6 (Socratic Coach)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * The single most-used interaction in the trainer. It is a bottom sheet with a
 * full scenario header (hand, board, pot, position, villain, pot odds / MDF) —
 * the old centered dialog covered the table and asked the user to decide from
 * memory, with no dismiss path other than "Skip".
 */
export function CoachActionPicker({
    isOpen, onPick, onSkip,
    heroHand, board, potSize, heroPosition, villain, handState, street, newCard,
}) {
    const ACTIONS = [
        { id: 'fold', label: 'Fold', tone: 'danger' },
        { id: 'check', label: 'Check', tone: 'secondary' },
        { id: 'call', label: 'Call', tone: 'secondary' },
        { id: 'bet_33', label: 'Bet 33%', tone: 'success' },
        { id: 'bet_66', label: 'Bet 66%', tone: 'success' },
        { id: 'bet_100', label: 'Bet Pot', tone: 'success' },
        { id: 'raise', label: 'Raise', tone: 'secondary' },
        { id: 'allin', label: 'All-In', tone: 'secondary' },
    ];
    const legal = handState ? legalActionsFor(handState, 'hero') : null;
    const ordered = legal
        ? [...ACTIONS].sort((a, b) => (legal.includes(b.id) ? 1 : 0) - (legal.includes(a.id) ? 1 : 0))
        : ACTIONS;

    const boardCards = Array.isArray(board)
        ? board.filter(Boolean)
        : [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
    const handCards = [heroHand?.card1, heroHand?.card2].filter(Boolean);

    return (
        <BottomSheet
            isOpen={isOpen} onClose={onSkip}
            title="What would you do?"
            subtitle={`Coach mode · ${street || 'this spot'}`}
            labelledBy="pa-coach-title"
            footer={(
                <button type="button" className="pa-btn" onClick={onSkip} style={btn('ghost', { block: true })}>
                    Skip — just show the answer
                </button>
            )}
        >
            <div style={{ ...cardCompact, background: T.surface2, marginBottom: S.lg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.sm, flexWrap: 'wrap' }}>
                    <Brain size={18} strokeWidth={2} style={{ color: T.accent, flexShrink: 0 }} aria-hidden="true" />
                    <span style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text }}>
                        {handCards.length ? handCards.join(' ') : 'No hand set'}
                    </span>
                    <span style={{ ...pill('accent') }}>{heroPosition || 'Hero'}</span>
                    {villain?.archetype?.name && <span style={{ ...pill('warn') }}>vs {villain.archetype.name}</span>}
                </div>
                <div style={{ fontSize: F.bodySm, color: T.textMuted, lineHeight: 1.45 }}>
                    Board: <strong style={{ color: T.text }}>{boardCards.length ? boardCards.join(' ') : 'Preflop'}</strong>
                    {newCard && <span style={{ color: T.success, fontWeight: 700 }}> (+{newCard})</span>}
                </div>
                <div style={{ display: 'flex', gap: S.sm, marginTop: S.sm, flexWrap: 'wrap' }}>
                    <span style={{ ...pill('neutral'), ...NUM }}>Pot {(Number(potSize) || 0).toFixed(1)} BB</span>
                    {handState?.facingBet && <span style={{ ...pill('warn'), ...NUM }}>To call {handState.toCall} BB</span>}
                    {handState?.potOdds != null && <span style={{ ...pill('neutral'), ...NUM }}>Pot odds {handState.potOdds}%</span>}
                    {handState?.mdf != null && <span style={{ ...pill('neutral'), ...NUM }}>MDF {handState.mdf}%</span>}
                    {handState?.spr != null && <span style={{ ...pill('accent'), ...NUM }}>SPR {handState.spr}</span>}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: S.sm }}>
                {ordered.map(a => {
                    const isLegal = !legal || legal.includes(a.id);
                    return (
                        <button key={a.id} type="button" className="pa-btn"
                            disabled={!isLegal}
                            aria-label={isLegal ? a.label : `${a.label} — not legal in this spot`}
                            onClick={() => { try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onPick(a.label); }}
                            style={{ ...btn(a.tone === 'danger' ? 'danger' : a.tone === 'success' ? 'success' : 'secondary', { disabled: !isLegal, block: true }), minHeight: 52, fontSize: F.body }}>
                            {a.label}
                        </button>
                    );
                })}
            </div>
        </BottomSheet>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COACH VERDICT — Shows user pick vs GTO verdict
// ═══════════════════════════════════════════════════════════════════════════
export function CoachVerdict({ userPick, gtoAction, evDelta, evDeltaEstimated = false }) {
    const reduce = usePrefersReducedMotion();
    if (!userPick || !gtoAction) return null;
    const isCorrect = gradeAction(userPick, gtoAction);
    // The analyze API does not emit a per-action EV for every action, and the
    // Grok fallback path returns ev.hero = 0. Rather than print "+0.00 EV" for a
    // wrong answer we say the number is unavailable.
    const showNumber = !evDeltaEstimated && evDelta != null && Number.isFinite(Number(evDelta));
    return (
        <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : undefined}
            style={{
                padding: S.lg, borderRadius: R.md, marginBottom: S.md,
                background: isCorrect ? T.successSoft : T.dangerSoft,
                border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
            }}
            role="status"
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.xs }}>
                {isCorrect
                    ? <Check size={20} strokeWidth={3} style={{ color: T.success, flexShrink: 0 }} aria-hidden="true" />
                    : <XIcon size={20} strokeWidth={3} style={{ color: T.danger, flexShrink: 0 }} aria-hidden="true" />}
                <span style={{ fontSize: F.h3, fontWeight: 800, color: isCorrect ? T.success : T.danger }}>
                    {isCorrect ? 'Correct' : 'Not optimal'}
                </span>
                {showNumber && (
                    <span style={{ marginLeft: 'auto', ...pill(evDelta >= 0 ? 'success' : 'danger'), ...NUM }}>
                        {evDelta >= 0 ? '+' : ''}{Number(evDelta).toFixed(2)} EV
                    </span>
                )}
            </div>
            <div style={{ fontSize: F.bodySm, color: T.textMuted, lineHeight: 1.45 }}>
                You: <strong style={{ color: T.text }}>{userPick}</strong> vs GTO: <strong style={{ color: T.accent }}>{gtoAction}</strong>
            </div>
            {!showNumber && (
                <div style={{ fontSize: F.caption, color: T.textDim, marginTop: S.xs, lineHeight: 1.45 }}>
                    EV impact unavailable for this solve.
                </div>
            )}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION REPLAY BAR — Wave 2 Feature 8
// Tappable history scrubber with playhead indicator and haptics
// ═══════════════════════════════════════════════════════════════════════════
export function ActionReplayBar({ actions, replayIndex, onReplayTo, onExitReplay }) {
    if (!actions || actions.length === 0) return null;
    const COLORS = { fold: T.danger, check: T.textMuted, call: T.warn, bet: T.success, raise: T.success, allin: '#F97316' };
    const bubbleColor = (action) => COLORS[String(action || '').toLowerCase().split('_')[0]] || T.accent;
    const replaying = replayIndex != null;

    return (
        <div style={{ ...card, padding: S.md, marginBottom: S.md }}>
            <div style={sectionHeader}>
                <p style={{ ...sectionTitle, color: replaying ? T.accent : T.textDim, margin: 0 }}>
                    {replaying ? 'Replay mode' : 'Action history'}
                </p>
                {replaying && (
                    <button
                        type="button" className="pa-btn"
                        onClick={() => { try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onExitReplay(); }}
                        style={{ ...btn('danger'), minHeight: 44, padding: '0 14px', fontSize: F.caption }}
                    >
                        Exit replay
                    </button>
                )}
            </div>

            {/* Horizontal scroll-snap strip — 44px bubbles, never a wrapped grid
                of 34px targets crammed into a side rail. */}
            <div style={{
                display: 'flex', gap: S.sm, overflowX: 'auto', paddingBottom: S.sm,
                scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
            }}>
                {actions.map((a, i) => {
                    const colour = bubbleColor(a.action);
                    const isActive = replayIndex === i;
                    const isPast = replaying && i <= replayIndex;
                    return (
                        <button
                            key={i} type="button" className="pa-btn"
                            aria-pressed={isActive}
                            aria-label={`${isActive ? 'Leave replay at' : 'Replay to'} ${a.position} ${a.label}`}
                            onClick={() => { try { navigator.vibrate?.(isActive ? 30 : 10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onReplayTo(isActive ? null : i); }}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                gap: 1, minHeight: 44, minWidth: 68, padding: `0 ${S.md}px`, borderRadius: R.sm,
                                flexShrink: 0, scrollSnapAlign: 'start', cursor: 'pointer',
                                background: isActive ? `${colour}30` : isPast ? `${colour}15` : T.surface2,
                                border: `1px solid ${isActive ? colour : isPast ? `${colour}55` : T.borderHi}`,
                                color: isActive || isPast ? colour : T.textMuted,
                                touchAction: 'manipulation',
                            }}
                        >
                            <span style={{ fontSize: F.caption, color: isPast ? T.accent : T.textDim, fontWeight: 700 }}>{a.position}</span>
                            <span style={{ fontSize: F.caption, fontWeight: 700 }}>{a.label}</span>
                        </button>
                    );
                })}
            </div>

            {replaying && (
                <p style={{ marginTop: S.sm, fontSize: F.caption, color: T.accent, textAlign: 'center', margin: `${S.sm}px 0 0` }}>
                    Rewound to <strong>{actions[replayIndex]?.position} {actions[replayIndex]?.label}</strong>
                </p>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARE HAND MODAL — Wave 2 Feature 7
// Download PNG + Post to Smarter.Poker profile + Native share sheet
// ═══════════════════════════════════════════════════════════════════════════
// `cardRef` is still accepted for call-site compatibility but is no longer
// read: the card is drawn onto a canvas rather than screenshotted from the DOM.
export function ShareHandModal({ isOpen, onClose, results, scenario, heroHand, board }) {
    const [isPosting, setIsPosting] = useState(false);
    const [capturedUrl, setCapturedUrl] = useState(null);
    const closeTimerRef = useRef(null);

    useEffect(() => () => {
        if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, []);
    useEffect(() => {
        if (!isOpen && closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    }, [isOpen]);

    if (!isOpen || !results) return null;

    const shareBoardStr = (() => {
        const fullBoard = [...(board?.flop || []), board?.turn, board?.river].filter(Boolean);
        return fullBoard.length ? fullBoard.join(' ') : 'Preflop';
    })();

    /**
     * Render the branded card natively. This used to `await import('html2canvas')`
     * — a package that is NOT a dependency of this project — so the import always
     * rejected, `handleDownload` always ended at "Could not render image", and
     * every profile post went out without an image. It now uses the same
     * canvas renderer ExportCard/SessionReport use.
     */
    const buildCanvas = async () => {
        try {
            const { drawAnalysisCard } = await import('./ExportCard');
            return drawAnalysisCard(results, {
                position: scenario?.position,
                hand: heroHand?.card1 ? `${heroHand.card1}${heroHand.card2 || ''}` : (scenario?.hand || '??'),
                board: shareBoardStr,
            });
        } catch (e) {
            console.warn('[ShareHandModal] Card render failed:', e?.message || e);
            return null;
        }
    };

    /** Data URL used for the feed-post upload (not for the user download path). */
    const captureCanvas = async () => {
        try {
            const canvas = await buildCanvas();
            if (!canvas) return null;
            const url = canvas.toDataURL('image/png');
            setCapturedUrl(url);
            return url;
        } catch (e) {
            console.warn('[ShareHandModal] Canvas capture failed:', e?.message || e);
            return null;
        }
    };

    // Best-effort upload of the captured PNG so the feed post can render the
    // hand visually. Storage bucket may not exist on every env — never block
    // the post on a failure here.
    const uploadCapture = async (dataUrl) => {
        if (!dataUrl || typeof fetch === 'undefined') return null;
        try {
            const blob = await (await fetch(dataUrl)).blob();
            if (!blob || blob.size > 4 * 1024 * 1024) return null;
            const path = `sandbox/hand-${Date.now()}.png`;
            const { error } = await supabase.storage.from('social-media').upload(path, blob, {
                contentType: 'image/png', upsert: true,
            });
            if (error) { console.warn('[ShareHandModal] Image upload skipped:', error.message || error); return null; }
            const { data } = supabase.storage.from('social-media').getPublicUrl(path);
            return data?.publicUrl || null;
        } catch (e) {
            console.warn('[ShareHandModal] Image upload skipped:', e?.message || e);
            return null;
        }
    };

    const handleDownload = async () => {
        try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        try {
            const canvas = await buildCanvas();
            if (!canvas) { toast.error('Could not render image'); return; }
            // `<a download>` on a data: URL is a silent no-op on iOS Safari —
            // exportCanvas routes through the share sheet / a blob URL instead.
            const { exportCanvas } = await import('../../lib/sandbox/exportCanvas');
            const result = await exportCanvas(canvas, `smarter-poker-hand-${Date.now()}.png`, {
                title: 'GTO Hand Analysis',
                text: `${heroHand?.card1 || '??'}${heroHand?.card2 || ''} — ${results.optimalAction?.label || 'analysis'}`,
            });
            if (result?.hint) toast.success(result.hint);
        } catch (e) {
            console.warn('[ShareHandModal] Download failed:', e?.message || e);
            toast.error('Could not render image');
        }
    };

    const handlePostToProfile = async () => {
        try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        setIsPosting(true);
        try {
            const user = getAuthUser();
            if (!user) { toast.error('Log in to post'); setIsPosting(false); return; }
            // Fetch session token for auth header — the server derives identity
            // from this JWT. We deliberately do NOT send a client user_id.
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) { toast.error('Session expired. Please log in again.'); setIsPosting(false); return; }
            const hand = heroHand?.card1 ? `${heroHand.card1}${heroHand.card2 || ''}` : '??';
            const boardStr = shareBoardStr;
            const content = `Just analyzed a hand in the GTO Sandbox!\n\n**Hand:** ${hand} — ${scenario?.position || 'BTN'}\n**Board:** ${boardStr}\n**GTO Line:** ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n\nTry this hand at smarter.poker/hub/personal-assistant/sandbox`;

            // Attach the rendered hand image when we can produce/host one
            const imageUrl = await uploadCapture(capturedUrl || await captureCanvas());

            const res = await fetch('/api/sandbox/social-export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    content,
                    metadata: {
                        hand,
                        board: boardStr,
                        position: scenario?.position,
                        optimalAction: results.optimalAction?.label,
                        challengeEnabled: true,
                        ...(imageUrl ? { imageUrl } : {}),
                        source: 'Sandbox',
                    },
                }),
            });
            if (res.ok) {
                // Dispatch bus listener event so social feed pages refresh
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('social-post-created', { detail: { type: 'sandbox_hand' } }));
                }
                toast.success('Posted to your feed!');
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; onClose?.(); }, 1200);
            } else {
                const errBody = await res.json().catch(() => ({}));
                console.warn('[ShareHandModal] Post failed:', res.status, errBody);
                toast.error('Failed to post');
            }
        } catch (err) {
            console.warn('[ShareHandModal] Post error:', err);
            toast.error('Failed to post');
        }
        setIsPosting(false);
    };


    const handleNativeShare = async () => {
        try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        const shareUrl = `${window.location.origin}/hub/personal-assistant/sandbox`;
        const text = `I analyzed ${heroHand?.card1 || '??'}${heroHand?.card2 || '??'} on the GTO Sandbox — GTO line: ${results.optimalAction?.label}`;
        try {
            if (navigator.share) { await navigator.share({ title: 'GTO Hand Analysis — Smarter.Poker', text, url: shareUrl }); }
            else { navigator.clipboard?.writeText(`${text}\n${shareUrl}`); }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    };

    const actions = [
        { Icon: Camera, label: 'Download Image', sub: 'Save PNG to device', onClick: handleDownload, color: '#4599FF' },
        { Icon: Spade, label: isPosting ? 'Posting...' : 'Post to My Profile', sub: 'Share to your Smarter.Poker feed', onClick: handlePostToProfile, color: '#22c55e', primary: true },
        { Icon: Share2, label: 'Share Link', sub: 'Copy link or open share sheet', onClick: handleNativeShare, color: '#a78bfa' },
    ];

    return (
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Share hand" subtitle="Image, feed post or a link" labelledBy="pa-share-hand-title">
            <div style={{ ...cardCompact, background: T.surface2, marginBottom: S.lg }}>
                <div style={{ fontSize: F.bodySm, fontWeight: 700, color: T.text }}>
                    {heroHand?.card1 || '??'}{heroHand?.card2 || '??'} — {scenario?.position || 'BTN'}
                </div>
                <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: S.xs, ...NUM }}>
                    GTO: <span style={{ color: T.success, fontWeight: 700 }}>{results.optimalAction?.label}</span> ({results.optimalAction?.frequency}%)
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
                {actions.map(a => (
                    <button
                        key={a.label} type="button" className="pa-btn"
                        onClick={a.onClick}
                        disabled={isPosting && a.primary}
                        style={{
                            display: 'flex', alignItems: 'center', gap: S.md, width: '100%',
                            minHeight: 60, padding: S.md, borderRadius: R.sm, textAlign: 'left',
                            cursor: isPosting && a.primary ? 'wait' : 'pointer',
                            background: a.primary ? `${a.color}18` : T.surface2,
                            border: `1px solid ${a.primary ? `${a.color}55` : T.borderHi}`,
                            opacity: isPosting && a.primary ? 0.7 : 1,
                            touchAction: 'manipulation',
                        }}
                    >
                        <span style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <a.Icon size={22} strokeWidth={2} style={{ color: a.color }} aria-hidden="true" />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: F.bodySm, fontWeight: 700, color: a.primary ? a.color : T.text }}>{a.label}</span>
                            <span style={{ display: 'block', fontSize: F.caption, color: T.textDim, marginTop: 2 }}>{a.sub}</span>
                        </span>
                        <ChevronRight size={18} strokeWidth={2} style={{ color: T.textDim, flexShrink: 0 }} aria-hidden="true" />
                    </button>
                ))}
            </div>
        </BottomSheet>
    );
}

// ── Wave 3: VillainReadCard (W3-5) ──────────────────────────────────────────
const ARCHETYPE_EXPLOITS = {
    nit: ['Steal blinds freely vs this player', 'Fold to raises — they only 3-bet premiums', 'Bet big when they call — value bet relentlessly'],
    tag: ['Stay balanced — they notice unbalanced lines', 'Mix your frequencies vs TAG ranges', 'Respect their raises on scary boards'],
    lag: ['Tighten your calling range vs 3-bets', 'Let them barrel into you with top pair+', 'Float light pre-flop only in position'],
    calling_station: ['Bet very thin for value — they call anything', 'Remove bluffs entirely from your range', 'Overbet the river with strong value hands'],
    maniac: ['Let them hang themselves — trap with premiums', 'Call down lighter vs maniac — bluff ratio is high', 'Raise for value when they show aggression'],
    fish: ["Max bet strong hands — they won't notice odds", "Simplify your range — fancy plays won't work", "Don't slow play big hands — they can't fold"],
    gto_neutral: ['Play balanced GTO frequencies', 'Mixed strategies are optimal here', 'No single exploit — adapt post-flop to tendencies'],
};

export function VillainReadCard({ villain }) {
    const [open, setOpen] = useState(true);
    if (!villain?.archetype?.id) return null;
    const archetypeId = villain.archetype.id;
    const tips = ARCHETYPE_EXPLOITS[archetypeId] || ARCHETYPE_EXPLOITS.gto_neutral;
    // VPIP is unknown until the user picks an archetype/position — do not paint
    // "unknown" green as if it were a confirmed nit.
    const vpipValue = villain.vpip != null && Number.isFinite(Number(villain.vpip)) ? Number(villain.vpip) : null;
    const color = vpipValue == null ? '#B0B3B8' : vpipValue > 40 ? '#f97316' : vpipValue > 25 ? '#fbbf24' : '#4ade80';

    return (
        <div style={{ margin: '12px 0', borderRadius: 10, border: '1px solid rgba(167,139,250,0.25)', background: 'rgba(139,92,246,0.06)', overflow: 'hidden' }}>
            <button onClick={() => { setOpen(o => !o); try { navigator.vibrate?.(8); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } }}
                className="pa-btn" type="button" aria-expanded={open}
                style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: S.sm, padding: `0 ${S.md}px`, background: 'none', border: 'none', cursor: 'pointer', color: T.purple, fontSize: F.label, fontWeight: 700, textAlign: 'left' }}>
                <Spade size={14} strokeWidth={2} style={{ color: '#a78bfa', flexShrink: 0 }} aria-hidden="true" />
                Villain Intel — {villain.archetype.name || archetypeId}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', color: T.textDim }} aria-hidden="true">
                    {open ? <ChevronUp size={18} strokeWidth={2} /> : <ChevronDown size={18} strokeWidth={2} />}
                </span>
            </button>
            {open && (
                <div style={{ padding: '0 14px 12px' }}>
                    {vpipValue != null && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: F.caption, color: T.textMuted, fontWeight: 700 }}>VPIP</span>
                            <span style={{ fontSize: F.bodySm, fontWeight: 800, color, ...NUM }}>{vpipValue}%</span>
                        </div>
                    )}
                    <ul style={{ margin: 0, padding: '0 0 0 18px', listStyle: 'disc', color: T.textMuted, fontSize: F.bodySm, lineHeight: 1.6 }}>
                        {tips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ── Wave 3: ShortcutLegend (W3-6) ──────────────────────────────────────────
export function ShortcutLegend({ isOpen, onClose }) {
    const shortcuts = [
        ['A', 'Analyze hand'],
        ['R', 'Reset (tap twice)'],
        ['U', 'Undo last change'],
        ['S', 'Save bookmark'],
        ['C', 'Toggle Coach Mode'],
        ['Esc', 'Close the results sheet'],
        ['?', 'Toggle this legend'],
    ];
    return (
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts" subtitle="Desktop power mode" labelledBy="pa-shortcuts-title">
            {shortcuts.map(([key, label]) => (
                <div key={key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: S.md, minHeight: 44, borderBottom: `1px solid ${T.border}`,
                }}>
                    <span style={{ fontSize: F.bodySm, color: T.textMuted }}>{label}</span>
                    <kbd style={{
                        fontSize: F.caption, fontWeight: 700, color: T.text, background: T.surface2,
                        border: `1px solid ${T.borderHi}`, borderRadius: R.sm, padding: '4px 10px', fontFamily: 'monospace',
                    }}>{key}</kbd>
                </div>
            ))}
        </BottomSheet>
    );
}
