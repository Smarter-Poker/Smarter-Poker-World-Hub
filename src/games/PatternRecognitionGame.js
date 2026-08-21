/**
 * Pattern Recognition Game — Extracted from memory-games.js for bundle splitting
 * Identify the pattern - what action does this range shape represent?
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { SoundEngine } from './GameEngine';
import { getRandomScenario, getRandomEnrichedScenario, RANKS } from './ScenarioDatabase';
import { shareResult, savePersonalBest, getCoachingTip, getNextGameSuggestion } from '../utils/shareCard';
import { busEmit } from '../engine/EventBus';
import PositionWeaknessHeatmap from '../components/training/PositionWeaknessHeatmap';
import AnimatedAccuracyBar from '../components/training/AnimatedAccuracyBar';
import { recordSessionWeakness } from '../utils/weaknessTracker';
import { getGamePowerUps, purchasePowerUp } from '../utils/powerUps';
import PowerUpBar from '../components/training/PowerUpBar';
import gameSessionService from '../services/GameSessionService';
let _confetti = null;
async function fireConfetti(opts) { try { if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; } _confetti(opts); } catch (e) { console.warn('[App] Handled exception:', e); } }
import achievementService from '../services/AchievementService';

export default function PatternRecognitionGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
    const [gameState, setGameState] = useState('ready');
    const [currentPattern, setCurrentPattern] = useState(null);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [round, setRound] = useState(0);
    const [maxRounds] = useState(8);
    const [userAnswer, setUserAnswer] = useState(null);
    const [correctAnswers, setCorrectAnswers] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [usedPowerUps, setUsedPowerUps] = useState(new Set());
    const [activePowerUp, setActivePowerUp] = useState(null);
    const [doublePointsActive, setDoublePointsActive] = useState(false);
    const [hintUsedThisRound, setHintUsedThisRound] = useState(false);
    const [eliminatedOption, setEliminatedOption] = useState(null);
    const mistakesRef = useRef([]);
    const availablePowerUps = getGamePowerUps('pattern-recognition');

    const generatePattern = useCallback(() => {
        const scenario = getRandomEnrichedScenario(level);
        if (!scenario) return null;
        const solution = scenario.solution || {};
        const hands = Object.keys(solution || {});
        const visibleCount = Math.floor(hands.length * 0.7);
        // Phase 62: Fisher-Yates instead of biased sort(()=>Math.random()-0.5).
        const shuffled = [...hands];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const visibleHands = shuffled.slice(0, visibleCount);
        const actionCounts = { raise: 0, call: 0, fold: 0 };
        Object.values(solution || {}).forEach(action => { if (actionCounts[action] !== undefined) actionCounts[action]++; });
        const dominantAction = Object.entries(actionCounts || {}).sort((a, b) => b[1] - a[1])[0][0];
        return { scenario, visibleHands, allHands: hands, solution, correctAnswer: dominantAction, actionCounts };
    }, [level]);

    const startGame = useCallback(() => {
        const pattern = generatePattern();
        if (!pattern) return;
        setCurrentPattern(pattern); setGameState('playing'); setScore(0); setStreak(0); setMaxStreak(0); setRound(1); setCorrectAnswers(0); setUserAnswer(null);
        setUsedPowerUps(new Set()); setActivePowerUp(null); setDoublePointsActive(false); setHintUsedThisRound(false); setEliminatedOption(null);
        mistakesRef.current = [];
        SoundEngine.play('levelUp');
    }, [generatePattern]);

    const nextRound = useCallback(() => {
        if (round >= maxRounds) {
            setGameState('gameover');
            { const acc = Math.round((correctAnswers / maxRounds) * 100); const g = acc >= 90 ? 'S' : acc >= 80 ? 'A' : acc >= 65 ? 'B' : acc >= 50 ? 'C' : 'D'; savePersonalBest('pattern-recognition', score, g); SoundEngine.play(acc >= 65 ? 'levelUp' : 'gameOver'); if (g === 'S' || g === 'A') fireConfetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); }
            recordSessionWeakness('pattern-recognition', mistakesRef.current, maxRounds);
            const diamondReward = correctAnswers * 2 + Math.floor(score / 100);
            if (DiamondEngine && diamondReward > 0) { const newBalance = DiamondEngine.award(diamondReward); onScoreUpdate?.(newBalance); }
            if (userId) {
                const accuracy = Math.round((correctAnswers / maxRounds) * 100);
                gameSessionService.recordSession(userId, { gameMode: 'pattern_recognition', level, scenarioId: currentPattern?.scenario?.title, score, accuracy, timeTaken: 0, diamondsSpent: 0, diamondsEarned: diamondReward, completed: true }).catch(e => console.warn('[PatternRecognition] Session failed:', e));
                achievementService.checkAndUnlock(userId, { gamesPlayed: 1, accuracy, level, gameMode: 'pattern_recognition', currentStreak: streak, modesPlayed: ['pattern_recognition'] }).catch(e => console.warn('[PatternRecognition] Achievement check failed:', e));
            }
            return;
        }
        const pattern = generatePattern();
        if (!pattern) return;
        setCurrentPattern(pattern); setGameState('playing'); setRound(prev => prev + 1); setUserAnswer(null); setHintUsedThisRound(false); setEliminatedOption(null);
    }, [round, maxRounds, generatePattern, correctAnswers, score, DiamondEngine, onScoreUpdate, userId, level, streak, currentPattern]);

    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentPattern) return;
        setUserAnswer(action);
        const isCorrect = action === currentPattern.correctAnswer;
        const pointMultiplier = doublePointsActive ? 2 : 1;
        if (doublePointsActive) setDoublePointsActive(false);
        if (isCorrect) { setScore(prev => prev + (100 + (streak * 25)) * pointMultiplier); setStreak(prev => prev + 1); setMaxStreak(prev => Math.max(prev, streak + 1)); setCorrectAnswers(prev => prev + 1); SoundEngine.play(streak >= 2 ? 'combo' : 'correct'); }
        else { setStreak(0); SoundEngine.play('wrong'); mistakesRef.current.push({ position: currentPattern.scenario?.title || 'Unknown', correct: currentPattern.correctAnswer, picked: action }); busEmit.decisionIncorrect(streak, { userAction: action, bestAction: currentPattern.correctAnswer, scenario: currentPattern.scenario }); }
        setGameState('revealed');
        setTimeout(() => { nextRound(); }, 1200);
    }, [gameState, currentPattern, streak, nextRound]);

    const handlePowerUp = useCallback((pu) => {
        if (!purchasePowerUp(pu, DiamondEngine)) return;
        onScoreUpdate?.(DiamondEngine.getBalance());
        setUsedPowerUps(prev => new Set([...prev, pu.id]));
        if (pu.id === 'DOUBLE_POINTS') { setDoublePointsActive(true); setActivePowerUp('DOUBLE_POINTS'); }
        else if (pu.id === 'HINT_REVEAL' && currentPattern) {
            setHintUsedThisRound(true); setActivePowerUp(null);
            // Eliminate one wrong answer
            const wrongOptions = ['fold', 'call', 'raise'].filter(a => a !== currentPattern.correctAnswer);
            setEliminatedOption(wrongOptions[Math.floor(Math.random() * wrongOptions.length)]);
        }
    }, [DiamondEngine, onScoreUpdate, currentPattern]);

    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'gameover') && (e.key === ' ' || e.key === 'Enter')) { startGame(); }
            else if (gameState === 'playing') {
                if (e.key === '1') handleAnswer('fold'); else if (e.key === '2') handleAnswer('call'); else if (e.key === '3') handleAnswer('raise');
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [gameState, handleAnswer, startGame, onExit]);

    const renderMiniGrid = () => {
        if (!currentPattern) return null;
        const { visibleHands, solution } = currentPattern;
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 2, width: 350, margin: '0 auto 24px', background: 'rgba(0,0,0,0.4)', padding: 8, borderRadius: 12 }}>
                {RANKS.map((r1, i) =>
                    RANKS.map((r2, j) => {
                        const hand = i < j ? `${r1}${r2}s` : i > j ? `${r2}${r1}o` : `${r1}${r2}`;
                        const isVisible = visibleHands.includes(hand);
                        const action = solution[hand];
                        const color = action === 'raise' ? '#EF4444' : action === 'call' ? '#10B981' : 'rgba(100,100,100,0.3)';
                        return (
                            <div key={hand} style={{ width: 24, height: 24, background: isVisible ? color : 'rgba(255,255,255,0.05)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: isVisible ? '#fff' : 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>← Exit</button>
                <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {streak > 1 && <div style={{ padding: '4px 10px', background: 'linear-gradient(135deg, #3B82F6, #0088ff)', borderRadius: 16, fontWeight: 700, fontSize: 13, color: '#fff' }}>{streak}x</div>}
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{round}/{maxRounds}</div>
                </div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>{'\uD83E\uDDE9'}</div>
                    <h1 style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 32, color: '#00D4FF', marginBottom: 16 }}>PATTERN RECOGNITION</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>See a partial range → Identify the dominant action!<br />Is this a RAISING range, CALLING range, or FOLDING range?<br />8 patterns. Test your GTO intuition!</p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #00D4FF, #0088ff)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>START [SPACE]</button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentPattern && (
                <>
                    {gameState === 'playing' && (
                        <PowerUpBar
                            powerUps={availablePowerUps}
                            usedPowerUps={usedPowerUps}
                            activePowerUp={activePowerUp}
                            onActivate={handlePowerUp}
                            diamondBalance={DiamondEngine?.getBalance() || 0}
                            compact
                        />
                    )}
                    <div style={{ fontSize: 16, color: '#00D4FF', marginBottom: 12, fontWeight: 600 }}>{currentPattern.scenario.title}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>What action does this range primarily represent?</div>
                    {renderMiniGrid()}
                    {gameState === 'revealed' && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentPattern.correctAnswer ? '#00ff88' : '#ff4444', marginBottom: 12 }}>
                                {userAnswer === currentPattern.correctAnswer ? ` Correct! This is a ${currentPattern.correctAnswer.toUpperCase()} range` : `✗ Wrong! This is a ${currentPattern.correctAnswer.toUpperCase()} range`}
                            </div>
                            {userAnswer !== currentPattern.correctAnswer && (
                                <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gto-panels/panels/gto_${(currentPattern.scenario?.position || 'utg').toLowerCase()}_${currentPattern.correctAnswer}_${currentPattern.scenario?.stackDepth || 100}bb.png`}
                                    alt="GTO Analysis" style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }} onError={(e) => { e.target.style.display = 'none'; }} />
                            )}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {['fold', 'call', 'raise'].map((action, idx) => {
                            const colors = { fold: { bg: 'rgba(100,100,100,0.3)', border: '#666', color: '#fff', label: 'FOLD Range' }, call: { bg: 'rgba(16,185,129,0.3)', border: '#10B981', color: '#10B981', label: 'CALL Range' }, raise: { bg: 'rgba(239,68,68,0.3)', border: '#EF4444', color: '#EF4444', label: 'RAISE Range' } };
                            const c = colors[action];
                            const isEliminated = eliminatedOption === action;
                            return (
                                <button key={action} onClick={() => !isEliminated && handleAnswer(action)} disabled={gameState !== 'playing' || isEliminated} style={{ flex: '1 1 90px', minHeight: 52, padding: '14px 20px', fontSize: 15, fontWeight: 700, background: isEliminated ? 'rgba(50,50,50,0.2)' : c.bg, border: `2px solid ${isEliminated ? 'rgba(255,255,255,0.05)' : c.border}`, borderRadius: 12, color: isEliminated ? 'rgba(255,255,255,0.15)' : c.color, cursor: (gameState === 'playing' && !isEliminated) ? 'pointer' : 'default', opacity: (gameState === 'playing' && !isEliminated) ? 1 : isEliminated ? 0.25 : 0.5, position: 'relative', touchAction: 'manipulation', textDecoration: isEliminated ? 'line-through' : 'none' }}>
                                    <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>{idx + 1}</span>
                                    {isEliminated ? '✗' : c.label}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {gameState === 'gameover' && (() => {
                const accuracy = Math.round((correctAnswers / maxRounds) * 100);
                const diamondReward = correctAnswers * 2 + Math.floor(score / 100);
                const grade = accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 65 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const gradeColor = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                return (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginTop: 20 }}>
                        {/* Performance Hero Card */}
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
                                    <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani'", fontSize: 24, fontWeight: 800, color: '#A78BFA' }}>{correctAnswers}/{maxRounds}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>CORRECT</div>
                                </div>
                            </div>
                        </div>

                        {/* Animated Accuracy Bar */}
                        <AnimatedAccuracyBar accuracy={accuracy} grade={grade} />

                        {/* Position Weakness Heatmap */}
                        <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={maxRounds} />

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
                                background: 'linear-gradient(135deg, #00D4FF, #0088ff)', color: '#fff',
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
                            gameTitle: 'PATTERN RECOGNITION',
                            grade,
                            score,
                            scoreLabel: 'SCORE',
                            stats: [
                                { label: 'Streak', value: maxStreak },
                                { label: 'Correct', value: `${correctAnswers}/${maxRounds}` },
                                { label: 'Accuracy', value: accuracy + '%' },
                            ],
                            color: '#00D4FF',
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
                            const suggestion = getNextGameSuggestion('pattern-recognition', grade);
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
