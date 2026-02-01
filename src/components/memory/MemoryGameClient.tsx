/**
 * Memory Game Client - "Guitar Hero" of Pre-flop Training
 * High-speed interactive drill with state machine game loop
 */

import { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useWorldStore } from '../../state/worldStore';
import { DiamondRewardService } from '../../services/DiamondRewardService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

type GameState = 'IDLE' | 'PLAYING' | 'FEEDBACK' | 'SUMMARY';

interface Hand {
    hand: string;
    correctAction: string;
    alternateLines?: { action: string; note: string }[];
    explanation?: string;
}

interface GameStateType {
    state: GameState;
    chartId: string | null;
    chartData: any | null;
    currentHand: Hand | null;
    handIndex: number;
    seenHands: Set<string>;
    score: number;
    correctCount: number;
    streak: number;
    maxStreak: number;
    totalXP: number;
    sessionXP: number;
    userAnswer: string | null;
    answerTime: number;
    startTime: number;
    sessionResults: { hand: string; correct: boolean; time: number }[];
}

type GameAction =
    | { type: 'START_GAME'; chartId: string; chartData: any }
    | { type: 'DEAL_HAND'; hand: Hand }
    | { type: 'SUBMIT_ANSWER'; answer: string; time: number }
    | { type: 'NEXT_HAND' }
    | { type: 'END_SESSION' }
    | { type: 'RETRY' }
    | { type: 'EXIT' };

const HANDS_PER_SESSION = 20;
const PASS_THRESHOLD = 0.85; // 85%
const SPEED_BONUS_THRESHOLD = 2000; // 2 seconds
const XP_PER_CORRECT = 10;
const XP_SPEED_BONUS = 5;
const COMBO_THRESHOLD = 5;

const ACTION_COLORS = {
    Fold: { bg: 'bg-gray-700', border: 'border-gray-500', text: 'text-gray-300' },
    Call: { bg: 'bg-emerald-600', border: 'border-emerald-400', text: 'text-emerald-100' },
    Raise: { bg: 'bg-red-600', border: 'border-red-400', text: 'text-red-100' },
};

// ═══════════════════════════════════════════════════════════════════════════
// GAME REDUCER
// ═══════════════════════════════════════════════════════════════════════════

