/**
 * Speed Drill Game — Extracted from memory-games.js for bundle splitting
 * Flash a hand → Pick the action → Build streaks!
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
// confetti loaded lazily
let _confetti = null;
async function fireConfetti(opts) { try { if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; } _confetti(opts); } catch (e) { console.warn('[App] Handled exception:', e); } }
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
    const mistakesRef = useRef([]);
    const [usedPowerUps, setUsedPowerUps] = useState(new Set());
    const [activePowerUp, setActivePowerUp] = useState(null);
    const [streakFreezeAvailable, setStreakFreezeAvailable] = useState(false);
    const [doublePointsActive, setDoublePointsActive] = useState(false);
    const [eliminatedAction, setEliminatedAction] = useState(null);
    // Mixed-frequency grading verdict for the CURRENT reveal. The reveal UI
    // used to re-derive correctness as userAnswer === correctAction, which
    // contradicts handleAnswer's >=25%-frequency tolerance: a graded-correct
    // mixed action scored points and played the 'correct' sound while the
    // banner showed 'Wrong! Should X' in red. One verdict, stored once.
    const [lastAnswerCorrect, setLastAnswerCorrect] = useState(null);
    const availablePowerUps = getGamePowerUps('speed-drill');

    const INITIAL_TIME = 3000;
    const MIN_TIME = 1000;
    const TIME_DECREASE = 100;

    const getRandomHand = useCallback(() => {
        const scenario = getRandomEnrichedScenario(level);
        if (!scenario) return null;
        // Weighted hand selection: 50% in-range, 30% boundary, 20% any (including folds)
        return pickWeightedHandFromScenario(scenario);
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
        setLastAnswerCorrect(null);
        setHandsPlayed(0);
        mistakesRef.current = [];
        setUsedPowerUps(new Set());
        setActivePowerUp(null);
        setStreakFreezeAvailable(false);
        setDoublePointsActive(false);
        setEliminatedAction(null);
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
        setLastAnswerCorrect(null);
        setEliminatedAction(null);
    }, [getRandomHand, streak]);

    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentHand) return;
        clearInterval(timerRef.current);
        setUserAnswer(action);
        setHandsPlayed(prev => prev + 1);

        // Mixed-frequency grading: if solver frequencies available, any action
        // with >25% frequency counts as correct (mimics GTO Wizard tolerance)
        let isCorrect;
        if (currentHand.frequencies) {
            const actionFreq = currentHand.frequencies[action] || 0;
            isCorrect = actionFreq >= 0.25;
        } else {
            isCorrect = action === currentHand.correctAction;
        }
        setLastAnswerCorrect(isCorrect);

        if (isCorrect) {
            const multiplier = doublePointsActive ? 2 : 1;
            const pointsEarned = (100 + (streak * 10)) * multiplier;
            setScore(prev => prev + pointsEarned);
            setStreak(prev => prev + 1);
            setMaxStreak(prev => Math.max(prev, streak + 1));
            SoundEngine.play(streak >= 2 ? 'combo' : 'correct');
            if (doublePointsActive) setDoublePointsActive(false);
        } else {
            // Check for streak freeze
            if (streakFreezeAvailable) {
                setStreakFreezeAvailable(false);
                SoundEngine.play('correct'); // Softer sound — saved!
                // Don't lose life or streak
            } else {
                setStreak(0);
                setLives(prev => prev - 1);
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

        setGameState('revealed');

        const freezeSaved = !isCorrect && streakFreezeAvailable;
        setTimeout(() => {
            if (!isCorrect && !freezeSaved && lives - 1 <= 0) {
                setGameState('gameover');
                SoundEngine.play('gameOver');
                { const acc = handsPlayed > 0 ? Math.round((score / (handsPlayed * 110)) * 100) : 0; const g = acc >= 90 ? 'S' : acc >= 75 ? 'A' : acc >= 60 ? 'B' : acc >= 40 ? 'C' : 'D'; savePersonalBest('speed-drill', score, g); if (g === 'S' || g === 'A') fireConfetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); }
                recordSessionWeakness('speed-drill', mistakesRef.current, handsPlayed + 1);
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
    }, [gameState, currentHand, streak, lives, score, nextHand, DiamondEngine, onScoreUpdate, userId, handsPlayed, level, maxStreak, streakFreezeAvailable, doublePointsActive]);

    const handlePowerUp = useCallback((powerUp) => {
        if (!DiamondEngine || usedPowerUps.has(powerUp.id)) return;
        if (!purchasePowerUp(powerUp, DiamondEngine)) return;
        setUsedPowerUps(prev => new Set([...prev, powerUp.id]));
        onScoreUpdate?.(DiamondEngine.getBalance());

        if (powerUp.id === 'STREAK_FREEZE') {
            setStreakFreezeAvailable(true);
            setActivePowerUp('STREAK_FREEZE');
        } else if (powerUp.id === 'DOUBLE_POINTS') {
            setDoublePointsActive(true);
            setActivePowerUp('DOUBLE_POINTS');
        } else if (powerUp.id === 'HINT_REVEAL') {
            setActivePowerUp(null);
            // Eliminate one wrong answer
            if (currentHand) {
                const wrongActions = ['fold', 'call', 'raise'].filter(a => a !== currentHand.correctAction);
                setEliminatedAction(wrongActions[Math.floor(Math.random() * wrongActions.length)]);
            }
        }
        SoundEngine.play('levelUp');
    }, [DiamondEngine, usedPowerUps, onScoreUpdate, currentHand]);

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
                <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                {streak > 0 && <div style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #ff6b00, #ff0066)', borderRadius: 20, fontWeight: 700, color: '#fff' }}>{streak}x</div>}
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>{'\u26A1'}</div>
                    <h1 style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 36, color: '#FFD700', marginBottom: 16 }}>SPEED DRILL</h1>
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
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
                        {[0, 1, 2].map(i => (<span key={i} style={{ fontSize: 24, opacity: i < lives ? 1 : 0.3 }}>{i < lives && streakFreezeAvailable && i === lives - 1 ? '🛡️' : '❤️'}</span>))}
                    </div>
                    <PowerUpBar
                        powerUps={availablePowerUps}
                        usedPowerUps={usedPowerUps}
                        activePowerUp={activePowerUp}
                        onActivate={handlePowerUp}
                        diamondBalance={DiamondEngine?.getBalance() || 0}
                        compact
                    />
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>{currentHand.scenario.title}</div>
                    <CircularTimer
                        percent={timerPercent}
                        color={timerColor}
                        size={200}
                        thickness={6}
                        isLow={timerPercent < 25}
                    >
                    <div style={{
                        width: 140, height: 100, background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
                        border: `3px solid ${gameState === 'revealed' ? (lastAnswerCorrect ? '#00ff88' : '#ff4444') : '#00D4FF'}`,
                        borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    }}>
                        <div style={{ fontSize: 42, fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontWeight: 900, color: '#fff' }}>{currentHand.hand}</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            {currentHand.hand.length === 2 ? 'Pair' : currentHand.hand.endsWith('s') ? 'Suited' : 'Offsuit'}
                        </div>
                    </div>
                    </CircularTimer>
                    {gameState === 'revealed' && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: lastAnswerCorrect ? '#00ff88' : '#ff4444', marginBottom: 12 }}>
                                {lastAnswerCorrect ? ` Correct! +${100 + (streak - 1) * 10}` : `✗ Wrong! Should ${currentHand.correctAction.toUpperCase()}`}
                            </div>
                            {!lastAnswerCorrect && (
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

            {gameState === 'gameover' && (() => {
                const accuracy = handsPlayed > 0 ? Math.round((score / (handsPlayed * 110)) * 100) : 0;
                const diamondReward = Math.floor(score / 100);
                const grade = accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const gradeColor = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                return (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginTop: 20 }}>
                        {/* Score Hero Card */}
                        <div style={{
                            background: `linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05)`,
                            border: `1px solid ${gradeColor}40`,
                            borderRadius: 20, padding: 28, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 56, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16 }}>PERFORMANCE GRADE</div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 24, fontWeight: 800, color: '#FFD700' }}>{score.toLocaleString()}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>SCORE</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 24, fontWeight: 800, color: '#00d4ff' }}>{maxStreak}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BEST STREAK</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                    <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 24, fontWeight: 800, color: '#A78BFA' }}>{handsPlayed}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>HANDS</div>
                                </div>
                            </div>
                        </div>

                        {/* Animated Accuracy Bar */}
                        <AnimatedAccuracyBar accuracy={accuracy} grade={grade} personalBest={(() => { try { const pb = JSON.parse(localStorage.getItem('pb_speed-drill') || 'null'); return pb?.score ? Math.round((pb.score / (handsPlayed * 110)) * 100) : null; } catch { return null; } })()} />

                        {/* Position Weakness Heatmap */}
                        <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={handsPlayed} />

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

                        {/* Share */}
                        <div style={{ textAlign: 'center', marginTop: 12 }}>
                            <button onClick={() => shareResult({
                                gameTitle: 'Speed Drill',
                                grade,
                                score,
                                scoreLabel: 'SCORE',
                                color: '#FFD700',
                                subtitle: `${handsPlayed} hands \u2022 ${maxStreak} streak`,
                                stats: [
                                    { label: 'SCORE', value: score.toLocaleString() },
                                    { label: 'STREAK', value: maxStreak },
                                    { label: 'HANDS', value: handsPlayed },
                                    { label: 'ACCURACY', value: `${accuracy}%` },
                                ],
                            })} style={{
                                padding: '8px 20px', fontSize: 11, fontWeight: 600,
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                            }}>{'\uD83D\uDCF7'} Share Result</button>
                        </div>

                        {/* Coaching Tip */}
                        <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '12px 16px', marginTop: 12, textAlign: 'left' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#00D4FF', letterSpacing: 1.5, marginBottom: 4 }}>{'\uD83C\uDFAF'} COACH TIP</div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{getCoachingTip(grade)}</div>
                        </div>

                        {/* Suggested Next Game */}
                        {(() => {
                            const suggestion = getNextGameSuggestion('speed-drill', grade);
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
