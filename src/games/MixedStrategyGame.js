/**
 * Mixed Strategy Game — Extracted from memory-games.js for bundle splitting
 * Slider-based frequency training for complex spots
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { SoundEngine } from './GameEngine';
import { MIXED_SCENARIOS } from './ScenarioDatabase';
import {
    RFI, THREE_BET, BB_DEFENSE, FOUR_BET, SQUEEZE,
    getHandFrequencies, ALL_HANDS, getAvailableSpots,
} from '../config/solverRanges';

/**
 * Generate dynamic mixed-strategy scenarios from solver data.
 * These are hands where the solver has a genuine mix (no action > 90%).
 * Much more realistic than the 10 hand-picked MIXED_SCENARIOS.
 */
function generateSolverMixedScenarios() {
    const scenarios = [];
    const spots = getAvailableSpots();

    // Helper: extract mixed hands from a spot
    function extractMixed(data, label, context) {
        for (const hand of ALL_HANDS) {
            const f = getHandFrequencies(data, hand);
            const raise = Math.round(f.raise * 100);
            const call = Math.round(f.call * 100);
            const fold = Math.round(f.fold * 100);

            // A hand is "mixed" if the top action is < 90% and there are 2+ actions with >8%
            const actions = [
                ['raise', raise],
                ['call', call],
                ['fold', fold],
            ].filter(([_, v]) => v > 8);

            if (actions.length >= 2) {
                const maxAction = actions.reduce((a, b) => b[1] > a[1] ? b : a);
                if (maxAction[1] < 90) {
                    const frequencies = {};
                    actions.forEach(([a, v]) => { frequencies[a] = v; });
                    scenarios.push({
                        id: `solver-${label}-${hand}`.replace(/\s+/g, '-'),
                        title: label,
                        hand,
                        context,
                        frequencies,
                        isSolverDerived: true,
                    });
                }
            }
        }
    }

    // RFI spots
    spots.rfi.forEach(s => {
        extractMixed(s.data, s.label, `Opening range from ${s.label.replace(' Open', '')}`);
    });

    // 3-Bet spots
    spots.threeBet.forEach(s => {
        extractMixed(s.data, s.label, `Facing an open raise`);
    });

    // BB Defense
    spots.bbDefense.forEach(s => {
        extractMixed(s.data, s.label, `Defending from the big blind`);
    });

    // 4-Bet
    spots.fourBet.forEach(s => {
        extractMixed(s.data, s.label, `Facing a 3-bet`);
    });

    return scenarios;
}

