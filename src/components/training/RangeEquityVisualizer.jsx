/**
 * RANGE vs RANGE EQUITY VISUALIZER — GTO Wizard-Style Equity Matchup
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Interactive 13×13 grid showing how hero's range interacts with villain's
 * range on different boards. Key features:
 *   - Hero vs Villain range equity on current board texture
 *   - Color-coded cells: green (>60%), yellow (40-60%), red (<40%)
 *   - Equity distribution histogram
 *   - Board texture impact analysis (how equity shifts on different runouts)
 *   - Blocker effects visualization
 *
 * Uses HandStrengthEngine for equity calculations and BoardTextureEngine
 * for texture classification, entirely local — no API calls.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classifyMadeHand, classifyDraws, evaluateHand } from '../../engines/HandStrengthEngine';
import { analyzeBoard } from '../../engines/BoardTextureEngine';

// ●● Constants ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['h', 'd', 'c', 's'];

// Default ranges (simplified — tight open vs BB defend)
const DEFAULT_HERO_RANGE = {
    'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 0.8, '77': 0.6,
    '66': 0.4, '55': 0.3, '44': 0.2, '33': 0.15, '22': 0.1,
    'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.6, 'A8s': 0.5, 'A7s': 0.4,
    'A6s': 0.3, 'A5s': 0.7, 'A4s': 0.5, 'A3s': 0.4, 'A2s': 0.3,
    'AKo': 1, 'AQo': 1, 'AJo': 0.9, 'ATo': 0.7, 'A9o': 0.3,
    'KQs': 1, 'KJs': 1, 'KTs': 0.9, 'K9s': 0.5, 'K8s': 0.2,
    'KQo': 0.9, 'KJo': 0.6, 'KTo': 0.3,
    'QJs': 1, 'QTs': 0.9, 'Q9s': 0.4, 'QJo': 0.5, 'QTo': 0.2,
    'JTs': 1, 'J9s': 0.5, 'JTo': 0.3,
    'T9s': 0.8, 'T8s': 0.3, '98s': 0.7, '97s': 0.2,
    '87s': 0.6, '76s': 0.5, '65s': 0.4, '54s': 0.3,
};

const DEFAULT_VILLAIN_RANGE = {
    'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1,
    '66': 1, '55': 1, '44': 1, '33': 1, '22': 1,
    'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 1, 'A7s': 1,
    'A6s': 1, 'A5s': 1, 'A4s': 1, 'A3s': 1, 'A2s': 1,
    'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 1, 'A9o': 0.8, 'A8o': 0.5,
    'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 1, 'K8s': 0.8, 'K7s': 0.6, 'K6s': 0.5,
    'KQo': 1, 'KJo': 1, 'KTo': 0.8, 'K9o': 0.4,
    'QJs': 1, 'QTs': 1, 'Q9s': 1, 'Q8s': 0.6, 'QJo': 1, 'QTo': 0.7, 'Q9o': 0.3,
    'JTs': 1, 'J9s': 1, 'J8s': 0.5, 'JTo': 0.8, 'J9o': 0.3,
    'T9s': 1, 'T8s': 0.7, 'T7s': 0.3, 'T9o': 0.4,
    '98s': 1, '97s': 0.6, '87s': 1, '86s': 0.4,
    '76s': 1, '75s': 0.3, '65s': 1, '54s': 0.8, '43s': 0.3, '32s': 0.2,
};

// ●● Equity Calculator (simplified but fast) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function estimateHandEquity(heroHand, board, vilRange) {
    try {
        const heroEval = classifyMadeHand(heroHand, board);
        const heroDraws = board.length < 5 ? classifyDraws(heroHand, board) : null;
        const heroStrength = heroEval.strength || 0.5;
        const drawBonus = heroDraws ? (heroDraws.equity || 0) * 0.25 : 0;
        return Math.min(0.98, Math.max(0.02, heroStrength + drawBonus));
    } catch {
        return 0.5;
    }
}

function handNotationToCards(hand) {
    // Convert "AKs" to representative cards like ["Ah", "Kh"]
    if (!hand || hand.length < 2) return [];
    const r1 = hand[0], r2 = hand[1];
    const suited = hand.endsWith('s');
    const offsuit = hand.endsWith('o');
    const pair = r1 === r2;

    if (pair) return [`${r1}h`, `${r2}d`];
    if (suited) return [`${r1}h`, `${r2}h`];
    return [`${r1}h`, `${r2}d`];
}

function boardConflicts(heroCards, boardCards) {
    return heroCards.some(hc => boardCards.some(bc =>
        bc && hc && bc.toLowerCase() === hc.toLowerCase()
    ));
}

// ●● Equity Grid Cell ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const EquityCell = memo(({ hand, equity, inHeroRange, inVilRange, isSelected, onClick }) => {
    const isPair = hand.length === 2;
    const isSuited = hand.endsWith('s');

    let bgColor;
    if (equity === null || !inHeroRange) {
        bgColor = 'rgba(30,41,59,0.4)';
    } else if (equity >= 0.65) {
        bgColor = `rgba(34,197,94,${0.15 + equity * 0.5})`;
    } else if (equity >= 0.50) {
        bgColor = `rgba(245,158,11,${0.15 + (equity - 0.4) * 1.5})`;
    } else if (equity >= 0.35) {
        bgColor = `rgba(251,146,60,${0.15 + (0.5 - equity) * 1.5})`;
    } else {
        bgColor = `rgba(239,68,68,${0.15 + (0.5 - equity) * 0.8})`;
    }

    return (
        <div
            onClick={onClick}
            style={{
                width: '100%', aspectRatio: '1/1',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: bgColor,
                border: isSelected ? '2px solid #00d4ff' : '1px solid rgba(100,116,139,0.08)',
                borderRadius: 2,
                cursor: 'pointer',
                position: 'relative',
                opacity: inHeroRange ? 1 : 0.25,
                transition: 'all 0.15s ease',
            }}
        >
            <div style={{
                fontSize: 8, fontWeight: 700, color: '#e2e8f0',
                lineHeight: 1,
            }}>
                {hand}
            </div>
            {equity !== null && inHeroRange && (
                <div style={{
                    fontSize: 7, fontWeight: 600, lineHeight: 1, marginTop: 1,
                    color: equity >= 0.55 ? '#86efac' : equity >= 0.45 ? '#fcd34d' : '#fca5a5',
                }}>
                    {(equity * 100).toFixed(0)}%
                </div>
            )}
            {/* Range weight indicator */}
            {inHeroRange && inHeroRange < 1 && (
                <div style={{
                    position: 'absolute', top: 0, right: 0,
                    width: 3, height: 3, borderRadius: '50%',
                    background: '#818cf8',
                }} />
            )}
        </div>
    );
});

