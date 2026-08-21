/**
 * SOLVER COMPARISON REPLAY — GTO Wizard-Style Hand Review with Solver Overlay
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Replays any hand from session history with a split-view showing:
 *   - What you did at each decision point vs what the solver recommends
 *   - Street-by-street walkthrough with animated board dealing
 *   - EV comparison bars for every available action
 *   - Cumulative EV loss tracking through the hand
 *   - "What if" mode: see what happens if you took the solver line
 *
 * Modeled after GTO Wizard's "Review" mode — the single most important
 * post-session learning tool in competitive poker training.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateActionEVs } from '../../engines/EVCalculator';
import { classifyMadeHand, classifyDraws } from '../../engines/HandStrengthEngine';
import { analyzeBoard } from '../../engines/BoardTextureEngine';
import { explainStrategy, explainStrategyBrief } from '../../engines/StrategyExplainer';

// ●● Card Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const SuitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SuitColor = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#e2e8f0' };

const PokerCard = memo(({ card, size = 'md', faceDown = false, isNew = false }) => {
    if (!card || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    const dims = size === 'lg' ? { w: 48, h: 66, fs: 18 }
        : size === 'md' ? { w: 38, h: 52, fs: 14 }
        : { w: 28, h: 38, fs: 11 };

    if (faceDown) {
        return (
            <div style={{
                width: dims.w, height: dims.h, borderRadius: 5,
                background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
                border: '1.5px solid #334155',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }} />
        );
    }

    return (
        <motion.div
            initial={isNew ? { scale: 0, rotateY: 180 } : false}
            animate={{ scale: 1, rotateY: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
                width: dims.w, height: dims.h, borderRadius: 5,
                background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
                border: '1.5px solid rgba(0,0,0,0.12)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontSize: dims.fs, fontWeight: 'bold',
                color: SuitColor[suit] || '#1e293b',
                lineHeight: 1.1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
        >
            <span>{rank}</span>
            <span style={{ fontSize: dims.fs - 3 }}>{SuitSymbol[suit] || suit}</span>
        </motion.div>
    );
});

// ●● EV Bar ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const EVBar = memo(({ action, ev, frequency, bestEV, isPlayerAction, isOptimal }) => {
    const maxAbsEV = Math.max(Math.abs(bestEV), 2);
    const barWidth = Math.min(100, (Math.abs(ev) / maxAbsEV) * 80);
    const isPositive = ev >= 0;
    const color = isOptimal ? '#22c55e' : isPlayerAction ? '#f59e0b' : '#64748b';

    const actionLabels = {
        fold: 'Fold', check: 'Check', call: 'Call',
        bet_small: 'Bet 33%', bet_medium: 'Bet 50%', bet_large: 'Bet 75%',
        bet_pot: 'Bet Pot', bet_overbet: 'Overbet', raise: 'Raise',
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
            opacity: frequency < 0.01 && !isPlayerAction ? 0.4 : 1,
        }}>
            <div style={{
                width: 70, fontSize: 11, fontWeight: isPlayerAction || isOptimal ? 700 : 500,
                color: isPlayerAction ? '#f59e0b' : isOptimal ? '#22c55e' : '#94a3b8',
                textAlign: 'right',
            }}>
                {actionLabels[action] || action}
            </div>
            <div style={{
                flex: 1, height: 18, background: 'rgba(255,255,255,0.03)',
                borderRadius: 3, position: 'relative', overflow: 'hidden',
            }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: 3,
                        background: isPositive
                            ? `linear-gradient(90deg, ${color}44, ${color}88)`
                            : `linear-gradient(90deg, #ef444444, #ef444488)`,
                    }}
                />
                {/* Frequency badge */}
                {frequency > 0.01 && (
                    <div style={{
                        position: 'absolute', right: 4, top: 1,
                        fontSize: 9, color: '#94a3b8', fontWeight: 600,
                    }}>
                        {(frequency * 100).toFixed(0)}%
                    </div>
                )}
            </div>
            <div style={{
                width: 55, fontSize: 11, fontWeight: 700, textAlign: 'right',
                fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                color: ev >= 0 ? '#22c55e' : '#ef4444',
            }}>
                {ev >= 0 ? '+' : ''}{ev.toFixed(2)} BB
            </div>
            {/* Markers */}
            {isPlayerAction && (
                <div style={{
                    fontSize: 9, fontWeight: 700, color: '#f59e0b',
                    background: 'rgba(245,158,11,0.1)', padding: '1px 4px',
                    borderRadius: 3, border: '1px solid rgba(245,158,11,0.2)',
                }}>YOU</div>
            )}
            {isOptimal && (
                <div style={{
                    fontSize: 9, fontWeight: 700, color: '#22c55e',
                    background: 'rgba(34,197,94,0.1)', padding: '1px 4px',
                    borderRadius: 3, border: '1px solid rgba(34,197,94,0.2)',
                }}>GTO</div>
            )}
        </div>
    );
});

