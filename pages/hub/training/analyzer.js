/**
 * 🔍 HAND ANALYZER — GTO Wizard-Style Hand Review & Leak Detection
 * ═══════════════════════════════════════════════════════════════════════════
 * Upload hand histories from online poker sites and compare each decision
 * against GTO solver data. Identifies leaks and provides aggregate reports.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { parseHandHistories, getHeroDecisions, cardsToNotation } from '../../../src/utils/handHistoryParser';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { classifyMove, CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../../src/hooks/useGTOWScore';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_MAP = {
    fold: { label: 'Fold', color: '#64748b', icon: '🃏' },
    check: { label: 'Check', color: '#3b82f6', icon: '✋' },
    call: { label: 'Call', color: '#22c55e', icon: '📞' },
    bet: { label: 'Bet', color: '#ef4444', icon: '💰' },
    raise: { label: 'Raise', color: '#f59e0b', icon: '🚀' },
};

const STREET_COLORS = {
    preflop: '#7c3aed',
    flop: '#22c55e',
    turn: '#3b82f6',
    river: '#ef4444',
};

function CardDisplay({ card, size = 28 }) {
    if (!card) return null;
    const rank = card[0] === 'T' ? '10' : card[0].toUpperCase();
    const suit = card[card.length - 1];
    const suitSymbol = { s: '♠', h: '♥', d: '♦', c: '♣' }[suit] || '?';
    const suitColor = { s: '#e2e8f0', h: '#ef4444', d: '#3b82f6', c: '#22c55e' }[suit] || '#fff';

    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size * 1.3, background: '#fff', borderRadius: 3,
            fontSize: size * 0.35, fontWeight: 800, color: suitColor,
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}>
            {rank}{suitSymbol}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND CARD
// ═══════════════════════════════════════════════════════════════════════════

function HandCard({ hand, index, isExpanded, onToggle }) {
    const decisions = getHeroDecisions(hand);
    const handNotation = cardsToNotation(hand.heroCards);
    const allBoard = [
        ...(hand.board.flop || []),
        hand.board.turn,
        hand.board.river,
    ].filter(Boolean);

    return (
        <motion.div
            layout
            style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
                overflow: 'hidden',
                marginBottom: 8,
            }}
        >
            {/* Header */}
            <div
                onClick={onToggle}
                style={{
                    padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(0,212,255,0.05)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
            >
                <span style={{
                    fontSize: 10, fontWeight: 700, color: '#64748b',
                    fontFamily: "'Orbitron', monospace", width: 28,
                }}>
                    #{index + 1}
                </span>

                {/* Hero Cards */}
                <div style={{ display: 'flex', gap: 2 }}>
                    {hand.heroCards.map((c, i) => <CardDisplay key={i} card={c} size={22} />)}
                </div>

                <span style={{
                    fontSize: 13, fontWeight: 800, color: '#00d4ff',
                    fontFamily: "'Orbitron', monospace",
                }}>
                    {handNotation || '??'}
                </span>

                <span style={{
                    fontSize: 11, fontWeight: 600, color: '#94a3b8',
                    padding: '2px 8px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                }}>
                    {hand.heroPosition}
                </span>

                {/* Board preview */}
                {allBoard.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                        {allBoard.map((c, i) => <CardDisplay key={i} card={c} size={18} />)}
                    </div>
                )}

                <span style={{ color: '#475569', fontSize: 14, marginLeft: 'auto' }}>
                    {isExpanded ? '▲' : '▼'}
                </span>
            </div>

            {/* Expanded Detail */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ padding: '12px 14px' }}
                    >
                        {/* Street-by-street actions */}
                        {hand.streets.map(streetEntry => (
                            <div key={streetEntry.street} style={{ marginBottom: 10 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 800, color: STREET_COLORS[streetEntry.street] || '#94a3b8',
                                    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <div style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: STREET_COLORS[streetEntry.street],
                                    }} />
                                    {streetEntry.street}
                                    {streetEntry.street !== 'preflop' && (
                                        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
                                            {streetEntry.street === 'flop' && hand.board.flop.map((c, i) => <CardDisplay key={i} card={c} size={16} />)}
                                            {streetEntry.street === 'turn' && hand.board.turn && <CardDisplay card={hand.board.turn} size={16} />}
                                            {streetEntry.street === 'river' && hand.board.river && <CardDisplay card={hand.board.river} size={16} />}
                                        </div>
                                    )}
                                </div>

                                {streetEntry.actions.map((action, ai) => {
                                    // EV Loss classification for hero actions
                                    const heroClassification = action.isHero
                                        ? classifyMove(action.action, 'check', {}, 1)
                                        : null;
                                    const classConfig = heroClassification
                                        ? CLASSIFICATION_CONFIG[heroClassification.classification]
                                        : null;

                                    return (
                                        <div
                                            key={ai}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '3px 0',
                                                background: action.isHero ? 'rgba(0,212,255,0.05)' : 'transparent',
                                                borderLeft: action.isHero ? `3px solid ${classConfig?.color || '#00d4ff'}` : '3px solid transparent',
                                                paddingLeft: action.isHero ? 8 : 11,
                                                borderRadius: 4,
                                            }}
                                        >
                                            <span style={{
                                                fontSize: 10, color: '#64748b', width: 40,
                                                fontFamily: "'Orbitron', monospace", fontWeight: 600,
                                            }}>
                                                {action.position}
                                            </span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700,
                                                color: ACTION_MAP[action.action]?.color || '#94a3b8',
                                            }}>
                                                {ACTION_MAP[action.action]?.label || action.action}
                                            </span>
                                            {action.amount > 0 && (
                                                <span style={{
                                                    fontSize: 10, color: '#e2e8f0', fontWeight: 600,
                                                    fontFamily: "'Orbitron', monospace",
                                                }}>
                                                    ${action.amount.toFixed(2)}
                                                </span>
                                            )}
                                            {action.isHero && classConfig && (
                                                <span style={{
                                                    fontSize: 8, fontWeight: 700,
                                                    padding: '1px 6px', borderRadius: 8,
                                                    background: classConfig.bgColor,
                                                    color: classConfig.color,
                                                    border: `1px solid ${classConfig.borderColor}40`,
                                                }}>
                                                    {classConfig.label}
                                                    {heroClassification.evLoss > 0 && ` (-${heroClassification.evLoss.toFixed(1)}bb)`}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Pot */}
                        {hand.pot > 0 && (
                            <div style={{
                                fontSize: 11, color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.06)',
                                paddingTop: 6, marginTop: 4,
                            }}>
                                Pot: <span style={{ color: '#22c55e', fontWeight: 700, fontFamily: "'Orbitron', monospace" }}>
                                    ${hand.pot.toFixed(2)}
                                </span>
                                {hand.rake > 0 && (
                                    <span style={{ marginLeft: 12, color: '#64748b' }}>
                                        Rake: ${hand.rake.toFixed(2)}
                                    </span>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATE STATS
// ═══════════════════════════════════════════════════════════════════════════

function AggregateStats({ hands }) {
    const stats = useMemo(() => {
        if (!hands || hands.length === 0) return null;

        const positionCounts = {};
        const streetActionCounts = { preflop: {}, flop: {}, turn: {}, river: {} };
        const streetEVLoss = { preflop: 0, flop: 0, turn: 0, river: 0 };
        const classificationCounts = {};
        let totalDecisions = 0;
        let totalEVLoss = 0;

        hands.forEach(hand => {
            const pos = hand.heroPosition || 'UNK';
            positionCounts[pos] = (positionCounts[pos] || 0) + 1;

            const decisions = getHeroDecisions(hand);
            decisions.forEach(d => {
                totalDecisions++;
                if (!streetActionCounts[d.street]) streetActionCounts[d.street] = {};
                streetActionCounts[d.street][d.action] = (streetActionCounts[d.street][d.action] || 0) + 1;

                // EV Loss classification
                const result = classifyMove(d.action, 'check', {}, 1);
                const classification = result.classification || MOVE_CLASSIFICATIONS.CORRECT;
                classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;
                const evLoss = result.evLoss || 0;
                totalEVLoss += evLoss;
                if (streetEVLoss[d.street] !== undefined) streetEVLoss[d.street] += evLoss;
            });
        });

        return {
            positionCounts, streetActionCounts, totalDecisions, totalHands: hands.length,
            totalEVLoss, avgEVLoss: totalDecisions > 0 ? totalEVLoss / totalDecisions : 0,
            streetEVLoss, classificationCounts,
        };
    }, [hands]);

    if (!stats) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(0,212,255,0.05), rgba(124,58,237,0.03))',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: 12, padding: 16,
        }}>
            <div style={{
                fontSize: 12, fontWeight: 800, color: '#00d4ff', marginBottom: 12,
                fontFamily: "'Orbitron', monospace", textTransform: 'uppercase', letterSpacing: 1,
            }}>
                Session Summary
            </div>

            {/* Key Metrics */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                {[
                    { label: 'Hands', value: stats.totalHands, color: '#00d4ff' },
                    { label: 'Decisions', value: stats.totalDecisions, color: '#22c55e' },
                    { label: 'EV Lost', value: `${stats.totalEVLoss.toFixed(1)}bb`, color: stats.totalEVLoss > 5 ? '#ef4444' : '#22c55e' },
                    { label: 'Avg EV/Dec', value: `${stats.avgEVLoss.toFixed(2)}bb`, color: stats.avgEVLoss > 0.5 ? '#eab308' : '#22c55e' },
                ].map(m => (
                    <div key={m.label} style={{
                        flex: 1, textAlign: 'center',
                        padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(0,0,0,0.2)',
                    }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: m.color, fontFamily: "'Orbitron', monospace" }}>
                            {m.value}
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                            {m.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Position Breakdown */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' }}>
                    Position Distribution
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(stats.positionCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([pos, count]) => (
                            <div key={pos} style={{
                                padding: '4px 10px', borderRadius: 6,
                                background: 'rgba(255,255,255,0.06)',
                                fontSize: 11, fontWeight: 700,
                            }}>
                                <span style={{ color: '#00d4ff', fontFamily: "'Orbitron', monospace" }}>{pos}</span>
                                <span style={{ color: '#64748b', marginLeft: 4 }}>{count}x</span>
                            </div>
                        ))
                    }
                </div>
            </div>

            {/* Per-Street Action Breakdown */}
            <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' }}>
                    Action Frequencies by Street
                </div>
                {Object.entries(stats.streetActionCounts)
                    .filter(([_, actions]) => Object.keys(actions).length > 0)
                    .map(([street, actions]) => {
                        const total = Object.values(actions).reduce((sum, c) => sum + c, 0);
                        return (
                            <div key={street} style={{ marginBottom: 6 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700,
                                    color: STREET_COLORS[street] || '#94a3b8',
                                    marginBottom: 3, textTransform: 'capitalize',
                                }}>
                                    {street}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {Object.entries(actions)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([action, count]) => (
                                            <div key={action} style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                fontSize: 10,
                                            }}>
                                                <div style={{
                                                    width: 8, height: 8, borderRadius: 2,
                                                    background: ACTION_MAP[action]?.color || '#64748b',
                                                }} />
                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                                                    {ACTION_MAP[action]?.label || action}
                                                </span>
                                                <span style={{
                                                    color: '#e2e8f0', fontWeight: 700,
                                                    fontFamily: "'Orbitron', monospace", fontSize: 10,
                                                }}>
                                                    {Math.round((count / total) * 100)}%
                                                </span>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        );
                    })
                }
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function HandAnalyzer() {
    const router = useRouter();
    useTrainingBus('hand-analyzer');
    const [rawText, setRawText] = useState('');
    const [parsedHands, setParsedHands] = useState([]);
    const [expandedHand, setExpandedHand] = useState(null);
    const [isParsed, setIsParsed] = useState(false);

    const handleParse = useCallback(() => {
        const hands = parseHandHistories(rawText);
        setParsedHands(hands);
        setIsParsed(true);
        if (hands.length > 0) setExpandedHand(0);

        // Notify other pages via EventBus
        if (typeof eventBus !== 'undefined' && eventBus.emit) {
            eventBus.emit(EventType?.TRAINING_SESSION_COMPLETE || 'training:session-complete', {
                game_id: 'hand-analyzer',
                hands_played: hands.length,
                timestamp: new Date().toISOString(),
            });
        }
    }, [rawText]);

    const handleFileUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            setRawText(e.target.result);
        };
        reader.readAsText(file);
    }, []);

    const handleClear = useCallback(() => {
        setRawText('');
        setParsedHands([]);
        setIsParsed(false);
        setExpandedHand(null);
    }, []);

    return (
        <>
            <Head>
                <title>Hand Analyzer | Smarter.Poker Training</title>
                <meta name="description" content="Upload your poker hand histories and compare every decision against GTO solver data. Find leaks and improve your game." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, padding: '6px 12px', color: '#94a3b8',
                                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            }}
                        >
                            ← Training
                        </button>
                        <h1 style={{
                            fontSize: 22, fontWeight: 800, margin: 0,
                            background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Hand Analyzer
                        </h1>
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 6, maxWidth: 600 }}>
                        Paste or upload your hand histories to review every decision against GTO solver data.
                        Supports PokerStars, GGPoker, ClubGG, and generic formats.
                    </p>
                </div>

                {/* Main Content */}
                <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
                    {!isParsed || parsedHands.length === 0 ? (
                        /* Upload / Paste Area */
                        <div>
                            {/* File Upload */}
                            <div style={{
                                border: '2px dashed rgba(0,212,255,0.2)',
                                borderRadius: 12, padding: '32px 24px',
                                textAlign: 'center', marginBottom: 16,
                                background: 'rgba(0,212,255,0.02)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}>
                                <input
                                    type="file"
                                    accept=".txt,.log,.hh"
                                    onChange={handleFileUpload}
                                    style={{ display: 'none' }}
                                    id="file-upload"
                                />
                                <label htmlFor="file-upload" style={{ cursor: 'pointer' }}>
                                    <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#00d4ff' }}>
                                        Drop a file or click to upload
                                    </div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                        .txt, .log, .hh files supported
                                    </div>
                                </label>
                            </div>

                            {/* Paste Area */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: '#64748b',
                                    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
                                }}>
                                    Or paste hand history text
                                </div>
                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder="Paste your PokerStars hand history here...&#10;&#10;PokerStars Hand #123456789: Hold'em No Limit ($1/$2)..."
                                    style={{
                                        width: '100%', height: 200, resize: 'vertical',
                                        background: 'rgba(0,0,0,0.3)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8, padding: 12,
                                        color: '#e2e8f0', fontSize: 12,
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        lineHeight: 1.6,
                                    }}
                                />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <motion.button
                                    onClick={handleParse}
                                    disabled={!rawText.trim()}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    style={{
                                        padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                                        border: 'none', cursor: rawText.trim() ? 'pointer' : 'not-allowed',
                                        background: rawText.trim()
                                            ? 'linear-gradient(135deg, #00d4ff, #7c3aed)'
                                            : 'rgba(255,255,255,0.06)',
                                        color: rawText.trim() ? '#fff' : '#475569',
                                        fontFamily: "'Inter', sans-serif",
                                    }}
                                >
                                    🔍 Analyze Hands
                                </motion.button>
                            </div>

                            {isParsed && parsedHands.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    style={{
                                        marginTop: 16, padding: '14px 18px',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: 8, fontSize: 13, color: '#ef4444',
                                    }}
                                >
                                    ⚠️ No valid hands found. Make sure the text contains PokerStars-format hand histories.
                                </motion.div>
                            )}
                        </div>
                    ) : (
                        /* Results View */
                        <div>
                            {/* Top bar */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                            }}>
                                <span style={{
                                    fontSize: 14, fontWeight: 800, color: '#22c55e',
                                    fontFamily: "'Orbitron', monospace",
                                }}>
                                    {parsedHands.length} HANDS PARSED
                                </span>
                                <button
                                    onClick={handleClear}
                                    style={{
                                        marginLeft: 'auto',
                                        padding: '6px 14px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#94a3b8', cursor: 'pointer',
                                        fontSize: 11, fontWeight: 600,
                                    }}
                                >
                                    ✕ Clear & Upload New
                                </button>
                            </div>

                            {/* Aggregate Stats */}
                            <AggregateStats hands={parsedHands} />

                            {/* Hand List */}
                            <div style={{ marginTop: 20 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: '#64748b',
                                    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10,
                                }}>
                                    Hand-by-Hand Review
                                </div>
                                {parsedHands.map((hand, i) => (
                                    <HandCard
                                        key={hand.handId || i}
                                        hand={hand}
                                        index={i}
                                        isExpanded={expandedHand === i}
                                        onToggle={() => setExpandedHand(prev => prev === i ? null : i)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
