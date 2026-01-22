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
    chartType: string;           // 'push_fold', 'open_raise', 'call_shove', etc.
    heroPosition: string;        // 'BTN', 'CO', 'SB', 'BB', etc.
    stackBB: number;             // Stack size in big blinds
    villainPosition?: string;    // For vs-specific charts
    correctRange?: string[];     // Array of hands that should be pushed/called
    onAction: (action: string, hand: string) => void;
    resultFeedback?: {
        hand: string;
        isCorrect: boolean;
        correctAction: string;
    } | null;
    phase: 'SELECT_HAND' | 'SELECT_ACTION' | 'SHOWING_RESULT';
    highlightHand?: string;      // Hand to highlight (the "question")
}

interface CellState {
    hand: string;
    status: 'neutral' | 'correct' | 'wrong' | 'highlight' | 'selected';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Position colors
const POSITION_COLORS: { [key: string]: string } = {
    'BTN': '#00D4FF',
    'CO': '#4CAF50',
    'HJ': '#8BC34A',
    'LJ': '#CDDC39',
    'SB': '#FF9800',
    'BB': '#FF5722',
    'UTG': '#9C27B0',
    'UTG+1': '#673AB7',
    'UTG+2': '#3F51B5',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate the hand notation for a cell
 */
function getHandNotation(row: number, col: number): string {
    const rank1 = RANKS[row];
    const rank2 = RANKS[col];

    if (row === col) {
        // Pocket pair (diagonal)
        return `${rank1}${rank2}`;
    } else if (row < col) {
        // Suited (above diagonal)
        return `${rank1}${rank2}s`;
    } else {
        // Offsuit (below diagonal)
        return `${rank2}${rank1}o`;
    }
}

/**
 * Get cell background color based on state and hand strength
 */
function getCellBackground(hand: string, status: CellState['status']): string {
    // Result states override everything
    if (status === 'correct') {
        return 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9))';
    }
    if (status === 'wrong') {
        return 'linear-gradient(135deg, rgba(244, 67, 54, 0.9), rgba(211, 47, 47, 0.9))';
    }
    if (status === 'highlight') {
        return 'linear-gradient(135deg, rgba(255, 215, 0, 0.9), rgba(255, 165, 0, 0.9))';
    }
    if (status === 'selected') {
        return 'linear-gradient(135deg, rgba(0, 212, 255, 0.8), rgba(0, 153, 204, 0.8))';
    }

    // Default: gradient based on hand type
    const isPair = hand.length === 2;
    const isSuited = hand.endsWith('s');

    if (isPair) {
        // Pocket pairs - purple gradient
        return 'linear-gradient(135deg, rgba(156, 39, 176, 0.4), rgba(123, 31, 162, 0.4))';
    } else if (isSuited) {
        // Suited - blue gradient
        return 'linear-gradient(135deg, rgba(33, 150, 243, 0.3), rgba(25, 118, 210, 0.3))';
    } else {
        // Offsuit - darker
        return 'linear-gradient(135deg, rgba(50, 50, 70, 0.4), rgba(40, 40, 60, 0.4))';
    }
}

// ============================================================================
// GRID CELL COMPONENT
// ============================================================================

