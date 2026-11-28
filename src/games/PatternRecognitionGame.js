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
import { Puzzle } from 'lucide-react';
import { GameFrame, GameTopBar, GameIntro, GameResult, GameWeakness, GameNote, GameActions, GameShare, GameCoachTip, GameSuggestedNext, GameNextButton, gradeTone } from '../components/memory-games/PreflopGameKit';
let _confetti = null;
async function fireConfetti(opts) { try { if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; } _confetti(opts); } catch (e) { console.warn('[App] Handled exception:', e); } }

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
            if (!userId && DiamondEngine && diamondReward > 0) {
                void DiamondEngine.award(diamondReward).then(newBalance => {
                    if (Number.isFinite(newBalance)) onScoreUpdate?.(newBalance);
                });
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
    }, [gameState, currentPattern, streak]);

    const handlePowerUp = useCallback(async (pu) => {
        const purchase = await purchasePowerUp(pu, DiamondEngine);
        if (!purchase.success) return;
        if (Number.isFinite(purchase.balance)) onScoreUpdate?.(purchase.balance);
        setUsedPowerUps(prev => new Set([...prev, pu.id]));
        if (pu.id === 'DOUBLE_POINTS') { setDoublePointsActive(true); setActivePowerUp('DOUBLE_POINTS'); }
        else if (pu.id === 'HINT_REVEAL' && currentPattern) {
            setHintUsedThisRound(true); setActivePowerUp(null);
            // Eliminate one wrong answer
            const wrongOptions = ['fold', 'call', 'raise', 'mixed'].filter(a => a !== currentPattern.correctAnswer);
            setEliminatedOption(wrongOptions[Math.floor(Math.random() * wrongOptions.length)]);
        }
    }, [DiamondEngine, onScoreUpdate, currentPattern]);

    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'gameover') && (e.key === ' ' || e.key === 'Enter')) { startGame(); }
            else if (gameState === 'playing') {
                if (e.key === '1') handleAnswer('fold'); else if (e.key === '2') handleAnswer('call'); else if (e.key === '3') handleAnswer('raise'); else if (e.key === '4') handleAnswer('mixed');
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [gameState, handleAnswer, startGame, onExit]);

    const renderMiniGrid = () => {
        if (!currentPattern) return null;
        const { visibleHands, solution } = currentPattern;
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 2, width: '100%', maxWidth: 350, margin: '0 auto 24px', background: '#040b14', padding: 8, border: '3px solid transparent', borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch" }}>
                {RANKS.map((r1, i) =>
                    RANKS.map((r2, j) => {
                        const hand = i < j ? `${r1}${r2}s` : i > j ? `${r2}${r1}o` : `${r1}${r2}`;
                        const isVisible = visibleHands.includes(hand);
                        const action = solution[hand];
                        const color = action === 'raise' ? '#EF4444' : action === 'call' ? '#10B981' : 'rgba(100,100,100,0.3)';
                        return (
                            <div key={hand} style={{ width: '100%', aspectRatio: '1', minWidth: 0, background: isVisible ? color : 'rgba(255,255,255,0.05)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: isVisible ? '#fff' : 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                                {isVisible ? hand.substring(0, 2) : '?'}
                            </div>
                        );
                    })
                )}
            </div>
        );
    };

    return (
        <GameFrame style={{ textAlign: 'center' }}>
            <GameTopBar onExit={onExit} score={score} streak={streak}>
                <span style={{ fontSize: 14, color: '#bdd0e2', fontWeight: 600 }}>{round}/{maxRounds}</span>
            </GameTopBar>

            {gameState === 'ready' && (
                <GameIntro icon={Puzzle} kicker="Free Local Practice" title="Pattern Recognition" onStart={startGame}>
                    See A Partial Range And Identify The Dominant Action. Is It A Raising, Calling, Folding Or Mixed Range? Eight Patterns To Test Your Range Reading.
                </GameIntro>
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
                    <div style={{ fontSize: 18, color: '#f2f7ff', marginBottom: 8, fontWeight: 700, fontFamily: "var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif" }}>{currentPattern.scenario.title}</div>
                    <div style={{ fontSize: 14, color: '#bdd0e2', marginBottom: 16 }}>What Action Does This Range Primarily Represent?</div>
                    {renderMiniGrid()}
                    {gameState === 'revealed' && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: userAnswer === currentPattern.correctAnswer ? '#00ff88' : '#ff4444', marginBottom: 12 }}>
                                {userAnswer === currentPattern.correctAnswer ? `Correct. This Is A ${currentPattern.correctAnswer.replace(/^\w/, (c) => c.toUpperCase())} Range` : `Not Quite. This Is A ${currentPattern.correctAnswer.replace(/^\w/, (c) => c.toUpperCase())} Range`}
                            </div>
                            {userAnswer !== currentPattern.correctAnswer && (
                                <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gto-panels/panels/gto_${(currentPattern.scenario?.position || 'utg').toLowerCase()}_${currentPattern.correctAnswer}_${currentPattern.scenario?.stackDepth || 100}bb.png`}
                                    alt="GTO Analysis" style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }} onError={(e) => { e.target.style.display = 'none'; }} />
                            )}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {['fold', 'call', 'raise', 'mixed'].map((action, idx) => {
                            const colors = { fold: { bg: 'rgba(100,100,100,0.3)', border: '#666', color: '#fff', label: 'Fold Range' }, call: { bg: 'rgba(16,185,129,0.3)', border: '#10B981', color: '#10B981', label: 'Call Range' }, raise: { bg: 'rgba(239,68,68,0.3)', border: '#EF4444', color: '#EF4444', label: 'Raise Range' }, mixed: { bg: 'rgba(14,165,233,0.25)', border: '#38BDF8', color: '#7DD3FC', label: 'Mixed Range' } };
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
                    {gameState === 'revealed' && (
                        <GameNextButton onClick={nextRound}>
                            Next Question →
                        </GameNextButton>
                    )}
                </>
            )}

            {gameState === 'gameover' && (() => {
                const accuracy = Math.round((correctAnswers / maxRounds) * 100);
                const diamondReward = correctAnswers * 2 + Math.floor(score / 100);
                const grade = accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 65 ? 'B' : accuracy >= 50 ? 'C' : 'D';
                const posCounts = {};
                mistakesRef.current.forEach(m => { posCounts[m.position] = (posCounts[m.position] || 0) + 1; });
                const weakRows = Object.entries(posCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
                return (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginTop: 12 }}>
                        <GameResult grade={grade} metrics={[
                            { label: 'Score', value: score.toLocaleString() },
                            { label: 'Correct', value: `${correctAnswers}/${maxRounds}` },
                            { label: 'Best Streak', value: maxStreak },
                        ]} />

                        <AnimatedAccuracyBar accuracy={accuracy} grade={grade} />

                        <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={maxRounds} />

                        <GameWeakness rows={weakRows} />

                        {!userId && diamondReward > 0 && (
                            <GameNote tone="good">+{diamondReward} Local Practice Diamonds</GameNote>
                        )}

                        <GameActions onReplay={startGame} onExit={onExit} />

                        <GameShare onShare={() => shareResult({
                            gameTitle: 'PATTERN RECOGNITION',
                            grade,
                            score,
                            scoreLabel: 'SCORE',
                            stats: [
                                { label: 'Streak', value: maxStreak },
                                { label: 'Correct', value: `${correctAnswers}/${maxRounds}` },
                                { label: 'Accuracy', value: accuracy + '%' },
                            ],
                            color: gradeTone(grade),
                        })} />

                        <GameCoachTip>{getCoachingTip(grade)}</GameCoachTip>

                        <GameSuggestedNext suggestion={getNextGameSuggestion('pattern-recognition', grade)} onSelect={onExit} />
                    </motion.div>
                );
            })()}
        </GameFrame>
    );
}