// ●● Street Label ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const StreetColors = {
    preflop: { bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: 'rgba(167,139,250,0.25)' },
    flop: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.25)' },
    turn: { bg: 'rgba(251,146,60,0.12)', color: '#fb923c', border: 'rgba(251,146,60,0.25)' },
    river: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.25)' },
};

// ●● Decision Node ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const DecisionNode = memo(({ hand, streetIndex, totalStreets }) => {
    const handData = hand?.handData || hand || {};
    const street = handData.street || 'flop';
    const streetStyle = StreetColors[street] || StreetColors.flop;

    // Calculate EVs for all actions
    const boardCards = useMemo(() => {
        const board = handData.board || '';
        if (Array.isArray(board)) return board;
        return board.replace(/\s+/g, '').match(/.{2}/g) || [];
    }, [handData.board]);

    const heroCards = useMemo(() => {
        const hc = handData.heroCards;
        if (Array.isArray(hc)) return hc;
        if (typeof hc === 'string') return hc.split(' ').filter(Boolean);
        return [];
    }, [handData.heroCards]);

    const evAnalysis = useMemo(() => {
        try {
            return calculateActionEVs({
                holeCards: heroCards,
                board: boardCards,
                potSize: handData.potSize || 6,
                effectiveStack: handData.effectiveStack || 100,
                street,
                position: handData.heroPosition === 'BTN' || handData.heroPosition === 'CO' ? 'IP' : 'OOP',
                isPFR: true,
                currentBet: handData.facingBet || 0,
            });
        } catch {
            return null;
        }
    }, [heroCards, boardCards, street, handData]);

    const explanation = useMemo(() => {
        try {
            return explainStrategy({
                holeCards: heroCards,
                board: boardCards,
                correctAction: handData.correctAction || evAnalysis?.bestAction,
                userAction: handData.action,
                position: handData.heroPosition === 'BTN' || handData.heroPosition === 'CO' ? 'IP' : 'OOP',
                street,
                spotType: 'cbet',
            });
        } catch {
            return null;
        }
    }, [heroCards, boardCards, handData, evAnalysis, street]);

    const playerAction = handData.action?.toLowerCase()?.replace(/\s+/g, '_') || '';
    const optimalAction = handData.correctAction?.toLowerCase()?.replace(/\s+/g, '_') || evAnalysis?.bestAction || '';
    const isCorrect = playerAction === optimalAction ||
        hand?.classification === 'best' || hand?.classification === 'correct';

    // Sort actions by EV descending
    const sortedActions = useMemo(() => {
        if (!evAnalysis?.actions) return [];
        return Object.entries(evAnalysis.actions || {})
            .sort(([, a], [, b]) => b.ev - a.ev);
    }, [evAnalysis]);

    const handStrength = useMemo(() => {
        try {
            if (!heroCards.length || !boardCards.length) return null;
            const made = classifyMadeHand(heroCards, boardCards);
            const draws = street !== 'river' ? classifyDraws(heroCards, boardCards) : null;
            return { made, draws };
        } catch { return null; }
    }, [heroCards, boardCards, street]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: streetIndex * 0.15 }}
            style={{
                background: 'rgba(15,23,42,0.6)',
                border: `1px solid ${streetStyle.border}`,
                borderRadius: 10,
                padding: 16,
                marginBottom: 12,
            }}
        >
            {/* Street header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        background: streetStyle.bg, color: streetStyle.color,
                        border: `1px solid ${streetStyle.border}`,
                    }}>
                        {street}
                    </div>
                    {handData.heroPosition && (
                        <div style={{
                            fontSize: 10, fontWeight: 600, color: '#64748b',
                            padding: '2px 6px', background: 'rgba(100,116,139,0.1)',
                            borderRadius: 3,
                        }}>
                            {handData.heroPosition}
                        </div>
                    )}
                    {handStrength?.made && (
                        <div style={{
                            fontSize: 10, fontWeight: 600, color: '#818cf8',
                            fontStyle: 'italic',
                        }}>
                            {handStrength.made.description || handStrength.made.rank}
                        </div>
                    )}
                </div>
                <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: isCorrect ? '#22c55e' : '#ef4444',
                    fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace",
                }}>
                    {hand?.evLoss > 0 ? `-${hand.evLoss.toFixed(2)} BB` : '✓ 0.00 BB'}
                </div>
            </div>

            {/* Board + Hero cards */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                {boardCards.length > 0 && (
                    <div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Board
                        </div>
                        <div style={{ display: 'flex', gap: 3 }}>
                            {boardCards.map((c, i) => <PokerCard key={i} card={c} size="md" />)}
                        </div>
                    </div>
                )}
                <div>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Hero
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                        {heroCards.map((c, i) => <PokerCard key={i} card={c} size="md" />)}
                    </div>
                </div>
                {handData.potSize && (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Pot</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', fontFamily: "var(--font-rajdhani), 'Rajdhani', monospace" }}>
                            {handData.potSize} BB
                        </div>
                    </div>
                )}
            </div>

            {/* Action comparison — split view */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                marginBottom: 12,
            }}>
                {/* Your action */}
                <div style={{
                    background: isCorrect ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                    borderRadius: 8, padding: 10,
                }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                        Your Action
                    </div>
                    <div style={{
                        fontSize: 16, fontWeight: 700,
                        color: isCorrect ? '#22c55e' : '#f59e0b',
                    }}>
                        {handData.action || '—'}
                    </div>
                </div>
                {/* Solver action */}
                <div style={{
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.15)',
                    borderRadius: 8, padding: 10,
                }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                        Solver Recommends
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>
                        {handData.correctAction || evAnalysis?.bestAction || '—'}
                    </div>
                    {evAnalysis?.bestAction && (
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                            EV: +{(evAnalysis.bestEV || 0).toFixed(2)} BB
                        </div>
                    )}
                </div>
            </div>

            {/* EV bars for all actions */}
            {sortedActions.length > 0 && (
                <div style={{
                    background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 10,
                    marginBottom: 10,
                }}>
                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.08em' }}>
                        EV Analysis — All Actions
                    </div>
                    {sortedActions.map(([action, data]) => (
                        <EVBar
                            key={action}
                            action={action}
                            ev={data.ev}
                            frequency={data.frequency}
                            bestEV={evAnalysis.bestEV || 1}
                            isPlayerAction={playerAction.includes(action.split('_')[0]) || action === playerAction}
                            isOptimal={action === optimalAction || action === evAnalysis.bestAction}
                        />
                    ))}
                </div>
            )}

            {/* Strategy explanation */}
            {explanation && (
                <div style={{
                    background: 'rgba(99,102,241,0.06)',
                    border: '1px solid rgba(99,102,241,0.12)',
                    borderRadius: 6, padding: 10,
                }}>
                    <div style={{ fontSize: 9, color: '#818cf8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.08em' }}>
                        Why? — {explanation.strategicConcept || 'Strategy Insight'}
                    </div>
                    <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                        {explanation.explanation}
                    </div>
                    {explanation.keyFactors?.length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {explanation.keyFactors.map((f, i) => (
                                <span key={i} style={{
                                    fontSize: 9, padding: '2px 6px', borderRadius: 3,
                                    background: 'rgba(129,140,248,0.1)',
                                    color: '#a5b4fc', fontWeight: 600,
                                }}>
                                    {f}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function SolverComparisonReplay({ handHistory = [] }) {
    const [currentHandIndex, setCurrentHandIndex] = useState(0);
    const [viewMode, setViewMode] = useState('walkthrough'); // 'walkthrough' | 'overview'
    const [showOnlyMistakes, setShowOnlyMistakes] = useState(false);

    const filteredHands = useMemo(() => {
        if (!showOnlyMistakes) return handHistory;
        return handHistory.filter(h =>
            h.classification && h.classification !== 'best' && h.classification !== 'correct'
        );
    }, [handHistory, showOnlyMistakes]);

    const currentHand = filteredHands[currentHandIndex];
    const mistakeCount = useMemo(() =>
        handHistory.filter(h => h.classification && h.classification !== 'best' && h.classification !== 'correct').length,
        [handHistory]
    );

    // Cumulative EV loss data
    const cumulativeEVData = useMemo(() => {
        let running = 0;
        return handHistory.map((h, i) => {
            running += (h.evLoss || 0);
            return { hand: i + 1, cumEV: running, evLoss: h.evLoss || 0 };
        });
    }, [handHistory]);

    const totalEVLoss = cumulativeEVData.length > 0 ? cumulativeEVData[cumulativeEVData.length - 1].cumEV : 0;

    const handlePrev = useCallback(() => {
        setCurrentHandIndex(i => Math.max(0, i - 1));
    }, []);

    const handleNext = useCallback(() => {
        setCurrentHandIndex(i => Math.min(filteredHands.length - 1, i + 1));
    }, [filteredHands.length]);

    // Keyboard navigation
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handlePrev, handleNext]);

    if (!handHistory.length) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                No hands to review. Complete a session first.
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
            {/* ●●● Header ●●● */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(0,0,0,0.2)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        fontSize: 14, fontWeight: 700, color: '#e2e8f0',
                        letterSpacing: '-0.01em',
                    }}>
                        Solver Comparison
                    </div>
                    <div style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        background: 'rgba(239,68,68,0.1)', color: '#f87171',
                        fontWeight: 600,
                    }}>
                        {mistakeCount} mistake{mistakeCount !== 1 ? 's' : ''} · -{totalEVLoss.toFixed(1)} BB
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {['walkthrough', 'overview'].map(mode => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            style={{
                                padding: '4px 10px', fontSize: 10, fontWeight: 600,
                                borderRadius: 4, border: '1px solid',
                                cursor: 'pointer', textTransform: 'capitalize',
                                background: viewMode === mode ? 'rgba(0,212,255,0.1)' : 'transparent',
                                color: viewMode === mode ? '#00d4ff' : '#64748b',
                                borderColor: viewMode === mode ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.15)',
                            }}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </div>

            {/* ●●● Cumulative EV Timeline ●●● */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(100,116,139,0.08)' }}>
                <svg viewBox="0 0 400 40" style={{ width: '100%', height: 40, display: 'block' }}>
                    {/* Background */}
                    <rect x="0" y="0" width="400" height="40" fill="rgba(0,0,0,0.1)" rx="4" />
                    {/* EV loss line */}
                    {cumulativeEVData.length > 1 && (() => {
                        const maxEV = Math.max(...cumulativeEVData.map(d => d.cumEV), 1);
                        const points = cumulativeEVData.map((d, i) => {
                            const x = 10 + (i / (cumulativeEVData.length - 1)) * 380;
                            const y = 35 - (d.cumEV / maxEV) * 28;
                            return `${x},${y}`;
                        });
                        return (
                            <>
                                <polyline
                                    points={points.join(' ')}
                                    fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"
                                />
                                {/* Current hand marker */}
                                {viewMode === 'walkthrough' && filteredHands.length > 0 && (() => {
                                    const origIdx = handHistory.indexOf(filteredHands[currentHandIndex]);
                                    if (origIdx < 0 || origIdx >= cumulativeEVData.length) return null;
                                    const d = cumulativeEVData[origIdx];
                                    const x = 10 + (origIdx / (cumulativeEVData.length - 1)) * 380;
                                    const y = 35 - (d.cumEV / maxEV) * 28;
                                    return <circle cx={x} cy={y} r="4" fill="#00d4ff" stroke="#0f172a" strokeWidth="1.5" />;
                                })()}
                            </>
                        );
                    })()}
                    {/* Labels */}
                    <text x="15" y="12" fontSize="8" fill="#64748b" fontWeight="600">Cumulative EV Loss</text>
                    <text x="385" y="12" fontSize="8" fill="#ef4444" fontWeight="700" textAnchor="end">
                        -{totalEVLoss.toFixed(1)} BB
                    </text>
                </svg>
            </div>

            {/* ●●● Mistakes Filter ●●● */}
            <div style={{
                padding: '6px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.08)',
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <button
                    onClick={() => { setShowOnlyMistakes(false); setCurrentHandIndex(0); }}
                    style={{
                        padding: '3px 8px', fontSize: 10, fontWeight: 600,
                        borderRadius: 4, border: '1px solid',
                        cursor: 'pointer',
                        background: !showOnlyMistakes ? 'rgba(0,212,255,0.1)' : 'transparent',
                        color: !showOnlyMistakes ? '#00d4ff' : '#64748b',
                        borderColor: !showOnlyMistakes ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.12)',
                    }}
                >
                    All Hands ({handHistory.length})
                </button>
                <button
                    onClick={() => { setShowOnlyMistakes(true); setCurrentHandIndex(0); }}
                    style={{
                        padding: '3px 8px', fontSize: 10, fontWeight: 600,
                        borderRadius: 4, border: '1px solid',
                        cursor: 'pointer',
                        background: showOnlyMistakes ? 'rgba(239,68,68,0.1)' : 'transparent',
                        color: showOnlyMistakes ? '#f87171' : '#64748b',
                        borderColor: showOnlyMistakes ? 'rgba(239,68,68,0.2)' : 'rgba(100,116,139,0.12)',
                    }}
                >
                    Mistakes Only ({mistakeCount})
                </button>
            </div>

            {/* ●●● Content ●●● */}
            <div style={{ padding: 16 }}>
                {viewMode === 'walkthrough' ? (
                    /* ●●●● WALKTHROUGH MODE ●●●● */
                    <>
                        {/* Navigation */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 12,
                        }}>
                            <button
                                onClick={handlePrev}
                                disabled={currentHandIndex === 0}
                                style={{
                                    padding: '6px 14px', fontSize: 11, fontWeight: 600,
                                    borderRadius: 5, border: '1px solid rgba(100,116,139,0.15)',
                                    background: 'rgba(0,0,0,0.2)', color: currentHandIndex === 0 ? '#334155' : '#94a3b8',
                                    cursor: currentHandIndex === 0 ? 'default' : 'pointer',
                                }}
                            >
                                ← Prev
                            </button>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                                Hand {currentHandIndex + 1} / {filteredHands.length}
                            </div>
                            <button
                                onClick={handleNext}
                                disabled={currentHandIndex >= filteredHands.length - 1}
                                style={{
                                    padding: '6px 14px', fontSize: 11, fontWeight: 600,
                                    borderRadius: 5, border: '1px solid rgba(100,116,139,0.15)',
                                    background: 'rgba(0,0,0,0.2)',
                                    color: currentHandIndex >= filteredHands.length - 1 ? '#334155' : '#94a3b8',
                                    cursor: currentHandIndex >= filteredHands.length - 1 ? 'default' : 'pointer',
                                }}
                            >
                                Next →
                            </button>
                        </div>

                        {/* Hand navigation dots */}
                        <div style={{
                            display: 'flex', gap: 3, justifyContent: 'center',
                            marginBottom: 14, flexWrap: 'wrap',
                        }}>
                            {filteredHands.map((h, i) => {
                                const isMistake = h.classification && h.classification !== 'best' && h.classification !== 'correct';
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setCurrentHandIndex(i)}
                                        style={{
                                            width: 18, height: 18, borderRadius: 3,
                                            border: i === currentHandIndex ? '2px solid #00d4ff' : '1px solid rgba(100,116,139,0.15)',
                                            background: i === currentHandIndex ? 'rgba(0,212,255,0.15)'
                                                : isMistake ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.08)',
                                            color: i === currentHandIndex ? '#00d4ff'
                                                : isMistake ? '#f87171' : '#22c55e',
                                            fontSize: 8, fontWeight: 700, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        {i + 1}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Current hand decision node */}
                        <AnimatePresence mode="wait">
                            {currentHand && (
                                <motion.div
                                    key={currentHandIndex}
                                    initial={{ opacity: 0, x: 30 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -30 }}
                                >
                                    <DecisionNode
                                        hand={currentHand}
                                        streetIndex={0}
                                        totalStreets={1}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                ) : (
                    /* ●●●● OVERVIEW MODE ●●●● */
                    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                        {filteredHands.map((hand, i) => (
                            <DecisionNode
                                key={i}
                                hand={hand}
                                streetIndex={i}
                                totalStreets={filteredHands.length}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
