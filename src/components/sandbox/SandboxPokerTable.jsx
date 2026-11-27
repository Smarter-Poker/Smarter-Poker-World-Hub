/**
 * SandboxPokerTable · 1:1 Club Arena / Poker Arena Table Clone (v4.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * Mirrors Club Arena's live TablePage / SeatSlot / PotDisplay / DealerButton /
 * ActionPanel architecture verbatim:
 *  - Authentic Club Arena room backdrop (`clubArenaTheme.backgroundLayers`)
 *  - Authentic Club Arena 605:1000 oval table skin (`skin_classic_green.png`
 *    or player's locked Club Arena table theme)
 *  - Club Arena measured seat-ring coordinates (2-max through 6-max, board
 *    band completely clear of side seats)
 *  - Club Arena stacked seat pods (circular metallic-ringed avatar on top,
 *    overlapping into a dark translucent frosted nameplate pill below)
 *  - Club Arena Hero hole-card placement directly to the RIGHT of Hero's pod
 *    (never covering Hero's face or floating onto the board)
 *  - Club Arena 4-color WebP playing cards (`/hub/club-arena/cards/4color/*.webp`
 *    with automatic `/cards/*.png` fallback) and Club Arena card backs facing
 *    inward beside every villain seat
 *  - Club Arena frosted Pot capsule with chip stack icon ABOVE the board,
 *    Dealer Button (`D`) placed ON THE FELT inboard of BTN, and per-seat
 *    street bet chips on the felt
 *  - Authentic Club Arena 3-button 3D beveled Action Panel (Fold Red /
 *    Check-Call Blue / Bet-Raise Green) + quick sizing presets (`33%`, `50%`,
 *    `75%`, `Pot`, `All-In`) wired directly into the Sandbox action engine.
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
            try { navigator.vibrate?.(20); } catch (_e) { /* haptic optional */ }
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
// CLUB ARENA 4-COLOR PLAYING CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_MAP = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_MAP = {
    'A': 'a', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9', 'T': '10',
    'J': 'j', 'Q': 'q', 'K': 'k',
};

