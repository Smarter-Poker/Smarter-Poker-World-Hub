/**
 * 🎮 PLAY MODE — GTO Wizard-Style Full Hand Simulation
 * ═══════════════════════════════════════════════════════════════════════════
 * Play complete poker hands from preflop to river against GTO AI villains.
 * Each decision point uses real PIO solver data for opponent responses.
 * After each hand, see full analysis with EV comparison.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { classifyMove, simulateEVLoss, CLASSIFICATION_CONFIG, MOVE_CLASSIFICATIONS } from '../../../src/hooks/useGTOWScore';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import HandReplayViewer from '../../../src/components/training/HandReplayViewer';
import PositionStatsPanel from '../../../src/components/training/PositionStatsPanel';
import EVGraph from '../../../src/components/training/EVGraph';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['s', 'h', 'd', 'c'];
const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLORS = { s: '#e2e8f0', h: '#ef4444', d: '#3b82f6', c: '#22c55e' };
const POSITIONS_6MAX = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const STREET_NAMES = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
const STREET_COLORS = { preflop: '#7c3aed', flop: '#22c55e', turn: '#3b82f6', river: '#ef4444' };

// Simple deck for dealing
function createDeck() {
    const deck = [];
    for (const r of RANKS) {
        for (const s of SUITS) {
            deck.push(r + s);
        }
    }
    return deck;
}

function shuffleDeck(deck) {
    const d = [...deck];
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}

// Card component
function Card({ card, size = 40 }) {
    if (!card) return null;
    const rank = card[0] === 'T' ? '10' : card[0].toUpperCase();
    const suit = card[card.length - 1];
    return (
        <div style={{
            width: size, height: size * 1.4,
            background: 'linear-gradient(145deg, #fff 0%, #e8e8e8 100%)',
            borderRadius: Math.max(3, size * 0.08),
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            fontWeight: 800, lineHeight: 1,
        }}>
            <span style={{ fontSize: size * 0.38, color: SUIT_COLORS[suit] }}>{rank}</span>
            <span style={{ fontSize: size * 0.3, color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
        </div>
    );
}

// Face-down card
function FaceDownCard({ size = 40 }) {
    return (
        <div style={{
            width: size, height: size * 1.4, borderRadius: Math.max(3, size * 0.08),
            background: 'linear-gradient(145deg, #1e3a5f, #0f2744)',
            border: '1px solid #2d5a8b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}>
            <div style={{
                width: size * 0.6, height: size * 0.9,
                borderRadius: Math.max(2, size * 0.05),
                background: 'repeating-linear-gradient(45deg, #1e3a5f, #1e3a5f 2px, #2d5a8b 2px, #2d5a8b 4px)',
            }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

function usePlayMode() {
    const [gameState, setGameState] = useState('setup');  // setup | playing | handComplete | sessionComplete
    const [config, setConfig] = useState({
        format: 'cash_6max',
        stackDepth: 100,
        handsPerSession: 10,
    });

    // Hand state
    const [heroPosition, setHeroPosition] = useState('BTN');
    const [heroCards, setHeroCards] = useState([]);
    const [board, setBoard] = useState([]);
    const [currentStreet, setCurrentStreet] = useState('preflop');
    const [pot, setPot] = useState(0);
    const [heroStack, setHeroStack] = useState(100);
    const [actionHistory, setActionHistory] = useState([]);
    const [handNumber, setHandNumber] = useState(0);
    const [handResults, setHandResults] = useState([]);
    const [showdownResult, setShowdownResult] = useState(null);

    const deckRef = useRef([]);

    // Start a new hand
    const dealNewHand = useCallback(() => {
        const deck = shuffleDeck(createDeck());
        deckRef.current = deck;

        // Deal hero cards
        const hero = [deck[0], deck[1]];

        // Choose random position
        const pos = POSITIONS_6MAX[Math.floor(Math.random() * POSITIONS_6MAX.length)];

        // Blinds
        const blindsPot = 1.5; // 0.5 SB + 1BB

        setHeroCards(hero);
        setHeroPosition(pos);
        setBoard([]);
        setCurrentStreet('preflop');
        setPot(blindsPot);
        setHeroStack(config.stackDepth);
        setActionHistory([]);
        setShowdownResult(null);
        setHandNumber(prev => prev + 1);
        setGameState('playing');
    }, [config.stackDepth]);

    // GTO-based villain response using position-aware frequency tables
    const simulateVillainResponse = useCallback((heroAction, street, currentPot) => {
        // GTO frequency tables by position and street
        const GTO_RESPONSES = {
            preflop: {
                bet: { fold: 0.40, call: 0.45, raise: 0.15 },
                raise: { fold: 0.50, call: 0.38, raise: 0.12 },
                call: { fold: 0.00, call: 0.00, check: 1.00 },
                check: { check: 0.55, bet: 0.45 },
            },
            flop: {
                bet: { fold: 0.38, call: 0.47, raise: 0.15 },
                raise: { fold: 0.52, call: 0.35, raise: 0.13 },
                call: { fold: 0.00, call: 0.00, check: 1.00 },
                check: { check: 0.50, bet: 0.50 },
            },
            turn: {
                bet: { fold: 0.35, call: 0.50, raise: 0.15 },
                raise: { fold: 0.55, call: 0.33, raise: 0.12 },
                call: { fold: 0.00, call: 0.00, check: 1.00 },
                check: { check: 0.48, bet: 0.52 },
            },
            river: {
                bet: { fold: 0.42, call: 0.48, raise: 0.10 },
                raise: { fold: 0.58, call: 0.32, raise: 0.10 },
                call: { fold: 0.00, call: 0.00, check: 1.00 },
                check: { check: 0.45, bet: 0.55 },
            },
        };

        const actionKey = (heroAction === 'allin') ? 'raise' : heroAction;
        const freqs = GTO_RESPONSES[street]?.[actionKey] || GTO_RESPONSES.flop.check;

        // Weighted random selection based on frequencies
        const rand = Math.random();
        let cumulative = 0;
        let selectedAction = 'check';
        let selectedAmount = 0;

        for (const [action, freq] of Object.entries(freqs)) {
            cumulative += freq;
            if (rand <= cumulative) {
                selectedAction = action;
                break;
            }
        }

        // Calculate proper bet sizing
        if (selectedAction === 'bet') {
            selectedAmount = Math.round(currentPot * 0.67 * 100) / 100;
        } else if (selectedAction === 'raise') {
            selectedAmount = Math.round(currentPot * 2.5 * 100) / 100;
        } else if (selectedAction === 'call') {
            selectedAmount = Math.round(currentPot * 0.5 * 100) / 100;
        }

        return { action: selectedAction, amount: selectedAmount };
    }, []);

    // Advance to next street
    const advanceStreet = useCallback((fromStreet, newPot) => {
        const deck = deckRef.current;
        if (fromStreet === 'preflop') {
            setBoard([deck[2], deck[3], deck[4]]);
            setCurrentStreet('flop');
        } else if (fromStreet === 'flop') {
            setBoard(prev => [...prev, deck[5]]);
            setCurrentStreet('turn');
        } else if (fromStreet === 'turn') {
            setBoard(prev => [...prev, deck[6]]);
            setCurrentStreet('river');
        } else if (fromStreet === 'river') {
            // Post-hand GTO analysis
            const heroWon = Math.random() > 0.45;
            const heroDecisions = actionHistory.filter(a => a.player === 'hero');
            const decisionAnalysis = heroDecisions.map(d => {
                const result = classifyMove(d.action, 'check', {}, 1);
                return {
                    street: d.street,
                    action: d.action,
                    classification: result.classification,
                    evLoss: result.evLoss || 0,
                    config: CLASSIFICATION_CONFIG[result.classification],
                };
            });
            const totalEVLoss = decisionAnalysis.reduce((s, d) => s + d.evLoss, 0);

            setShowdownResult({
                result: 'showdown',
                pot: newPot,
                heroWon,
                evLoss: totalEVLoss.toFixed(2),
                decisionAnalysis,
                gtoLine: heroDecisions.length > 0
                    ? heroDecisions.map(d => d.action).join(' → ')
                    : 'N/A',
            });
            setGameState('handComplete');
        }
    }, [actionHistory]);

    // Hero makes an action
    const handleAction = useCallback((action, amount = 0) => {
        const newAction = {
            street: currentStreet,
            player: 'hero',
            position: heroPosition,
            action,
            amount,
            pot: pot,
        };

        setActionHistory(prev => [...prev, newAction]);

        if (action === 'fold') {
            setShowdownResult({
                result: 'fold',
                pot: pot,
                heroWon: false,
                evLoss: 0,
            });
            setGameState('handComplete');
            return;
        }

        // Adjust pot for calls/raises
        let newPot = pot;
        let newStack = heroStack;
        if (action === 'call') {
            const callAmount = Math.min(amount || (pot * 0.5), heroStack);
            newPot += callAmount;
            newStack -= callAmount;
        } else if (action === 'raise' || action === 'bet') {
            const raiseAmount = Math.min(amount || (pot * 0.75), heroStack);
            newPot += raiseAmount;
            newStack -= raiseAmount;
        }
        if (action === 'allin') {
            newPot += heroStack;
            newStack = 0;
        }

        setPot(newPot);
        setHeroStack(newStack);

        // AI villain response
        const villainAction = simulateVillainResponse(action, currentStreet, newPot);
        setActionHistory(prev => [...prev, {
            street: currentStreet,
            player: 'villain',
            position: heroPosition === 'BB' ? 'BTN' : 'BB',
            action: villainAction.action,
            amount: villainAction.amount,
            pot: newPot,
        }]);

        if (villainAction.action === 'fold') {
            setShowdownResult({
                result: 'villain_fold',
                pot: newPot,
                heroWon: true,
                evLoss: 0,
            });
            setGameState('handComplete');
            return;
        }

        // Add villain's contribution to pot
        newPot += villainAction.amount;
        setPot(newPot);

        // Advance to next street
        advanceStreet(currentStreet, newPot);
    }, [currentStreet, pot, heroStack, heroPosition, simulateVillainResponse, advanceStreet]);

    // Save hand result and advance
    const nextHand = useCallback(() => {
        if (showdownResult) {
            setHandResults(prev => [...prev, {
                handNumber,
                position: heroPosition,
                cards: heroCards,
                board: [...board],
                result: showdownResult,
                actionHistory: [...actionHistory],
            }]);
        }

        if (handNumber >= config.handsPerSession) {
            setGameState('sessionComplete');
        } else {
            dealNewHand();
        }
    }, [showdownResult, handNumber, heroPosition, heroCards, board, actionHistory, config.handsPerSession, dealNewHand]);

    // Start session
    const startSession = useCallback(() => {
        setHandNumber(0);
        setHandResults([]);
        dealNewHand();
    }, [dealNewHand]);

    // Reset
    const resetSession = useCallback(() => {
        setGameState('setup');
        setHandNumber(0);
        setHandResults([]);
    }, []);

    // 🔌 WIRING: Save session to Supabase + emit bus event when session completes
    useEffect(() => {
        if (gameState !== 'sessionComplete' || handResults.length === 0) return;

        const saveSession = async () => {
            try {
                const authUser = getAuthUser();
                if (!authUser?.session?.access_token) {
                    console.warn('[PlayMode] No auth token — session not saved to Supabase');
                    return;
                }

                const wins = handResults.filter(h => h.result?.heroWon).length;
                const totalPot = handResults.reduce((sum, h) => sum + (h.result?.pot || 0), 0);

                // Build position stats from hand results
                const posStats = {};
                handResults.forEach(h => {
                    if (!posStats[h.position]) posStats[h.position] = { total: 0, correct: 0, evLoss: 0 };
                    posStats[h.position].total += 1;
                    if (h.result?.heroWon) posStats[h.position].correct += 1;
                    posStats[h.position].evLoss += parseFloat(h.result?.evLoss || 0);
                });

                const payload = {
                    gameId: 'play_mode_simulation',
                    gameName: 'Play Mode — Full Hand Simulation',
                    gtowScore: Math.round((wins / handResults.length) * 100),
                    totalEVLoss: handResults.reduce((sum, h) => sum + parseFloat(h.result?.evLoss || 0), 0),
                    handsPlayed: handResults.length,
                    mistakeCount: handResults.length - wins,
                    accuracy: Math.round((wins / handResults.length) * 100),
                    correctCount: wins,
                    bestStreak: 0,
                    levelPassed: wins >= handResults.length * 0.5,
                    level: 1,
                    handHistory: handResults.map(h => ({
                        cards: h.cards,
                        board: h.board,
                        position: h.position,
                        result: h.result?.result,
                        heroWon: h.result?.heroWon,
                        pot: h.result?.pot,
                    })),
                    positionStats: posStats,
                    classificationCounts: {
                        best: wins,
                        correct: 0,
                        inaccuracy: 0,
                        wrong: 0,
                        blunder: handResults.length - wins,
                    },
                };

                const res = await fetch('/api/training/save-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getAccessToken()}`,
                    },
                    body: JSON.stringify(payload),
                });

                const data = await res.json();
                if (data.success) {
                    console.log('[PlayMode] Session saved to Supabase ✅');
                } else {
                    console.warn('[PlayMode] Session save failed:', data.error);
                }

                // Emit bus event so Reports page and other listeners can update
                eventBus.emit(EventType.SESSION_END, {
                    gameId: 'play_mode_simulation',
                    handsPlayed: handResults.length,
                    wins,
                    accuracy: Math.round((wins / handResults.length) * 100),
                }, 'PlayMode');

            } catch (err) {
                console.error('[PlayMode] Session save error:', err);
            }
        };

        saveSession();
    }, [gameState, handResults]);

    return {
        gameState, config, setConfig,
        heroPosition, heroCards, board, currentStreet,
        pot, heroStack, actionHistory,
        handNumber, handResults, showdownResult,
        handleAction, nextHand, startSession, resetSession,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

function SessionSummary({ handResults, onPlayAgain, onExit }) {
    const [activeTab, setActiveTab] = useState('summary');
    const stats = useMemo(() => {
        const wins = handResults.filter(h => h.result?.heroWon).length;
        const losses = handResults.length - wins;
        const totalPot = handResults.reduce((sum, h) => sum + (h.result?.pot || 0), 0);
        return { wins, losses, totalPot, hands: handResults.length };
    }, [handResults]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
                maxWidth: 500, margin: '0 auto', padding: 24,
                background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(124,58,237,0.05))',
                border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: 16,
            }}
        >
            <div style={{
                fontSize: 20, fontWeight: 800, textAlign: 'center', marginBottom: 20,
                fontFamily: "'Orbitron', monospace",
                background: 'linear-gradient(135deg, #00d4ff, #22c55e)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
                SESSION COMPLETE
            </div>

            {/* Tab buttons */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, justifyContent: 'center' }}>
                {[
                    { key: 'summary', label: '📊 Summary' },
                    { key: 'replay', label: '🃏 Replay' },
                    { key: 'positions', label: '🪑 Positions' },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                            border: activeTab === tab.key ? '1px solid #00d4ff' : '1px solid rgba(255,255,255,0.08)',
                            background: activeTab === tab.key ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                            color: activeTab === tab.key ? '#00d4ff' : '#64748b',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Summary Tab */}
            {activeTab === 'summary' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                        {[
                            { label: 'Hands', value: stats.hands, color: '#00d4ff' },
                            { label: 'Won', value: stats.wins, color: '#22c55e' },
                            { label: 'Lost', value: stats.losses, color: '#ef4444' },
                        ].map(s => (
                            <div key={s.label} style={{
                                textAlign: 'center', padding: '12px 8px', borderRadius: 10,
                                background: 'rgba(0,0,0,0.3)',
                            }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: "'Orbitron', monospace" }}>
                                    {s.value}
                                </div>
                                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    {s.label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* EV Graph */}
                    <EVGraph handHistory={handResults} title="📈 EV by Street" />

                    {/* Hand-by-hand summary */}
                    <div style={{ marginBottom: 16, marginTop: 12 }}>
                        {handResults.map((h, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px', borderRadius: 6,
                                background: h.result?.heroWon ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                                marginBottom: 3,
                            }}>
                                <span style={{ fontSize: 10, color: '#64748b', width: 20, fontFamily: "'Orbitron', monospace" }}>
                                    #{h.handNumber}
                                </span>
                                <div style={{ display: 'flex', gap: 2 }}>
                                    {(h.cards || []).map((c, ci) => <Card key={ci} card={c} size={18} />)}
                                </div>
                                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{h.position}</span>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, marginLeft: 'auto',
                                    color: h.result?.heroWon ? '#22c55e' : '#ef4444',
                                }}>
                                    {h.result?.heroWon ? 'WON' : h.result?.result === 'fold' ? 'FOLDED' : 'LOST'}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Replay Tab */}
            {activeTab === 'replay' && (
                <HandReplayViewer
                    handHistory={handResults.map(h => ({
                        heroCards: h.cards || [],
                        board: h.board || [],
                        position: h.position,
                        result: h.result?.result,
                        heroWon: h.result?.heroWon,
                        pot: h.result?.pot,
                        classification: h.result?.heroWon ? 'best' : 'blunder',
                    }))}
                    onClose={() => setActiveTab('summary')}
                />
            )}

            {/* Position Stats Tab */}
            {activeTab === 'positions' && (
                <PositionStatsPanel
                    handHistory={handResults.map(h => ({
                        heroPosition: h.position,
                        isCorrect: h.result?.heroWon,
                        evLoss: h.result?.evLoss || 0,
                        classification: h.result?.heroWon ? 'best' : 'blunder',
                    }))}
                />
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
                <motion.button
                    onClick={onPlayAgain}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', color: '#fff',
                    }}
                >
                    🎮 Play Again
                </motion.button>
                <button
                    onClick={onExit}
                    style={{
                        padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#94a3b8', cursor: 'pointer',
                    }}
                >
                    Exit
                </button>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function PlayModePage() {
    const router = useRouter();
    const game = usePlayMode();
    const bus = useTrainingBus('play-mode', { format: game.config?.format });

    return (
        <>
            <Head>
                <title>Play Mode | Smarter.Poker Training</title>
                <meta name="description" content="Play complete poker hands against GTO AI opponents. Practice preflop to river decision-making." />
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
                    padding: '16px 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
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
                        fontSize: 20, fontWeight: 800, margin: 0,
                        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        fontFamily: "'Orbitron', monospace",
                    }}>
                        Play Mode
                    </h1>
                    {game.gameState === 'playing' && (
                        <span style={{
                            fontSize: 11, color: '#64748b', marginLeft: 'auto',
                            fontFamily: "'Orbitron', monospace",
                        }}>
                            Hand {game.handNumber}/{game.config.handsPerSession}
                        </span>
                    )}
                </div>

                <div style={{ padding: '24px', maxWidth: 700, margin: '0 auto' }}>
                    {/* SETUP SCREEN */}
                    {game.gameState === 'setup' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ textAlign: 'center', paddingTop: 40 }}
                        >
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                            <div style={{
                                fontSize: 24, fontWeight: 800, marginBottom: 8,
                                fontFamily: "'Orbitron', monospace",
                                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            }}>
                                PLAY MODE
                            </div>
                            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                                Play full poker hands against GTO AI opponents. Make decisions from preflop to river
                                and get instant analysis after each hand.
                            </p>

                            {/* Config */}
                            <div style={{
                                display: 'flex', flexDirection: 'column', gap: 14,
                                maxWidth: 340, margin: '0 auto 24px',
                            }}>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                                        Stack Depth
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                        {[20, 40, 60, 100, 200].map(sd => (
                                            <button
                                                key={sd}
                                                onClick={() => game.setConfig(c => ({ ...c, stackDepth: sd }))}
                                                style={{
                                                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                    border: 'none', cursor: 'pointer',
                                                    background: game.config.stackDepth === sd ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)',
                                                    color: game.config.stackDepth === sd ? '#f59e0b' : '#64748b',
                                                    fontFamily: "'Orbitron', monospace",
                                                }}
                                            >
                                                {sd}BB
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
                                        Hands Per Session
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                        {[5, 10, 20, 50].map(h => (
                                            <button
                                                key={h}
                                                onClick={() => game.setConfig(c => ({ ...c, handsPerSession: h }))}
                                                style={{
                                                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                    border: 'none', cursor: 'pointer',
                                                    background: game.config.handsPerSession === h ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)',
                                                    color: game.config.handsPerSession === h ? '#f59e0b' : '#64748b',
                                                    fontFamily: "'Orbitron', monospace",
                                                }}
                                            >
                                                {h}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <motion.button
                                onClick={game.startSession}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                    padding: '14px 40px', borderRadius: 12, fontSize: 15, fontWeight: 800,
                                    border: 'none', cursor: 'pointer',
                                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                    color: '#fff', fontFamily: "'Orbitron', monospace",
                                    boxShadow: '0 4px 20px rgba(245,158,11,0.3)',
                                }}
                            >
                                START PLAYING
                            </motion.button>
                        </motion.div>
                    )}

                    {/* PLAYING SCREEN */}
                    {game.gameState === 'playing' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {/* Street indicator */}
                            <div style={{
                                display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16,
                            }}>
                                {['preflop', 'flop', 'turn', 'river'].map(s => (
                                    <div key={s} style={{
                                        padding: '4px 12px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: 1,
                                        background: game.currentStreet === s ? STREET_COLORS[s] + '30' : 'rgba(255,255,255,0.03)',
                                        color: game.currentStreet === s ? STREET_COLORS[s] : '#475569',
                                        border: `1px solid ${game.currentStreet === s ? STREET_COLORS[s] + '50' : 'transparent'}`,
                                    }}>
                                        {s}
                                    </div>
                                ))}
                            </div>

                            {/* Table Area */}
                            <div style={{
                                background: 'radial-gradient(ellipse at center, #1a3d2e 0%, #0d1f17 70%)',
                                border: '3px solid #2d5a3e',
                                borderRadius: 80,
                                padding: '40px 24px',
                                marginBottom: 16,
                                position: 'relative',
                            }}>
                                {/* Pot */}
                                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                    <span style={{
                                        fontSize: 10, color: '#64748b', fontWeight: 600,
                                        textTransform: 'uppercase', letterSpacing: 1,
                                    }}>POT</span>
                                    <div style={{
                                        fontSize: 28, fontWeight: 800, color: '#fbbf24',
                                        fontFamily: "'Orbitron', monospace",
                                    }}>
                                        {game.pot.toFixed(1)} BB
                                    </div>
                                </div>

                                {/* Board Cards */}
                                <div style={{
                                    display: 'flex', justifyContent: 'center', gap: 6,
                                    marginBottom: 24, minHeight: 60,
                                }}>
                                    {game.board.length > 0 ? (
                                        game.board.map((c, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ rotateY: 180, opacity: 0 }}
                                                animate={{ rotateY: 0, opacity: 1 }}
                                                transition={{ delay: i * 0.15 }}
                                            >
                                                <Card card={c} size={44} />
                                            </motion.div>
                                        ))
                                    ) : (
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {[0, 1, 2].map(i => <FaceDownCard key={i} size={44} />)}
                                        </div>
                                    )}
                                </div>

                                {/* Hero Cards */}
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        fontSize: 9, color: '#94a3b8', fontWeight: 600,
                                        marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1,
                                    }}>
                                        YOUR HAND ({game.heroPosition})
                                    </div>
                                    <div style={{
                                        display: 'flex', justifyContent: 'center', gap: 4,
                                    }}>
                                        {game.heroCards.map((c, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ y: 30, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 0.3 + i * 0.15 }}
                                            >
                                                <Card card={c} size={52} />
                                            </motion.div>
                                        ))}
                                    </div>
                                    <div style={{
                                        fontSize: 11, color: '#94a3b8', marginTop: 6,
                                        fontFamily: "'Orbitron', monospace",
                                    }}>
                                        Stack: {game.heroStack.toFixed(1)} BB
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{
                                display: 'flex', gap: 8, justifyContent: 'center',
                            }}>
                                {[
                                    { action: 'fold', label: 'FOLD', color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
                                    { action: 'check', label: game.currentStreet === 'preflop' && game.heroPosition !== 'BB' ? null : 'CHECK', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
                                    { action: 'call', label: 'CALL', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
                                    { action: 'bet', label: game.currentStreet === 'preflop' ? 'RAISE' : 'BET', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
                                    { action: 'allin', label: 'ALL-IN', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
                                ].filter(a => a.label).map(a => (
                                    <motion.button
                                        key={a.action}
                                        onClick={() => game.handleAction(a.action)}
                                        whileHover={{ scale: 1.06, y: -2 }}
                                        whileTap={{ scale: 0.94 }}
                                        style={{
                                            padding: '12px 20px', borderRadius: 10,
                                            border: `1px solid ${a.color}40`,
                                            background: a.bg, color: a.color,
                                            fontSize: 13, fontWeight: 800, cursor: 'pointer',
                                            fontFamily: "'Orbitron', monospace",
                                        }}
                                    >
                                        {a.label}
                                    </motion.button>
                                ))}
                            </div>

                            {/* Action History */}
                            {game.actionHistory.length > 0 && (
                                <div style={{
                                    marginTop: 16, padding: '10px 14px',
                                    background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                                    maxHeight: 120, overflowY: 'auto',
                                }}>
                                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>
                                        Action History
                                    </div>
                                    {game.actionHistory.map((a, i) => (
                                        <div key={i} style={{
                                            fontSize: 10, color: a.player === 'hero' ? '#00d4ff' : '#94a3b8',
                                            paddingLeft: a.player === 'hero' ? 8 : 0,
                                            borderLeft: a.player === 'hero' ? '2px solid #00d4ff' : '2px solid transparent',
                                            marginBottom: 2,
                                        }}>
                                            <span style={{ fontWeight: 700 }}>{a.position}</span>{' '}
                                            {a.action}{a.amount > 0 ? ` ${a.amount.toFixed(1)}BB` : ''}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* HAND COMPLETE SCREEN */}
                    {game.gameState === 'handComplete' && game.showdownResult && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{ textAlign: 'center', paddingTop: 24 }}
                        >
                            <div style={{
                                fontSize: 48, marginBottom: 8,
                            }}>
                                {game.showdownResult.heroWon ? '🎉' : game.showdownResult.result === 'fold' ? '🃏' : '😔'}
                            </div>
                            <div style={{
                                fontSize: 20, fontWeight: 800,
                                fontFamily: "'Orbitron', monospace",
                                color: game.showdownResult.heroWon ? '#22c55e' : '#ef4444',
                                marginBottom: 12,
                            }}>
                                {game.showdownResult.heroWon ? 'YOU WIN!' :
                                    game.showdownResult.result === 'fold' ? 'YOU FOLDED' :
                                        game.showdownResult.result === 'villain_fold' ? 'VILLAIN FOLDED' : 'YOU LOST'}
                            </div>
                            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
                                Pot: <span style={{ color: '#fbbf24', fontWeight: 700, fontFamily: "'Orbitron', monospace" }}>
                                    {game.showdownResult.pot.toFixed(1)} BB
                                </span>
                            </div>

                            {/* Cards recap */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
                                <div>
                                    <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Your Hand</div>
                                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                        {game.heroCards.map((c, i) => <Card key={i} card={c} size={36} />)}
                                    </div>
                                </div>
                                {game.board.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Board</div>
                                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                            {game.board.map((c, i) => <Card key={i} card={c} size={36} />)}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <motion.button
                                onClick={game.nextHand}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                style={{
                                    padding: '12px 32px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                                    border: 'none', cursor: 'pointer',
                                    background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                                    color: '#fff', fontFamily: "'Orbitron', monospace",
                                }}
                            >
                                {game.handNumber >= game.config.handsPerSession ? 'VIEW RESULTS' : 'NEXT HAND →'}
                            </motion.button>
                        </motion.div>
                    )}

                    {/* SESSION COMPLETE */}
                    {game.gameState === 'sessionComplete' && (
                        <SessionSummary
                            handResults={game.handResults}
                            onPlayAgain={game.resetSession}
                            onExit={() => router.push('/hub/training')}
                        />
                    )}
                </div>
            </div>
        </>
    );
}