const GridCell: React.FC<{
    hand: string;
    row: number;
    col: number;
    status: CellState['status'];
    onClick: (hand: string) => void;
    disabled: boolean;
}> = ({ hand, row, col, status, onClick, disabled }) => {
    const isPair = hand.length === 2;
    const isSuited = hand.endsWith('s');

    return (
        <motion.div
            onClick={() => !disabled && onClick(hand)}
            whileHover={!disabled ? { scale: 1.1, zIndex: 10 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
                opacity: 1,
                scale: status === 'highlight' ? 1.15 : 1,
                zIndex: status === 'highlight' ? 20 : 1,
            }}
            transition={{ delay: (row * 13 + col) * 0.003 }}
            style={{
                width: '100%',
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: getCellBackground(hand, status),
                borderRadius: 4,
                cursor: disabled ? 'default' : 'pointer',
                border: status === 'highlight'
                    ? '3px solid #FFD700'
                    : status === 'selected'
                        ? '2px solid #00D4FF'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: status === 'highlight'
                    ? '0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.3)'
                    : status === 'correct'
                        ? '0 0 15px rgba(76, 175, 80, 0.5)'
                        : status === 'wrong'
                            ? '0 0 15px rgba(244, 67, 54, 0.5)'
                            : 'none',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <span style={{
                fontSize: 'clamp(8px, 1.8vw, 12px)',
                fontWeight: 700,
                color: status === 'highlight' ? '#000' : '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                letterSpacing: -0.5,
            }}>
                {hand}
            </span>

            {/* Suit indicator dot */}
            {isSuited && (
                <div style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#00D4FF',
                }} />
            )}
            {isPair && (
                <div style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#9C27B0',
                }} />
            )}

            {/* Result icon overlay */}
            {status === 'correct' && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 'clamp(12px, 3vw, 20px)',
                    }}
                >
                    ✓
                </motion.div>
            )}
            {status === 'wrong' && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 'clamp(12px, 3vw, 20px)',
                    }}
                >
                    ✗
                </motion.div>
            )}
        </motion.div>
    );
};

// ============================================================================
// ACTION POPUP COMPONENT
// ============================================================================

