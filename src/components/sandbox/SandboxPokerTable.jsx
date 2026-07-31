/**
 * SandboxPokerTable — Vertical Mobile-First Table Visual (v3.0)
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

/* ═══════════════════════════════════════════════════════════════════════
   LONG PRESS — with movement cancellation + pending feedback
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

// Red suits for the text fallback
const RED_SUITS = { h: true, d: true };
const SUIT_LETTER = { s: 'S', h: 'H', d: 'D', c: 'C' };

export function TableCard({ card, style = {} }) {
    const [imgFailed, setImgFailed] = useState(false);
    const raw = typeof card === 'string' ? card.trim() : '';

    // Reset the failure flag whenever the card itself changes
    useEffect(() => { setImgFailed(false); }, [raw]);

    if (!raw) return null;

    const rankChar = raw[0]?.toUpperCase();
    const suitChar = raw[raw.length - 1]?.toLowerCase();
    const suitName = SUIT_MAP[suitChar];
    const rankName = RANK_MAP[rankChar];
    const isRed = !!RED_SUITS[suitChar];
    const showFallback = imgFailed || !suitName || !rankName;

    const wrapperStyle = {
        width: 40, height: 56,
        background: '#fff', borderRadius: R.sm,
        boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
        overflow: 'hidden', border: '1px solid #ddd',
        boxSizing: 'border-box',
        ...style,
    };

    if (showFallback) {
        const h = Number(wrapperStyle.height) || 56;
        return (
            <div style={{
                ...wrapperStyle,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: isRed ? '#d32029' : '#1a1a1a',
                fontWeight: 800, lineHeight: 1,
                fontFamily: "'Inter',-apple-system,sans-serif",
            }} aria-label={raw}>
                <span style={{ fontSize: Math.max(12, Math.round(h * 0.32)) }}>{rankChar || '?'}</span>
                <span style={{ fontSize: Math.max(12, Math.round(h * 0.24)) }}>{SUIT_LETTER[suitChar] || '?'}</span>
            </div>
        );
    }

    const imagePath = `/cards/${suitName}_${rankName}.png`;
    return (
        <div style={wrapperStyle}>
            <img
                src={imagePath}
                alt={raw}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={() => setImgFailed(true)}
                decoding="async"
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VERTICAL SEAT POSITIONS — Recalculated for portrait layout
// ═══════════════════════════════════════════════════════════════════════════

function computeVerticalSeatPositions(maxSeats) {
    // Vertical oval — taller than wide, matching poker-table-black-gold.png
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
                position: 'absolute', top: -8, right: -8, zIndex: 2,
                width: Math.max(22, size), height: Math.max(22, size), borderRadius: '50%',
                background: T.danger, border: '2px solid #18191A', color: '#fff',
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
// STATIC TABLE ASSETS (module scope — never rebuilt per render)
// ═══════════════════════════════════════════════════════════════════════════

// Deterministic avatar assignment for sandbox seats (max table = hero + 5)
const SANDBOX_AVATARS = [
    '/avatars/table/free_fox.png',       // Hero
    '/avatars/table/free_shark.png',
    '/avatars/table/free_ninja.png',
    '/avatars/table/free_viking.png',
    '/avatars/table/free_lion.png',
    '/avatars/table/free_owl.png',
];

const BASE_WIDTH = 300;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TABLE — Vertical portrait orientation
// ═══════════════════════════════════════════════════════════════════════════

export default function SandboxPokerTable({
    heroCards = [],
    communityCards = [],
    pot = 0,
    heroPosition = 'BTN',
    heroStack = 100,
    villains = [],
    street = 'flop',
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
        background: 'rgba(36,37,38,0.9)', border: `1px solid ${T.border}`,
        color: T.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
        ...extra,
    });

    const hasAnyCard = heroCards.length > 0 || communityCards.length > 0;

    return (
        <div
            ref={rootRef}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostCapture}
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: 'min(100%, 380px)',
                margin: '0 auto',
                aspectRatio: '341 / 609',
                overflow: 'visible',
                // Nothing inside the felt may ever paint over a page overlay.
                zIndex: 0,
                isolation: 'isolate',
                touchAction: 'pan-y',
                background: 'radial-gradient(ellipse at 50% 45%, #1f2a24 0%, #18191A 70%)',
                borderRadius: R.lg,
            }}>
            <style>{`
                @keyframes paCardHold { from { transform: scale(1); opacity: .35 } to { transform: scale(1.06); opacity: 1 } }
                @media (prefers-reduced-motion: reduce) {
                    @keyframes paCardHold { from { opacity: 1 } to { opacity: 1 } }
                }
            `}</style>

            {/* Poker table — official Smarter.Poker brand table.
                This is the LCP element on a cold mobile load, so it is eager. */}
            <img
                src="/images/poker-table-black-gold-nobg.png"
                alt=""
                aria-hidden="true"
                style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                }}
                loading="eager"
                fetchpriority="high"
                decoding="async"
            />

            {/* Reset — 44x44, lucide glyph, excluded from the swipe surface */}
            {onReset && (
                <button
                    type="button"
                    data-no-swipe="true"
                    onClick={() => { try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onReset(); }}
                    style={cornerBtn({ top: 2, right: 2 })}
                    aria-label="Reset hand"
                >
                    <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
                </button>
            )}

            {/* Edit mode — replaces the undiscoverable long-press with an
                explicit toggle that puts a delete badge on every card. */}
            {hasAnyCard && (onRemoveHeroCard || onRemoveBoardCard) && (
                <button
                    type="button"
                    data-no-swipe="true"
                    onClick={() => { setEditMode(v => !v); try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } }}
                    aria-pressed={editMode}
                    aria-label={editMode ? 'Done editing cards' : 'Edit cards'}
                    style={cornerBtn({
                        top: 2, left: 2,
                        color: editMode ? T.accent : T.textMuted,
                        borderColor: editMode ? T.accent : T.border,
                    })}
                >
                    {editMode
                        ? <Check size={18} strokeWidth={2.5} aria-hidden="true" />
                        : <Pencil size={18} strokeWidth={2} aria-hidden="true" />}
                </button>
            )}

            {/* Board texture badge — opt-in only; the page renders it as a chip
                above the table where it has room to be legible. */}
            {showTextureBadge && boardTexture && (
                <div style={{
                    position: 'absolute', top: '13%', left: '50%', transform: 'translateX(-50%)',
                    padding: '3px 8px', borderRadius: R.sm, fontSize: 12, fontWeight: 700, zIndex: Z.felt,
                    background: boardTexture.color || 'rgba(69,153,255,0.2)',
                    color: boardTexture.textColor || T.accent,
                    border: `1px solid ${boardTexture.textColor || T.accentPress}44`,
                    whiteSpace: 'nowrap', maxWidth: '86%', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {boardTexture.label}
                </div>
            )}

            {/* Community Cards — 34% leaves vertical breathing room under the
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

            {/* Center info — moved from 62% to 55% so it clears the hero cards */}
            <div style={{
                position: 'absolute', top: '55%', left: '50%',
                transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
                width: '80%',
            }}>
                <div style={{
                    fontSize: fs(16, 14), fontWeight: 800, color: 'rgba(255,255,255,0.92)',
                    letterSpacing: 0.4, marginBottom: 2, lineHeight: 1.2,
                    fontVariantNumeric: 'tabular-nums',
                    textShadow: '0 1px 6px rgba(0,0,0,0.7)',
                }}>
                    Pot {potValue.toFixed(1)} BB
                </div>

                <div style={{
                    fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
                    textTransform: 'uppercase', letterSpacing: 1.2, lineHeight: 1.2,
                }}>
                    {streetLabel.charAt(0).toUpperCase() + streetLabel.slice(1)}
                    {spr != null && Number.isFinite(Number(spr)) && (
                        <span style={{ color: T.accent, marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                            SPR {spr}
                        </span>
                    )}
                </div>

                {hasEquity && (
                    <div style={{
                        marginTop: 4, fontSize: 13, fontWeight: 700, lineHeight: 1.2,
                        color: equityValue >= 50 ? T.success : T.warn,
                        fontVariantNumeric: 'tabular-nums',
                        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    }}>
                        {equityValue.toFixed(1)}% equity
                    </div>
                )}
                {hasEquity && equityLabel && (
                    <div style={{
                        fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {equityLabel}
                    </div>
                )}
            </div>

            {/* Swipe affordance — the gesture is otherwise invisible */}
            {showDealHint && (
                <div style={{
                    position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)',
                    zIndex: Z.felt, padding: '4px 10px', borderRadius: R.pill,
                    background: 'rgba(24,25,26,0.8)', border: `1px solid ${T.border}`,
                    color: T.textMuted, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                }}>
                    Swipe left to deal · right to undo
                </div>
            )}

            {/* Seat badges */}
            {seatArr.slice(0, seatPositions.length).map((seat, idx) => {
                const pos = seatPositions[idx];
                const leftPct = parseFloat(pos.left);
                const isLeftSide = leftPct < 25;
                const isRightSide = leftPct > 75;

                let badgeTransform = 'translate(-50%, -50%)';
                if (isLeftSide) badgeTransform = 'translate(-10px, -50%)';
                else if (isRightSide) badgeTransform = 'translate(calc(-100% + 10px), -50%)';

                return (
                    <motion.div key={`${seat.name}-${idx}`}
                        initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                        animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                        transition={reduce ? { duration: 0 } : { delay: idx * 0.05 }}
                        style={{
                            position: 'absolute', top: pos.top, left: pos.left,
                            transform: badgeTransform, zIndex: 2,
                            display: 'flex', alignItems: 'center', gap: compact ? 0 : 5,
                            background: 'rgba(36,37,38,0.95)',
                            borderRadius: R.sm,
                            padding: compact ? 2 : '3px 6px 3px 3px',
                            border: `2px solid ${seat.isHero ? 'rgba(69,153,255,0.7)' : T.border}`,
                            WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)',
                            maxWidth: Math.round(tw * 0.52),
                        }}>
                        <div style={{
                            width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0,
                            overflow: 'hidden',
                            border: `2px solid ${seat.isHero ? T.accentPress : 'rgba(255,255,255,0.15)'}`,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                            background: 'rgba(0,0,0,0.3)',
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
                                    fontSize: 12, fontWeight: 700, lineHeight: 1.2,
                                    color: seat.isHero ? T.accent : T.text,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    maxWidth: Math.round(tw * 0.32),
                                }}>
                                    {seat.isHero ? `You (${seat.name})` : seat.name}
                                </div>
                                <div style={{
                                    fontSize: 12, fontWeight: 700, color: T.textMuted, lineHeight: 1.2,
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {Number(seat.stack) || 0} BB
                                </div>
                                {!seat.isHero && seat.archetype && !compact && tw >= 280 && (
                                    <div style={{
                                        fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
                                        lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap', maxWidth: Math.round(tw * 0.32),
                                    }}>
                                        {seat.archetype}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                );
            })}

            {/* Hero Cards — offset expressed as a PERCENTAGE of table height so
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
                            border: `2px dashed rgba(69,153,255,0.45)`,
                            background: 'rgba(69,153,255,0.06)',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, color: 'rgba(69,153,255,0.7)', fontWeight: 800,
                        }}>
                            ?
                        </span>
                    ))}
                </button>
            ) : null}
        </div>
    );
}
