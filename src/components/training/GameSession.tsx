/**
 * 🎮 GOD MODE ENGINE — Game Session Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Main gameplay component that orchestrates:
 * - Director Animation (narrative text before showing table)
 * - Health Bar (visual HP with shake on damage)
 * - Bet Slider (snaps to nearest solver node)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface HandState {
    fileId: string;
    variantHash: string;
    heroHand: string;
    board: string;
    potSize: number;
    heroStack: number;
    villainStack: number;
    position: string;
    street: string;
    actionHistory: string[];
    solverNode: SolverNode;
}

interface SolverNode {
    actions: Record<string, ActionData>;
}

interface ActionData {
    frequency: number;
    ev: number;
}

interface DamageResult {
    isCorrect: boolean;
    isIndifferent: boolean;
    evLoss: number;
    chipPenalty: number;
    feedback: string;
}

interface GameSessionProps {
    gameId: string;
    userId: string;
    onSessionComplete?: (stats: SessionStats) => void;
}

interface SessionStats {
    handsPlayed: number;
    correctAnswers: number;
    totalDamage: number;
    passed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const HANDS_PER_ROUND = 20;
const STARTING_HEALTH = 100;
const SOLVER_SIZING_NODES = [0, 25, 33, 50, 66, 75, 100, 150, 200]; // % of pot

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface HealthBarProps {
    health: number;
    maxHealth: number;
    isShaking: boolean;
}

const HealthBar: React.FC<HealthBarProps> = ({ health, maxHealth, isShaking }) => {
    const percentage = (health / maxHealth) * 100;

    // Color transitions: Green -> Yellow -> Orange -> Red
    const getBarColor = () => {
        if (percentage > 66) return 'linear-gradient(90deg, #22c55e, #4ade80)';
        if (percentage > 33) return 'linear-gradient(90deg, #eab308, #facc15)';
        if (percentage > 15) return 'linear-gradient(90deg, #f97316, #fb923c)';
        return 'linear-gradient(90deg, #dc2626, #ef4444)';
    };

    return (
        <motion.div
            animate={isShaking ? { x: [-5, 5, -5, 5, 0] } : {}}
            transition={{ duration: 0.4 }}
            style={{
                width: '100%',
                padding: '0.5rem',
                background: 'rgba(0,0,0,0.5)',
                borderRadius: '0.75rem',
                border: '2px solid rgba(255,215,0,0.3)',
            }}
        >
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.25rem',
                fontSize: '0.875rem',
                color: '#ffd700',
                fontWeight: 600,
            }}>
                <span>🏥 HEALTH</span>
                <span>{health} / {maxHealth}</span>
            </div>
            <div style={{
                width: '100%',
                height: '1.5rem',
                background: 'rgba(0,0,0,0.6)',
                borderRadius: '0.5rem',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
            }}>
                <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, type: 'spring' }}
                    style={{
                        height: '100%',
                        background: getBarColor(),
                        borderRadius: '0.5rem',
                        boxShadow: '0 0 10px rgba(255,255,255,0.3)',
                    }}
                />
            </div>
        </motion.div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTOR ANIMATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface DirectorProps {
    actionHistory: string[];
    onComplete: () => void;
}

const DirectorAnimation: React.FC<DirectorProps> = ({ actionHistory, onComplete }) => {
    const [currentLine, setCurrentLine] = useState(0);
    const [displayedText, setDisplayedText] = useState('');

    // Format action history into narrative lines
    const narrativeLines = actionHistory.map((action, i) => {
        const parts = action.split(':');
        const player = parts[0] || 'Player';
        const move = parts[1] || action;
        return `${player} ${move}...`;
    });

    // Add dramatic intro
    const allLines = [
        '🎬 Setting the scene...',
        ...narrativeLines,
        '⚡ Your turn to act!'
    ];

    useEffect(() => {
        if (currentLine >= allLines.length) {
            // All lines shown, wait then complete
            const timer = setTimeout(onComplete, 800);
            return () => clearTimeout(timer);
        }

        // Typewriter effect
        const line = allLines[currentLine];
        let charIndex = 0;

        const typeInterval = setInterval(() => {
            if (charIndex <= line.length) {
                setDisplayedText(line.substring(0, charIndex));
                charIndex++;
            } else {
                clearInterval(typeInterval);
                // Move to next line after pause
                setTimeout(() => {
                    setCurrentLine(prev => prev + 1);
                    setDisplayedText('');
                }, 400);
            }
        }, 30);

        return () => clearInterval(typeInterval);
    }, [currentLine, allLines, onComplete]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)',
                zIndex: 50,
            }}
        >
            <div style={{
                maxWidth: '600px',
                padding: '2rem',
                textAlign: 'center',
            }}>
                {/* Previous lines (faded) */}
                {allLines.slice(0, currentLine).map((line, i) => (
                    <motion.p
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 0.4, y: 0 }}
                        style={{
                            fontSize: '1.25rem',
                            color: '#888',
                            marginBottom: '0.5rem',
                            fontFamily: 'monospace',
                        }}
                    >
                        {line}
                    </motion.p>
                ))}

                {/* Current line (typing) */}
                {currentLine < allLines.length && (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                            fontSize: '1.5rem',
                            color: '#ffd700',
                            fontWeight: 600,
                            fontFamily: 'monospace',
                            minHeight: '2rem',
                        }}
                    >
                        {displayedText}
                        <span style={{
                            animation: 'blink 0.8s infinite',
                            marginLeft: '2px',
                        }}>|</span>
                    </motion.p>
                )}
            </div>

            <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
        </motion.div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// BET SLIDER WITH SNAPPING
