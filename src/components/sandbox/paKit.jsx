/**
 * paKit · shared UI primitives for the Personal Assistant sandbox surfaces.
 * ═══════════════════════════════════════════════════════════════════════════
 * Everything here implements PA_DESIGN_SPEC v2 so the 20+ sandbox feature
 * components stop hand-rolling their own modals, skeletons and empty states.
 *
 * Exports:
 *   <PAStyles/>        global :active / :focus-visible / skeleton / reduced-motion CSS
 *   <BottomSheet/>     THE modal pattern (grip, 44px close, backdrop tap, Esc,
 *                      body-scroll lock, drag-to-dismiss, dvh cap, safe areas)
 *   <Skeleton/> <SkeletonCard/>  loading placeholders that mirror real layout
 *   <EmptyState/> <ErrorState/> <SignInState/>  the three non-content states
 *   <Segmented/>       44px-tall segmented control (chips that are real buttons)
 *   safeStorage        localStorage that cannot throw (Safari private mode)
 *   hashString         deterministic 32-bit string hash (stable "random" picks)
 *   useThrottledRefresh  one visibility-driven refetch, deduped to 60s
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, RefreshCw, LogIn, Inbox } from 'lucide-react';
import {
    T, F, S, R, Z, FONT, btn, iconBtn,
    sheetBackdrop, sheet as sheetStyle, sheetGrip, sheetHeader, sheetBody, sheetFooter,
    emptyWrap, emptyIcon, emptyTitle, emptyBody,
    errorWrap, errorTitle, errorBody,
    usePrefersReducedMotion,
} from './paTokens';

export { usePrefersReducedMotion };

/* ═══════════════════════════════════════════════════════════════════════
   safeStorage · localStorage throws in Safari private mode / iframes.
   ═══════════════════════════════════════════════════════════════════════ */
export const safeStorage = {
    get(key, fallback = null) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return fallback;
            const v = window.localStorage.getItem(key);
            return v == null ? fallback : v;
        } catch (e) {
            console.warn('[safeStorage] read blocked:', e?.message || e);
            return fallback;
        }
    },
    set(key, value) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return false;
            window.localStorage.setItem(key, String(value));
            return true;
        } catch (e) {
            console.warn('[safeStorage] write blocked:', e?.message || e);
            return false;
        }
    },
    remove(key) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return false;
            window.localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('[safeStorage] remove blocked:', e?.message || e);
            return false;
        }
    },
};

