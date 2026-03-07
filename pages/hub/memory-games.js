/* ═══════════════════════════════════════════════════════════════════════════
    MEMORY MATRIX 2.0 — THE GTO WIZARD KILLER
   Full Video Game Experience with Pressure, Combos, and Diamond Economy
   ═══════════════════════════════════════════════════════════════════════════ */

import Image from 'next/image';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import confetti from 'canvas-confetti';
import { SoundEngine, EffectsEngine, LEVELS, MASTERY_THRESHOLD, GAME_COST } from '../../src/games/GameEngine';
import { getScenariosByLevel, getRandomScenario, getLevelConfig, RANKS, getHandName, MIXED_SCENARIOS, LEVEL_1_SCENARIOS, LEVEL_2_SCENARIOS, LEVEL_3_SCENARIOS, LEVEL_4_SCENARIOS, LEVEL_5_SCENARIOS, LEVEL_6_SCENARIOS, LEVEL_7_SCENARIOS, LEVEL_8_SCENARIOS, LEVEL_9_SCENARIOS, LEVEL_10_SCENARIOS } from '../../src/games/ScenarioDatabase';
import { supabase } from '../../src/lib/supabase';

// God-Mode Stack
import { useMemoryStore } from '../../src/stores/memoryStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import { useAvatar } from '../../src/contexts/AvatarContext';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getMemoryGamesPreferences, updateMemoryGamesPreferences } from '../../src/services/memoryGamesPreferences';

// ═══════════════════════════════════════════════════════════════════════════
// Diamonds DIAMOND ENGINE — Local storage with VIP check
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// Diamonds DIAMOND ENGINE - Import Supabase-powered version
// ═══════════════════════════════════════════════════════════════════════════
import DiamondEngine from '../../src/services/DiamondEngine';
import leaderboardService from '../../src/services/LeaderboardService';
import GameCostPopup from '../../src/components/gates/GameCostPopup';
import dailyChallengeService from '../../src/services/DailyChallengeService';
import { processGameResult } from '../../src/games/ELOService';
import gameSessionService from '../../src/services/GameSessionService';
import achievementService from '../../src/services/AchievementService';
import { claimReward } from '../../src/lib/claimReward';

