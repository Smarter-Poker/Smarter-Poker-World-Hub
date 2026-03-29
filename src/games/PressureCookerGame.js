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
        setScore(0); setHandsCompleted(0); setStreak(0); setUserAnswer(null);
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
                if (gameState === 'ready') startGame(); else onExit?.();
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

            {gameState === 'success' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Trophy</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#00ff88', marginBottom: 30 }}>DEFUSED!</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}><span>Final Score</span><span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}><span>Time Remaining</span><span style={{ color: '#00ff88' }}>{timerSec}s</span></div>
                        <div style={{ marginTop: 16, padding: 12, background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.15))', borderRadius: 12, color: '#00ff88', fontWeight: 700 }}>Diamonds +{Math.floor(score / 50) + 10} Diamonds earned!</div>
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>BACK TO MENU [SPACE]</button>
                </div>
            )}

            {gameState === 'failed' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>💥</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#ff4444', marginBottom: 30 }}>BOOM!</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}><span>Hands Completed</span><span>{handsCompleted}/{handsRequired}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 18, color: '#fff' }}><span>Score</span><span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span></div>
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>TRY AGAIN [SPACE]</button>
                </div>
            )}
        </div>
    );
}
