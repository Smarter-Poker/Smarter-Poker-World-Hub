/**
 * SandboxPokerTable — Vertical Mobile-First Table Visual (v2.0)
 * 
 * Uses a cropped + rotated poker-table-vertical.png for portrait orientation.
 * Elliptical seat positions recalculated for vertical layout.
 * Community cards, pot, equity, and board texture all rendered ON the table felt.
 */
import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Long-press hook for card removal.
 * Returns a full prop bag INCLUDING onClick — the click handler swallows the
 * synthetic click that browsers dispatch right after a long-press so the deck
 * picker never opens immediately after a card was removed.
 * NOTE: we deliberately do NOT call e.preventDefault() in onTouchStart — React
 * attaches touchstart passively at the root, so it is a no-op that only logs
 * "Unable to preventDefault inside passive event listener". Selection artifacts
 * are suppressed with CSS (userSelect/touchCallout) + onContextMenu instead.
 */
function useLongPress(callback, { onClick, ms = 500 } = {}) {
    const timerRef = useRef(null);
    const firedRef = useRef(false);

    const clear = useCallback(() => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }, []);

    // Clear any pending long-press on unmount so the callback can never fire
    // with a stale index after the card has already been removed.
    useEffect(() => clear, [clear]);

    const onStart = useCallback(() => {
        firedRef.current = false;
        clear();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            firedRef.current = true;
            try { navigator.vibrate?.(20); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            callback?.();
        }, ms);
    }, [callback, ms, clear]);

    const onEnd = useCallback(() => { clear(); }, [clear]);

    const handleClick = useCallback((e) => {
        if (firedRef.current) {
            firedRef.current = false;
            e?.preventDefault?.();
            e?.stopPropagation?.();
            return;
        }
        onClick?.(e);
    }, [onClick]);

    const onContextMenu = useCallback((e) => { e?.preventDefault?.(); }, []);

    return {
        onTouchStart: onStart, onTouchEnd: onEnd, onTouchCancel: onEnd,
        onMouseDown: onStart, onMouseUp: onEnd, onMouseLeave: onEnd,
        onClick: handleClick, onContextMenu,
    };
}

const NO_SELECT = {
    userSelect: 'none', WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none', touchAction: 'manipulation',
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
        background: '#fff', borderRadius: 4,
        boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
        overflow: 'hidden', border: '1px solid #ddd',
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
            }} title={raw}>
                <span style={{ fontSize: Math.max(10, Math.round(h * 0.32)) }}>{rankChar || '?'}</span>
                <span style={{ fontSize: Math.max(8, Math.round(h * 0.22)) }}>{SUIT_LETTER[suitChar] || '?'}</span>
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
// SUBCOMPONENTS TO PREVENT CONDITIONAL HOOK VIOLATION
// ═══════════════════════════════════════════════════════════════════════════

function BoardCardItem({ card, i, onRemove, onTap }) {
    const handleRemove = useCallback(() => { onRemove?.(i); }, [onRemove, i]);
    const lp = useLongPress(handleRemove, { onClick: onTap });
    return (
        <motion.div
            {...lp}
            initial={{ y: -15, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 12, delay: i * 0.1 }}
            style={{ cursor: onTap ? 'pointer' : 'default', ...NO_SELECT }}
        >
            <TableCard card={card} style={{ width: 32, height: 45 }} />
        </motion.div>
    );
}

