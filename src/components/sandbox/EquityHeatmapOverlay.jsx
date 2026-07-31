/**
 * EQUITY HEATMAP OVERLAY (W7-2)
 * Board texture + range-advantage read-out drawn over its container.
 *
 * Three rules this file now honours:
 *  1. NO FABRICATED NUMBERS. When the Monte-Carlo engine has not produced an
 *     equity yet we show a prompt, never an invented "55.0%" in the same badge
 *     treatment as a real figure.
 *  2. It is a flex COLUMN, so it fits whatever height the parent gives it
 *     (sandbox.js mounts it in a 220px box; the old absolute offsets — texture
 *     at 50% + 100px, hero tag at bottom:120 — were clipped there).
 *  3. Per-seat equity only renders when per-seat equity actually exists;
 *     otherwise a single honest "Hero vs field" figure.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Layers } from 'lucide-react';
import { T, F, S, R, Z, numeric } from './paTokens';
import { usePrefersReducedMotion } from './paKit';

const IP_POSITIONS = ['BTN', 'CO'];

function boardToCards(board) {
    if (Array.isArray(board)) return board.filter(Boolean).map(String);
    if (board && typeof board === 'object') {
        return [...(board.flop || []), board.turn, board.river].filter(Boolean).map(String);
    }
    return [];
}

function normalizeEquity(equity) {
    // Accepts a raw number, or { heroEquity, villainEquity, villains: [] }
    if (typeof equity === 'number' && Number.isFinite(equity)) {
        return { hero: equity, villain: 100 - equity, perVillain: null };
    }
    if (equity && typeof equity === 'object') {
        const hero = Number(equity.heroEquity ?? equity.hero);
        if (Number.isFinite(hero)) {
            const villain = Number(equity.villainEquity ?? equity.villain);
            const per = Array.isArray(equity.villains) && equity.villains.length ? equity.villains : null;
            return {
                hero,
                villain: Number.isFinite(villain) ? villain : Math.max(0, 100 - hero),
                perVillain: per,
            };
        }
    }
    return null;
}

/**
 * Suit texture is a FLOP property — `suitCount === cards.length` can never be
 * true once there are 4+ cards, which used to label every turn "Mixed".
 */
function describeTexture(cards) {
    const ranks = cards.map(c => c[0]?.toUpperCase()).filter(Boolean);
    const flop = cards.slice(0, 3);
    const flopSuits = flop.map(c => c[1]?.toLowerCase()).filter(Boolean);
    const uniqueFlopSuits = new Set(flopSuits).size;
    const flopTag = uniqueFlopSuits === 1 ? 'Monotone' : uniqueFlopSuits === 2 ? 'Two-tone' : 'Rainbow';

    const suitCounts = {};
    cards.forEach(c => {
        const s = c[1]?.toLowerCase();
        if (s) suitCounts[s] = (suitCounts[s] || 0) + 1;
    });
    const maxSuit = Math.max(0, ...Object.values(suitCounts));

    let runoutNote = null;
    if (cards.length > 3) {
        if (maxSuit >= 4) runoutNote = 'flush possible';
        else if (uniqueFlopSuits === 3 && maxSuit === 2) runoutNote = 'backdoor suits live';
    }

    const hasAce = ranks.includes('A');
    const paired = new Set(ranks).size !== ranks.length;

    const head = `${hasAce ? 'A-high' : 'Dynamic'}${paired ? ' paired' : ''} ${flopTag.toLowerCase()} flop`;
    return { head, runoutNote, hasAce, paired, flopTag };
}

function heatColor(eq) {
    if (eq > 55) return 'rgba(34,197,94,0.35)';
    if (eq < 45) return 'rgba(239,68,68,0.35)';
    return 'rgba(251,191,36,0.28)';
}

function heatBorder(eq) {
    if (eq > 55) return 'rgba(34,197,94,0.6)';
    if (eq < 45) return 'rgba(239,68,68,0.6)';
    return 'rgba(251,191,36,0.6)';
}

