/**
 * EQUITY HEATMAP OVERLAY (W7-2)
 * Visualizes range advantage directly on the Sandbox Felt.
 * Numbers come from the sandbox equity state (Monte-Carlo EquityEngine); the
 * heuristic fallback is only used when no equity has been computed yet and is
 * labelled as an estimate.
 */
import { motion, AnimatePresence } from 'framer-motion';

const IP_POSITIONS = ['BTN', 'CO'];

function boardToCards(board) {
    if (Array.isArray(board)) return board.filter(Boolean);
    if (board && typeof board === 'object') {
        return [...(board.flop || []), board.turn, board.river].filter(Boolean);
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
            return {
                hero,
                villain: Number.isFinite(villain) ? villain : Math.max(0, 100 - hero),
                perVillain: Array.isArray(equity.villains) ? equity.villains : null,
            };
        }
    }
    return null;
}

export default function EquityHeatmapOverlay({ isVisible, board, heroPosition, villains, equity }) {
    const cards = boardToCards(board);
    const show = !!isVisible && cards.length >= 3;

    const ranks = cards.map(c => String(c)[0]);
    const suits = cards.map(c => String(c)[1]);
    const hasAce = ranks.includes('A');
    const isPaired = new Set(ranks).size !== ranks.length;
    const suitCount = new Set(suits).size;
    const isMono = suitCount === 1;
    const isTwoTone = suitCount === 2;
    const isRainbow = suitCount === cards.length;
    const textureSuitTag = isMono ? 'Monotone' : isTwoTone ? 'Two-tone' : isRainbow ? 'Rainbow' : 'Mixed';

    const real = normalizeEquity(equity);
    const activeVillains = (villains || []).filter(v => v && v.position);

    // Fallback heuristic (clearly flagged) when the engine hasn't produced a
    // number yet — never presented as a solver figure.
    let heroEq;
    if (real) {
        heroEq = real.hero;
    } else {
        heroEq = 50;
        if (IP_POSITIONS.includes(heroPosition)) heroEq += 5;
        if (hasAce) heroEq += 3;
        if (isPaired && (heroPosition === 'BB' || heroPosition === 'SB')) heroEq += 4;
    }

    const villainEq = (i) => {
        if (real?.perVillain && Number.isFinite(Number(real.perVillain[i]?.equity ?? real.perVillain[i]))) {
            return Number(real.perVillain[i]?.equity ?? real.perVillain[i]);
        }
        if (real) return real.villain;           // heads-up equity vs hero
        return (100 - heroEq) / (activeVillains.length || 1);
    };

    const maxVillainEq = activeVillains.length
        ? Math.max(...activeVillains.map((_, i) => villainEq(i)))
        : (real ? real.villain : 100 - heroEq);

    const heroHasAdvantage = heroEq >= maxVillainEq;

    const getHeatColor = (eq) => {
        if (eq > 55) return 'rgba(34, 197, 94, 0.4)';  // Green (Advantage)
        if (eq < 45) return 'rgba(239, 68, 68, 0.4)';  // Red (Disadvantage)
        return 'rgba(245, 166, 35, 0.3)';              // Gold (Neutral/Marginal)
    };

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{
                        position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
                        background: 'radial-gradient(circle at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)'
                    }}
                >
                    {/* Board Texture Overlay */}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', marginTop: 100, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>
                            Texture: {hasAce ? 'A-High' : 'Dynamic'}{isPaired ? ' Paired' : ''} {textureSuitTag}
                        </div>
                        <div style={{ fontSize: 11, color: '#B0B3B8', marginTop: 4 }}>
                            Range Advantage: {heroHasAdvantage ? 'Hero' : 'Villain'}
                            {' '}({IP_POSITIONS.includes(heroPosition) ? 'Hero IP' : 'Hero OOP'})
                        </div>
                        {!real && (
                            <div style={{ fontSize: 9, color: '#F5A623', marginTop: 3 }}>
                                Estimate — pick hero cards to run the equity engine
                            </div>
                        )}
                    </div>

                    {/* Hero Heatmap Tag */}
                    <div style={{ position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)', background: getHeatColor(heroEq), padding: '6px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}>
                        <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>Hero Eq: {heroEq.toFixed(1)}%</span>
                    </div>

                    {/* Villain Heatmap Tags - Positioning around the table top */}
                    <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 20 }}>
                        {activeVillains.map((v, i) => {
                            const eq = villainEq(i);
                            return (
                                <div key={v.id ?? i} style={{ background: getHeatColor(eq), padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}>
                                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{v.position} Eq: {eq.toFixed(1)}%</span>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
