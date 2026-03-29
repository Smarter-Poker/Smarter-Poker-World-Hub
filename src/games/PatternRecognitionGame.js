/**
 * Pattern Recognition Game — Extracted from memory-games.js for bundle splitting
 * Identify the pattern - what action does this range shape represent?
 */
import { useState, useEffect, useCallback } from 'react';
import { SoundEngine } from './GameEngine';
import { getRandomScenario, RANKS } from './ScenarioDatabase';
import gameSessionService from '../services/GameSessionService';
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

    const generatePattern = useCallback(() => {
        const scenario = getRandomScenario(level);
        if (!scenario) return null;
        const solution = scenario.solution || {};
        const hands = Object.keys(solution);
        const visibleCount = Math.floor(hands.length * 0.7);
        const shuffled = hands.sort(() => Math.random() - 0.5);
        const visibleHands = shuffled.slice(0, visibleCount);
        const actionCounts = { raise: 0, call: 0, fold: 0 };
        Object.values(solution).forEach(action => { if (actionCounts[action] !== undefined) actionCounts[action]++; });
        const dominantAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0][0];
        return { scenario, visibleHands, allHands: hands, solution, correctAnswer: dominantAction, actionCounts };
    }, [level]);

    const startGame = useCallback(() => {
        const pattern = generatePattern();
        if (!pattern) return;
        setCurrentPattern(pattern); setGameState('playing'); setScore(0); setStreak(0); setRound(1); setCorrectAnswers(0); setUserAnswer(null);
        SoundEngine.play('levelUp');
    }, [generatePattern]);

    const nextRound = useCallback(() => {
        if (round >= maxRounds) {
            setGameState('gameover');
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
        setCurrentPattern(pattern); setGameState('playing'); setRound(prev => prev + 1); setUserAnswer(null);
    }, [round, maxRounds, generatePattern, correctAnswers, score, DiamondEngine, onScoreUpdate, userId, level, streak, currentPattern]);

    const handleAnswer = useCallback((action) => {
        if (gameState !== 'playing' || !currentPattern) return;
        setUserAnswer(action);
        const isCorrect = action === currentPattern.correctAnswer;
        if (isCorrect) { setScore(prev => prev + 100 + (streak * 25)); setStreak(prev => prev + 1); setCorrectAnswers(prev => prev + 1); SoundEngine.play('correct'); }
        else { setStreak(0); SoundEngine.play('wrong'); }
        setGameState('revealed');
        setTimeout(() => { nextRound(); }, 1200);
    }, [gameState, currentPattern, streak, nextRound]);

    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'gameover') && (e.key === ' ' || e.key === 'Enter')) { if (gameState === 'ready') startGame(); else onExit?.(); }
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
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{round}/{maxRounds}</div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Pattern</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, color: '#00D4FF', marginBottom: 16 }}>PATTERN RECOGNITION</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>See a partial range → Identify the dominant action!<br />Is this a RAISING range, CALLING range, or FOLDING range?<br />8 patterns. Test your GTO intuition!</p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #00D4FF, #0088ff)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>START [SPACE]</button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentPattern && (
                <>
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
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        {['fold', 'call', 'raise'].map((action, idx) => {
                            const colors = { fold: { bg: 'rgba(100,100,100,0.3)', border: '#666', color: '#fff', label: 'FOLD Range' }, call: { bg: 'rgba(16,185,129,0.3)', border: '#10B981', color: '#10B981', label: 'CALL Range' }, raise: { bg: 'rgba(239,68,68,0.3)', border: '#EF4444', color: '#EF4444', label: 'RAISE Range' } };
                            const c = colors[action];
                            return (
                                <button key={action} onClick={() => handleAnswer(action)} disabled={gameState !== 'playing'} style={{ padding: '16px 32px', fontSize: 16, fontWeight: 700, background: c.bg, border: `2px solid ${c.border}`, borderRadius: 12, color: c.color, cursor: gameState === 'playing' ? 'pointer' : 'default', opacity: gameState === 'playing' ? 1 : 0.5, position: 'relative' }}>
                                    <span style={{ position: 'absolute', top: -8, right: -6, width: 20, height: 20, background: 'rgba(0,0,0,0.8)', borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>{idx + 1}</span>
                                    {c.label}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {gameState === 'gameover' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>{correctAnswers >= 6 ? 'Trophy' : ''}</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, color: correctAnswers >= 6 ? '#00ff88' : '#ffaa00', marginBottom: 30 }}>{correctAnswers >= 6 ? 'EXPERT PATTERN READER!' : 'KEEP STUDYING!'}</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}><span>Accuracy</span><span style={{ color: correctAnswers >= 6 ? '#00ff88' : '#ffaa00' }}>{correctAnswers}/{maxRounds} ({Math.round((correctAnswers / maxRounds) * 100)}%)</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}><span>Score</span><span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span></div>
                        {(correctAnswers * 2 + Math.floor(score / 100)) > 0 && (<div style={{ marginTop: 16, padding: 12, background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.15))', borderRadius: 12, color: '#00ff88', fontWeight: 700 }}>Diamonds +{correctAnswers * 2 + Math.floor(score / 100)} Diamonds earned!</div>)}
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>BACK TO MENU [SPACE]</button>
                </div>
            )}
        </div>
    );
}