/** Deterministic 32-bit hash · lets "pick one of N" stay stable for a spot. */
export function hashString(str) {
    let h = 2166136261;
    const s = String(str ?? '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
}

/* ═══════════════════════════════════════════════════════════════════════
   Global CSS shared by every PA surface.

   Raw <style> injection, NOT styled-jsx. A large global styled-jsx block on
   this surface deadlocked the SWC compiler for 45 minutes and broke production
   deploys (maintainer fix 17409efc08). Never reintroduce styled-jsx here.

   The CSS is emitted verbatim and unscoped, exactly as `<style jsx global>`
   emitted it · but not in the same PLACE. styled-jsx hoists global styles into
   <head>; this tag renders inline in the body, wherever the host component
   mounts. These rules therefore sit later in the cascade than every <head>
   stylesheet, so at equal specificity they now win ties they previously lost.
   That is what we want for the PA-specific classes below; if a rule ever needs
   to lose such a tie, give the competing rule an explicit specificity bump
   rather than relying on document order.

   Rendered once per host component. Unlike styled-jsx this does NOT dedupe, so
   N mounted hosts emit N identical <style> tags; the rules are byte-identical
   and idempotent, so the cascade result is unchanged.

   The ${...} holes are build-time constants from paTokens (never user input),
   so nothing untrusted reaches the injected CSS.
   ═══════════════════════════════════════════════════════════════════════ */
export function PAStyles() {
    return (
        <style dangerouslySetInnerHTML={{ __html: `
            html {
                scroll-padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
            }
            .pa-btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; position: relative; }
            .pa-btn:active:not(:disabled) { filter: brightness(1.08); }
            .pa-btn:focus-visible { outline: 2px solid #83DEFF; outline-offset: 2px; }
            .pa-seg-btn[aria-pressed="true"]::after,
            .pa-seg-btn[aria-selected="true"]::after {
                content: '';
                position: absolute;
                inset: auto 8px 0;
                border-block-end: 3px solid #83DEFF;
                pointer-events: none;
            }
            .pa-disclosure {
                border: 1px solid ${T.border};
                border-top-color: ${T.borderHi};
                border-radius: ${R.md}px;
                background: linear-gradient(145deg, #091727, #030B14 74%);
                overflow: clip;
            }
            .pa-disclosure > summary {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                min-height: 44px;
                padding: 10px 14px;
                cursor: pointer;
                color: #DCE5EF;
                font: 700 13px/1.2 'Arial Narrow', Arial, sans-serif;
                list-style: none;
                user-select: none;
            }
            .pa-disclosure > summary::-webkit-details-marker { color: transparent; width: 0; }
            .pa-disclosure > summary:focus-visible { outline: 2px solid #83DEFF; outline-offset: -2px; }
            .pa-disclosure[open] > summary {
                border-bottom: 1px solid #253E57;
                color: #F1F5FC;
            }
            .pa-disclosure-body {
                padding: 12px 14px;
            }
            .pa-sheet-backdrop { padding-top: max(12px, env(safe-area-inset-top, 0px)); }
            .pa-sheet {
                isolation: isolate;
                position: relative;
                color: ${T.text};
                border-radius: ${R.sheet} !important;
                text-transform: capitalize;
            }
            .pa-sheet :is(input, textarea)::placeholder { text-transform: capitalize; }
            .pa-sheet-telemetry {
                display: flex; align-items: center; justify-content: space-between; gap: 12px;
                padding: 2px 16px 8px; color: #83DEFF;
                font: 600 12px/1.3 'IBM Plex Mono', monospace; letter-spacing: .08em;
                text-transform: uppercase; white-space: nowrap;
            }
            .pa-sheet-telemetry span:last-child { color: ${T.textDim}; letter-spacing: .08em; }
            .pa-sheet-header { background: linear-gradient(180deg, #13253A, #07111C); }
            .pa-sheet-title {
                font-family: 'Arial Narrow','Rajdhani',Arial,sans-serif;
                font-size: clamp(19px, 4vw, 23px) !important;
                letter-spacing: 0;
            }
            .pa-sheet-scroll { scrollbar-color: ${T.borderHi} transparent; scrollbar-width: thin; }
            .pa-sheet-scroll :is(input, select, textarea) {
                border-radius: 6px !important;
                border-color: ${T.border} !important;
                background-color: #07111C !important;
                color: ${T.text} !important;
            }
            .pa-sheet-scroll :is(input, select, textarea):focus-visible {
                outline: 2px solid #83DEFF; outline-offset: 1px;
            }
            .pa-chart-panel {
                position: relative; overflow: hidden;
                border: 1px solid ${T.border} !important;
                border-top-color: ${T.borderHi} !important;
                border-radius: ${R.md}px !important;
                background: linear-gradient(145deg, #091727, #030B14 74%) !important;
                box-shadow: none !important;
            }
            .pa-range-grid {
                min-width: 0; width: 100%; max-width: 100%;
                box-shadow: 0 0 0 1px ${T.border};
            }
            .pa-range-grid-scroll {
                width: 100%; max-width: 100%; overflow-x: auto; overflow-y: hidden;
                padding: 1px; scroll-behavior: smooth; overscroll-behavior-inline: contain;
                -webkit-overflow-scrolling: touch;
            }
            .pa-range-grid > :is(button, [role="button"]) {
                min-width: 0; font-family: 'IBM Plex Mono', monospace !important;
                font-size: clamp(12px, 2.5vw, 13px) !important;
            }
            .pa-data-label {
                font-family: 'IBM Plex Mono', monospace !important;
                letter-spacing: .06em !important; text-transform: uppercase;
            }
            .pa-row:active { background: ${T.surface2}; }
            .pa-skel { opacity: .55; }
            @media (prefers-reduced-motion: no-preference) {
                .pa-skel { animation: paSkel 1.4s ease-in-out infinite; }
                .pa-spin { animation: paSpin 1s linear infinite; }
                .pa-btn:active:not(:disabled) { transform: scale(0.98); }
            }
            @keyframes paSkel { 0%, 100% { opacity: .35 } 50% { opacity: .7 } }
            @keyframes paSpin { to { transform: rotate(360deg) } }
            .pa-sheet-scroll { -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
            .pa-vh {
                position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
            }
            @media (min-width: 769px) {
                .pa-sheet-backdrop { align-items: center; }
                .pa-sheet { border-radius: ${R.lg}px !important; max-height: 88dvh; border-bottom: 1px solid ${T.border} !important; }
                .pa-sheet-telemetry { padding-inline: 24px; }
            }
            @media (max-width: 768px) {
                .pa-sheet { max-height: 92dvh !important; }
                .pa-sheet-telemetry { overflow: hidden; }
                .pa-sheet-telemetry span:last-child { overflow: hidden; text-overflow: ellipsis; }
                .pa-chart-panel { padding: 12px !important; }
                .pa-range-grid-scroll .pa-range-grid {
                    width: 586px !important; min-width: 586px !important; max-width: none !important;
                }
                .pa-range-grid > :is(button, [role="button"]) {
                    min-width: 44px !important; min-height: 44px !important;
                }
            }
            @media (prefers-reduced-motion: reduce) {
                .pa-range-grid-scroll { scroll-behavior: auto; }
            }
        ` }} />
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   BottomSheet · the ONLY modal pattern.
   ═══════════════════════════════════════════════════════════════════════ */
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Stack of currently-open sheets, outermost first.
 *
 * Escape must close exactly ONE sheet · the topmost. A capture-phase listener
 * on `document` calling `stopPropagation()` does NOT stop sibling listeners
 * bound to the same node, so with a sheet open inside another sheet both
 * instances handled the same keypress and the page's own global window
 * shortcut handler ran as well.
 */
const openSheets = [];
let savedBodyOverflow = '';

export function BottomSheet({
    open = true,
    onClose,
    title,
    subtitle,
    titleIcon = null,
    headerRight = null,
    children,
    footer = null,
    maxWidth = 680,
    ariaLabel,
    /** When false the backdrop tap and drag do NOT close (Esc + ✕ still do). */
    dismissOnBackdrop = true,
    /** Fully hides the close button · only ever for blocking flows. Avoid. */
    hideClose = false,
    closeLabel = 'Close',
    bodyStyle = null,
    sheetStyleOverride = null,
    /** Rendered between the header and the scrolling body (sticky sub-header). */
    stickyTop = null,
}) {
    const reduce = usePrefersReducedMotion();
    const [mounted, setMounted] = useState(false);
    const sheetRef = useRef(null);
    const previouslyFocused = useRef(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const closeSheet = useCallback(() => onCloseRef.current?.(), []);

    useEffect(() => { setMounted(true); }, []);

    // Body scroll lock + Escape + focus management
    useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined;
        previouslyFocused.current = document.activeElement;
        if (openSheets.length === 0) {
            savedBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }

        const token = {};
        openSheets.push(token);

        const onKey = (e) => {
            // Only the topmost sheet reacts · and it swallows the event outright
            // so no sibling sheet listener and no page-level shortcut sees it.
            if (openSheets[openSheets.length - 1] !== token) return;
            if (e.key === 'Escape') {
                if (hideClose) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                closeSheet();
                return;
            }
            if (e.key !== 'Tab' || !sheetRef.current) return;
            const nodes = Array.from(sheetRef.current.querySelectorAll(FOCUSABLE))
                .filter(n => n.offsetParent !== null || n === document.activeElement);
            if (nodes.length === 0) return;
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === sheetRef.current || !sheetRef.current.contains(active))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (active === last || !sheetRef.current.contains(active))) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey, true);

        const focusTimer = setTimeout(() => {
            const node = sheetRef.current;
            if (!node) return;
            const first = node.querySelector(FOCUSABLE);
            (first || node).focus?.({ preventScroll: true });
        }, 60);

        return () => {
            clearTimeout(focusTimer);
            const at = openSheets.indexOf(token);
            if (at >= 0) openSheets.splice(at, 1);
            document.removeEventListener('keydown', onKey, true);
            if (openSheets.length === 0) {
                document.body.style.overflow = savedBodyOverflow;
            }
            try { previouslyFocused.current?.focus?.({ preventScroll: true }); } catch (e) { /* node gone */ }
        };
    }, [open, closeSheet, hideClose]);

    const motionProps = reduce
        ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
        : {
            // Never mount an actionable sheet outside the viewport. Browsers
            // can throttle entrance animation frames in background tabs,
            // leaving a visible footer unreachable. Exit motion is safe.
            initial: false, animate: { y: 0 }, exit: { y: '100%' },
            transition: { type: 'spring', stiffness: 320, damping: 34 },
        };

    const dragProps = (reduce || !dismissOnBackdrop) ? {} : {
        drag: 'y',
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: { top: 0, bottom: 0.5 },
        onDragEnd: (_e, info) => {
            if (info.offset.y > 110 || info.velocity.y > 700) onClose?.();
        },
    };

    const content = (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="pa-backdrop"
                    className="pa-sheet-backdrop"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.18 }}
                    style={{ ...sheetBackdrop, fontFamily: FONT }}
                    onClick={(e) => { if (dismissOnBackdrop && e.target === e.currentTarget) onClose?.(); }}
                >
                    <motion.div
                        key="pa-sheet"
                        ref={sheetRef}
                        className="pa-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-label={ariaLabel || (typeof title === 'string' ? title : 'Dialog')}
                        tabIndex={-1}
                        {...motionProps}
                        {...dragProps}
                        onClick={(e) => e.stopPropagation()}
                        style={{ ...sheetStyle, maxWidth, ...(sheetStyleOverride || {}) }}
                    >
                        <div style={sheetGrip} aria-hidden="true" />

                        <div className="pa-sheet-header" style={sheetHeader}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: S.sm,
                                    fontSize: F.h3, fontWeight: 800, color: T.text, lineHeight: 1.2,
                                }}>
                                    {titleIcon}
                                    <span className="pa-sheet-title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {title}
                                    </span>
                                </div>
                                {subtitle && (
                                    <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: 3, lineHeight: 1.4 }}>
                                        {subtitle}
                                    </div>
                                )}
                            </div>
                            {headerRight}
                            {!hideClose && (
                                <button
                                    type="button"
                                    className="pa-btn"
                                    onClick={onClose}
                                    aria-label={closeLabel}
                                    style={iconBtn({ color: T.textMuted })}
                                >
                                    <X size={18} strokeWidth={2} />
                                </button>
                            )}
                        </div>

                        {stickyTop}

                        <div className="pa-sheet-scroll" style={{ ...sheetBody, ...(bodyStyle || {}) }}>
                            {children}
                        </div>

                        {footer && <div style={sheetFooter}>{footer}</div>}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    if (!mounted || typeof document === 'undefined') return null;
    // Rendered at the document root so no transformed / overflow:hidden
    // ancestor can clip or re-stack the sheet.
    return createPortal(content, document.body);
}