function HeroCardItem({ card, i, onRemove, onTap }) {
    const handleRemove = useCallback(() => { onRemove?.(i); }, [onRemove, i]);
    const lp = useLongPress(handleRemove, { onClick: onTap });
    return (
        <motion.div
            {...lp}
            initial={{ y: 20, opacity: 0, rotateY: 90 }}
            animate={{ y: 0, opacity: 1, rotateY: 0, rotate: i === 0 ? -5 : 5 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 + i * 0.12 }}
            style={{ marginLeft: i > 0 ? -6 : 0, cursor: 'pointer', perspective: 800, ...NO_SELECT }}
        >
            <TableCard card={card} style={{ width: 34, height: 48 }} />
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATIC TABLE ASSETS (module scope — never rebuilt per render)
// ═══════════════════════════════════════════════════════════════════════════

// Deterministic avatar assignment for sandbox seats
const SANDBOX_AVATARS = [
    '/avatars/table/free_fox.png',       // Hero
    '/avatars/table/free_shark.png',
    '/avatars/table/free_ninja.png',
    '/avatars/table/free_viking.png',
    '/avatars/table/free_lion.png',
    '/avatars/table/free_owl.png',
    '/avatars/table/free_samurai.png',
    '/avatars/table/free_pirate.png',
    '/avatars/table/free_cowboy.png',
    '/avatars/table/free_knight.png',
];

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
    onTapHeroCards,
    onTapBoard,
    onReset,
    onRemoveHeroCard,
    onRemoveBoardCard,
    // Swipe gesture handlers
    onSwipeLeft,
    onSwipeRight,
}) {
    const totalSeats = 1 + villains.length;
    const maxSeats = Math.max(totalSeats, 2);
    const { seatPositions } = useMemo(() => computeVerticalSeatPositions(maxSeats), [maxSeats]);

    // Build seat array: hero at index 0, then villains
    const seatArr = useMemo(() => [
        { name: heroPosition, stack: Number(heroStack) || 0, isHero: true },
        ...villains.map((v, i) => ({
            name: v.position || `V${i + 1}`,
            stack: Number(v.stack) || 100,
            archetype: v.archetype?.name || 'Opponent',
            isHero: false,
        })),
    ], [heroPosition, heroStack, villains]);

    const avatarSize = 44;

    const streetLabel = String(street || 'flop');
    const potValue = Number(pot) || 0;
    const equityValue = Number(equity);
    const hasEquity = equity != null && Number.isFinite(equityValue);

    // Swipe gesture tracking for street navigation.
    // Pointer events so mouse drag works on desktop as well as touch.
    const pointerStartRef = useRef(null);
    const handlePointerDown = useCallback((e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) { pointerStartRef.current = null; return; }
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
    }, []);
    const handlePointerUp = useCallback((e) => {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            try { navigator.vibrate?.(10); } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
            if (dx < 0) onSwipeLeft?.();
            else onSwipeRight?.();
        }
    }, [onSwipeLeft, onSwipeRight]);
    const handlePointerCancel = useCallback(() => { pointerStartRef.current = null; }, []);

    return (
        <div
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: 280,
                margin: '0 auto',
                aspectRatio: '341 / 609',
                overflow: 'visible',
            }}>
            {/* Poker table — official Smarter.Poker brand table (same as Commander tablets) */}
            <img
                src="/images/poker-table-black-gold-nobg.png"
                alt="Poker Table"
                style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: 'contain', pointerEvents: 'none', zIndex: 0,
                }}
                loading="lazy"
            />

            {/* Quick Reset Button — top-right corner */}
            {onReset && (
                <motion.button
                    onClick={() => { try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); } onReset(); }}
                    whileTap={{ scale: 0.85, rotate: -90 }}
                    style={{
                        position: 'absolute', top: 6, right: 6, zIndex: 20,
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(36,37,38,0.85)', border: '1px solid #3A3B3C',
                        color: '#B0B3B8', fontSize: 14, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', backdropFilter: 'blur(4px)',
                        touchAction: 'manipulation',
                    }}
                    aria-label="Reset hand"
                >↻</motion.button>
            )}

            {/* Center info on the table felt — positioned BELOW the community card row (38%) */}
            <div style={{
                position: 'absolute', top: '62%', left: '50%',
                transform: 'translate(-50%, -50%)', zIndex: 5, textAlign: 'center',
            }}>
                {/* Pot Display */}
                <div style={{
                    fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,0.9)',
                    letterSpacing: 0.5, marginBottom: 2,
                    textShadow: '0 1px 6px rgba(0,0,0,0.7)',
                }}>
                    Pot {potValue.toFixed(1)} BB
                </div>

                {/* Street Label */}
                <div style={{
                    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
                    textTransform: 'uppercase', letterSpacing: 1.5,
                }}>
                    {streetLabel.charAt(0).toUpperCase() + streetLabel.slice(1)}
                </div>

                {/* Equity on felt */}
                {hasEquity && (
                    <div style={{
                        marginTop: 4, fontSize: 11, fontWeight: 700,
                        color: equityValue >= 50 ? '#4ade80' : '#fbbf24',
                        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    }}>
                        {equityValue.toFixed(1)}% equity
                    </div>
                )}

                {/* Branding */}
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', marginTop: 3 }}>
                    Smarter.Poker
                </div>
            </div>

            {/* Community Cards — centered above pot, long-press to remove */}
            {communityCards.length > 0 && (
                <div
                    style={{
                        position: 'absolute', top: '38%', left: '50%',
                        transform: 'translateX(-50%)', display: 'flex', gap: 2, zIndex: 10,
                    }}
                >
                    {communityCards.map((card, i) => (
                        <BoardCardItem
                            key={card || i}
                            card={card}
                            i={i}
                            onRemove={onRemoveBoardCard}
                            onTap={onTapBoard}
                        />
                    ))}
                </div>
            )}

            {/* Empty board slots — tappable to open deck */}
            {communityCards.length === 0 && onTapBoard && (
                <div
                    onClick={onTapBoard}
                    style={{
                        position: 'absolute', top: '38%', left: '50%',
                        transform: 'translateX(-50%)', display: 'flex', gap: 3, zIndex: 10,
                        cursor: 'pointer',
                    }}
                >
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{
                            width: 30, height: 42, borderRadius: 3,
                            border: '1.5px dashed rgba(255,255,255,0.2)',
                            background: 'rgba(255,255,255,0.03)',
                        }} />
                    ))}
                </div>
            )}

            {/* Board Texture Badge */}
            {boardTexture && (
                <div style={{
                    position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
                    padding: '2px 6px', borderRadius: 4, fontSize: 7, fontWeight: 700, zIndex: 10,
                    background: boardTexture.color || 'rgba(59,130,246,0.2)',
                    color: boardTexture.textColor || '#4599FF',
                    border: `1px solid ${boardTexture.textColor || '#2374E1'}44`,
                    whiteSpace: 'nowrap',
                }}>
                    {boardTexture.label}
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
                    <motion.div key={idx}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        style={{
                            position: 'absolute', top: pos.top, left: pos.left,
                            transform: badgeTransform, zIndex: 2,
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(36,37,38,0.95)',
                            borderRadius: 8,
                            padding: '3px 6px 3px 3px',
                            border: `2px solid ${seat.isHero ? 'rgba(35,116,225,0.7)' : '#3A3B3C'}`,
                            backdropFilter: 'blur(6px)',
                            minWidth: 50,
                        }}>
                        {/* Avatar image */}
                        <div style={{
                            width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0,
                            overflow: 'hidden',
                            border: `2px solid ${seat.isHero ? '#2374E1' : 'rgba(255,255,255,0.15)'}`,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                            background: 'rgba(0,0,0,0.3)',
                        }}>
                            <img
                                src={SANDBOX_AVATARS[idx % SANDBOX_AVATARS.length]}
                                alt={seat.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        </div>
                        {/* Name + Stack */}
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{
                                fontSize: 10, fontWeight: 600, lineHeight: 1.2,
                                color: seat.isHero ? '#4599FF' : '#E4E6EB',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                maxWidth: 65,
                            }}>
                                {seat.isHero ? `You (${seat.name})` : seat.name}
                            </div>
                            <div style={{
                                fontSize: 9, fontWeight: 700, color: '#B0B3B8', lineHeight: 1.2,
                            }}>
                                {Number(seat.stack) || 0} BB
                            </div>
                            {!seat.isHero && seat.archetype && (
                                <div style={{
                                    fontSize: 7, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.3)', lineHeight: 1.2,
                                }}>
                                    {seat.archetype}
                                </div>
                            )}
                        </div>
                    </motion.div>
                );
            })}

            {/* Hero Cards — positioned near hero seat (bottom), long-press to remove */}
            {heroCards.length > 0 && seatPositions.length > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: `calc(${seatPositions[0].top} - 50px)`,
                        left: seatPositions[0].left,
                        transform: 'translateX(-50%)',
                        display: 'flex', zIndex: 150,
                    }}
                >
                    {heroCards.map((card, i) => (
                        <HeroCardItem
                            key={card || i}
                            card={card}
                            i={i}
                            onRemove={onRemoveHeroCard}
                            onTap={onTapHeroCards}
                        />
                    ))}
                </div>
            )}

            {/* Empty hero card slots — tappable */}
            {heroCards.length === 0 && onTapHeroCards && (
                <div
                    onClick={onTapHeroCards}
                    style={{
                        position: 'absolute',
                        top: `calc(${seatPositions[0]?.top || '85%'} - 50px)`,
                        left: seatPositions[0]?.left || '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex', gap: 3, zIndex: 150,
                        cursor: 'pointer',
                    }}
                >
                    {[0, 1].map(i => (
                        <div key={i} style={{
                            width: 32, height: 45, borderRadius: 4,
                            border: '2px dashed rgba(35,116,225,0.4)',
                            background: 'rgba(35,116,225,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: 'rgba(35,116,225,0.5)', fontWeight: 700,
                        }}>
                            ?
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
