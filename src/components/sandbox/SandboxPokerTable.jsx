/**
 * SandboxPokerTable · Vertical Mobile-First Table Visual (v3.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * PA_DESIGN_SPEC v1 "Neon Slate".
 *
 * Everything on the felt is now WIDTH-DRIVEN: a ResizeObserver measures the
 * wrapper and every avatar / card / font size is derived from that width, so
 * the table degrades gracefully from a 375px phone down to a 200px column
 * instead of overflowing its own graphic.
 *
 * Also fixed here:
 *  - hero cards no longer paint above page overlays (zIndex 150 -> Z.feltCards,
 *    plus `isolation:isolate` on the root so nothing can escape the felt)
 *  - hero card offset is a PERCENTAGE of table height, not a hard-coded -50px
 *  - long-press cancels on scroll (touchmove) and shows a progress ring
 *  - swipe uses pointer capture, an 80px threshold, a 2:1 axis ratio and
 *    ignores anything tagged [data-no-swipe]
 *  - every tappable is a real <button> with an aria-label and keyboard support
 *  - an explicit Edit mode replaces the undiscoverable 500ms long-press
 */
import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Pencil, X as XIcon, Check } from 'lucide-react';
import { T, F, R, Z, usePrefersReducedMotion } from './paTokens';
import {
    getClubArenaTheme,
    onClubArenaThemeChange,
    resolveArenaSkinUrl,
    resolveArenaBackgroundLayers,
    resolveArenaCardBackUrl,
    resolveArenaDealerButton,
    ARENA_BACKGROUND_SIZE,
    ARENA_BACKGROUND_REPEAT,
    ARENA_BACKDROP_COLOR,
} from '../../lib/clubArenaTheme';

/* ═══════════════════════════════════════════════════════════════════════
   LONG PRESS · with movement cancellation + pending feedback
   ═══════════════════════════════════════════════════════════════════════ */
const MOVE_TOLERANCE = 10;

function useLongPress(callback, { onClick, ms = 500, enabled = true } = {}) {
    const timerRef = useRef(null);
    const firedRef = useRef(false);
    const originRef = useRef(null);
    const [pressing, setPressing] = useState(false);

    const clear = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        originRef.current = null;
        setPressing(false);
    }, []);

    useEffect(() => clear, [clear]);

    const start = useCallback((x, y) => {
        if (!enabled) return;
        firedRef.current = false;
        originRef.current = { x, y };
        setPressing(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            firedRef.current = true;
            setPressing(false);
            try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            callback?.();
        }, ms);
    }, [callback, ms, enabled, clear]);

    const move = useCallback((x, y) => {
        const o = originRef.current;
        if (!o) return;
        if (Math.abs(x - o.x) > MOVE_TOLERANCE || Math.abs(y - o.y) > MOVE_TOLERANCE) clear();
    }, [clear]);

    const handleClick = useCallback((e) => {
        if (firedRef.current) {
            firedRef.current = false;
            e?.preventDefault?.();
            e?.stopPropagation?.();
            return;
        }
        onClick?.(e);
    }, [onClick]);

    const props = {
        onTouchStart: (e) => { const t = e.touches?.[0]; if (t) start(t.clientX, t.clientY); },
        onTouchMove: (e) => { const t = e.touches?.[0]; if (t) move(t.clientX, t.clientY); },
        onTouchEnd: clear,
        onTouchCancel: clear,
        onMouseDown: (e) => start(e.clientX, e.clientY),
        onMouseMove: (e) => move(e.clientX, e.clientY),
        onMouseUp: clear,
        onMouseLeave: clear,
        onClick: handleClick,
        onContextMenu: (e) => e?.preventDefault?.(),
    };

    return { props, pressing };
}

const NO_SELECT = {
    userSelect: 'none', WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none', touchAction: 'pan-y',
};

// ═══════════════════════════════════════════════════════════════════════════
// CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = {
    'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
    'J': 'j', 'Q': 'q', 'K': 'k'
};

