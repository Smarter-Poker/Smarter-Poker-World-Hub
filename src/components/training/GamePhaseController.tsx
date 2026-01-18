/**
 * 🎮 GAME PHASE CONTROLLER - The Flow/Timing Engine
 * 
 * State machine controlling the entire training session flow:
 * 
 * PHASE A: FEEDBACK LOOP (After Every Hand)
 * - Lock buttons → Show Feedback Card → View Range toggle → XP animation
 * 
 * PHASE B: TRANSITION (Between Hands)
 * - Unmount feedback → Cinematic Deal → Reset shot clock
 * 
 * PHASE C: DEBRIEF (After Hand 20)
 * - Session Report Modal → Review Mode for mistakes
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { SolverResult } from './FeedbackCard';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type GamePhase =
    | 'INITIALIZING'     // Loading game data
    | 'DEALING'          // Cinematic deal animation
    | 'AWAITING_ACTION'  // User must make a decision
    | 'PROCESSING'       // Checking answer against GTO
    | 'SHOWING_FEEDBACK' // Feedback card visible
    | 'VIEWING_RANGE'    // Heatmap overlay visible
    | 'TRANSITIONING'    // Between hands
    | 'DEBRIEF'          // Session complete, showing report
    | 'REVIEW_MODE';     // Reviewing a specific mistake

export interface HandResult {
    handIndex: number;
    isCorrect: boolean;
    userAction: string;
    gtoAction: string;
    evDiff: number;
    solverResult: SolverResult;
    timeToDecide: number; // Seconds
}

export interface SessionStats {
    totalHands: number;
    correctCount: number;
    mistakeCount: number;
    criticalMistakes: number;
    totalEVLost: number;
    averageTime: number;
    xpEarned: number;
    diamondsEarned: number;
    accuracy: number;
    handResults: HandResult[];
}

export interface PhaseControllerState {
    phase: GamePhase;
    handIndex: number;
    isButtonsLocked: boolean;
    showFeedbackCard: boolean;
    showHeatmap: boolean;
    showSessionReport: boolean;
    currentFeedback: SolverResult | null;
    sessionStats: SessionStats;
    reviewingHandIndex: number | null;
    shotClockActive: boolean;
    shotClockRemaining: number;
}

interface PhaseControllerConfig {
    totalHands: number;
    shotClockDuration: number; // Seconds
    baseXPPerHand: number;
    xpMultiplier: number;
    diamondMultiplier: number;
    onPhaseChange?: (phase: GamePhase) => void;
    onHandComplete?: (result: HandResult) => void;
    onSessionComplete?: (stats: SessionStats) => void;
    playSound?: (soundKey: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SESSION_STATS: SessionStats = {
    totalHands: 0,
    correctCount: 0,
    mistakeCount: 0,
    criticalMistakes: 0,
    totalEVLost: 0,
    averageTime: 0,
    xpEarned: 0,
    diamondsEarned: 0,
    accuracy: 0,
    handResults: []
};

const DEFAULT_CONFIG: PhaseControllerConfig = {
    totalHands: 20,
    shotClockDuration: 30,
    baseXPPerHand: 10,
    xpMultiplier: 1.0,
    diamondMultiplier: 1.0
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useGamePhaseController(config: Partial<PhaseControllerConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    const [state, setState] = useState<PhaseControllerState>({
        phase: 'INITIALIZING',
        handIndex: 0,
        isButtonsLocked: false,
        showFeedbackCard: false,
        showHeatmap: false,
        showSessionReport: false,
        currentFeedback: null,
        sessionStats: { ...DEFAULT_SESSION_STATS },
        reviewingHandIndex: null,
        shotClockActive: false,
        shotClockRemaining: fullConfig.shotClockDuration
    });

    const shotClockRef = useRef<NodeJS.Timeout | null>(null);
    const handStartTimeRef = useRef<number>(Date.now());

    // ─────────────────────────────────────────────────────────────────────
    // SHOT CLOCK MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────

    const startShotClock = useCallback(() => {
        if (shotClockRef.current) clearInterval(shotClockRef.current);

        handStartTimeRef.current = Date.now();
        setState(prev => ({
            ...prev,
            shotClockActive: true,
            shotClockRemaining: fullConfig.shotClockDuration
        }));

        shotClockRef.current = setInterval(() => {
            setState(prev => {
                if (prev.shotClockRemaining <= 1) {
                    // Time's up - auto-fold
                    clearInterval(shotClockRef.current!);
                    return { ...prev, shotClockRemaining: 0, shotClockActive: false };
                }
                return { ...prev, shotClockRemaining: prev.shotClockRemaining - 1 };
            });
        }, 1000);
    }, [fullConfig.shotClockDuration]);

    const stopShotClock = useCallback(() => {
        if (shotClockRef.current) {
            clearInterval(shotClockRef.current);
            shotClockRef.current = null;
        }
        setState(prev => ({ ...prev, shotClockActive: false }));
    }, []);

    // ─────────────────────────────────────────────────────────────────────
    // PHASE A: START GAME / DEAL
    // ─────────────────────────────────────────────────────────────────────

    const startGame = useCallback(() => {
        setState(prev => ({
            ...prev,
            phase: 'DEALING',
            handIndex: 1,
            sessionStats: { ...DEFAULT_SESSION_STATS }
        }));

        fullConfig.onPhaseChange?.('DEALING');
        fullConfig.playSound?.('deal_cards');

        // After deal animation, switch to awaiting action
        setTimeout(() => {
            setState(prev => ({ ...prev, phase: 'AWAITING_ACTION' }));
            startShotClock();
            fullConfig.onPhaseChange?.('AWAITING_ACTION');
        }, 1500); // Match cinematic deal duration
    }, [fullConfig, startShotClock]);

    // ─────────────────────────────────────────────────────────────────────
    // PHASE A: HANDLE USER ACTION
    // ─────────────────────────────────────────────────────────────────────

    const handleUserAction = useCallback((
        userAction: string,
        solverResult: SolverResult
    ) => {
        // Immediately lock buttons to prevent double-clicks
        setState(prev => ({
            ...prev,
            isButtonsLocked: true,
            phase: 'PROCESSING'
        }));

        stopShotClock();

        const timeToDecide = (Date.now() - handStartTimeRef.current) / 1000;

        // Process result
        const handResult: HandResult = {
            handIndex: state.handIndex,
            isCorrect: solverResult.isCorrect,
            userAction,
            gtoAction: solverResult.gtoLine.action,
            evDiff: solverResult.evDiff,
            solverResult,
            timeToDecide
        };

        // Calculate XP/Diamonds
        const baseXP = fullConfig.baseXPPerHand;
        const xpEarned = solverResult.isCorrect
            ? Math.floor(baseXP * fullConfig.xpMultiplier)
            : Math.floor(baseXP * 0.25); // 25% XP for mistakes

        const diamondsEarned = solverResult.isCorrect
            ? Math.floor(5 * fullConfig.diamondMultiplier)
            : 0;

        // Play appropriate sound
        if (solverResult.isCorrect) {
            fullConfig.playSound?.('correct_ding');
        } else if (Math.abs(solverResult.evDiff) > 1.0) {
            fullConfig.playSound?.('critical_error');
        } else {
            fullConfig.playSound?.('soft_error');
        }

        // Update state with feedback
        setState(prev => {
            const isCritical = Math.abs(solverResult.evDiff) > 1.0;

            const newStats: SessionStats = {
                ...prev.sessionStats,
                totalHands: prev.sessionStats.totalHands + 1,
                correctCount: prev.sessionStats.correctCount + (solverResult.isCorrect ? 1 : 0),
                mistakeCount: prev.sessionStats.mistakeCount + (solverResult.isCorrect ? 0 : 1),
                criticalMistakes: prev.sessionStats.criticalMistakes + (isCritical ? 1 : 0),
                totalEVLost: prev.sessionStats.totalEVLost + Math.max(0, -solverResult.evDiff),
                xpEarned: prev.sessionStats.xpEarned + xpEarned,
                diamondsEarned: prev.sessionStats.diamondsEarned + diamondsEarned,
                handResults: [...prev.sessionStats.handResults, handResult]
            };

            newStats.accuracy = newStats.totalHands > 0
                ? (newStats.correctCount / newStats.totalHands) * 100
                : 0;

            newStats.averageTime = newStats.handResults.reduce((sum, r) => sum + r.timeToDecide, 0)
                / newStats.handResults.length;

            return {
                ...prev,
                phase: 'SHOWING_FEEDBACK',
                showFeedbackCard: true,
                currentFeedback: solverResult,
                sessionStats: newStats
            };
        });

        fullConfig.onHandComplete?.(handResult);
        fullConfig.onPhaseChange?.('SHOWING_FEEDBACK');
    }, [state.handIndex, fullConfig, stopShotClock]);

    // ─────────────────────────────────────────────────────────────────────
    // VIEW RANGE (Heatmap Toggle)
    // ─────────────────────────────────────────────────────────────────────

    const toggleHeatmap = useCallback(() => {
        setState(prev => {
            const nowShowing = !prev.showHeatmap;
            return {
                ...prev,
                phase: nowShowing ? 'VIEWING_RANGE' : 'SHOWING_FEEDBACK',
                showHeatmap: nowShowing
            };
        });
    }, []);

    const closeHeatmap = useCallback(() => {
        setState(prev => ({
            ...prev,
            phase: 'SHOWING_FEEDBACK',
            showHeatmap: false
        }));
    }, []);

    // ─────────────────────────────────────────────────────────────────────
    // PHASE B: NEXT HAND TRANSITION
    // ─────────────────────────────────────────────────────────────────────

    const nextHand = useCallback(() => {
        const nextIndex = state.handIndex + 1;

        // Close feedback/heatmap
        setState(prev => ({
            ...prev,
            showFeedbackCard: false,
            showHeatmap: false,
            currentFeedback: null,
            isButtonsLocked: false,
            phase: 'TRANSITIONING'
        }));

        fullConfig.onPhaseChange?.('TRANSITIONING');

        // Check if session complete (Phase C)
        if (nextIndex > fullConfig.totalHands) {
            setTimeout(() => {
                setState(prev => ({
                    ...prev,
                    phase: 'DEBRIEF',
                    showSessionReport: true
                }));
                fullConfig.playSound?.('level_complete');
                fullConfig.onPhaseChange?.('DEBRIEF');
                fullConfig.onSessionComplete?.(state.sessionStats);
            }, 500);
            return;
        }

        // Start next hand
        setTimeout(() => {
            setState(prev => ({
                ...prev,
                phase: 'DEALING',
                handIndex: nextIndex
            }));

            fullConfig.playSound?.('deal_cards');
            fullConfig.onPhaseChange?.('DEALING');

            // After deal animation
            setTimeout(() => {
                setState(prev => ({ ...prev, phase: 'AWAITING_ACTION' }));
                startShotClock();
                fullConfig.onPhaseChange?.('AWAITING_ACTION');
            }, 1500);
        }, 300);
    }, [state.handIndex, state.sessionStats, fullConfig, startShotClock]);

    // ─────────────────────────────────────────────────────────────────────
    // PHASE C: REVIEW MODE
    // ─────────────────────────────────────────────────────────────────────

    const enterReviewMode = useCallback((handIndex: number) => {
        const handResult = state.sessionStats.handResults.find(r => r.handIndex === handIndex);
        if (!handResult) return;

        setState(prev => ({
            ...prev,
            phase: 'REVIEW_MODE',
            showSessionReport: false,
            showFeedbackCard: true,
            showHeatmap: true,
            currentFeedback: handResult.solverResult,
            reviewingHandIndex: handIndex,
            isButtonsLocked: true // Read-only mode
        }));

        fullConfig.onPhaseChange?.('REVIEW_MODE');
    }, [state.sessionStats.handResults, fullConfig]);

    const exitReviewMode = useCallback(() => {
        setState(prev => ({
            ...prev,
            phase: 'DEBRIEF',
            showSessionReport: true,
            showFeedbackCard: false,
            showHeatmap: false,
            reviewingHandIndex: null
        }));
        fullConfig.onPhaseChange?.('DEBRIEF');
    }, [fullConfig]);

    // ─────────────────────────────────────────────────────────────────────
    // KEYBOARD SHORTCUTS
    // ─────────────────────────────────────────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Spacebar = Next Hand (when showing feedback)
            if (e.code === 'Space' && state.showFeedbackCard && !state.showHeatmap) {
                e.preventDefault();
                nextHand();
            }

            // Escape = Close heatmap or exit review
            if (e.code === 'Escape') {
                if (state.showHeatmap) {
                    closeHeatmap();
                } else if (state.phase === 'REVIEW_MODE') {
                    exitReviewMode();
                }
            }

            // R = Toggle Range/Heatmap
            if (e.key.toLowerCase() === 'r' && state.showFeedbackCard) {
                toggleHeatmap();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state, nextHand, closeHeatmap, exitReviewMode, toggleHeatmap]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (shotClockRef.current) clearInterval(shotClockRef.current);
        };
    }, []);

    // ─────────────────────────────────────────────────────────────────────
    // RETURN API
    // ─────────────────────────────────────────────────────────────────────

    return {
        // State
        ...state,

        // Derived
        isComplete: state.handIndex >= fullConfig.totalHands && state.phase === 'DEBRIEF',
        handsRemaining: fullConfig.totalHands - state.handIndex,
        progressPercent: (state.handIndex / fullConfig.totalHands) * 100,

        // Actions
        startGame,
        handleUserAction,
        nextHand,
        toggleHeatmap,
        closeHeatmap,
        enterReviewMode,
        exitReviewMode,

        // Config
        config: fullConfig
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface PhaseIndicatorProps {
    phase: GamePhase;
    handIndex: number;
    totalHands: number;
    shotClockRemaining?: number;
}

export function PhaseIndicator({
    phase,
    handIndex,
    totalHands,
    shotClockRemaining
}: PhaseIndicatorProps) {
    const phaseLabels: Record<GamePhase, string> = {
        'INITIALIZING': 'Loading...',
        'DEALING': 'Dealing Cards',
        'AWAITING_ACTION': 'Your Turn',
        'PROCESSING': 'Checking...',
        'SHOWING_FEEDBACK': 'Review',
        'VIEWING_RANGE': 'Range View',
        'TRANSITIONING': 'Next Hand',
        'DEBRIEF': 'Session Complete',
        'REVIEW_MODE': 'Reviewing Mistake'
    };

    const isActionPhase = phase === 'AWAITING_ACTION';
    const isUrgent = shotClockRemaining !== undefined && shotClockRemaining <= 10;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '8px 16px',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: '12px'
        }}>
            {/* Hand Counter */}
            <div style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#00d4ff'
            }}>
                Hand {handIndex}/{totalHands}
            </div>

            {/* Phase Label */}
            <div style={{
                padding: '4px 12px',
                background: isActionPhase ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)',
                border: `1px solid ${isActionPhase ? '#f59e0b' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                color: isActionPhase ? '#f59e0b' : '#888'
            }}>
                {phaseLabels[phase]}
            </div>

            {/* Shot Clock */}
            {isActionPhase && shotClockRemaining !== undefined && (
                <div style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: isUrgent ? '#ef4444' : '#fff',
                    animation: isUrgent ? 'pulse 0.5s infinite' : 'none'
                }}>
                    {shotClockRemaining}s
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION REPORT MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface SessionReportProps {
    stats: SessionStats;
    onClose: () => void;
    onReviewMistake: (handIndex: number) => void;
    onPlayAgain: () => void;
}

export function SessionReport({
    stats,
    onClose,
    onReviewMistake,
    onPlayAgain
}: SessionReportProps) {
    const mistakes = stats.handResults.filter(r => !r.isCorrect);
    const passed = stats.accuracy >= 85;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '24px'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '600px',
                background: 'linear-gradient(135deg, #0a0a1a, #1a1a3a)',
                borderRadius: '24px',
                border: `2px solid ${passed ? '#22c55e' : '#f59e0b'}`,
                boxShadow: `0 0 60px ${passed ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: passed
                        ? 'linear-gradient(135deg, rgba(34,197,94,0.2), transparent)'
                        : 'linear-gradient(135deg, rgba(245,158,11,0.2), transparent)'
                }}>
                    <div style={{ fontSize: '64px', marginBottom: '16px' }}>
                        {passed ? '🏆' : '📊'}
                    </div>
                    <h2 style={{
                        fontSize: '28px',
                        fontWeight: 800,
                        color: passed ? '#22c55e' : '#f59e0b',
                        margin: 0
                    }}>
                        {passed ? 'Level Complete!' : 'Keep Practicing'}
                    </h2>
                    <p style={{ color: '#888', marginTop: '8px' }}>
                        {passed
                            ? `You passed with ${stats.accuracy.toFixed(0)}% accuracy!`
                            : `${stats.accuracy.toFixed(0)}% accuracy - Need 85% to pass`
                        }
                    </p>
                </div>

                {/* Stats Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '1px',
                    background: 'rgba(255,255,255,0.1)',
                    padding: '1px'
                }}>
                    <StatBox label="Correct" value={stats.correctCount} color="#22c55e" />
                    <StatBox label="Mistakes" value={stats.mistakeCount} color="#f59e0b" />
                    <StatBox label="Critical" value={stats.criticalMistakes} color="#ef4444" />
                    <StatBox label="XP Earned" value={`+${stats.xpEarned}`} color="#00d4ff" />
                    <StatBox label="Diamonds" value={`+${stats.diamondsEarned}`} color="#a855f7" />
                    <StatBox label="Avg Time" value={`${stats.averageTime.toFixed(1)}s`} color="#888" />
                </div>

                {/* Mistakes List */}
                {mistakes.length > 0 && (
                    <div style={{ padding: '20px' }}>
                        <h4 style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#888',
                            textTransform: 'uppercase',
                            marginBottom: '12px'
                        }}>
                            Review Mistakes ({mistakes.length})
                        </h4>
                        <div style={{
                            maxHeight: '150px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            {mistakes.slice(0, 5).map(m => (
                                <button
                                    key={m.handIndex}
                                    onClick={() => onReviewMistake(m.handIndex)}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 14px',
                                        background: 'rgba(239,68,68,0.1)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: '8px',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '13px'
                                    }}
                                >
                                    <span>Hand #{m.handIndex}: {m.userAction} → Should {m.gtoAction}</span>
                                    <span style={{ color: '#ef4444' }}>{m.evDiff.toFixed(2)} BB</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div style={{
                    padding: '20px',
                    display: 'flex',
                    gap: '12px',
                    background: 'rgba(0,0,0,0.3)'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1,
                            padding: '14px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '10px',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Exit to Hub
                    </button>
                    <button
                        onClick={onPlayAgain}
                        style={{
                            flex: 1,
                            padding: '14px',
                            background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                            border: 'none',
                            borderRadius: '10px',
                            color: '#fff',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        {passed ? '🎮 Next Level' : '🔄 Try Again'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
    return (
        <div style={{
            padding: '16px',
            background: '#0a0a1a',
            textAlign: 'center'
        }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>{label}</div>
        </div>
    );
}

export default useGamePhaseController;
