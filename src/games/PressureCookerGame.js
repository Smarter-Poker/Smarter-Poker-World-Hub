/**
 * Pressure Cooker Game — Extracted from memory-games.js for bundle splitting
 * Bomb defusal style - answer 10 spots before time runs out!
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { SoundEngine } from './GameEngine';
import { getRandomScenario, getRandomEnrichedScenario, pickWeightedHandFromScenario } from './ScenarioDatabase';
import { shareResult, savePersonalBest, getCoachingTip, getNextGameSuggestion } from '../utils/shareCard';
import { busEmit } from '../engine/EventBus';
import PositionWeaknessHeatmap from '../components/training/PositionWeaknessHeatmap';
import CircularTimer from '../components/training/CircularTimer';
import AnimatedAccuracyBar from '../components/training/AnimatedAccuracyBar';
import { recordSessionWeakness, recordHandResult } from '../utils/weaknessTracker';
import { getGamePowerUps, purchasePowerUp } from '../utils/powerUps';
import PowerUpBar from '../components/training/PowerUpBar';
import gameSessionService from '../services/GameSessionService';
let _confetti = null;
async function fireConfetti(opts) { try { if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; } _confetti(opts); } catch (e) { console.warn('[App] Handled exception:', e); } }
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
    const mistakesRef = useRef([]);
    const [usedPowerUps, setUsedPowerUps] = useState(new Set());
    const [activePowerUp, setActivePowerUp] = useState(null);
    const [streakFreezeAvailable, setStreakFreezeAvailable] = useState(false);
    const [eliminatedAction, setEliminatedAction] = useState(null);
    const availablePowerUps = getGamePowerUps('pressure-cooker');

    const TIME_BONUS = 3000;
    const TIME_PENALTY = 5000;
    const INITIAL_TIME = 30000;

    const getRandomHand = useCallback(() => {
        const scenario = getRandomEnrichedScenario(level);
        if (!scenario) return null;
        // Weighted hand selection: 50% in-range, 30% boundary, 20% any (including folds)
        return pickWeightedHandFromScenario(scenario);
    }, [level]);

    const startGame = useCallback(() => {
        const hand = getRandomHand();
        if (!hand) return;
        setCurrentHand(hand); setGameState('playing'); setTimeRemaining(INITIAL_TIME);
        setScore(0); setHandsCompleted(0); setStreak(0); setMaxStreak(0); setCorrectCount(0); setUserAnswer(null);
        mistakesRef.current = [];
        setUsedPowerUps(new Set()); setActivePowerUp(null); setStreakFreezeAvailable(false); setEliminatedAction(null);
        SoundEngine.play('levelUp');
    }, [getRandomHand]);

    const nextHand = useCallback(() => {
        const hand = getRandomHand();
        if (!hand) return;
        setCurrentHand(hand); setGameState('playing'); setUserAnswer(null); setEliminatedAction(null);
    }, [getRandomHand]);

    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentHand) return;
        setUserAnswer(action);
        let isCorrect;
        if (currentHand.frequencies) {
            const actionFreq = currentHand.frequencies[action] || 0;
            isCorrect = actionFreq >= 0.25;
        } else {
            isCorrect = action === currentHand.correctAction;
        }
        const newHandsCompleted = handsCompleted + 1;

        if (isCorrect) {
            setScore(prev => prev + 100 + (streak * 20));
            setStreak(prev => prev + 1);
            setMaxStreak(prev => Math.max(prev, streak + 1));
            setCorrectCount(prev => prev + 1);
            setTimeRemaining(prev => Math.min(prev + TIME_BONUS, 60000));
            SoundEngine.play(streak >= 2 ? 'combo' : 'correct');
        } else {
            if (streakFreezeAvailable) {
                setStreakFreezeAvailable(false);
                SoundEngine.play('correct'); // Saved by freeze — no penalty
            } else {
                setStreak(0);
                setTimeRemaining(prev => Math.max(prev - TIME_PENALTY, 0));
                SoundEngine.play('wrong');
            }
            mistakesRef.current.push({ position: currentHand.scenario?.title || 'Unknown', hand: currentHand.hand, correct: currentHand.correctAction, picked: action });
            busEmit.decisionIncorrect(streak, { userAction: action, bestAction: currentHand.correctAction, scenario: currentHand.scenario });
        }

        // Record granular spot-type weakness data
        recordHandResult({
            position: currentHand.scenario?.position || 'UNK',
            spotType: currentHand.scenario?.spotType || 'rfi',
            hand: currentHand.hand,
            isCorrect,
            userAction: action,
            correctAction: currentHand.correctAction,
        });

        setHandsCompleted(newHandsCompleted);
        setGameState('revealed');

        setTimeout(() => {
            if (newHandsCompleted >= handsRequired) {
                setGameState('success');
                SoundEngine.play('levelUp');
                const diamondReward = Math.floor(score / 50) + 10;
                if (DiamondEngine) { const newBalance = DiamondEngine.award(diamondReward); onScoreUpdate?.(newBalance); }
                { const acc = newHandsCompleted > 0 ? Math.round(((correctCount + 1) / newHandsCompleted) * 100) : 0; const g = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D'; savePersonalBest('pressure-cooker', score, g); if (g === 'S' || g === 'A') fireConfetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); }
                recordSessionWeakness('pressure-cooker', mistakesRef.current, newHandsCompleted);
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

    // Save personal best on failed too
    useEffect(() => {
        if (gameState === 'failed' && handsCompleted > 0) {
            const acc = Math.round((correctCount / handsCompleted) * 100);
            const g = acc >= 90 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
            savePersonalBest('pressure-cooker', score, g);
        }
    }, [gameState, handsCompleted, correctCount, score]);

    useEffect(() => {
        if (gameState === 'playing' || gameState === 'revealed') {
            timerRef.current = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 100) { clearInterval(timerRef.current); setGameState('failed'); SoundEngine.play('gameOver'); recordSessionWeakness('pressure-cooker', mistakesRef.current, handsCompleted); return 0; }
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

    const handlePowerUp = useCallback((powerUp) => {
        if (!DiamondEngine || usedPowerUps.has(powerUp.id)) return;
        if (!purchasePowerUp(powerUp, DiamondEngine)) return;
        setUsedPowerUps(prev => new Set([...prev, powerUp.id]));
        onScoreUpdate?.(DiamondEngine.getBalance());

        if (powerUp.id === 'TIME_BOOST') {
            setTimeRemaining(prev => Math.min(prev + 10000, 60000));
            setActivePowerUp(null);
        } else if (powerUp.id === 'STREAK_FREEZE') {
            setStreakFreezeAvailable(true);
            setActivePowerUp('STREAK_FREEZE');
        } else if (powerUp.id === 'HINT_REVEAL') {
            setActivePowerUp(null);
            if (currentHand) {
                const wrongActions = ['fold', 'call', 'raise'].filter(a => a !== currentHand.correctAction);
                setEliminatedAction(wrongActions[Math.floor(Math.random() * wrongActions.length)]);
            }
        }
        SoundEngine.play('levelUp');
    }, [DiamondEngine, usedPowerUps, onScoreUpdate, currentHand]);

    const timerSec = (timeRemaining / 1000).toFixed(1);
    const timerColor = timeRemaining > 15000 ? '#00ff88' : timeRemaining > 7000 ? '#ffaa00' : '#ff4444';
    const isLowTime = timeRemaining < 7000;

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>← Exit</button>
                <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {streak > 1 && <div style={{ padding: '4px 10px', background: 'linear-gradient(135deg, #ff6b00, #ff0066)', borderRadius: 16, fontWeight: 700, fontSize: 13, color: '#fff', animation: 'pulse 0.5s ease' }}>{streak}x</div>}
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{handsCompleted}/{handsRequired}</div>
                </div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}></div>
                    <h1 style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 36, color: '#ff4444', marginBottom: 16 }}>PRESSURE COOKER</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>
                        Answer 10 hands before time runs out!<br />Correct = +3 seconds<br />✗ Wrong = -5 seconds<br />
                        <span style={{ color: '#ff4444' }}>Clock Is Ticking...</span>
                    </p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #ff4444, #ff0066)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>START [SPACE]</button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentHand && (
                <>
                    <PowerUpBar
                        powerUps={availablePowerUps}
                        usedPowerUps={usedPowerUps}
                        activePowerUp={activePowerUp}
                        onActivate={handlePowerUp}
                        diamondBalance={DiamondEngine?.getBalance() || 0}
                        compact
                    />
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>{currentHand.scenario.title}</div>
                    <CircularTimer
                        percent={(timeRemaining / 30000) * 100}
                        color={timerColor}
                        size={220}
                        thickness={7}
                        isLow={isLowTime}
                    >
                        <div style={{ fontSize: 14, fontFamily: "var(--font-orbitron), 'Orbitron'", fontWeight: 700, color: timerColor, marginBottom: 4 }}>{timerSec}s</div>
                        <div style={{
                            width: 140, height: 90,
                            background: isLowTime ? 'linear-gradient(145deg, #3a1a1a, #2e1616)' : 'linear-gradient(145deg, #1a1a2e, #16213e)',
                            border: `3px solid ${gameState === 'revealed' ? (userAnswer === currentHand.correctAction ? '#00ff88' : '#ff4444') : timerColor}`,
                            borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            boxShadow: isLowTime ? '0 0 40px rgba(255,68,68,0.4)' : '0 10px 40px rgba(0,0,0,0.5)',
                        }}>
                            <div style={{ fontSize: 36, fontFamily: "var(--font-orbitron), 'Orbitron'", fontWeight: 900, color: '#fff' }}>{currentHand.hand}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{currentHand.hand.length === 2 ? 'Pair' : currentHand.hand.endsWith('s') ? 'Suited' : 'Offsuit'}</div>
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{handsCompleted}/{handsRequired} hands</div>
                    </CircularTimer>
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
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {[{ action: 'fold', bg: 'rgba(100,100,100,0.3)', border: '#666', color: '#fff', label: 'FOLD', key: '1' },
                          { action: 'call', bg: 'rgba(16,185,129,0.3)', border: '#10B981', color: '#10B981', label: 'CALL', key: '2' },
                          { action: 'raise', bg: 'rgba(239,68,68,0.3)', border: '#EF4444', color: '#EF4444', label: 'RAISE', key: '3' }].map(btn => {
                            const isElim = eliminatedAction === btn.action;
                            return (
                                <button key={btn.action} onClick={() => !isElim && handleAnswer(btn.action)} disabled={gameState !== 'playing' || isElim} style={{ flex: '1 1 80px', minHeight: 52, padding: '14px 20px', fontSize: 16, fontWeight: 700, background: isElim ? 'rgba(50,50,50,0.2)' : btn.bg, border: `2px solid ${isElim ? 'rgba(255,255,255,0.05)' : btn.border}`, borderRadius: 12, color: isElim ? 'rgba(255,255,255,0.15)' : btn.color, cursor: (gameState === 'playing' && !isElim) ? 'pointer' : 'default', opacity: isElim ? 0.25 : (gameState === 'playing' ? 1 : 0.5), position: 'relative', touchAction: 'manipulation', textDecoration: isElim ? 'line-through' : 'none' }}>
                                    <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>{btn.key}</span>{isElim ? '✗' : btn.label}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {gameState === 'success' && (() => {
                const accuracy = handsCompleted > 0 ? Math.round((correctCount / handsCompleted) * 100) : 0;
                const diamondReward = Math.floor(score / 50) + 10;
                const grade = accuracy >= 95 ? 'S' : accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const gradeColor = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                return (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginTop: 20 }}>
                        {/* Performance Hero Card */}
                        <div style={{
                            background: `linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05)`,
                            border: `1px solid ${gradeColor}40`,
                            borderRadius: 20, padding: 28, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 14, color: '#00ff88', fontWeight: 700, marginBottom: 8, letterSpacing: 2 }}>DEFUSED!</div>
                            <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 56, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16 }}>PERFORMANCE GRADE</div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 20, fontWeight: 800, color: '#FFD700' }}>{score.toLocaleString()}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{'SCORE'}</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 20, fontWeight: 800, color: '#00ff88' }}>{timerSec}s</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>TIME LEFT</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 20, fontWeight: 800, color: '#00d4ff' }}>{maxStreak}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BEST STREAK</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 20, fontWeight: 800, color: '#A78BFA' }}>{correctCount}/{handsCompleted}</div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>CORRECT</div>
                                </div>
                            </div>
                        </div>

                        {/* Animated Accuracy Bar */}
                        <AnimatedAccuracyBar accuracy={accuracy} grade={grade} />

                        {/* Position Weakness Heatmap */}
                        <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={handsCompleted} />

                        {/* Weakness Analysis */}
                        {mistakesRef.current.length > 0 && (() => {
                            const posCounts = {};
                            mistakesRef.current.forEach(m => { posCounts[m.position] = (posCounts[m.position] || 0) + 1; });
                            const sorted = Object.entries(posCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
                            return (
                                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', letterSpacing: 1.5, marginBottom: 10 }}>{'\u26A0\uFE0F'} WEAKNESS DETECTED</div>
                                    {sorted.map(([pos, count], i) => (
                                        <div key={pos} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{pos}</span>
                                            <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 700 }}>{count} mistake{count > 1 ? 's' : ''}</span>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>Focus on these spots in your next session</div>
                                </div>
                            );
                        })()}

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

                        {/* Share Result */}
                        <button onClick={() => shareResult({
                            gameTitle: 'PRESSURE COOKER',
                            grade,
                            score,
                            scoreLabel: 'SCORE',
                            stats: [
                                { label: 'Time Left', value: timerSec + 's' },
                                { label: 'Streak', value: maxStreak },
                                { label: 'Correct', value: `${correctCount}/${handsCompleted}` },
                                { label: 'Accuracy', value: accuracy + '%' },
                            ],
                            color: '#ff4444',
                        })} style={{
                            width: '100%', marginTop: 12, padding: '12px 0', fontSize: 13, fontWeight: 600,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10, color: 'rgba(255,255,255,0.5)', cursor: 'pointer'
                        }}>{'\uD83D\uDCF4'} Share Result</button>

                        {/* Coaching Tip */}
                        <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '12px 16px', marginTop: 12, textAlign: 'left' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#00D4FF', letterSpacing: 1.5, marginBottom: 4 }}>{'\uD83C\uDFAF'} COACH TIP</div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{getCoachingTip(grade)}</div>
                        </div>

                        {/* Suggested Next Game */}
                        {(() => {
                            const suggestion = getNextGameSuggestion('pressure-cooker', grade);
                            if (!suggestion) return null;
                            return (
                                <div style={{
                                    background: `${suggestion.color}10`, border: `1px solid ${suggestion.color}30`,
                                    borderRadius: 10, padding: 14, marginTop: 10, textAlign: 'center', cursor: 'pointer'
                                }} onClick={onExit}>
                                    <div style={{ fontSize: 10, color: suggestion.color, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                                        {suggestion.icon} SUGGESTED NEXT
                                    </div>
                                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>{suggestion.title}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{suggestion.reason}</div>
                                </div>
                            );
                        })()}
                    </motion.div>
                );
            })()}

            {gameState === 'failed' && (() => {
                const accuracy = handsCompleted > 0 ? Math.round((correctCount / handsCompleted) * 100) : 0;
                const grade = accuracy >= 90 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const gradeColor = { A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                const diamondReward = Math.floor(score / 100);
                return (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginTop: 20 }}>
                        {/* Performance Card */}
                        <div style={{
                            background: `linear-gradient(135deg, #EF444415, #EF444405)`,
                            border: `1px solid #EF444440`,
                            borderRadius: 20, padding: 28, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 14, color: '#ff4444', fontWeight: 700, marginBottom: 8, letterSpacing: 2 }}>TIME'S UP!</div>
                            <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 56, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16 }}>PERFORMANCE GRADE</div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 24, fontWeight: 800, color: '#FFD700' }}>{score.toLocaleString()}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>SCORE</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 24, fontWeight: 800, color: '#00d4ff' }}>{maxStreak}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BEST STREAK</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 24, fontWeight: 800, color: '#A78BFA' }}>{handsCompleted}/{handsRequired}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>COMPLETED</div>
                                </div>
                            </div>
                        </div>

                        {/* Animated Accuracy Bar */}
                        <AnimatedAccuracyBar accuracy={accuracy} grade={grade} />

                        {/* Position Weakness Heatmap */}
                        <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={handsCompleted} />

                        {/* Weakness Analysis */}
                        {mistakesRef.current.length > 0 && (() => {
                            const posCounts = {};
                            mistakesRef.current.forEach(m => { posCounts[m.position] = (posCounts[m.position] || 0) + 1; });
                            const sorted = Object.entries(posCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
                            return (
                                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', letterSpacing: 1.5, marginBottom: 10 }}>{'\u26A0\uFE0F'} WEAKNESS DETECTED</div>
                                    {sorted.map(([pos, count], i) => (
                                        <div key={pos} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{pos}</span>
                                            <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 700 }}>{count} mistake{count > 1 ? 's' : ''}</span>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>Focus on these spots in your next session</div>
                                </div>
                            );
                        })()}

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

                        {/* Share Result */}
                        <button onClick={() => shareResult({
                            gameTitle: 'PRESSURE COOKER',
                            grade,
                            score,
                            scoreLabel: 'SCORE',
                            stats: [
                                { label: 'Streak', value: maxStreak },
                                { label: 'Completed', value: `${handsCompleted}/${handsRequired}` },
                                { label: 'Accuracy', value: accuracy + '%' },
                            ],
                            color: '#ff4444',
                            subtitle: "TIME'S UP!",
                        })} style={{
                            width: '100%', marginTop: 12, padding: '12px 0', fontSize: 13, fontWeight: 600,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10, color: 'rgba(255,255,255,0.5)', cursor: 'pointer'
                        }}>{'\uD83D\uDCF4'} Share Result</button>

                        {/* Coaching Tip */}
                        <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '12px 16px', marginTop: 12, textAlign: 'left' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#00D4FF', letterSpacing: 1.5, marginBottom: 4 }}>{'\uD83C\uDFAF'} COACH TIP</div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{getCoachingTip(grade)}</div>
                        </div>

                        {/* Suggested Next Game */}
                        {(() => {
                            const suggestion = getNextGameSuggestion('pressure-cooker', grade);
                            if (!suggestion) return null;
                            return (
                                <div style={{
                                    background: `${suggestion.color}10`, border: `1px solid ${suggestion.color}30`,
                                    borderRadius: 10, padding: 14, marginTop: 10, textAlign: 'center', cursor: 'pointer'
                                }} onClick={onExit}>
                                    <div style={{ fontSize: 10, color: suggestion.color, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                                        {suggestion.icon} SUGGESTED NEXT
                                    </div>
                                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>{suggestion.title}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{suggestion.reason}</div>
                                </div>
                            );
                        })()}
                    </motion.div>
                );
            })()}
        </div>
    );
}
