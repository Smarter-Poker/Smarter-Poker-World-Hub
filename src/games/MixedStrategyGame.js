/**
 * Mixed Strategy Game — Extracted from memory-games.js for bundle splitting
 * Slider-based frequency training for complex spots
 */
import { useState, useEffect, useCallback } from 'react';
import { SoundEngine } from './GameEngine';
import { MIXED_SCENARIOS } from './ScenarioDatabase';
import gameSessionService from '../services/GameSessionService';
import achievementService from '../services/AchievementService';

const ACTION_COLORS = {
    fold: { bg: 'rgba(100, 100, 100, 0.3)', border: '#555', label: 'FOLD' },
    call: { bg: 'rgba(16, 185, 129, 0.5)', border: '#10B981', label: 'CALL' },
    raise: { bg: 'rgba(239, 68, 68, 0.5)', border: '#EF4444', label: 'RAISE' },
    raise_small: { bg: 'rgba(249, 115, 22, 0.5)', border: '#F97316', label: 'RAISE SM' },
    raise_big: { bg: 'rgba(168, 85, 247, 0.5)', border: '#A855F7', label: 'RAISE BIG' },
    all_in: { bg: 'rgba(220, 38, 127, 0.6)', border: '#DC2680', label: 'ALL IN' },
};

export default function MixedStrategyGame({ level = 1, onExit, onScoreUpdate, DiamondEngine, userId }) {
    const [gameState, setGameState] = useState('ready');
    const [currentScenario, setCurrentScenario] = useState(null);
    const [targetAction, setTargetAction] = useState(null);
    const [userFreq, setUserFreq] = useState(50);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [roundsPlayed, setRoundsPlayed] = useState(0);
    const [maxRounds] = useState(10);
    const [diff, setDiff] = useState(0);

    const getMixedScenario = useCallback(() => {
        const scenario = MIXED_SCENARIOS[Math.floor(Math.random() * MIXED_SCENARIOS.length)];
        const actions = Object.entries(scenario.frequencies).filter(([_, freq]) => freq > 0);
        const [action] = actions[Math.floor(Math.random() * actions.length)];
        return { scenario, action };
    }, []);

    const startGame = useCallback(() => {
        const { scenario, action } = getMixedScenario();
        setCurrentScenario(scenario); setTargetAction(action); setGameState('playing');
        setScore(0); setStreak(0); setRoundsPlayed(0); setUserFreq(50);
        SoundEngine.play('levelUp');
    }, [getMixedScenario]);

    const nextRound = useCallback(() => {
        if (roundsPlayed >= maxRounds) {
            setGameState('gameover');
            const diamondReward = Math.floor(score / 500) + (score >= 4000 ? 20 : 0);
            if (DiamondEngine && diamondReward > 0) { const newBalance = DiamondEngine.award(diamondReward); onScoreUpdate?.(newBalance); }
            if (userId) {
                const accuracy = Math.round((score / (roundsPlayed * 500)) * 100);
                gameSessionService.recordSession(userId, { gameMode: 'mixed_strategy', level, scenarioId: currentScenario?.title, score, accuracy, timeTaken: 0, diamondsSpent: 0, diamondsEarned: diamondReward, completed: true }).catch(e => console.warn('[MixedStrategy] Session failed:', e));
                achievementService.checkAndUnlock(userId, { gamesPlayed: 1, accuracy, level, gameMode: 'mixed_strategy', currentStreak: streak, modesPlayed: ['mixed_strategy'] }).catch(e => console.warn('[MixedStrategy] Achievement check failed:', e));
            }
            return;
        }
        const { scenario, action } = getMixedScenario();
        setCurrentScenario(scenario); setTargetAction(action); setGameState('playing');
        setUserFreq(50); setRoundsPlayed(prev => prev + 1);
    }, [roundsPlayed, maxRounds, getMixedScenario, score, DiamondEngine, onScoreUpdate, userId, level, streak, currentScenario]);

    const handleSubmit = () => {
        if (gameState !== 'playing') return;
        const actualFreq = currentScenario.frequencies[targetAction];
        const difference = Math.abs(actualFreq - userFreq);
        setDiff(difference);
        let points = Math.max(0, 100 - difference * 2);
        if (difference === 0) points += 500;
        else if (difference <= 5) points += 200;
        else if (difference <= 15) points += 50;
        if (difference <= 15) { setStreak(prev => prev + 1); setScore(prev => prev + points + (streak * 50)); SoundEngine.play('correct'); }
        else { setStreak(0); setScore(prev => prev + points); SoundEngine.play('wrong'); }
        setGameState('revealed');
        setTimeout(nextRound, 2000);
    };

    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'gameover') && (e.key === ' ' || e.key === 'Enter')) { if (gameState === 'ready') startGame(); else onExit?.(); }
            else if (gameState === 'playing') {
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <button onClick={onExit} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>← Exit</button>
                <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{roundsPlayed}/{maxRounds}</div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Mix</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, color: '#A855F7', marginBottom: 16 }}>MIXED STRATEGY</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>Not every decision is 100% frequency.<br />Dial in the exact GTO frequency for mixed spots.<br />Correct Frequency = Massive Points!</p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #A855F7, #D946EF)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>START [SPACE]</button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentScenario && (
                <>
                    <div style={{ fontSize: 16, color: '#A855F7', marginBottom: 12, fontWeight: 600 }}>{currentScenario.title}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 30 }}>{currentScenario.context}</div>
                    <div style={{ width: 140, height: 100, background: 'linear-gradient(145deg, #2e1a2e, #1a1a2e)', border: '2px solid #A855F7', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 40px', boxShadow: '0 10px 30px rgba(168, 85, 247, 0.2)' }}>
                        <div style={{ fontSize: 36, fontFamily: 'Orbitron', fontWeight: 900, color: '#fff' }}>{currentScenario.hand}</div>
                    </div>
                    <h2 style={{ fontSize: 24, marginBottom: 40 }}>Frequency of <span style={{ color: ACTION_COLORS[targetAction]?.border || '#fff', fontWeight: 900 }}>{targetAction.toUpperCase()}</span>?</h2>
                    <div style={{ position: 'relative', height: 40, background: 'rgba(255,255,255,0.1)', borderRadius: 20, marginBottom: 20 }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${gameState === 'revealed' ? currentScenario.frequencies[targetAction] : userFreq}%`, background: gameState === 'revealed' ? 'linear-gradient(90deg, #00ff88, #00cc6a)' : 'linear-gradient(90deg, #A855F7, #D946EF)', borderRadius: 20, transition: 'width 0.3s ease', opacity: gameState === 'revealed' ? 0.3 : 1 }} />
                        {gameState === 'revealed' && (<div style={{ position: 'absolute', left: `calc(${userFreq}% - 2px)`, top: -10, bottom: -10, width: 4, background: diff <= 5 ? '#00ff88' : '#ff4444', zIndex: 10, boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} />)}
                        {gameState === 'revealed' && (<div style={{ position: 'absolute', left: `calc(${currentScenario.frequencies[targetAction]}% - 2px)`, top: -15, bottom: -15, width: 4, background: '#fff', zIndex: 11, boxShadow: '0 0 15px #fff' }} />)}
                        <input type="range" min="0" max="100" value={userFreq} onChange={(e) => setGameState('playing') && setUserFreq(Number(e.target.value))} disabled={gameState !== 'playing'} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 20 }} />
                        <div style={{ position: 'absolute', width: '100%', top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, pointerEvents: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                            {gameState === 'revealed' ? `${currentScenario.frequencies[targetAction]}% (You: ${userFreq}%)` : `${userFreq}%`}
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}><span>NEVER (0%)</span><span>ALWAYS (100%)</span></div>
                    {gameState === 'revealed' && (
                        <div style={{ marginTop: 30, marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: diff <= 5 ? '#00ff88' : diff <= 15 ? '#ffaa00' : '#ff4444', marginBottom: 12 }}>
                                {diff === 0 ? 'PERFECT!' : diff <= 5 ? 'EXCELLENT!' : diff <= 15 ? 'CLOSE!' : 'WAY OFF!'}
                            </div>
                            {diff > 15 && (<img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gto-panels/panels/gto_${(currentScenario?.position || 'utg').toLowerCase()}_${targetAction}_${currentScenario?.stackDepth || 100}bb.png`} alt="GTO Analysis" style={{ maxWidth: '100%', borderRadius: 12, border: '2px solid rgba(0,212,255,0.3)', marginTop: 8 }} onError={(e) => { e.target.style.display = 'none'; }} />)}
                        </div>
                    )}
                    <button onClick={handleSubmit} disabled={gameState !== 'playing'} style={{ marginTop: 40, padding: '16px 64px', background: gameState === 'revealed' ? 'rgba(255,255,255,0.1)' : '#fff', color: gameState === 'revealed' ? 'rgba(255,255,255,0.3)' : '#000', border: 'none', borderRadius: 40, fontWeight: 900, fontSize: 18, cursor: gameState === 'playing' ? 'pointer' : 'default', transform: gameState === 'playing' ? 'scale(1)' : 'scale(0.95)', transition: 'all 0.2s ease' }}>
                        {gameState === 'revealed' ? 'NEXT HAND...' : 'LOCK IT IN'}
                    </button>
                </>
            )}

            {gameState === 'gameover' && (
                <div style={{ marginTop: 40 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>Mix</div>
                    <h1 style={{ fontFamily: 'Orbitron', fontSize: 32, marginBottom: 30 }}>SESSION COMPLETE</h1>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 24, marginBottom: 30 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 18, color: '#fff' }}><span>Final Score</span><span style={{ fontFamily: 'Orbitron', fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</span></div>
                    </div>
                    <button onClick={onExit} style={{ padding: '14px 40px', fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30, color: '#fff', cursor: 'pointer' }}>BACK TO MENU [SPACE]</button>
                </div>
            )}
        </div>
    );
}
