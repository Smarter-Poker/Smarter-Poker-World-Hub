/**
 * 🎮 GOD MODE TRAINING SESSION — PREMIUM UI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Polished poker training interface with:
 * - Gold-trimmed stadium table
 * - Character avatars around the table
 * - Real card images
 * - Timer, XP, diamonds display
 * - Health bar with damage animations
 * - Clean action buttons
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// CONSTANTS
// ============================================================================

const HANDS_PER_SESSION = 20;
const MAX_HEALTH = 100;
const TIMER_SECONDS = 30;

// Avatar pool for villains
const VILLAIN_AVATARS = [
    'free_viking', 'free_ninja', 'free_wizard', 'free_pirate',
    'free_cowboy', 'free_samurai', 'free_knight', 'free_cyborg',
    'free_detective', 'free_rockstar', 'free_shark', 'free_fox',
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert card code (e.g., "Ah", "Ks") to image path
 */
function getCardImagePath(card: string): string {
    if (!card || card === '??' || card.length < 2) {
        return '/cards/optimized/card_back.png';
    }

    const rank = card.slice(0, -1).toLowerCase();
    const suit = card.slice(-1).toLowerCase();

    const suitMap: Record<string, string> = {
        h: 'hearts',
        d: 'diamonds',
        c: 'clubs',
        s: 'spades',
    };

    const rankMap: Record<string, string> = {
        a: 'a', k: 'k', q: 'q', j: 'j', t: '10',
        '10': '10', '9': '9', '8': '8', '7': '7',
        '6': '6', '5': '5', '4': '4', '3': '3', '2': '2',
    };

    const suitName = suitMap[suit] || 'spades';
    const rankName = rankMap[rank] || rank;

    return `/cards/optimized/${suitName}_${rankName}.png`;
}

/**
 * Parse board string into array of cards
 */
function parseBoard(board: string): string[] {
    if (!board) return [];
    // Handle formats: "AhKsQd" or "Ah Ks Qd" or "Ah,Ks,Qd"
    const cards = board.match(/[AKQJT98765432][shdc]/gi) || [];
    return cards;
}

/**
 * Parse hero hand string into array of cards
 */
function parseHand(hand: string): string[] {
    if (!hand) return ['??', '??'];
    const cards = hand.match(/[AKQJT98765432][shdc]/gi) || [];
    return cards.length >= 2 ? cards.slice(0, 2) : ['??', '??'];
}

/**
 * Get random villain avatar
 */
function getRandomAvatar(): string {
    return VILLAIN_AVATARS[Math.floor(Math.random() * VILLAIN_AVATARS.length)];
}

// ============================================================================
// TYPES
// ============================================================================

interface GameSessionProps {
    userId: string;
    gameId: string;
    gameName: string;
    onSessionComplete?: (stats: any) => void;
    onExit?: () => void;
}