// 4-color suit tokens matching Club Arena's 4-color deck
const FOUR_COLOR_SUIT = { s: '#111827', h: '#C81E2B', d: '#0F52BA', c: '#16794B' };
const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function TableCard({ card, style = {} }) {
    // Tier 0: Club Arena 4-color WebP deck (/hub/club-arena/cards/4color/...)
    // Tier 1: World Hub bundled PNG deck (/cards/...)
    // Tier 2: Crisp 4-color typography fallback
    const [fallbackTier, setFallbackTier] = useState(0);
    const raw = typeof card === 'string' ? card.trim() : '';

    // Reset the fallback tier whenever the card itself changes
    useEffect(() => { setFallbackTier(0); }, [raw]);

    if (!raw) return null;

    const rankChar = raw[0]?.toUpperCase();
    const suitChar = raw[raw.length - 1]?.toLowerCase();
    const suitName = SUIT_MAP[suitChar];
    const rankName = RANK_MAP[rankChar];
    const suitColor = FOUR_COLOR_SUIT[suitChar] || '#111827';
    const showTextFallback = fallbackTier >= 2 || !suitName || !rankName;

    const wrapperStyle = {
        width: 42, height: 59,
        background: '#ffffff', borderRadius: 6,
        boxShadow: '0 6px 14px rgba(0,0,0,0.62), 0 1px 2px rgba(0,0,0,0.45)',
        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.42)',
        boxSizing: 'border-box',
        ...style,
    };

    if (showTextFallback) {
        const h = Number(wrapperStyle.height) || 59;
        return (
            <span style={{
                ...wrapperStyle,
                display: 'inline-flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: suitColor,
                fontWeight: 900, lineHeight: 1,
                fontFamily: "'Inter',-apple-system,sans-serif",
            }} aria-label={raw} data-arena-card={raw}>
                <span style={{ fontSize: Math.max(12, Math.round(h * 0.34)) }}>{rankChar || '?'}</span>
                <span style={{ fontSize: Math.max(12, Math.round(h * 0.28)) }}>{SUIT_SYMBOL[suitChar] || '?'}</span>
            </span>
        );
    }

    const imagePath = fallbackTier === 0
        ? `/hub/club-arena/cards/4color/${suitName}_${rankName}.webp`
        : `/cards/${suitName}_${rankName}.png`;
    return (
        <span style={{ ...wrapperStyle, display: 'inline-block' }} data-arena-card={raw}>
            <img
                src={imagePath}
                alt={raw}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={() => setFallbackTier((prev) => prev + 1)}
                decoding="async"
            />
        </span>
    );
}