// Build combined pool: hand-picked + solver-generated
const SOLVER_MIXED = generateSolverMixedScenarios();
const ALL_MIXED_SCENARIOS = [...MIXED_SCENARIOS, ...SOLVER_MIXED];
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
    const [maxStreak, setMaxStreak] = useState(0);
    const [closeCount, setCloseCount] = useState(0);
    const [usedPowerUps, setUsedPowerUps] = useState(new Set());
    const [activePowerUp, setActivePowerUp] = useState(null);
    const [doublePointsActive, setDoublePointsActive] = useState(false);
    const mistakesRef = useRef([]);
    const availablePowerUps = getGamePowerUps('mixed-strategy');

    const getMixedScenario = useCallback(() => {
        // Use combined pool of hand-picked + solver-generated scenarios
        const pool = ALL_MIXED_SCENARIOS.length > 0 ? ALL_MIXED_SCENARIOS : MIXED_SCENARIOS;
        const scenario = pool[Math.floor(Math.random() * pool.length)];
        const actions = Object.entries(scenario.frequencies || {}).filter(([_, freq]) => freq > 0);
        const [action] = actions[Math.floor(Math.random() * actions.length)];
        return { scenario, action };
    }, []);

    const startGame = useCallback(() => {
        const { scenario, action } = getMixedScenario();
        setCurrentScenario(scenario); setTargetAction(action); setGameState('playing');
        setScore(0); setStreak(0); setMaxStreak(0); setCloseCount(0); setRoundsPlayed(0); setUserFreq(50);
        setUsedPowerUps(new Set()); setActivePowerUp(null); setDoublePointsActive(false);
        mistakesRef.current = [];
        SoundEngine.play('levelUp');
    }, [getMixedScenario]);

    const nextRound = useCallback(() => {
        if (roundsPlayed >= maxRounds) {
            setGameState('gameover');
            { const acc = maxRounds > 0 ? Math.round((closeCount / maxRounds) * 100) : 0; const g = acc >= 90 ? 'S' : acc >= 80 ? 'A' : acc >= 60 ? 'B' : acc >= 40 ? 'C' : 'D'; savePersonalBest('mixed-strategy', score, g); SoundEngine.play(acc >= 60 ? 'levelUp' : 'gameOver'); if (g === 'S' || g === 'A') fireConfetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } }); }
            recordSessionWeakness('mixed-strategy', mistakesRef.current, maxRounds);
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
        const pointMultiplier = doublePointsActive ? 2 : 1;
        if (doublePointsActive) setDoublePointsActive(false);
        let points = Math.max(0, 100 - difference * 2);
        if (difference === 0) points += 500;
        else if (difference <= 5) points += 200;
        else if (difference <= 15) points += 50;
        points *= pointMultiplier;
        if (difference <= 15) { setStreak(prev => prev + 1); setMaxStreak(prev => Math.max(prev, streak + 1)); setCloseCount(prev => prev + 1); setScore(prev => prev + points + (streak * 50)); SoundEngine.play(streak >= 2 ? 'combo' : 'correct'); }
        else { setStreak(0); setScore(prev => prev + points); SoundEngine.play('wrong'); mistakesRef.current.push({ position: currentScenario?.title || 'Unknown', action: targetAction, expected: actualFreq, got: userFreq, diff: difference }); busEmit.decisionIncorrect(streak, { userAction: `${targetAction} ${userFreq}%`, bestAction: `${targetAction} ${actualFreq}%`, scenario: currentScenario }); }
        setGameState('revealed');
        setTimeout(nextRound, 2000);
    };

    const handlePowerUp = useCallback((pu) => {
        if (!purchasePowerUp(pu, DiamondEngine)) return;
        onScoreUpdate?.(DiamondEngine.getBalance());
        setUsedPowerUps(prev => new Set([...prev, pu.id]));
        if (pu.id === 'DOUBLE_POINTS') { setDoublePointsActive(true); setActivePowerUp('DOUBLE_POINTS'); }
        else if (pu.id === 'HINT_REVEAL' && currentScenario) {
            // For mixed strategy, show a hint: narrow the range by ±20%
            setActivePowerUp(null);
            const actualFreq = currentScenario.frequencies[targetAction];
            const low = Math.max(0, actualFreq - 20);
            const high = Math.min(100, actualFreq + 20);
            setUserFreq(Math.round((low + high) / 2));
        }
    }, [DiamondEngine, onScoreUpdate, currentScenario, targetAction]);

    useEffect(() => {
        const handleKey = (e) => {
            if ((gameState === 'ready' || gameState === 'gameover') && (e.key === ' ' || e.key === 'Enter')) { startGame(); }
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
                <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 28, fontWeight: 900, color: '#FFD700' }}>{score.toLocaleString()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {streak > 1 && <div style={{ padding: '4px 10px', background: 'linear-gradient(135deg, #A855F7, #D946EF)', borderRadius: 16, fontWeight: 700, fontSize: 13, color: '#fff' }}>{streak}x</div>}
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{roundsPlayed}/{maxRounds}</div>
                </div>
            </div>

            {gameState === 'ready' && (
                <div style={{ marginTop: 60 }}>
                    <div style={{ fontSize: 80, marginBottom: 20 }}>{'\uD83C\uDFB0'}</div>
                    <h1 style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 32, color: '#A855F7', marginBottom: 16 }}>MIXED STRATEGY</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 30, lineHeight: 1.6 }}>Not every decision is 100% frequency.<br />Dial in the exact GTO frequency for mixed spots.<br />Correct Frequency = Massive Points!</p>
                    <button onClick={startGame} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #A855F7, #D946EF)', color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer' }}>START [SPACE]</button>
                </div>
            )}

            {(gameState === 'playing' || gameState === 'revealed') && currentScenario && (
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
                    <div style={{ fontSize: 16, color: '#A855F7', marginBottom: 12, fontWeight: 600 }}>{currentScenario.title}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 30 }}>{currentScenario.context}</div>
                    <div style={{ width: 140, height: 100, background: 'linear-gradient(145deg, #2e1a2e, #1a1a2e)', border: '2px solid #A855F7', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 40px', boxShadow: '0 10px 30px rgba(168, 85, 247, 0.2)' }}>
                        <div style={{ fontSize: 36, fontFamily: "var(--font-orbitron), 'Orbitron'", fontWeight: 900, color: '#fff' }}>{currentScenario.hand}</div>
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

            {gameState === 'gameover' && (() => {
                const accuracy = maxRounds > 0 ? Math.round((closeCount / maxRounds) * 100) : 0;
                const diamondReward = Math.floor(score / 500) + (score >= 4000 ? 20 : 0);
                const grade = accuracy >= 90 ? 'S' : accuracy >= 80 ? 'A' : accuracy >= 60 ? 'B' : accuracy >= 40 ? 'C' : 'D';
                const gradeColor = { S: '#FFD700', A: '#22C55E', B: '#3B82F6', C: '#F59E0B', D: '#EF4444' }[grade];
                return (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginTop: 20 }}>
                        {/* Performance Hero Card */}
                        <div style={{
                            background: `linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05)`,
                            border: `1px solid ${gradeColor}40`,
                            borderRadius: 20, padding: 28, marginBottom: 20, textAlign: 'center'
                        }}>
                            <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 56, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, marginBottom: 16 }}>FREQUENCY MASTERY</div>

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
                                    <div style={{ fontFamily: "var(--font-orbitron), 'Orbitron'", fontSize: 24, fontWeight: 800, color: '#A855F7' }}>{closeCount}/{maxRounds}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>WITHIN 15%</div>
                                </div>
                            </div>
                        </div>

                        {/* Animated Accuracy Bar */}
                        <AnimatedAccuracyBar accuracy={accuracy} grade={grade} label="PRECISION" />

                        {/* Position Weakness Heatmap */}
                        <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={maxRounds} />

                        {/* Weakness Analysis */}
                        {mistakesRef.current.length > 0 && (() => {
                            const sorted = [...mistakesRef.current].sort((a, b) => b.diff - a.diff).slice(0, 3);
                            return (
                                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', letterSpacing: 1.5, marginBottom: 10 }}>{'\u26A0\uFE0F'} BIGGEST MISSES</div>
                                    {sorted.map((m, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{m.position} ({m.action})</span>
                                            <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 700 }}>off by {m.diff}%</span>
                                        </div>
                                    ))}
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>Study these frequencies to improve</div>
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
                                background: 'linear-gradient(135deg, #A855F7, #D946EF)', color: '#fff',
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
                            gameTitle: 'MIXED STRATEGY',
                            grade,
                            score,
                            scoreLabel: 'SCORE',
                            stats: [
                                { label: 'Streak', value: maxStreak },
                                { label: 'Within 15%', value: `${closeCount}/${maxRounds}` },
                                { label: 'Precision', value: accuracy + '%' },
                            ],
                            color: '#A855F7',
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
                            const suggestion = getNextGameSuggestion('mixed-strategy', grade);
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
