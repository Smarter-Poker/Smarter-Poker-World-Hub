/**
 * 🎮 UNIVERSAL TRAINING TABLE — FULL IMPLEMENTATION
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPLEMENTS:
 * - Phase 3: Cinematic Deal (500ms/800ms/1000ms timing)
 * - Phase 4: The Brain (Evaluation + Visual Feedback)
 * - Phase 5: Resolution (Auto-progression)
 * 
 * HARD RULES:
 * - NO <script> tags
 * - NO dangerouslySetInnerHTML
 * - 100% React state-driven
 * - INLINE STYLES ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { TRAINING_CLINICS } from '../../data/TRAINING_CLINICS';

// TypeScript interfaces
interface Question {
    id: string;
    heroCards: string[];
    position: string;
    stackDepth: number;
    villainAction: string;
    correctAction: string;
    lawId: string;
    explanation: string;
}

interface Level {
    level: number;
    name: string;
    passThreshold: number;
    questions: Question[];
}

interface StartingState {
    heroCards: string[];
    villainCards: string[];
    board: string[];
    pot: number;
    dealerBtn: string;
    heroStack: number;
    villainStack: number;
}

interface Clinic {
    id: string;
    name: string;
    title?: string;
    startingState?: StartingState;
    questions?: Question[];  // Legacy support
    levels?: Level[];        // New structure
}

// Game Phase Enum
enum GamePhase {
    IDLE = 'idle',
    DEALING = 'dealing',
    VILLAIN_ACTION = 'villain_action',
    PLAYER_TURN = 'player_turn',
    EVALUATING = 'evaluating',
    SHOWING_FEEDBACK = 'showing_feedback',
    TRANSITIONING = 'transitioning'
}

interface UniversalTrainingTableProps {
    gameId: string;
    onAnswer?: (action: string) => void;
}

export default function UniversalTrainingTable({ gameId, onAnswer }: UniversalTrainingTableProps) {
    // PHASE 1: DATA LOCK - Find the clinic
    const clinic = TRAINING_CLINICS.find(c => c.id === gameId) as Clinic | undefined;

    // PHASE 1: FORCE CHECK - Fail fast if clinic not found
    if (!clinic) {
        return (
            <div style={{
                width: '100%',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f172a',
                color: '#fff'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>Error: Clinic Not Found</h1>
                    <p style={{ color: '#9ca3af' }}>Game ID: {gameId}</p>
                </div>
            </div>
        );
    }

    // PHASE 2: STATE ENGINE
    const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.IDLE);
    const [heroCards, setHeroCards] = useState<string[]>(['??', '??']);
    const [villainCards, setVillainCards] = useState<string[]>(['??', '??']);
    const [villainAction, setVillainAction] = useState<string>('');
    const [boardCards, setBoardCards] = useState<string[]>([]);
    const [pot, setPot] = useState(0);

    // Feedback state
    const [showFeedback, setShowFeedback] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const [explanation, setExplanation] = useState('');
    const [xpEarned, setXpEarned] = useState(0);

    // Flash overlay state
    const [flashColor, setFlashColor] = useState<string | null>(null);

    // Question tracking
    const [questionIndex, setQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [totalXP, setTotalXP] = useState(0);

    // Session complete state
    const [sessionComplete, setSessionComplete] = useState(false);

    // Get questions from levels or legacy questions array
    const currentLevel = clinic.levels?.[0] || null;
    const questions = currentLevel?.questions || clinic.questions || [];

    // PHASE 3: CINEMATIC DEAL SEQUENCE
    useEffect(() => {
        if (questions.length === 0) return;

        const question = questions[questionIndex];
        if (!question) return;

        // T+0ms: Reset to IDLE
        setGamePhase(GamePhase.IDLE);
        setHeroCards(['??', '??']);
        setVillainCards(['??', '??']);
        setVillainAction('');
        setBoardCards([]);
        setShowFeedback(false);
        setFlashColor(null);

        // T+500ms: Deal Hero Cards (from question or startingState)
        const dealTimer = setTimeout(() => {
            setGamePhase(GamePhase.DEALING);
            // Use per-question heroCards if available, fallback to startingState
            setHeroCards(question.heroCards || clinic.startingState?.heroCards || ['Ah', 'Kh']);
            setPot(question.stackDepth || clinic.startingState?.pot || 12);
            setBoardCards(clinic.startingState?.board || []);
            // playSound('deal'); // TODO: Add audio
        }, 500);

        // T+800ms: Villain Action
        const villainTimer = setTimeout(() => {
            setGamePhase(GamePhase.VILLAIN_ACTION);
            setVillainAction(question.villainAction || 'Bets 2.5BB');
            // playSound('chip-click'); // TODO: Add audio
        }, 800);

        // T+1000ms: Player Turn - Unlock buttons
        const unlockTimer = setTimeout(() => {
            setGamePhase(GamePhase.PLAYER_TURN);
        }, 1000);

        return () => {
            clearTimeout(dealTimer);
            clearTimeout(villainTimer);
            clearTimeout(unlockTimer);
        };
    }, [clinic, questionIndex]);

    // PHASE 4: THE BRAIN - Evaluation Logic
    const handleAction = useCallback((action: string) => {
        if (gamePhase !== GamePhase.PLAYER_TURN) return;

        console.log('Player action:', action);
        onAnswer?.(action);

        // Lock buttons immediately
        setGamePhase(GamePhase.EVALUATING);

        // Get current question from the questions array
        const question = questions[questionIndex];
        if (!question) return;

        // Check if correct
        const correct = action.toLowerCase() === question.correctAction.toLowerCase();
        setIsCorrect(correct);
        setExplanation(question.explanation || 'Good decision!');

        // Log law violation if incorrect (for leak detection)
        if (!correct && question.lawId) {
            console.log(`⚠️ LEAK DETECTED: ${question.lawId}`);
            // TODO: Insert into user_leaks table via Supabase
        }

        // Calculate XP
        const baseXP = correct ? 100 : 0;
        setXpEarned(baseXP);
        if (correct) {
            setScore(prev => prev + 1);
            setTotalXP(prev => prev + baseXP);
        }

        // VISUAL FEEDBACK: Screen flash
        setFlashColor(correct ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)');

        // Clear flash after 300ms
        setTimeout(() => {
            setFlashColor(null);
        }, 300);

        // Show Professor feedback after flash
        setTimeout(() => {
            setGamePhase(GamePhase.SHOWING_FEEDBACK);
            setShowFeedback(true);
        }, 400);

    }, [gamePhase, questions, questionIndex, onAnswer]);

    // PHASE 5: RESOLUTION - Dismiss feedback and transition
    const handleDismissFeedback = useCallback(() => {
        setShowFeedback(false);
        setGamePhase(GamePhase.TRANSITIONING);

        // Clear villain cards
        setVillainCards(['??', '??']);
        setVillainAction('');

        // Move to next question after delay
        setTimeout(() => {
            const nextIndex = questionIndex + 1;
            const totalQuestions = questions.length;

            if (nextIndex >= totalQuestions) {
                // Session complete - show Victory Screen
                console.log('Session Complete! Final Score:', score + (isCorrect ? 1 : 0));
                setSessionComplete(true);
            } else {
                setQuestionIndex(nextIndex);
            }
        }, 500);
    }, [questionIndex, questions, score, isCorrect]);

    // Handle replay
    const handleReplay = useCallback(() => {
        setSessionComplete(false);
        setQuestionIndex(0);
        setScore(0);
        setTotalXP(0);
        setGamePhase(GamePhase.IDLE);
    }, []);

    // Handle return to hub
    const handleReturnToHub = useCallback(() => {
        window.location.href = '/hub/training';
    }, []);

    // Determine if buttons should be active
    const buttonsActive = gamePhase === GamePhase.PLAYER_TURN;

    // RENDER

    // PHASE 6: VICTORY SCREEN
    if (sessionComplete) {
        const totalQuestions = questions.length;
        const accuracy = Math.round((score / totalQuestions) * 100);
        const passed = accuracy >= 85;

        return (
            <div style={{
                width: '100%',
                height: '100vh',
                background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #1a2744, #0a1628)',
                    padding: 60,
                    borderRadius: 24,
                    border: passed ? '3px solid #fbbf24' : '3px solid #6b7280',
                    textAlign: 'center',
                    maxWidth: 500,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}>
                    {/* Trophy/Result Icon */}
                    <div style={{ fontSize: 80, marginBottom: 16 }}>
                        {passed ? '🏆' : '🔄'}
                    </div>

                    {/* Title */}
                    <h1 style={{
                        fontSize: 32,
                        fontWeight: 'bold',
                        color: passed ? '#4ade80' : '#fff',
                        marginBottom: 24
                    }}>
                        {passed ? 'SESSION COMPLETE!' : 'KEEP PRACTICING'}
                    </h1>

                    {/* Accuracy */}
                    <div style={{
                        fontSize: 64,
                        fontWeight: 'bold',
                        color: passed ? '#4ade80' : '#f97316',
                        marginBottom: 8
                    }}>
                        {accuracy}%
                    </div>
                    <div style={{ color: '#9ca3af', marginBottom: 24 }}>
                        {score} / {totalQuestions} correct
                    </div>

                    {/* XP Earned */}
                    <div style={{
                        background: 'rgba(251, 191, 36, 0.1)',
                        border: '1px solid #fbbf24',
                        borderRadius: 12,
                        padding: '12px 24px',
                        marginBottom: 32,
                        display: 'inline-block'
                    }}>
                        <span style={{ color: '#fbbf24', fontSize: 24, fontWeight: 'bold' }}>
                            +{totalXP} XP
                        </span>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <button
                            onClick={handleReplay}
                            style={{
                                padding: '16px 32px',
                                background: passed ? '#2563eb' : '#f97316',
                                border: 'none',
                                borderRadius: 12,
                                color: '#fff',
                                fontSize: 16,
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            {passed ? 'REPLAY' : 'TRY AGAIN'}
                        </button>
                        <button
                            onClick={handleReturnToHub}
                            style={{
                                padding: '16px 32px',
                                background: 'transparent',
                                border: '2px solid rgba(255,255,255,0.3)',
                                borderRadius: 12,
                                color: '#fff',
                                fontSize: 16,
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            RETURN TO HUB
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* FLASH OVERLAY */}
            {flashColor && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: flashColor,
                    zIndex: 100,
                    pointerEvents: 'none',
                    transition: 'opacity 0.3s'
                }} />
            )}

            {/* Title Bar */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 64,
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(8px)',
                borderBottom: '1px solid rgba(0, 212, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                zIndex: 50
            }}>
                <h1 style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>
                    {clinic.title || clinic.name}
                </h1>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    color: '#fff',
                    fontSize: 14
                }}>
                    <span>Q: {questionIndex + 1}/{questions.length}</span>
                    <span style={{ color: '#4ade80' }}>✓ {score}</span>
                    <span style={{ color: '#fbbf24' }}>XP: {totalXP}</span>
                </div>
            </div>

            {/* Poker Table */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 700,
                height: 400,
                background: 'linear-gradient(135deg, #166534, #14532d)',
                borderRadius: '50%',
                border: '8px solid #78350f',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                {/* Table Center - Pot */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center'
                }}>
                    <div style={{ color: '#facc15', fontSize: 24, fontWeight: 'bold' }}>
                        POT: {pot}BB
                    </div>
                </div>

                {/* Board Cards */}
                {boardCards.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '35%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 8
                    }}>
                        {boardCards.map((card, i) => (
                            <Card key={i} card={card} />
                        ))}
                    </div>
                )}
            </div>

            {/* VILLAIN - Top Center */}
            <div style={{
                position: 'absolute',
                top: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8
            }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>VILLAIN</div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {villainCards.map((card, i) => (
                        <Card key={i} card={card} size="small" />
                    ))}
                </div>
                {villainAction && (
                    <div style={{
                        background: '#dc2626',
                        color: '#fff',
                        padding: '8px 16px',
                        borderRadius: 8,
                        fontWeight: 'bold',
                        fontSize: 14,
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        {villainAction}
                    </div>
                )}
            </div>

            {/* HERO - Bottom Center */}
            <div style={{
                position: 'absolute',
                bottom: 150,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8
            }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    {heroCards.map((card, i) => (
                        <Card key={i} card={card} />
                    ))}
                </div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>YOU</div>
            </div>

            {/* Action Buttons */}
            <div style={{
                position: 'absolute',
                bottom: 40,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 16
            }}>
                <ActionButton
                    label="FOLD"
                    color="#dc2626"
                    onClick={() => handleAction('fold')}
                    disabled={!buttonsActive}
                />
                <ActionButton
                    label="CALL"
                    color="#2563eb"
                    onClick={() => handleAction('call')}
                    disabled={!buttonsActive}
                />
                <ActionButton
                    label="RAISE"
                    color="#16a34a"
                    onClick={() => handleAction('raise')}
                    disabled={!buttonsActive}
                />
            </div>

            {/* PROFESSOR FEEDBACK OVERLAY */}
            {showFeedback && (
                <div
                    onClick={handleDismissFeedback}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: isCorrect
                            ? 'linear-gradient(135deg, #166534, #14532d)'
                            : 'linear-gradient(135deg, #991b1b, #7f1d1d)',
                        padding: '40px 20px',
                        borderRadius: '20px 20px 0 0',
                        cursor: 'pointer',
                        zIndex: 200
                    }}
                >
                    <div style={{
                        maxWidth: 600,
                        margin: '0 auto',
                        textAlign: 'center',
                        color: '#fff'
                    }}>
                        <div style={{
                            fontSize: 48,
                            marginBottom: 16
                        }}>
                            {isCorrect ? '✓' : '✗'}
                        </div>
                        <div style={{
                            fontSize: 24,
                            fontWeight: 'bold',
                            marginBottom: 8
                        }}>
                            {isCorrect ? 'CORRECT!' : 'INCORRECT'}
                        </div>
                        {isCorrect && (
                            <div style={{
                                fontSize: 18,
                                color: '#fbbf24',
                                marginBottom: 16
                            }}>
                                +{xpEarned} XP
                            </div>
                        )}
                        <div style={{
                            fontSize: 16,
                            lineHeight: 1.5,
                            color: 'rgba(255,255,255,0.9)'
                        }}>
                            {explanation}
                        </div>
                        <div style={{
                            marginTop: 24,
                            fontSize: 14,
                            color: 'rgba(255,255,255,0.6)'
                        }}>
                            Tap anywhere to continue
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Action Button Component
function ActionButton({
    label,
    color,
    onClick,
    disabled
}: {
    label: string;
    color: string;
    onClick: () => void;
    disabled: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: '16px 32px',
                background: disabled ? '#4b5563' : color,
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: 16,
                fontWeight: 'bold',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.15s ease',
                transform: disabled ? 'none' : 'scale(1)',
                boxShadow: disabled ? 'none' : '0 4px 15px rgba(0,0,0,0.3)'
            }}
        >
            {label}
        </button>
    );
}

// Card Component - Pure CSS, no images
function Card({ card, size = 'medium' }: { card: string; size?: 'small' | 'medium' }) {
    const isBack = card === '??' || !card;

    const dimensions = size === 'small'
        ? { width: 48, height: 64 }
        : { width: 64, height: 96 };

    if (isBack) {
        return (
            <div style={{
                ...dimensions,
                background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                borderRadius: 8,
                border: '2px solid #fff',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <span style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>?</span>
            </div>
        );
    }

    // Parse card (e.g., "Ah" = Ace of hearts)
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);

    const suitSymbols: Record<string, string> = {
        'h': '♥',
        'd': '♦',
        'c': '♣',
        's': '♠'
    };

    const isRed = suit === 'h' || suit === 'd';

    return (
        <div style={{
            ...dimensions,
            background: '#fff',
            borderRadius: 8,
            border: '2px solid #1f2937',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <span style={{
                fontSize: size === 'small' ? 18 : 24,
                fontWeight: 'bold',
                color: isRed ? '#dc2626' : '#000'
            }}>
                {rank}
            </span>
            <span style={{
                fontSize: size === 'small' ? 16 : 20,
                color: isRed ? '#dc2626' : '#000'
            }}>
                {suitSymbols[suit] || suit}
            </span>
        </div>
    );
}