function ArenaCardBackPair({ cardBackUrl, w = 18, h = 25 }) {
    const [useFallback, setUseFallback] = useState(false);
    useEffect(() => { setUseFallback(false); }, [cardBackUrl]);
    const src = useFallback ? '/cards/back.webp' : (cardBackUrl || resolveArenaCardBackUrl());
    const cardStyle = (rot, ml) => ({
        width: w, height: h, borderRadius: 3, overflow: 'hidden',
        border: '1px solid rgba(201, 223, 240, 0.45)',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.65)',
        transform: `rotate(${rot}deg)`,
        marginLeft: ml,
        background: '#0b1e3b',
        flexShrink: 0,
    });
    return (
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', pointerEvents: 'none' }}>
            <span style={cardStyle(-8, 0)}>
                <img
                    src={src}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={() => { if (!useFallback) setUseFallback(true); }}
                    decoding="async"
                />
            </span>
            <span style={cardStyle(8, -Math.round(w * 0.35))}>
                <img
                    src={src}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={() => { if (!useFallback) setUseFallback(true); }}
                    decoding="async"
                />
            </span>
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VERTICAL SEAT POSITIONS · Recalculated for portrait layout
// ═══════════════════════════════════════════════════════════════════════════

function computeVerticalSeatPositions(maxSeats) {
    // Vertical oval · taller than wide, matching poker-table-black-gold.png
    const cx = 50, cy = 50;
    const rx = 28;  // Narrower horizontal radius
    const ry = 36;  // Taller vertical radius

    const seatPositions = [];
    // Hero at bottom (6 o'clock), villain at top
    const startAngle = Math.PI / 2;
    for (let i = 0; i < maxSeats; i++) {
        const angle = startAngle + (2 * Math.PI * i) / maxSeats;
        const x = cx + rx * Math.cos(angle);
        const y = cy + ry * Math.sin(angle);
        seatPositions.push({ top: `${y}%`, left: `${x}%` });
    }
    return { seatPositions };
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD SUBCOMPONENTS (separate components so hooks are never conditional)
// ═══════════════════════════════════════════════════════════════════════════

function DeleteBadge({ size, onRemove, label }) {
    return (
        <button
            type="button"
            data-no-swipe="true"
            aria-label={label}
            onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            style={{
                position: 'absolute', top: -18, right: -18, zIndex: 2,
                width: Math.max(44, size), height: Math.max(44, size), borderRadius: '50%',
                background: T.danger, border: '2px solid #020609', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', padding: 0, touchAction: 'manipulation',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
            }}
        >
            <XIcon size={12} strokeWidth={3} aria-hidden="true" />
        </button>
    );
}

function PressRing({ visible, reduce }) {
    if (!visible || reduce) return null;
    return (
        <span
            aria-hidden="true"
            style={{
                position: 'absolute', inset: -3, borderRadius: R.sm, pointerEvents: 'none',
                border: `2px solid ${T.accent}`, boxShadow: `0 0 12px ${T.accent}`,
                animation: 'paCardHold 0.5s linear forwards',
            }}
        />
    );
}

function BoardCardItem({ card, i, onRemove, onTap, w, h, editMode, reduce }) {
    const handleRemove = useCallback(() => { onRemove?.(i); }, [onRemove, i]);
    const { props: lp, pressing } = useLongPress(handleRemove, { onClick: onTap, enabled: !editMode });
    return (
        <motion.div
            {...lp}
            data-no-swipe="true"
            role="button"
            tabIndex={0}
            aria-label={`Board card ${card}. Tap to change, long press or use Delete to remove.`}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(); }
                if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); handleRemove(); }
            }}
            initial={reduce ? { opacity: 0 } : { y: -15, opacity: 0, scale: 0.5 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 12, delay: i * 0.06 }}
            style={{ position: 'relative', cursor: 'pointer', ...NO_SELECT }}
        >
            <TableCard card={card} style={{ width: w, height: h }} />
            <PressRing visible={pressing} reduce={reduce} />
            {editMode && <DeleteBadge size={22} onRemove={handleRemove} label={`Remove board card ${card}`} />}
        </motion.div>
    );
}

function HeroCardItem({ card, i, onRemove, onTap, w, h, editMode, reduce }) {
    const handleRemove = useCallback(() => { onRemove?.(i); }, [onRemove, i]);
    const { props: lp, pressing } = useLongPress(handleRemove, { onClick: onTap, enabled: !editMode });
    return (
        <motion.div
            {...lp}
            data-no-swipe="true"
            role="button"
            tabIndex={0}
            aria-label={`Your card ${card}. Tap to change, long press or use Delete to remove.`}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap?.(); }
                if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); handleRemove(); }
            }}
            initial={reduce ? { opacity: 0 } : { y: 20, opacity: 0, rotateY: 90 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, rotateY: 0, rotate: i === 0 ? -5 : 5 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 15, delay: 0.12 + i * 0.1 }}
            style={{
                position: 'relative', marginLeft: i > 0 ? -Math.round(w * 0.16) : 0,
                cursor: 'pointer', perspective: 800, ...NO_SELECT,
            }}
        >
            <TableCard card={card} style={{ width: w, height: h }} />
            <PressRing visible={pressing} reduce={reduce} />
            {editMode && <DeleteBadge size={22} onRemove={handleRemove} label={`Remove your card ${card}`} />}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATIC TABLE ASSETS (module scope · never rebuilt per render)
// ═══════════════════════════════════════════════════════════════════════════

// Deterministic avatar assignment for sandbox seats (max table = hero + 5)
const SANDBOX_AVATARS = [
    '/avatars/table/free_fox.webp',       // Hero
    '/avatars/table/free_shark.webp',
    '/avatars/table/free_ninja.webp',
    '/avatars/table/free_viking.webp',
    '/avatars/table/free_lion.webp',
    '/avatars/table/free_owl.webp',
];

const BASE_WIDTH = 300;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TABLE · Vertical portrait orientation
// ═══════════════════════════════════════════════════════════════════════════