// ═══════════════════════════════════════════════════════════════════════════

interface BetSliderProps {
    potSize: number;
    heroStack: number;
    onSubmit: (sizing: number) => void;
    disabled?: boolean;
}

const BetSlider: React.FC<BetSliderProps> = ({ potSize, heroStack, onSubmit, disabled }) => {
    const [visualValue, setVisualValue] = useState(50); // What user sees (0-200%)
    const [snappedValue, setSnappedValue] = useState(50); // What we submit

    // Find nearest solver node
    const snapToNode = (value: number): number => {
        let closest = SOLVER_SIZING_NODES[0];
        let minDiff = Math.abs(value - closest);

        for (const node of SOLVER_SIZING_NODES) {
            const diff = Math.abs(value - node);
            if (diff < minDiff) {
                minDiff = diff;
                closest = node;
            }
        }
        return closest;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value);
        setVisualValue(value);
        setSnappedValue(snapToNode(value));
    };

    const handleSubmit = () => {
        if (!disabled) {
            onSubmit(snappedValue);
        }
    };

    const actualBetAmount = Math.min((snappedValue / 100) * potSize, heroStack);

    return (
        <div style={{
            width: '100%',
            padding: '1rem',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: '1rem',
            border: '2px solid rgba(255,215,0,0.3)',
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.5rem',
                fontSize: '0.875rem',
                color: '#888',
            }}>
                <span>Bet Size</span>
                <span style={{ color: '#ffd700' }}>
                    {snappedValue}% pot = ${actualBetAmount.toFixed(0)}
                </span>
            </div>

            {/* Visual slider */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <input
                    type="range"
                    min={0}
                    max={200}
                    value={visualValue}
                    onChange={handleChange}
                    disabled={disabled}
                    style={{
                        width: '100%',
                        height: '0.5rem',
                        appearance: 'none',
                        background: `linear-gradient(to right, #ffd700 ${visualValue / 2}%, #333 ${visualValue / 2}%)`,
                        borderRadius: '0.25rem',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                />

                {/* Snap indicator */}
                {visualValue !== snappedValue && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                            position: 'absolute',
                            left: `${snappedValue / 2}%`,
                            top: '-1.5rem',
                            transform: 'translateX(-50%)',
                            fontSize: '0.75rem',
                            color: '#22c55e',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        ↓ Snaps to {snappedValue}%
                    </motion.div>
                )}
            </div>

            {/* Solver nodes markers */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.625rem',
                color: '#666',
                marginBottom: '1rem',
            }}>
                {SOLVER_SIZING_NODES.map(node => (
                    <span
                        key={node}
                        style={{
                            color: snappedValue === node ? '#ffd700' : '#666',
                            fontWeight: snappedValue === node ? 600 : 400,
                        }}
                    >
                        {node}%
                    </span>
                ))}
            </div>

            {/* Submit button */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSubmit}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: disabled
                        ? '#333'
                        : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: disabled ? '#666' : '#000',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    textTransform: 'uppercase',
                }}
            >
                🎯 Bet {snappedValue}%
            </motion.button>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