/* ═══════════════════════════════════════════════════════════════════════
   Loading / empty / error states
   ═══════════════════════════════════════════════════════════════════════ */
export function Skeleton({ h = 14, w = '100%', style = null }) {
    return <div className="pa-skel" style={{ height: h, width: w, borderRadius: R.sm, background: T.surface2, ...(style || {}) }} />;
}

/** A skeleton block that mirrors a stat-card row (never a bare spinner). */
export function SkeletonCard({ rows = 3, title = true }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }} aria-hidden="true">
            {title && <Skeleton h={16} w="45%" />}
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} h={i === 0 ? 44 : 32} w={i % 2 === 0 ? '100%' : '78%'} />
            ))}
        </div>
    );
}

export function EmptyState({ icon, title, body, action, compact = false }) {
    return (
        <div style={{ ...emptyWrap, padding: compact ? `${S.lg}px ${S.md}px` : `${S.xl}px ${S.lg}px` }}>
            <div style={emptyIcon}>{icon || <Inbox size={22} strokeWidth={2} />}</div>
            <h4 style={emptyTitle}>{title}</h4>
            {body && <p style={emptyBody}>{body}</p>}
            {action}
        </div>
    );
}

export function ErrorState({ title = 'Something went wrong', body, onRetry, retryLabel = 'Retry' }) {
    return (
        <div style={errorWrap} role="alert">
            <p style={errorTitle}>
                <AlertTriangle size={18} strokeWidth={2} />
                {title}
            </p>
            {body && <p style={errorBody}>{body}</p>}
            {onRetry && (
                <button type="button" className="pa-btn" onClick={onRetry} style={btn('secondary')}>
                    <RefreshCw size={18} strokeWidth={2} />
                    {retryLabel}
                </button>
            )}
        </div>
    );
}

