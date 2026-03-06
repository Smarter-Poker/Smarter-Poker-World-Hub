/**
 * 🎯 PREFLOP RANGE TRAINER — GTO Wizard-Style Preflop Range Quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Interactive 13x13 matrix quiz:
 * 1. Select a position (BTN, CO, HJ, etc.)
 * 2. Get dealt a random hand from the range
 * 3. Choose: Raise, Call, or Fold
 * 4. See feedback with the full range highlighted
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classifyMove, CLASSIFICATION_CONFIG } from '../../hooks/useGTOWScore';

// ═══ STANDARD GTO PREFLOP RANGES (RFI — Raise First In) ═══
// These are simplified solver-derived open-raising ranges by position (6-max, 100bb)
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Frequency: 1.0 = always raise, 0.5 = mixed (raise 50%), 0 = fold
const GTO_RANGES = {
    UTG: {
        // ~15% RFI
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 0.8, '88': 0.5, '77': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 0.8, 'A5s': 0.5, 'A4s': 0.3,
        'AKo': 1, 'AQo': 0.8, 'AJo': 0.5,
        'KQs': 1, 'KJs': 0.7, 'KTs': 0.4,
        'QJs': 0.7, 'QTs': 0.3,
        'JTs': 0.5, 'T9s': 0.3,
        '98s': 0.2, '87s': 0.2, '76s': 0.15,
    },
    HJ: {
        // ~19% RFI
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 0.7, '77': 0.5, '66': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.5, 'A5s': 0.7, 'A4s': 0.5, 'A3s': 0.3, 'A2s': 0.2,
        'AKo': 1, 'AQo': 1, 'AJo': 0.7, 'ATo': 0.4,
        'KQs': 1, 'KJs': 1, 'KTs': 0.7, 'K9s': 0.3,
        'QJs': 1, 'QTs': 0.6, 'Q9s': 0.2,
        'JTs': 0.8, 'J9s': 0.3,
        'T9s': 0.6, 'T8s': 0.2,
        '98s': 0.4, '87s': 0.3, '76s': 0.25, '65s': 0.2,
        'KQo': 0.5, 'KJo': 0.3,
    },
    CO: {
        // ~27% RFI
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 0.8, '66': 0.6, '55': 0.4, '44': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 0.8, 'A8s': 0.6, 'A7s': 0.5, 'A6s': 0.5, 'A5s': 1, 'A4s': 0.8, 'A3s': 0.6, 'A2s': 0.5,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.7, 'A9o': 0.3,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.6, 'K8s': 0.3,
        'QJs': 1, 'QTs': 1, 'Q9s': 0.5, 'Q8s': 0.2,
        'JTs': 1, 'J9s': 0.6, 'J8s': 0.2,
        'T9s': 1, 'T8s': 0.4,
        '98s': 0.7, '87s': 0.6, '76s': 0.5, '65s': 0.4, '54s': 0.3,
        'KQo': 1, 'KJo': 0.7, 'KTo': 0.4,
        'QJo': 0.5, 'QTo': 0.3,
        'JTo': 0.3,
    },
    BTN: {
        // ~45% RFI
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 1, '55': 0.8, '44': 0.7, '33': 0.5, '22': 0.4,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 1, 'A7s': 1, 'A6s': 1, 'A5s': 1, 'A4s': 1, 'A3s': 1, 'A2s': 1,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 1, 'A9o': 0.7, 'A8o': 0.5, 'A7o': 0.3, 'A6o': 0.2, 'A5o': 0.3, 'A4o': 0.2,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 1, 'K8s': 0.7, 'K7s': 0.6, 'K6s': 0.5, 'K5s': 0.4, 'K4s': 0.3, 'K3s': 0.2, 'K2s': 0.15,
        'QJs': 1, 'QTs': 1, 'Q9s': 1, 'Q8s': 0.6, 'Q7s': 0.3, 'Q6s': 0.3, 'Q5s': 0.2, 'Q4s': 0.15,
        'JTs': 1, 'J9s': 1, 'J8s': 0.5, 'J7s': 0.3, 'J6s': 0.15,
        'T9s': 1, 'T8s': 0.8, 'T7s': 0.3, 'T6s': 0.15,
        '98s': 1, '97s': 0.4, '96s': 0.15,
        '87s': 1, '86s': 0.3, '76s': 0.8, '75s': 0.2,
        '65s': 0.7, '64s': 0.15, '54s': 0.6, '53s': 0.1, '43s': 0.15,
        'KQo': 1, 'KJo': 1, 'KTo': 0.8, 'K9o': 0.4, 'K8o': 0.2,
        'QJo': 1, 'QTo': 0.7, 'Q9o': 0.3,
        'JTo': 0.8, 'J9o': 0.3,
        'T9o': 0.5, 'T8o': 0.15,
        '98o': 0.3, '87o': 0.2, '76o': 0.1,
    },
    SB: {
        // ~40% open-raise (limp or raise)
        'AA': 1, 'KK': 1, 'QQ': 1, 'JJ': 1, 'TT': 1, '99': 1, '88': 1, '77': 1, '66': 0.8, '55': 0.7, '44': 0.5, '33': 0.4, '22': 0.3,
        'AKs': 1, 'AQs': 1, 'AJs': 1, 'ATs': 1, 'A9s': 1, 'A8s': 0.8, 'A7s': 0.7, 'A6s': 0.7, 'A5s': 1, 'A4s': 0.8, 'A3s': 0.7, 'A2s': 0.6,
        'AKo': 1, 'AQo': 1, 'AJo': 1, 'ATo': 0.8, 'A9o': 0.5, 'A8o': 0.3, 'A5o': 0.2,
        'KQs': 1, 'KJs': 1, 'KTs': 1, 'K9s': 0.8, 'K8s': 0.5, 'K7s': 0.4, 'K6s': 0.3, 'K5s': 0.3,
        'QJs': 1, 'QTs': 1, 'Q9s': 0.7, 'Q8s': 0.4, 'Q7s': 0.2,
        'JTs': 1, 'J9s': 0.8, 'J8s': 0.3,
        'T9s': 1, 'T8s': 0.5, 'T7s': 0.2,
        '98s': 0.8, '97s': 0.3, '87s': 0.7, '76s': 0.6, '65s': 0.5, '54s': 0.4, '43s': 0.2,
        'KQo': 1, 'KJo': 0.7, 'KTo': 0.5, 'K9o': 0.2,
        'QJo': 0.6, 'QTo': 0.4,
        'JTo': 0.5, 'J9o': 0.2,
        'T9o': 0.3, '98o': 0.2, '87o': 0.15,
    },
};

// All possible hands in the 13x13 matrix
function getAllHands() {
    const hands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            if (r === c) hands.push(RANKS[r] + RANKS[c]);
            else if (r < c) hands.push(RANKS[r] + RANKS[c] + 's');
            else hands.push(RANKS[c] + RANKS[r] + 'o');
        }
    }
    return hands;
}

function getHandNotation(r, c) {
    if (r === c) return RANKS[r] + RANKS[c];
    if (r < c) return RANKS[r] + RANKS[c] + 's';
    return RANKS[c] + RANKS[r] + 'o';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PreflopRangeTrainer({ onExit }) {
    const [position, setPosition] = useState('BTN');
    const [currentHand, setCurrentHand] = useState(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [selectedAction, setSelectedAction] = useState(null);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [streak, setStreak] = useState(0);
    const [showMatrix, setShowMatrix] = useState(false);
    const allHands = useMemo(() => getAllHands(), []);

    // Phase 8: Interactive range-building mode
    const [trainerMode, setTrainerMode] = useState('quiz'); // 'quiz' | 'build'
    const [userRange, setUserRange] = useState(new Set());
    const [rangeChecked, setRangeChecked] = useState(false);
    const [rangeScore, setRangeScore] = useState(null);

    const range = GTO_RANGES[position] || {};

    // Deal a new hand
    const dealHand = useCallback(() => {
        const hand = allHands[Math.floor(Math.random() * allHands.length)];
        setCurrentHand(hand);
        setShowFeedback(false);
        setSelectedAction(null);
        setShowMatrix(false);
    }, [allHands]);

    // Start on mount and position change
    useEffect(() => { dealHand(); }, [position, dealHand]);

    // Get correct action for current hand
    const correctAction = useMemo(() => {
        if (!currentHand) return 'fold';
        const freq = range[currentHand] || 0;
        if (freq >= 0.5) return 'raise';
        if (freq > 0) return 'mixed'; // Present in range but < 50%
        return 'fold';
    }, [currentHand, range]);

    const handFreq = useMemo(() => {
        if (!currentHand) return 0;
        return range[currentHand] || 0;
    }, [currentHand, range]);

    const [feedbackResult, setFeedbackResult] = useState(null);

    // Handle answer
    const handleAction = useCallback((action) => {
        if (showFeedback) return;
        setSelectedAction(action);
        setShowFeedback(true);
        setShowMatrix(true);

        // Convert the current hand frequency (0 to 1 scale) to 0-100 scale for classifyMove
        const gtoFreqs = {
            'raise': Math.round(handFreq * 100),
            'fold': Math.round((1 - handFreq) * 100),
            // Call is not explicitly defined in the simplified preflop GTO_RANGES matrix,
            // we assume Raise vs Fold mostly, but allow Call if freq is > 0 and < 0.5
            'call': handFreq > 0 && handFreq < 0.5 ? Math.round(handFreq * 100) : 0
        };

        // Classify move using the central engine
        const classification = classifyMove(
            action,
            correctAction,
            gtoFreqs,
            1,     // level
            null,  // evData
            null,  // rawFrequencies
            currentHand,
            10     // pot size
        );

        setFeedbackResult(classification);

        // Score logic: anything better than WRONG is technically a "pass" for streaks in preflop trainer
        const isPass = classification.classification === 'best' || classification.classification === 'correct' || classification.classification === 'inaccuracy';

        setScore(prev => ({
            correct: prev.correct + (isPass ? 1 : 0),
            total: prev.total + 1,
        }));
        setStreak(prev => isPass ? prev + 1 : 0);
    }, [showFeedback, handFreq, correctAction, currentHand]);

    // Build 13x13 matrix for display
    const matrix = useMemo(() => {
        const grid = [];
        for (let r = 0; r < 13; r++) {
            const row = [];
            for (let c = 0; c < 13; c++) {
                const hand = getHandNotation(r, c);
                const freq = range[hand] || 0;
                row.push({ hand, freq, isCurrentHand: hand === currentHand });
            }
            grid.push(row);
        }
        return grid;
    }, [range, currentHand]);

    const accuracy = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    const accColor = accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#fbbf24' : '#ef4444';

    // Phase 8: Toggle a cell in user range (build mode)
    const toggleUserRangeCell = useCallback((hand) => {
        if (rangeChecked) return;
        setUserRange(prev => {
            const next = new Set(prev);
            if (next.has(hand)) next.delete(hand);
            else next.add(hand);
            return next;
        });
    }, [rangeChecked]);

    // Phase 8: Check user range vs solver
    const checkRange = useCallback(() => {
        const solverHands = new Set(Object.keys(range).filter(h => range[h] >= 0.5));
        let correct = 0, missed = 0, extra = 0;
        solverHands.forEach(h => {
            if (userRange.has(h)) correct++;
            else missed++;
        });
        userRange.forEach(h => {
            if (!solverHands.has(h)) extra++;
        });
        const total = solverHands.size;
        const precision = userRange.size > 0 ? Math.round((correct / userRange.size) * 100) : 0;
        const recall = total > 0 ? Math.round((correct / total) * 100) : 0;
        const f1 = precision + recall > 0 ? Math.round((2 * precision * recall) / (precision + recall)) : 0;
        setRangeScore({ correct, missed, extra, total, precision, recall, f1 });
        setRangeChecked(true);
    }, [range, userRange]);

    // Reset build mode when position changes
    useEffect(() => {
        setUserRange(new Set());
        setRangeChecked(false);
        setRangeScore(null);
    }, [position]);

    return (
        <div style={S.container}>
            {/* HEADER */}
            <div style={S.header}>
                <button onClick={onExit} style={S.backBtn}>← Back</button>
                <div style={S.headerTitle}>Preflop Range Trainer</div>
                <div style={S.headerScore}>
                    <span style={{ color: accColor, fontWeight: 'bold', fontFamily: "'Orbitron', monospace" }}>
                        {accuracy}%
                    </span>
                    <span style={{ fontSize: 9, color: '#64748b' }}>({score.correct}/{score.total})</span>
                </div>
            </div>

            {/* POSITION SELECTOR */}
            <div style={S.posBar}>
                {Object.keys(GTO_RANGES).map(pos => (
                    <button
                        key={pos}
                        onClick={() => { setPosition(pos); setScore({ correct: 0, total: 0 }); setStreak(0); }}
                        style={{
                            ...S.posBtn,
                            background: position === pos ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
                            color: position === pos ? '#00d4ff' : '#94a3b8',
                            borderColor: position === pos ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)',
                        }}
                    >
                        {pos}
                    </button>
                ))}
            </div>

            {/* MODE TOGGLE */}
            <div style={{ display: 'flex', gap: 0, margin: '0 16px 10px', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                {[{ id: 'quiz', label: '🎯 Quiz Mode' }, { id: 'build', label: '🏗️ Range Builder' }].map(m => (
                    <button
                        key={m.id}
                        onClick={() => {
                            setTrainerMode(m.id);
                            setUserRange(new Set());
                            setRangeChecked(false);
                            setRangeScore(null);
                        }}
                        style={{
                            flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                            background: trainerMode === m.id ? 'rgba(0,212,255,0.15)' : 'rgba(0,0,0,0.2)',
                            color: trainerMode === m.id ? '#00d4ff' : '#64748b',
                            borderBottom: trainerMode === m.id ? '2px solid #00d4ff' : '2px solid transparent',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {/* CURRENT HAND DISPLAY */}
            <AnimatePresence mode="wait">
                {currentHand && (
                    <motion.div
                        key={currentHand}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        style={S.handDisplay}
                    >
                        <div style={S.handLabel}>Your Hand ({position})</div>
                        <div style={S.handValue}>{currentHand}</div>
                        {streak >= 3 && (
                            <div style={{ fontSize: 11, color: '#f97316' }}>
                                🔥 {streak} streak
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ACTION BUTTONS */}
            <div style={S.actionBar}>
                {[
                    { id: 'raise', label: 'RAISE', color: '#3b82f6', border: '#60a5fa' },
                    { id: 'call', label: 'CALL', color: '#22c55e', border: '#4ade80' },
                    { id: 'fold', label: 'FOLD', color: '#ef4444', border: '#f87171' },
                ].map(action => {
                    const isSelected = selectedAction === action.id;
                    let isCorrectAction = false;

                    if (showFeedback && feedbackResult) {
                        // If selected, check if it was a good classification
                        if (isSelected) {
                            isCorrectAction = ['best', 'correct', 'inaccuracy'].includes(feedbackResult.classification);
                        } else {
                            // If not selected, highlight it if it was the optimal action
                            isCorrectAction = action.id === correctAction;
                        }
                    }

                    return (
                        <motion.button
                            key={action.id}
                            onClick={() => handleAction(action.id)}
                            disabled={showFeedback}
                            whileHover={!showFeedback ? { scale: 1.05, y: -2 } : {}}
                            whileTap={!showFeedback ? { scale: 0.95 } : {}}
                            style={{
                                ...S.actionBtn,
                                background: showFeedback
                                    ? isSelected
                                        ? CLASSIFICATION_CONFIG[feedbackResult.classification]?.bgColor || 'rgba(255,255,255,0.03)'
                                        : isCorrectAction
                                            ? CLASSIFICATION_CONFIG['best'].bgColor
                                            : 'rgba(255,255,255,0.03)'
                                    : `linear-gradient(180deg, rgba(${action.id === 'raise' ? '59,130,246' : action.id === 'call' ? '34,197,94' : '239,68,68'},0.15), rgba(0,0,0,0.3))`,
                                borderColor: showFeedback
                                    ? isSelected
                                        ? CLASSIFICATION_CONFIG[feedbackResult.classification]?.borderColor || 'rgba(255,255,255,0.1)'
                                        : isCorrectAction
                                            ? CLASSIFICATION_CONFIG['best'].borderColor
                                            : 'rgba(255,255,255,0.1)'
                                    : `${action.border}40`,
                                color: showFeedback
                                    ? isSelected
                                        ? CLASSIFICATION_CONFIG[feedbackResult.classification]?.color || '#64748b'
                                        : isCorrectAction
                                            ? CLASSIFICATION_CONFIG['best'].color
                                            : '#64748b'
                                    : action.color,
                                opacity: showFeedback && !isSelected && !isCorrectAction ? 0.3 : 1,
                            }}
                        >
                            {action.label}
                            {showFeedback && isSelected && <span style={{ fontSize: 10, marginLeft: 4 }}>{CLASSIFICATION_CONFIG[feedbackResult.classification]?.icon === 'check' ? '✓' : '✗'}</span>}
                        </motion.button>
                    );
                })}
            </div>

            {/* FEEDBACK */}
            <AnimatePresence>
                {showFeedback && feedbackResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={S.feedback}
                    >
                        <div style={{
                            fontSize: 14, fontWeight: 'bold', marginBottom: 4,
                            color: CLASSIFICATION_CONFIG[feedbackResult.classification]?.color || '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                        }}>
                            {CLASSIFICATION_CONFIG[feedbackResult.classification]?.label.toUpperCase()}
                            {feedbackResult.evLoss > 0 && (
                                <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4 }}>
                                    -{feedbackResult.evLoss} EV
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                            {currentHand} at {position}:{' '}
                            {handFreq === 0
                                ? 'Not in range — Fold'
                                : handFreq >= 0.5
                                    ? `Raise (${Math.round(handFreq * 100)}% frequency)`
                                    : `Mixed — Raise ${Math.round(handFreq * 100)}% / Fold ${Math.round((1 - handFreq) * 100)}%`}
                        </div>

                        <motion.button
                            onClick={dealHand}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={S.nextBtn}
                        >
                            Next Hand →
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 13x13 RANGE MATRIX */}
            {trainerMode === 'quiz' ? (
                <div style={S.matrixContainer}>
                    <div style={S.matrixTitle}>{position} Open-Raise Range (RFI)</div>
                    <div style={S.matrix}>
                        {matrix.flat().map((cell, i) => {
                            const isHighlighted = showFeedback && cell.isCurrentHand;
                            const cellColor = cell.freq >= 0.9 ? '#22c55e'
                                : cell.freq >= 0.7 ? '#4ade80'
                                    : cell.freq >= 0.5 ? '#86efac'
                                        : cell.freq >= 0.3 ? '#fbbf24'
                                            : cell.freq >= 0.1 ? '#f97316'
                                                : cell.freq > 0 ? '#ef4444'
                                                    : 'rgba(255,255,255,0.04)';

                            return (
                                <div
                                    key={i}
                                    style={{
                                        aspectRatio: '1',
                                        background: cellColor,
                                        borderRadius: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 6.5,
                                        fontWeight: 'bold',
                                        color: cell.freq > 0.3 ? '#000' : cell.freq > 0 ? '#fff' : '#444',
                                        border: isHighlighted ? '2px solid #00d4ff' : '1px solid rgba(0,0,0,0.2)',
                                        boxShadow: isHighlighted ? '0 0 8px rgba(0,212,255,0.6)' : 'none',
                                        position: 'relative',
                                    }}
                                    title={`${cell.hand}: ${Math.round(cell.freq * 100)}%`}
                                >
                                    {cell.hand}
                                </div>
                            );
                        })}
                    </div>
                    <div style={S.legend}>
                        {[
                            { label: '90%+', color: '#22c55e' },
                            { label: '50%+', color: '#86efac' },
                            { label: 'Mixed', color: '#fbbf24' },
                            { label: '<10%', color: '#f97316' },
                            { label: 'Fold', color: 'rgba(255,255,255,0.08)' },
                        ].map(l => (
                            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, color: '#94a3b8' }}>
                                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                                {l.label}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* RANGE BUILDER MODE */
                <div style={S.matrixContainer}>
                    <div style={S.matrixTitle}>Click to build your {position} opening range</div>
                    <div style={S.matrix}>
                        {matrix.flat().map((cell, i) => {
                            const isSelected = userRange.has(cell.hand);
                            const solverInRange = cell.freq >= 0.5;

                            let cellBg = 'rgba(255,255,255,0.04)';
                            let cellTextColor = '#555';
                            let cellBorder = '1px solid rgba(255,255,255,0.05)';

                            if (rangeChecked) {
                                // Show comparison overlay
                                if (isSelected && solverInRange) {
                                    cellBg = 'rgba(34, 197, 94, 0.35)'; // Correct: green
                                    cellTextColor = '#22c55e';
                                    cellBorder = '1px solid rgba(34,197,94,0.5)';
                                } else if (!isSelected && solverInRange) {
                                    cellBg = 'rgba(251, 146, 60, 0.3)'; // Missed: orange
                                    cellTextColor = '#fb923c';
                                    cellBorder = '1px solid rgba(251,146,60,0.5)';
                                } else if (isSelected && !solverInRange) {
                                    cellBg = 'rgba(239, 68, 68, 0.3)'; // Extra: red
                                    cellTextColor = '#ef4444';
                                    cellBorder = '1px solid rgba(239,68,68,0.5)';
                                }
                            } else if (isSelected) {
                                cellBg = 'rgba(0, 212, 255, 0.2)';
                                cellTextColor = '#00d4ff';
                                cellBorder = '1px solid rgba(0,212,255,0.5)';
                            }

                            return (
                                <div
                                    key={i}
                                    onClick={() => toggleUserRangeCell(cell.hand)}
                                    style={{
                                        aspectRatio: '1',
                                        background: cellBg,
                                        borderRadius: 2,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 6.5,
                                        fontWeight: 'bold',
                                        color: cellTextColor,
                                        border: cellBorder,
                                        cursor: rangeChecked ? 'default' : 'pointer',
                                        transition: 'all 0.1s ease',
                                        userSelect: 'none',
                                    }}
                                    title={`${cell.hand}: ${Math.round(cell.freq * 100)}%`}
                                >
                                    {cell.hand}
                                </div>
                            );
                        })}
                    </div>

                    {/* Result legend for checked range */}
                    {rangeChecked && rangeScore && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                marginTop: 10, padding: '10px 14px', borderRadius: 10,
                                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 8 }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: "'Orbitron', monospace", color: rangeScore.f1 >= 80 ? '#22c55e' : rangeScore.f1 >= 60 ? '#fbbf24' : '#ef4444' }}>
                                        {rangeScore.f1}%
                                    </div>
                                    <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>SCORE</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(34,197,94,0.5)' }} />
                                    <span style={{ color: '#22c55e' }}>Correct: {rangeScore.correct}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(251,146,60,0.5)' }} />
                                    <span style={{ color: '#fb923c' }}>Missed: {rangeScore.missed}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.5)' }} />
                                    <span style={{ color: '#ef4444' }}>Extra: {rangeScore.extra}</span>
                                </div>
                            </div>
                            <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center', marginTop: 6 }}>
                                Precision: {rangeScore.precision}% · Recall: {rangeScore.recall}% · Solver: {rangeScore.total} hands
                            </div>
                        </motion.div>
                    )}

                    {/* Action buttons for build mode */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                        {!rangeChecked ? (
                            <>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={checkRange}
                                    disabled={userRange.size === 0}
                                    style={{
                                        padding: '10px 24px', borderRadius: 8,
                                        background: userRange.size > 0 ? 'linear-gradient(180deg, rgba(0,212,255,0.2), rgba(0,212,255,0.05))' : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(0,212,255,0.4)',
                                        color: userRange.size > 0 ? '#00d4ff' : '#475569',
                                        fontSize: 13, fontWeight: 700, cursor: userRange.size > 0 ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    Check Range ({userRange.size} selected)
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => setUserRange(new Set())}
                                    style={{
                                        padding: '10px 16px', borderRadius: 8,
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Clear
                                </motion.button>
                            </>
                        ) : (
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => { setUserRange(new Set()); setRangeChecked(false); setRangeScore(null); }}
                                style={{
                                    padding: '10px 24px', borderRadius: 8,
                                    background: 'linear-gradient(180deg, rgba(0,212,255,0.2), rgba(0,212,255,0.05))',
                                    border: '1px solid rgba(0,212,255,0.4)',
                                    color: '#00d4ff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                Try Again
                            </motion.button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const S = {
    container: {
        width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, #0a0a12 0%, #1a1a2e 100%)',
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'linear-gradient(180deg, rgba(30,30,45,0.98), rgba(15,15,25,0.98))',
        borderBottom: '2px solid rgba(0,212,255,0.3)',
    },
    backBtn: {
        background: 'none', border: 'none', color: '#00d4ff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        padding: '8px 0', minWidth: 60, textAlign: 'left',
    },
    headerTitle: {
        fontSize: 14, fontWeight: 'bold', color: '#e2e8f0', letterSpacing: 1, textTransform: 'uppercase',
    },
    headerScore: {
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
    },
    posBar: {
        display: 'flex', gap: 6, padding: '10px 16px', flexWrap: 'wrap', justifyContent: 'center',
    },
    posBtn: {
        padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 'bold',
        border: '1px solid', cursor: 'pointer', letterSpacing: 0.5, minWidth: 48,
        fontFamily: "'Orbitron', monospace",
    },
    handDisplay: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 0',
    },
    handLabel: {
        fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
    },
    handValue: {
        fontSize: 36, fontWeight: 'bold', color: '#00d4ff',
        fontFamily: "'Orbitron', monospace", letterSpacing: 3,
        textShadow: '0 0 20px rgba(0,212,255,0.5)',
    },
    actionBar: {
        display: 'flex', gap: 8, padding: '0 16px 12px', justifyContent: 'center',
    },
    actionBtn: {
        flex: 1, maxWidth: 120, padding: '14px 0', borderRadius: 10,
        border: '1px solid', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
        letterSpacing: 1, fontFamily: "'Inter', sans-serif",
        transition: 'all 0.15s ease',
    },
    feedback: {
        padding: '12px 16px', textAlign: 'center',
        background: 'rgba(0,0,0,0.3)', margin: '0 16px', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
    },
    nextBtn: {
        marginTop: 8, padding: '10px 28px', borderRadius: 10,
        border: '1px solid rgba(0,212,255,0.4)',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))',
        color: '#00d4ff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
    matrixContainer: {
        padding: '12px 16px', flex: 1,
    },
    matrixTitle: {
        fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 6, textAlign: 'center',
    },
    matrix: {
        display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1,
        maxWidth: 340, margin: '0 auto',
    },
    legend: {
        display: 'flex', justifyContent: 'center', gap: 10, marginTop: 6,
    },
};