interface ActionButtonsProps {
    onAction: (action: string, sizing?: number) => void;
    disabled?: boolean;
    availableActions: string[];
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
    onAction,
    disabled,
    availableActions
}) => {
    const buttonConfig: Record<string, { color: string; icon: string }> = {
        fold: { color: '#ef4444', icon: '🃏' },
        check: { color: '#22c55e', icon: '✓' },
        call: { color: '#3b82f6', icon: '📞' },
        raise: { color: '#f59e0b', icon: '⬆️' },
        allin: { color: '#a855f7', icon: '🔥' },
    };

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.75rem',
            marginBottom: '1rem',
        }}>
            {availableActions.map(action => {
                const config = buttonConfig[action] || { color: '#666', icon: '?' };
                return (
                    <motion.button
                        key={action}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onAction(action)}
                        disabled={disabled}
                        style={{
                            padding: '1rem',
                            background: disabled ? '#333' : config.color,
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.75rem',
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            textTransform: 'uppercase',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            opacity: disabled ? 0.5 : 1,
                        }}
                    >
                        <span>{config.icon}</span>
                        <span>{action}</span>
                    </motion.button>
                );
            })}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

interface FeedbackOverlayProps {
    result: DamageResult | null;
    onContinue: () => void;
}

const FeedbackOverlay: React.FC<FeedbackOverlayProps> = ({ result, onContinue }) => {
    if (!result) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.85)',
                zIndex: 100,
            }}
            onClick={onContinue}
        >
            <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                style={{
                    padding: '2rem',
                    background: result.isCorrect
                        ? 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)'
                        : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                    borderRadius: '1.5rem',
                    border: `3px solid ${result.isCorrect ? '#10b981' : '#ef4444'}`,
                    textAlign: 'center',
                    maxWidth: '400px',
                }}
            >
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                    {result.isCorrect ? '✓' : '✗'}
                </div>
                <h3 style={{
                    fontSize: '1.5rem',
                    color: result.isCorrect ? '#10b981' : '#ef4444',
                    marginBottom: '0.5rem',
                }}>
                    {result.isCorrect ? 'CORRECT!' : 'MISTAKE'}
                </h3>
                <p style={{
                    fontSize: '1rem',
                    color: '#fff',
                    marginBottom: '1rem',
                }}>
                    {result.feedback}
                </p>

                {result.isIndifferent && (
                    <div style={{
                        padding: '0.5rem',
                        background: 'rgba(255,215,0,0.2)',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#ffd700',
                        marginBottom: '1rem',
                    }}>
                        🎲 Mixed Strategy — Both plays are acceptable
                    </div>
                )}

                {!result.isCorrect && (
                    <div style={{
                        padding: '0.75rem',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem',
                    }}>
                        <div style={{ fontSize: '0.875rem', color: '#888' }}>EV LOSS</div>
                        <div style={{ fontSize: '1.5rem', color: '#ef4444' }}>
                            -{result.evLoss.toFixed(2)} EV
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#f97316' }}>
                            -{result.chipPenalty} Health
                        </div>
                    </div>
                )}

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onContinue}
                    style={{
                        padding: '0.75rem 2rem',
                        background: 'linear-gradient(135deg, #ffd700 0%, #f59e0b 100%)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '0.5rem',
                        fontSize: '1rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    NEXT HAND →
                </motion.button>
            </motion.div>
        </motion.div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GAME SESSION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const GameSession: React.FC<GameSessionProps> = ({
    gameId,
    userId,
    onSessionComplete,
}) => {
    // Game state
    const [currentHand, setCurrentHand] = useState<HandState | null>(null);
    const [health, setHealth] = useState(STARTING_HEALTH);
    const [handsPlayed, setHandsPlayed] = useState(0);
    const [correctAnswers, setCorrectAnswers] = useState(0);
    const [totalDamage, setTotalDamage] = useState(0);

    // UI state
    const [phase, setPhase] = useState<'loading' | 'director' | 'playing' | 'feedback' | 'complete'>('loading');
    const [isShaking, setIsShaking] = useState(false);
    const [feedbackResult, setFeedbackResult] = useState<DamageResult | null>(null);
    const [showSlider, setShowSlider] = useState(false);

    // Fetch next hand
    const fetchNextHand = useCallback(async () => {
        setPhase('loading');

        try {
            // Call API to get next hand
            const response = await fetch('/api/god-mode/fetch-hand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId, userId }),
            });

            const data = await response.json();

            if (data.hand) {
                setCurrentHand(data.hand);
                setPhase('director'); // Start with director animation
            } else {
                // No more hands available
                setPhase('complete');
            }
        } catch (error) {
            console.error('Failed to fetch hand:', error);
            // Fallback: use mock data for demo
            setCurrentHand(getMockHand());
            setPhase('director');
        }
    }, [gameId, userId]);

    // Handle user action
    const handleAction = async (action: string, sizing?: number) => {
        if (!currentHand) return;

        setPhase('feedback');

        try {
            // Call API to calculate damage
            const response = await fetch('/api/god-mode/submit-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId,
                    userId,
                    fileId: currentHand.fileId,
                    variantHash: currentHand.variantHash,
                    action,
                    sizing,
                }),
            });

            const result: DamageResult = await response.json();

            // Apply damage
            if (result.chipPenalty > 0) {
                setIsShaking(true);
                setTimeout(() => setIsShaking(false), 500);
                setHealth(prev => Math.max(0, prev - result.chipPenalty));
                setTotalDamage(prev => prev + result.chipPenalty);
            }

            if (result.isCorrect) {
                setCorrectAnswers(prev => prev + 1);
            }

            setHandsPlayed(prev => prev + 1);
            setFeedbackResult(result);

        } catch (error) {
            console.error('Failed to submit action:', error);
            // Fallback: use mock result
            const mockResult = getMockDamageResult(action);
            setFeedbackResult(mockResult);
            if (mockResult.chipPenalty > 0) {
                setIsShaking(true);
                setTimeout(() => setIsShaking(false), 500);
                setHealth(prev => Math.max(0, prev - mockResult.chipPenalty));
            }
            setHandsPlayed(prev => prev + 1);
        }
    };

    // Continue to next hand
    const handleContinue = () => {
        setFeedbackResult(null);
        setShowSlider(false);

        // Check if round is complete
        if (handsPlayed >= HANDS_PER_ROUND || health <= 0) {
            setPhase('complete');
            onSessionComplete?.({
                handsPlayed,
                correctAnswers,
                totalDamage,
                passed: (correctAnswers / handsPlayed) * 100 >= 85, // Level 1 threshold
            });
        } else {
            fetchNextHand();
        }
    };

    // Initial load
    useEffect(() => {
        fetchNextHand();
    }, [fetchNextHand]);

    // Director animation complete
    const handleDirectorComplete = () => {
        setPhase('playing');
    };

    // Determine available actions
    const getAvailableActions = (): string[] => {
        if (!currentHand) return [];

        const actions = Object.keys(currentHand.solverNode?.actions || {});
        // Normalize action names
        return [...new Set(actions.map(a => {
            if (a.includes('bet') || a.includes('raise')) return 'raise';
            return a.split('_')[0];
        }))];
    };

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            minHeight: '600px',
            background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)',
            overflow: 'hidden',
            borderRadius: '1.5rem',
        }}>
            {/* Header */}
            <div style={{
                padding: '1rem',
                borderBottom: '1px solid rgba(255,215,0,0.2)',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                }}>
                    <span style={{ color: '#888', fontSize: '0.875rem' }}>
                        Hand {handsPlayed + 1} / {HANDS_PER_ROUND}
                    </span>
                    <span style={{
                        color: '#22c55e',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                    }}>
                        {correctAnswers} / {handsPlayed} Correct
                    </span>
                </div>
                <HealthBar health={health} maxHealth={STARTING_HEALTH} isShaking={isShaking} />
            </div>

            {/* Main Content Area */}
            <div style={{
                padding: '1rem',
                height: 'calc(100% - 120px)',
                display: 'flex',
                flexDirection: 'column',
            }}>
                <AnimatePresence mode="wait">
                    {/* Loading State */}
                    {phase === 'loading' && (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <div style={{
                                fontSize: '3rem',
                                animation: 'spin 1s linear infinite',
                            }}>
                                🎴
                            </div>
                            <style>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
                        </motion.div>
                    )}

                    {/* Director Animation */}
                    {phase === 'director' && currentHand && (
                        <DirectorAnimation
                            key="director"
                            actionHistory={currentHand.actionHistory}
                            onComplete={handleDirectorComplete}
                        />
                    )}

                    {/* Playing Phase */}
                    {phase === 'playing' && currentHand && (
                        <motion.div
                            key="playing"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                        >
                            {/* Hand Display (placeholder for actual table) */}
                            <div style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '1rem',
                            }}>
                                {/* Hero Cards */}
                                <div style={{
                                    display: 'flex',
                                    gap: '0.5rem',
                                    fontSize: '3rem',
                                    padding: '1rem',
                                    background: 'rgba(0,0,0,0.5)',
                                    borderRadius: '1rem',
                                    border: '2px solid rgba(255,215,0,0.3)',
                                }}>
                                    {formatCards(currentHand.heroHand)}
                                </div>

                                {/* Board */}
                                {currentHand.board && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.25rem',
                                        fontSize: '2rem',
                                        padding: '0.75rem',
                                        background: 'rgba(34,139,34,0.3)',
                                        borderRadius: '0.75rem',
                                    }}>
                                        {formatCards(currentHand.board)}
                                    </div>
                                )}

                                {/* Pot & Stack Info */}
                                <div style={{
                                    display: 'flex',
                                    gap: '2rem',
                                    fontSize: '1rem',
                                    color: '#888',
                                }}>
                                    <span>Pot: <b style={{ color: '#ffd700' }}>${currentHand.potSize}</b></span>
                                    <span>Stack: <b style={{ color: '#22c55e' }}>${currentHand.heroStack}</b></span>
                                    <span>Position: <b style={{ color: '#3b82f6' }}>{currentHand.position}</b></span>
                                </div>
                            </div>

                            {/* Action Controls */}
                            <div style={{ marginTop: 'auto' }}>
                                <ActionButtons
                                    onAction={(action) => {
                                        if (action === 'raise') {
                                            setShowSlider(true);
                                        } else {
                                            handleAction(action);
                                        }
                                    }}
                                    disabled={false}
                                    availableActions={getAvailableActions()}
                                />

                                {showSlider && (
                                    <BetSlider
                                        potSize={currentHand.potSize}
                                        heroStack={currentHand.heroStack}
                                        onSubmit={(sizing) => handleAction('raise', sizing)}
                                    />
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Complete Phase */}
                    {phase === 'complete' && (
                        <motion.div
                            key="complete"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                            }}
                        >
                            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
                                {health > 0 ? '🏆' : '💀'}
                            </div>
                            <h2 style={{
                                fontSize: '2rem',
                                color: health > 0 ? '#22c55e' : '#ef4444',
                                marginBottom: '0.5rem',
                            }}>
                                {health > 0 ? 'ROUND COMPLETE!' : 'BUSTED!'}
                            </h2>
                            <p style={{ color: '#888', marginBottom: '2rem' }}>
                                {correctAnswers} / {handsPlayed} Correct ({((correctAnswers / handsPlayed) * 100).toFixed(0)}%)
                            </p>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => window.location.reload()}
                                style={{
                                    padding: '1rem 2rem',
                                    background: 'linear-gradient(135deg, #ffd700 0%, #f59e0b 100%)',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '0.75rem',
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                PLAY AGAIN
                            </motion.button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Feedback Overlay */}
            <AnimatePresence>
                {feedbackResult && (
                    <FeedbackOverlay result={feedbackResult} onContinue={handleContinue} />
                )}
            </AnimatePresence>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatCards(cards: string): React.ReactNode[] {
    const cardToEmoji: Record<string, string> = {
        's': '♠', 'h': '♥', 'd': '♦', 'c': '♣'
    };

    const result: React.ReactNode[] = [];
    let i = 0;

    while (i < cards.length) {
        const rank = cards[i];
        const suit = cards[i + 1];
        const color = (suit === 'h' || suit === 'd') ? '#ef4444' : '#fff';

        result.push(
            <span key={i} style={{ color }}>
                {rank}{cardToEmoji[suit] || suit}
            </span>
        );
        i += 2;
    }

    return result;
}

function getMockHand(): HandState {
    return {
        fileId: 'mock_001',
        variantHash: '0',
        heroHand: 'AhKs',
        board: 'Qh7c2d',
        potSize: 50,
        heroStack: 100,
        villainStack: 100,
        position: 'BTN',
        street: 'flop',
        actionHistory: ['Hero:raises 2.5x', 'Villain:calls'],
        solverNode: {
            actions: {
                check: { frequency: 0.35, ev: 10 },
                bet_50: { frequency: 0.45, ev: 12 },
                bet_100: { frequency: 0.20, ev: 11 },
            }
        }
    };
}

function getMockDamageResult(action: string): DamageResult {
    if (action === 'raise' || action === 'bet_50') {
        return {
            isCorrect: true,
            isIndifferent: false,
            evLoss: 0,
            chipPenalty: 0,
            feedback: 'Perfect play! c-betting is optimal here.',
        };
    }
    if (action === 'check') {
        return {
            isCorrect: true,
            isIndifferent: true,
            evLoss: 0.2,
            chipPenalty: 0,
            feedback: 'Mixed strategy — checking is acceptable.',
        };
    }
    return {
        isCorrect: false,
        isIndifferent: false,
        evLoss: 12,
        chipPenalty: 6,
        feedback: 'BET 50% was the optimal play.',
    };
}

export default GameSession;