export function SignInState({
    title = 'Sign in to continue',
    body = 'Your coach history is tied to your account.',
    href = '/auth/login',
    compact = false,
}) {
    return (
        <EmptyState
            compact={compact}
            icon={<LogIn size={22} strokeWidth={2} />}
            title={title}
            body={body}
            action={<a className="pa-btn" href={href} style={{ ...btn('primary'), textDecoration: 'none' }}>Sign In</a>}
        />
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   Segmented control · chips that respect the 44px / 8px touch rules.
   ═══════════════════════════════════════════════════════════════════════ */
export function Segmented({ options, value, onChange, label, tone = 'accent', columns = null, idPrefix = 'seg' }) {
    const activeBg = {
        accent: 'linear-gradient(180deg, #087CFA 0%, #0044AC 55%, #002B68 100%)',
        purple: 'linear-gradient(180deg, #5B42B8 0%, #322274 60%, #1F154A 100%)',
        success: 'linear-gradient(180deg, #16865A 0%, #0B4D33 60%, #073121 100%)',
        warn: 'linear-gradient(180deg, #A16A14 0%, #5F3D0A 60%, #3E2705 100%)',
    }[tone] || 'linear-gradient(180deg, #087CFA 0%, #0044AC 55%, #002B68 100%)';
    const activeBorder = {
        accent: '#56D8FF',
        purple: '#B9A7FF',
        success: '#4DE0A5',
        warn: '#FFC66D',
    }[tone] || '#56D8FF';

    return (
        <div role="group" aria-label={label}>
            {label && <div style={{ fontSize: F.label, fontWeight: 700, color: T.textMuted, marginBottom: S.sm }}>{label}</div>}
            <div style={{
                display: columns ? 'grid' : 'flex',
                gridTemplateColumns: columns ? `repeat(${columns}, minmax(0,1fr))` : undefined,
                flexWrap: columns ? undefined : 'wrap',
                gap: 6,
            }}>
                {options.map(optRaw => {
                    const opt = typeof optRaw === 'object' ? optRaw : { value: optRaw, label: String(optRaw) };
                    const on = opt.value === value;
                    return (
                        <button
                            key={`${idPrefix}-${opt.value}`}
                            type="button"
                            className="pa-btn pa-seg-btn"
                            aria-pressed={on}
                            onClick={() => onChange?.(opt.value)}
                            style={{
                                ...btn('secondary'),
                                padding: '6px 10px',
                                minHeight: 44,
                                flex: columns ? undefined : '1 1 auto',
                                background: on ? activeBg : 'linear-gradient(180deg, #152639 0%, #06111E 65%)',
                                color: on ? '#FFFFFF' : '#DCE5EF',
                                borderColor: on ? activeBorder : T.border,
                                borderTopColor: on ? '#B3EAFF' : T.borderHi,
                                fontSize: F.caption,
                            }}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   useThrottledRefresh · replaces the focus + visibilitychange double-fetch.
   Both events fire on the same mobile tab switch; this listens to one and
   dedupes anything inside `minIntervalMs`.
   ═══════════════════════════════════════════════════════════════════════ */
export function useThrottledRefresh(fn, { enabled = true, minIntervalMs = 60000, events = [] } = {}) {
    const fnRef = useRef(fn);
    const lastRef = useRef(0);
    useEffect(() => { fnRef.current = fn; }, [fn]);

    const run = useCallback((force = false) => {
        const now = Date.now();
        if (!force && now - lastRef.current < minIntervalMs) return;
        lastRef.current = now;
        fnRef.current?.();
    }, [minIntervalMs]);

    const eventsKey = Array.isArray(events) ? events.join('|') : '';
    useEffect(() => {
        if (!enabled || typeof document === 'undefined' || typeof window === 'undefined') return undefined;
        run(true);
        const onVisible = () => { if (document.visibilityState === 'visible') run(false); };
        document.addEventListener('visibilitychange', onVisible);
        const extra = (Array.isArray(events) ? events : []).map(name => {
            const h = () => run(true);
            window.addEventListener(name, h);
            return [name, h];
        });
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            extra.forEach(([name, h]) => window.removeEventListener(name, h));
        };
    }, [enabled, run, eventsKey]);

    return run;
}

/** Wraps fetch with an AbortController that is cancelled on unmount. */
export function useAbortableFetch() {
    const ctrlRef = useRef(null);
    useEffect(() => () => { try { ctrlRef.current?.abort(); } catch (e) { /* noop */ } }, []);
    return useCallback((url, opts = {}) => {
        try { ctrlRef.current?.abort(); } catch (e) { /* noop */ }
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        ctrlRef.current = ctrl;
        return fetch(url, ctrl ? { ...opts, signal: ctrl.signal } : opts);
    }, []);
}

/** True when an abort caused the rejection (do not surface those as errors). */
export function isAbortError(e) {
    return e?.name === 'AbortError' || /aborted/i.test(String(e?.message || ''));
}

/**
 * Deep-links a position/street focus into the Personal Assistant Leak Finder
 * where active corrective drills actually run (never the retired sandbox boundary).
 */
export function buildPracticeHref({ position = null, street = null, label = null } = {}) {
    const params = new URLSearchParams();
    if (position && position !== 'Any') params.set('position', position);
    const type = label || [position, street].filter(Boolean).join(' ');
    if (type) params.set('leakType', type);
    if (street && street !== 'Any') params.set('street', String(street).toLowerCase());
    const qs = params.toString();
    return `/hub/personal-assistant/leaks${qs ? `?${qs}` : ''}`;
}

export const kitTokens = { T, F, S, R, Z, btn, iconBtn };

export default BottomSheet;
