/**
 * MULTI-STREET HAND NAVIGATOR — Connected Street-by-Street Walkthrough
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style multi-street navigator that shows how a complete hand
 * evolves from preflop through river. Key features:
 *   - Connected timeline showing all streets with animated transitions
 *   - Per-street solver strategy with frequency bars
 *   - Board dealing animation as you progress through streets
 *   - Pot growth tracker and SPR indicator
 *   - Action history timeline with decision tree branching
 *   - "What would solver do?" at each node
 *
 * Unlike SolverComparisonReplay (which shows one decision at a time),
 * this shows the FULL hand structure and how decisions connect.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateActionEVs } from '../../engines/EVCalculator';
import { classifyMadeHand, classifyDraws } from '../../engines/HandStrengthEngine';
import { analyzeBoard } from '../../engines/BoardTextureEngine';
import { getPostflopStrategy } from '../../engines/PostflopStrategyEngine';

// ●● Constants ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];
const STREET_META = {
    preflop: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Preflop', boardCards: 0 },
    flop: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Flop', boardCards: 3 },
    turn: { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', label: 'Turn', boardCards: 4 },
    river: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'River', boardCards: 5 },
};

const SuitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SuitColor = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#e2e8f0' };

// ●● Mini Card ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const MiniCard = memo(({ card, isNew = false }) => {
    if (!card || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    return (
        <motion.div
            initial={isNew ? { scale: 0, rotateY: 90 } : false}
            animate={{ scale: 1, rotateY: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{
                width: 32, height: 44, borderRadius: 4,
                background: 'linear-gradient(180deg, #f8fafc, #e2e8f0)',
                border: '1px solid rgba(0,0,0,0.12)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 'bold',
                color: SuitColor[suit] || '#1e293b',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
        >
            <span>{rank}</span>
            <span style={{ fontSize: 9 }}>{SuitSymbol[suit] || suit}</span>
        </motion.div>
    );
});

// ●● Frequency Bar ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const FreqBar = memo(({ action, freq, color = '#3b82f6' }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
        <div style={{ width: 55, fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>
            {action}
        </div>
        <div style={{
            flex: 1, height: 10, background: 'rgba(255,255,255,0.03)',
            borderRadius: 2, overflow: 'hidden',
        }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${freq * 100}%` }}
                transition={{ duration: 0.5 }}
                style={{
                    height: '100%', borderRadius: 2,
                    background: `linear-gradient(90deg, ${color}66, ${color})`,
                }}
            />
        </div>
        <div style={{
            width: 35, fontSize: 10, fontWeight: 700, color: '#e2e8f0',
            textAlign: 'right', fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
        }}>
            {(freq * 100).toFixed(0)}%
        </div>
    </div>
));

// ●● Street Node ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const StreetNode = memo(({ street, handData, isActive, isCompleted, onSelect, heroCards, boardCards, potSize }) => {
    const meta = STREET_META[street] || STREET_META.flop;
    const boardForStreet = street === 'preflop' ? [] :
        street === 'flop' ? boardCards.slice(0, 3) :
        street === 'turn' ? boardCards.slice(0, 4) :
        boardCards.slice(0, 5);

    // Compute strategy at this node
    const strategy = useMemo(() => {
        if (street === 'preflop' || !heroCards?.length || boardForStreet.length < 3) return null;
        try {
            const evs = calculateActionEVs({
                holeCards: heroCards,
                board: boardForStreet,
                potSize: potSize || 6,
                effectiveStack: 100,
                street,
                position: handData?.heroPosition === 'BTN' || handData?.heroPosition === 'CO' ? 'IP' : 'OOP',
                isPFR: true,
                currentBet: 0,
            });
            return evs;
        } catch { return null; }
    }, [heroCards, boardForStreet, street, potSize, handData]);

    const handStrength = useMemo(() => {
        if (!heroCards?.length || boardForStreet.length < 3) return null;
        try {
            const made = classifyMadeHand(heroCards, boardForStreet);
            const draws = street !== 'river' ? classifyDraws(heroCards, boardForStreet) : null;
            return { made, draws };
        } catch { return null; }
    }, [heroCards, boardForStreet, street]);

    const newCards = street === 'flop' ? boardForStreet :
        street === 'turn' ? [boardCards[3]] :
        street === 'river' ? [boardCards[4]] : [];

    return (
        <motion.div
            onClick={onSelect}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: isActive ? meta.bg : 'rgba(15,23,42,0.3)',
                border: `1.5px solid ${isActive ? meta.color + '44' : 'rgba(100,116,139,0.08)'}`,
                borderRadius: 10,
                padding: 14,
                cursor: 'pointer',
                opacity: isCompleted || isActive ? 1 : 0.4,
                transition: 'all 0.2s ease',
            }}
        >
            {/* Street header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        background: meta.bg, color: meta.color,
                        border: `1px solid ${meta.color}33`,
                    }}>
                        {meta.label}
                    </div>
                    {handStrength?.made && (
                        <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 600, fontStyle: 'italic' }}>
                            {handStrength.made.description || handStrength.made.rank}
                        </span>
                    )}
                </div>
                {potSize > 0 && (
                    <div style={{
                        fontSize: 11, fontWeight: 700, color: '#f59e0b',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}>
                        {potSize.toFixed(1)} BB
                    </div>
                )}
            </div>

            {/* Board cards */}
            {boardForStreet.length > 0 && (
                <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                    {boardForStreet.map((c, i) => (
                        <MiniCard key={i} card={c} isNew={newCards.includes(c) && isActive} />
                    ))}
                </div>
            )}

            {/* Action taken */}
            {handData?.action && (
                <div style={{
                    display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8,
                    padding: '4px 8px', borderRadius: 4,
                    background: handData.classification === 'correct' || handData.classification === 'best'
                        ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                }}>
                    <div>
                        <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>YOU</div>
                        <div style={{
                            fontSize: 13, fontWeight: 700,
                            color: handData.classification === 'correct' || handData.classification === 'best'
                                ? '#22c55e' : '#f59e0b',
                        }}>
                            {handData.action}
                        </div>
                    </div>
                    {handData.correctAction && handData.action !== handData.correctAction && (
                        <div>
                            <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>GTO</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
                                {handData.correctAction}
                            </div>
                        </div>
                    )}
                    {handData.evLoss > 0 && (
                        <div style={{
                            marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                            color: '#ef4444', fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                        }}>
                            -{handData.evLoss.toFixed(2)} BB
                        </div>
                    )}
                </div>
            )}

            {/* Strategy frequencies (expanded when active) */}
            {isActive && strategy?.actions && (
                <div style={{
                    background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8,
                    marginTop: 4,
                }}>
                    <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                        Solver Frequencies
                    </div>
                    {Object.entries(strategy.actions || {})
                        .filter(([, d]) => d.frequency > 0.02)
                        .sort(([, a], [, b]) => b.frequency - a.frequency)
                        .slice(0, 5)
                        .map(([action, data]) => (
                            <FreqBar
                                key={action}
                                action={action.replace(/_/g, ' ').replace('bet ', '')}
                                freq={data.frequency}
                                color={action === strategy.bestAction ? '#22c55e' : meta.color}
                            />
                        ))
                    }
                </div>
            )}

            {/* Draw outs */}
            {isActive && handStrength?.draws?.outs > 0 && (
                <div style={{ marginTop: 6, fontSize: 10, color: '#818cf8' }}>
                    {handStrength.draws.outs} outs · {(handStrength.draws.equity * 100).toFixed(0)}% draw equity
                </div>
            )}
        </motion.div>
    );
});