export default function EquityHeatmapOverlay({ isVisible, board, heroPosition, villains, equity }) {
    const reduce = usePrefersReducedMotion();
    const cards = boardToCards(board);
    const show = !!isVisible && cards.length >= 3;

    const texture = describeTexture(cards);
    const real = normalizeEquity(equity);
    const activeVillains = (villains || []).filter(v => v && v.position);

    const perSeat = real?.perVillain && activeVillains.length
        ? activeVillains.map((v, i) => {
            const raw = real.perVillain[i];
            const val = Number(raw?.equity ?? raw);
            return Number.isFinite(val) ? { position: v.position, eq: val, id: v.id ?? i } : null;
        }).filter(Boolean)
        : [];

    const heroEq = real ? real.hero : null;
    const fieldEq = real ? real.villain : null;
    const heroHasAdvantage = real ? heroEq >= (perSeat.length ? Math.max(...perSeat.map(p => p.eq)) : fieldEq) : null;

    const motionProps = reduce
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
        : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    {...motionProps}
                    style={{
                        position: 'absolute', inset: 0, zIndex: Z.felt, pointerEvents: 'none',
                        background: 'radial-gradient(circle at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 100%)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        padding: S.md, gap: S.sm, boxSizing: 'border-box', overflow: 'hidden',
                    }}
                >
                    {/* ── Top: per-seat (or field) equity ─────────────────── */}
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                        gap: S.sm, width: '100%', minHeight: 0,
                    }}>
                        {real && perSeat.length > 0 && perSeat.map(p => (
                            <span key={p.id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: S.xs,
                                background: heatColor(p.eq), border: `1px solid ${heatBorder(p.eq)}`,
                                padding: `4px ${S.md}px`, borderRadius: R.pill,
                                fontSize: F.caption, fontWeight: 700, color: T.text, ...numeric,
                            }}>
                                {p.position} {p.eq.toFixed(1)}%
                            </span>
                        ))}
                        {real && perSeat.length === 0 && fieldEq != null && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: S.xs,
                                background: heatColor(fieldEq), border: `1px solid ${heatBorder(fieldEq)}`,
                                padding: `4px ${S.md}px`, borderRadius: R.pill,
                                fontSize: F.caption, fontWeight: 700, color: T.text, ...numeric,
                            }}>
                                Field {fieldEq.toFixed(1)}%
                            </span>
                        )}
                    </div>

                    {/* ── Middle: texture read-out ─────────────────────────── */}
                    <div style={{ textAlign: 'center', minWidth: 0, textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: S.sm,
                            fontSize: F.label, fontWeight: 800, color: T.text,
                            letterSpacing: 0.6, textTransform: 'uppercase',
                        }}>
                            <Layers size={18} strokeWidth={2} color={T.accent} />
                            {texture.head}
                        </div>
                        {texture.runoutNote && (
                            <div style={{ fontSize: F.caption, color: T.warn, marginTop: 2, fontWeight: 700 }}>
                                {texture.runoutNote}
                            </div>
                        )}
                        <div style={{ fontSize: F.caption, color: T.textMuted, marginTop: 4 }}>
                            {real
                                ? `Range advantage: ${heroHasAdvantage ? 'Hero' : 'Villain'} · ${IP_POSITIONS.includes(heroPosition) ? 'Hero IP' : 'Hero OOP'}`
                                : `${IP_POSITIONS.includes(heroPosition) ? 'Hero in position' : 'Hero out of position'}`}
                        </div>
                    </div>

                    {/* ── Bottom: hero equity, or an honest prompt ─────────── */}
                    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        {real ? (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: S.xs,
                                background: heatColor(heroEq), border: `1px solid ${heatBorder(heroEq)}`,
                                padding: `6px ${S.lg}px`, borderRadius: R.pill,
                                fontSize: F.bodySm, fontWeight: 800, color: T.text, ...numeric,
                            }}>
                                Hero {heroEq.toFixed(1)}%
                            </span>
                        ) : (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: S.xs,
                                background: 'rgba(0,0,0,0.55)', border: `1px solid ${T.borderHi}`,
                                padding: `6px ${S.md}px`, borderRadius: R.pill,
                                fontSize: F.caption, fontWeight: 700, color: T.textMuted,
                                textAlign: 'center', lineHeight: 1.35, maxWidth: '100%',
                            }}>
                                Pick hero cards to compute equity
                            </span>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
