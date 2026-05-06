/**
 * 📊 FEEDBACK CARD - The Resolution Layer
 * 
 * Displays GTO analysis after each decision with clear hierarchy:
 * 1. Translator's Explanation (The Verdict)
 * 2. GTO Primary Line (The Proof)
 * 3. Alternate Lines (The Comparison)
 * 
 * Visual coding:
 * - Green = Correct decision
 * - Red/Orange = Mistake
 * - Gold = GTO optimal line
 * - CRITICAL MISTAKE badge for >1.0 BB punt
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { explainDecision } from '../../engines/AICoachEngine';
import { calculateActionEVs } from '../../engines/EVCalculator';
import { explainStrategy } from '../../engines/StrategyExplainer';

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE-GENERATED EXPLANATION INTERFACE (No AI — Pure Engine)
// ═══════════════════════════════════════════════════════════════════════════

interface EngineExplanation {
    headline: string;
    shortExplanation: string;
    deepDive?: {
        equityAnalysis?: string;
        rangeConsiderations?: string;
        evCalculation?: string;
        boardTexture?: string;
    };
    keyTakeaway: string;
    similarSpots?: string;
    confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionLine {
    action: 'Fold' | 'Call' | 'Check' | 'Raise' | 'All-In';
    ev: number;         // Expected value in BB
    frequency?: number; // GTO frequency (0-100)
    sizing?: number;    // Raise size if applicable
}

export interface SolverResult {
    explanation: string;          // Translator-generated explanation
    gtoLine: ActionLine;          // Optimal GTO action
    altLines: ActionLine[];       // Alternative actions (max 2)
    userAction: ActionLine;       // What the user chose
    isCorrect: boolean;           // Did user match GTO?
    evDiff: number;               // EV difference from GTO (in BB)
    leakCategory?: string;        // e.g., "3-Bet Defense", "River Bluff Catch"
}

interface FeedbackCardProps {
    result: SolverResult;
    onContinue: () => void;
    onStudyMore?: () => void;
    showDetails?: boolean;
    // For Grok AI explanations
    question?: {
        question: string;
        scenario?: {
            heroPosition?: string;
            heroHand?: string;
            board?: string | string[];
            pot?: number;
            villainPosition?: string;
            action?: string;
            heroStack?: number;
            spotType?: string;
            is3BetPot?: boolean;
        };
        explanation?: string;
        gtoFrequencies?: Record<string, number>;
    };
    gameId?: string;
    level?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
    // Verdict colors
    correct: '#22c55e',
    correctBg: 'rgba(34, 197, 94, 0.15)',
    correctBorder: 'rgba(34, 197, 94, 0.4)',

    mistake: '#f59e0b',
    mistakeBg: 'rgba(245, 158, 11, 0.15)',
    mistakeBorder: 'rgba(245, 158, 11, 0.4)',

    critical: '#ef4444',
    criticalBg: 'rgba(239, 68, 68, 0.15)',
    criticalBorder: 'rgba(239, 68, 68, 0.4)',

    // GTO line colors
    gtoGold: '#FFD700',
    gtoGoldBg: 'rgba(255, 215, 0, 0.1)',
    gtoGoldBorder: 'rgba(255, 215, 0, 0.4)',

    // Alt line colors
    altBg: 'rgba(255, 255, 255, 0.05)',
    altBorder: 'rgba(255, 255, 255, 0.1)',

    // Text
    textPrimary: '#ffffff',
    textSecondary: '#888888',
    textMuted: '#666666'
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Board texture / Street detection)
// ═══════════════════════════════════════════════════════════════════════════

function _describeBoardTexture(board: string): string {
    if (!board) return '';
    const cards = board.trim().split(/\s+/);
    const suits = cards.map(c => c[c.length - 1]);
    const uniqueSuits = new Set(suits);
    let desc = '';
    if (uniqueSuits.size === 1 && cards.length >= 3) desc += 'Monotone (flush-heavy). ';
    else if (suits.filter(s => s === suits[0]).length >= 3) desc += 'Flush draw possible. ';
    const ranks = cards.map(c => '23456789TJQKA'.indexOf(c[0]));
    ranks.sort((a, b) => a - b);
    const connected = ranks.some((r, i) => i > 0 && r - ranks[i - 1] <= 2);
    if (connected) desc += 'Connected / straight draws present. ';
    const highCards = ranks.filter(r => r >= 9); // T+
    if (highCards.length >= 2) desc += 'High-card heavy board. ';
    else if (highCards.length === 0 && cards.length >= 3) desc += 'Low board — favors preflop caller. ';
    return desc.trim() || 'Relatively dry texture.';
}

function _detectStreet(board?: string): string {
    if (!board) return 'preflop';
    const cards = board.trim().split(/\s+/).filter(Boolean);
    if (cards.length >= 5) return 'river';
    if (cards.length >= 4) return 'turn';
    if (cards.length >= 3) return 'flop';
    return 'preflop';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function FeedbackCard({
    result,
    onContinue,
    onStudyMore,
    showDetails = true,
    question,
    gameId,
    level
}: FeedbackCardProps) {
    const [showAltLines, setShowAltLines] = useState(false);
    const [engineExplanation, setEngineExplanation] = useState<EngineExplanation | null>(null);
    const [showDeepDive, setShowDeepDive] = useState(false);

    // ═══ Generate explanation from local engines (no AI API) ═══
    useEffect(() => {
        if (!question || !result) return;

        try {
            const scenario = question.scenario || {};
            const decision = {
                action: result.userAction.action?.toLowerCase(),
                gtoAction: result.gtoLine.action?.toLowerCase(),
                classification: result.isCorrect ? 'correct' : (Math.abs(result.evDiff) > 1.0 ? 'blunder' : 'mistake'),
                boardTexture: scenario.board ? _describeBoardTexture(String(scenario.board)) : undefined,
                madeHand: scenario.heroHand || undefined,
                madeHandStrength: result.isCorrect ? 0.7 : 0.3,
                draws: undefined,
                evLoss: Math.abs(result.evDiff || 0),
                street: _detectStreet(typeof scenario.board === 'string' ? scenario.board : undefined),
                gtoReason: question.explanation || '',
            };

            const coaching = explainDecision(decision, 'JARVIS');

            // Build deep dive from scenario data
            const deepDive: EngineExplanation['deepDive'] = {};
            if (scenario.board) {
                deepDive.boardTexture = `Board: ${scenario.board}. ${_describeBoardTexture(String(scenario.board))}`;
            }
            if (result.gtoLine && result.altLines?.length > 0) {
                const evLines = [result.gtoLine, ...result.altLines]
                    .map(l => `${l.action}: ${l.ev >= 0 ? '+' : ''}${l.ev.toFixed(2)} BB${l.frequency ? ` (${l.frequency}%)` : ''}`)
                    .join(', ');
                deepDive.evCalculation = `EV comparison: ${evLines}`;
                deepDive.rangeConsiderations = `The GTO play is ${result.gtoLine.action} at ${result.gtoLine.frequency || 100}% frequency. ${result.altLines.length > 0 ? `Alternative: ${result.altLines[0].action} at ${result.altLines[0].frequency || 0}% frequency.` : ''}`;
            }
            if (scenario.heroPosition && scenario.villainPosition) {
                deepDive.equityAnalysis = `${scenario.heroPosition} vs ${scenario.villainPosition}${scenario.heroHand ? ` with ${scenario.heroHand}` : ''}. ${result.evDiff ? `Your play costs ${Math.abs(result.evDiff).toFixed(2)} BB in EV.` : ''}`;
            }

            // ═══ Enhanced Strategy Explanation (StrategyExplainer engine) ═══
            let strategyInsight: { explanation: string; keyFactors: string[]; strategicConcept: string } | null = null;
            try {
                const holeCards = scenario.heroHand
                    ? (typeof scenario.heroHand === 'string' && scenario.heroHand.length === 4
                        ? [scenario.heroHand.slice(0, 2), scenario.heroHand.slice(2, 4)]
                        : scenario.heroHand)
                    : null;
                const board = Array.isArray(scenario.board) ? scenario.board : [];

                if (holeCards && board.length >= 3) {
                    strategyInsight = explainStrategy({
                        holeCards: holeCards as string[],
                        board,
                        correctAction: result.gtoLine?.action || '',
                        userAction: result.userAction?.action || '',
                        position: (scenario.heroPosition === 'BB' || scenario.heroPosition === 'SB') ? 'OOP' : 'IP',
                        street: _detectStreet(typeof scenario.board === 'string' ? scenario.board : undefined),
                        spotType: scenario.spotType || 'cbet',
                        betFrequency: result.gtoLine?.frequency ?? 0,
                        frequencies: question.gtoFrequencies || {},
                        is3BetPot: scenario.is3BetPot || false,
                    });
                }
            } catch (e) { console.warn('[App] Handled exception:', e); }

            const keyTakeaway = strategyInsight?.keyFactors?.length
                ? strategyInsight.keyFactors.slice(0, 3).join(' • ')
                : coaching.concepts.length > 0
                    ? `Key concepts: ${coaching.concepts.map((c: string) => c.replace(/_/g, ' ')).join(', ')}.`
                    : (result.isCorrect ? 'Solid play — keep it up.' : `Review ${result.gtoLine.action} in this spot type.`);

            // Use StrategyExplainer for deeper explanation when available
            const shortExplain = strategyInsight?.explanation || coaching.detail || coaching.text;

            if (strategyInsight?.strategicConcept) {
                deepDive.rangeConsiderations = (deepDive.rangeConsiderations || '') +
                    ` Strategic concept: ${strategyInsight.strategicConcept}.`;
            }

            setEngineExplanation({
                headline: strategyInsight?.strategicConcept
                    ? `${coaching.text} — ${strategyInsight.strategicConcept}`
                    : coaching.text,
                shortExplanation: shortExplain,
                deepDive: Object.keys(deepDive || {}).length > 0 ? deepDive : undefined,
                keyTakeaway,
                confidence: 1.0,
            });
        } catch (err) {
            console.warn('[FeedbackCard] Engine explanation failed:', err);
        }
    }, [question, result, gameId, level]);

    // Determine severity level
    const severity = useMemo(() => {
        if (result.isCorrect) return 'correct';
        if (Math.abs(result.evDiff) > 1.0) return 'critical';
        return 'mistake';
    }, [result.isCorrect, result.evDiff]);

    const severityColors = {
        correct: { bg: COLORS.correctBg, border: COLORS.correctBorder, text: COLORS.correct },
        mistake: { bg: COLORS.mistakeBg, border: COLORS.mistakeBorder, text: COLORS.mistake },
        critical: { bg: COLORS.criticalBg, border: COLORS.criticalBorder, text: COLORS.critical }
    };

    const colors = severityColors[severity];

    return (
        <motion.div
            className="feedback-card-root"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={{
                background: 'linear-gradient(135deg, rgba(20, 20, 40, 0.95), rgba(10, 10, 30, 0.95))',
                borderRadius: '20px',
                border: `2px solid ${colors.border}`,
                boxShadow: `0 0 40px ${colors.border}`,
                overflow: 'hidden',
                maxWidth: '500px',
                width: '100%'
            }}
        >
            {/* ═══ LAYER 1: THE VERDICT ═══ */}
            <div style={{
                padding: '24px',
                background: colors.bg,
                borderBottom: `1px solid ${colors.border}`
            }}>
                {/* Header with icon and badge */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring' }}
                            style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: colors.text,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px'
                            }}
                        >
                            {severity === 'correct' ? '✓' : severity === 'critical' ? '✗' : '⚠'}
                        </motion.div>
                        <div>
                            <div style={{
                                fontSize: '18px',
                                fontWeight: 700,
                                color: colors.text
                            }}>
                                {severity === 'correct' ? 'Correct!' :
                                    severity === 'critical' ? 'Critical Mistake' : 'Suboptimal'}
                            </div>
                            <div style={{ fontSize: '12px', color: COLORS.textSecondary }}>
                                {result.isCorrect
                                    ? 'You found the GTO play'
                                    : `EV Loss: ${Math.abs(result.evDiff).toFixed(2)} BB`
                                }
                            </div>
                        </div>
                    </div>

                    {/* Critical Mistake Badge */}
                    {severity === 'critical' && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            style={{
                                padding: '6px 12px',
                                background: COLORS.critical,
                                borderRadius: '20px',
                                fontSize: '10px',
                                fontWeight: 700,
                                color: '#fff',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                animation: 'pulse 2s infinite'
                            }}
                        >
                            🚨 CRITICAL MISTAKE
                        </motion.div>
                    )}

                    {/* Leak Tag */}
                    {result.leakCategory && severity !== 'correct' && (
                        <div style={{
                            padding: '4px 10px',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            fontSize: '10px',
                            color: COLORS.textSecondary
                        }}>
                            Leak: {result.leakCategory}
                        </div>
                    )}
                </div>

                {/* Translator Explanation (or engine-generated if available) */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    style={{
                        fontSize: '15px',
                        lineHeight: 1.6,
                        color: COLORS.textPrimary,
                        margin: 0
                    }}
                >
                    {engineExplanation?.shortExplanation || result.explanation}
                </motion.p>

                {/* 🧠 ENGINE-POWERED DEEP DIVE (No AI) */}
                {question && engineExplanation && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        style={{ marginTop: '16px' }}
                    >
                        <button
                            onClick={() => setShowDeepDive(!showDeepDive)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                background: showDeepDive
                                    ? 'rgba(0, 212, 255, 0.2)'
                                    : 'rgba(0, 212, 255, 0.1)',
                                border: '1px solid rgba(0, 212, 255, 0.4)',
                                borderRadius: '10px',
                                color: '#00d4ff',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                🧠 Jarvis Deep Dive Analysis
                            </span>
                            <span style={{
                                transform: showDeepDive ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s'
                            }}>
                                ▼
                            </span>
                        </button>

                        <AnimatePresence>
                            {showDeepDive && engineExplanation && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    style={{
                                        marginTop: '12px',
                                        padding: '16px',
                                        background: 'rgba(0, 212, 255, 0.05)',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(0, 212, 255, 0.2)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {/* Deep Dive Content */}
                                    {engineExplanation.deepDive && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {engineExplanation.deepDive.rangeConsiderations && (
                                                <div>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#00d4ff', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                        📊 Range Analysis
                                                    </div>
                                                    <p style={{ fontSize: '13px', color: COLORS.textPrimary, margin: 0, lineHeight: 1.5 }}>
                                                        {engineExplanation.deepDive.rangeConsiderations}
                                                    </p>
                                                </div>
                                            )}
                                            {engineExplanation.deepDive.equityAnalysis && (
                                                <div>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#00d4ff', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                        📈 Equity vs Range
                                                    </div>
                                                    <p style={{ fontSize: '13px', color: COLORS.textPrimary, margin: 0, lineHeight: 1.5 }}>
                                                        {engineExplanation.deepDive.equityAnalysis}
                                                    </p>
                                                </div>
                                            )}
                                            {engineExplanation.deepDive.boardTexture && (
                                                <div>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#00d4ff', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                        🃏 Board Texture
                                                    </div>
                                                    <p style={{ fontSize: '13px', color: COLORS.textPrimary, margin: 0, lineHeight: 1.5 }}>
                                                        {engineExplanation.deepDive.boardTexture}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Key Takeaway */}
                                    {engineExplanation.keyTakeaway && (
                                        <div style={{
                                            marginTop: engineExplanation.deepDive ? '16px' : 0,
                                            padding: '12px',
                                            background: 'rgba(255, 215, 0, 0.1)',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255, 215, 0, 0.3)'
                                        }}>
                                            <div style={{ fontSize: '10px', fontWeight: 700, color: COLORS.gtoGold, marginBottom: '6px', textTransform: 'uppercase' }}>
                                                💡 Key Takeaway
                                            </div>
                                            <p style={{ fontSize: '14px', color: COLORS.textPrimary, margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
                                                {engineExplanation.keyTakeaway}
                                            </p>
                                        </div>
                                    )}

                                    {/* Similar Spots */}
                                    {engineExplanation.similarSpots && (
                                        <p style={{
                                            fontSize: '12px',
                                            color: COLORS.textSecondary,
                                            margin: '12px 0 0 0',
                                            fontStyle: 'italic'
                                        }}>
                                            📚 {engineExplanation.similarSpots}
                                        </p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </div>

            {/* ═══ LAYER 2: THE PROOF (GTO PRIMARY LINE) ═══ */}
            {showDetails && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    style={{
                        padding: '16px 24px',
                        background: COLORS.gtoGoldBg,
                        borderBottom: `1px solid ${COLORS.gtoGoldBorder}`
                    }}
                >
                    <div style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: COLORS.gtoGold,
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <span>⭐</span>
                        GTO OPTIMAL PLAY
                    </div>

                    <ActionLineRow
                        line={result.gtoLine}
                        isGTO={true}
                        isUserAction={result.userAction.action === result.gtoLine.action}
                    />
                </motion.div>
            )}

            {/* ═══ LAYER 3: THE ALTERNATIVES ═══ */}
            {showDetails && result.altLines.length > 0 && (
                <div style={{ padding: '16px 24px' }}>
                    <button
                        onClick={() => setShowAltLines(!showAltLines)}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: showAltLines ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${COLORS.altBorder}`,
                            borderRadius: '10px',
                            color: COLORS.textSecondary,
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>View Alternate Lines ({result.altLines.length})</span>
                        <span style={{
                            transform: showAltLines ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                        }}>
                            ▼
                        </span>
                    </button>

                    <AnimatePresence>
                        {showAltLines && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                style={{ marginTop: '12px', overflow: 'hidden' }}
                            >
                                {result.altLines.map((line, index) => (
                                    <motion.div
                                        key={line.action}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                        style={{ marginBottom: index < result.altLines.length - 1 ? '8px' : 0 }}
                                    >
                                        <ActionLineRow
                                            line={line}
                                            isGTO={false}
                                            isUserAction={result.userAction.action === line.action}
                                            evDiffFromGTO={line.ev - result.gtoLine.ev}
                                        />
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ═══ ACTIONS ═══ */}
            <div style={{
                padding: '16px 24px 24px',
                display: 'flex',
                gap: '12px',
                background: 'rgba(0,0,0,0.2)'
            }}>
                {onStudyMore && severity !== 'correct' && (
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: '0 4px 16px rgba(255,255,255,0.2)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onStudyMore}
                        style={{
                            flex: 1,
                            padding: '14px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '10px',
                            color: COLORS.textPrimary,
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        📚 Study This Spot
                    </motion.button>
                )}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onContinue}
                    style={{
                        flex: severity === 'correct' ? 1 : 1,
                        padding: '14px',
                        background: severity === 'correct'
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : 'linear-gradient(135deg, #00d4ff, #0099cc)',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: severity === 'correct'
                            ? '0 0 20px rgba(34, 197, 94, 0.4)'
                            : '0 0 20px rgba(0, 212, 255, 0.4)'
                    }}
                >
                    {severity === 'correct' ? '✓ Next Hand' : 'Continue →'}
                </motion.button>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @media (max-width: 640px) {
                    .feedback-card-root {
                        max-width: 95vw !important;
                        padding: 20px !important;
                    }
                }
            `}</style>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════

export function FeedbackCardSkeleton() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
                background: 'linear-gradient(135deg, rgba(20, 20, 40, 0.95), rgba(10, 10, 30, 0.95))',
                borderRadius: '20px',
                border: '2px solid rgba(255,255,255,0.1)',
                overflow: 'hidden',
                maxWidth: '500px',
                width: '100%',
                padding: '24px'
            }}
        >
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px'
            }}>
                <div className="skeleton-pulse" style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)'
                }} />
                <div style={{ flex: 1 }}>
                    <div className="skeleton-pulse" style={{
                        width: '120px',
                        height: '18px',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,0.1)',
                        marginBottom: '8px'
                    }} />
                    <div className="skeleton-pulse" style={{
                        width: '80px',
                        height: '12px',
                        borderRadius: '4px',
                        background: 'rgba(255,255,255,0.05)'
                    }} />
                </div>
            </div>
            <div className="skeleton-pulse" style={{
                width: '100%',
                height: '60px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                marginBottom: '16px'
            }} />
            <div className="skeleton-pulse" style={{
                width: '100%',
                height: '80px',
                borderRadius: '8px',
                background: 'rgba(255,215,0,0.05)'
            }} />
            <style>{`
                @keyframes skeleton-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .skeleton-pulse {
                    animation: skeleton-pulse 2s ease-in-out infinite;
                }
            `}</style>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION LINE ROW
// ═══════════════════════════════════════════════════════════════════════════

interface ActionLineRowProps {
    line: ActionLine;
    isGTO: boolean;
    isUserAction: boolean;
    evDiffFromGTO?: number;
}

function ActionLineRow({ line, isGTO, isUserAction, evDiffFromGTO }: ActionLineRowProps) {
    const [isHovered, setIsHovered] = React.useState(false);
    const actionColors: Record<string, string> = {
        'Fold': '#ef4444',
        'Check': '#6b7280',
        'Call': '#22c55e',
        'Raise': '#f59e0b',
        'All-In': '#a855f7'
    };

    const actionColor = actionColors[line.action] || '#888';

    return (
        <motion.div
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            whileHover={{ scale: 1.02, x: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: isGTO
                    ? 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))'
                    : 'rgba(255,255,255,0.03)',
                border: isGTO
                    ? `2px solid ${COLORS.gtoGold}`
                    : `1px solid ${COLORS.altBorder}`,
                borderRadius: '10px',
                cursor: 'pointer',
                boxShadow: isHovered
                    ? isGTO
                        ? '0 8px 24px rgba(255, 215, 0, 0.3)'
                        : '0 4px 12px rgba(255, 255, 255, 0.1)'
                    : 'none',
                transition: 'box-shadow 0.3s ease'
            }}>
            {/* Action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: `${actionColor}22`,
                    border: `2px solid ${actionColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: actionColor
                }}>
                    {getActionIcon(line.action)}
                </div>
                <div>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: isGTO ? COLORS.gtoGold : COLORS.textPrimary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        {line.action}
                        {line.sizing && <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>({line.sizing}x)</span>}
                        {isUserAction && (
                            <span style={{
                                padding: '2px 6px',
                                background: 'rgba(255,255,255,0.15)',
                                borderRadius: '6px',
                                fontSize: '9px',
                                fontWeight: 700,
                                color: COLORS.textSecondary
                            }}>
                                YOUR CHOICE
                            </span>
                        )}
                    </div>
                    {line.frequency !== undefined && (
                        <div style={{ fontSize: '11px', color: COLORS.textSecondary }}>
                            Frequency: {line.frequency.toFixed(0)}%
                        </div>
                    )}
                </div>
            </div>

            {/* EV */}
            <div style={{ textAlign: 'right' }}>
                <motion.div
                    initial={{ scale: 1 }}
                    animate={{ scale: isHovered ? 1.1 : 1 }}
                    transition={{ duration: 0.2 }}
                    style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: line.ev >= 0 ? '#22c55e' : '#ef4444'
                    }}
                >
                    {line.ev >= 0 ? '+' : ''}{line.ev.toFixed(2)} BB
                </motion.div>
                {evDiffFromGTO !== undefined && (
                    <div style={{
                        fontSize: '11px',
                        color: COLORS.critical
                    }}>
                        {evDiffFromGTO.toFixed(2)} BB worse
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getActionIcon(action: string): string {
    switch (action) {
        case 'Fold': return '🚫';
        case 'Check': return '✓';
        case 'Call': return '📞';
        case 'Raise': return '📈';
        case 'All-In': return '<img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/>';
        default: return '?';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO DATA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function generateDemoSolverResult(isCorrect: boolean = false): SolverResult {
    if (isCorrect) {
        return {
            explanation: "Excellent read! With this board texture and villain's betting pattern, folding achieves 0 EV and avoids getting trapped. The pot odds don't justify calling with your marginal showdown value.",
            gtoLine: { action: 'Fold', ev: 0, frequency: 100 },
            altLines: [
                { action: 'Call', ev: -2.5, frequency: 0 },
                { action: 'Raise', ev: -8.0, frequency: 0 }
            ],
            userAction: { action: 'Fold', ev: 0 },
            isCorrect: true,
            evDiff: 0
        };
    }

    return {
        explanation: "You are bleeding chips in this spot. Against a standard range on this texture, GTO calls here approximately 65% of the time. Your fold frequency is too high, allowing villains to over-bluff profitably.",
        gtoLine: { action: 'Call', ev: 1.2, frequency: 65 },
        altLines: [
            { action: 'Fold', ev: 0, frequency: 35 },
            { action: 'Raise', ev: -1.8, frequency: 0 }
        ],
        userAction: { action: 'Fold', ev: 0 },
        isCorrect: false,
        evDiff: -1.2,
        leakCategory: 'River Bluff Catch'
    };
}

export default FeedbackCard;