// ●● SPR Indicator ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SPRBadge = memo(({ potSize, effectiveStack = 100 }) => {
    if (!potSize) return null;
    const spr = effectiveStack / potSize;
    const sprLabel = spr > 10 ? 'Deep' : spr > 4 ? 'Medium' : spr > 2 ? 'Shallow' : 'Committed';
    const sprColor = spr > 10 ? '#22c55e' : spr > 4 ? '#f59e0b' : spr > 2 ? '#fb923c' : '#ef4444';
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 10,
            background: `${sprColor}10`, border: `1px solid ${sprColor}22`,
        }}>
            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>SPR</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: sprColor, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                {spr.toFixed(1)}
            </span>
            <span style={{ fontSize: 8, color: sprColor, fontWeight: 600 }}>{sprLabel}</span>
        </div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function MultiStreetNavigator({ handHistory = [] }) {
    const [selectedHandIdx, setSelectedHandIdx] = useState(0);
    const [activeStreet, setActiveStreet] = useState(null);

    // Group hands by multi-street sequences
    // Each "hand" in handHistory could be a single street decision.
    // We group consecutive entries that share the same hero cards.
    const handGroups = useMemo(() => {
        if (!handHistory.length) return [];

        const groups = [];
        let current = null;

        handHistory.forEach((h, i) => {
            const hd = h?.handData || h || {};
            const heroKey = Array.isArray(hd.heroCards) ? hd.heroCards.join('') : hd.heroCards || '';

            if (!current || (heroKey && current.heroKey !== heroKey)) {
                current = {
                    heroKey,
                    heroCards: hd.heroCards,
                    streets: {},
                    board: hd.board || [],
                    startIndex: i,
                };
                groups.push(current);
            }

            const street = hd.street || 'flop';
            current.streets[street] = { ...hd, classification: h.classification, evLoss: h.evLoss || 0 };

            // Merge board data
            if (hd.board) {
                const boardArr = Array.isArray(hd.board) ? hd.board :
                    hd.board.replace(/\s+/g, '').match(/.{2}/g) || [];
                if (boardArr.length > (Array.isArray(current.board) ? current.board.length : 0)) {
                    current.board = boardArr;
                }
            }
        });

        return groups;
    }, [handHistory]);

    const currentGroup = handGroups[selectedHandIdx] || null;

    const heroCards = useMemo(() => {
        if (!currentGroup?.heroCards) return [];
        const hc = currentGroup.heroCards;
        if (Array.isArray(hc)) return hc;
        if (typeof hc === 'string') return hc.split(' ').filter(Boolean);
        return [];
    }, [currentGroup]);

    const boardCards = useMemo(() => {
        if (!currentGroup?.board) return [];
        const b = currentGroup.board;
        if (Array.isArray(b)) return b;
        return b.replace(/\s+/g, '').match(/.{2}/g) || [];
    }, [currentGroup]);

    // Calculate pot at each street
    const potByStreet = useMemo(() => {
        let pot = 1.5; // blinds
        const pots = { preflop: pot };
        STREET_ORDER.forEach(s => {
            const sd = currentGroup?.streets[s];
            if (sd) {
                // Rough pot growth estimation
                if (sd.action?.toLowerCase().includes('bet') || sd.action?.toLowerCase().includes('raise')) {
                    pot *= 2.2;
                } else if (sd.action?.toLowerCase().includes('call')) {
                    pot *= 1.5;
                }
            }
            pots[s] = pot;
        });
        return pots;
    }, [currentGroup]);

    // Active street defaults to the last played street
    const effectiveActive = activeStreet || (() => {
        if (!currentGroup) return 'flop';
        const played = STREET_ORDER.filter(s => currentGroup.streets[s]);
        return played[played.length - 1] || 'flop';
    })();

    const totalEVLoss = useMemo(() => {
        if (!currentGroup) return 0;
        return Object.values(currentGroup.streets || {}).reduce((s, sd) => s + (sd.evLoss || 0), 0);
    }, [currentGroup]);

    if (!handHistory.length) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No hands to navigate.
            </div>
        );
    }

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
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                        Hand Navigator
                    </div>
                    {totalEVLoss > 0 && (
                        <div style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10,
                            background: 'rgba(239,68,68,0.1)', color: '#f87171', fontWeight: 600,
                        }}>
                            -{totalEVLoss.toFixed(2)} BB total
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SPRBadge potSize={potByStreet[effectiveActive]} />
                    {/* Hand selector */}
                    <select
                        value={selectedHandIdx}
                        onChange={e => { setSelectedHandIdx(Number(e.target.value)); setActiveStreet(null); }}
                        style={{
                            padding: '4px 8px', fontSize: 10, fontWeight: 600,
                            background: 'rgba(0,0,0,0.3)', color: '#94a3b8',
                            border: '1px solid rgba(100,116,139,0.2)',
                            borderRadius: 4, outline: 'none',
                        }}
                    >
                        {handGroups.map((g, i) => (
                            <option key={i} value={i}>
                                Hand {i + 1} {g.heroKey ? `(${g.heroKey.substring(0, 4)})` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Hero cards display */}
            {heroCards.length > 0 && (
                <div style={{
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(100,116,139,0.08)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        Hero
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                        {heroCards.map((c, i) => <MiniCard key={i} card={c} />)}
                    </div>
                    {currentGroup?.streets?.preflop?.heroPosition && (
                        <div style={{
                            fontSize: 10, fontWeight: 600, color: '#64748b',
                            padding: '2px 6px', background: 'rgba(100,116,139,0.1)',
                            borderRadius: 3,
                        }}>
                            {currentGroup.streets.preflop.heroPosition}
                        </div>
                    )}
                </div>
            )}

            {/* Street timeline */}
            <div style={{ padding: '12px 16px' }}>
                {/* Timeline connector */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 4, marginBottom: 12,
                }}>
                    {STREET_ORDER.map((s, i) => {
                        const meta = STREET_META[s];
                        const hasData = !!currentGroup?.streets[s];
                        const isActive = s === effectiveActive;
                        return (
                            <React.Fragment key={s}>
                                {i > 0 && (
                                    <div style={{
                                        width: 24, height: 2,
                                        background: hasData ? meta.color + '44' : 'rgba(100,116,139,0.1)',
                                    }} />
                                )}
                                <button
                                    onClick={() => setActiveStreet(s)}
                                    style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        border: `2px solid ${isActive ? meta.color : hasData ? meta.color + '44' : 'rgba(100,116,139,0.15)'}`,
                                        background: isActive ? meta.bg : 'transparent',
                                        color: isActive ? meta.color : hasData ? meta.color + '88' : '#334155',
                                        fontSize: 9, fontWeight: 700, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    {s[0].toUpperCase()}
                                </button>
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Active street detail */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`${selectedHandIdx}-${effectiveActive}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        <StreetNode
                            street={effectiveActive}
                            handData={currentGroup?.streets[effectiveActive]}
                            isActive={true}
                            isCompleted={true}
                            onSelect={() => {}}
                            heroCards={heroCards}
                            boardCards={boardCards}
                            potSize={potByStreet[effectiveActive]}
                        />
                    </motion.div>
                </AnimatePresence>

                {/* All streets summary below */}
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
                        Street Summary
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                        {STREET_ORDER.map(s => {
                            const sd = currentGroup?.streets[s];
                            const meta = STREET_META[s];
                            const isOk = sd?.classification === 'correct' || sd?.classification === 'best';
                            return (
                                <div
                                    key={s}
                                    onClick={() => setActiveStreet(s)}
                                    style={{
                                        padding: '6px 4px', borderRadius: 6, textAlign: 'center',
                                        cursor: 'pointer',
                                        background: sd ? (isOk ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)') : 'rgba(30,41,59,0.3)',
                                        border: `1px solid ${s === effectiveActive ? meta.color + '33' : 'rgba(100,116,139,0.06)'}`,
                                    }}
                                >
                                    <div style={{ fontSize: 9, fontWeight: 700, color: meta.color, textTransform: 'uppercase' }}>
                                        {meta.label}
                                    </div>
                                    {sd ? (
                                        <>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: isOk ? '#22c55e' : '#f59e0b', marginTop: 2 }}>
                                                {sd.action || '—'}
                                            </div>
                                            {sd.evLoss > 0 && (
                                                <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }}>
                                                    -{sd.evLoss.toFixed(2)}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>—</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