interface HandData {
    hero_hand: string;
    board: string;
    pot_size: number;
    hero_position: string;
    villain_position: string;
    hero_stack: number;
    villain_stack: number;
    available_actions: string[];
    question_prompt: string;
    solver_node: any;
    fileId?: string;
    variantHash?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const GameSession: React.FC<GameSessionProps> = ({
    userId,
    gameId,
    gameName,
    onSessionComplete,
    onExit,
}) => {
    // Game state
    const [loading, setLoading] = useState(true);
    const [handNumber, setHandNumber] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [health, setHealth] = useState(MAX_HEALTH);
    const [xp, setXp] = useState(0);
    const [diamonds, setDiamonds] = useState(0);

    // Current hand state
    const [currentHand, setCurrentHand] = useState<HandData | null>(null);
    const [villainAvatar, setVillainAvatar] = useState(getRandomAvatar());

    // UI state
    const [showResult, setShowResult] = useState(false);
    const [lastResult, setLastResult] = useState<any>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [damageShake, setDamageShake] = useState(false);

    // Timer
    const [timeRemaining, setTimeRemaining] = useState(TIMER_SECONDS);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // ========================================================================
    // FETCH NEXT HAND
    // ========================================================================

    const fetchNextHand = useCallback(async () => {
        setLoading(true);
        setShowResult(false);
        setTimeRemaining(TIMER_SECONDS);

        try {
            const response = await fetch('/api/god-mode/fetch-hand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    currentLevel: 1,
                }),
            });

            const data = await response.json();

            if (data.error) {
                console.error('Error fetching hand:', data.error);
                // Use fallback data
                setCurrentHand(getFallbackHand());
            } else {
                // Transform API response
                const hand: HandData = {
                    hero_hand: data.hand?.hero_hand || 'AhKs',
                    board: data.hand?.board || '',
                    pot_size: data.hand?.pot || 6,
                    hero_position: data.hand?.hero_position || 'BB',
                    villain_position: data.hand?.villain_position || 'SB',
                    hero_stack: data.hand?.hero_stack || 100,
                    villain_stack: data.hand?.villain_stack || 100,
                    available_actions: data.hand?.available_actions || ['fold', 'check', 'bet_50', 'bet_100'],
                    question_prompt: data.hand?.question_prompt || 'What is your action?',
                    solver_node: data.hand?.solver_node || {},
                    fileId: data.hand?.fileId,
                    variantHash: data.hand?.variantHash,
                };
                setCurrentHand(hand);
            }

            setVillainAvatar(getRandomAvatar());
            setHandNumber(prev => prev + 1);
        } catch (error) {
            console.error('Failed to fetch hand:', error);
            setCurrentHand(getFallbackHand());
            setHandNumber(prev => prev + 1);
        }