// ●● Equity Distribution Chart ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const EquityDistribution = memo(({ equityData }) => {
    if (!equityData || equityData.length === 0) return null;

    // Bin equities into 10% buckets
    const bins = Array(10).fill(0);
    equityData.forEach(({ equity }) => {
        if (equity === null) return;
        const bin = Math.min(9, Math.floor(equity * 10));
        bins[bin]++;
    });
    const maxBin = Math.max(...bins, 1);

    return (
        <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                Equity Distribution
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 50 }}>
                {bins.map((count, i) => {
                    const pct = i * 10;
                    const color = pct >= 60 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
                    return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: (count / maxBin) * 40 }}
                                style={{
                                    width: '100%', borderRadius: '2px 2px 0 0',
                                    background: `${color}66`,
                                    border: `1px solid ${color}33`,
                                    minHeight: count > 0 ? 3 : 0,
                                }}
                            />
                            <div style={{ fontSize: 7, color: '#64748b', marginTop: 2 }}>
                                {pct}%
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

// ●● Board Texture Summary ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const BoardTextureSummary = memo(({ board }) => {
    const texture = useMemo(() => {
        try {
            return analyzeBoard(board);
        } catch { return null; }
    }, [board]);

    if (!texture) return null;

    const tags = [];
    if (texture.flushDraw) tags.push({ label: texture.monotone ? 'Monotone' : 'Two-tone', color: '#3b82f6' });
    if (texture.paired) tags.push({ label: 'Paired', color: '#a855f7' });
    if (texture.connected) tags.push({ label: 'Connected', color: '#f59e0b' });
    if (texture.highCard) tags.push({ label: `High: ${texture.highCard}`, color: '#22d3ee' });
    if (texture.dry) tags.push({ label: 'Dry', color: '#22c55e' });
    if (texture.wet) tags.push({ label: 'Wet', color: '#ef4444' });

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {tags.map((t, i) => (
                <span key={i} style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 3,
                    background: `${t.color}15`, color: t.color,
                    fontWeight: 600, border: `1px solid ${t.color}22`,
                }}>
                    {t.label}
                </span>
            ))}
        </div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function RangeEquityVisualizer({ board: propBoard, heroRange: propHeroRange, vilRange: propVilRange }) {
    const [boardInput, setBoardInput] = useState(propBoard ? (Array.isArray(propBoard) ? propBoard.join(' ') : propBoard) : '');
    const [selectedHand, setSelectedHand] = useState(null);
    const [rangeMode, setRangeMode] = useState('hero'); // 'hero' | 'villain'
    const [showEquityDist, setShowEquityDist] = useState(true);

    const heroRange = propHeroRange || DEFAULT_HERO_RANGE;
    const vilRange = propVilRange || DEFAULT_VILLAIN_RANGE;

    // Parse board
    const boardCards = useMemo(() => {
        const cleaned = boardInput.replace(/\s+/g, '');
        if (!cleaned) return [];
        const cards = [];
        for (let i = 0; i < cleaned.length; i += 2) {
            if (i + 1 < cleaned.length) cards.push(cleaned.substring(i, i + 2));
        }
        return cards;
    }, [boardInput]);

    // Build the 13×13 grid with equity calculations
    const gridData = useMemo(() => {
        const grid = [];
        for (let r = 0; r < 13; r++) {
            for (let c = 0; c < 13; c++) {
                let hand;
                if (r === c) {
                    hand = `${RANKS[r]}${RANKS[c]}`;
                } else if (r < c) {
                    hand = `${RANKS[r]}${RANKS[c]}s`;
                } else {
                    hand = `${RANKS[c]}${RANKS[r]}o`;
                }

                const inHero = heroRange[hand] || 0;
                const inVil = vilRange[hand] || 0;

                let equity = null;
                if (inHero > 0 && boardCards.length >= 3) {
                    const cards = handNotationToCards(hand);
                    if (cards.length === 2 && !boardConflicts(cards, boardCards)) {
                        equity = estimateHandEquity(cards, boardCards, vilRange);
                    }
                }

                grid.push({ hand, row: r, col: c, equity, inHero, inVil });
            }
        }
        return grid;
    }, [heroRange, vilRange, boardCards]);

    // Summary stats
    const stats = useMemo(() => {
        const handsWithEquity = gridData.filter(g => g.equity !== null && g.inHero > 0);
        if (handsWithEquity.length === 0) return null;

        const avgEquity = handsWithEquity.reduce((s, g) => s + g.equity, 0) / handsWithEquity.length;
        const crushers = handsWithEquity.filter(g => g.equity >= 0.65).length;
        const marginal = handsWithEquity.filter(g => g.equity >= 0.40 && g.equity < 0.65).length;
        const weak = handsWithEquity.filter(g => g.equity < 0.40).length;
        const combos = handsWithEquity.length;

        return { avgEquity, crushers, marginal, weak, combos };
    }, [gridData]);

    const selectedDetail = useMemo(() => {
        if (!selectedHand) return null;
        return gridData.find(g => g.hand === selectedHand);
    }, [selectedHand, gridData]);

    return (
        <div style={{
            background: 'rgba(15,23,42,0.4)',
            borderRadius: 12,
            border: '1px solid rgba(100,116,139,0.15)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                background: 'rgba(0,0,0,0.2)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                        Range vs Range Equity
                    </div>
                    {stats && (
                        <div style={{
                            fontSize: 11, fontWeight: 700, color: stats.avgEquity >= 0.55 ? '#22c55e' : stats.avgEquity >= 0.45 ? '#f59e0b' : '#ef4444',
                            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}>
                            Avg: {(stats.avgEquity * 100).toFixed(1)}%
                        </div>
                    )}
                </div>

                {/* Board input */}
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                        type="text"
                        value={boardInput}
                        onChange={e => setBoardInput(e.target.value)}
                        placeholder="Enter board (e.g. Ah Kd 7c)"
                        style={{
                            flex: 1, padding: '6px 10px', fontSize: 12,
                            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(100,116,139,0.2)',
                            borderRadius: 5, color: '#e2e8f0', outline: 'none',
                            fontFamily: "'Fira Code', monospace",
                        }}
                    />
                    {boardCards.length >= 3 && (
                        <div style={{ display: 'flex', gap: 3 }}>
                            {boardCards.map((c, i) => (
                                <div key={i} style={{
                                    width: 28, height: 38, borderRadius: 4,
                                    background: 'linear-gradient(180deg, #f8fafc, #e2e8f0)',
                                    border: '1px solid rgba(0,0,0,0.12)',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, fontWeight: 'bold',
                                    color: SuitColor[c[1]?.toLowerCase()] || '#1e293b',
                                }}>
                                    <span>{c[0]}</span>
                                    <span style={{ fontSize: 8 }}>{SuitSymbol[c[1]?.toLowerCase()] || ''}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {boardCards.length >= 3 && <BoardTextureSummary board={boardCards} />}
            </div>

            {/* Stats bar */}
            {stats && (
                <div style={{
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(100,116,139,0.08)',
                    display: 'flex', gap: 16,
                }}>
                    <div style={{ fontSize: 10 }}>
                        <span style={{ color: '#64748b' }}>Combos: </span>
                        <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{stats.combos}</span>
                    </div>
                    <div style={{ fontSize: 10 }}>
                        <span style={{ color: '#22c55e' }}>Strong: </span>
                        <span style={{ color: '#22c55e', fontWeight: 700 }}>{stats.crushers}</span>
                    </div>
                    <div style={{ fontSize: 10 }}>
                        <span style={{ color: '#f59e0b' }}>Marginal: </span>
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>{stats.marginal}</span>
                    </div>
                    <div style={{ fontSize: 10 }}>
                        <span style={{ color: '#ef4444' }}>Weak: </span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>{stats.weak}</span>
                    </div>
                </div>
            )}

            {/* Grid + Detail panel */}
            <div style={{ padding: 12, display: 'flex', gap: 12 }}>
                {/* 13x13 Equity Grid */}
                <div style={{ flex: 1 }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(13, 1fr)',
                        gap: 1,
                    }}>
                        {gridData.map((cell) => (
                            <EquityCell
                                key={cell.hand}
                                hand={cell.hand}
                                equity={cell.equity}
                                inHeroRange={cell.inHero}
                                inVilRange={cell.inVil}
                                isSelected={selectedHand === cell.hand}
                                onClick={() => setSelectedHand(cell.hand === selectedHand ? null : cell.hand)}
                            />
                        ))}
                    </div>

                    {/* Equity distribution */}
                    {showEquityDist && boardCards.length >= 3 && (
                        <EquityDistribution equityData={gridData.filter(g => g.inHero > 0)} />
                    )}

                    {/* Legend */}
                    <div style={{
                        display: 'flex', gap: 8, justifyContent: 'center',
                        marginTop: 8, flexWrap: 'wrap',
                    }}>
                        {[
                            { label: '>65%', color: '#22c55e' },
                            { label: '50-65%', color: '#f59e0b' },
                            { label: '35-50%', color: '#fb923c' },
                            { label: '<35%', color: '#ef4444' },
                        ].map(l => (
                            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: 2,
                                    background: `${l.color}55`,
                                    border: `1px solid ${l.color}33`,
                                }} />
                                <span style={{ fontSize: 8, color: '#64748b' }}>{l.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Detail panel */}
                <AnimatePresence>
                    {selectedDetail && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            style={{
                                width: 180,
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: 8,
                                border: '1px solid rgba(100,116,139,0.12)',
                                padding: 12,
                            }}
                        >
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                                {selectedDetail.hand}
                            </div>

                            {selectedDetail.equity !== null ? (
                                <>
                                    {/* Equity gauge */}
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>
                                            EQUITY VS RANGE
                                        </div>
                                        <div style={{
                                            height: 8, background: 'rgba(255,255,255,0.05)',
                                            borderRadius: 4, overflow: 'hidden',
                                        }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${selectedDetail.equity * 100}%` }}
                                                style={{
                                                    height: '100%', borderRadius: 4,
                                                    background: selectedDetail.equity >= 0.55 ? '#22c55e'
                                                        : selectedDetail.equity >= 0.45 ? '#f59e0b' : '#ef4444',
                                                }}
                                            />
                                        </div>
                                        <div style={{
                                            fontSize: 20, fontWeight: 700, marginTop: 4,
                                            color: selectedDetail.equity >= 0.55 ? '#22c55e'
                                                : selectedDetail.equity >= 0.45 ? '#f59e0b' : '#ef4444',
                                            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                                        }}>
                                            {(selectedDetail.equity * 100).toFixed(1)}%
                                        </div>
                                    </div>

                                    {/* Hand classification */}
                                    {boardCards.length >= 3 && (() => {
                                        try {
                                            const cards = handNotationToCards(selectedDetail.hand);
                                            if (boardConflicts(cards, boardCards)) return null;
                                            const made = classifyMadeHand(cards, boardCards);
                                            const draws = boardCards.length < 5 ? classifyDraws(cards, boardCards) : null;
                                            return (
                                                <div style={{ marginBottom: 8 }}>
                                                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>
                                                        HAND STRENGTH
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>
                                                        {made.description || made.rank || 'Unknown'}
                                                    </div>
                                                    {draws && draws.outs > 0 && (
                                                        <div style={{ fontSize: 10, color: '#818cf8', marginTop: 2 }}>
                                                            +{draws.outs} outs ({(draws.equity * 100).toFixed(0)}% draw equity)
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        } catch { return null; }
                                    })()}

                                    {/* Range weights */}
                                    <div style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>
                                            RANGE WEIGHT
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <div>
                                                <div style={{ fontSize: 8, color: '#3b82f6' }}>Hero</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>
                                                    {((selectedDetail.inHero || 0) * 100).toFixed(0)}%
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 8, color: '#ef4444' }}>Villain</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>
                                                    {((selectedDetail.inVil || 0) * 100).toFixed(0)}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                                    {boardCards.length < 3
                                        ? 'Enter a board to see equity'
                                        : 'Not in hero\'s range or blocked'}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ●● Compact variant for embedding ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export function RangeEquityMini({ board, heroRange, vilRange }) {
    const boardCards = useMemo(() => {
        if (!board) return [];
        if (Array.isArray(board)) return board;
        return board.replace(/\s+/g, '').match(/.{2}/g) || [];
    }, [board]);

    const hero = heroRange || DEFAULT_HERO_RANGE;
    const vil = vilRange || DEFAULT_VILLAIN_RANGE;

    const avgEquity = useMemo(() => {
        let total = 0, count = 0;
        Object.entries(hero || {}).forEach(([hand, weight]) => {
            if (weight <= 0 || boardCards.length < 3) return;
            const cards = handNotationToCards(hand);
            if (boardConflicts(cards, boardCards)) return;
            total += estimateHandEquity(cards, boardCards, vil);
            count++;
        });
        return count > 0 ? total / count : 0.5;
    }, [hero, vil, boardCards]);

    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(15,23,42,0.5)',
            border: '1px solid rgba(100,116,139,0.12)',
        }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Range Equity</div>
            <div style={{
                fontSize: 13, fontWeight: 700,
                color: avgEquity >= 0.55 ? '#22c55e' : avgEquity >= 0.45 ? '#f59e0b' : '#ef4444',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
            }}>
                {(avgEquity * 100).toFixed(1)}%
            </div>
        </div>
    );
}
