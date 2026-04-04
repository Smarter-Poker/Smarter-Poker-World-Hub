/**
 * Speed Drill Game — Extracted from memory-games.js for bundle splitting
 * Flash a hand → Pick the action → Build streaks!
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SoundEngine } from './GameEngine';
import { getRandomScenario } from './ScenarioDatabase';
import gameSessionService from '../services/GameSessionService';
import achievementService from '../services/AchievementService';

export default function SpeedDrillGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
    const [gameState, setGameState] = useState('ready');
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
        setCurrentTimeLimit(INITIAL_TIME);
        setScore(0);
        setStreak(0);
        setMaxStreak(0);
        setLives(3);
        setUserAnswer(null);
        setHandsPlayed(0);
        SoundEngine.play('levelUp');
    }, [getRandomHand]);

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
                const diamondReward = Math.floor(score / 100);
                if (diamondReward > 0 && DiamondEngine) {
                    const newBalance = DiamondEngine.award(diamondReward);
                    onScoreUpdate?.(newBalance);
                }
                if (userId) {
                    const accuracy = handsPlayed > 0 ? Math.round((score / (handsPlayed * 100)) * 100) : 0;
                    gameSessionService.recordSession(userId, {
                        gameMode: 'speed_drill', level,
                        scenarioId: currentHand?.scenario?.title,
                        score, accuracy, timeTaken: 0,
                        diamondsSpent: 0, diamondsEarned: diamondReward, completed: true
                    }).catch(e => console.warn('[SpeedDrill] Session failed:', e));
                    achievementService.checkAndUnlock(userId, {
                        gamesPlayed: 1, accuracy, level,
                        gameMode: 'speed_drill', currentStreak: maxStreak,
                        modesPlayed: ['speed_drill']
                    }).catch(e => console.warn('[SpeedDrill] Achievement check failed:', e));
                }
            } else {
                nextHand();
            }
        }, 800);
    }, [gameState, currentHand, streak, lives, score, nextHand, DiamondEngine, onScoreUpdate, userId, handsPlayed, level, maxStreak]);

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

    useEffect(() => {
        const handleKey = (e) => {
            if (gameState === 'ready' && (e.key === ' ' || e.key === 'Enter')) startGame();
            else if (gameState === 'gameover' && (e.key === ' ' || e.key === 'Enter')) onExit?.();
            else if (gameState === 'playing') {
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>← Exit</button>
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                {streak > 0 && <div style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #ff6b00, #ff0066)', borderRadius: 20, fontWeight: 700, color: '#fff' }}>{streak}x</div>}
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
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000', border: 'none', borderRadius: 50, cursor: 'pointer' }}>START [SPACE]</button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentHand && (
                <>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                        {[0, 1, 2].map(i => (<span key={i} style={{ fontSize: 24, opacity: i < lives ? 1 : 0.3 }}></span>))}
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${timerPercent}%`, background: timerColor, transition: 'width 0.05s linear' }} />
                    </div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>{currentHand.scenario.title}</div>
                    <div style={{
                        width: 180, height: 120, background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
                        border: `3px solid ${gameState === 'revealed' ? (userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444') : '#00D4FF'}`,
                        borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ fontSize: 42, fontFamily: 'Orbitron', fontWeight: 900, color: '#fff' }}>{currentHand.hand}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            {currentHand.hand.length === 2 ? 'Pair' : currentHand.hand.endsWith('s') ? 'Suited' : 'Offsuit'}
                        </div>
                    </div>
                    {gameState === 'revealed' && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444', marginBottom: 12 }}>
                                {userAnswer === currentHand.correctAction ? ` Correct! +${100 + (streak - 1) * 10}` : `✗ Wrong! Should ${currentHand.correctAction.toUpperCase()}`}
                            </div>
                            {userAnswer !== currentHand.correctAction && (
                                <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gto-panels/panels/gto_${(currentHand.scenario?.position || 'utg').toLowerCase()}_${currentHand.correctAction}_${currentHand.scenario?.stackDepth || 100}bb.png`}
                                    alt="GTO Analysis" style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }}
                                    onError={(e) => { e.target.style.display = 'none'; }} />
                            )}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <button onClick={() => handleAnswer('fold')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(100,100,100,0.3)', border: '2px solid #666', borderRadius: 12, color: '#fff', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)' }}>1</span>FOLD
                        </button>
                        <button onClick={() => handleAnswer('call')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(16,185,129,0.3)', border: '2px solid #10B981', borderRadius: 12, color: '#10B981', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>2</span>CALL
                        </button>
                        <button onClick={() => handleAnswer('raise')} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: 'rgba(239,68,68,0.3)', border: '2px solid #EF4444', borderRadius: 12, color: '#EF4444', cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                            <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>3</span>RAISE
                        </button>
                    </div>
                </>
            )}

            {gameState === 'gameover' && (() => {
                const accuracy = handsPlayed > 0 ? Math.round((score / (handsPlayed * 110)) * 100) : 0;
                const diamondReward = Math.floor(score / 100);
                const grade = accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const gradeColor = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                return (
                    <div style={{ marginTop: 20 }}>
                        {/* Score Hero Card */}
                        <div style={{
                            background: `linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05)`,
                            border: `1px solid ${gradeColor}40`,
                            borderRadius: 20, padding: 28, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontFamily: 'Orbitron', fontSize: 56, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16 }}>PERFORMANCE GRADE</div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 24, fontWeight: 800, color: '#FFD700' }}>{score.toLocaleString()}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>SCORE</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 24, fontWeight: 800, color: '#00d4ff' }}>{maxStreak}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BEST STREAK</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 24, fontWeight: 800, color: '#A78BFA' }}>{handsPlayed}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>HANDS</div>
                                </div>
                            </div>
                        </div>

                        {/* Accuracy Bar */}
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                                <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>ACCURACY</span>
                                <span style={{ color: gradeColor, fontWeight: 700 }}>{accuracy}%</span>
                            </div>
                            <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${accuracy}%`, background: gradeColor, borderRadius: 4, transition: 'width 1s ease' }} />
                            </div>
                        </div>

                        {/* Diamond Reward */}
                        {diamondReward > 0 && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(0,255,136,0.12), rgba(0,212,255,0.12))',
                                border: '1px solid rgba(0,255,136,0.3)',
                                borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'center'
                            }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#00ff88' }}>
                                    +{diamondReward} Diamonds Earned!
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={startGame} style={{
                                flex: 1, padding: '14px 0', fontSize: 14, fontWeight: 700,
                                background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000',
                                border: 'none', borderRadius: 12, cursor: 'pointer'
                            }}>PLAY AGAIN</button>
                            <button onClick={onExit} style={{
                                flex: 1, padding: '14px 0', fontSize: 14, fontWeight: 600,
                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 12, color: '#fff', cursor: 'pointer'
                            }}>BACK TO MENU</button>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