        setLoading(false);
    }, [userId, gameId]);

    // ========================================================================
    // SUBMIT ACTION
    // ========================================================================

    const submitAction = useCallback(async (action: string) => {
        if (isSubmitting || !currentHand) return;

        setIsSubmitting(true);
        if (timerRef.current) clearInterval(timerRef.current);

        try {
            const response = await fetch('/api/god-mode/submit-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    action,
                    handData: currentHand,
                    potSize: currentHand.pot_size,
                }),
            });

            const result = await response.json();

            setLastResult(result);
            setShowResult(true);

            // Update stats
            if (result.isCorrect || result.isIndifferent) {
                setCorrectCount(prev => prev + 1);
                setXp(prev => prev + 10);
                if (result.isCorrect) setDiamonds(prev => prev + 1);
            } else {
                // Apply damage
                const damage = result.chipPenalty || 10;
                setHealth(prev => Math.max(0, prev - damage));
                setDamageShake(true);
                setTimeout(() => setDamageShake(false), 500);
            }

            // Auto-advance after showing result
            setTimeout(() => {
                if (handNumber >= HANDS_PER_SESSION || health <= 0) {
                    completeSession();
                } else {
                    fetchNextHand();
                }
            }, 2500);

        } catch (error) {
            console.error('Failed to submit action:', error);
            setShowResult(false);
        }

        setIsSubmitting(false);
    }, [currentHand, userId, gameId, handNumber, health, fetchNextHand]);

    // ========================================================================
    // SESSION COMPLETE
    // ========================================================================

    const completeSession = useCallback(() => {
        const accuracy = handNumber > 0 ? (correctCount / handNumber) * 100 : 0;
        const passed = accuracy >= 85;

        onSessionComplete?.({
            handsPlayed: handNumber,
            correctAnswers: correctCount,
            accuracy,
            passed,
            finalHealth: health,
            xpEarned: xp,
        });
    }, [handNumber, correctCount, health, xp, onSessionComplete]);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Initial fetch
    useEffect(() => {
        fetchNextHand();
    }, []);

    // Timer countdown
    useEffect(() => {
        if (loading || showResult) return;

        timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1) {
                    // Time's up - auto-submit fold
                    submitAction('fold');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [loading, showResult, submitAction]);

    // ========================================================================
    // RENDER
    // ========================================================================

    const heroCards = parseHand(currentHand?.hero_hand || '');
    const boardCards = parseBoard(currentHand?.board || '');
    const healthPercent = (health / MAX_HEALTH) * 100;
    const healthColor = healthPercent > 60 ? '#00ff88' : healthPercent > 30 ? '#ffaa00' : '#ff4444';
    const timerColor = timeRemaining > 20 ? '#00ff88' : timeRemaining > 10 ? '#ffaa00' : '#ff4444';

    // Format actions for display
    const formatAction = (action: string): string => {
        if (action === 'fold') return 'FOLD';
        if (action === 'check') return 'CHECK';
        if (action === 'call') return 'CALL';
        if (action.startsWith('bet_')) return `BET ${action.split('_')[1]}%`;
        if (action.startsWith('raise_')) return `RAISE ${action.split('_')[1]}%`;
        if (action === 'allin') return 'ALL-IN';
        return action.toUpperCase();
    };

    const getActionColor = (action: string): string => {
        if (action === 'fold') return '#dc2626';
        if (action === 'check' || action === 'call') return '#16a34a';
        return '#2563eb';
    };

    return (
        <div style={styles.container}>
            {/* ============ TOP HUD ============ */}
            <div style={styles.topHud}>
                {/* Left: Health */}
                <div style={{
                    ...styles.healthContainer,
                    animation: damageShake ? 'shake 0.3s ease-in-out' : 'none',
                }}>
                    <span style={styles.healthIcon}>❤️</span>
                    <div style={styles.healthBarOuter}>
                        <div style={{
                            ...styles.healthBarInner,
                            width: `${healthPercent}%`,
                            backgroundColor: healthColor,
                        }} />
                    </div>
                    <span style={styles.healthText}>{health}</span>
                </div>

                {/* Center: Game Info */}
                <div style={styles.centerInfo}>
                    <h1 style={styles.gameTitle}>{gameName}</h1>
                    <div style={styles.progressBadge}>
                        Hand {handNumber}/{HANDS_PER_SESSION} • {correctCount} Correct
                    </div>
                </div>

                {/* Right: Stats */}
                <div style={styles.statsRow}>
                    <div style={styles.statBadge}>
                        <span>⭐</span>
                        <span>{xp}</span>
                    </div>
                    <div style={styles.statBadge}>
                        <span>💎</span>
                        <span>{diamonds}</span>
                    </div>
                    <button onClick={onExit} style={styles.exitButton}>✕</button>
                </div>
            </div>

            {/* ============ QUESTION PROMPT ============ */}
            <div style={styles.questionContainer}>
                <p style={styles.questionText}>
                    {currentHand?.question_prompt || 'What is your action?'}
                </p>
            </div>

            {/* ============ POKER TABLE ============ */}
            <div style={styles.tableContainer}>
                {/* Outer gold rail */}
                <div style={styles.tableOuter}>
                    {/* Inner felt */}
                    <div style={styles.tableFelt}>
                        {/* Villain area (top) */}
                        <div style={styles.villainArea}>
                            <img
                                src={`/avatars/table/${villainAvatar}.png`}
                                alt="Villain"
                                style={styles.villainAvatar}
                            />
                            <div style={styles.playerBadge}>
                                <span style={styles.playerName}>{currentHand?.villain_position || 'SB'}</span>
                                <span style={styles.playerStack}>{currentHand?.villain_stack || 100} BB</span>
                            </div>
                        </div>

                        {/* Board cards (center) */}
                        <div style={styles.boardArea}>
                            {boardCards.length > 0 ? (
                                boardCards.map((card, i) => (
                                    <img
                                        key={i}
                                        src={getCardImagePath(card)}
                                        alt={card}
                                        style={styles.boardCard}
                                    />
                                ))
                            ) : (
                                <div style={styles.preFlopLabel}>PREFLOP</div>
                            )}
                        </div>

                        {/* Pot */}
                        <div style={styles.potContainer}>
                            <span style={styles.potLabel}>POT</span>
                            <span style={styles.potValue}>{currentHand?.pot_size || 0} BB</span>
                        </div>

                        {/* Hero area (bottom) */}
                        <div style={styles.heroArea}>
                            <div style={styles.heroCards}>
                                {heroCards.map((card, i) => (
                                    <img
                                        key={i}
                                        src={getCardImagePath(card)}
                                        alt={card}
                                        style={styles.heroCard}
                                    />
                                ))}
                            </div>
                            <div style={styles.playerBadge}>
                                <span style={styles.playerName}>{currentHand?.hero_position || 'BB'}</span>
                                <span style={styles.playerStack}>{currentHand?.hero_stack || 100} BB</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timer */}
                <div style={{
                    ...styles.timer,
                    borderColor: timerColor,
                    boxShadow: `0 0 20px ${timerColor}66`,
                }}>
                    <span style={{ ...styles.timerText, color: timerColor }}>
                        {timeRemaining}
                    </span>
                </div>
            </div>

            {/* ============ RESULT OVERLAY ============ */}
            {showResult && lastResult && (
                <div style={{
                    ...styles.resultOverlay,
                    backgroundColor: lastResult.isCorrect || lastResult.isIndifferent
                        ? 'rgba(34, 197, 94, 0.95)'
                        : 'rgba(239, 68, 68, 0.95)',
                }}>
                    <div style={styles.resultIcon}>
                        {lastResult.isCorrect || lastResult.isIndifferent ? '✅' : '❌'}
                    </div>
                    <h2 style={styles.resultTitle}>
                        {lastResult.isCorrect ? 'CORRECT!' : lastResult.isIndifferent ? 'ACCEPTABLE' : 'MISTAKE'}
                    </h2>
                    <p style={styles.resultFeedback}>{lastResult.feedback}</p>
                    {!lastResult.isCorrect && !lastResult.isIndifferent && (
                        <div style={styles.damageText}>
                            -{lastResult.chipPenalty || 0} HP
                        </div>
                    )}
                </div>
            )}

            {/* ============ ACTION BUTTONS ============ */}
            {!showResult && !loading && (
                <div style={styles.actionContainer}>
                    {(currentHand?.available_actions || ['fold', 'check', 'bet_50', 'bet_100']).map((action) => (
                        <button
                            key={action}
                            onClick={() => submitAction(action)}
                            disabled={isSubmitting}
                            style={{
                                ...styles.actionButton,
                                backgroundColor: getActionColor(action),
                                opacity: isSubmitting ? 0.5 : 1,
                            }}
                        >
                            {formatAction(action)}
                        </button>
                    ))}
                </div>
            )}

            {/* Loading state */}
            {loading && (
                <div style={styles.loadingOverlay}>
                    <div style={styles.spinner}>🎰</div>
                    <p style={styles.loadingText}>Dealing hand...</p>
                </div>
            )}

            {/* CSS Animations */}
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

// ============================================================================
// FALLBACK DATA
// ============================================================================

function getFallbackHand(): HandData {
    const hands = ['AhKs', 'QdJd', 'TsTs', '9h8h', 'AcQc'];
    const boards = ['', 'QsJh7c', 'Ac5d3h', 'KdTd4c'];

    return {
        hero_hand: hands[Math.floor(Math.random() * hands.length)],
        board: boards[Math.floor(Math.random() * boards.length)],
        pot_size: 6 + Math.floor(Math.random() * 20),
        hero_position: 'BB',
        villain_position: 'SB',
        hero_stack: 100,
        villain_stack: 100,
        available_actions: ['fold', 'check', 'bet_50', 'bet_100'],
        question_prompt: 'You are in the BB facing a raise. What is your action?',
        solver_node: {
            actions: {
                fold: { frequency: 0.2, ev: 0 },
                call: { frequency: 0.5, ev: 8 },
                raise: { frequency: 0.3, ev: 10 },
            }
        },
    };
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: '100vh',
        background: '#080810',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
    },

    // Top HUD
    topHud: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'rgba(0, 0, 0, 0.6)',
        borderBottom: '1px solid rgba(212, 160, 0, 0.3)',
    },
    healthContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    healthIcon: {
        fontSize: 18,
    },
    healthBarOuter: {
        width: 120,
        height: 14,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 7,
        overflow: 'hidden',
    },
    healthBarInner: {
        height: '100%',
        borderRadius: 7,
        transition: 'width 0.3s ease, background-color 0.3s ease',
    },
    healthText: {
        fontSize: 14,
        fontWeight: 700,
        minWidth: 30,
    },
    centerInfo: {
        textAlign: 'center',
    },
    gameTitle: {
        fontSize: 18,
        fontWeight: 700,
        margin: 0,
        color: '#d4a000',
    },
    progressBadge: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: 2,
    },
    statsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    statBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
    },
    exitButton: {
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'rgba(220, 38, 38, 0.2)',
        border: '1px solid rgba(220, 38, 38, 0.4)',
        color: '#dc2626',
        fontSize: 14,
        cursor: 'pointer',
    },

    // Question
    questionContainer: {
        padding: '16px 20px',
        textAlign: 'center',
    },
    questionText: {
        fontSize: 16,
        fontWeight: 500,
        color: 'rgba(255, 255, 255, 0.9)',
        margin: 0,
    },

    // Table
    tableContainer: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '0 20px',
    },
    tableOuter: {
        width: '100%',
        maxWidth: 500,
        aspectRatio: '16/9',
        background: 'linear-gradient(180deg, #d4a000 0%, #8b6914 50%, #6b4f0a 100%)',
        borderRadius: 9999,
        padding: 8,
        boxShadow: 'inset 0 2px 3px rgba(255,220,100,0.4), 0 8px 32px rgba(0, 0, 0, 0.5)',
    },
    tableFelt: {
        width: '100%',
        height: '100%',
        background: `radial-gradient(
            ellipse at 50% 50%,
            #080808 0%,
            #0c0c0c 30%,
            #151515 60%,
            #252525 80%,
            #1a1a1a 100%
        )`,
        borderRadius: 9999,
        boxShadow: 'inset 0 0 80px 30px rgba(255,255,255,0.06)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 30px',
    },

    // Villain
    villainArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
    },
    villainAvatar: {
        width: 50,
        height: 50,
        borderRadius: '50%',
        border: '2px solid #d4a000',
        objectFit: 'cover',
    },

    // Player badge
    playerBadge: {
        background: 'linear-gradient(135deg, #d4a000, #8b6914)',
        padding: '4px 12px',
        borderRadius: 8,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
    },
    playerName: {
        fontSize: 11,
        fontWeight: 700,
        color: '#000',
    },
    playerStack: {
        fontSize: 12,
        fontWeight: 800,
        color: '#000',
    },

    // Board
    boardArea: {
        display: 'flex',
        gap: 6,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 60,
    },
    boardCard: {
        width: 42,
        height: 58,
        borderRadius: 4,
        objectFit: 'contain',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
    },
    preFlopLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.3)',
        fontWeight: 600,
        letterSpacing: 2,
    },

    // Pot
    potContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
    },
    potLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
        letterSpacing: 1,
    },
    potValue: {
        fontSize: 18,
        fontWeight: 800,
        color: '#d4a000',
    },

    // Hero
    heroArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
    },
    heroCards: {
        display: 'flex',
        gap: 4,
    },
    heroCard: {
        width: 48,
        height: 66,
        borderRadius: 4,
        objectFit: 'contain',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
    },

    // Timer
    timer: {
        position: 'absolute',
        right: 30,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: '#080810',
        border: '3px solid',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerText: {
        fontSize: 24,
        fontWeight: 800,
    },

    // Result overlay
    resultOverlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    resultIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    resultTitle: {
        fontSize: 28,
        fontWeight: 800,
        margin: 0,
    },
    resultFeedback: {
        fontSize: 16,
        marginTop: 12,
        textAlign: 'center',
        maxWidth: 300,
        opacity: 0.9,
    },
    damageText: {
        fontSize: 20,
        fontWeight: 700,
        marginTop: 12,
        color: '#fff',
    },

    // Actions
    actionContainer: {
        display: 'flex',
        gap: 10,
        padding: '20px',
        justifyContent: 'center',
        flexWrap: 'wrap',
    },
    actionButton: {
        padding: '14px 24px',
        fontSize: 14,
        fontWeight: 700,
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
        minWidth: 100,
        transition: 'transform 0.1s, opacity 0.2s',
    },

    // Loading
    loadingOverlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(8, 8, 16, 0.9)',
        zIndex: 50,
    },
    spinner: {
        fontSize: 48,
        animation: 'spin 1s linear infinite',
    },
    loadingText: {
        marginTop: 16,
        color: 'rgba(255, 255, 255, 0.6)',
    },
};

export default GameSession;
