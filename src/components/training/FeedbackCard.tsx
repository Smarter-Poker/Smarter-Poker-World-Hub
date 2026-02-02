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

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function FeedbackCard({
    result,
    onContinue,
    onStudyMore,
    showDetails = true
}: FeedbackCardProps) {
    const [showAltLines, setShowAltLines] = useState(false);

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

                {/* Translator Explanation */}
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
                    {result.explanation}
                </motion.p>
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
                    <button
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
                            gap: '8px'
                        }}
                    >
                        📚 Study This Spot
                    </button>
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
    const actionColors: Record<string, string> = {
        'Fold': '#ef4444',
        'Check': '#6b7280',
        'Call': '#22c55e',
        'Raise': '#f59e0b',
        'All-In': '#a855f7'
    };

    const actionColor = actionColors[line.action] || '#888';

    return (
        <div style={{
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
            borderRadius: '10px'
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
                <div style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: line.ev >= 0 ? '#22c55e' : '#ef4444'
                }}>
                    {line.ev >= 0 ? '+' : ''}{line.ev.toFixed(2)} BB
                </div>
                {evDiffFromGTO !== undefined && (
                    <div style={{
                        fontSize: '11px',
                        color: COLORS.critical
                    }}>
                        {evDiffFromGTO.toFixed(2)} BB worse
                    </div>
                )}
            </div>
        </div>
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
