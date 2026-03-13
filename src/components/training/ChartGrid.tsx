/**
 * ChartGrid.tsx
 * ==============
 * 13x13 Push/Fold chart grid for CHART engine games.
 *
 * Features:
 * - Interactive 13x13 hand grid (169 combos)
 * - Pocket pairs on diagonal
 * - Suited hands above diagonal (AKs, AQs, etc.)
 * - Offsuit hands below diagonal (AKo, AQo, etc.)
 * - Click to select hand, then choose action
 * - Visual feedback: Green=correct, Red=wrong
 * - Position & stack depth display
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface ChartGridProps {
    chartType: string;           // 'push_fold' | '3bet_defend' | 'bb_defense'
    heroPosition: string;        // 'BTN' | 'CO' | 'SB' | 'BB' etc.
    stackBB: number;             // Stack in big blinds
    villainPosition?: string;    // Villain position for 3bet scenarios
    highlightHand?: string;      // Hand to highlight (e.g., 'AKs')
    correctRange?: string[];     // Correct hands for current action
    phase: 'SELECT_HAND' | 'SELECT_ACTION' | 'SHOWING_RESULT';
    resultFeedback?: {
        hand: string;
        isCorrect: boolean;
        correctAction: string;
    } | null;
    onAction: (action: string, hand: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Position colors
const POSITION_COLORS: Record<string, string> = {
    BTN: '#00d4ff',
    CO: '#00ff88',
    HJ: '#ffaa00',
    MP: '#ff6600',
    UTG: '#ff4444',
    SB: '#aa66ff',
    BB: '#ff66aa',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getHandNotation = (row: number, col: number): string => {
    const rank1 = RANKS[row];
    const rank2 = RANKS[col];

    if (row === col) {
        // Pocket pair
        return `${rank1}${rank2}`;
    } else if (row < col) {
        // Suited (above diagonal)
        return `${rank1}${rank2}s`;
    } else {
        // Offsuit (below diagonal)
        return `${rank2}${rank1}o`;
    }
};

const getCellStyle = (row: number, col: number, isSelected: boolean, isHighlighted: boolean, result: 'correct' | 'wrong' | null): React.CSSProperties => {
    let background = 'rgba(255, 255, 255, 0.05)';
    let borderColor = 'rgba(255, 255, 255, 0.1)';

    // Pocket pairs - diagonal
    if (row === col) {
        background = 'rgba(138, 43, 226, 0.3)';
        borderColor = 'rgba(138, 43, 226, 0.5)';
    }
    // Suited - above diagonal
    else if (row < col) {
        background = 'rgba(0, 150, 255, 0.2)';
        borderColor = 'rgba(0, 150, 255, 0.4)';
    }
    // Offsuit - below diagonal
    else {
        background = 'rgba(100, 100, 100, 0.2)';
        borderColor = 'rgba(100, 100, 100, 0.4)';
    }

    // Selection state
    if (isSelected) {
        background = 'rgba(0, 212, 255, 0.5)';
        borderColor = '#00d4ff';
    }

    // Highlight state (question hand)
    if (isHighlighted) {
        background = 'rgba(255, 215, 0, 0.4)';
        borderColor = '#ffd700';
    }

    // Result states
    if (result === 'correct') {
        background = 'rgba(0, 255, 136, 0.5)';
        borderColor = '#00ff88';
    } else if (result === 'wrong') {
        background = 'rgba(255, 68, 68, 0.5)';
        borderColor = '#ff4444';
    }

    return {
        width: 48,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    };
};

// ============================================================================
// COMPONENT
// ============================================================================

const ChartGrid: React.FC<ChartGridProps> = ({
    chartType,
    heroPosition,
    stackBB,
    villainPosition,
    highlightHand,
    correctRange,
    phase,
    resultFeedback,
    onAction,
}) => {
    const [selectedHand, setSelectedHand] = useState<string | null>(null);
    const [showActionMenu, setShowActionMenu] = useState(false);

    // Get action options based on chart type
    const getActionOptions = (): { action: string; label: string; color: string }[] => {
        switch (chartType) {
            case 'push_fold':
                return [
                    { action: 'PUSH', label: 'PUSH', color: '#ff4444' },
                    { action: 'FOLD', label: 'FOLD', color: '#666666' },
                ];
            case '3bet_defend':
                return [
                    { action: '3BET', label: '3-BET', color: '#ff4444' },
                    { action: 'CALL', label: 'CALL', color: '#00ff88' },
                    { action: 'FOLD', label: 'FOLD', color: '#666666' },
                ];
            case 'bb_defense':
                return [
                    { action: 'CALL', label: 'CALL', color: '#00ff88' },
                    { action: 'FOLD', label: 'FOLD', color: '#666666' },
                ];
            default:
                return [
                    { action: 'PUSH', label: 'PUSH', color: '#ff4444' },
                    { action: 'FOLD', label: 'FOLD', color: '#666666' },
                ];
        }
    };

    const handleCellClick = useCallback((hand: string) => {
        if (phase !== 'SELECT_HAND') return;
        setSelectedHand(hand);
        setShowActionMenu(true);
    }, [phase]);

    const handleActionSelect = useCallback((action: string) => {
        if (selectedHand) {
            onAction(action, selectedHand);
            setShowActionMenu(false);
            setSelectedHand(null);
        }
    }, [selectedHand, onAction]);

    // Reset state when phase changes
    useEffect(() => {
        if (phase === 'SELECT_HAND') {
            setSelectedHand(null);
            setShowActionMenu(false);
        }
    }, [phase]);

    const positionColor = POSITION_COLORS[heroPosition] || '#00d4ff';

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.positionBadge}>
                    <span style={{ ...styles.positionDot, background: positionColor }} />
                    <span style={styles.positionText}>{heroPosition}</span>
                </div>
                <div style={styles.stackBadge}>
                    <span style={styles.stackText}>{stackBB} BB</span>
                </div>
                {villainPosition && (
                    <div style={styles.villainBadge}>
                        vs {villainPosition}
                    </div>
                )}
            </div>

            {/* Chart Type Label */}
            <div style={styles.chartLabel}>
                {chartType === 'push_fold' && '📊 Push/Fold Chart'}
                {chartType === '3bet_defend' && '🎯 3-Bet Defense'}
                {chartType === 'bb_defense' && '🛡️ BB Defense'}
            </div>

            {/* Grid */}
            <div style={styles.gridContainer}>
                {/* Column headers */}
                <div style={styles.headerRow}>
                    <div style={styles.cornerCell} />
                    {RANKS.map((rank) => (
                        <div key={rank} style={styles.headerCell}>
                            {rank}
                        </div>
                    ))}
                </div>

                {/* Grid rows */}
                {RANKS.map((rowRank, rowIdx) => (
                    <div key={rowRank} style={styles.gridRow}>
                        {/* Row header */}
                        <div style={styles.rowHeaderCell}>
                            {rowRank}
                        </div>

                        {/* Cells */}
                        {RANKS.map((colRank, colIdx) => {
                            const hand = getHandNotation(rowIdx, colIdx);
                            const isSelected = selectedHand === hand;
                            const isHighlighted = highlightHand === hand;

                            let result: 'correct' | 'wrong' | null = null;
                            if (resultFeedback && resultFeedback.hand === hand) {
                                result = resultFeedback.isCorrect ? 'correct' : 'wrong';
                            }

                            return (
                                <motion.div
                                    key={hand}
                                    style={getCellStyle(rowIdx, colIdx, isSelected, isHighlighted, result)}
                                    whileHover={{ scale: phase === 'SELECT_HAND' ? 1.1 : 1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleCellClick(hand)}
                                    animate={isHighlighted ? {
                                        boxShadow: ['0 0 10px #ffd700', '0 0 20px #ffd700', '0 0 10px #ffd700'],
                                    } : {}}
                                    transition={{ duration: 0.5, repeat: isHighlighted ? Infinity : 0 }}
                                >
                                    {hand}
                                    {result === 'correct' && <span style={styles.checkMark}>✓</span>}
                                    {result === 'wrong' && <span style={styles.xMark}>✗</span>}
                                </motion.div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Action Menu Overlay */}
            <AnimatePresence>
                {showActionMenu && selectedHand && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.actionOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.8, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.8, y: 20 }}
                            style={styles.actionMenu}
                        >
                            <div style={styles.selectedHandLabel}>
                                {selectedHand}
                            </div>
                            <div style={styles.actionButtons}>
                                {getActionOptions().map((opt) => (
                                    <motion.button
                                        key={opt.action}
                                        style={{ ...styles.actionButton, background: opt.color }}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => handleActionSelect(opt.action)}
                                    >
                                        {opt.label}
                                    </motion.button>
                                ))}
                            </div>
                            <button
                                style={styles.cancelButton}
                                onClick={() => setShowActionMenu(false)}
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Result Overlay */}
            <AnimatePresence>
                {phase === 'SHOWING_RESULT' && resultFeedback && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={styles.resultOverlay}
                    >
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            style={{
                                ...styles.resultCard,
                                borderColor: resultFeedback.isCorrect ? '#00ff88' : '#ff4444',
                            }}
                        >
                            <div style={{
                                fontSize: 48,
                                marginBottom: 16,
                            }}>
                                {resultFeedback.isCorrect ? '✅' : '❌'}
                            </div>
                            <div style={{
                                fontSize: 24,
                                fontWeight: 700,
                                color: resultFeedback.isCorrect ? '#00ff88' : '#ff4444',
                                marginBottom: 8,
                            }}>
                                {resultFeedback.isCorrect ? 'CORRECT!' : 'WRONG!'}
                            </div>
                            <div style={styles.resultHand}>
                                {resultFeedback.hand}
                            </div>
                            <div style={styles.correctAnswer}>
                                Correct: {resultFeedback.correctAction}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Legend */}
            <div style={styles.legend}>
                <div style={styles.legendItem}>
                    <span style={{ ...styles.legendDot, background: 'rgba(138, 43, 226, 0.5)' }} />
                    <span>Pairs</span>
                </div>
                <div style={styles.legendItem}>
                    <span style={{ ...styles.legendDot, background: 'rgba(0, 150, 255, 0.4)' }} />
                    <span>Suited</span>
                </div>
                <div style={styles.legendItem}>
                    <span style={{ ...styles.legendDot, background: 'rgba(100, 100, 100, 0.4)' }} />
                    <span>Offsuit</span>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 16,
        background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
        borderRadius: 16,
        minHeight: '100%',
    },
    header: {
        display: 'flex',
        gap: 12,
        marginBottom: 16,
        alignItems: 'center',
    },
    positionBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 8,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    positionDot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
    },
    positionText: {
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    stackBadge: {
        padding: '6px 12px',
        background: 'rgba(255, 215, 0, 0.2)',
        borderRadius: 8,
        border: '1px solid rgba(255, 215, 0, 0.4)',
    },
    stackText: {
        fontSize: 14,
        fontWeight: 700,
        color: '#ffd700',
    },
    villainBadge: {
        padding: '6px 12px',
        background: 'rgba(255, 68, 68, 0.2)',
        borderRadius: 8,
        border: '1px solid rgba(255, 68, 68, 0.4)',
        fontSize: 14,
        fontWeight: 600,
        color: '#ff4444',
    },
    chartLabel: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 16,
    },
    gridContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 8,
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
    },
    headerRow: {
        display: 'flex',
        gap: 2,
    },
    cornerCell: {
        width: 24,
        height: 24,
    },
    headerCell: {
        width: 48,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    gridRow: {
        display: 'flex',
        gap: 2,
    },
    rowHeaderCell: {
        width: 24,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    checkMark: {
        position: 'absolute',
        top: 2,
        right: 2,
        fontSize: 10,
        color: '#00ff88',
    },
    xMark: {
        position: 'absolute',
        top: 2,
        right: 2,
        fontSize: 10,
        color: '#ff4444',
    },
    actionOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    actionMenu: {
        background: 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
        borderRadius: 16,
        padding: 24,
        border: '2px solid rgba(0, 212, 255, 0.4)',
        textAlign: 'center',
    },
    selectedHandLabel: {
        fontSize: 32,
        fontWeight: 800,
        color: '#00d4ff',
        marginBottom: 20,
    },
    actionButtons: {
        display: 'flex',
        gap: 12,
        marginBottom: 16,
    },
    actionButton: {
        padding: '14px 28px',
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        minWidth: 100,
    },
    cancelButton: {
        background: 'transparent',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        padding: '8px 16px',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        borderRadius: 8,
        cursor: 'pointer',
    },
    resultOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    resultCard: {
        background: 'linear-gradient(135deg, #1a1a2e, #0d0d1a)',
        borderRadius: 16,
        padding: 32,
        border: '2px solid',
        textAlign: 'center',
    },
    resultHand: {
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    correctAnswer: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    legend: {
        display: 'flex',
        gap: 16,
        marginTop: 16,
    },
    legendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 2,
    },
};

export default ChartGrid;