const ActionPopup: React.FC<{
    hand: string;
    chartType: string;
    onAction: (action: string) => void;
    onCancel: () => void;
}> = ({ hand, chartType, onAction, onCancel }) => {
    // Determine actions based on chart type
    const getActions = () => {
        switch (chartType) {
            case 'push_fold':
            case 'shove_fold':
                return [
                    { id: 'PUSH', label: 'PUSH', icon: '🚀', color: '#4CAF50' },
                    { id: 'FOLD', label: 'FOLD', icon: '🃏', color: '#FF5722' },
                ];
            case 'call_shove':
                return [
                    { id: 'CALL', label: 'CALL', icon: '✓', color: '#4CAF50' },
                    { id: 'FOLD', label: 'FOLD', icon: '✗', color: '#FF5722' },
                ];
            case 'open_raise':
                return [
                    { id: 'RAISE', label: 'RAISE', icon: '📈', color: '#4CAF50' },
                    { id: 'FOLD', label: 'FOLD', icon: '🃏', color: '#FF5722' },
                ];
            case '3bet_or_fold':
                return [
                    { id: '3BET', label: '3-BET', icon: '🔥', color: '#FF9800' },
                    { id: 'CALL', label: 'CALL', icon: '✓', color: '#4CAF50' },
                    { id: 'FOLD', label: 'FOLD', icon: '✗', color: '#FF5722' },
                ];
            default:
                return [
                    { id: 'PUSH', label: 'PUSH', icon: '🚀', color: '#4CAF50' },
                    { id: 'FOLD', label: 'FOLD', icon: '🃏', color: '#FF5722' },
                ];
        }
    };

    const actions = getActions();

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            style={styles.actionPopup}
        >
            {/* Header */}
            <div style={styles.popupHeader}>
                <span style={styles.popupHand}>{hand}</span>
                <button onClick={onCancel} style={styles.cancelBtn}>✕</button>
            </div>

            {/* Action Buttons */}
            <div style={styles.actionButtons}>
                {actions.map((action) => (
                    <motion.button
                        key={action.id}
                        onClick={() => onAction(action.id)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            ...styles.actionBtn,
                            background: `linear-gradient(135deg, ${action.color}, ${action.color}CC)`,
                        }}
                    >
                        <span style={styles.actionIcon}>{action.icon}</span>
                        <span style={styles.actionLabel}>{action.label}</span>
                    </motion.button>
                ))}
            </div>
        </motion.div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ChartGrid: React.FC<ChartGridProps> = ({
    chartType,
    heroPosition,
    stackBB,
    villainPosition,
    correctRange = [],
    onAction,
    resultFeedback,
    phase,
    highlightHand,
}) => {
    const [selectedHand, setSelectedHand] = useState<string | null>(null);
    const [cellStates, setCellStates] = useState<Map<string, CellState['status']>>(new Map());

    // Update cell states when feedback comes in
    useEffect(() => {
        if (resultFeedback) {
            setCellStates(prev => {
                const newStates = new Map(prev);
                newStates.set(
                    resultFeedback.hand,
                    resultFeedback.isCorrect ? 'correct' : 'wrong'
                );
                return newStates;
            });
            setSelectedHand(null);
        }
    }, [resultFeedback]);

    // Highlight the question hand
    useEffect(() => {
        if (highlightHand) {
            setCellStates(prev => {
                const newStates = new Map(prev);
                // Clear previous highlights
                newStates.forEach((value, key) => {
                    if (value === 'highlight') {
                        newStates.set(key, 'neutral');
                    }
                });
                newStates.set(highlightHand, 'highlight');
                return newStates;
            });
        }
    }, [highlightHand]);

    const handleCellClick = useCallback((hand: string) => {
        if (phase === 'SELECT_HAND' || phase === 'SELECT_ACTION') {
            setSelectedHand(hand);
            setCellStates(prev => {
                const newStates = new Map(prev);
                // Clear previous selection
                newStates.forEach((value, key) => {
                    if (value === 'selected') {
                        newStates.set(key, 'neutral');
                    }
                });
                newStates.set(hand, 'selected');
                return newStates;
            });
        }
    }, [phase]);

    const handleAction = useCallback((action: string) => {
        if (selectedHand) {
            onAction(action, selectedHand);
        }
    }, [selectedHand, onAction]);

    const handleCancel = useCallback(() => {
        if (selectedHand) {
            setCellStates(prev => {
                const newStates = new Map(prev);
                newStates.set(selectedHand, highlightHand === selectedHand ? 'highlight' : 'neutral');
                return newStates;
            });
            setSelectedHand(null);
        }
    }, [selectedHand, highlightHand]);

    const getCellStatus = (hand: string): CellState['status'] => {
        return cellStates.get(hand) || 'neutral';
    };

    // Get chart title
    const getChartTitle = () => {
        switch (chartType) {
            case 'push_fold': return 'Push or Fold?';
            case 'call_shove': return 'Call the Shove?';
            case 'open_raise': return 'Open Raise?';
            case '3bet_or_fold': return '3-Bet, Call, or Fold?';
            default: return 'Make Your Decision';
        }
    };

    return (
        <div style={styles.container}>
            {/* Header Info */}
            <div style={styles.header}>
                <div style={styles.chartTitle}>{getChartTitle()}</div>
                <div style={styles.situationInfo}>
                    <span style={{
                        ...styles.positionBadge,
                        background: POSITION_COLORS[heroPosition] || '#666',
                    }}>
                        {heroPosition}
                    </span>
                    <span style={styles.stackInfo}>{stackBB} BB</span>
                    {villainPosition && (
                        <>
                            <span style={styles.vsText}>vs</span>
                            <span style={{
                                ...styles.positionBadge,
                                background: POSITION_COLORS[villainPosition] || '#666',
                            }}>
                                {villainPosition}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* The 13x13 Grid */}
            <div style={styles.gridContainer}>
                <div style={styles.grid}>
                    {RANKS.map((_, row) => (
                        RANKS.map((_, col) => {
                            const hand = getHandNotation(row, col);
                            return (
                                <GridCell
                                    key={`${row}-${col}`}
                                    hand={hand}
                                    row={row}
                                    col={col}
                                    status={getCellStatus(hand)}
                                    onClick={handleCellClick}
                                    disabled={phase === 'SHOWING_RESULT'}
                                />
                            );
                        })
                    ))}
                </div>

                {/* Legend */}
                <div style={styles.legend}>
                    <div style={styles.legendItem}>
                        <div style={{ ...styles.legendDot, background: '#9C27B0' }} />
                        <span>Pairs</span>
                    </div>
                    <div style={styles.legendItem}>
                        <div style={{ ...styles.legendDot, background: '#00D4FF' }} />
                        <span>Suited</span>
                    </div>
                    <div style={styles.legendItem}>
                        <div style={{ ...styles.legendDot, background: '#666' }} />
                        <span>Offsuit</span>
                    </div>
                </div>
            </div>

            {/* Instruction */}
            {phase === 'SELECT_HAND' && !highlightHand && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={styles.instruction}
                >
                    Click a hand to make your decision
                </motion.div>
            )}

            {highlightHand && phase !== 'SHOWING_RESULT' && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={styles.questionPrompt}
                >
                    You hold <strong style={{ color: '#FFD700' }}>{highlightHand}</strong> - What's your play?
                </motion.div>
            )}

            {/* Action Popup */}
            <AnimatePresence>
                {selectedHand && phase !== 'SHOWING_RESULT' && (
                    <ActionPopup
                        hand={selectedHand}
                        chartType={chartType}
                        onAction={handleAction}
                        onCancel={handleCancel}
                    />
                )}
            </AnimatePresence>

            {/* Result Feedback */}
            <AnimatePresence>
                {resultFeedback && phase === 'SHOWING_RESULT' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        style={{
                            ...styles.resultOverlay,
                            background: resultFeedback.isCorrect
                                ? 'rgba(76, 175, 80, 0.95)'
                                : 'rgba(244, 67, 54, 0.95)',
                        }}
                    >
                        <div style={styles.resultIcon}>
                            {resultFeedback.isCorrect ? '✓' : '✗'}
                        </div>
                        <div style={styles.resultText}>
                            {resultFeedback.isCorrect ? 'Correct!' : 'Incorrect'}
                        </div>
                        <div style={styles.resultDetail}>
                            {resultFeedback.hand}: {resultFeedback.correctAction}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        width: '100%',
        maxWidth: 500,
        margin: '0 auto',
        padding: 16,
        position: 'relative',
    },

    header: {
        textAlign: 'center',
        marginBottom: 16,
    },

    chartTitle: {
        fontSize: 24,
        fontWeight: 800,
        color: '#fff',
        marginBottom: 8,
        textShadow: '0 2px 4px rgba(0,0,0,0.3)',
    },

    situationInfo: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },

    positionBadge: {
        padding: '4px 12px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
    },

    stackInfo: {
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.8)',
    },

    vsText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },

    gridContainer: {
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 12,
        padding: 12,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },

    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(13, 1fr)',
        gap: 2,
    },

    legend: {
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },

    legendItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    legendDot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
    },

    instruction: {
        textAlign: 'center',
        marginTop: 16,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    questionPrompt: {
        textAlign: 'center',
        marginTop: 16,
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        padding: '12px 20px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 12,
        border: '2px solid rgba(255, 215, 0, 0.3)',
    },

    actionPopup: {
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: 16,
        background: 'linear-gradient(135deg, #1a2744, #0d1628)',
        borderRadius: 16,
        padding: 16,
        border: '2px solid rgba(0, 212, 255, 0.3)',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        zIndex: 100,
        minWidth: 200,
    },

    popupHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },

    popupHand: {
        fontSize: 24,
        fontWeight: 800,
        color: '#FFD700',
    },

    cancelBtn: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(255, 255, 255, 0.1)',
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer',
    },

    actionButtons: {
        display: 'flex',
        gap: 8,
    },

    actionBtn: {
        flex: 1,
        padding: '12px 16px',
        border: 'none',
        borderRadius: 12,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },

    actionIcon: {
        fontSize: 24,
    },

    actionLabel: {
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
    },

    resultOverlay: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '24px 48px',
        borderRadius: 16,
        textAlign: 'center',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        zIndex: 100,
    },

    resultIcon: {
        fontSize: 48,
        marginBottom: 8,
    },

    resultText: {
        fontSize: 24,
        fontWeight: 800,
        color: '#fff',
    },

    resultDetail: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: 8,
    },
};

export default ChartGrid;