// New Game Mode Components (dynamic imports for code splitting)
import dynamic from 'next/dynamic';
const SpotTrainerGame = dynamic(() => import('../../src/games/SpotTrainerGame'), { ssr: false });
const TournamentModeGame = dynamic(() => import('../../src/games/TournamentModeGame'), { ssr: false });
import ScenarioFilterPanel, { filterScenarios } from '../../src/games/ScenarioFilterPanel';

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
// ++ SPEED DRILL GAME COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function SpeedDrillGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
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

                // ═══════════════════════════════════════════════════════════════════════════
                // 📊 PERSIST TO SUPABASE — Session, Achievements
                // ═══════════════════════════════════════════════════════════════════════════
                if (userId) {
                    const accuracy = handsPlayed > 0 ? Math.round((score / (handsPlayed * 100)) * 100) : 0;

                    // Record game session
                    gameSessionService.recordSession(userId, {
                        gameMode: 'speed_drill',
                        level,
                        scenarioId: currentHand?.scenario?.title,
                        score,
                        accuracy,
                        timeTaken: 0,
                        diamondsSpent: 0,
                        diamondsEarned: diamondReward,
                        completed: true
                    }).then(r => console.log('[SpeedDrill] Session recorded:', r))
                        .catch(e => console.warn('[SpeedDrill] Session failed:', e));

                    // Check achievements
                    achievementService.checkAndUnlock(userId, {
                        gamesPlayed: 1,
                        accuracy,
                        level,
                        gameMode: 'speed_drill',
                        currentStreak: maxStreak,
                        modesPlayed: ['speed_drill']
                    }).then(u => u.length > 0 && console.log('[SpeedDrill] Achievements:', u))
                        .catch(e => console.warn('[SpeedDrill] Achievement check failed:', e));
                }
            } else {
                nextHand();
            }
        }, 800);
    }, [gameState, currentHand, streak, lives, score, nextHand, DiamondEngine, onScoreUpdate, userId, handsPlayed, level, maxStreak]);

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
                        {streak}x
                    </div>
                )}
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>++</div>
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
                            <span key={i} style={{ fontSize: 24, opacity: i < lives ? 1 : 0.3 }}></span>
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
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444', marginBottom: 12 }}>
                                {userAnswer === currentHand.correctAction
                                    ? ` Correct! +${100 + (streak - 1) * 10}`
                                    : `✗ Wrong! Should ${currentHand.correctAction.toUpperCase()}`}
                            </div>
                            {/* GTO Panel Image for wrong answers */}
                            {userAnswer !== currentHand.correctAction && (
                                <img
                                    src={`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/gto-panels/panels/gto_${(currentHand.scenario?.position || 'utg').toLowerCase()}_${currentHand.correctAction}_${currentHand.scenario?.stackDepth || 100}bb.png`}
                                    alt="GTO Analysis"
                                    style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            )}
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
                            <span> {maxStreak}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 18, color: '#fff' }}>
                            <span>Hands Played</span>
                            <span>{handsPlayed}</span>
                        </div>
                        {score >= 100 && (
                            <div style={{ marginTop: 16, padding: 12, background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.15))', borderRadius: 12, color: '#00ff88', fontWeight: 700 }}>
                                Diamonds +{Math.floor(score / 100)} Diamonds earned!
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
//  PRESSURE COOKER GAME COMPONENT
// Bomb defusal style - answer 10 spots before time runs out!
// ═══════════════════════════════════════════════════════════════════════════
function PressureCookerGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
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

                // ═══════════════════════════════════════════════════════════════════════════
                // 📊 PERSIST TO SUPABASE — Session, Achievements
                // ═══════════════════════════════════════════════════════════════════════════
                if (userId) {
                    const accuracy = Math.round((score / (newHandsCompleted * 100)) * 100);

                    gameSessionService.recordSession(userId, {
                        gameMode: 'pressure_cooker',
                        level,
                        scenarioId: currentHand?.scenario?.title,
                        score,
                        accuracy,
                        timeTaken: Math.round((INITIAL_TIME - timeRemaining) / 1000),
                        diamondsSpent: 0,
                        diamondsEarned: diamondReward,
                        completed: true
                    }).then(r => console.log('[PressureCooker] Session recorded:', r))
                        .catch(e => console.warn('[PressureCooker] Session failed:', e));

                    achievementService.checkAndUnlock(userId, {
                        gamesPlayed: 1,
                        accuracy,
                        level,
                        gameMode: 'pressure_cooker',
                        currentStreak: streak,
                        modesPlayed: ['pressure_cooker']
                    }).then(u => u.length > 0 && console.log('[PressureCooker] Achievements:', u))
                        .catch(e => console.warn('[PressureCooker] Achievement check failed:', e));
                }
            } else if (timeRemaining <= 0) {
                // Already failed (handled by timer)
            } else {
                nextHand();
            }
        }, 600);
    }, [gameState, currentHand, streak, handsCompleted, handsRequired, timeRemaining, score, nextHand, DiamondEngine, onScoreUpdate, userId, level]);

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
                    <div style={{ fontSize: 80, marginBottom: 20 }}></div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#ff4444', marginBottom: 16 }}>PRESSURE COOKER</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>
                        Answer 10 hands before time runs out!<br />
                        Correct = +3 seconds<br />
                        ✗ Wrong = -5 seconds<br />
                        <span style={{ color: '#ff4444' }}>Clock Is Ticking... 💣</span>
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
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444', marginBottom: 12 }}>
                                {userAnswer === currentHand.correctAction
                                    ? ` +${100 + (streak - 1) * 20} (+3s)`
                                    : `✗ ${currentHand.correctAction.toUpperCase()} (-5s)`}
                            </div>
                            {/* GTO Panel Image for wrong answers */}
                            {userAnswer !== currentHand.correctAction && (
                                <img
                                    src={`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/gto-panels/panels/gto_${(currentHand.scenario?.position || 'utg').toLowerCase()}_${currentHand.correctAction}_${currentHand.scenario?.stackDepth || 100}bb.png`}
                                    alt="GTO Analysis"
                                    style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            )}
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
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Trophy</div>
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
                            Diamonds +{Math.floor(score / 50) + 10} Diamonds earned!
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
// Pattern PATTERN RECOGNITION GAME COMPONENT
// Identify the pattern - what action does this range shape represent?
// ═══════════════════════════════════════════════════════════════════════════
function PatternRecognitionGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
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

            // ═══════════════════════════════════════════════════════════════════════════
            // 📊 PERSIST TO SUPABASE — Session, Achievements
            // ═══════════════════════════════════════════════════════════════════════════
            if (userId) {
                const accuracy = Math.round((correctAnswers / maxRounds) * 100);

                gameSessionService.recordSession(userId, {
                    gameMode: 'pattern_recognition',
                    level,
                    scenarioId: currentPattern?.scenario?.title,
                    score,
                    accuracy,
                    timeTaken: 0,
                    diamondsSpent: 0,
                    diamondsEarned: diamondReward,
                    completed: true
                }).then(r => console.log('[PatternRecognition] Session recorded:', r))
                    .catch(e => console.warn('[PatternRecognition] Session failed:', e));

                achievementService.checkAndUnlock(userId, {
                    gamesPlayed: 1,
                    accuracy,
                    level,
                    gameMode: 'pattern_recognition',
                    currentStreak: streak,
                    modesPlayed: ['pattern_recognition']
                }).then(u => u.length > 0 && console.log('[PatternRecognition] Achievements:', u))
                    .catch(e => console.warn('[PatternRecognition] Achievement check failed:', e));
            }
            return;
        }
        const pattern = generatePattern();
        if (!pattern) return;
        setCurrentPattern(pattern);
        setGameState('playing');
        setRound(prev => prev + 1);
        setUserAnswer(null);
    }, [round, maxRounds, generatePattern, correctAnswers, score, DiamondEngine, onScoreUpdate, userId, level, streak, currentPattern]);

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
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Pattern</div>
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
                        <div style={{ marginBottom: 16 }}>
                            <div style={{
                                fontSize: 18,
                                fontWeight: 700,
                                color: userAnswer === currentPattern.correctAnswer ? '#00ff88' : '#ff4444',
                                marginBottom: 12
                            }}>
                                {userAnswer === currentPattern.correctAnswer
                                    ? ` Correct! This is a ${currentPattern.correctAnswer.toUpperCase()} range`
                                    : `✗ Wrong! This is a ${currentPattern.correctAnswer.toUpperCase()} range`}
                            </div>
                            {/* GTO Panel Image for wrong answers */}
                            {userAnswer !== currentPattern.correctAnswer && (
                                <img
                                    src={`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/gto-panels/panels/gto_${(currentPattern.scenario?.position || 'utg').toLowerCase()}_${currentPattern.correctAnswer}_${currentPattern.scenario?.stackDepth || 100}bb.png`}
                                    alt="GTO Analysis"
                                    style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            )}
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
                    <div style={{ fontSize: 80, marginBottom: 20 }}>{correctAnswers >= 6 ? 'Trophy' : ''}</div>
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
                                Diamonds +{correctAnswers * 2 + Math.floor(score / 100)} Diamonds earned!
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
// Mix MIXED STRATEGY GAME COMPONENT
// Slider-based frequency training for complex spots
// ═══════════════════════════════════════════════════════════════════════════
function MixedStrategyGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
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

            // ═══════════════════════════════════════════════════════════════════════════
            // 📊 PERSIST TO SUPABASE — Session, Achievements
            // ═══════════════════════════════════════════════════════════════════════════
            if (userId) {
                const accuracy = Math.round((score / (roundsPlayed * 500)) * 100);

                gameSessionService.recordSession(userId, {
                    gameMode: 'mixed_strategy',
                    level,
                    scenarioId: currentScenario?.title,
                    score,
                    accuracy,
                    timeTaken: 0,
                    diamondsSpent: 0,
                    diamondsEarned: diamondReward,
                    completed: true
                }).then(r => console.log('[MixedStrategy] Session recorded:', r))
                    .catch(e => console.warn('[MixedStrategy] Session failed:', e));

                achievementService.checkAndUnlock(userId, {
                    gamesPlayed: 1,
                    accuracy,
                    level,
                    gameMode: 'mixed_strategy',
                    currentStreak: streak,
                    modesPlayed: ['mixed_strategy']
                }).then(u => u.length > 0 && console.log('[MixedStrategy] Achievements:', u))
                    .catch(e => console.warn('[MixedStrategy] Achievement check failed:', e));
            }
            return;
        }

        const { scenario, action } = getMixedScenario();
        setCurrentScenario(scenario);
        setTargetAction(action);
        setGameState('playing');
        setUserFreq(50);
        setRoundsPlayed(prev => prev + 1);
    }, [roundsPlayed, maxRounds, getMixedScenario, score, DiamondEngine, onScoreUpdate, userId, level, streak, currentScenario]);

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
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Mix</div>
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
                        <div style={{ marginTop: 30, marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: diff <= 5 ? '#00ff88' : diff <= 15 ? '#ffaa00' : '#ff4444', marginBottom: 12 }}>
                                {diff === 0 ? 'PERFECT!' : diff <= 5 ? 'EXCELLENT!' : diff <= 15 ? 'CLOSE!' : 'WAY OFF!'}
                            </div>
                            {/* GTO Panel Image for significantly wrong answers */}
                            {diff > 15 && (
                                <img
                                    src={`https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/gto-panels/panels/gto_${(currentScenario?.position || 'utg').toLowerCase()}_${targetAction}_${currentScenario?.stackDepth || 100}bb.png`}
                                    alt="GTO Analysis"
                                    style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            )}
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
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Mix</div>
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
// 💎 OUT OF DIAMONDS MODAL
// ═══════════════════════════════════════════════════════════════════════════
function OutOfDiamondsModal({ isOpen, onClose, gameCost = 5, isVIP = false }) {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #1a0a2a, #0a0a12)',
                borderRadius: 24,
                padding: 32,
                maxWidth: 420,
                width: '90%',
                textAlign: 'center',
                border: '2px solid rgba(255, 107, 0, 0.5)',
                boxShadow: '0 0 60px rgba(255, 107, 0, 0.3)',
            }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}><svg width='64' height='64' viewBox='0 0 24 24' fill='none'><path d='M12 2L2 9l10 13 10-13L12 2z' fill='#00D4FF' /><path d='M12 2L2 9h20L12 2z' fill='#00B8E6' /></svg></div>
                <h2 style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 28,
                    fontWeight: 900,
                    color: '#ff6b00',
                    marginBottom: 8,
                }}>OUT OF DIAMONDS</h2>
                <p style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 16,
                    marginBottom: 24,
                    lineHeight: 1.6,
                }}>
                    You need <strong style={{ color: '#FFD700' }}>{gameCost} diamonds</strong> to play this game.
                </p>

                {!isVIP && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(0, 212, 255, 0.2))',
                        borderRadius: 16,
                        padding: 20,
                        marginBottom: 24,
                        border: '1px solid rgba(138, 43, 226, 0.3)',
                    }}>
                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                            GET VIP FOR
                        </div>
                        <div style={{
                            fontFamily: 'Orbitron, sans-serif',
                            fontSize: 32,
                            fontWeight: 900,
                            color: '#fff',
                            marginBottom: 4,
                        }}>
                            $19.99<span style={{ fontSize: 16, opacity: 0.7 }}>/month</span>
                        </div>
                        <div style={{ color: '#00ff88', fontSize: 14, fontWeight: 600 }}>
                            UNLIMITED ACCESS • No diamonds needed
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1,
                            padding: '14px 24px',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Maybe Later
                    </button>
                    <a
                        href="/hub/diamond-store?tab=vip"
                        style={{
                            flex: 1,
                            padding: '14px 24px',
                            background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
                            border: 'none',
                            borderRadius: 12,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        Get Diamonds
                    </a>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📅 DAILY CHALLENGE CARD
// ═══════════════════════════════════════════════════════════════════════════
function DailyChallengeCard({ challenge, streak, completed, onPlay, loading }) {
    if (loading) {
        return (
            <div style={{
                background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.1), rgba(255, 0, 102, 0.1))',
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
                border: '1px solid rgba(255, 107, 0, 0.3)',
                textAlign: 'center',
            }}>
                <div style={{ color: 'rgba(255,255,255,0.5)' }}>Loading Daily Challenge...</div>
            </div>
        );
    }

    if (!challenge) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.15), rgba(255, 0, 102, 0.1))',
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            border: completed ? '2px solid #00ff88' : '2px solid rgba(255, 107, 0, 0.5)',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Streak Badge */}
            {streak?.current_streak > 0 && (
                <div style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    borderRadius: 20,
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                }}>
                    <span style={{ fontSize: 16, color: '#FF6B00' }}>★</span>
                    <span style={{ fontWeight: 700, color: '#000', fontSize: 14 }}>
                        {streak.current_streak} day streak
                    </span>
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: completed ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 107, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                }}>
                    {completed ? '✓' : '◉'}
                </div>
                <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Daily Challenge
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                        {challenge.title || `Level ${challenge.level || 1} Challenge`}
                    </div>
                </div>
            </div>

            <div style={{
                display: 'flex',
                gap: 16,
                marginBottom: 16,
                flexWrap: 'wrap',
            }}>
                <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 8,
                    padding: '8px 14px',
                }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Mode</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{challenge.game_mode || 'Range'}</div>
                </div>
                <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 8,
                    padding: '8px 14px',
                }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Target</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#FFD700' }}>{challenge.target_accuracy || 75}% accuracy</div>
                </div>
                <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 8,
                    padding: '8px 14px',
                }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Reward</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#00ff88' }}>+{challenge.diamond_reward || 50} Diamonds</div>
                </div>
            </div>

            {completed ? (
                <div style={{
                    background: 'rgba(0, 255, 136, 0.2)',
                    borderRadius: 10,
                    padding: '12px 20px',
                    textAlign: 'center',
                    color: '#00ff88',
                    fontWeight: 700,
                }}>
                    ✓ Challenge Completed Today!
                </div>
            ) : (
                <button
                    onClick={onPlay}
                    style={{
                        width: '100%',
                        padding: '14px 24px',
                        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
                        border: 'none',
                        borderRadius: 12,
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    Play Daily Challenge
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function MemoryGamesPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const containerRef = useRef(null);

    // Zustand Global State (replaces some local useState)
    const currentLevel = useMemoryStore((s) => s.currentLevel) || 1; // Fallback to level 1 if undefined
    const setCurrentLevel = useMemoryStore((s) => s.setCurrentLevel);
    const currentView = useMemoryStore((s) => s.currentView);
    const setCurrentView = useMemoryStore((s) => s.setCurrentView);
    const currentMiniGame = useMemoryStore((s) => s.currentMiniGame);
    const setCurrentMiniGame = useMemoryStore((s) => s.setCurrentMiniGame);

    // Game state (keep local for game session)
    const [mode, setMode] = useState('menu'); // 'menu' | 'game' | 'result' | 'speed-drill'
    const [gameType, setGameType] = useState('range'); // 'range' | 'speed' | 'leaderboard' | 'daily'
    const [currentScenario, setCurrentScenario] = useState(null);
    const [userGrid, setUserGrid] = useState({});
    const [selectedAction, setSelectedAction] = useState('raise');
    const [gradeResult, setGradeResult] = useState(null);

    // Leaderboard state
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardMode, setLeaderboardMode] = useState('range-memory');
    const [userRank, setUserRank] = useState(null);

    // Daily Challenge state
    const [dailyChallenge, setDailyChallenge] = useState(null);
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [userStreak, setUserStreak] = useState({ current_streak: 0, longest_streak: 0 });
    const [challengeCompleted, setChallengeCompleted] = useState(false);

    // Scenario Filter state
    const [showFilters, setShowFilters] = useState(false);
    const [scenarioFilters, setScenarioFilters] = useState({});

    // AI Generation state
    const [useAIGeneration, setUseAIGeneration] = useState(false);
    const [aiGenerating, setAIGenerating] = useState(false);

    // Timer state
    const [timeRemaining, setTimeRemaining] = useState(90);
    const [timerActive, setTimerActive] = useState(false);
    const timerRef = useRef(null);

    // Combo state
    const [combo, setCombo] = useState(0);
    const [comboName, setComboName] = useState(null);
    const [multiplier, setMultiplier] = useState(1);

    // Economy state - fetched from Supabase
    const [diamondBalance, setDiamondBalance] = useState(100);
    const [isVIP, setIsVIP] = useState(false);

    // Initialize Supabase client
    const supabase = useRef(null);
    if (!supabase.current && typeof window !== 'undefined') {
        supabase.current = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
    }
    const [lastReward, setLastReward] = useState(null);

    // Progress state
    const [consecutivePasses, setConsecutivePasses] = useState(0);
    const [totalXP, setTotalXP] = useState(0);

    // Visual state
    const [screenShake, setScreenShake] = useState(false);
    const [showComboPopup, setShowComboPopup] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showOutOfDiamondsModal, setShowOutOfDiamondsModal] = useState(false);

    // Jarvis Explain Modal state
    const [explainModal, setExplainModal] = useState({
        show: false,
        hand: null,
        correctAction: null,
        userAction: null,
        explanation: null,
        loading: false
    });

    // Jarvis Post-Game Coach state
    const [coachAnalysis, setCoachAnalysis] = useState({
        show: false,
        loading: false,
        analysis: null
    });

    // Adaptive training state
    const [weakSpots, setWeakSpots] = useState([]);
    const [adaptiveLoading, setAdaptiveLoading] = useState(false);
    const [lobbySuggestions, setLobbySuggestions] = useState([]);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        soundEffects: true,
        showHints: true,
        autoSave: true
    });

    // Load preferences from Supabase on mount
    useEffect(() => {
        if (userId) {
            getMemoryGamesPreferences(userId).then(setPreferences);
        }
    }, []);

    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updateMemoryGamesPreferences(userId, { [key]: value });
            } catch (error) {
                console.error('Failed to save preference:', error);
            }
        }
    }, [preferences]);

    const menuConfig = getMenuConfig('memory-games', user, preferences, {
        setSoundEffects: (val) => updatePreference('soundEffects', val),
        setKeyboardShortcuts: (val) => updatePreference('keyboardShortcuts', val),
        setShowTimer: (val) => updatePreference('showTimer', val),
        setVisualHints: (val) => updatePreference('visualHints', val)
    });

    //  INTRO VIDEO STATE - Video plays while page loads in background
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

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    // Safe helper to get level config with fallback
    const safeLevelConfig = getLevelConfig(currentLevel) || { timer: 90, gridSize: 13, maxHands: 20 };

    // Initialize effects CSS and DiamondEngine with user session
    useEffect(() => {
        EffectsEngine.initCSS();

        // Initialize DiamondEngine with user session
        const initializeDiamondEngine = async () => {
            try {
                // Get user session
                if (supabase.current) {
                    const { data: { session } } = await supabase.current.auth.getSession();
                    const user = session?.user;

                    if (user) {
                        setUserId(user.id);
                        // Initialize DiamondEngine with user ID
                        await DiamondEngine.init(user.id);

                        // Load balance and VIP status
                        const balance = await DiamondEngine.getBalance();
                        const vipStatus = await DiamondEngine.isVIP();

                        setDiamondBalance(balance);
                        setIsVIP(vipStatus);
                    } else {
                        // Guest user - use localStorage fallback
                        await DiamondEngine.init(null);
                        const balance = await DiamondEngine.getBalance();
                        setDiamondBalance(balance);
                    }
                }
            } catch (e) {
                console.error('[MemoryGames] Failed to initialize DiamondEngine:', e);
                // Fallback to localStorage
                await DiamondEngine.init(null);
                const balance = await DiamondEngine.getBalance();
                setDiamondBalance(balance);
            }
        };

        initializeDiamondEngine();
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
            const result = await DiamondEngine.deduct(GAME_COST);
            if (!result.success) {
                setShowOutOfDiamondsModal(true);
                return;
            }
            setDiamondBalance(result.balance);
        }

        let scenario = null;

        // Use AI Generation if enabled (VIP feature)
        if (useAIGeneration) {
            setAIGenerating(true);
            try {
                // Build filter params from active filters
                const requestBody = {
                    level,
                    position: scenarioFilters.position || undefined,
                    stackDepth: scenarioFilters.stackDepth || undefined,
                    format: scenarioFilters.format || undefined,
                };

                const response = await fetch('/api/gto/generate-scenario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const result = await response.json();

                if (result.success && result.scenario) {
                    scenario = result.scenario;
                } else {
                    console.error('[MemoryGames] AI generation failed:', result.error);
                    // Fallback to static scenarios
                    scenario = null;
                }
            } catch (error) {
                console.error('[MemoryGames] AI generation error:', error);
                // Fallback to static scenarios
                scenario = null;
            } finally {
                setAIGenerating(false);
            }
        }

        // Fallback: Use static scenarios if AI generation failed or is disabled
        if (!scenario) {
            let levelScenarios = getScenariosByLevel(level);

            // Apply filters if any are active
            if (Object.keys(scenarioFilters).filter(k => scenarioFilters[k]).length > 0) {
                levelScenarios = filterScenarios(levelScenarios, scenarioFilters);
            }

            // Select random scenario from filtered list
            scenario = levelScenarios.length > 0
                ? levelScenarios[Math.floor(Math.random() * levelScenarios.length)]
                : null;
        }

        if (!scenario) {
            alert('No scenarios available for this level!\n\nTry adjusting or resetting your filters.');
            return;
        }

        // Get level-specific config for progressive difficulty
        const levelConfig = getLevelConfig(level) || { timer: 90, gridSize: 13, maxHands: 20 };

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

        // ═══════════════════════════════════════════════════════════════════════════
        // 📊 PERSIST TO SUPABASE — Leaderboard, ELO, Daily Challenge
        // ═══════════════════════════════════════════════════════════════════════════
        if (user?.id) {
            const gameMode = selectedGameMode || 'range';
            const timeTaken = Math.floor((60 - timer) + (60 * (getLevelConfig(currentLevel).timeLimit / 60 - 1)));

            // 1. Update leaderboard (only if passed)
            if (passed) {
                leaderboardService.updateLeaderboard(
                    user.id,
                    gameMode,
                    currentLevel,
                    result.score,
                    result.score, // accuracy
                    timeTaken,
                    null // sessionId
                ).then(res => {
                }).catch(err => {
                });
            }

            // 2. Update ELO rating
            processGameResult(user.id, currentLevel, result.score, gamesPlayed || 0)
                .then(eloResult => {
                    if (eloResult?.rank) {
                        setEloRank && setEloRank(eloResult.rank);
                    }
                }).catch(err => {
                });

            // 3. Check and complete daily challenge
            dailyChallengeService.getTodaysChallenge().then(challengeData => {
                if (challengeData?.success && challengeData?.challenge && !challengeData.completed) {
                    const challenge = challengeData.challenge;
                    // Check if this game matches the daily challenge
                    if (challenge.level === currentLevel && result.score >= challenge.target_accuracy) {
                        dailyChallengeService.completeChallenge(
                            user.id,
                            challenge.id,
                            result.score,
                            result.score,
                            timeTaken
                        ).then(completionResult => {
                            if (completionResult?.success) {
                                // Award bonus diamonds for daily challenge
                                const bonus = challenge.diamond_reward || 25;
                                DiamondEngine.award(bonus);
                                setDiamondBalance(prev => prev + bonus);

                                // Award daily trivia diamonds via server-validated API (15💎, with toast)
                                claimReward('/api/rewards/daily-trivia', { userId: user.id }, 'Daily Trivia Challenge');
                            }
                        }).catch(err => {
                        });
                    }
                }
            });

            // 4. Increment games played counter
            const newGamesPlayed = (gamesPlayed || 0) + 1;
            setGamesPlayed && setGamesPlayed(newGamesPlayed);

            // 5. Record game session for analytics
            gameSessionService.recordSession(user.id, {
                gameMode,
                level: currentLevel,
                scenarioId: currentScenario?.id || currentScenario?.title,
                score: result.score,
                accuracy: result.score,
                timeTaken,
                diamondsSpent: isVIP ? 0 : 10,
                diamondsEarned: passed ? totalReward : 0,
                completed: true
            }).then(sessionResult => {
            }).catch(err => {
            });

            // 6. Check and unlock achievements
            achievementService.checkAndUnlock(user.id, {
                gamesPlayed: newGamesPlayed,
                accuracy: result.score,
                timeTaken,
                level: currentLevel,
                gameMode,
                totalDiamonds: diamondBalance,
                aiScenariosCompleted: useAIGeneration ? 1 : 0,
                currentStreak: consecutivePasses,
                modesPlayed: [gameMode] // TODO: track all modes played
            }).then(unlocked => {
                if (unlocked.length > 0) {
                }
            }).catch(err => {
            });

            // 7. Push to Jarvis Personal Assistant for leak detection
            const answersData = [];
            // Build answers array from gradeResult
            if (result.wrongActionHands) {
                result.wrongActionHands.forEach(hand => {
                    answersData.push({
                        hand,
                        userAnswer: userGrid[hand] || 'fold',
                        correctAnswer: currentScenario?.solution?.[hand] || 'raise',
                        wasCorrect: false,
                        position: currentScenario?.position,
                        scenario: { title: currentScenario?.title, stackDepth: currentScenario?.stackDepth }
                    });
                });
            }
            if (result.missedHands) {
                result.missedHands.forEach(hand => {
                    answersData.push({
                        hand,
                        userAnswer: 'fold',
                        correctAnswer: currentScenario?.solution?.[hand] || 'raise',
                        wasCorrect: false,
                        position: currentScenario?.position,
                        scenario: { title: currentScenario?.title, stackDepth: currentScenario?.stackDepth }
                    });
                });
            }
            if (result.correctHands) {
                result.correctHands.forEach(hand => {
                    answersData.push({
                        hand,
                        userAnswer: userGrid[hand] || currentScenario?.solution?.[hand],
                        correctAnswer: currentScenario?.solution?.[hand],
                        wasCorrect: true,
                        position: currentScenario?.position,
                        scenario: { title: currentScenario?.title, stackDepth: currentScenario?.stackDepth }
                    });
                });
            }

            fetch('/api/jarvis/training-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    sessionId: `memory_${Date.now()}`,
                    gameId: 'memory-matrix',
                    gameName: 'Memory Matrix',
                    category: currentScenario?.position || 'PREFLOP',
                    level: currentLevel,
                    questionsAnswered: Object.keys(currentScenario?.solution || {}).length,
                    questionsCorrect: result.correctHands?.length || 0,
                    accuracy: result.score,
                    streak: consecutivePasses,
                    timeSpentSeconds: timeTaken,
                    answers: answersData,
                    leaksDetected: []
                })
            }).then(res => res.json()).then(jarvisResult => {
            }).catch(err => {
            });
        }

        setMode('result');
    };

    // Update combo display
    const updateComboDisplay = (comboCount) => {
        let name = null;
        let mult = 1;

        if (comboCount >= 20) { name = ' LEGENDARY!'; mult = 3.0; }
        else if (comboCount >= 15) { name = 'UNSTOPPABLE!'; mult = 2.5; }
        else if (comboCount >= 10) { name = '++ ON FIRE!'; mult = 2.0; }
        else if (comboCount >= 7) { name = ' DOMINATING!'; mult = 1.7; }
        else if (comboCount >= 5) { name = ' HOT STREAK!'; mult = 1.5; }
        else if (comboCount >= 3) { name = 'NICE!'; mult = 1.2; }

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

    // Fetch Jarvis explanation for a hand (with GTO panel image)
    const fetchJarvisExplanation = async (hand, correctAction, userAction) => {
        setExplainModal({
            show: true,
            hand,
            correctAction,
            userAction,
            explanation: null,
            panelImageUrl: null,
            loading: true
        });

        try {
            // Fetch both explanation AND GTO panel image in parallel
            const [explainResponse, panelResponse] = await Promise.all([
                fetch('/api/gto/explain-hand', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hand,
                        position: currentScenario?.position,
                        stackDepth: currentScenario?.stackDepth,
                        correctAction,
                        userAction,
                        scenario: currentScenario
                    })
                }),
                fetch('/api/gto/render-analysis-card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: correctAction,
                        frequency: 100,
                        explanation: `${correctAction.toUpperCase()} with ${hand} is the correct play in this spot.`,
                        gtoApproach: currentScenario?.tip || 'Follow solver-approved strategies.',
                        evAnalysis: '+EV',
                        alternateLines: []
                    })
                }).catch(() => null) // Fallback if panel generation fails
            ]);

            const explainResult = await explainResponse.json();
            const panelResult = panelResponse ? await panelResponse.json().catch(() => null) : null;

            setExplainModal(prev => ({
                ...prev,
                explanation: explainResult.explanation || 'Unable to generate explanation.',
                panelImageUrl: panelResult?.imageUrl || null,
                loading: false
            }));
        } catch (error) {
            console.error('[MemoryGames] Explain error:', error);
            setExplainModal(prev => ({
                ...prev,
                explanation: 'Failed to get explanation. Please try again.',
                panelImageUrl: null,
                loading: false
            }));
        }
    };

    // Fetch Jarvis post-game analysis
    const fetchCoachAnalysis = async (gradeResult) => {
        if (!gradeResult) return;

        // Build mistakes array
        const mistakes = [];

        // Wrong action hands
        if (gradeResult.wrongActionHands) {
            gradeResult.wrongActionHands.forEach(hand => {
                mistakes.push({
                    hand,
                    userAction: userGrid[hand] || 'fold',
                    correctAction: currentScenario?.solution?.[hand] || 'raise'
                });
            });
        }

        // Missed hands (should have selected but didn't)
        if (gradeResult.missedHands) {
            gradeResult.missedHands.forEach(hand => {
                mistakes.push({
                    hand,
                    userAction: 'fold',
                    correctAction: currentScenario?.solution?.[hand] || 'raise'
                });
            });
        }

        setCoachAnalysis({
            show: true,
            loading: true,
            analysis: null
        });

        try {
            const response = await fetch('/api/gto/analyze-game', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mistakes,
                    scenario: currentScenario,
                    finalScore: gradeResult.score,
                    position: currentScenario?.position,
                    stackDepth: currentScenario?.stackDepth
                })
            });

            const result = await response.json();

            setCoachAnalysis({
                show: true,
                loading: false,
                analysis: result.analysis
            });
        } catch (error) {
            console.error('[MemoryGames] Coach analysis error:', error);
            setCoachAnalysis({
                show: true,
                loading: false,
                analysis: {
                    summary: "Great effort! Review your mistakes to improve.",
                    patternInsights: [],
                    recommendations: ["Practice this scenario again"]
                }
            });
        }
    };

    // Fetch user's weak spots for adaptive training
    const fetchWeakSpots = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!userId) return;

        try {
            const response = await fetch(`/api/gto/get-weak-spots?userId=${userId}`);
            const result = await response.json();

            if (result.success && result.weakSpots) {
                setWeakSpots(result.weakSpots);
            }
        } catch (error) {
            console.error('[MemoryGames] Fetch weak spots error:', error);
        }
    };

    // Start adaptive training targeting weaknesses
    const startAdaptiveTraining = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!userId) return;

        setAdaptiveLoading(true);

        try {
            const response = await fetch('/api/gto/generate-adaptive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            const result = await response.json();

            if (result.success && result.scenario) {
                // Load the adaptive scenario
                setCurrentScenario(result.scenario);
                setGameState('playing');
                setUserGrid({});
                setGradeResult(null);
                setCoachAnalysis({ show: false, loading: false, analysis: null });
            }
        } catch (error) {
            console.error('[MemoryGames] Adaptive training error:', error);
        } finally {
            setAdaptiveLoading(false);
        }
    };

    // Fetch lobby suggestions for proactive learning
    const fetchLobbySuggestions = async () => {
        const controller = new AbortController();
        const { signal } = controller;
        if (!userId) return;

        try {
            const response = await fetch(`/api/gto/lobby-suggestions?userId=${userId}`);
            const result = await response.json();

            if (result.success && result.suggestions) {
                setLobbySuggestions(result.suggestions);
            }
        } catch (error) {
            console.error('[MemoryGames] Lobby suggestions error:', error);
        }
    };

    // Fetch weak spots and suggestions on mount when user is available
    useEffect(() => {
        if (userId && mode === 'menu') {
            fetchWeakSpots();
            fetchLobbySuggestions();
        }
    }, [userId, mode]);

    // Load leaderboard data

    const loadLeaderboard = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        setLeaderboardLoading(true);
        try {
            // Initialize service with supabase client if not done
            if (supabase.current) {
                await leaderboardService.initialize(supabase.current);
            }

            const result = await leaderboardService.getLeaderboard(leaderboardMode, null, 50);
            if (result.success) {
                setLeaderboardData(result.leaderboard);
            }

            // Get user rank if logged in
            if (userId) {
                const rankResult = await leaderboardService.getUserRank(userId, leaderboardMode, null);
                if (rankResult.success) {
                    setUserRank(rankResult);
                }
            }
        } catch (error) {
            console.error('[MemoryGames] Failed to load leaderboard:', error);
        } finally {
            setLeaderboardLoading(false);
        }
    }, [leaderboardMode, userId]);

    // Load daily challenge data
    const loadDailyChallenge = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        setChallengeLoading(true);
        try {
            // Initialize service with supabase client if not done
            if (supabase.current) {
                await dailyChallengeService.initialize(supabase.current);
            }

            const result = await dailyChallengeService.getTodaysChallenge();
            if (result.success && result.challenge) {
                // Parse scenario from scenario_id JSON string
                let challenge = { ...result.challenge };
                if (challenge.scenario_id && typeof challenge.scenario_id === 'string') {
                    try {
                        const scenario = JSON.parse(challenge.scenario_id);
                        // Merge scenario properties into challenge object
                        challenge = {
                            ...challenge,
                            title: scenario.title || challenge.title,
                            description: scenario.description || challenge.description,
                            tip: scenario.tip,
                            solution: scenario.solution,
                            position: scenario.position,
                            stackDepth: scenario.stackDepth,
                            scenario: scenario // Keep full scenario for gameplay
                        };
                    } catch (e) {
                    }
                }
                setDailyChallenge(challenge);
                setChallengeCompleted(result.completed);
            }

            // Get user streak if logged in
            if (userId) {
                const streakResult = await dailyChallengeService.getUserStreak(userId);
                if (streakResult.success) {
                    setUserStreak(streakResult.streak);
                }
            }
        } catch (error) {
            console.error('[MemoryGames] Failed to load daily challenge:', error);
        } finally {
            setChallengeLoading(false);
        }
    }, [userId]);

    // Submit score to leaderboard after game ends
    const submitToLeaderboard = useCallback(async (gameMode, level, score, accuracy, timeTaken) => {
        if (!userId) return; // Only logged-in users

        try {
            if (supabase.current) {
                await leaderboardService.initialize(supabase.current);
            }

            const sessionId = crypto.randomUUID();
            const result = await leaderboardService.updateLeaderboard(
                userId, gameMode, level, score, accuracy, timeTaken, sessionId
            );

            if (result.new_record) {
                // Show celebration for new record
                SoundEngine.play('levelUp');
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }

            return result;
        } catch (error) {
            console.error('[MemoryGames] Failed to submit score:', error);
        }
    }, [userId]);

    // Handle VIP upgrade - initiate Stripe checkout for VIP subscription
    const handleVipUpgrade = useCallback(async () => {
        const controller = new AbortController();
        const { signal } = controller;
        // Check if user is logged in
        if (!userId) {
            alert('Please log in to upgrade to VIP!');
            return;
        }

        try {
            // Get auth token for API call
            const session = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
            if (!session?.access_token) {
                alert('Please log in to upgrade to VIP!');
                return;
            }

            // Call checkout session API
            const response = await fetch('/api/store/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    type: 'subscription',
                    items: [{
                        name: 'Memory Matrix VIP',
                        tier: 'vip',
                        priceId: process.env.NEXT_PUBLIC_STRIPE_VIP_PRICE_ID || 'price_vip_monthly' // Configured in Stripe dashboard
                    }],
                    successUrl: `${window.location.origin}/hub/memory-games?vip_success=true`,
                    cancelUrl: `${window.location.origin}/hub/memory-games?vip_canceled=true`
                })
            });

            const result = await response.json();

            if (result.success && result.data?.url) {
                // Redirect to Stripe checkout
                window.location.href = result.data.url;
            } else {
                // Handle error - show helpful message
                if (result.error?.code === 'PAYMENTS_NOT_CONFIGURED') {
                    alert('VIP subscriptions coming soon! Payment processing is being set up.');
                } else {
                    alert(result.error?.message || 'Failed to start checkout. Please try again.');
                }
            }
        } catch (error) {
            console.error('[MemoryGames] VIP upgrade error:', error);
            alert('Something went wrong. Please try again later.');
        }
    }, [userId]);

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
            {/*  INTRO VIDEO OVERLAY - Plays while page loads behind it */}
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
                        onPlay={handleIntroPlay}
                        onEnded={handleIntroEnd}
                        onError={handleIntroEnd}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain'
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
            <SEOHead
                title="Poker Memory Games — Train Your Brain"
                description="Sharpen Your Poker Cognitive Skills With Memory Matrix Games. Train Pattern Recognition, Recall Speed, And Mental Agility."
                canonical="/hub/memory-games"
            >
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

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
                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

                {/* Per-game cost popup (one-time) */}
                {userId && !isVIP && (
                    <GameCostPopup userId={userId} featureKey="memory_games" isVip={isVIP} cost={10} />
                )}

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

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
                                <div style={styles.orbIcon}></div>
                                <h1 style={styles.title}>MEMORY MATRIX</h1>
                                <p style={styles.subtitle}>
                                    Master GTO ranges through high-pressure video game training
                                </p>
                                <div style={styles.costInfo}>
                                    {isVIP ? 'VIP: Unlimited Access' : `💎 ${GAME_COST} Diamonds per game`}
                                </div>
                            </div>

                            {/* Daily Challenge Card */}
                            <DailyChallengeCard
                                challenge={dailyChallenge}
                                streak={userStreak}
                                completed={challengeCompleted}
                                loading={challengeLoading}
                                onPlay={() => {
                                    if (dailyChallenge) {
                                        setCurrentLevel(dailyChallenge.level || 1);
                                        startGame(dailyChallenge.level || 1);
                                    }
                                }}
                            />

                            {/* Smart Practice Card - Adaptive Training */}
                            {userId && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    borderRadius: 16,
                                    padding: 20,
                                    marginBottom: 20
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                        <span style={{ fontSize: 20, fontWeight: 'bold', color: '#10B981' }}>J</span>
                                        <span style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#10B981' }}>
                                            Smart Practice
                                        </span>
                                    </div>

                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                                        Jarvis analyzes your history and creates personalized training.
                                    </p>

                                    {/* Weak Spots Display */}
                                    {weakSpots.length > 0 && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 12, color: '#06B6D4', marginBottom: 8 }}>
                                                Areas to Improve:
                                            </div>
                                            {weakSpots.slice(0, 2).map((spot, i) => (
                                                <div key={i} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: 'rgba(0, 0, 0, 0.2)',
                                                    borderRadius: 8,
                                                    padding: '8px 12px',
                                                    marginBottom: 6,
                                                    fontSize: 13
                                                }}>
                                                    <span style={{ color: '#FFD700' }}>{spot.area}</span>
                                                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                                                        {spot.errorCount} errors
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={startAdaptiveTraining}
                                        disabled={adaptiveLoading}
                                        style={{
                                            width: '100%',
                                            padding: '12px 20px',
                                            background: adaptiveLoading
                                                ? 'rgba(16, 185, 129, 0.3)'
                                                : 'linear-gradient(135deg, #10B981, #06B6D4)',
                                            border: 'none',
                                            borderRadius: 12,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: adaptiveLoading ? 'wait' : 'pointer',
                                            opacity: adaptiveLoading ? 0.7 : 1
                                        }}
                                    >
                                        {adaptiveLoading ? 'Generating...' : weakSpots.length > 0
                                            ? `Train ${weakSpots[0]?.area}`
                                            : 'Start Smart Practice'}
                                    </button>
                                </div>
                            )}

                            {/* Jarvis Suggestions Panel */}
                            {userId && lobbySuggestions.length > 0 && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(236, 72, 153, 0.12))',
                                    border: '1px solid rgba(139, 92, 246, 0.25)',
                                    borderRadius: 16,
                                    padding: 16,
                                    marginBottom: 20
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <span style={{ fontSize: 14, color: '#A78BFA' }}>Jarvis Suggests</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {lobbySuggestions.map((suggestion, i) => (
                                            <div
                                                key={i}
                                                onClick={() => {
                                                    if (suggestion.actionType === 'daily_challenge') {
                                                        // Start daily challenge
                                                        startDailyChallenge && startDailyChallenge();
                                                    } else if (suggestion.actionType === 'start_level') {
                                                        // Start specific level
                                                        const levelData = LEVEL_CONFIGS.find(l => l.id === suggestion.levelId);
                                                        if (levelData) selectLevel(levelData);
                                                    } else if (suggestion.actionType === 'adaptive_training') {
                                                        startAdaptiveTraining();
                                                    }
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: 'rgba(0, 0, 0, 0.25)',
                                                    borderRadius: 10,
                                                    padding: '10px 14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                                                    {suggestion.message}
                                                </span>
                                                <span style={{
                                                    fontSize: 11,
                                                    color: '#8B5CF6',
                                                    fontWeight: 600,
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {suggestion.action}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Game Mode Tabs */}
                            <div style={styles.gameModeTabs}>
                                <button
                                    onClick={() => setGameType('range')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'range' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    Range
                                </button>
                                <button
                                    onClick={() => setGameType('speed')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'speed' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    ++ Speed
                                </button>
                                <button
                                    onClick={() => setGameType('pressure')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'pressure' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    Pressure
                                </button>
                                <button
                                    onClick={() => setGameType('pattern')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'pattern' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    Pattern Pattern
                                </button>
                                <button
                                    onClick={() => setGameType('mixed')}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'mixed' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    Mix Mixed
                                </button>
                                <button
                                    onClick={() => router.push('/hub/memory-games')}
                                    style={{
                                        ...styles.gameModeTab,
                                        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 140, 0, 0.2))',
                                        border: '2px solid rgba(255, 215, 0, 0.5)',
                                        color: '#FFD700',
                                    }}
                                >
                                    Trophy Campaign
                                </button>
                                <button
                                    onClick={() => {
                                        setGameType('leaderboard');
                                        loadLeaderboard();
                                    }}
                                    style={{
                                        ...styles.gameModeTab,
                                        ...(gameType === 'leaderboard' ? styles.gameModeTabActive : {}),
                                    }}
                                >
                                    Rankings
                                </button>
                                <button
                                    onClick={() => {
                                        setGameType('daily');
                                        loadDailyChallenge();
                                    }}
                                    style={{
                                        ...styles.gameModeTab,
                                        background: gameType === 'daily' ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 212, 255, 0.2))' : 'rgba(255, 255, 255, 0.05)',
                                        border: gameType === 'daily' ? '2px solid #00ff88' : '2px solid rgba(255, 255, 255, 0.1)',
                                        color: gameType === 'daily' ? '#00ff88' : 'rgba(255, 255, 255, 0.5)',
                                    }}
                                >
                                    Daily
                                </button>
                                <button
                                    onClick={() => setGameType('spot')}
                                    style={{
                                        ...styles.gameModeTab,
                                        background: gameType === 'spot' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                        border: gameType === 'spot' ? '2px solid #F97316' : '2px solid rgba(255, 255, 255, 0.1)',
                                        color: gameType === 'spot' ? '#F97316' : 'rgba(255, 255, 255, 0.5)',
                                    }}
                                >
                                    Spot
                                </button>
                                <button
                                    onClick={() => setGameType('tournament')}
                                    style={{
                                        ...styles.gameModeTab,
                                        background: gameType === 'tournament' ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                        border: gameType === 'tournament' ? '2px solid #EC4899' : '2px solid rgba(255, 255, 255, 0.1)',
                                        color: gameType === 'tournament' ? '#EC4899' : 'rgba(255, 255, 255, 0.5)',
                                    }}
                                >
                                    VS Ranked
                                </button>
                            </div>

                            {/* Speed Drill Mode */}
                            {gameType === 'speed' && (
                                <div style={styles.speedDrillCard}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>++</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#FFD700', marginBottom: 8 }}>
                                        SPEED DRILL
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Flash a hand → Pick the action → Build streaks!<br />
                                        Time gets shorter the better you do. 3 lives, don't lose them!
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    setShowOutOfDiamondsModal(true);
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
                                    <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#ff4444', marginBottom: 8 }}>
                                        PRESSURE COOKER
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Answer 10 hands before the clock runs out!<br />
                                        Correct = +3 seconds | ✗ Wrong = -5 seconds<br />
                                        <span style={{ color: '#ff4444' }}>Can You Defuse The Bomb? 💣</span>
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    setShowOutOfDiamondsModal(true);
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
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>Pattern</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#00D4FF', marginBottom: 8 }}>
                                        PATTERN RECOGNITION
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        See a partial range → Identify the dominant action!<br />
                                        Is it a RAISING, CALLING, or FOLDING range?<br />
                                        Train your GTO intuition across 8 patterns.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    setShowOutOfDiamondsModal(true);
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
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>Mix</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#A855F7', marginBottom: 8 }}>
                                        MIXED STRATEGY
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Dial in the exact frequency for complex GTO spots.<br />
                                        Should you Raise 30% or 70%? Improve your feel.<br />
                                        10 Rounds of high-precision training.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    setShowOutOfDiamondsModal(true);
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

                            {/* Spot Trainer Mode */}
                            {gameType === 'spot' && (
                                <div style={{
                                    ...styles.speedDrillCard,
                                    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(234, 88, 12, 0.1))',
                                    border: '2px solid rgba(249, 115, 22, 0.3)',
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>◎</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#F97316', marginBottom: 8 }}>
                                        SPOT TRAINER
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Play through entire hand trees from preflop to river!<br />
                                        Learn how ranges evolve on each street.<br />
                                        Compare your EV to optimal GTO play.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    setShowOutOfDiamondsModal(true);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('spot-trainer');
                                        }}
                                        style={{
                                            ...styles.speedDrillButton,
                                            background: 'linear-gradient(135deg, #F97316, #EA580C)',
                                        }}
                                    >
                                        START SPOT TRAINER
                                    </button>
                                </div>
                            )}

                            {/* Tournament Mode */}
                            {gameType === 'tournament' && (
                                <div style={{
                                    ...styles.speedDrillCard,
                                    background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(219, 39, 119, 0.1))',
                                    border: '2px solid rgba(236, 72, 153, 0.3)',
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>⬡</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#EC4899', marginBottom: 8 }}>
                                        VS RANKED
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Head-to-head GTO challenges for ELO ranking!<br />
                                        Beat simulated opponents to climb the ladder.<br />
                                        <span style={{ color: '#EC4899' }}>Win Diamonds & Bragging Rights!</span>
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    setShowOutOfDiamondsModal(true);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('tournament');
                                        }}
                                        style={{
                                            ...styles.speedDrillButton,
                                            background: 'linear-gradient(135deg, #EC4899, #DB2777)',
                                        }}
                                    >
                                        ENTER RANKED BATTLE
                                    </button>
                                </div>
                            )}

                            {/* Leaderboard Section */}
                            {gameType === 'leaderboard' && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.05), rgba(255, 140, 0, 0.05))',
                                    border: '2px solid rgba(255, 215, 0, 0.3)',
                                    borderRadius: 20,
                                    padding: 24,
                                    maxWidth: 800,
                                    margin: '0 auto',
                                }}>
                                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                                        <div style={{ fontSize: 48, marginBottom: 12 }}>Trophy</div>
                                        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#FFD700', marginBottom: 8 }}>
                                            GLOBAL LEADERBOARD
                                        </h2>
                                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                                            Compete with players worldwide. Top scores win prizes!
                                        </p>
                                    </div>

                                    {/* Mode Toggle */}
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'range-memory', label: ' Range', color: '#00D4FF' },
                                            { id: 'speed-drill', label: '++ Speed', color: '#FFD700' },
                                            { id: 'pressure-cooker', label: ' Pressure', color: '#ff4444' },
                                            { id: 'pattern-recognition', label: 'Pattern Pattern', color: '#00D4FF' },
                                            { id: 'mixed-strategy', label: 'Mix Mixed', color: '#A855F7' },
                                        ].map(mode => (
                                            <button
                                                key={mode.id}
                                                onClick={() => {
                                                    setLeaderboardMode(mode.id);
                                                    loadLeaderboard();
                                                }}
                                                style={{
                                                    padding: '8px 16px',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    background: leaderboardMode === mode.id ? `${mode.color}22` : 'rgba(0,0,0,0.3)',
                                                    border: `2px solid ${leaderboardMode === mode.id ? mode.color : 'rgba(255,255,255,0.1)'}`,
                                                    borderRadius: 20,
                                                    color: leaderboardMode === mode.id ? mode.color : 'rgba(255,255,255,0.5)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {mode.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* User Rank Display */}
                                    {userRank && (
                                        <div style={{
                                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(138, 43, 226, 0.15))',
                                            border: '2px solid #00D4FF',
                                            borderRadius: 12,
                                            padding: 16,
                                            marginBottom: 20,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>YOUR RANK</div>
                                                <div style={{ fontSize: 32, fontWeight: 900, color: '#00D4FF' }}>#{userRank.rank || '—'}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>BEST SCORE</div>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{userRank.score || 0}</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Leaderboard Table */}
                                    <div style={{
                                        background: 'rgba(0,0,0,0.4)',
                                        borderRadius: 12,
                                        overflow: 'hidden',
                                        maxHeight: 400,
                                        overflowY: 'auto',
                                    }}>
                                        {leaderboardLoading ? (
                                            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                                                Loading rankings...
                                            </div>
                                        ) : leaderboardData.length === 0 ? (
                                            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                                <div style={{ fontSize: 32, marginBottom: 12 }}></div>
                                                No rankings yet. Be the first!
                                            </div>
                                        ) : (
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'rgba(255,215,0,0.1)' }}>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>RANK</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'left', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>PLAYER</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>SCORE</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right', color: '#FFD700', fontSize: 12, fontWeight: 600 }}>STREAK</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {leaderboardData.map((entry, idx) => (
                                                        <tr
                                                            key={entry.user_id}
                                                            style={{
                                                                background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                            }}
                                                        >
                                                            <td style={{ padding: '12px 16px', color: idx < 3 ? '#FFD700' : '#fff', fontSize: 14, fontWeight: idx < 3 ? 700 : 400 }}>
                                                                {idx === 0 ? '' : idx === 1 ? '' : idx === 2 ? '' : `#${idx + 1}`}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#fff', fontSize: 14 }}>
                                                                {entry.display_name || 'Anonymous'}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#00ff88', fontSize: 14, fontWeight: 600, textAlign: 'right' }}>
                                                                {entry.score?.toLocaleString()}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#FF6B00', fontSize: 14, textAlign: 'right' }}>
                                                                {entry.streak || 0}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                    {/* Refresh Button */}
                                    <div style={{ textAlign: 'center', marginTop: 20 }}>
                                        <button
                                            onClick={loadLeaderboard}
                                            disabled={leaderboardLoading}
                                            style={{
                                                padding: '12px 32px',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: 30,
                                                color: '#fff',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            🔄 Refresh Rankings
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Daily Challenge Section */}
                            {gameType === 'daily' && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.05), rgba(0, 212, 255, 0.05))',
                                    border: '2px solid rgba(0, 255, 136, 0.3)',
                                    borderRadius: 20,
                                    padding: 24,
                                    maxWidth: 600,
                                    margin: '0 auto',
                                }}>
                                    {/* Streak Display */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: 32,
                                        marginBottom: 24,
                                    }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 48, marginBottom: 4 }}></div>
                                            <div style={{ fontSize: 32, fontWeight: 900, color: '#FF6B00' }}>{userStreak.current_streak || 0}</div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Current Streak</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 48, marginBottom: 4 }}></div>
                                            <div style={{ fontSize: 32, fontWeight: 900, color: '#FFD700' }}>{userStreak.longest_streak || 0}</div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Best Streak</div>
                                        </div>
                                    </div>

                                    {/* Challenge Card */}
                                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                                        <div style={{ fontSize: 48, marginBottom: 12 }}>◉</div>
                                        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#00ff88', marginBottom: 8 }}>
                                            DAILY CHALLENGE
                                        </h2>
                                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
                                            Complete today's challenge to keep your streak alive!
                                        </p>
                                    </div>

                                    {challengeLoading ? (
                                        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                                            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                                            Loading today's challenge...
                                        </div>
                                    ) : challengeCompleted ? (
                                        <div style={{
                                            background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 212, 255, 0.2))',
                                            border: '2px solid #00ff88',
                                            borderRadius: 16,
                                            padding: 32,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 64, marginBottom: 16, color: '#00ff88' }}>✓</div>
                                            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#00ff88', marginBottom: 8 }}>
                                                CHALLENGE COMPLETE!
                                            </h3>
                                            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                                                Come back tomorrow for a new challenge!
                                            </p>
                                            <div style={{ marginTop: 20, fontSize: 18, color: '#FFD700' }}>
                                                +{dailyChallenge?.diamond_reward || 50} Diamonds Earned!
                                            </div>
                                        </div>
                                    ) : dailyChallenge ? (
                                        <div style={{
                                            background: 'rgba(0,0,0,0.4)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 16,
                                            padding: 24,
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 16,
                                                marginBottom: 16,
                                                padding: '12px 16px',
                                                background: 'rgba(0, 255, 136, 0.1)',
                                                borderRadius: 12,
                                            }}>
                                                <div style={{ fontSize: 32 }}>
                                                    {dailyChallenge.game_mode === 'range-memory' ? '' :
                                                        dailyChallenge.game_mode === 'speed-drill' ? '++' :
                                                            dailyChallenge.game_mode === 'pressure-cooker' ? '' :
                                                                dailyChallenge.game_mode === 'pattern-recognition' ? 'Pattern' : 'Mix'}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                                                        {dailyChallenge.title || 'Today\'s Challenge'}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                                        Level {dailyChallenge.level || 1} • {dailyChallenge.game_mode?.replace('-', ' ').toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>

                                            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                                {dailyChallenge.description || `Score ${dailyChallenge.target_accuracy || 80}% or higher to complete the challenge.`}
                                            </p>

                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                padding: '12px 16px',
                                                background: 'rgba(255,215,0,0.1)',
                                                borderRadius: 12,
                                                marginBottom: 20,
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>TARGET SCORE</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#00ff88' }}>{dailyChallenge.target_accuracy || 80}%</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>REWARD</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#FFD700' }}>{dailyChallenge.diamond_reward || 50}Diamonds</div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    // Start the challenge based on game mode
                                                    const mode = dailyChallenge.game_mode;
                                                    if (mode === 'range-memory') {
                                                        startGame(dailyChallenge.level || 1);
                                                    } else if (mode === 'speed-drill') {
                                                        setMode('speed-drill');
                                                    } else if (mode === 'pressure-cooker') {
                                                        setMode('pressure-cooker');
                                                    } else if (mode === 'pattern-recognition') {
                                                        setMode('pattern-recognition');
                                                    } else if (mode === 'mixed-strategy') {
                                                        setMode('mixed-strategy');
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '16px 32px',
                                                    fontSize: 18,
                                                    fontWeight: 700,
                                                    background: 'linear-gradient(135deg, #00ff88, #00D4FF)',
                                                    color: '#000',
                                                    border: 'none',
                                                    borderRadius: 50,
                                                    cursor: 'pointer',
                                                    boxShadow: '0 0 30px rgba(0, 255, 136, 0.4)',
                                                }}
                                            >
                                                START DAILY CHALLENGE
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: 'rgba(255,165,0,0.1)',
                                            border: '1px solid rgba(255,165,0,0.3)',
                                            borderRadius: 16,
                                            padding: 32,
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#FFA500', marginBottom: 8 }}>
                                                No Challenge Available
                                            </h3>
                                            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                                                Check back soon for today's challenge!
                                            </p>
                                        </div>
                                    )}

                                    {/* Streak Rewards Info */}
                                    <div style={{
                                        marginTop: 24,
                                        padding: 16,
                                        background: 'rgba(0,0,0,0.3)',
                                        borderRadius: 12,
                                        textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#FFD700', marginBottom: 8 }}>
                                            STREAK REWARDS
                                        </div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                                            7 days: +100Diamonds bonus • 30 days: +500Diamonds bonus • 100 days: +2000Diamonds bonus
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Spot Trainer Mode */}
                            {gameType === 'spot' && (
                                <div style={{
                                    ...styles.speedDrillCard,
                                    background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(234, 88, 12, 0.1))',
                                    border: '2px solid rgba(249, 115, 22, 0.3)',
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#F97316', marginBottom: 8 }}>
                                        SPOT TRAINER
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Full hand trees from preflop to river.<br />
                                        Multi-street decision training with EV comparison.<br />
                                        Learn to navigate complex spots optimally.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    alert(`Not enough diamonds!`);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('spot-trainer');
                                        }}
                                        style={{
                                            ...styles.speedDrillButton,
                                            background: 'linear-gradient(135deg, #F97316, #EA580C)',
                                        }}
                                    >
                                        START SPOT TRAINING
                                    </button>
                                </div>
                            )}

                            {/* Tournament Mode */}
                            {gameType === 'tournament' && (
                                <div style={{
                                    ...styles.speedDrillCard,
                                    background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1), rgba(219, 39, 119, 0.1))',
                                    border: '2px solid rgba(236, 72, 153, 0.3)',
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>VS</div>
                                    <h2 style={{ fontSize: 24, fontWeight: 700, color: '#EC4899', marginBottom: 8 }}>
                                        RANKED BATTLES
                                    </h2>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 20 }}>
                                        Competitive ELO-ranked range battles.<br />
                                        Climb the ladder from Beginner to Grandmaster.<br />
                                        Earn diamonds and prove your skills!
                                    </p>
                                    <button
                                        onClick={async () => {
                                            if (!isVIP) {
                                                const result = await DiamondEngine.deduct(GAME_COST);
                                                if (!result.success) {
                                                    alert(`Not enough diamonds!`);
                                                    return;
                                                }
                                                setDiamondBalance(result.balance);
                                            }
                                            setMode('tournament-mode');
                                        }}
                                        style={{
                                            ...styles.speedDrillButton,
                                            background: 'linear-gradient(135deg, #EC4899, #DB2777)',
                                        }}
                                    >
                                        Trophy ENTER RANKED MODE
                                    </button>
                                </div>
                            )}

                            {/* Level Grid - Only show for Range Memory */}
                            {gameType === 'range' && (
                                <>
                                    {/* Filter Toggle Button + AI Generation Toggle */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h3 style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.8)' }}>
                                            Select a Level
                                        </h3>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {/* AI Generation Toggle (VIP Feature) */}
                                            <button
                                                onClick={() => setUseAIGeneration(!useAIGeneration)}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: useAIGeneration ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                                                    border: useAIGeneration ? '1px solid #FFD700' : '1px solid rgba(255, 255, 255, 0.2)',
                                                    borderRadius: 20,
                                                    color: useAIGeneration ? '#FFD700' : 'rgba(255, 255, 255, 0.7)',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}
                                                title="Generate Unique Scenarios Using Jarvis AI"
                                            >
                                                {useAIGeneration ? 'AI ON' : 'AI Mode'}
                                            </button>

                                            {/* Filter Toggle */}
                                            <button
                                                onClick={() => setShowFilters(!showFilters)}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: showFilters ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                                                    border: showFilters ? '1px solid #00D4FF' : '1px solid rgba(255, 255, 255, 0.2)',
                                                    borderRadius: 20,
                                                    color: showFilters ? '#00D4FF' : 'rgba(255, 255, 255, 0.7)',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}
                                            >
                                                🔍 {showFilters ? 'Hide Filters' : 'Filter Scenarios'}
                                                {Object.keys(scenarioFilters).filter(k => scenarioFilters[k]).length > 0 && (
                                                    <span style={{
                                                        background: '#00D4FF',
                                                        color: '#000',
                                                        padding: '2px 6px',
                                                        borderRadius: 10,
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                    }}>
                                                        {Object.keys(scenarioFilters).filter(k => scenarioFilters[k]).length}
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Filter Panel */}
                                    {showFilters && (
                                        <ScenarioFilterPanel
                                            onFilterChange={(filters) => {
                                                setScenarioFilters(filters);
                                            }}
                                            onClose={() => setShowFilters(false)}
                                            currentFilters={scenarioFilters}
                                            availableScenarios={(() => {
                                                const allScenarios = [
                                                    ...LEVEL_1_SCENARIOS,
                                                    ...LEVEL_2_SCENARIOS,
                                                    ...LEVEL_3_SCENARIOS,
                                                    ...LEVEL_4_SCENARIOS,
                                                    ...LEVEL_5_SCENARIOS,
                                                    ...LEVEL_6_SCENARIOS,
                                                    ...LEVEL_7_SCENARIOS,
                                                    ...LEVEL_8_SCENARIOS,
                                                    ...LEVEL_9_SCENARIOS,
                                                    ...LEVEL_10_SCENARIOS,
                                                ];
                                                return allScenarios.length;
                                            })()}
                                            filteredCount={(() => {
                                                const allScenarios = [
                                                    ...LEVEL_1_SCENARIOS,
                                                    ...LEVEL_2_SCENARIOS,
                                                    ...LEVEL_3_SCENARIOS,
                                                    ...LEVEL_4_SCENARIOS,
                                                    ...LEVEL_5_SCENARIOS,
                                                    ...LEVEL_6_SCENARIOS,
                                                    ...LEVEL_7_SCENARIOS,
                                                    ...LEVEL_8_SCENARIOS,
                                                    ...LEVEL_9_SCENARIOS,
                                                    ...LEVEL_10_SCENARIOS,
                                                ];
                                                return filterScenarios(allScenarios, scenarioFilters).length;
                                            })()}
                                        />
                                    )}

                                    <div style={styles.levelGrid}>
                                        {LEVELS.map((level, idx) => {
                                            const scenarioCount = getLevelScenarios(level.level);
                                            const levelConfig = getLevelConfig(level.level) || { timer: 90, gridSize: 13, maxHands: 20, xpMultiplier: 1 };
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
                                                        <span> {levelConfig.timer}s</span>
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
                                    <div style={styles.vipTitle}> GO VIP — $19.99/month</div>
                                    <div style={styles.vipFeatures}>
                                        Unlimited games • All levels • No diamond cost • Exclusive modes
                                    </div>
                                    <button style={styles.vipButton} onClick={handleVipUpgrade}>
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
                            userId={userId}
                        />
                    )}

                    {/* Pressure Cooker Mode - Full Implementation */}
                    {mode === 'pressure-cooker' && (
                        <PressureCookerGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Pattern Recognition Mode - Full Implementation */}
                    {mode === 'pattern-recognition' && (
                        <PatternRecognitionGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Mixed Strategy Mode - Full Implementation */}
                    {mode === 'mixed-strategy' && (
                        <MixedStrategyGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Spot Trainer Mode - Full Implementation */}
                    {mode === 'spot-trainer' && (
                        <SpotTrainerGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Tournament Mode - Full Implementation */}
                    {mode === 'tournament' && (
                        <TournamentModeGame
                            level={currentLevel}
                            onExit={() => setMode('menu')}
                            onScoreUpdate={(newBalance) => setDiamondBalance(newBalance)}
                            DiamondEngine={DiamondEngine}
                            userId={userId}
                        />
                    )}

                    {/* Out of Diamonds Modal */}
                    <OutOfDiamondsModal
                        isOpen={showOutOfDiamondsModal}
                        onClose={() => setShowOutOfDiamondsModal(false)}
                        gameCost={GAME_COST}
                        isVIP={isVIP}
                    />

                    {/* AI Generation Loading Overlay */}
                    {aiGenerating && (
                        <div style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.85)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 9999,
                        }}>
                            <div style={{
                                fontSize: 48,
                                marginBottom: 20,
                                animation: 'pulse 1.5s infinite',
                            }}>
                                ◈
                            </div>
                            <div style={{
                                fontSize: 20,
                                fontWeight: 600,
                                color: '#FFD700',
                                marginBottom: 10,
                            }}>
                                Jarvis is generating your scenario...
                            </div>
                            <div style={{
                                fontSize: 14,
                                color: 'rgba(255, 255, 255, 0.6)',
                            }}>
                                Creating a unique, solver-accurate training challenge
                            </div>
                            <style>{`
                                @keyframes pulse {
                                    0%, 100% { transform: scale(1); }
                                    50% { transform: scale(1.15); }
                                }
                            `}</style>
                        </div>
                    )}

                    {(mode === 'game' || mode === 'result') && currentScenario && (
                        <>
                            {/* Timer Bar */}
                            <div style={styles.timerContainer}>
                                <div
                                    style={{
                                        ...styles.timerBar,
                                        width: `${(timeRemaining / safeLevelConfig.timer) * 100}%`,
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
                                    <div style={styles.levelBadge}>Level {currentLevel} •  {safeLevelConfig.timer}s</div>
                                    <h2 style={styles.scenarioTitle}>{currentScenario.title}</h2>
                                    <p style={styles.scenarioDesc}>{currentScenario.description}</p>
                                    {currentScenario.tip && !gradeResult && (
                                        <p style={styles.tipText}> {currentScenario.tip}</p>
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
                                            {gradeResult.score >= 85 ? ' PASSED' : '✗ FAILED'}
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
                                            <span style={{ color: '#00ff88' }}> Correct</span>
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
                                            Diamonds +{lastReward.diamonds} Diamonds earned! (×{multiplier} multiplier)
                                        </div>
                                    )}

                                    {/* Ask Jarvis Why Button - shows when there are mistakes */}
                                    {(gradeResult.missedHands.length > 0 || gradeResult.wrongActionHands.length > 0) && (<>
                                        <button
                                            onClick={() => {
                                                const firstMistake = gradeResult.wrongActionHands[0] || gradeResult.missedHands[0];
                                                const correctAction = currentScenario?.solution?.[firstMistake] || 'call';
                                                const userAction = userGrid[firstMistake] || 'fold';
                                                fetchJarvisExplanation(firstMistake, correctAction, userAction);
                                            }}
                                            style={{
                                                marginTop: 16,
                                                padding: '12px 24px',
                                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
                                                border: '1px solid rgba(139, 92, 246, 0.5)',
                                                borderRadius: 12,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                width: '100%'
                                            }}
                                        >
                                            Ask Jarvis: Why was I wrong?
                                        </button>
                                        <button
                                            onClick={() => fetchCoachAnalysis(gradeResult)}
                                            style={{
                                                marginTop: 8,
                                                padding: '10px 20px',
                                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.3))',
                                                border: '1px solid rgba(16, 185, 129, 0.5)',
                                                borderRadius: 12,
                                                color: '#fff',
                                                fontSize: 13,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                width: '100%'
                                            }}
                                        >
                                            Get Full Game Analysis
                                        </button>
                                    </>)}


                                    {/* Jarvis Coach Panel */}
                                    {coachAnalysis.show && (
                                        <div style={{
                                            marginTop: 16,
                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.1))',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            borderRadius: 12,
                                            padding: 16
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                                <span style={{ fontSize: 20, fontWeight: 'bold', color: '#10B981' }}>J</span>
                                                <span style={{ fontFamily: 'Orbitron', fontSize: 14, color: '#10B981' }}>Jarvis Analysis</span>
                                            </div>

                                            {coachAnalysis.loading ? (
                                                <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255, 255, 255, 0.6)' }}>
                                                    <div style={{ marginBottom: 8 }}>...</div>
                                                    Jarvis is analyzing your game...
                                                </div>
                                            ) : coachAnalysis.analysis ? (
                                                <div>
                                                    {/* Summary */}
                                                    <div style={{
                                                        color: 'rgba(255, 255, 255, 0.9)',
                                                        lineHeight: 1.6,
                                                        marginBottom: 12,
                                                        fontSize: 14
                                                    }}>
                                                        {coachAnalysis.analysis.summary}
                                                    </div>

                                                    {/* Pattern Insights */}
                                                    {coachAnalysis.analysis.patternInsights?.length > 0 && (
                                                        <div style={{ marginBottom: 12 }}>
                                                            <div style={{ fontSize: 12, color: '#10B981', marginBottom: 6 }}>Patterns Detected</div>
                                                            {coachAnalysis.analysis.patternInsights.map((item, i) => (
                                                                <div key={i} style={{
                                                                    background: 'rgba(0, 0, 0, 0.2)',
                                                                    borderRadius: 8,
                                                                    padding: 8,
                                                                    marginBottom: 6,
                                                                    fontSize: 13
                                                                }}>
                                                                    <span style={{ color: '#FFD700' }}>{item.pattern}:</span>{' '}
                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{item.insight}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Recommendations */}
                                                    {coachAnalysis.analysis.recommendations?.length > 0 && (
                                                        <div>
                                                            <div style={{ fontSize: 12, color: '#06B6D4', marginBottom: 6 }}>Next Steps</div>
                                                            {coachAnalysis.analysis.recommendations.map((rec, i) => (
                                                                <div key={i} style={{
                                                                    display: 'flex',
                                                                    alignItems: 'flex-start',
                                                                    gap: 8,
                                                                    marginBottom: 4,
                                                                    fontSize: 13,
                                                                    color: 'rgba(255, 255, 255, 0.8)'
                                                                }}>
                                                                    <span>•</span>
                                                                    <span>{rec}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            )}


                            {/* Jarvis GTO Panel Modal - Futuristic Metal Design */}
                            {explainModal.show && (
                                <div style={{
                                    position: 'fixed',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'rgba(0, 0, 0, 0.92)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 9999,
                                    padding: 16,
                                    backdropFilter: 'blur(8px)'
                                }}>
                                    <div style={{
                                        maxWidth: 440,
                                        width: '100%',
                                        position: 'relative'
                                    }}>
                                        {/* Close Button */}
                                        <button
                                            onClick={() => setExplainModal(prev => ({ ...prev, show: false }))}
                                            style={{
                                                position: 'absolute',
                                                top: -12,
                                                right: -12,
                                                background: 'linear-gradient(135deg, #1a1a2e, #0a0a12)',
                                                border: '2px solid rgba(0, 212, 255, 0.5)',
                                                borderRadius: '50%',
                                                width: 36,
                                                height: 36,
                                                color: '#00D4FF',
                                                cursor: 'pointer',
                                                fontSize: 16,
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3)',
                                                zIndex: 10
                                            }}
                                        >
                                            ✕
                                        </button>

                                        {explainModal.loading ? (
                                            /* Loading State - Futuristic */
                                            <div style={{
                                                background: 'linear-gradient(180deg, #0d1b2a, #1b263b)',
                                                border: '2px solid rgba(0, 212, 255, 0.4)',
                                                borderRadius: 20,
                                                padding: 48,
                                                textAlign: 'center',
                                                boxShadow: '0 0 60px rgba(0, 212, 255, 0.15), inset 0 0 30px rgba(0, 0, 0, 0.5)'
                                            }}>
                                                <div style={{
                                                    width: 80,
                                                    height: 80,
                                                    borderRadius: '50%',
                                                    border: '4px solid rgba(0, 212, 255, 0.2)',
                                                    borderTop: '4px solid #00D4FF',
                                                    animation: 'spin 1s linear infinite',
                                                    margin: '0 auto 24px'
                                                }} />
                                                <div style={{
                                                    fontFamily: 'Orbitron, sans-serif',
                                                    fontSize: 18,
                                                    color: '#00D4FF',
                                                    marginBottom: 8,
                                                    textShadow: '0 0 20px rgba(0, 212, 255, 0.5)'
                                                }}>
                                                    JARVIS ANALYZING
                                                </div>
                                                <div style={{
                                                    fontSize: 13,
                                                    color: 'rgba(255, 255, 255, 0.5)'
                                                }}>
                                                    Generating strategic intelligence...
                                                </div>
                                            </div>
                                        ) : explainModal.panelImageUrl ? (
                                            /* GTO Panel Image - The New Template */
                                            <img
                                                src={explainModal.panelImageUrl}
                                                alt="GTO Analysis Panel"
                                                style={{
                                                    width: '100%',
                                                    borderRadius: 16,
                                                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 212, 255, 0.15)'
                                                }}
                                            />
                                        ) : (
                                            /* Fallback to text if no panel image */
                                            <div style={{
                                                background: 'linear-gradient(180deg, #0d1b2a, #1b263b)',
                                                border: '2px solid rgba(0, 212, 255, 0.4)',
                                                borderRadius: 20,
                                                padding: 24,
                                                boxShadow: '0 0 60px rgba(0, 212, 255, 0.15), inset 0 0 30px rgba(0, 0, 0, 0.5)'
                                            }}>
                                                {/* Header */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: 16,
                                                    paddingBottom: 16,
                                                    borderBottom: '1px solid rgba(0, 212, 255, 0.2)'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{
                                                            width: 48,
                                                            height: 48,
                                                            borderRadius: '50%',
                                                            background: 'linear-gradient(135deg, #1a3a52, #0d2233)',
                                                            border: '2px solid rgba(0, 212, 255, 0.5)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: 20,
                                                            color: '#00D4FF'
                                                        }}>
                                                            J
                                                        </div>
                                                        <span style={{ fontFamily: 'Orbitron', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>JARVIS</span>
                                                    </div>
                                                    <div style={{
                                                        padding: '8px 20px',
                                                        background: `linear-gradient(135deg, ${explainModal.correctAction === 'raise' ? '#00ff88' :
                                                            explainModal.correctAction === 'call' ? '#FFD700' :
                                                                explainModal.correctAction === 'fold' ? '#EF4444' :
                                                                    '#00D4FF'
                                                            }22, transparent)`,
                                                        border: `2px solid ${explainModal.correctAction === 'raise' ? '#00ff88' :
                                                            explainModal.correctAction === 'call' ? '#FFD700' :
                                                                explainModal.correctAction === 'fold' ? '#EF4444' :
                                                                    '#00D4FF'
                                                            }`,
                                                        borderRadius: 8,
                                                        fontFamily: 'Orbitron',
                                                        fontSize: 18,
                                                        fontWeight: 'bold',
                                                        color: explainModal.correctAction === 'raise' ? '#00ff88' :
                                                            explainModal.correctAction === 'call' ? '#FFD700' :
                                                                explainModal.correctAction === 'fold' ? '#EF4444' :
                                                                    '#00D4FF',
                                                        textShadow: '0 0 10px currentColor'
                                                    }}>
                                                        {explainModal.correctAction?.toUpperCase()}
                                                    </div>
                                                </div>

                                                {/* Hand Info */}
                                                <div style={{
                                                    background: 'rgba(0, 0, 0, 0.4)',
                                                    borderRadius: 12,
                                                    padding: 16,
                                                    marginBottom: 16,
                                                    border: '1px solid rgba(255, 255, 255, 0.1)'
                                                }}>
                                                    <div style={{
                                                        fontFamily: 'Orbitron',
                                                        fontSize: 28,
                                                        color: '#fff',
                                                        marginBottom: 8,
                                                        textShadow: '0 0 20px rgba(255, 255, 255, 0.3)'
                                                    }}>
                                                        {explainModal.hand}
                                                    </div>
                                                    <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.5)' }}>
                                                        You chose: <span style={{ color: '#EF4444' }}>{explainModal.userAction?.toUpperCase()}</span>
                                                        {' → '}
                                                        Optimal: <span style={{ color: '#00ff88' }}>{explainModal.correctAction?.toUpperCase()}</span>
                                                    </div>
                                                </div>

                                                {/* Explanation Section */}
                                                <div style={{
                                                    background: 'rgba(0, 0, 0, 0.3)',
                                                    borderRadius: 12,
                                                    padding: 16,
                                                    border: '1px solid rgba(0, 212, 255, 0.2)'
                                                }}>
                                                    <div style={{
                                                        fontSize: 11,
                                                        color: '#00D4FF',
                                                        fontWeight: 600,
                                                        marginBottom: 8,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: 1
                                                    }}>
                                                        ⓘ GTO Explanation
                                                    </div>
                                                    <div style={{
                                                        color: 'rgba(255, 255, 255, 0.85)',
                                                        lineHeight: 1.7,
                                                        fontSize: 14
                                                    }}>
                                                        {explainModal.explanation}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <style>{`
                                        @keyframes spin {
                                            0% { transform: rotate(0deg); }
                                            100% { transform: rotate(360deg); }
                                        }
                                    `}</style>
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
        </PageTransition >
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
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        marginBottom: 32,
    },
    gameModeTab: {
        padding: '10px 18px',
        fontSize: 'clamp(12px, 3vw, 15px)',
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
        width: '100%',
        maxWidth: 750,
        margin: '0 auto',
        marginBottom: 20,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(13, 1fr)',
        gap: 'min(0.5vw, 2px)',
        width: '100%',
    },
    cell: {
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'clamp(8px, 1.8vw, 12px)',
        fontWeight: 600,
        color: '#fff',
        borderRadius: 'min(1vw, 4px)',
        border: '1px solid',
        transition: 'all 0.1s ease',
        userSelect: 'none',
        touchAction: 'manipulation',
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
