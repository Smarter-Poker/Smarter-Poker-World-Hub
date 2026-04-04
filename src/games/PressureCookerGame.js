/**
 * Pressure Cooker Game — Extracted from memory-games.js for bundle splitting
 * Bomb defusal style - answer 10 spots before time runs out!
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SoundEngine } from './GameEngine';
import { getRandomScenario } from './ScenarioDatabase';
import gameSessionService from '../services/GameSessionService';
import achievementService from '../services/AchievementService';

export default function PressureCookerGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
    const [gameState, setGameState] = useState('ready');
    const [currentHand, setCurrentHand] = useState(null);
    const [score, setScore] = useState(0);
    const [handsCompleted, setHandsCompleted] = useState(0);
    const [handsRequired] = useState(10);
    const [timeRemaining, setTimeRemaining] = useState(30000);
    const [userAnswer, setUserAnswer] = useState(null);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const timerRef = useRef(null);

    const TIME_BONUS = 3000;
    const TIME_PENALTY = 5000;
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
        setCurrentHand(hand); setGameState('playing'); setTimeRemaining(INITIAL_TIME);
        setScore(0); setHandsCompleted(0); setStreak(0); setMaxStreak(0); setCorrectCount(0); setUserAnswer(null);
        SoundEngine.play('levelUp');
    }, [getRandomHand]);

    const nextHand = useCallback(() => {
        const hand = getRandomHand();
        if (!hand) return;
        setCurrentHand(hand); setGameState('playing'); setUserAnswer(null);
    }, [getRandomHand]);

    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentHand) return;
        setUserAnswer(action);
        const isCorrect = action === currentHand.correctAction;
        const newHandsCompleted = handsCompleted + 1;

        if (isCorrect) {
            setScore(prev => prev + 100 + (streak * 20));
            setStreak(prev => prev + 1);
            setMaxStreak(prev => Math.max(prev, streak + 1));
            setCorrectCount(prev => prev + 1);
            setTimeRemaining(prev => Math.min(prev + TIME_BONUS, 60000));
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
                setGameState('success');
                SoundEngine.play('levelUp');
                const diamondReward = Math.floor(score / 50) + 10;
                if (DiamondEngine) { const newBalance = DiamondEngine.award(diamondReward); onScoreUpdate?.(newBalance); }
                if (userId) {
                    const accuracy = Math.round((score / (newHandsCompleted * 100)) * 100);
                    gameSessionService.recordSession(userId, {
                        gameMode: 'pressure_cooker', level, scenarioId: currentHand?.scenario?.title,
                        score, accuracy, timeTaken: Math.round((INITIAL_TIME - timeRemaining) / 1000),
                        diamondsSpent: 0, diamondsEarned: diamondReward, completed: true
                    }).catch(e => console.warn('[PressureCooker] Session failed:', e));
                    achievementService.checkAndUnlock(userId, {
                        gamesPlayed: 1, accuracy, level, gameMode: 'pressure_cooker',
                        currentStreak: streak, modesPlayed: ['pressure_cooker']
                    }).catch(e => console.warn('[PressureCooker] Achievement check failed:', e));
                }
            } else if (timeRemaining <= 0) { /* handled by timer */ }
            else { nextHand(); }
        }, 600);
    }, [gameState, currentHand, streak, handsCompleted, handsRequired, timeRemaining, score, nextHand, DiamondEngine, onScoreUpdate, userId, level]);

    useEffect(() => {
        if (gameState === 'playing' || gameState === 'revealed') {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 100) { clearInterval(timerRef.current); setGameState('failed'); SoundEngine.play('gameOver'); return 0; }
                    return prev - 100;
                });
            }, 100);
        }
        return () => clearInterval(timerRef.current);
    }, [gameState]);

    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'success' || gameState === 'failed') && (e.key === ' ' || e.key === 'Enter')) {
                if (gameState === 'ready' || gameState === 'success' || gameState === 'failed') startGame();
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
    const timerColor = timeRemaining > 15000 ? '#00ff88' : timeRemaining > 7000 ? '#ffaa00' : '#ff4444';
    const isLowTime = timeRemaining < 7000;

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>← Exit</button>
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{handsCompleted}/{handsRequired}</div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}></div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#ff4444', marginBottom: 16 }}>PRESSURE COOKER</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>
                        Answer 10 hands before time runs out!<br />Correct = +3 seconds<br />✗ Wrong = -5 seconds<br />
                        <span style={{ color: '#ff4444' }}>Clock Is Ticking...</span>
                    </p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #ff4444, #ff0066)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>START [SPACE]</button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentHand && (
                <>
                    <div style={{ fontSize: 72, fontFamily: 'Orbitron', fontWeight: 900, color: timerColor, textShadow: isLowTime ? '0 0 30px rgba(255,68,68,0.8)' : 'none', animation: isLowTime ? 'pulse 0.5s infinite' : 'none', marginBottom: 20 }}>{timerSec}s</div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(handsCompleted / handsRequired) * 100}%`, background: '#00ff88', transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>{currentHand.scenario.title}</div>
                    <div style={{
                        width: 180, height: 120,
                        background: isLowTime ? 'linear-gradient(145deg, #3a1a1a, #2e1616)' : 'linear-gradient(145deg, #1a1a2e, #16213e)',
                        border: `3px solid ${gameState === 'revealed' ? (userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444') : timerColor}`,
                        borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px', boxShadow: isLowTime ? '0 0 40px rgba(255,68,68,0.4)' : '0 10px 40px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ fontSize: 42, fontFamily: 'Orbitron', fontWeight: 900, color: '#fff' }}>{currentHand.hand}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{currentHand.hand.length === 2 ? 'Pair' : currentHand.hand.endsWith('s') ? 'Suited' : 'Offsuit'}</div>
                    </div>
                    {gameState === 'revealed' && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444', marginBottom: 12 }}>
                                {userAnswer === currentHand.correctAction ? ` +${100 + (streak - 1) * 20} (+3s)` : `✗ ${currentHand.correctAction.toUpperCase()} (-5s)`}
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

            {gameState === 'success' && (() => {
                const accuracy = handsCompleted > 0 ? Math.round((correctCount / handsCompleted) * 100) : 0;
                const diamondReward = Math.floor(score / 50) + 10;
                const grade = accuracy >= 95 ? 'S' : accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const gradeColor = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                return (
                    <div style={{ marginTop: 20 }}>
                        {/* Performance Hero Card */}
                        <div style={{
                            background: `linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05)`,
                            border: `1px solid ${gradeColor}40`,
                            borderRadius: 20, padding: 28, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 14, color: '#00ff88', fontWeight: 700, marginBottom: 8, letterSpacing: 2 }}>DEFUSED!</div>
                            <div style={{ fontFamily: 'Orbitron', fontSize: 56, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16 }}>PERFORMANCE GRADE</div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: '#FFD700' }}>{score.toLocaleString()}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>SCORE</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: '#00ff88' }}>{timerSec}s</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>TIME LEFT</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: '#00d4ff' }}>{maxStreak}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BEST STREAK</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: '#A78BFA' }}>{correctCount}/{handsCompleted}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>CORRECT</div>
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
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(0,255,136,0.12), rgba(0,212,255,0.12))',
                            border: '1px solid rgba(0,255,136,0.3)',
                            borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#00ff88' }}>
                                +{diamondReward} Diamonds Earned!
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={startGame} style={{
                                flex: 1, padding: '14px 0', fontSize: 14, fontWeight: 700,
                                background: 'linear-gradient(135deg, #00ff88, #00cc66)', color: '#000',
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

            {gameState === 'failed' && (() => {
                const accuracy = handsCompleted > 0 ? Math.round((correctCount / handsCompleted) * 100) : 0;
                const grade = accuracy >= 90 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const gradeColor = { A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                const diamondReward = Math.floor(score / 100);
                return (
                    <div style={{ marginTop: 20 }}>
                        {/* Performance Card */}
                        <div style={{
                            background: `linear-gradient(135deg, #EF444415, #EF444405)`,
                            border: `1px solid #EF444440`,
                            borderRadius: 20, padding: 28, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 14, color: '#ff4444', fontWeight: 700, marginBottom: 8, letterSpacing: 2 }}>TIME'S UP!</div>
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
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 24, fontWeight: 800, color: '#A78BFA' }}>{handsCompleted}/{handsRequired}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>COMPLETED</div>
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

                        {/* Diamond Reward (if any) */}
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
                                background: 'linear-gradient(135deg, #ff4444, #ff0066)', color: '#fff',
                                border: 'none', borderRadius: 12, cursor: 'pointer'
                            }}>TRY AGAIN</button>
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
