/* ═══════════════════════════════════════════════════════════════════════════
   🧠 MEMORY MATRIX 2.0 — THE GTO WIZARD KILLER
   Full Video Game Experience with Pressure, Combos, and Diamond Economy
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
    SoundEngine,
    EffectsEngine,
    TimerEngine,
    ComboEngine,
    ProgressionEngine,
    LEVELS,
    MASTERY_THRESHOLD,
    GAME_COST,
} from '../../src/games/GameEngine';
import {
    ALL_SCENARIOS,
    getScenariosByLevel,
    getRandomScenario,
    getLevelConfig,
    RANKS,
    getHandName,
    MIXED_SCENARIOS,
} from '../../src/games/ScenarioDatabase';
import { supabase } from '../../src/lib/supabase';

// God-Mode Stack
import { useMemoryStore } from '../../src/stores/memoryStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// 💎 DIAMOND ENGINE — Local storage with VIP check
// ═══════════════════════════════════════════════════════════════════════════
const DiamondEngine = {
    _balance: null,
    _isVIP: false,

    init() {
        if (typeof window === 'undefined') return;
        this._balance = parseInt(localStorage.getItem('diamond_balance') || '100', 10);
        this._isVIP = localStorage.getItem('vip_status') === 'true';
    },

    getBalance() {
        this.init();
        return this._balance;
    },

    isVIP() {
        this.init();
        return this._isVIP;
    },

    deduct(amount) {
        this.init();
        if (this._isVIP) return { success: true, charged: 0 };
        if (this._balance < amount) return { success: false, balance: this._balance };
        this._balance -= amount;
        localStorage.setItem('diamond_balance', String(this._balance));
        return { success: true, charged: amount, balance: this._balance };
    },

    award(amount) {
        this.init();
        this._balance += amount;
        localStorage.setItem('diamond_balance', String(this._balance));
        SoundEngine.play('diamond');
        return this._balance;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 ACTION COLORS
// ═══════════════════════════════════════════════════════════════════════════
const ACTION_COLORS = {
    fold: { bg: 'rgba(100, 100, 100, 0.3)', border: '#555', label: 'FOLD', key: '1' },
    call: { bg: 'rgba(16, 185, 129, 0.5)', border: '#10B981', label: 'CALL', key: '2' },
    raise: { bg: 'rgba(239, 68, 68, 0.5)', border: '#EF4444', label: 'RAISE', key: '3' },
    raise_small: { bg: 'rgba(249, 115, 22, 0.5)', border: '#F97316', label: 'RAISE SM', key: '4' },
    raise_big: { bg: 'rgba(168, 85, 247, 0.5)', border: '#A855F7', label: 'RAISE BIG', key: '5' },
    all_in: { bg: 'rgba(220, 38, 127, 0.6)', border: '#DC2680', label: 'ALL IN', key: '6' },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🧮 GRADING ENGINE
// ═══════════════════════════════════════════════════════════════════════════
function gradeUserGrid(userGrid, solution) {
    let correctHands = 0;
    const missedHands = [];
    const extraHands = [];
    const wrongActionHands = [];

    for (const [hand, correctAction] of Object.entries(solution)) {
        const userAction = userGrid[hand];
        if (!userAction || userAction === 'fold') {
            missedHands.push(hand);
        } else if (userAction !== correctAction) {
            wrongActionHands.push(hand);
        } else {
            correctHands++;
        }
    }

    for (const [hand, userAction] of Object.entries(userGrid)) {
        if (!solution[hand] && userAction && userAction !== 'fold') {
            extraHands.push(hand);
        }
    }

    const totalSolutionHands = Object.keys(solution).length;
    const mistakes = missedHands.length + extraHands.length + wrongActionHands.length;
    const score = totalSolutionHands > 0
        ? Math.round(((totalSolutionHands - missedHands.length - wrongActionHands.length) / totalSolutionHands) * 100)
        : 0;

    return { score: Math.max(0, score), correctHands, missedHands, extraHands, wrongActionHands, mistakes };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚡ SPEED DRILL GAME COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function SpeedDrillGame({ level = 1, onExit, onScoreUpdate, DiamondEngine }) {
    const [gameState, setGameState] = useState('ready'); // ready | playing | revealed | gameover
    const [currentHand, setCurrentHand] = useState(null);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [lives, setLives] = useState(3);
    const [timeRemaining, setTimeRemaining] = useState(3000);
    const [currentTimeLimit, setCurrentTimeLimit] = useState(3000);
    const [userAnswer, setUserAnswer] = useState(null);
    const [handsPlayed, setHandsPlayed] = useState(0);
    const timerRef = useRef(null);

    const INITIAL_TIME = 3000;
    const MIN_TIME = 1000;
    const TIME_DECREASE = 100;

    // Get random hand from a scenario
    const getRandomHand = useCallback(() => {
        const scenario = getRandomScenario(level);
        if (!scenario) return null;
        const hands = Object.entries(scenario.solution);
        if (hands.length === 0) return null;
        const [hand, correctAction] = hands[Math.floor(Math.random() * hands.length)];
        return { hand, correctAction, scenario };
    }, [level]);

    // Start game
    const startGame = useCallback(() => {
        const hand = getRandomHand();
        if (!hand) return;
        setCurrentHand(hand);
        setGameState('playing');
        setTimeRemaining(INITIAL_TIME);
        setCurrentTimeLimit(INITIAL_TIME);
        setScore(0);
        setStreak(0);
        setMaxStreak(0);
        setLives(3);
        setUserAnswer(null);
        setHandsPlayed(0);
        SoundEngine.play('levelUp');
    }, [getRandomHand]);

    // Next hand
    const nextHand = useCallback(() => {
        const hand = getRandomHand();
        if (!hand) return;
        const newTimeLimit = Math.max(MIN_TIME, INITIAL_TIME - (streak * TIME_DECREASE));
        setCurrentHand(hand);
        setGameState('playing');
        setTimeRemaining(newTimeLimit);
        setCurrentTimeLimit(newTimeLimit);
        setUserAnswer(null);
    }, [getRandomHand, streak]);

    // Handle answer
    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentHand) return;
        clearInterval(timerRef.current);
        setUserAnswer(action);
        setHandsPlayed(prev => prev + 1);

        const isCorrect = action === currentHand.correctAction;

        if (isCorrect) {
            const pointsEarned = 100 + (streak * 10);
            setScore(prev => prev + pointsEarned);
            setStreak(prev => prev + 1);
            setMaxStreak(prev => Math.max(prev, streak + 1));
            SoundEngine.play('correct');
        } else {
            setStreak(0);
            setLives(prev => prev - 1);
            SoundEngine.play('wrong');
        }

        setGameState('revealed');

        setTimeout(() => {
            if (lives - (isCorrect ? 0 : 1) <= 0) {
                setGameState('gameover');
                SoundEngine.play('gameOver');
                // Award diamonds based on score
                const diamondReward = Math.floor(score / 100);
                if (diamondReward > 0 && DiamondEngine) {
                    const newBalance = DiamondEngine.award(diamondReward);
                    onScoreUpdate?.(newBalance);
                }
            } else {
                nextHand();
            }
        }, 800);
    }, [gameState, currentHand, streak, lives, score, nextHand, DiamondEngine, onScoreUpdate]);

    // Timer
    useEffect(() => {
        if (gameState === 'playing') {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 50) {
                        clearInterval(timerRef.current);
                        handleAnswer('timeout');
                        return 0;
                    }
                    return prev - 50;
                });
            }, 50);
        }
        return () => clearInterval(timerRef.current);
    }, [gameState, handleAnswer]);

    // Keyboard
    useEffect(() => {
        const handleKey = (e) => {
            if (gameState === 'ready' && (e.key === ' ' || e.key === 'Enter')) {
                startGame();
            } else if (gameState === 'gameover' && (e.key === ' ' || e.key === 'Enter')) {
                onExit?.();
            } else if (gameState === 'playing') {
                if (e.key === '1') handleAnswer('fold');
                else if (e.key === '2') handleAnswer('call');
                else if (e.key === '3') handleAnswer('raise');
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [gameState, handleAnswer, startGame, onExit]);

    const timerPercent = (timeRemaining / currentTimeLimit) * 100;
    const timerColor = timerPercent > 50 ? '#00ff88' : timerPercent > 25 ? '#ffaa00' : '#ff4444';

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
                    ← Exit
                </button>
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>
                    {score.toLocaleString()}
                </div>
                {streak > 0 && (
                    <div style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #ff6b00, #ff0066)', borderRadius: 20, fontWeight: 700, color: '#fff' }}>
                        🔥 {streak}x
                    </div>
                )}
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>⚡</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#FFD700', marginBottom: 16 }}>SPEED DRILL</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>
                        Flash a hand → Pick the action → Build streaks!<br />
                        Time gets shorter the better you do.<br />
                        3 lives. Don't lose them!
                    </p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000', border: 'none', borderRadius: 50, cursor: 'pointer' }}>
                        START [SPACE]
                    </button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentHand && (
                <>
                    {/* Lives */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                        {[0, 1, 2].map(i => (
                            <span key={i} style={{ fontSize: 24, opacity: i < lives ? 1 : 0.3 }}>❤️</span>
                        ))}
                    </div>

                    {/* Timer bar */}
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${timerPercent}%`, background: timerColor, transition: 'width 0.05s linear' }} />
                    </div>

                    {/* Scenario */}
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
                        {currentHand.scenario.title}
                    </div>

                    {/* Hand card */}
                    <div style={{
                        width: 180,
                        height: 120,
                        background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
                        border: `3px solid ${gameState === 'revealed' ? (userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444') : '#00D4FF'}`,
                        borderRadius: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ fontSize: 42, fontFamily: 'Orbitron', fontWeight: 900, color: '#fff' }}>{currentHand.hand}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            {currentHand.hand.length === 2 ? 'Pair' : currentHand.hand.endsWith('s') ? 'Suited' : 'Offsuit'}
                        </div>
                    </div>

                    {/* Feedback */}
                    {gameState === 'revealed' && (
                        <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444', marginBottom: 16 }}>
                            {userAnswer === currentHand.correctAction
                                ? `✓ Correct! +${100 + (streak - 1) * 10}`
                                : `✗ Wrong! Should ${currentHand.correctAction.toUpperCase()}`}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <button onClick={() => handleAnswer('fold')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(100,100,100,0.3)', border: '2px solid #666', borderRadius: 12, color: '#fff', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>1</span>
                            FOLD
                        </button>
                        <button onClick={() => handleAnswer('call')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(16,185,129,0.3)', border: '2px solid #10B981', borderRadius: 12, color: '#10B981', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>2</span>
                            CALL
                        </button>
                        <button onClick={() => handleAnswer('raise')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(239,68,68,0.3)', border: '2px solid #EF4444', borderRadius: 12, color: '#EF4444', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>3</span>
                            RAISE
                        </button>
                    </div>
                </>
            )}

            {gameState === 'gameover' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>💀</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#ff4444', marginBottom: 30 }}>GAME OVER</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Final Score</span>
                            <span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Best Streak</span>
                            <span>🔥 {maxStreak}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 18, color: '#fff' }}>
                            <span>Hands Played</span>
                            <span>{handsPlayed}</span>
                        </div>
                        {score >= 100 && (
                            <div style={{ marginTop: 16, padding: 12, background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.15))', borderRadius: 12, color: '#00ff88', fontWeight: 700 }}>
                                💎 +{Math.floor(score / 100)} Diamonds earned!
                            </div>
                        )}
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>
                        BACK TO MENU [SPACE]
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 PRESSURE COOKER GAME COMPONENT
// Bomb defusal style - answer 10 spots before time runs out!
// ═══════════════════════════════════════════════════════════════════════════
function PressureCookerGame({ level = 1, onExit, onScoreUpdate, DiamondEngine }) {
    const [gameState, setGameState] = useState('ready'); // ready | playing | revealed | success | failed
    const [currentHand, setCurrentHand] = useState(null);
    const [score, setScore] = useState(0);
    const [handsCompleted, setHandsCompleted] = useState(0);
    const [handsRequired] = useState(10);
    const [timeRemaining, setTimeRemaining] = useState(30000); // 30 seconds
    const [userAnswer, setUserAnswer] = useState(null);
    const [streak, setStreak] = useState(0);
    const timerRef = useRef(null);

    const TIME_BONUS = 3000; // +3s for correct
    const TIME_PENALTY = 5000; // -5s for wrong
    const INITIAL_TIME = 30000;

    const getRandomHand = useCallback(() => {
        const scenario = getRandomScenario(level);
        if (!scenario) return null;
        const hands = Object.entries(scenario.solution);
        if (hands.length === 0) return null;
        const [hand, correctAction] = hands[Math.floor(Math.random() * hands.length)];
        return { hand, correctAction, scenario };
    }, [level]);

    const startGame = useCallback(() => {
        const hand = getRandomHand();
        if (!hand) return;
        setCurrentHand(hand);
        setGameState('playing');
        setTimeRemaining(INITIAL_TIME);
        setScore(0);
        setHandsCompleted(0);
        setStreak(0);
        setUserAnswer(null);
        SoundEngine.play('levelUp');
    }, [getRandomHand]);

    const nextHand = useCallback(() => {
        const hand = getRandomHand();
        if (!hand) return;
        setCurrentHand(hand);
        setGameState('playing');
        setUserAnswer(null);
    }, [getRandomHand]);

    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentHand) return;
        setUserAnswer(action);

        const isCorrect = action === currentHand.correctAction;
        const newHandsCompleted = handsCompleted + 1;

        if (isCorrect) {
            setScore(prev => prev + 100 + (streak * 20));
            setStreak(prev => prev + 1);
            setTimeRemaining(prev => Math.min(prev + TIME_BONUS, 60000)); // Cap at 60s
            SoundEngine.play('correct');
        } else {
            setStreak(0);
            setTimeRemaining(prev => Math.max(prev - TIME_PENALTY, 0));
            SoundEngine.play('wrong');
        }

        setHandsCompleted(newHandsCompleted);
        setGameState('revealed');

        setTimeout(() => {
            if (newHandsCompleted >= handsRequired) {
                // Victory!
                setGameState('success');
                SoundEngine.play('levelUp');
                const diamondReward = Math.floor(score / 50) + 10;
                if (DiamondEngine) {
                    const newBalance = DiamondEngine.award(diamondReward);
                    onScoreUpdate?.(newBalance);
                }
            } else if (timeRemaining <= 0) {
                // Already failed (handled by timer)
            } else {
                nextHand();
            }
        }, 600);
    }, [gameState, currentHand, streak, handsCompleted, handsRequired, timeRemaining, score, nextHand, DiamondEngine, onScoreUpdate]);

    // Timer countdown
    useEffect(() => {
        if (gameState === 'playing' || gameState === 'revealed') {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 100) {
                        clearInterval(timerRef.current);
                        setGameState('failed');
                        SoundEngine.play('gameOver');
                        return 0;
                    }
                    return prev - 100;
                });
            }, 100);
        }
        return () => clearInterval(timerRef.current);
    }, [gameState]);

    // Keyboard
    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'success' || gameState === 'failed') && (e.key === ' ' || e.key === 'Enter')) {
                if (gameState === 'ready') startGame();
                else onExit?.();
            } else if (gameState === 'playing') {
                if (e.key === '1') handleAnswer('fold');
                else if (e.key === '2') handleAnswer('call');
                else if (e.key === '3') handleAnswer('raise');
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [gameState, handleAnswer, startGame, onExit]);

    const timerSec = (timeRemaining / 1000).toFixed(1);
    const timerPercent = (timeRemaining / 60000) * 100;
    const timerColor = timeRemaining > 15000 ? '#00ff88' : timeRemaining > 7000 ? '#ffaa00' : '#ff4444';
    const isLowTime = timeRemaining < 7000;

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
                    ← Exit
                </button>
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>
                    {score.toLocaleString()}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                    {handsCompleted}/{handsRequired}
                </div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>🔥</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#ff4444', marginBottom: 16 }}>PRESSURE COOKER</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>
                        Answer 10 hands before time runs out!<br />
                        ✓ Correct = +3 seconds<br />
                        ✗ Wrong = -5 seconds<br />
                        <span style={{ color: '#ff4444' }}>Clock is ticking... 💣</span>
                    </p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #ff4444, #ff0066)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>
                        START [SPACE]
                    </button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentHand && (
                <>
                    {/* Big Timer */}
                    <div style={{
                        fontSize: 72,
                        fontFamily: 'Orbitron',
                        fontWeight: 900,
                        color: timerColor,
                        textShadow: isLowTime ? '0 0 30px rgba(255,68,68,0.8)' : 'none',
                        animation: isLowTime ? 'pulse 0.5s infinite' : 'none',
                        marginBottom: 20,
                    }}>
                        {timerSec}s
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(handsCompleted / handsRequired) * 100}%`, background: '#00ff88', transition: 'width 0.3s ease' }} />
                    </div>

                    {/* Scenario */}
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
                        {currentHand.scenario.title}
                    </div>

                    {/* Hand card */}
                    <div style={{
                        width: 180,
                        height: 120,
                        background: isLowTime ? 'linear-gradient(145deg, #3a1a1a, #2e1616)' : 'linear-gradient(145deg, #1a1a2e, #16213e)',
                        border: `3px solid ${gameState === 'revealed' ? (userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444') : timerColor}`,
                        borderRadius: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 20px',
                        boxShadow: isLowTime ? '0 0 40px rgba(255,68,68,0.4)' : '0 10px 40px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ fontSize: 42, fontFamily: 'Orbitron', fontWeight: 900, color: '#fff' }}>{currentHand.hand}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            {currentHand.hand.length === 2 ? 'Pair' : currentHand.hand.endsWith('s') ? 'Suited' : 'Offsuit'}
                        </div>
                    </div>

                    {/* Feedback */}
                    {gameState === 'revealed' && (
                        <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444', marginBottom: 16 }}>
                            {userAnswer === currentHand.correctAction
                                ? `✓ +${100 + (streak - 1) * 20} (+3s)`
                                : `✗ ${currentHand.correctAction.toUpperCase()} (-5s)`}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <button onClick={() => handleAnswer('fold')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(100,100,100,0.3)', border: '2px solid #666', borderRadius: 12, color: '#fff', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>1</span>
                            FOLD
                        </button>
                        <button onClick={() => handleAnswer('call')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(16,185,129,0.3)', border: '2px solid #10B981', borderRadius: 12, color: '#10B981', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>2</span>
                            CALL
                        </button>
                        <button onClick={() => handleAnswer('raise')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(239,68,68,0.3)', border: '2px solid #EF4444', borderRadius: 12, color: '#EF4444', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>3</span>
                            RAISE
                        </button>
                    </div>
                </>
            )}

            {gameState === 'success' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>🏆</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#00ff88', marginBottom: 30 }}>DEFUSED!</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Final Score</span>
                            <span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Time Remaining</span>
                            <span style={{ color: '#00ff88' }}>{timerSec}s</span>
                        </div>
                        <div style={{ marginTop: 16, padding: 12, background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.15))', borderRadius: 12, color: '#00ff88', fontWeight: 700 }}>
                            💎 +{Math.floor(score / 50) + 10} Diamonds earned!
                        </div>
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>
                        BACK TO MENU [SPACE]
                    </button>
                </div>
            )}

            {gameState === 'failed' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>💥</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#ff4444', marginBottom: 30 }}>BOOM!</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Hands Completed</span>
                            <span>{handsCompleted}/{handsRequired}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 18, color: '#fff' }}>
                            <span>Score</span>
                            <span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span>
                        </div>
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>
                        TRY AGAIN [SPACE]
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧩 PATTERN RECOGNITION GAME COMPONENT
// Identify the pattern - what action does this range shape represent?
// ═══════════════════════════════════════════════════════════════════════════
function PatternRecognitionGame({ level = 1, onExit, onScoreUpdate, DiamondEngine }) {
    const [gameState, setGameState] = useState('ready'); // ready | playing | revealed | gameover
    const [currentPattern, setCurrentPattern] = useState(null);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [round, setRound] = useState(0);
    const [maxRounds] = useState(8);
    const [userAnswer, setUserAnswer] = useState(null);
    const [correctAnswers, setCorrectAnswers] = useState(0);

    // Generate a partial range pattern from a scenario
    const generatePattern = useCallback(() => {
        const scenario = getRandomScenario(level);
        if (!scenario) return null;

        // Get hands from solution
        const solution = scenario.solution || {};
        const hands = Object.keys(solution);

        // Show 70% of the hands (randomly selected)
        const visibleCount = Math.floor(hands.length * 0.7);
        const shuffled = hands.sort(() => Math.random() - 0.5);
        const visibleHands = shuffled.slice(0, visibleCount);

        // Determine the dominant action
        const actionCounts = { raise: 0, call: 0, fold: 0 };
        Object.values(solution).forEach(action => {
            if (actionCounts[action] !== undefined) actionCounts[action]++;
        });
        const dominantAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0][0];

        return {
            scenario,
            visibleHands,
            allHands: hands,
            solution,
            correctAnswer: dominantAction,
            actionCounts,
        };
    }, [level]);

    const startGame = useCallback(() => {
        const pattern = generatePattern();
        if (!pattern) return;
        setCurrentPattern(pattern);
        setGameState('playing');
        setScore(0);
        setStreak(0);
        setRound(1);
        setCorrectAnswers(0);
        setUserAnswer(null);
        SoundEngine.play('levelUp');
    }, [generatePattern]);

    const nextRound = useCallback(() => {
        if (round >= maxRounds) {
            setGameState('gameover');
            const diamondReward = correctAnswers * 2 + Math.floor(score / 100);
            if (DiamondEngine && diamondReward > 0) {
                const newBalance = DiamondEngine.award(diamondReward);
                onScoreUpdate?.(newBalance);
            }
            return;
        }
        const pattern = generatePattern();
        if (!pattern) return;
        setCurrentPattern(pattern);
        setGameState('playing');
        setRound(prev => prev + 1);
        setUserAnswer(null);
    }, [round, maxRounds, generatePattern, correctAnswers, score, DiamondEngine, onScoreUpdate]);

    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentPattern) return;
        setUserAnswer(action);

        const isCorrect = action === currentPattern.correctAnswer;

        if (isCorrect) {
            setScore(prev => prev + 100 + (streak * 25));
            setStreak(prev => prev + 1);
            setCorrectAnswers(prev => prev + 1);
            SoundEngine.play('correct');
        } else {
            setStreak(0);
            SoundEngine.play('wrong');
        }

        setGameState('revealed');

        setTimeout(() => {
            nextRound();
        }, 1200);
    }, [gameState, currentPattern, streak, nextRound]);

    // Keyboard
    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'gameover') && (e.key === ' ' || e.key === 'Enter')) {
                if (gameState === 'ready') startGame();
                else onExit?.();
            } else if (gameState === 'playing') {
                if (e.key === '1') handleAnswer('fold');
                else if (e.key === '2') handleAnswer('call');
                else if (e.key === '3') handleAnswer('raise');
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [gameState, handleAnswer, startGame, onExit]);

    // Build mini grid
    const renderMiniGrid = () => {
        if (!currentPattern) return null;
        const { visibleHands, solution } = currentPattern;

        return (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(13, 1fr)',
                gap: 2,
                width: 350,
                margin: '0 auto 24px',
                background: 'rgba(0,0,0,0.4)',
                padding: 8,
                borderRadius: 12,
            }}>
                {RANKS.map((r1, i) =>
                    RANKS.map((r2, j) => {
                        const hand = i < j ? `${r1}${r2}s` : i > j ? `${r2}${r1}o` : `${r1}${r2}`;
                        const isVisible = visibleHands.includes(hand);
                        const action = solution[hand];
                        const color = action === 'raise' ? '#EF4444' : action === 'call' ? '#10B981' : 'rgba(100,100,100,0.3)';

                        return (
                            <div
                                key={hand}
                                style={{
                                    width: 24,
                                    height: 24,
                                    background: isVisible ? color : 'rgba(255,255,255,0.05)',
                                    borderRadius: 3,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 8,
                                    color: isVisible ? '#fff' : 'rgba(255,255,255,0.2)',
                                    fontWeight: 600,
                                }}
                            >
                                {isVisible ? hand.substring(0, 2) : '?'}
                            </div>
                        );
                    })
                )}
            </div>
        );
    };

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
                    ← Exit
                </button>
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>
                    {score.toLocaleString()}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                    {round}/{maxRounds}
                </div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>🧩</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, color: '#00D4FF', marginBottom: 16 }}>PATTERN RECOGNITION</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>
                        See a partial range → Identify the dominant action!<br />
                        Is this a RAISING range, CALLING range, or FOLDING range?<br />
                        8 patterns. Test your GTO intuition!
                    </p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #00D4FF, #0088ff)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>
                        START [SPACE]
                    </button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentPattern && (
                <>
                    {/* Scenario context */}
                    <div style={{ fontSize: 16, color: '#00D4FF', marginBottom: 12, fontWeight: 600 }}>
                        {currentPattern.scenario.title}
                    </div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
                        What action does this range primarily represent?
                    </div>

                    {/* Mini grid */}
                    {renderMiniGrid()}

                    {/* Feedback */}
                    {gameState === 'revealed' && (
                        <div style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: userAnswer === currentPattern.correctAnswer ? '#00ff88' : '#ff4444',
                            marginBottom: 16
                        }}>
                            {userAnswer === currentPattern.correctAnswer
                                ? `✓ Correct! This is a ${currentPattern.correctAnswer.toUpperCase()} range`
                                : `✗ Wrong! This is a ${currentPattern.correctAnswer.toUpperCase()} range`}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <button onClick={() => handleAnswer('fold')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(100,100,100,0.3)', border: '2px solid #666', borderRadius: 12, color: '#fff', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>1</span>
                            FOLD Range
                        </button>
                        <button onClick={() => handleAnswer('call')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(16,185,129,0.3)', border: '2px solid #10B981', borderRadius: 12, color: '#10B981', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>2</span>
                            CALL Range
                        </button>
                        <button onClick={() => handleAnswer('raise')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(239,68,68,0.3)', border: '2px solid #EF4444', borderRadius: 12, color: '#EF4444', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>3</span>
                            RAISE Range
                        </button>
                    </div>
                </>
            )}

            {gameState === 'gameover' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>{correctAnswers >= 6 ? '🏆' : '📊'}</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, color: correctAnswers >= 6 ? '#00ff88' : '#ffaa00', marginBottom: 30 }}>
                        {correctAnswers >= 6 ? 'EXPERT PATTERN READER!' : 'KEEP STUDYING!'}
                    </h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Accuracy</span>
                            <span style={{ color: correctAnswers >= 6 ? '#00ff88' : '#ffaa00' }}>{correctAnswers}/{maxRounds} ({Math.round((correctAnswers / maxRounds) * 100)}%)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Score</span>
                            <span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span>
                        </div>
                        {(correctAnswers * 2 + Math.floor(score / 100)) > 0 && (
                            <div style={{ marginTop: 16, padding: 12, background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.15))', borderRadius: 12, color: '#00ff88', fontWeight: 700 }}>
                                💎 +{correctAnswers * 2 + Math.floor(score / 100)} Diamonds earned!
                            </div>
                        )}
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>
                        BACK TO MENU [SPACE]
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎛️ MIXED STRATEGY GAME COMPONENT
// Slider-based frequency training for complex spots
// ═══════════════════════════════════════════════════════════════════════════
function MixedStrategyGame({ level = 1, onExit, onScoreUpdate, DiamondEngine }) {
    const [gameState, setGameState] = useState('ready'); // ready | playing | revealed | gameover
    const [currentScenario, setCurrentScenario] = useState(null);
    const [targetAction, setTargetAction] = useState(null);
    const [userFreq, setUserFreq] = useState(50);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [roundsPlayed, setRoundsPlayed] = useState(0);
    const [maxRounds] = useState(10);
    const [diff, setDiff] = useState(0);

    const getMixedScenario = useCallback(() => {
        // Use MIXED_SCENARIOS
        const scenario = MIXED_SCENARIOS[Math.floor(Math.random() * MIXED_SCENARIOS.length)];
        // Pick an action to test (preferably one with non-0 and non-100 frequency if possible, or just the highest freq)
        const actions = Object.entries(scenario.frequencies).filter(([_, freq]) => freq > 0);
        const [action] = actions[Math.floor(Math.random() * actions.length)];
        return { scenario, action };
    }, []);

    const startGame = useCallback(() => {
        const { scenario, action } = getMixedScenario();
        setCurrentScenario(scenario);
        setTargetAction(action);
        setGameState('playing');
        setScore(0);
        setStreak(0);
        setRoundsPlayed(0);
        setUserFreq(50);
        SoundEngine.play('levelUp');
    }, [getMixedScenario]);

    const nextRound = useCallback(() => {
        if (roundsPlayed >= maxRounds) {
            setGameState('gameover');
            // Final rewards
            const diamondReward = Math.floor(score / 500) + (score >= 4000 ? 20 : 0);
            if (DiamondEngine && diamondReward > 0) {
                const newBalance = DiamondEngine.award(diamondReward);
                onScoreUpdate?.(newBalance);
            }
            return;
        }

        const { scenario, action } = getMixedScenario();
        setCurrentScenario(scenario);
        setTargetAction(action);
        setGameState('playing');
        setUserFreq(50);
        setRoundsPlayed(prev => prev + 1);
    }, [roundsPlayed, maxRounds, getMixedScenario, score, DiamondEngine, onScoreUpdate]);

    const handleSubmit = () => {
        if (gameState !== 'playing') return;

        const actualFreq = currentScenario.frequencies[targetAction];
        const difference = Math.abs(actualFreq - userFreq);
        setDiff(difference);

        // Scoring: 100 base - difference. Perfect = 500 bonus. < 5 diff = 100 bonus.
        let points = Math.max(0, 100 - difference * 2);
        if (difference === 0) points += 500;
        else if (difference <= 5) points += 200;
        else if (difference <= 15) points += 50;

        if (difference <= 15) {
            setStreak(prev => prev + 1);
            setScore(prev => prev + points + (streak * 50));
            SoundEngine.play('correct');
        } else {
            setStreak(0);
            setScore(prev => prev + points);
            SoundEngine.play('wrong');
        }

        setGameState('revealed');

        setTimeout(() => {
            // Wait for user to see result
        }, 1500); // Wait 1.5s then next? Or user click next? Auto next is better for flow.
        setTimeout(nextRound, 2000);
    };

    // Keyboard
    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'gameover') && (e.key === ' ' || e.key === 'Enter')) {
                if (gameState === 'ready') startGame();
                else onExit?.();
            } else if (gameState === 'playing') {
                if (e.key === 'ArrowLeft') setUserFreq(prev => Math.max(0, prev - 5));
                if (e.key === 'ArrowRight') setUserFreq(prev => Math.min(100, prev + 5));
                if (e.key === 'Enter' || e.key === ' ') handleSubmit();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [gameState, nextRound, startGame, onExit, handleSubmit]);

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
                    ← Exit
                </button>
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>
                    {score.toLocaleString()}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                    {roundsPlayed}/{maxRounds}
                </div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>🎛️</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, color: '#A855F7', marginBottom: 16 }}>MIXED STRATEGY</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>
                        Not every decision is 100% frequency.<br />
                        Dial in the exact GTO frequency for mixed spots.<br />
                        Correct Frequency = Massive Points!
                    </p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #A855F7, #D946EF)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>
                        START [SPACE]
                    </button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentScenario && (
                <>
                    {/* Scenario */}
                    <div style={{ fontSize: 16, color: '#A855F7', marginBottom: 12, fontWeight: 600 }}>
                        {currentScenario.title}
                    </div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 30 }}>
                        {currentScenario.context}
                    </div>

                    {/* Hand Card */}
                    <div style={{
                        width: 140,
                        height: 100,
                        background: 'linear-gradient(145deg, #2e1a2e, #1a1a2e)',
                        border: '2px solid #A855F7',
                        borderRadius: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 40px',
                        boxShadow: '0 10px 30px rgba(168, 85, 247, 0.2)',
                    }}>
                        <div style={{ fontSize: 36, fontFamily: 'Orbitron', fontWeight: 900, color: '#fff' }}>{currentScenario.hand}</div>
                    </div>

                    {/* Question */}
                    <h2 style={{ fontSize: 24, marginBottom: 40 }}>
                        Frequency of <span style={{ color: ACTION_COLORS[targetAction]?.border || '#fff', fontWeight: 900 }}>{targetAction.toUpperCase()}</span>?
                    </h2>

                    {/* Slider UI */}
                    <div style={{ position: 'relative', height: 40, background: 'rgba(255,255,255,0.1)', borderRadius: 20, marginBottom: 20 }}>
                        {/* Fill */}
                        <div style={{
                            position: 'absolute',
                            left: 0, top: 0, bottom: 0,
                            width: `${gameState === 'revealed' ? currentScenario.frequencies[targetAction] : userFreq}%`,
                            background: gameState === 'revealed'
                                ? 'linear-gradient(90deg, #00ff88, #00cc6a)' // Correct answer
                                : 'linear-gradient(90deg, #A855F7, #D946EF)', // User input
                            borderRadius: 20,
                            transition: 'width 0.3s ease',
                            opacity: gameState === 'revealed' ? 0.3 : 1
                        }} />

                        {/* User Goal Marker (when revealed) */}
                        {gameState === 'revealed' && (
                            <div style={{
                                position: 'absolute',
                                left: `calc(${userFreq}% - 2px)`,
                                top: -10, bottom: -10,
                                width: 4,
                                background: diff <= 5 ? '#00ff88' : '#ff4444',
                                zIndex: 10,
                                boxShadow: '0 0 10px rgba(0,0,0,0.5)'
                            }} />
                        )}

                        {/* Actual Marker (when revealed) */}
                        {gameState === 'revealed' && (
                            <div style={{
                                position: 'absolute',
                                left: `calc(${currentScenario.frequencies[targetAction]}% - 2px)`,
                                top: -15, bottom: -15,
                                width: 4,
                                background: '#fff',
                                zIndex: 11,
                                boxShadow: '0 0 15px #fff'
                            }} />
                        )}

                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={userFreq}
                            onChange={(e) => setGameState('playing') && setUserFreq(Number(e.target.value))}
                            disabled={gameState !== 'playing'}
                            style={{
                                position: 'absolute',
                                width: '100%',
                                height: '100%',
                                opacity: 0,
                                cursor: 'pointer',
                                zIndex: 20
                            }}
                        />

                        {/* Text Label */}
                        <div style={{
                            position: 'absolute',
                            width: '100%',
                            top: 0, bottom: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: 18,
                            pointerEvents: 'none',
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                        }}>
                            {gameState === 'revealed'
                                ? `${currentScenario.frequencies[targetAction]}% (You: ${userFreq}%)`
                                : `${userFreq}%`}
                        </div>
                    </div>

                    {/* Hints */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        <span>NEVER (0%)</span>
                        <span>ALWAYS (100%)</span>
                    </div>

                    {/* Feedback */}
                    {gameState === 'revealed' && (
                        <div style={{ marginTop: 30, fontSize: 18, fontWeight: 700, color: diff <= 5 ? '#00ff88' : diff <= 15 ? '#ffaa00' : '#ff4444' }}>
                            {diff === 0 ? '🎯 PERFECT!' : diff <= 5 ? '🔥 EXCELLENT!' : diff <= 15 ? '👍 CLOSE!' : '❌ WAY OFF!'}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={gameState !== 'playing'}
                        style={{
                            marginTop: 40,
                            padding: '16px 64px',
                            background: gameState === 'revealed' ? 'rgba(255,255,255,0.1)' : '#fff',
                            color: gameState === 'revealed' ? 'rgba(255,255,255,0.3)' : '#000',
                            border: 'none',
                            borderRadius: 40,
                            fontWeight: 900,
                            fontSize: 18,
                            cursor: gameState === 'playing' ? 'pointer' : 'default',
                            transform: gameState === 'playing' ? 'scale(1)' : 'scale(0.95)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {gameState === 'revealed' ? 'NEXT HAND...' : 'LOCK IT IN'}
                    </button>
                </>
            )}

            {gameState === 'gameover' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>🎛️</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, marginBottom: 30 }}>SESSION COMPLETE</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}>
                            <span>Final Score</span>
                            <span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span>
                        </div>
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>
                        BACK TO MENU [SPACE]
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎮 MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function MemoryGamesPage() {
    const router = useRouter();
    const containerRef = useRef(null);

    // Zustand Global State (replaces some local useState)
    const currentLevel = useMemoryStore((s) => s.currentLevel);
    const setCurrentLevel = useMemoryStore((s) => s.setCurrentLevel);
    const currentView = useMemoryStore((s) => s.currentView);
    const setCurrentView = useMemoryStore((s) => s.setCurrentView);
    const currentMiniGame = useMemoryStore((s) => s.currentMiniGame);
    const setCurrentMiniGame = useMemoryStore((s) => s.setCurrentMiniGame);

    // Game state (keep local for game session)
    const [mode, setMode] = useState('menu'); // 'menu' | 'game' | 'result' | 'speed-drill'
    const [gameType, setGameType] = useState('range'); // 'range' | 'speed'
    const [currentScenario, setCurrentScenario] = useState(null);
    const [userGrid, setUserGrid] = useState({});
    const [selectedAction, setSelectedAction] = useState('raise');
    const [gradeResult, setGradeResult] = useState(null);

    // Timer state
    const [timeRemaining, setTimeRemaining] = useState(90);
    const [timerActive, setTimerActive] = useState(false);
    const timerRef = useRef(null);

    // Combo state
    const [combo, setCombo] = useState(0);
    const [comboName, setComboName] = useState(null);
    const [multiplier, setMultiplier] = useState(1);

    // Economy state - fetched from Supabase
    const [diamondBalance, setDiamondBalance] = useState(0);
    const [isVIP, setIsVIP] = useState(false);
    const [lastReward, setLastReward] = useState(null);

    // Progress state
    const [consecutivePasses, setConsecutivePasses] = useState(0);
    const [totalXP, setTotalXP] = useState(0);

    // Visual state
    const [screenShake, setScreenShake] = useState(false);
    const [showComboPopup, setShowComboPopup] = useState(false);

    // 🎬 INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('memory-games-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('memory-games-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Initialize effects CSS and load real user balance from Supabase
    useEffect(() => {
        EffectsEngine.initCSS();
        // Fetch real diamond balance from Supabase
        const loadUserBalance = async () => {
            try {
                const { getAuthUser, queryDiamondBalance } = await import('../../src/lib/authUtils');
                const authUser = getAuthUser();
                if (authUser) {
                    const balance = await queryDiamondBalance(authUser.id);
                    setDiamondBalance(balance);
                }
            } catch (e) {
                console.error('[MemoryGames] Failed to fetch diamond balance:', e);
            }
        };
        loadUserBalance();
        setIsVIP(DiamondEngine.isVIP());
    }, []);

    // Timer logic
    useEffect(() => {
        if (timerActive && timeRemaining > 0) {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        handleTimeUp();
                        return 0;
                    }
                    if (prev <= 10) SoundEngine.play('tick');
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [timerActive]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (mode !== 'game' || gradeResult) return;
            const key = e.key;
            const actions = Object.entries(ACTION_COLORS);
            const found = actions.find(([_, v]) => v.key === key);
            if (found) {
                setSelectedAction(found[0]);
            }
            if (key === 'Enter' || key === ' ') {
                e.preventDefault();
                handleSubmit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, gradeResult, userGrid, currentScenario]);

    // Start game
    const startGame = async (level) => {
        // Check diamond access
        if (!isVIP) {
            const result = DiamondEngine.deduct(GAME_COST);
            if (!result.success) {
                alert(`Not enough diamonds! Need ${GAME_COST}💎 to play.\n\nGet VIP for $19.99/month for unlimited access!`);
                return;
            }
            setDiamondBalance(result.balance);
        }

        const scenario = getRandomScenario(level);
        if (!scenario) {
            alert('No scenarios available for this level yet!');
            return;
        }

        // Get level-specific config for progressive difficulty
        const levelConfig = getLevelConfig(level);

        setCurrentLevel(level);
        setCurrentScenario(scenario);
        setUserGrid({});
        setGradeResult(null);
        setTimeRemaining(levelConfig.timer); // Progressive: higher levels = less time
        setTimerActive(true);
        setCombo(0);
        setComboName(null);
        setMultiplier(1);
        setMode('game');

        SoundEngine.play('levelUp');
    };

    // Handle time up
    const handleTimeUp = () => {
        setTimerActive(false);
        SoundEngine.play('gameOver');
        triggerScreenShake();
        handleSubmit(true);
    };

    // Cell click handler
    const handleCellClick = (hand) => {
        if (gradeResult || !timerActive) return;

        setUserGrid(prev => {
            if (prev[hand] === selectedAction) {
                const { [hand]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [hand]: selectedAction };
        });
    };

    // Submit handler
    const handleSubmit = (timedOut = false) => {
        setTimerActive(false);
        clearInterval(timerRef.current);

        const result = gradeUserGrid(userGrid, currentScenario.solution);
        setGradeResult(result);

        const passed = result.score >= MASTERY_THRESHOLD;

        if (passed) {
            // Success!
            SoundEngine.play('combo');
            triggerParticles();

            // God-Mode: Confetti celebration on mastery
            confetti({
                particleCount: 200,
                spread: 120,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#00D4FF', '#00ff88'],
            });

            // Update combo
            const newCombo = combo + 1;
            setCombo(newCombo);
            updateComboDisplay(newCombo);

            // Update consecutive passes
            const newPasses = consecutivePasses + 1;
            setConsecutivePasses(newPasses);

            // Award diamonds and XP
            const baseReward = 15;
            const accuracyBonus = Math.floor((result.score - 85) / 5) * 5;
            const perfectBonus = result.score === 100 ? 50 : 0;
            const comboBonus = Math.floor(newCombo * 2);
            const totalReward = Math.floor((baseReward + accuracyBonus + perfectBonus + comboBonus) * multiplier);

            const newBalance = DiamondEngine.award(totalReward);
            setDiamondBalance(newBalance);
            setLastReward({ diamonds: totalReward, timestamp: Date.now() });

            // XP - higher levels give more XP
            const levelConfig = getLevelConfig(currentLevel);
            const xpGain = Math.floor((50 + (result.score - 85) * 2 + (newCombo * 5)) * levelConfig.xpMultiplier);
            setTotalXP(prev => prev + xpGain);
        } else {
            // Failure
            SoundEngine.play('wrong');
            triggerScreenShake();
            setCombo(0);
            setComboName(null);
            setMultiplier(1);
            setConsecutivePasses(0);
        }

        setMode('result');
    };

    // Update combo display
    const updateComboDisplay = (comboCount) => {
        let name = null;
        let mult = 1;

        if (comboCount >= 20) { name = '🔥 LEGENDARY!'; mult = 3.0; }
        else if (comboCount >= 15) { name = '💀 UNSTOPPABLE!'; mult = 2.5; }
        else if (comboCount >= 10) { name = '⚡ ON FIRE!'; mult = 2.0; }
        else if (comboCount >= 7) { name = '🎯 DOMINATING!'; mult = 1.7; }
        else if (comboCount >= 5) { name = '✨ HOT STREAK!'; mult = 1.5; }
        else if (comboCount >= 3) { name = '👍 NICE!'; mult = 1.2; }

        setComboName(name);
        setMultiplier(mult);

        if (name) {
            setShowComboPopup(true);
            setTimeout(() => setShowComboPopup(false), 1500);
        }
    };

    // Visual effects
    const triggerScreenShake = () => {
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 300);
    };

    const triggerParticles = () => {
        if (typeof window !== 'undefined') {
            const x = window.innerWidth / 2;
            const y = window.innerHeight / 2;
            EffectsEngine.particles(x, y, 20, '#00ff88');
        }
    };

    // Next scenario
    const handleNext = () => {
        startGame(currentLevel);
    };

    // Timer color
    const getTimerColor = () => {
        if (timeRemaining > 30) return '#00ff88';
        if (timeRemaining > 10) return '#ffaa00';
        return '#ff4444';
    };

    // Get level scenarios count
    const getLevelScenarios = (level) => getScenariosByLevel(level).length;

    return (
        <PageTransition>
            {/* 🎬 INTRO VIDEO OVERLAY - Plays while page loads behind it */}
            {showIntro && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99999,
                    background: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <video
                        ref={introVideoRef}
                        src="/videos/memory-games-intro.mp4"
                        autoPlay
                        muted
                        playsInline
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                    />
                    {/* Skip button */}
                    <button
                        onClick={handleIntroEnd}
                        style={{
                            position: 'absolute',
                            top: 20,
                            right: 20,
                            padding: '8px 20px',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 20,
                            color: 'white',
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: 'pointer',
                            zIndex: 100000
                        }}
                    >
                        Skip
                    </button>
                </div>
            )}
            <Head>
                <title>Memory Matrix — Smarter.Poker</title>
                <meta name="description" content="Master GTO ranges through video game training" />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    .memory-games-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
                    
                    
                    
                    
                    
                `}</style>
            </Head>

            <div className="memory-games-page"
                ref={containerRef}
                style={{
                    ...styles.container,
                    transform: screenShake ? 'translate(5px, 5px)' : 'none',
                    animation: screenShake ? 'shake 0.3s ease-in-out' : 'none',
                }}
            >
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Standard Hub Header - DO NOT MODIFY */}
                <UniversalHeader pageDepth={1} />

                {/* Combo Popup */}
                {showComboPopup && comboName && (
                    <div style={styles.comboOverlay}>
                        <div style={styles.comboText}>{comboName}</div>
                        <div style={styles.multiplierText}>{multiplier}x MULTIPLIER</div>
                    </div>
                )}

                {/* Main Content */}
                <div style={styles.content}>
                    {mode === 'menu' && (
                        <>
                            {/* Title */}
                            <div style={styles.titleSection}>
                                <div style={styles.orbIcon}>🧠</div>
                                <h1 style={styles.title}>MEMORY MATRIX</h1>
                                <p style={styles.subtitle}>
                                    Master GTO ranges through high-pressure video game training
                                </p>
                                <div style={styles.costInfo}>
                                    {isVIP ? '👑 VIP: Unlimited Access' : `💎 ${GAME_COST} Diamonds per game`}
                                </div>
                            </div>

                            {/* Game Mode Tabs */}
                            <div style={styles.gameModeTabs}>
                                <button
                                    onClick={() => setGameType('range')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'range' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    🧠 Range
                                </button>
                                <button
                                    onClick={() => setGameType('speed')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'speed' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    ⚡ Speed
                                </button>
                                <button
                                    onClick={() => setGameType('pressure')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'pressure' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    🔥 Pressure
                                </button>
                                <button
                                    onClick={() => setGameType('pattern')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'pattern' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    🧩 Pattern
                                </button>
                                <button
                                    onClick={() => setGameType('mixed')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'mixed' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    🎛️ Mixed
                                </button>
                                <button
                                    onClick={() => router.push('/hub/memory-campaign')}
                                    style={{
                                        ...styles.gameModeTab,
                                        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 140, 0, 0.2))',
                                        border: '2px solid rgba(255, 215, 0, 0.5)',
                                        color: '#FFD700',
                                    }}
                                >
                                    🏆 Campaign
                                </button>
                            </div>

                            {/* Speed Drill Mode */}
                            {gameType === 'speed' && (
                                <div style={styles.speedDrillCard}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#FFD700', marginBottom: 8 }}>
                                        SPEED DRILL
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Flash a hand → Pick the action → Build streaks!<br />
                                        Time gets shorter the better you do. 3 lives, don't lose them!
                                    </p>
                                    <button
                                        onClick={() => {
                                            if (!isVIP) {
                                                const result = DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    alert(`Not enough diamonds!`);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('speed-drill');
                                        }}
                                        style={styles.speedDrillButton}
                                    >
                                        START SPEED DRILL
                                    </button>
                                </div>
                            )}

                            {/* Pressure Cooker Mode */}
                            {gameType === 'pressure' && (
                                <div style={{
                                    ...styles.speedDrillCard,
                                    background: 'linear-gradient(135deg, rgba(255, 68, 68, 0.1), rgba(255, 0, 102, 0.1))',
                                    border: '2px solid rgba(255, 68, 68, 0.3)',
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#ff4444', marginBottom: 8 }}>
                                        PRESSURE COOKER
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Answer 10 hands before the clock runs out!<br />
                                        ✓ Correct = +3 seconds | ✗ Wrong = -5 seconds<br />
                                        <span style={{ color: '#ff4444' }}>Can you defuse the bomb? 💣</span>
                                    </p>
                                    <button
                                        onClick={() => {
                                            if (!isVIP) {
                                                const result = DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    alert(`Not enough diamonds!`);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('pressure-cooker');
                                        }}
                                        style={{
                                            ...styles.speedDrillButton,
                                            background: 'linear-gradient(135deg, #ff4444, #ff0066)',
                                        }}
                                    >
                                        START PRESSURE COOKER
                                    </button>
                                </div>
                            )}

                            {/* Pattern Recognition Mode */}
                            {gameType === 'pattern' && (
                                <div style={{
                                    ...styles.speedDrillCard,
                                    background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(0, 136, 255, 0.1))',
                                    border: '2px solid rgba(0, 212, 255, 0.3)',
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>🧩</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#00D4FF', marginBottom: 8 }}>
                                        PATTERN RECOGNITION
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        See a partial range → Identify the dominant action!<br />
                                        Is it a RAISING, CALLING, or FOLDING range?<br />
                                        Train your GTO intuition across 8 patterns.
                                    </p>
                                    <button
                                        onClick={() => {
                                            if (!isVIP) {
                                                const result = DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    alert(`Not enough diamonds!`);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('pattern-recognition');
                                        }}
                                        style={{
                                            ...styles.speedDrillButton,
                                            background: 'linear-gradient(135deg, #00D4FF, #0088ff)',
                                        }}
                                    >
                                        START PATTERN RECOGNITION
                                    </button>
                                </div>
                            )}

                            {/* Mixed Strategy Mode */}
                            {gameType === 'mixed' && (
                                <div style={{
                                    ...styles.speedDrillCard,
                                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(217, 70, 239, 0.1))',
                                    border: '2px solid rgba(168, 85, 247, 0.3)',
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎛️</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#A855F7', marginBottom: 8 }}>
                                        MIXED STRATEGY
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Dial in the exact frequency for complex GTO spots.<br />
                                        Should you Raise 30% or 70%? Improve your feel.<br />
                                        10 Rounds of high-precision training.
                                    </p>
                                    <button
                                        onClick={() => {
                                            if (!isVIP) {
                                                const result = DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    alert(`Not enough diamonds!`);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('mixed-strategy');
                                        }}
                                        style={{
                                            ...styles.speedDrillButton,
                                            background: 'linear-gradient(135deg, #A855F7, #D946EF)',
                                        }}
                                    >
                                        START MIXED TRAINER
                                    </button>
                                </div>
                            )}

                            {/* Level Grid - Only show for Range Memory */}
                            {gameType === 'range' && (
                                <>
                                    <div style={styles.levelGrid}>
                                        {LEVELS.map((level, idx) => {
                                            const scenarioCount = getLevelScenarios(level.level);
                                            const levelConfig = getLevelConfig(level.level);
                                            const isUnlocked = idx === 0 || consecutivePasses >= (idx * 5);

                                            return (
                                                <div
                                                    key={level.level}
                                                    onClick={() => isUnlocked && scenarioCount > 0 && startGame(level.level)}
                                                    style={{
                                                        ...styles.levelCard,
                                                        opacity: isUnlocked && scenarioCount > 0 ? 1 : 0.4,
                                                        cursor: isUnlocked && scenarioCount > 0 ? 'pointer' : 'not-allowed',
                                                        borderColor: isUnlocked ? '#00D4FF' : '#333',
                                                    }}
                                                >
                                                    <div style={styles.levelNumber}>Level {level.level}</div>
                                                    <h3 style={styles.levelName}>{level.name}</h3>
                                                    <p style={styles.levelFocus}>{level.focus}</p>
                                                    <div style={styles.levelMeta}>
                                                        <span>⏱️ {levelConfig.timer}s</span>
                                                        <span>×{levelConfig.xpMultiplier} XP</span>
                                                    </div>
                                                    <div style={styles.levelMeta}>
                                                        <span>{scenarioCount} scenario{scenarioCount !== 1 ? 's' : ''}</span>
                                                        {!isUnlocked && <span>🔒</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Mastery Gate */}
                                    <div style={styles.masteryGate}>
                                        <span style={styles.masteryIcon}>🔐</span>
                                        <div>
                                            <div style={styles.masteryTitle}>85% Mastery Gate</div>
                                            <div style={styles.masteryDesc}>
                                                Score 85%+ on 5 consecutive scenarios to unlock the next level
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* VIP Upsell */}
                            {!isVIP && (
                                <div style={styles.vipUpsell}>
                                    <div style={styles.vipTitle}>👑 GO VIP — $19.99/month</div>
                                    <div style={styles.vipFeatures}>
                                        Unlimited games • All levels • No diamond cost • Exclusive modes
                                    </div>
                                    <button style={styles.vipButton}>
                                        Upgrade to VIP
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Speed Drill Mode - Full Implementation */}
                    {mode === 'speed-drill' && (
                        <SpeedDrillGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                        />
                    )}

                    {/* Pressure Cooker Mode - Full Implementation */}
                    {mode === 'pressure-cooker' && (
                        <PressureCookerGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                        />
                    )}

                    {/* Pattern Recognition Mode - Full Implementation */}
                    {mode === 'pattern-recognition' && (
                        <PatternRecognitionGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                        />
                    )}

                    {/* Mixed Strategy Mode - Full Implementation */}
                    {mode === 'mixed-strategy' && (
                        <MixedStrategyGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                        />
                    )}

                    {(mode === 'game' || mode === 'result') && currentScenario && (
                        <>
                            {/* Timer Bar */}
                            <div style={styles.timerContainer}>
                                <div
                                    style={{
                                        ...styles.timerBar,
                                        width: `${(timeRemaining / getLevelConfig(currentLevel).timer) * 100}%`,
                                        backgroundColor: getTimerColor(),
                                    }}
                                />
                                <div style={{
                                    ...styles.timerText,
                                    color: getTimerColor(),
                                }}>
                                    {timeRemaining}s
                                </div>
                            </div>

                            {/* Scenario Header */}
                            <div style={styles.gameHeader}>
                                <div>
                                    <div style={styles.levelBadge}>Level {currentLevel} • ⏱️ {getLevelConfig(currentLevel).timer}s</div>
                                    <h2 style={styles.scenarioTitle}>{currentScenario.title}</h2>
                                    <p style={styles.scenarioDesc}>{currentScenario.description}</p>
                                    {currentScenario.tip && !gradeResult && (
                                        <p style={styles.tipText}>💡 {currentScenario.tip}</p>
                                    )}
                                </div>
                                {gradeResult && (
                                    <div style={styles.scoreDisplay}>
                                        <div style={{
                                            ...styles.scoreValue,
                                            color: gradeResult.score >= 85 ? '#00ff88' : '#ff4444',
                                        }}>
                                            {gradeResult.score}%
                                        </div>
                                        <div style={{
                                            ...styles.passBadge,
                                            background: gradeResult.score >= 85
                                                ? 'linear-gradient(135deg, #00ff88, #00D4FF)'
                                                : 'linear-gradient(135deg, #ff4444, #ff6b6b)',
                                        }}>
                                            {gradeResult.score >= 85 ? '✓ PASSED' : '✗ FAILED'}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Action Bar */}
                            <div style={styles.actionBar}>
                                {Object.entries(ACTION_COLORS).map(([action, { bg, border, label, key }]) => (
                                    <button
                                        key={action}
                                        onClick={() => setSelectedAction(action)}
                                        disabled={!!gradeResult}
                                        style={{
                                            ...styles.actionButton,
                                            background: selectedAction === action ? bg : 'rgba(0,0,0,0.4)',
                                            borderColor: selectedAction === action ? border : 'rgba(255,255,255,0.2)',
                                            color: selectedAction === action ? '#fff' : 'rgba(255,255,255,0.5)',
                                            transform: selectedAction === action ? 'scale(1.05)' : 'scale(1)',
                                        }}
                                    >
                                        <span style={styles.keyHint}>{key}</span>
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {/* Grid */}
                            <div style={styles.gridWrapper}>
                                <div style={styles.grid}>
                                    {RANKS.map((_, row) => (
                                        RANKS.map((_, col) => {
                                            const hand = getHandName(row, col);
                                            const userAction = userGrid[hand];
                                            const solutionAction = currentScenario.solution[hand];
                                            const actionStyle = userAction && ACTION_COLORS[userAction];

                                            let feedbackBorder = 'transparent';
                                            if (gradeResult) {
                                                if (gradeResult.missedHands.includes(hand)) feedbackBorder = '#3B82F6';
                                                else if (gradeResult.extraHands.includes(hand)) feedbackBorder = '#EF4444';
                                                else if (gradeResult.wrongActionHands.includes(hand)) feedbackBorder = '#F59E0B';
                                            }

                                            return (
                                                <div
                                                    key={hand}
                                                    onClick={() => handleCellClick(hand)}
                                                    style={{
                                                        ...styles.cell,
                                                        background: actionStyle?.bg || 'rgba(20, 20, 30, 0.6)',
                                                        borderColor: actionStyle?.border || 'rgba(255,255,255,0.1)',
                                                        boxShadow: feedbackBorder !== 'transparent'
                                                            ? `inset 0 0 0 2px ${feedbackBorder}`
                                                            : 'none',
                                                        cursor: gradeResult ? 'default' : 'pointer',
                                                    }}
                                                >
                                                    {hand}
                                                </div>
                                            );
                                        })
                                    ))}
                                </div>
                            </div>

                            {/* Submit / Result Buttons */}
                            <div style={styles.buttonArea}>
                                {!gradeResult ? (
                                    <button onClick={() => handleSubmit()} style={styles.submitButton}>
                                        SUBMIT RANGE [SPACE]
                                    </button>
                                ) : (
                                    <div style={styles.resultButtons}>
                                        <button onClick={() => setMode('menu')} style={styles.menuButton}>
                                            ← MENU
                                        </button>
                                        <button onClick={handleNext} style={styles.nextButton}>
                                            NEXT SCENARIO →
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Result Feedback */}
                            {gradeResult && (
                                <div style={styles.feedbackPanel}>
                                    <div style={styles.feedbackGrid}>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#00ff88' }}>✓ Correct</span>
                                            <span style={styles.feedbackValue}>{gradeResult.correctHands}</span>
                                        </div>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#3B82F6' }}>● Missed</span>
                                            <span style={styles.feedbackValue}>{gradeResult.missedHands.length}</span>
                                        </div>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#EF4444' }}>● Extra</span>
                                            <span style={styles.feedbackValue}>{gradeResult.extraHands.length}</span>
                                        </div>
                                        <div style={styles.feedbackItem}>
                                            <span style={{ color: '#F59E0B' }}>● Wrong Action</span>
                                            <span style={styles.feedbackValue}>{gradeResult.wrongActionHands.length}</span>
                                        </div>
                                    </div>
                                    {gradeResult.score >= 85 && lastReward && (
                                        <div style={styles.rewardSummary}>
                                            💎 +{lastReward.diamonds} Diamonds earned! (×{multiplier} multiplier)
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div >

            {/* Inject shake animation */}
            < style jsx global > {`
                @keyframes shake {
                    0%, 100% { transform: translate(0, 0); }
                    25% { transform: translate(-5px, 5px); }
                    50% { transform: translate(5px, -5px); }
                    75% { transform: translate(-5px, -5px); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
            `}</style >
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a12',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        padding: '16px',
        transition: 'transform 0.05s ease-out',
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.015) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 200, 255, 0.06), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        position: 'relative',
        zIndex: 10,
    },
    backButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    headerStats: {
        display: 'flex',
        gap: 10,
        alignItems: 'center',
    },
    statBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    diamondBadge: {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(138, 43, 226, 0.15))',
        border: '1px solid rgba(0, 212, 255, 0.3)',
    },
    vipBadge: {
        padding: '6px 12px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: '#000',
    },
    comboBadge: {
        padding: '6px 12px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },
    statIcon: { fontSize: 16 },
    statValue: { fontSize: 14, fontWeight: 600, color: '#fff' },
    rewardPopup: {
        position: 'absolute',
        top: -35,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#000',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 20px rgba(0, 255, 136, 0.5)',
        animation: 'pulse 0.5s ease-out',
    },
    comboOverlay: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
    },
    comboText: {
        fontSize: 48,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 0 40px rgba(255, 100, 0, 0.8), 0 0 80px rgba(255, 0, 100, 0.5)',
        animation: 'pulse 0.5s ease-out',
    },
    multiplierText: {
        fontSize: 24,
        fontWeight: 700,
        color: '#FFD700',
        textShadow: '0 0 20px rgba(255, 215, 0, 0.8)',
    },
    content: {
        maxWidth: 1100,
        margin: '0 auto',
    },
    titleSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    orbIcon: {
        fontSize: 72,
        marginBottom: 16,
        animation: 'pulse 2s ease-in-out infinite',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 42,
        fontWeight: 900,
        color: '#fff',
        marginBottom: 12,
        textShadow: '0 0 30px rgba(0, 255, 255, 0.4)',
        letterSpacing: 4,
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 16,
    },
    costInfo: {
        fontSize: 14,
        color: '#00D4FF',
        fontWeight: 600,
    },
    gameModeTabs: {
        display: 'flex',
        gap: 12,
        justifyContent: 'center',
        marginBottom: 32,
    },
    gameModeTab: {
        padding: '12px 24px',
        fontSize: 16,
        fontWeight: 600,
        background: 'rgba(255, 255, 255, 0.05)',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 30,
        color: 'rgba(255, 255, 255, 0.5)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    gameModeTabActive: {
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 255, 136, 0.2))',
        border: '2px solid #00D4FF',
        color: '#fff',
    },
    speedDrillCard: {
        background: 'linear-gradient(135deg, rgba(255, 200, 0, 0.1), rgba(255, 140, 0, 0.1))',
        border: '2px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 20,
        padding: 40,
        textAlign: 'center',
        maxWidth: 500,
        margin: '0 auto',
    },
    speedDrillButton: {
        padding: '16px 48px',
        fontSize: 18,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        color: '#000',
        border: 'none',
        borderRadius: 50,
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(255, 215, 0, 0.4)',
    },
    levelGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32,
    },
    levelCard: {
        background: 'rgba(0, 0, 0, 0.4)',
        border: '2px solid',
        borderRadius: 16,
        padding: 20,
        transition: 'all 0.2s ease',
    },
    levelNumber: {
        fontSize: 11,
        fontFamily: 'Orbitron, sans-serif',
        color: '#00D4FF',
        marginBottom: 6,
        letterSpacing: 1,
    },
    levelName: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 6,
    },
    levelFocus: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 12,
    },
    levelMeta: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.4)',
    },
    masteryGate: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.08), rgba(0, 212, 255, 0.08))',
        border: '1px solid rgba(0, 255, 136, 0.25)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    masteryIcon: { fontSize: 32 },
    masteryTitle: { fontSize: 16, fontWeight: 700, color: '#00ff88', marginBottom: 4 },
    masteryDesc: { fontSize: 13, color: 'rgba(255, 255, 255, 0.6)' },
    vipUpsell: {
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 140, 0, 0.1))',
        border: '2px solid rgba(255, 215, 0, 0.4)',
        borderRadius: 16,
        padding: 24,
        textAlign: 'center',
    },
    vipTitle: { fontSize: 20, fontWeight: 700, color: '#FFD700', marginBottom: 8 },
    vipFeatures: { fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 16 },
    vipButton: {
        padding: '12px 32px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        border: 'none',
        borderRadius: 30,
        fontSize: 16,
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    timerContainer: {
        position: 'relative',
        height: 8,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        marginBottom: 20,
        overflow: 'hidden',
    },
    timerBar: {
        height: '100%',
        transition: 'width 1s linear, background-color 0.3s ease',
        borderRadius: 4,
    },
    timerText: {
        position: 'absolute',
        right: 0,
        top: 12,
        fontSize: 14,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 700,
    },
    gameHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    levelBadge: {
        fontSize: 11,
        fontFamily: 'Orbitron, sans-serif',
        color: '#00D4FF',
        marginBottom: 4,
    },
    scenarioTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 4,
    },
    scenarioDesc: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    tipText: {
        fontSize: 12,
        color: '#FFD700',
        marginTop: 8,
        padding: '8px 12px',
        background: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 8,
        border: '1px solid rgba(255, 215, 0, 0.2)',
    },
    scoreDisplay: {
        textAlign: 'right',
    },
    scoreValue: {
        fontSize: 56,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 900,
        lineHeight: 1,
    },
    passBadge: {
        display: 'inline-block',
        padding: '6px 16px',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#000',
        marginTop: 8,
    },
    actionBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
        justifyContent: 'center',
    },
    actionButton: {
        padding: '10px 16px',
        borderRadius: 8,
        border: '2px solid',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
    },
    keyHint: {
        position: 'absolute',
        top: -8,
        right: -6,
        background: 'rgba(0, 0, 0, 0.8)',
        width: 18,
        height: 18,
        borderRadius: 4,
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255, 255, 255, 0.3)',
    },
    gridWrapper: {
        overflowX: 'auto',
        marginBottom: 20,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(13, minmax(46px, 1fr))',
        gap: 2,
        minWidth: 620,
    },
    cell: {
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
        borderRadius: 4,
        border: '1px solid',
        transition: 'all 0.1s ease',
        userSelect: 'none',
    },
    buttonArea: {
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 20,
    },
    submitButton: {
        padding: '16px 48px',
        fontSize: 18,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #fff, #e0e0e0)',
        color: '#000',
        border: 'none',
        borderRadius: 50,
        cursor: 'pointer',
        boxShadow: '0 0 40px rgba(255, 255, 255, 0.3)',
        transition: 'transform 0.1s ease',
    },
    resultButtons: {
        display: 'flex',
        gap: 16,
    },
    menuButton: {
        padding: '14px 28px',
        fontSize: 16,
        fontWeight: 600,
        background: 'rgba(255, 255, 255, 0.1)',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        cursor: 'pointer',
    },
    nextButton: {
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 600,
        background: 'linear-gradient(135deg, #00D4FF, #0088dd)',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        cursor: 'pointer',
        boxShadow: '0 0 25px rgba(0, 212, 255, 0.4)',
    },
    feedbackPanel: {
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: 20,
        maxWidth: 500,
        margin: '0 auto',
    },
    feedbackGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
    },
    feedbackItem: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 8,
        fontSize: 13,
    },
    feedbackValue: {
        fontWeight: 700,
        color: '#fff',
    },
    rewardSummary: {
        marginTop: 16,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 212, 255, 0.15))',
        borderRadius: 12,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 700,
        color: '#00ff88',
    },
};