export default function SandboxPokerTable({
    heroCards = [],
    communityCards = [],
    pot = 0,
    heroPosition = 'BTN',
    heroStack = 100,
    villains = [],
    street = 'flop',
    tableSkinId = null,
    boardTexture,
    equity,
    equityLabel = null,
    spr = null,
    /** Board texture now renders as a chip ABOVE the table (it never fit on the felt). */
    showTextureBadge = false,
    /** Renders a one-time "swipe to deal" hint chip on the felt. */
    showDealHint = false,
    onTapHeroCards,
    onTapBoard,
    onReset,
    onRemoveHeroCard,
    onRemoveBoardCard,
    // Swipe gesture handlers
    onSwipeLeft,
    onSwipeRight,
}) {
    const reduce = usePrefersReducedMotion();
    const rootRef = useRef(null);
    const [tw, setTw] = useState(BASE_WIDTH);
    const [editMode, setEditMode] = useState(false);

    // Club Arena theme lock-in: the sandbox felt paints the player's saved
    // Arena table look. Client-only (localStorage), never at module scope/SSR.
    const [arenaTheme, setArenaTheme] = useState(null);
    useEffect(() => {
        setArenaTheme(getClubArenaTheme());
        return onClubArenaThemeChange(setArenaTheme);
    }, []);

    // ── Width-driven scale ────────────────────────────────────────────────
    useEffect(() => {
        const node = rootRef.current;
        if (!node || typeof window === 'undefined') return undefined;
        const apply = (w) => { if (w > 0) setTw(Math.round(w)); };
        apply(node.getBoundingClientRect().width);
        if (typeof ResizeObserver === 'undefined') {
            const onResize = () => apply(node.getBoundingClientRect().width);
            window.addEventListener('resize', onResize);
            return () => window.removeEventListener('resize', onResize);
        }
        const ro = new ResizeObserver((entries) => {
            const w = entries?.[0]?.contentRect?.width;
            if (w) apply(w);
        });
        ro.observe(node);
        return () => ro.disconnect();
    }, []);

    const u = tw / BASE_WIDTH;
    const compact = tw < 230;             // seat badge collapses to avatar only
    const avatarSize = Math.round(clamp(44 * u, 28, 52));
    const boardW = Math.round(clamp(34 * u, 24, 46));
    const boardH = Math.round(boardW * 1.4);
    const heroW = Math.round(clamp(38 * u, 28, 52));
    const heroH = Math.round(heroW * 1.4);
    const fs = (base, floor = 12) => Math.max(floor, Math.round(base * u));

    const totalSeats = 1 + (villains?.length || 0);
    const maxSeats = Math.max(totalSeats, 2);
    const { seatPositions } = useMemo(() => computeVerticalSeatPositions(maxSeats), [maxSeats]);

    // Build seat array: hero at index 0, then villains
    const seatArr = useMemo(() => [
        { name: heroPosition, stack: Number(heroStack) || 0, isHero: true },
        ...(villains || []).map((v, i) => ({
            name: v.position || `V${i + 1}`,
            stack: Number(v.stack) || 100,
            archetype: v.archetype?.name || 'Opponent',
            isHero: false,
        })),
    ], [heroPosition, heroStack, villains]);

    const streetLabel = String(street || 'flop');
    const potValue = Number(pot) || 0;
    const equityValue = Number(equity);
    const hasEquity = equity != null && Number.isFinite(equityValue);

    // ── Swipe gesture ─────────────────────────────────────────────────────
    // Pointer capture so a drag that leaves the felt still resolves; 80px
    // threshold + a 2:1 axis ratio so ordinary vertical scrolling never deals.
    const pointerStartRef = useRef(null);
    const handlePointerDown = useCallback((e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) { pointerStartRef.current = null; return; }
        if (e.target?.closest?.('[data-no-swipe]')) { pointerStartRef.current = null; return; }
        pointerStartRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
    }, []);
    const releaseCapture = useCallback((e) => {
        try {
            if (e?.pointerId != null && e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        } catch (err) { /* noop */ }
    }, []);
    const handlePointerUp = useCallback((e) => {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        releaseCapture(e);
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
            try { navigator.vibrate?.(10); } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
            if (dx < 0) onSwipeLeft?.();
            else onSwipeRight?.();
        }
    }, [onSwipeLeft, onSwipeRight, releaseCapture]);
    const handlePointerCancel = useCallback((e) => { pointerStartRef.current = null; releaseCapture(e); }, [releaseCapture]);
    const handleLostCapture = useCallback(() => { pointerStartRef.current = null; }, []);

    const cornerBtn = (extra) => ({
        position: 'absolute', zIndex: Z.feltCards,
        width: 44, height: 44, borderRadius: '50%', padding: 0,
        background: 'radial-gradient(circle at 32% 28%, #263F58 0%, #0B1C2C 62%, #050E18 100%)',
        border: '2px solid rgba(174, 192, 208, 0.58)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 12px rgba(0,0,0,0.62)',
        color: '#E4EEF7', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        ...extra,
    });

    const hasAnyCard = heroCards.length > 0 || communityCards.length > 0;
    const resolvedTableSkinUrl = arenaTheme?.fromCache
        ? arenaTheme.feltUrl
        : resolveArenaSkinUrl(tableSkinId || arenaTheme?.tableId || 'classic_green', arenaTheme?.themeId);
    const resolvedRoomBg = arenaTheme?.backgroundLayers || resolveArenaBackgroundLayers('midnight');
    const resolvedCardBackUrl = arenaTheme?.cardBackUrl || resolveArenaCardBackUrl();
    const resolvedDealerButton = arenaTheme?.dealerButton || resolveArenaDealerButton();
    const dealerSeatIndex = seatArr.findIndex((s) => String(s.name || '').toUpperCase() === 'BTN');

    return (
        <div
            ref={rootRef}
            data-arena-table="true"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostCapture}
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: 'min(100%, 400px)',
                margin: '0 auto',
                aspectRatio: '605 / 1000',
                overflow: 'hidden',
                // Nothing inside the felt may ever paint over a page overlay.
                zIndex: 0,
                isolation: 'isolate',
                touchAction: 'pan-y',
                backgroundColor: ARENA_BACKDROP_COLOR,
                backgroundImage: resolvedRoomBg,
                backgroundSize: ARENA_BACKGROUND_SIZE,
                backgroundRepeat: ARENA_BACKGROUND_REPEAT,
                backgroundPosition: 'center',
                borderRadius: R.lg,
                border: '1px solid rgba(174, 192, 208, 0.28)',
                boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.72), 0 12px 28px rgba(0, 0, 0, 0.55)',
            }}>
            <style>{`
                @keyframes paCardHold { from { transform: scale(1); opacity: .35 } to { transform: scale(1.06); opacity: 1 } }
                @media (prefers-reduced-motion: reduce) {
                    @keyframes paCardHold { from { opacity: 1 } to { opacity: 1 } }
                }
            `}</style>

            {/* Authentic Club Arena / Poker Arena wood & felt table skin.
                This is the LCP element on a cold mobile load, so it is eager. */}
            <img
                src={resolvedTableSkinUrl}
                alt=""
                aria-hidden="true"
                data-arena-table-skin="true"
                style={{
                    position: 'absolute',
                    top: '4%',
                    left: '5%',
                    width: '90%',
                    height: '92%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    zIndex: 0,
                    filter: 'drop-shadow(0 18px 28px rgba(0, 0, 0, 0.78))',
                }}
                loading="eager"
                fetchpriority="high"
                decoding="async"
            />

            {/* Subtle Club Arena felt table watermark */}
            <div
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: '27%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1,
                    pointerEvents: 'none',
                    color: 'rgba(255, 255, 255, 0.14)',
                    fontSize: Math.max(11, Math.round(12 * u)),
                    fontWeight: 900,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    fontFamily: "'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
                }}
            >
                SMARTER.POKER
            </div>

            {/* Reset · 44x44, lucide glyph, excluded from the swipe surface */}
            {onReset && (
                <button
                    type="button"
                    data-no-swipe="true"
                    onClick={() => { try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onReset(); }}
                    style={cornerBtn({ top: 8, right: 8 })}
                    aria-label="Reset hand"
                >
                    <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
                </button>
            )}

            {/* Edit mode · replaces the undiscoverable long-press with an
                explicit toggle that puts a delete badge on every card. */}
            {hasAnyCard && (onRemoveHeroCard || onRemoveBoardCard) && (
                <button
                    type="button"
                    data-no-swipe="true"
                    onClick={() => { setEditMode(v => !v); try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } }}
                    aria-pressed={editMode}
                    aria-label={editMode ? 'Done editing cards' : 'Edit cards'}
                    style={cornerBtn({
                        top: 8, left: 8,
                        color: editMode ? '#ffffff' : '#E4EEF7',
                        borderColor: editMode ? '#56D8FF' : 'rgba(174, 192, 208, 0.58)',
                        background: editMode
                            ? 'linear-gradient(180deg, #1981EC, #0C55C0 40%, #07377E 100%)'
                            : 'radial-gradient(circle at 32% 28%, #263F58 0%, #0B1C2C 62%, #050E18 100%)',
                    })}
                >
                    {editMode
                        ? <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                        : <Pencil size={18} strokeWidth={2} aria-hidden="true" />}
                </button>
            )}

            {/* Board texture badge · opt-in only; the page renders it as a chip
                above the table where it has room to be legible. */}
            {showTextureBadge && boardTexture && (
                <div style={{
                    position: 'absolute', top: '13%', left: '50%', transform: 'translateX(-50%)',
                    padding: '3px 8px', borderRadius: R.sm, fontSize: 12, fontWeight: 700, zIndex: Z.felt,
                    background: boardTexture.color || 'rgba(99,231,255,0.2)',
                    color: boardTexture.textColor || T.accent,
                    border: `1px solid ${boardTexture.textColor || T.accentPress}44`,
                    whiteSpace: 'nowrap', maxWidth: '86%', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {boardTexture.label}
                </div>
            )}

            {/* Community Cards · 34% leaves vertical breathing room under the
                villain seat and above the pot readout. */}
            {communityCards.length > 0 ? (
                <div
                    style={{
                        position: 'absolute', top: '34%', left: '50%',
                        transform: 'translateX(-50%)', display: 'flex',
                        gap: Math.max(2, Math.round(3 * u)), zIndex: Z.felt,
                        maxWidth: '94%',
                    }}
                >
                    {communityCards.map((cardVal, i) => (
                        <BoardCardItem
                            key={cardVal || i}
                            card={cardVal}
                            i={i}
                            onRemove={onRemoveBoardCard}
                            onTap={onTapBoard}
                            w={boardW} h={boardH}
                            editMode={editMode}
                            reduce={reduce}
                        />
                    ))}
                </div>
            ) : onTapBoard ? (
                <button
                    type="button"
                    data-no-swipe="true"
                    onClick={onTapBoard}
                    aria-label="Choose board cards"
                    style={{
                        position: 'absolute', top: '34%', left: '50%',
                        transform: 'translateX(-50%)', display: 'flex',
                        gap: Math.max(3, Math.round(4 * u)), zIndex: Z.felt,
                        background: 'none', border: 'none', padding: 6, margin: -6,
                        cursor: 'pointer', touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    {[0, 1, 2].map(i => (
                        <span key={i} style={{
                            display: 'block', width: boardW, height: boardH, borderRadius: R.sm,
                            border: '1.5px dashed rgba(255,255,255,0.28)',
                            background: 'rgba(255,255,255,0.04)',
                        }} />
                    ))}
                </button>
            ) : null}

            {/* Center info · authentic Club Arena pot pill & telemetry */}
            <div style={{
                position: 'absolute', top: '55%', left: '50%',
                transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                width: '74%',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '4px 12px', borderRadius: R.pill,
                    background: 'linear-gradient(180deg, rgba(16, 33, 52, 0.9), rgba(5, 13, 24, 0.94))',
                    border: '1px solid rgba(174, 192, 208, 0.48)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    fontSize: fs(15, 13), fontWeight: 800, color: '#FFFFFF',
                    letterSpacing: 0.3, lineHeight: 1.2,
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    Pot {potValue.toFixed(1)} BB
                </div>

                <div style={{
                    fontSize: 12, fontWeight: 700, color: 'rgba(226, 238, 248, 0.85)',
                    textTransform: 'uppercase', letterSpacing: 1.1, lineHeight: 1.2,
                    textShadow: '0 1px 4px rgba(0, 0, 0, 0.85)',
                }}>
                    {streetLabel.charAt(0).toUpperCase() + streetLabel.slice(1)}
                    {spr != null && Number.isFinite(Number(spr)) && (
                        <span style={{ color: '#86DAFF', marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                            SPR {spr}
                        </span>
                    )}
                </div>

                {hasEquity && (
                    <div style={{
                        padding: '2px 10px', borderRadius: R.pill,
                        background: 'rgba(5, 13, 24, 0.78)',
                        border: `1px solid ${equityValue >= 50 ? 'rgba(77, 224, 165, 0.5)' : equityValue < 35 ? 'rgba(255, 107, 122, 0.5)' : 'rgba(86, 216, 255, 0.5)'}`,
                        fontSize: 13, fontWeight: 800, lineHeight: 1.25,
                        color: equityValue >= 50 ? T.success : equityValue < 35 ? T.danger : T.accent,
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {equityValue.toFixed(1)}% Equity
                    </div>
                )}
                {hasEquity && equityLabel && (
                    <div style={{
                        fontSize: 12, color: 'rgba(214, 228, 240, 0.78)', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textShadow: '0 1px 4px rgba(0, 0, 0, 0.85)',
                    }}>
                        {equityLabel}
                    </div>
                )}
            </div>

            {/* Swipe affordance · the gesture is otherwise invisible */}
            {showDealHint && (
                <div style={{
                    position: 'absolute', bottom: '3.5%', left: '50%', transform: 'translateX(-50%)',
                    zIndex: Z.felt, padding: '4px 12px', borderRadius: R.pill,
                    background: 'linear-gradient(180deg, rgba(16, 33, 52, 0.9), rgba(5, 13, 24, 0.92))',
                    border: '1px solid rgba(174, 192, 208, 0.42)',
                    color: '#DCE5EF', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                }}>
                    Swipe Left To Deal · Right To Undo
                </div>
            )}

            {/* Seat badges · Club Arena brushed-steel metallic seat pods */}
            {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                const pos = seatPositions[idx];
                const leftPct = parseFloat(pos.left);
                const isLeftSide = leftPct < 25;
                const isRightSide = leftPct > 75;
                const isDealer = idx === dealerSeatIndex;

                let badgeTransform = 'translate(-50%, -50%)';
                if (isLeftSide) badgeTransform = 'translate(-10px, -50%)';
                else if (isRightSide) badgeTransform = 'translate(calc(-100% + 10px), -50%)';

                return (
                    <div
                        key={`${seat.name}-${idx}`}
                        style={{
                            position: 'absolute',
                            top: pos.top,
                            left: pos.left,
                            transform: badgeTransform,
                            zIndex: 2,
                            maxWidth: Math.round(tw * 0.58),
                        }}
                    >
                        <motion.div
                            initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                            transition={reduce ? { duration: 0 } : { delay: idx * 0.05 }}
                            style={{
                                position: 'relative',
                                display: 'flex', alignItems: 'center', gap: compact ? 0 : 6,
                                background: seat.isHero
                                    ? 'linear-gradient(160deg, rgba(22, 46, 72, 0.96) 0%, rgba(9, 22, 36, 0.96) 60%, rgba(4, 12, 22, 0.98) 100%)'
                                    : 'linear-gradient(160deg, rgba(24, 41, 60, 0.94) 0%, rgba(10, 21, 34, 0.95) 60%, rgba(5, 11, 19, 0.96) 100%)',
                                borderRadius: 12,
                                padding: compact ? 2 : '4px 8px 4px 4px',
                                border: `2px solid ${seat.isHero ? '#56D8FF' : 'rgba(174, 192, 208, 0.48)'}`,
                                boxShadow: seat.isHero
                                    ? '0 6px 18px rgba(0,0,0,0.68), 0 0 14px rgba(86,216,255,0.28), inset 0 1px 0 rgba(255,255,255,0.24)'
                                    : '0 6px 16px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.18)',
                                WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)',
                            }}>
                            <div style={{
                                position: 'relative',
                                width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0,
                                overflow: 'hidden',
                                border: `2px solid ${seat.isHero ? '#86DAFF' : 'rgba(196, 214, 230, 0.55)'}`,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                                background: 'radial-gradient(circle at 35% 30%, #203952, #07121e)',
                            }}>
                                <img
                                    src={SANDBOX_AVATARS[idx % SANDBOX_AVATARS.length]}
                                    alt=""
                                    aria-hidden="true"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                    loading="lazy"
                                    decoding="async"
                                />
                            </div>
                            {compact ? (
                                <span className="pa-vh-inline" style={{
                                    position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)',
                                    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                                    color: seat.isHero ? T.accent : T.textMuted,
                                    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                                }}>
                                    {seat.name} · {Number(seat.stack) || 0}
                                </span>
                            ) : (
                                <div style={{ overflow: 'hidden', minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 12, fontWeight: 800, lineHeight: 1.2,
                                        color: seat.isHero ? '#86DAFF' : '#F1F5FC',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        maxWidth: Math.round(tw * 0.3),
                                    }}>
                                        {seat.isHero ? `You (${seat.name})` : seat.name}
                                    </div>
                                    <div style={{
                                        fontSize: 12, fontWeight: 800, color: '#D3E2EE', lineHeight: 1.2,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        {Number(seat.stack) || 0} BB
                                    </div>
                                    {!seat.isHero && seat.archetype && !compact && tw >= 280 && (
                                        <div style={{
                                            fontSize: 12, fontWeight: 600, color: '#9EB4C8',
                                            lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap', maxWidth: Math.round(tw * 0.3),
                                        }}>
                                            {seat.archetype}
                                        </div>
                                    )}
                                </div>
                            )}
                            {!seat.isHero && !compact && (
                                <ArenaCardBackPair cardBackUrl={resolvedCardBackUrl} w={Math.round(clamp(18 * u, 14, 22))} h={Math.round(clamp(25 * u, 20, 31))} />
                            )}
                            {isDealer && (
                                <span
                                    aria-label="Dealer Button"
                                    data-arena-dealer-button="true"
                                    style={{
                                        position: 'absolute',
                                        top: -8,
                                        right: -8,
                                        width: 22,
                                        height: 22,
                                        borderRadius: '50%',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: resolvedDealerButton.bg,
                                        color: resolvedDealerButton.color,
                                        border: '2px solid rgba(10, 22, 36, 0.9)',
                                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.72)',
                                        fontSize: 11,
                                        fontWeight: 900,
                                        lineHeight: 1,
                                        pointerEvents: 'none',
                                    }}
                                >
                                    D
                                </span>
                            )}
                        </motion.div>
                    </div>
                );
            })}

            {/* Hero Cards · offset expressed as a PERCENTAGE of table height so
                they scale with the felt instead of colliding with the pot block. */}
            {heroCards.length > 0 && seatPositions.length > 0 ? (
                <div
                    style={{
                        position: 'absolute',
                        top: `calc(${seatPositions[0].top} - 13%)`,
                        left: seatPositions[0].left,
                        transform: 'translateX(-50%)',
                        display: 'flex', zIndex: Z.feltCards,
                    }}
                >
                    {heroCards.map((cardVal, i) => (
                        <HeroCardItem
                            key={cardVal || i}
                            card={cardVal}
                            i={i}
                            onRemove={onRemoveHeroCard}
                            onTap={onTapHeroCards}
                            w={heroW} h={heroH}
                            editMode={editMode}
                            reduce={reduce}
                        />
                    ))}
                </div>
            ) : onTapHeroCards ? (
                <button
                    type="button"
                    data-no-swipe="true"
                    onClick={onTapHeroCards}
                    aria-label="Choose your hole cards"
                    style={{
                        position: 'absolute',
                        top: `calc(${seatPositions[0]?.top || '86%'} - 13%)`,
                        left: seatPositions[0]?.left || '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex', gap: 4, zIndex: Z.feltCards,
                        background: 'none', border: 'none', padding: 6, margin: -6,
                        cursor: 'pointer', touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    {[0, 1].map(i => (
                        <span key={i} style={{
                            display: 'flex', width: heroW, height: heroH, borderRadius: R.sm,
                            border: `2px dashed rgba(99,231,255,0.45)`,
                            background: 'rgba(99,231,255,0.06)',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, color: 'rgba(99,231,255,0.7)', fontWeight: 800,
                        }}>
                            ?
                        </span>
                    ))}
                </button>
            ) : null}
        </div>
    );
}