function gameReducer(state: GameStateType, action: GameAction): GameStateType {
    switch (action.type) {
        case 'START_GAME':
            return {
                ...state,
                state: 'PLAYING',
                chartId: action.chartId,
                chartData: action.chartData,
                handIndex: 0,
                seenHands: new Set(),
                score: 0,
                correctCount: 0,
                streak: 0,
                sessionXP: 0,
                sessionResults: [],
                startTime: Date.now(),
            };

        case 'DEAL_HAND':
            return {
                ...state,
                currentHand: action.hand,
                userAnswer: null,
                answerTime: Date.now(),
            };

        case 'SUBMIT_ANSWER': {
            const isCorrect = action.answer === state.currentHand?.correctAction;
            const responseTime = action.time - state.answerTime;
            const isSpeedBonus = responseTime < SPEED_BONUS_THRESHOLD;

            let xpEarned = 0;
            if (isCorrect) {
                xpEarned = XP_PER_CORRECT + (isSpeedBonus ? XP_SPEED_BONUS : 0);
            }

            const newSeenHands = new Set(state.seenHands);
            if (state.currentHand) {
                newSeenHands.add(state.currentHand.hand);
            }

            return {
                ...state,
                state: 'FEEDBACK',
                userAnswer: action.answer,
                correctCount: state.correctCount + (isCorrect ? 1 : 0),
                streak: isCorrect ? state.streak + 1 : 0,
                maxStreak: Math.max(state.maxStreak, isCorrect ? state.streak + 1 : state.streak),
                totalXP: state.totalXP + xpEarned,
                sessionXP: state.sessionXP + xpEarned,
                seenHands: newSeenHands,
                sessionResults: [
                    ...state.sessionResults,
                    {
                        hand: state.currentHand?.hand || '',
                        correct: isCorrect,
                        time: responseTime
                    }
                ],
            };
        }

        case 'NEXT_HAND':
            if (state.handIndex + 1 >= HANDS_PER_SESSION) {
                return { ...state, state: 'SUMMARY' };
            }
            return {
                ...state,
                state: 'PLAYING',
                handIndex: state.handIndex + 1,
            };

        case 'END_SESSION':
            return { ...state, state: 'SUMMARY' };

        case 'RETRY':
            return {
                ...state,
                state: 'IDLE',
                handIndex: 0,
                score: 0,
                correctCount: 0,
                streak: 0,
                sessionXP: 0,
                sessionResults: [],
                // Keep seenHands to avoid repeats
            };

        case 'EXIT':
            return {
                ...state,
                state: 'IDLE',
                chartId: null,
                chartData: null,
                seenHands: new Set(),
            };

        default:
            return state;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface MemoryGameClientProps {
    chartId: string;
    levelIndex?: number; // 0-based index for difficulty scaling (0 = Level 1)
    onExit?: () => void;
    onLevelComplete?: (passed: boolean, accuracy: number) => void;
}

export default function MemoryGameClient({
    chartId,
    levelIndex = 0,
    onExit,
    onLevelComplete
}: MemoryGameClientProps) {
    // Economy integration
    const addDiamonds = useWorldStore(state => state.addDiamonds);
    const [rewardService] = useState(() => new DiamondRewardService(supabase));

    // Dynamic difficulty
    const getPassThreshold = useCallback((level: number): number => {
        // Formula: 85% + (2% per level), capped at 100%
        return Math.min(100, 85 + (level * 2)) / 100;
    }, []);

    const requiredAccuracy = getPassThreshold(levelIndex);
    const [gameState, dispatch] = useReducer(gameReducer, {
        state: 'IDLE',
        chartId: null,
        chartData: null,
        currentHand: null,
        handIndex: 0,
        seenHands: new Set<string>(),
        score: 0,
        correctCount: 0,
        streak: 0,
        maxStreak: 0,
        totalXP: 0,
        sessionXP: 0,
        userAnswer: null,
        answerTime: 0,
        startTime: 0,
        sessionResults: [],
    });

    const [isSimpleMode, setIsSimpleMode] = useState(true);
    const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Reward processing state (moved to top level to fix hooks violation)
    const [rewardsProcessed, setRewardsProcessed] = useState(false);
    const [backendRewards, setBackendRewards] = useState<{ xp: number; diamonds: number } | null>(null);

    // Calculate accuracy at component level
    const accuracy = gameState.sessionResults.length > 0
        ? gameState.correctCount / gameState.sessionResults.length
        : 0;
    const passed = accuracy >= requiredAccuracy;

    // Process rewards when entering SUMMARY state
    useEffect(() => {
        if (gameState.state === 'SUMMARY' && !rewardsProcessed && passed) {
            processRewards();
        }
    }, [gameState.state, rewardsProcessed, passed]);

    // Reset rewards state when retrying
    useEffect(() => {
        if (gameState.state === 'IDLE' || gameState.state === 'PLAYING') {
            setRewardsProcessed(false);
            setBackendRewards(null);
        }
    }, [gameState.state]);

    const processRewards = async () => {
        setRewardsProcessed(true);


        // Call backend reward service
        try {
            const sessionTimeSeconds = Math.floor((Date.now() - gameState.startTime) / 1000);
            const results = await rewardService.onLevelComplete(
                levelIndex + 1, // Convert 0-based to 1-based
                accuracy,
                sessionTimeSeconds
            );

            // Sum up diamonds from all rewards
            let totalDiamonds = 0;
            results.forEach(result => {
                if (result.success && result.diamonds_awarded) {
                    totalDiamonds += result.diamonds_awarded;
                }
            });

            // Update local state
            if (totalDiamonds > 0) {
                addDiamonds(totalDiamonds);
            }

            setBackendRewards({
                xp: gameState.sessionXP,
                diamonds: totalDiamonds
            });

            // Notify parent component
            onLevelComplete?.(passed, accuracy);
        } catch (error) {
            console.error('Failed to process rewards:', error);
            // Fallback: still show local rewards
            setBackendRewards({
                xp: gameState.sessionXP,
                diamonds: Math.floor(gameState.sessionXP / 10)
            });
        }
    };

    // Helper: Translate scenario to natural language
    const getScenarioText = (chartData: any) => {
        if (!chartData) return '';

        if (isSimpleMode) {
            // Natural language translation
            const position = chartData.position || chartData.hero_position || '';
            const villainAction = chartData.villain_action || '';

            const positionMap: Record<string, string> = {
                'BTN': 'the Button',
                'CO': 'the Cutoff',
                'UTG': 'Under the Gun',
                'MP': 'Middle Position',
                'SB': 'Small Blind',
                'BB': 'Big Blind',
            };

            const heroPos = positionMap[position] || position;

            if (villainAction.includes('vs')) {
                return `You are on ${heroPos} vs ${villainAction.replace('vs_', '').replace('_', ' ')}`;
            }

            return `You are on ${heroPos}`;
        } else {
            // Pro mode - shorthand
            return `${chartData.hero_position || chartData.position || ''} ${chartData.villain_action || ''}`.trim();
        }
    };

    // Load chart data and start game
    useEffect(() => {
        if (chartId && gameState.state === 'IDLE') {
            loadChartAndStart();
        }
    }, [chartId]);

    const loadChartAndStart = async () => {
        const { data, error } = await supabase
            .from('memory_charts_gold')
            .select('*')
            .eq('chart_id', chartId)
            .single();

        if (error || !data) {
            console.error('Failed to load chart:', error);
            return;
        }

        dispatch({ type: 'START_GAME', chartId, chartData: data });
    };

    // Deal next hand when in PLAYING state
    useEffect(() => {
        if (gameState.state === 'PLAYING' && gameState.chartData) {
            dealNextHand();
        }
    }, [gameState.state, gameState.handIndex]);

    const dealNextHand = () => {
        const chartGrid = gameState.chartData.hand_matrix || {};
        const allHands = Object.keys(chartGrid);

        // Filter out seen hands
        const unseenHands = allHands.filter(h => !gameState.seenHands.has(h));

        // If all hands seen, reset (shouldn't happen with 169 hands and 20 per session)
        const availableHands = unseenHands.length > 0 ? unseenHands : allHands;

        // Random selection
        const randomHand = availableHands[Math.floor(Math.random() * availableHands.length)];
        const handData = chartGrid[randomHand];

        const hand: Hand = {
            hand: randomHand,
            correctAction: handData.action,
            alternateLines: handData.alternates || [],
            explanation: handData.explanation || 'GTO optimal play based on range construction.',
        };

        dispatch({ type: 'DEAL_HAND', hand });
    };

    // Auto-advance after correct answer
    useEffect(() => {
        if (gameState.state === 'FEEDBACK' && gameState.userAnswer === gameState.currentHand?.correctAction) {
            feedbackTimerRef.current = setTimeout(() => {
                dispatch({ type: 'NEXT_HAND' });
            }, 500);
        }

        return () => {
            if (feedbackTimerRef.current) {
                clearTimeout(feedbackTimerRef.current);
            }
        };
    }, [gameState.state, gameState.userAnswer]);

    const handleAnswer = (action: string) => {
        if (gameState.state !== 'PLAYING') return;
        dispatch({ type: 'SUBMIT_ANSWER', answer: action, time: Date.now() });
    };

    const handleNextHand = () => {
        dispatch({ type: 'NEXT_HAND' });
    };

    const handleRetry = () => {
        dispatch({ type: 'RETRY' });
        loadChartAndStart();
    };

    const handleExit = () => {
        dispatch({ type: 'EXIT' });
        onExit?.();
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (gameState.state === 'PLAYING') {
                switch (e.key) {
                    case '1':
                        handleAnswer('Fold');
                        break;
                    case '2':
                        handleAnswer('Call');
                        break;
                    case '3':
                        handleAnswer('Raise');
                        break;
                    case 'Escape':
                        handleExit();
                        break;
                }
            } else if (gameState.state === 'FEEDBACK') {
                if (e.key === ' ' || e.key === 'Enter') {
                    handleNextHand();
                }
            } else if (gameState.state === 'SUMMARY') {
                if (e.key === 'r' || e.key === 'R') {
                    handleRetry();
                } else if (e.key === 'Escape') {
                    handleExit();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState.state]);

    // Calculate pass/fail (moved to SUMMARY state to use dynamic threshold)

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: IDLE STATE
    // ═══════════════════════════════════════════════════════════════════════

    if (gameState.state === 'IDLE') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-6">🎯</div>
                    <h1 className="text-4xl font-black text-white mb-4">Loading Memory Game...</h1>
                    <div className="animate-pulse text-purple-400">Preparing your training session</div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: PLAYING STATE
    // ═══════════════════════════════════════════════════════════════════════

    if (gameState.state === 'PLAYING' && gameState.currentHand) {
        const isCombo = gameState.streak >= COMBO_THRESHOLD;
        const scenarioText = getScenarioText(gameState.chartData);

        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8">
                {/* Header */}
                <div className="max-w-4xl mx-auto mb-8">
                    <div className="flex justify-between items-center">
                        <button
                            onClick={handleExit}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600 transition"
                        >
                            ← Exit
                        </button>

                        <div className="flex gap-6 items-center">
                            {/* Simple/Pro Mode Toggle */}
                            <button
                                onClick={() => setIsSimpleMode(!isSimpleMode)}
                                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600 text-xs transition"
                            >
                                {isSimpleMode ? '📖 Simple' : '🎯 Pro'}
                            </button>

                            <div className="text-center">
                                <div className="text-sm text-slate-400">Hand</div>
                                <div className="text-2xl font-bold text-cyan-400">
                                    {gameState.handIndex + 1}/{HANDS_PER_SESSION}
                                </div>
                            </div>

                            <div className="text-center">
                                <div className="text-sm text-slate-400">Accuracy</div>
                                <div className="text-2xl font-bold text-emerald-400">
                                    {Math.round((gameState.correctCount / Math.max(gameState.sessionResults.length, 1)) * 100)}%
                                </div>
                            </div>

                            {isCombo && (
                                <div className="text-center animate-pulse">
                                    <div className="text-sm text-orange-400">🔥 COMBO</div>
                                    <div className="text-2xl font-bold text-orange-400">{gameState.streak}x</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Scenario Context */}
                {scenarioText && (
                    <div className="max-w-2xl mx-auto mb-6 text-center">
                        <div className="bg-slate-800/50 rounded-lg px-4 py-2 inline-block border border-slate-700">
                            <span className="text-slate-400 text-sm">{scenarioText}</span>
                        </div>
                    </div>
                )}

                {/* Hand Display - Fanned Card Layout */}
                <div className="max-w-2xl mx-auto">
                    <div className="relative mb-8" style={{ height: '200px' }}>
                        {/* Question Text */}
                        <div className="text-center mb-6">
                            <h2 className="text-2xl font-bold text-white">
                                {isSimpleMode ? 'What is your best move?' : 'Hero Action?'}
                            </h2>
                        </div>

                        {/* Fanned Cards Container */}
                        <div className="flex justify-center items-center" style={{ perspective: '1000px' }}>
                            <div className="relative" style={{ width: '200px', height: '140px' }}>
                                {/* Left Card */}
                                <div
                                    className="absolute bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-4 border-cyan-500 flex items-center justify-center"
                                    style={{
                                        width: '120px',
                                        height: '140px',
                                        left: '0px',
                                        top: '0px',
                                        transform: 'rotate(-5deg)',
                                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 10px 30px rgba(6, 182, 212, 0.4)',
                                        zIndex: 1,
                                    }}
                                >
                                    <div className="text-6xl font-black text-white tracking-wider">
                                        {gameState.currentHand.hand[0]}
                                    </div>
                                </div>

                                {/* Right Card */}
                                <div
                                    className="absolute bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-4 border-cyan-500 flex items-center justify-center"
                                    style={{
                                        width: '120px',
                                        height: '140px',
                                        left: '80px',
                                        top: '0px',
                                        transform: 'rotate(15deg)',
                                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 10px 30px rgba(6, 182, 212, 0.4)',
                                        zIndex: 2,
                                    }}
                                >
                                    <div className="text-6xl font-black text-white tracking-wider">
                                        {gameState.currentHand.hand[1]}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Hand Type Label */}
                        <div className="text-center mt-4">
                            <div className="text-lg text-slate-400">
                                {gameState.currentHand.hand.length === 2 ? 'Pocket Pair' :
                                    gameState.currentHand.hand.endsWith('s') ? 'Suited' : 'Offsuit'}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-4 mt-8">
                        {[
                            { action: 'Fold', key: '1' },
                            { action: 'Call', key: '2' },
                            { action: 'Raise', key: '3' }
                        ].map(({ action, key }) => {
                            const colors = ACTION_COLORS[action as keyof typeof ACTION_COLORS];
                            return (
                                <button
                                    key={action}
                                    onClick={() => handleAnswer(action)}
                                    className={`relative ${colors.bg} ${colors.border} ${colors.text} border-4 rounded-xl py-8 text-2xl font-bold hover:scale-105 active:scale-95 transition-transform shadow-lg`}
                                >
                                    {/* Keyboard hint */}
                                    <span className="absolute -top-2 -right-2 w-8 h-8 bg-slate-900 border-2 border-slate-600 rounded-lg flex items-center justify-center text-sm text-slate-300 font-mono">
                                        {key}
                                    </span>
                                    {action.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>

                    <div className="text-center mt-6 text-sm text-slate-500">
                        Press 1 (Fold) • 2 (Call) • 3 (Raise)
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: FEEDBACK STATE
    // ═══════════════════════════════════════════════════════════════════════

    if (gameState.state === 'FEEDBACK' && gameState.currentHand) {
        const isCorrect = gameState.userAnswer === gameState.currentHand.correctAction;
        const responseTime = Date.now() - gameState.answerTime;
        const isSpeedBonus = responseTime < SPEED_BONUS_THRESHOLD;

        return (
            <div className={`min-h-screen ${isCorrect ? 'bg-gradient-to-br from-emerald-900 via-slate-900 to-emerald-900' : 'bg-gradient-to-br from-red-900 via-slate-900 to-red-900'} text-white p-8 transition-all duration-300`}>
                <div className="max-w-4xl mx-auto">
                    {/* Result Header */}
                    <div className="text-center mb-8">
                        <div className={`text-8xl mb-4 ${isCorrect ? 'animate-bounce' : 'animate-pulse'}`}>
                            {isCorrect ? '✓' : '✗'}
                        </div>
                        <h2 className={`text-4xl font-black mb-2 ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isCorrect ? 'CORRECT!' : 'WRONG!'}
                        </h2>

                        {isCorrect && isSpeedBonus && (
                            <div className="text-yellow-400 text-xl font-bold animate-pulse">
                                ⚡ SPEED BONUS +{XP_SPEED_BONUS} XP
                            </div>
                        )}
                    </div>

                    {/* Hand Info */}
                    <div className="bg-slate-800 rounded-xl p-6 mb-6">
                        <div className="text-center mb-4">
                            <div className="text-5xl font-black text-white mb-2">{gameState.currentHand.hand}</div>
                            <div className="text-slate-400">Your Answer: <span className={isCorrect ? 'text-emerald-400' : 'text-red-400'}>{gameState.userAnswer}</span></div>
                        </div>

                        {!isCorrect && (
                            <div className="border-t border-slate-700 pt-4">
                                <div className="mb-4">
                                    <div className="text-sm text-slate-400 mb-2">✓ Correct GTO Line:</div>
                                    <div className="text-2xl font-bold text-emerald-400">
                                        {gameState.currentHand.correctAction}
                                    </div>
                                </div>

                                {gameState.currentHand.alternateLines && gameState.currentHand.alternateLines.length > 0 && (
                                    <div className="mb-4">
                                        <div className="text-sm text-slate-400 mb-2">⚠️ Alternate Lines (Sub-optimal):</div>
                                        {gameState.currentHand.alternateLines.map((alt, idx) => (
                                            <div key={idx} className="text-yellow-400 text-sm">
                                                • {alt.action} - {alt.note}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <details className="mt-4">
                                    <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300 text-sm">
                                        📚 AI Explanation
                                    </summary>
                                    <div className="mt-2 text-sm text-slate-300 bg-slate-900 p-4 rounded">
                                        {gameState.currentHand.explanation}
                                    </div>
                                </details>
                            </div>
                        )}
                    </div>

                    {/* Continue Button */}
                    {!isCorrect && (
                        <div className="text-center">
                            <button
                                onClick={handleNextHand}
                                className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xl transition"
                            >
                                Continue →
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: SUMMARY STATE
    // ═══════════════════════════════════════════════════════════════════════

    if (gameState.state === 'SUMMARY') {
        const displayDiamonds = backendRewards?.diamonds ?? (passed ? Math.floor(gameState.sessionXP / 10) : 0);


        return (
            <div className={`min-h-screen ${passed ? 'bg-gradient-to-br from-yellow-900 via-slate-900 to-yellow-900' : 'bg-gradient-to-br from-slate-900 via-red-900 to-slate-900'} text-white p-8`}>
                <div className="max-w-2xl mx-auto">
                    {/* Result */}
                    <div className="text-center mb-8">
                        <div className="text-8xl mb-4">{passed ? '🏆' : '💀'}</div>
                        <h1 className={`text-5xl font-black mb-4 ${passed ? 'text-yellow-400' : 'text-red-400'}`}>
                            {passed ? 'LEVEL COMPLETE!' : 'FAILED'}
                        </h1>
                        <div className="text-2xl text-slate-300">
                            {Math.round(accuracy * 100)}% Accuracy
                        </div>
                        <div className="text-sm text-slate-400 mt-2">
                            (Need {Math.round(requiredAccuracy * 100)}% to pass • Level {levelIndex + 1})
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="bg-slate-800 rounded-xl p-6 mb-6 space-y-4">
                        <div className="flex justify-between border-b border-slate-700 pb-3">
                            <span className="text-slate-400">Correct Answers</span>
                            <span className="font-bold text-emerald-400">{gameState.correctCount}/{HANDS_PER_SESSION}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-700 pb-3">
                            <span className="text-slate-400">Best Streak</span>
                            <span className="font-bold text-orange-400">🔥 {gameState.maxStreak}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-700 pb-3">
                            <span className="text-slate-400">Session XP</span>
                            <span className="font-bold text-cyan-400">+{gameState.sessionXP} XP</span>
                        </div>
                        {passed && (
                            <div className="flex justify-between pt-2">
                                <span className="text-slate-400">Diamonds Earned</span>
                                <span className="font-bold text-yellow-400">
                                    <img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/> +{displayDiamonds}
                                    {backendRewards === null && <span className="text-xs ml-2 text-slate-500">(processing...)</span>}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4">
                        <button
                            onClick={handleRetry}
                            className="flex-1 px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition"
                        >
                            {passed ? 'Play Again' : 'Retry Level'}
                        </button>
                        <button
                            onClick={handleExit}
                            className="flex-1 px-6 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition"
                        >
                            {passed ? 'Next Level →' : 'Exit'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