const FOUR_COLOR_SUIT = { s: '#111827', h: '#C81E2B', d: '#0F52BA', c: '#16794B' };
const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function TableCard({ card, style = {} }) {
    // Tier 0: Club Arena 4-color WebP deck (/hub/club-arena/cards/4color/...)
    // Tier 1: World Hub bundled PNG deck (/cards/...)
    // Tier 2: Crisp 4-color typography fallback
    const [fallbackTier, setFallbackTier] = useState(0);
    const raw = typeof card === 'string' ? card.trim() : '';

    useEffect(() => { setFallbackTier(0); }, [raw]);

    if (!raw) return null;

    const rankChar = raw[0]?.toUpperCase();
    const suitChar = raw[raw.length - 1]?.toLowerCase();
    const suitName = SUIT_MAP[suitChar];
    const rankName = RANK_MAP[rankChar];
    const suitColor = FOUR_COLOR_SUIT[suitChar] || '#111827';
    const showTextFallback = fallbackTier >= 2 || !suitName || !rankName;

    const wrapperStyle = {
        width: 46, height: 64,
        background: '#ffffff', borderRadius: 6,
        boxShadow: '0 6px 14px rgba(0,0,0,0.62), 0 1px 2px rgba(0,0,0,0.48)',
        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.42)',
        boxSizing: 'border-box',
        ...style,
    };

    if (showTextFallback) {
        const h = Number(wrapperStyle.height) || 64;
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

function ArenaCardBackFan({ cardBackUrl, w = 22, h = 31, side = 'right' }) {
    const [useFallback, setUseFallback] = useState(false);
    useEffect(() => { setUseFallback(false); }, [cardBackUrl]);
    const src = useFallback ? '/cards/back.webp' : (cardBackUrl || resolveArenaCardBackUrl());
    const cardStyle = (rot, ml) => ({
        width: w, height: h, borderRadius: 3, overflow: 'hidden',
        border: '1px solid rgba(201, 223, 240, 0.45)',
        boxShadow: '0 3px 7px rgba(0, 0, 0, 0.72)',
        transform: `rotate(${rot}deg)`,
        marginLeft: ml,
        background: '#0b1e3b',
        flexShrink: 0,
    });
    return (
        <span
            aria-hidden="true"
            style={{
                position: 'absolute',
                top: 4,
                ...(side === 'left' ? { right: 'calc(100% - 6px)' } : { left: 'calc(100% - 6px)' }),
                display: 'inline-flex',
                alignItems: 'center',
                pointerEvents: 'none',
                zIndex: 1,
            }}
        >
            <span style={cardStyle(-9, 0)}>
                <img
                    src={src}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={() => { if (!useFallback) setUseFallback(true); }}
                    decoding="async"
                />
            </span>
            <span style={cardStyle(9, -Math.round(w * 0.42))}>
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

function ArenaChipStackIcon({ size = 16 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
            <ellipse cx="12" cy="18" rx="9" ry="3.6" fill="#0c55c0" stroke="#86daff" strokeWidth="1.2" />
            <ellipse cx="12" cy="14" rx="9" ry="3.6" fill="#1981ec" stroke="#b3eaff" strokeWidth="1.2" />
            <ellipse cx="12" cy="10" rx="9" ry="3.6" fill="#1587f8" stroke="#ffffff" strokeWidth="1.3" />
            <ellipse cx="12" cy="10" rx="4.5" ry="1.8" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLUB ARENA SEAT RING GEOMETRY (mirrors club-arena tableSeatGeometry.ts)
// Hero at slot 0 (bottom-center on the rail), villains distributed on the
// rail completely clear of the community board band (y: 38..54%).
// ═══════════════════════════════════════════════════════════════════════════
const ARENA_SEAT_RINGS = {
    2: [
        { x: 50, y: 86, dealer: { x: 35, y: 74 }, chip: { x: 50, y: 72 }, cardSide: 'right' },
        { x: 50, y: 12, dealer: { x: 64, y: 23 }, chip: { x: 50, y: 24 }, cardSide: 'right' },
    ],
    3: [
        { x: 50, y: 86, dealer: { x: 35, y: 74 }, chip: { x: 50, y: 72 }, cardSide: 'right' },
        { x: 17, y: 23, dealer: { x: 30, y: 31 }, chip: { x: 31, y: 28 }, cardSide: 'right' },
        { x: 83, y: 23, dealer: { x: 70, y: 31 }, chip: { x: 69, y: 28 }, cardSide: 'left' },
    ],
    4: [
        { x: 50, y: 86, dealer: { x: 35, y: 74 }, chip: { x: 50, y: 72 }, cardSide: 'right' },
        { x: 14, y: 67, dealer: { x: 29, y: 64 }, chip: { x: 32, y: 64 }, cardSide: 'right' },
        { x: 50, y: 12, dealer: { x: 64, y: 23 }, chip: { x: 50, y: 24 }, cardSide: 'right' },
        { x: 86, y: 67, dealer: { x: 71, y: 64 }, chip: { x: 68, y: 64 }, cardSide: 'left' },
    ],
    5: [
        { x: 50, y: 86, dealer: { x: 35, y: 74 }, chip: { x: 50, y: 72 }, cardSide: 'right' },
        { x: 14, y: 68, dealer: { x: 29, y: 65 }, chip: { x: 32, y: 65 }, cardSide: 'right' },
        { x: 22, y: 18, dealer: { x: 34, y: 27 }, chip: { x: 35, y: 25 }, cardSide: 'right' },
        { x: 78, y: 18, dealer: { x: 66, y: 27 }, chip: { x: 65, y: 25 }, cardSide: 'left' },
        { x: 86, y: 68, dealer: { x: 71, y: 65 }, chip: { x: 68, y: 65 }, cardSide: 'left' },
    ],
    6: [
        { x: 50, y: 86, dealer: { x: 35, y: 74 }, chip: { x: 50, y: 72 }, cardSide: 'right' },
        { x: 14, y: 68, dealer: { x: 29, y: 65 }, chip: { x: 32, y: 65 }, cardSide: 'right' },
        { x: 14, y: 24, dealer: { x: 29, y: 31 }, chip: { x: 31, y: 29 }, cardSide: 'right' },
        { x: 50, y: 12, dealer: { x: 64, y: 23 }, chip: { x: 50, y: 24 }, cardSide: 'right' },
        { x: 86, y: 24, dealer: { x: 71, y: 31 }, chip: { x: 69, y: 29 }, cardSide: 'left' },
        { x: 86, y: 68, dealer: { x: 71, y: 65 }, chip: { x: 68, y: 65 }, cardSide: 'left' },
    ],
};

function getArenaSeatRing(maxSeats) {
    const clamped = Math.max(2, Math.min(6, maxSeats));
    return ARENA_SEAT_RINGS[clamped] || ARENA_SEAT_RINGS[6];
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function DeleteBadge({ size, onRemove, label }) {
    return (
        <button
            type="button"
            data-no-swipe="true"
            aria-label={label}
            onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            style={{
                position: 'absolute', top: -18, right: -18, zIndex: 4,
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
            initial={reduce ? { opacity: 0 } : { y: -14, opacity: 0, scale: 0.65 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 16, delay: i * 0.05 }}
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
    // Club Arena SeatSlot.css: clean lined-up overlapping row (step = 0.72 * w), no messy fan tilt
    const overlapMargin = i > 0 ? -Math.round(w * 0.28) : 0;
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
            initial={reduce ? { opacity: 0 } : { y: 14, opacity: 0, scale: 0.85 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 18, delay: 0.08 + i * 0.08 }}
            style={{
                position: 'relative',
                marginLeft: overlapMargin,
                cursor: 'pointer',
                zIndex: i + 1,
                ...NO_SELECT,
            }}
        >
            <TableCard card={card} style={{ width: w, height: h }} />
            <PressRing visible={pressing} reduce={reduce} />
            {editMode && <DeleteBadge size={22} onRemove={handleRemove} label={`Remove your card ${card}`} />}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATIC TABLE ASSETS
// ═══════════════════════════════════════════════════════════════════════════

const SANDBOX_AVATARS = [
    '/avatars/table/free_fox.webp',       // Hero
    '/avatars/table/free_shark.webp',
    '/avatars/table/free_ninja.webp',
    '/avatars/table/free_viking.webp',
    '/avatars/table/free_lion.webp',
    '/avatars/table/free_owl.webp',
];

const BASE_WIDTH = 360;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CLUB ARENA POKER TABLE COMPONENT
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
    streetBets = null,
    facingBet = 0,
    onQuickAction = null,
    actionsDisabled = false,
    showTextureBadge = false,
    showDealHint = false,
    onTapHeroCards,
    onTapBoard,
    onReset,
    onRemoveHeroCard,
    onRemoveBoardCard,
    onSwipeLeft,
    onSwipeRight,
}) {
    const reduce = usePrefersReducedMotion();
    const rootRef = useRef(null);
    const [tw, setTw] = useState(BASE_WIDTH);
    const [editMode, setEditMode] = useState(false);
    const [selectedBetPct, setSelectedBetPct] = useState(0.5);

    // Club Arena theme lock-in: mirrors player's live Club Arena table look.
    const [arenaTheme, setArenaTheme] = useState(null);
    useEffect(() => {
        setArenaTheme(getClubArenaTheme());
        return onClubArenaThemeChange(setArenaTheme);
    }, []);

    // Width-driven proportional scaling (mirrors Club Arena --table-w ratios)
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
    // Club Arena ratios: villain avatar ~15.8% of table width, hero ~17.5%, board cards fit 5 across felt
    const villainAvatarSize = Math.round(clamp(54 * u, 42, 66));
    const heroAvatarSize = Math.round(clamp(62 * u, 48, 76));
    const boardW = Math.round(clamp(38 * u, 30, 44));
    const boardH = Math.round(boardW * 1.4);
    const heroW = Math.round(clamp(50 * u, 38, 62));
    const heroH = Math.round(heroW * 1.4);

    const totalSeats = 1 + (villains?.length || 0);
    const maxSeats = Math.max(totalSeats, 2);
    const seatRing = useMemo(() => getArenaSeatRing(maxSeats), [maxSeats]);

    const seatArr = useMemo(() => [
        {
            key: 'hero',
            name: heroPosition,
            displayName: `You · ${heroPosition}`,
            stack: Number(heroStack) || 0,
            isHero: true,
        },
        ...(villains || []).map((v, i) => ({
            key: `villain_${i}`,
            name: v.position || `V${i + 1}`,
            displayName: v.position || `V${i + 1}`,
            stack: Number(v.stack) || 100,
            archetype: v.archetype?.name || 'GTO Neutral',
            isHero: false,
        })),
    ], [heroPosition, heroStack, villains]);

    const streetLabel = String(street || 'flop');
    const potValue = Number(pot) || 0;
    const equityValue = Number(equity);
    const hasEquity = equity != null && Number.isFinite(equityValue);

    // Swipe gesture handling
    const pointerStartRef = useRef(null);
    const handlePointerDown = useCallback((e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) { pointerStartRef.current = null; return; }
        if (e.target?.closest?.('[data-no-swipe]')) { pointerStartRef.current = null; return; }
        pointerStartRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_err) { /* capture unsupported */ }
    }, []);
    const releaseCapture = useCallback((e) => {
        try {
            if (e?.pointerId != null && e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        } catch (_err) { /* noop */ }
    }, []);
    const handlePointerUp = useCallback((e) => {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        releaseCapture(e);
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
            try { navigator.vibrate?.(10); } catch (_err) { /* haptic optional */ }
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
    const dealerSlot = dealerSeatIndex >= 0 ? seatRing[dealerSeatIndex] : seatRing[0];

    // Quick Action sizing math for Club Arena 3-button bar
    const callAmount = Math.max(0, Math.round((Number(facingBet) || 0) * 10) / 10);
    const effectiveHeroStack = Math.max(1, Number(heroStack) || 100);
    const rawBetSize = selectedBetPct === 'allin'
        ? effectiveHeroStack
        : Math.max(callAmount > 0 ? Math.max(callAmount * 2, 2) : 1, Math.round(Math.max(potValue, 2) * selectedBetPct * 2) / 2);
    const betSize = Math.min(effectiveHeroStack, rawBetSize);
    const isAllIn = selectedBetPct === 'allin' || betSize >= effectiveHeroStack;
    const betVerb = callAmount > 0 ? 'raise' : 'bet';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
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
                    maxWidth: 'min(100%, 420px)',
                    margin: '0 auto',
                    aspectRatio: '605 / 960',
                    overflow: 'hidden',
                    zIndex: 0,
                    isolation: 'isolate',
                    touchAction: 'pan-y',
                    backgroundColor: ARENA_BACKDROP_COLOR,
                    backgroundImage: resolvedRoomBg,
                    backgroundSize: ARENA_BACKGROUND_SIZE,
                    backgroundRepeat: ARENA_BACKGROUND_REPEAT,
                    backgroundPosition: 'center',
                    borderRadius: R.lg,
                    border: '1px solid rgba(174, 192, 208, 0.34)',
                    boxShadow: 'inset 0 0 42px rgba(0, 0, 0, 0.72), 0 14px 32px rgba(0, 0, 0, 0.6)',
                }}
            >
                <style>{`
                    @keyframes paCardHold { from { transform: scale(1); opacity: .35 } to { transform: scale(1.06); opacity: 1 } }
                    @media (prefers-reduced-motion: reduce) {
                        @keyframes paCardHold { from { opacity: 1 } to { opacity: 1 } }
                    }
                `}</style>

                {/* Authentic Club Arena 605:1000 wood & felt oval table skin */}
                <img
                    src={resolvedTableSkinUrl}
                    alt=""
                    aria-hidden="true"
                    data-arena-table-skin="true"
                    style={{
                        position: 'absolute',
                        top: '5%',
                        left: '5.5%',
                        width: '89%',
                        height: '87%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 0,
                        filter: 'drop-shadow(0 18px 28px rgba(0, 0, 0, 0.8))',
                    }}
                    loading="eager"
                    fetchpriority="high"
                    decoding="async"
                />

                {/* Authentic Club Arena felt brand lettermark */}
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        top: '36.5%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 1,
                        pointerEvents: 'none',
                        color: 'rgba(255, 255, 255, 0.14)',
                        fontSize: Math.max(12, Math.round(13 * u)),
                        fontWeight: 900,
                        letterSpacing: '0.24em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        fontFamily: "'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
                    }}
                >
                    SMARTER.POKER
                </div>

                {/* Reset & Edit Corner Controls (44x44 metallic bezels) */}
                {onReset && (
                    <button
                        type="button"
                        data-no-swipe="true"
                        onClick={() => { try { navigator.vibrate?.(10); } catch (_e) { /* noop */ } onReset(); }}
                        style={cornerBtn({ top: 8, right: 8 })}
                        aria-label="Reset hand"
                    >
                        <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                )}

                {hasAnyCard && (onRemoveHeroCard || onRemoveBoardCard) && (
                    <button
                        type="button"
                        data-no-swipe="true"
                        onClick={() => { setEditMode(v => !v); try { navigator.vibrate?.(10); } catch (_e) { /* noop */ } }}
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

                {showTextureBadge && boardTexture && (
                    <div style={{
                        position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)',
                        padding: '3px 8px', borderRadius: R.sm, fontSize: 12, fontWeight: 700, zIndex: Z.felt,
                        background: boardTexture.color || 'rgba(99,231,255,0.2)',
                        color: boardTexture.textColor || T.accent,
                        border: `1px solid ${boardTexture.textColor || T.accentPress}44`,
                        whiteSpace: 'nowrap', maxWidth: '86%', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {boardTexture.label}
                    </div>
                )}

                {/* Club Arena Pot Capsule positioned ABOVE the community cards (PotDisplay.css 1:1) */}
                <div
                    data-arena-pot="true"
                    style={{
                        position: 'absolute',
                        top: '29.5%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: Z.felt,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '4px 14px',
                        borderRadius: 999,
                        background: 'rgba(8, 12, 22, 0.82)',
                        border: '1px solid rgba(174, 192, 208, 0.34)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
                        WebkitBackdropFilter: 'blur(10px)',
                        backdropFilter: 'blur(10px)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <ArenaChipStackIcon size={16} />
                    <span style={{
                        fontSize: 12, fontWeight: 800, color: '#83DEFF',
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>
                        POT
                    </span>
                    <span style={{
                        fontSize: 15, fontWeight: 800, color: '#FFFFFF',
                        fontVariantNumeric: 'tabular-nums',
                        textShadow: '0 1px 3px rgba(0,0,0,0.75)',
                    }}>
                        {potValue.toFixed(1)} BB
                    </span>
                </div>

                {/* Club Arena Community Board Lane centered at 45% across the felt */}
                {communityCards.length > 0 ? (
                    <div
                        data-arena-board="true"
                        style={{
                            position: 'absolute', top: '45.5%', left: '50%',
                            transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center',
                            gap: Math.max(3, Math.round(4 * u)), zIndex: Z.felt,
                            maxWidth: '90%',
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
                        {onTapBoard && communityCards.length < 5 && Array.from({ length: 5 - communityCards.length }).map((_, emptyIdx) => (
                            <button
                                key={`slot-${emptyIdx}`}
                                type="button"
                                data-no-swipe="true"
                                onClick={onTapBoard}
                                aria-label={`Deal ${communityCards.length + emptyIdx === 3 ? 'Turn' : 'River'} Card`}
                                style={{
                                    width: boardW, height: boardH, borderRadius: 6,
                                    border: '1.5px dashed rgba(255, 255, 255, 0.22)',
                                    background: 'rgba(4, 13, 24, 0.24)',
                                    color: 'rgba(214, 228, 240, 0.5)',
                                    fontSize: 12, fontWeight: 800,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', padding: 0,
                                }}
                            >
                                +
                            </button>
                        ))}
                    </div>
                ) : onTapBoard ? (
                    <button
                        type="button"
                        data-no-swipe="true"
                        onClick={onTapBoard}
                        aria-label="Choose board cards"
                        style={{
                            position: 'absolute', top: '45.5%', left: '50%',
                            transform: 'translate(-50%, -50%)', display: 'flex',
                            gap: Math.max(3, Math.round(4 * u)), zIndex: Z.felt,
                            background: 'none', border: 'none', padding: 6, margin: -6,
                            cursor: 'pointer', touchAction: 'manipulation',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        {[0, 1, 2].map(i => (
                            <span key={i} style={{
                                display: 'block', width: boardW, height: boardH, borderRadius: 6,
                                border: '1.5px dashed rgba(255,255,255,0.3)',
                                background: 'rgba(4,13,24,0.28)',
                            }} />
                        ))}
                    </button>
                ) : null}

                {/* Street / SPR / Equity HUD capsule cleanly below the community board */}
                <div style={{
                    position: 'absolute', top: '55.5%', left: '50%',
                    transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    pointerEvents: 'none',
                }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '3px 12px', borderRadius: 999,
                        background: 'rgba(6, 12, 22, 0.76)',
                        border: '1px solid rgba(174, 192, 208, 0.26)',
                        fontSize: 12, fontWeight: 800, color: '#DCE5EF',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        whiteSpace: 'nowrap',
                    }}>
                        <span>{streetLabel.charAt(0).toUpperCase() + streetLabel.slice(1)}</span>
                        {spr != null && Number.isFinite(Number(spr)) && (
                            <span style={{ color: '#86DAFF', fontVariantNumeric: 'tabular-nums' }}>
                                SPR {spr}
                            </span>
                        )}
                        {hasEquity && (
                            <span style={{
                                color: equityValue >= 50 ? T.success : equityValue < 35 ? T.danger : T.accent,
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                                {equityValue.toFixed(1)}% EQ
                            </span>
                        )}
                    </div>
                    {hasEquity && equityLabel && (
                        <div style={{
                            fontSize: 12, fontWeight: 600, color: 'rgba(214, 228, 240, 0.8)',
                            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                            whiteSpace: 'nowrap',
                        }}>
                            {equityLabel}
                        </div>
                    )}
                </div>

                {/* Club Arena Dealer Button (`D`) ON THE FELT inboard of BTN seat */}
                {dealerSlot?.dealer && (
                    <span
                        aria-label="Dealer Button"
                        data-arena-dealer-button="true"
                        style={{
                            position: 'absolute',
                            top: `${dealerSlot.dealer.y}%`,
                            left: `${dealerSlot.dealer.x}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: Z.felt,
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: resolvedDealerButton.bg,
                            color: resolvedDealerButton.color,
                            border: '2px solid rgba(10, 22, 36, 0.92)',
                            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.65)',
                            fontSize: 12,
                            fontWeight: 900,
                            lineHeight: 1,
                            pointerEvents: 'none',
                        }}
                    >
                        D
                    </span>
                )}

                {/* Per-Seat Street Bet Chip Pills ON THE FELT */}
                {streetBets && seatArr.slice(0, seatRing.length).map((seat, idx) => {
                    const betAmt = Number(streetBets[seat.key] || 0);
                    const chipPos = seatRing[idx]?.chip;
                    if (!(betAmt > 0) || !chipPos) return null;
                    return (
                        <div
                            key={`bet-${seat.key}`}
                            data-arena-seat-bet={seat.key}
                            style={{
                                position: 'absolute',
                                top: `${chipPos.y}%`,
                                left: `${chipPos.x}%`,
                                transform: 'translate(-50%, -50%)',
                                zIndex: Z.felt,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: 'rgba(8, 14, 26, 0.86)',
                                border: '1px solid rgba(134, 218, 255, 0.45)',
                                color: '#FFFFFF',
                                fontSize: 12,
                                fontWeight: 800,
                                fontVariantNumeric: 'tabular-nums',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                                pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <ArenaChipStackIcon size={13} />
                            <span>{betAmt % 1 === 0 ? betAmt : betAmt.toFixed(1)} BB</span>
                        </div>
                    );
                })}

                {/* Club Arena Stacked Seat Pods (Avatar ON TOP + Frosted Plate BELOW, 1:1 SeatSlot.css) */}
                {seatArr.slice(0, seatRing.length).map((seat, idx) => {
                    const slot = seatRing[idx];
                    const avSize = seat.isHero ? heroAvatarSize : villainAvatarSize;
                    const plateMinW = Math.round(clamp(seat.isHero ? 96 * u : 90 * u, 82, 114));

                    return (
                        <div
                            key={`${seat.key}-${idx}`}
                            data-arena-seat={seat.isHero ? 'hero' : `villain-${idx}`}
                            style={{
                                position: 'absolute',
                                top: `${slot.y}%`,
                                left: `${slot.x}%`,
                                transform: 'translate(-50%, -50%)',
                                zIndex: seat.isHero ? Z.feltCards : 12,
                            }}
                        >
                            <motion.div
                                initial={reduce ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                                animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                                transition={reduce ? { duration: 0 } : { delay: idx * 0.05 }}
                                style={{
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    width: plateMinW,
                                }}
                            >
                                {/* Opponent card backs tucked beside villain's avatar facing inward */}
                                {!seat.isHero && (
                                    <ArenaCardBackFan
                                        cardBackUrl={resolvedCardBackUrl}
                                        w={Math.round(clamp(18 * u, 15, 22))}
                                        h={Math.round(clamp(25 * u, 21, 31))}
                                        side={slot.cardSide}
                                    />
                                )}

                                {/* Circular Avatar with Club Arena metallic ring */}
                                <div style={{
                                    position: 'relative',
                                    width: avSize,
                                    height: avSize,
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    zIndex: 2,
                                    marginBottom: -Math.max(5, Math.round(avSize * 0.1)),
                                    border: seat.isHero
                                        ? '3px solid #56D8FF'
                                        : '2.5px solid rgba(205, 222, 238, 0.52)',
                                    background: 'radial-gradient(circle at 35% 28%, #223b56, #081320)',
                                    boxShadow: seat.isHero
                                        ? '0 4px 16px rgba(0,0,0,0.72), 0 0 14px rgba(86,216,255,0.42)'
                                        : '0 4px 12px rgba(0,0,0,0.65), inset 0 1px 2px rgba(255,255,255,0.12)',
                                }}>
                                    <img
                                        src={SANDBOX_AVATARS[idx % SANDBOX_AVATARS.length]}
                                        alt=""
                                        aria-hidden="true"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </div>

                                {/* Overlapping Dark Frosted Nameplate Pill BELOW avatar (SeatSlot.css .seat__info) */}
                                <div style={{
                                    position: 'relative',
                                    zIndex: 3,
                                    width: '100%',
                                    padding: '4px 6px 5px',
                                    borderRadius: 10,
                                    background: seat.isHero
                                        ? 'linear-gradient(180deg, rgba(16, 36, 58, 0.96) 0%, rgba(7, 15, 27, 0.98) 100%)'
                                        : 'linear-gradient(180deg, rgba(18, 26, 42, 0.94) 0%, rgba(9, 14, 24, 0.96) 100%)',
                                    border: seat.isHero
                                        ? '1.5px solid rgba(86, 216, 255, 0.72)'
                                        : '1.5px solid rgba(174, 192, 208, 0.34)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.14)',
                                    WebkitBackdropFilter: 'blur(8px)',
                                    backdropFilter: 'blur(8px)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{
                                        fontSize: 12, fontWeight: 700, lineHeight: 1.2,
                                        color: seat.isHero ? '#86DAFF' : '#F3F4F6',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {seat.displayName}
                                    </div>
                                    <div style={{
                                        fontSize: 13, fontWeight: 800, lineHeight: 1.2, marginTop: 1,
                                        color: seat.isHero ? '#4DE0A5' : '#FFFFFF',
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        {Number(seat.stack) || 0} BB
                                    </div>
                                    {!seat.isHero && seat.archetype && (
                                        <div style={{
                                            fontSize: 12, fontWeight: 600, lineHeight: 1.15, marginTop: 1,
                                            color: '#9EB4C8',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {seat.archetype}
                                        </div>
                                    )}
                                </div>

                                {/* Club Arena Hero Hole Cards: directly to the RIGHT of Hero pod (SeatSlot.css .seat__cards--hero) */}
                                {seat.isHero && (
                                    heroCards.length > 0 ? (
                                        <div
                                            data-arena-hero-cards="true"
                                            style={{
                                                position: 'absolute',
                                                left: 'calc(100% + 6px)',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                zIndex: Z.feltCards,
                                            }}
                                        >
                                            {heroCards.map((cardVal, cIdx) => (
                                                <HeroCardItem
                                                    key={cardVal || cIdx}
                                                    card={cardVal}
                                                    i={cIdx}
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
                                                left: 'calc(100% + 6px)',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                display: 'flex', gap: 4, zIndex: Z.feltCards,
                                                background: 'none', border: 'none', padding: 4, margin: -4,
                                                cursor: 'pointer', touchAction: 'manipulation',
                                                WebkitTapHighlightColor: 'transparent',
                                            }}
                                        >
                                            {[0, 1].map(cIdx => (
                                                <span key={cIdx} style={{
                                                    display: 'flex', width: heroW, height: heroH, borderRadius: 6,
                                                    border: '2px dashed rgba(99,231,255,0.52)',
                                                    background: 'rgba(99,231,255,0.08)',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, color: '#86DAFF', fontWeight: 800,
                                                }}>
                                                    ?
                                                </span>
                                            ))}
                                        </button>
                                    ) : null
                                )}
                            </motion.div>
                        </div>
                    );
                })}

                {/* Subtle swipe deal hint tucked along bottom edge clear of Hero pod */}
                {showDealHint && (
                    <div style={{
                        position: 'absolute', bottom: 4, left: 10,
                        zIndex: 6, padding: '2px 8px', borderRadius: 999,
                        background: 'rgba(6, 13, 24, 0.72)',
                        border: '1px solid rgba(174, 192, 208, 0.24)',
                        color: '#9EB4C8', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                    }}>
                        Swipe To Deal
                    </div>
                )}
            </div>

            {/* Club Arena 3-Button Action Panel (Fold Red / Check-Call Blue / Bet-Raise Green) */}
            {onQuickAction && (
                <div
                    data-arena-action-bar="true"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: '8px',
                        borderRadius: 12,
                        background: 'linear-gradient(180deg, #0d1a2a 0%, #050c16 100%)',
                        border: '3px solid transparent',
                        borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
                    }}
                >
                    {/* Quick Bet Sizing Presets */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 5 }}>
                        {[
                            { id: 0.33, label: '33%' },
                            { id: 0.5, label: '50%' },
                            { id: 0.75, label: '75%' },
                            { id: 1, label: 'Pot' },
                            { id: 'allin', label: 'All-In' },
                        ].map((preset) => {
                            const active = selectedBetPct === preset.id;
                            return (
                                <button
                                    key={preset.label}
                                    type="button"
                                    className="pa-btn"
                                    disabled={actionsDisabled}
                                    aria-pressed={active}
                                    onClick={() => setSelectedBetPct(preset.id)}
                                    style={{
                                        minHeight: 36,
                                        padding: '0 4px',
                                        borderRadius: 7,
                                        border: active ? '1px solid #56D8FF' : '1px solid rgba(140, 161, 180, 0.34)',
                                        background: active
                                            ? 'linear-gradient(180deg, #1981EC, #0C55C0 45%, #07377E 100%)'
                                            : 'linear-gradient(180deg, #1f354c 0%, #0d1d2e 100%)',
                                        color: active ? '#FFFFFF' : '#DCE5EF',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                                        opacity: actionsDisabled ? 0.5 : 1,
                                    }}
                                >
                                    {preset.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Club Arena Tactile 3-Button Row (ControlThemeTokens.css + ActionPanel.css 1:1) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
                        <button
                            type="button"
                            className="pa-btn"
                            disabled={actionsDisabled}
                            onClick={() => onQuickAction({ action: 'fold', amount: 0, label: 'Fold' })}
                            style={{
                                minHeight: 54,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 12,
                                border: '1px solid rgba(255, 255, 255, 0.22)',
                                background: 'linear-gradient(180deg, #f0524d 0%, #dc2626 42%, #7f1212 100%)',
                                boxShadow: '0 4px 0 #4c0a0a, 0 6px 16px rgba(220, 38, 38, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.28)',
                                color: '#FFFFFF',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                fontSize: 13,
                                cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                                opacity: actionsDisabled ? 0.45 : 1,
                            }}
                        >
                            <span>Fold</span>
                        </button>

                        <button
                            type="button"
                            className="pa-btn"
                            disabled={actionsDisabled}
                            onClick={() => onQuickAction(
                                callAmount > 0
                                    ? { action: 'call', amount: callAmount, label: `Call ${callAmount} BB` }
                                    : { action: 'check', amount: 0, label: 'Check' },
                            )}
                            style={{
                                minHeight: 54,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 12,
                                border: '1px solid rgba(255, 255, 255, 0.22)',
                                background: 'linear-gradient(180deg, #1587f8 0%, #0078ff 42%, #003a9e 100%)',
                                boxShadow: '0 4px 0 #002070, 0 6px 16px rgba(21, 135, 248, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.28)',
                                color: '#FFFFFF',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                fontSize: 13,
                                cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                                opacity: actionsDisabled ? 0.45 : 1,
                            }}
                        >
                            <span>{callAmount > 0 ? 'Call' : 'Check'}</span>
                            {callAmount > 0 && (
                                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.94, fontVariantNumeric: 'tabular-nums' }}>
                                    {callAmount} BB
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            className="pa-btn"
                            disabled={actionsDisabled}
                            onClick={() => onQuickAction({
                                action: isAllIn ? 'allin' : betVerb,
                                amount: betSize,
                                label: isAllIn ? `All-In ${betSize} BB` : `${betVerb === 'raise' ? 'Raise' : 'Bet'} ${betSize} BB`,
                            })}
                            style={{
                                minHeight: 54,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 12,
                                border: '1px solid rgba(255, 255, 255, 0.22)',
                                background: 'linear-gradient(180deg, #4dc660 0%, #3fb950 42%, #2ea043 100%)',
                                boxShadow: '0 4px 0 #063317, 0 6px 16px rgba(63, 185, 80, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.28)',
                                color: '#FFFFFF',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                fontSize: 13,
                                cursor: actionsDisabled ? 'not-allowed' : 'pointer',
                                opacity: actionsDisabled ? 0.45 : 1,
                            }}
                        >
                            <span>{isAllIn ? 'All-In' : (callAmount > 0 ? 'Raise' : 'Bet')}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.95, fontVariantNumeric: 'tabular-nums' }}>
                                {betSize % 1 === 0 ? betSize : betSize.toFixed(1)} BB
                            </span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
