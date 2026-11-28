/* ═══════════════════════════════════════════════════════════════════════════
   LOCAL VS PRACTICE — browser-simulated range drills
   This surface does not provide live matchmaking or authoritative ranking.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SoundEngine } from './GameEngine';
import { shareResult, savePersonalBest, getCoachingTip } from '../utils/shareCard';
import { busEmit } from '../engine/EventBus';
import PositionWeaknessHeatmap from '../components/training/PositionWeaknessHeatmap';
import AnimatedAccuracyBar from '../components/training/AnimatedAccuracyBar';
import { recordSessionWeakness } from '../utils/weaknessTracker';
import { getGamePowerUps, purchasePowerUp } from '../utils/powerUps';
import PowerUpBar from '../components/training/PowerUpBar';
import { resolveArenaCardUrl } from '../lib/clubArenaTheme';
import { CheckCircle2, Swords, XCircle } from 'lucide-react';
import { GameFrame, GameTopBar, GameIntro, GameResult, GameActions, GameShare, GameCoachTip, GameNextButton } from '../components/memory-games/PreflopGameKit';
// confetti loaded lazily on first use
let _confetti = null;
async function fireConfetti(opts) {
    try {
        if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; }
        _confetti(opts);
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT CHALLENGES
// ═══════════════════════════════════════════════════════════════════════════
const TOURNAMENT_CHALLENGES = [
    {
        id: 'tc-1',
        type: 'range-battle',
        title: 'Button First-In Range',
        description: 'Select The Lesson Baseline When Action Folds To The Button',
        position: 'BTN',
        format: '6-max 100BB',
        difficulty: 'Medium',
        question: 'In A 100 BB, 6-Max Cash Game Without Antes, Action Folds To The Button. Which Raise-First-In Range Matches This Lesson\'s Baseline?',
        options: [
            { hands: 'JJ+, AKs, AKo', percent: '4%', correct: false },
            { hands: '22+, A2s+, KTs+, QTs+, JTs, ATo+, KQo', percent: '25%', correct: false },
            { hands: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 87s+, 76s+, 65s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o', percent: '45%', correct: true },
            { hands: '22+, Any Suited Hand, Any Ace, K2o+, Q5o+, J7o+', percent: '70%', correct: false },
        ],
        explanation: 'With only the blinds left to act and postflop position, this lesson uses an approximately 45% Button raise-first-in baseline.',
    },
    {
        id: 'tc-2',
        type: 'frequency-battle',
        title: 'A♠K♠ vs 3-bet',
        description: 'Respond To A Big Blind 3-Bet With A♠K♠',
        position: 'BTN',
        format: '6-max 100BB',
        difficulty: 'Hard',
        question: 'At 100 BB, Action Folds To You On The Button And You Raise To 2.5 BB. The Big Blind 3-Bets To 11 BB. In This Lesson\'s Model, How Often Does A♠K♠ 4-Bet Versus Call?',
        heroHand: ['As', 'Ks'],
        options: [
            { action: '100% 4-bet', frequencies: { '4bet': 100, 'call': 0 }, correct: false },
            { action: '70% 4-bet / 30% Call', frequencies: { '4bet': 70, 'call': 30 }, correct: true },
            { action: '50% 4-bet / 50% Call', frequencies: { '4bet': 50, 'call': 50 }, correct: false },
            { action: '100% Call', frequencies: { '4bet': 0, 'call': 100 }, correct: false },
        ],
        explanation: 'In this stated lesson model, A♠K♠ mostly 4-bets for value while retaining a calling frequency because of its strong postflop playability.',
    },
    {
        id: 'tc-3',
        type: 'ev-comparison',
        title: 'River Bluff Spot',
        description: 'Compare EV of Bluffing vs Giving up on the River',
        position: 'BTN',
        format: '6-max 100BB',
        difficulty: 'Expert',
        question: 'At 100 BB, You Raise The Button And The Big Blind Calls. On K♥3♥2♣ You Bet 33% Pot And Get Called; The Q♠ Turn Checks Through. The 5♦ River Leaves 30 BB In The Pot And The Big Blind Checks. With 9♥8♥, Which Line Matches This Lesson\'s Bluff Model?',
        heroHand: ['9h', '8h'],
        board: ['Kh', '3h', '2c', 'Qs', '5d'],
        pot: 30,
        options: [
            { action: 'Check back', ev: 0, correct: false },
            { action: 'Bet 20BB', ev: 5.5, correct: true },
            { action: 'Bet 45BB (Overbet)', ev: 3.2, correct: false },
            { action: 'Bet 10BB (33%)', ev: 1.1, correct: false },
        ],
        explanation: 'A 20 BB bluff into 30 BB needs to work 40% of the time. This lesson’s modeled Big Blind range folds often enough for that size to outperform checking.',
    },
    {
        id: 'tc-4',
        type: 'range-battle',
        title: 'Button Versus Small Blind 3-Bet',
        description: 'Select A Button Calling Range After The Small Blind 3-Bets',
        position: 'BTN',
        format: '6-max 100BB',
        difficulty: 'Medium',
        question: 'At 100 BB, Action Folds To The Button, Who Raises To 2.5 BB. The Small Blind 3-Bets To 9 BB And The Big Blind Folds. Which Button Calling Range Matches This Lesson\'s Baseline?',
        options: [
            { hands: 'QQ+, AK', percent: '3%', correct: false },
            { hands: 'TT+, AJs+, KQs', percent: '7%', correct: false },
            { hands: '55+, A5s-A2s, A9s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo', percent: '15%', correct: true },
            { hands: '22+, ATs+, KTs+, QTs+, JTs', percent: '20%', correct: false },
        ],
        explanation: 'The Button can call the stated Small Blind 3-bet with pairs, suited aces, suited broadways, and selected offsuit broadways that retain enough equity and playability.',
    },
    {
        id: 'tc-5',
        type: 'bet-sizing',
        title: 'Nut-Flush Value Sizing',
        description: 'Choose The Lesson Baseline After The Big Blind Checks The River',
        position: 'BTN',
        format: '6-max 100BB',
        difficulty: 'Medium',
        question: 'At 100 BB, You Are On The Button With K♥Q♥ On A♥8♥5♣3♠2♥. The Big Blind Checks A 40 BB River Pot. Which Value Size Matches This Lesson\'s Model?',
        heroHand: ['Kh', 'Qh'],
        board: ['Ah', '8h', '5c', '3s', '2h'],
        pot: 40,
        options: [
            { action: 'Check', ev: 28, correct: false },
            { action: 'Bet 15BB (37%)', ev: 35, correct: false },
            { action: 'Bet 30BB (75%)', ev: 42, correct: true },
            { action: 'Bet 60BB (150%)', ev: 38, correct: false },
        ],
        explanation: 'The Ace Of Hearts Is On The Board, So K♥Q♥ Is The Nut Flush. In This Lesson’s Calling Model, 75% Pot Earns More Than The Smaller Size Without Losing Too Many Calls From Worse Flushes.',
    },
    {
        id: 'tc-6',
        type: 'defense',
        title: 'Check-Raise Defense',
        description: 'Defend Against a Check-raise on the Flop',
        position: 'BTN',
        format: '6-max 100BB',
        difficulty: 'Hard',
        question: 'At 100 BB, Action Folds To You On The Button And You Raise To 2.5 BB. The Big Blind Calls, Then Check-Raises Your 33% Pot Bet On K♦7♦2♣ To Four Times The Bet. What Is Your Best Action With A♦Q♦?',
        heroHand: ['Ad', 'Qd'],
        board: ['Kd', '7d', '2c'],
        options: [
            { action: 'Fold', ev: 0, correct: false },
            { action: 'Call', ev: 3.5, correct: true },
            { action: '3-bet bluff', ev: -2.2, correct: false },
            { action: '3-bet shove', ev: -5.8, correct: false },
        ],
        explanation: 'A♦Q♦ has the nut-flush draw plus overcard equity. Calling realizes that equity while keeping the Big Blind’s bluffs in range.',
    },
    {
        id: 'tc-7',
        type: 'preflop-decision',
        title: 'Short-Stack Push/Fold',
        description: 'Make A Two-Choice Push/Fold Decision',
        position: 'BTN',
        format: 'MTT 8BB',
        difficulty: 'Expert',
        question: 'In A Winner-Take-All, 6-Handed Tournament With Antes, Action Folds To You On The Button At 8 BB Effective. With 6♠6♥, Should You Push Or Fold?',
        heroHand: ['6s', '6h'],
        options: [
            { action: 'Push All-In', ev: 2.8, correct: true },
            { action: 'Fold', ev: 0, correct: false },
        ],
        explanation: 'At 8 BB in the stated winner-take-all push/fold model, pocket Sixes have enough equity and fold equity to push profitably from the Button.',
    },
    {
        id: 'tc-8',
        type: 'range-battle',
        title: 'UTG Open 6-Max',
        description: 'Select the Correct Under The Gun Raise-First-In Range',
        position: 'UTG',
        format: '6-max 100BB',
        difficulty: 'Easy',
        question: 'What is the correct raise-first-in range from Under The Gun in 6-max?',
        options: [
            { hands: 'AA-TT, AK, AQs', percent: '7%', correct: false },
            { hands: '22+, ATs+, KQs, AJo+, KQo', percent: '13%', correct: true },
            { hands: '22+, ATs+, KTs+, QTs+, JTs, ATo+, KJo+', percent: '20%', correct: false },
            { hands: 'QQ+, AK', percent: '4%', correct: false },
        ],
        explanation: 'In this 100 BB lesson baseline, Under The Gun raises first-in with approximately 13%, combining pocket pairs and strong broadway hands.',
    },
];

const SIMULATED_COACHES = [
    { name: 'Range Coach Alpha', avatar: 'A', difficulty: 'Balanced Script' },
    { name: 'Range Coach Beta', avatar: 'B', difficulty: 'Pressure Script' },
    { name: 'Range Coach Gamma', avatar: 'G', difficulty: 'Precision Script' },
];

const getSimulatedOpponent = (runNumber) =>
    SIMULATED_COACHES[runNumber % SIMULATED_COACHES.length];

// Card display component. #SMARTERDESIGN parity: a hand or board shown in a
// Preflop Charts game uses the authentic Club Arena 4-color deck
// (resolveArenaCardUrl), the same art as every Poker Arena table, not
// CSS-drawn white tiles. Text stays as the alt and as the fallback.
const CARD_SUIT = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const CARD_RANK = { A: 'a', K: 'k', Q: 'q', J: 'j', T: '10' };
const CARD_SUIT_LABEL = { s: 'Spades', h: 'Hearts', d: 'Diamonds', c: 'Clubs' };

const CardDisplay = ({ cards, size = 'medium' }) => {
    const sizes = { small: 30, medium: 44, large: 56 };
    const width = sizes[size] || sizes.medium;

    if (!cards || cards.length === 0) return null;

    return (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {cards.map((card, idx) => {
                const rank = card.slice(0, -1).toUpperCase();
                const suit = card.slice(-1).toLowerCase();
                const src = resolveArenaCardUrl(CARD_SUIT[suit], CARD_RANK[rank] || rank.toLowerCase());
                return (
                    <img
                        key={idx}
                        src={src || '/cards/back.webp'}
                        alt={`${rank} of ${CARD_SUIT_LABEL[suit] || suit}`}
                        width={width}
                        height={Math.round(width * 1.4)}
                        loading="lazy"
                        decoding="async"
                        style={{ width, height: 'auto', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.45)' }}
                    />
                );
            })}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT MODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function TournamentModeGame({ onExit, onScoreUpdate, DiamondEngine, diamondBalance = 0 }) {
    // State
    const [matchState, setMatchState] = useState('lobby'); // 'lobby' | 'matching' | 'battle' | 'result'
    const [opponent, setOpponent] = useState(null);
    const [currentRound, setCurrentRound] = useState(0);
    const [playerScore, setPlayerScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(0);
    const [currentChallenge, setCurrentChallenge] = useState(null);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [roundsPlayed, setRoundsPlayed] = useState(0);
    const [matchHistory, setMatchHistory] = useState([]);
    const matchRef = useRef([]);
    const setupTimerRef = useRef(null);
    const mistakesRef = useRef([]);
    const [usedPowerUps, setUsedPowerUps] = useState(new Set());
    const [activePowerUp, setActivePowerUp] = useState(null);
    const [streakFreezeAvailable, setStreakFreezeAvailable] = useState(false);
    const [eliminatedOptionIdx, setEliminatedOptionIdx] = useState(null);
    const availablePowerUps = getGamePowerUps('tournament');

    const ROUNDS_PER_MATCH = 5;

    // Prepare a deterministic browser-only drill. No player search, live
    // presence, account rating, or remote opponent exists in this mode.
    const startLocalPractice = () => {
        setMatchState('matching');
        const offset = (roundsPlayed * ROUNDS_PER_MATCH) % TOURNAMENT_CHALLENGES.length;
        matchRef.current = Array.from(
            { length: ROUNDS_PER_MATCH },
            (_, index) => TOURNAMENT_CHALLENGES[(offset + index) % TOURNAMENT_CHALLENGES.length]
        );
        setOpponent(getSimulatedOpponent(roundsPlayed));
        clearTimeout(setupTimerRef.current);
        setupTimerRef.current = setTimeout(() => {
            setMatchState('battle');
            setCurrentRound(0);
            setPlayerScore(0);
            setOpponentScore(0);
            setCurrentChallenge(matchRef.current[0]);
            mistakesRef.current = [];
            setUsedPowerUps(new Set());
            setActivePowerUp(null);
            setStreakFreezeAvailable(false);
            setEliminatedOptionIdx(null);
        }, 500);
    };

    // Cleanup local setup timer on unmount.
    useEffect(() => {
        return () => clearTimeout(setupTimerRef.current);
    }, []);

    // Handle option selection
    const handleOptionSelect = (option, index) => {
        if (showResult || index === eliminatedOptionIdx) return;

        setSelectedOption(index);
        setShowResult(true);
        setEliminatedOptionIdx(null);

        const isCorrect = option.correct !== undefined
            ? option.correct
            : option.ev && option.ev === Math.max(...currentChallenge.options.map(o => o.ev || 0));

        if (isCorrect) {
            setPlayerScore(prev => prev + 1);
            SoundEngine.play('correct');
        } else {
            // Check streak freeze — saves one round loss
            const freezeSaved = streakFreezeAvailable;
            if (freezeSaved) {
                setStreakFreezeAvailable(false);
                SoundEngine.play('correct'); // saved!
            } else {
                // The scripted coach receives this local practice round.
                setOpponentScore(prev => prev + 1);
                SoundEngine.play('wrong');
            }
            const correctOpt = currentChallenge.options.find(o => o.correct !== undefined ? o.correct : o.ev === Math.max(...currentChallenge.options.map(x => x.ev || 0)));
            mistakesRef.current.push({
                title: currentChallenge.title,
                type: currentChallenge.type,
                correct: correctOpt?.action || correctOpt?.hands || '?',
                picked: option.action || option.hands || '?',
            });
            busEmit.decisionIncorrect(0, { userAction: option.action || option.hands, bestAction: correctOpt?.action || correctOpt?.hands, scenario: currentChallenge });
        }
    };

    // Handle power-up activation
    const handlePowerUp = async (pu) => {
        const purchase = await purchasePowerUp(pu, DiamondEngine);
        if (!purchase.success) return;
        if (Number.isFinite(purchase.balance)) onScoreUpdate?.(purchase.balance);
        setUsedPowerUps(prev => new Set([...prev, pu.id]));
        if (pu.id === 'STREAK_FREEZE') { setStreakFreezeAvailable(true); setActivePowerUp('STREAK_FREEZE'); }
        else if (pu.id === 'HINT_REVEAL' && currentChallenge) {
            setActivePowerUp(null);
            const wrongIndices = currentChallenge.options.map((o, i) => {
                const isCorrect = o.correct !== undefined ? o.correct : o.ev === Math.max(...currentChallenge.options.map(x => x.ev || 0));
                return !isCorrect ? i : -1;
            }).filter(i => i >= 0);
            if (wrongIndices.length > 0) {
                setEliminatedOptionIdx(wrongIndices[Math.floor(Math.random() * wrongIndices.length)]);
            }
        }
    };

    // Handle next round
    const handleNextRound = () => {
        setSelectedOption(null);
        setShowResult(false);
        setEliminatedOptionIdx(null);

        if (currentRound < ROUNDS_PER_MATCH - 1) {
            setCurrentRound(prev => prev + 1);
            setCurrentChallenge(matchRef.current[currentRound + 1]);
        } else {
            // Local practice run complete.
            const playerWon = playerScore > opponentScore;
            const accuracy = Math.round((playerScore / ROUNDS_PER_MATCH) * 100);
            savePersonalBest('tournament', accuracy, playerWon ? 'S' : 'D');
            setRoundsPlayed(prev => prev + 1);

            // Component state only: this is visibly session-local history, not
            // an account ranking or leaderboard write.
            setMatchHistory(prev => [...prev, {
                opponent: opponent.name,
                result: playerWon ? 'W' : 'L',
                score: `${playerScore}-${opponentScore}`,
                accuracy,
            }]);

            if (playerWon) {
                SoundEngine.play('levelUp');
                fireConfetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }

            setMatchState('result');
            recordSessionWeakness('tournament-local-practice', mistakesRef.current, ROUNDS_PER_MATCH);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LOBBY VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'lobby') {
        const winCount = matchHistory.filter(m => m.result === 'W').length;
        const lossCount = matchHistory.filter(m => m.result === 'L').length;
        const winRate = matchHistory.length > 0 ? Math.round((winCount / matchHistory.length) * 100) : 0;
        return (
            <GameFrame>
                <GameTopBar onExit={onExit} />
                <GameIntro
                    icon={Swords}
                    kicker="Browser-Simulated Range Drill"
                    title="Local VS Practice"
                    onStart={startLocalPractice}
                    startLabel="Start Simulated Practice"
                    footer={matchHistory.length > 0 && (
                        <div style={{ marginTop: 18, textAlign: 'left' }}>
                            <div className="preflop-sd-kicker" style={{ marginBottom: 8 }}>Practice Runs This Session</div>
                            <div style={{ display: 'grid', gap: 6 }}>
                                {matchHistory.slice(-5).reverse().map((match, idx) => (
                                    <div key={idx} className="preflop-sd-row" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                                        {match.result === 'W'
                                            ? <CheckCircle2 size={18} color="#39e9a5" aria-label="Win" />
                                            : <XCircle size={18} color="#ff5c74" aria-label="Loss" />}
                                        <span style={{ flex: 1, minWidth: 0, color: '#f2f7ff' }}>Vs Simulated {match.opponent}</span>
                                        <span style={{ color: '#bdd0e2' }}>{match.score}</span>
                                        <span style={{ color: '#f2f7ff', fontWeight: 700 }}>{match.accuracy}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                >
                    <div className="preflop-sd-row" style={{ marginBottom: 16, textAlign: 'center' }}>
                        <div className="preflop-sd-kicker" style={{ marginBottom: 4 }}>Session-Only Practice</div>
                        <div style={{ color: '#bdd0e2', fontSize: 15 }}>
                            No Live Opponent, Matchmaking, Account Rank, Leaderboard, Or Diamond Settlement
                        </div>
                    </div>
                    <div className="preflop-sd-metrics" style={{ marginBottom: 0 }}>
                        <div className="preflop-sd-metric"><strong>{winCount}</strong><span>Wins</span></div>
                        <div className="preflop-sd-metric"><strong>{lossCount}</strong><span>Losses</span></div>
                        <div className="preflop-sd-metric"><strong>{winRate}%</strong><span>Win Rate</span></div>
                    </div>
                </GameIntro>
            </GameFrame>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LOCAL SETUP VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'matching') {
        return (
            <GameFrame>
                <div className="preflop-sd-surface" style={{ marginTop: 24 }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{ textAlign: 'center' }}
                    >
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                            className="preflop-sd-emblem"
                            aria-hidden="true"
                        >
                            <Swords size={40} strokeWidth={1.8} />
                        </motion.div>
                        <h2 className="preflop-sd-title">Preparing Local Simulation...</h2>
                        <p className="preflop-sd-copy">
                            No Player Search Is Running. This Browser Is Loading A Scripted Practice Coach.
                        </p>

                        {opponent && (
                            <div style={styles.authorityDisplay}>
                                <div className="preflop-sd-emblem" style={{ width: 56, height: 56, margin: 0, fontSize: 24, fontWeight: 700 }} aria-hidden="true">{opponent.avatar}</div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={styles.authorityName}>{opponent.name}</div>
                                    <div style={styles.authorityValue}>Simulated Coach / {opponent.difficulty}</div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                clearTimeout(setupTimerRef.current);
                                setMatchState('lobby');
                            }}
                            type="button"
                            className="preflop-sd-button"
                            style={{ marginTop: 12 }}
                        >
                            Cancel Local Practice
                        </button>
                    </motion.div>
                </div>
            </GameFrame>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BATTLE VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'battle' && currentChallenge) {
        return (
            <GameFrame>
                {/* Score Header */}
                <div style={styles.battleHeader}>
                    {/* Player */}
                    <div style={styles.playerPanel}>
                        <div className="preflop-sd-emblem" style={{ width: 40, height: 40, margin: 0, fontSize: 15, fontWeight: 700 }} aria-hidden="true">You</div>
                        <div>
                            <div style={styles.playerName}>You</div>
                            <div style={styles.playerMeta}>Local Player</div>
                        </div>
                    </div>

                    {/* Score */}
                    <div style={styles.scorePanel}>
                        <span style={styles.scoreNumber}>{playerScore}</span>
                        <span style={styles.scoreSeparator}>-</span>
                        <span style={styles.scoreNumber}>{opponentScore}</span>
                    </div>

                    {/* Opponent */}
                    <div style={styles.playerPanel}>
                        <div className="preflop-sd-emblem" style={{ width: 40, height: 40, margin: 0, fontSize: 18, fontWeight: 700 }} aria-hidden="true">{opponent?.avatar}</div>
                        <div>
                            <div style={styles.playerName}>{opponent?.name}</div>
                            <div style={styles.playerMeta}>Simulated Coach</div>
                        </div>
                    </div>
                </div>

                <div style={styles.practiceBoundary}>
                    Local Simulation: Scores Exist Only In This Run
                </div>

                {/* Round Indicator */}
                <div style={styles.roundIndicator}>
                    Round {currentRound + 1} Of {ROUNDS_PER_MATCH}
                </div>

                {/* Power-Ups */}
                {!showResult && (
                    <PowerUpBar
                        powerUps={availablePowerUps}
                        usedPowerUps={usedPowerUps}
                        activePowerUp={activePowerUp}
                        onActivate={handlePowerUp}
                        diamondBalance={diamondBalance}
                        compact
                    />
                )}

                {/* Challenge Card */}
                <div style={styles.challengeCard}>
                    <div style={styles.challengeHeader}>
                        <span style={styles.challengeType}>{currentChallenge.type.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                        <span style={{
                            ...styles.difficultyBadge,
                            color: currentChallenge.difficulty === 'Expert' ? '#ff8a9a' :
                                currentChallenge.difficulty === 'Hard' ? '#ffb08a' :
                                    currentChallenge.difficulty === 'Medium' ? '#86daff' : '#6ef0b5'
                        }}>
                            {currentChallenge.difficulty}
                        </span>
                    </div>

                    <h2 style={styles.challengeTitle}>{currentChallenge.title}</h2>
                    <p style={styles.challengeQuestion}>{currentChallenge.question}</p>

                    {/* Hero Hand if available */}
                    {currentChallenge.heroHand && (
                        <div style={{ marginBottom: 20 }}>
                            <div className="preflop-sd-kicker" style={{ marginBottom: 8 }}>Your Hand</div>
                            <CardDisplay cards={currentChallenge.heroHand} size="medium" />
                        </div>
                    )}

                    {/* Board if available */}
                    {currentChallenge.board && (
                        <div style={{ marginBottom: 20 }}>
                            <div className="preflop-sd-kicker" style={{ marginBottom: 8 }}>Board</div>
                            <CardDisplay cards={currentChallenge.board} size="medium" />
                        </div>
                    )}

                    {/* Options */}
                    <div style={styles.optionsGrid}>
                        {currentChallenge.options.map((option, idx) => {
                            const isSelected = selectedOption === idx;
                            const isCorrect = option.correct !== undefined
                                ? option.correct
                                : option.ev === Math.max(...currentChallenge.options.map(o => o.ev || 0));
                            const isEliminated = eliminatedOptionIdx === idx;

                            let bgColor = isEliminated ? 'rgba(50,50,50,0.15)' : 'linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c)';
                            let borderColor = isEliminated ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.2)';

                            if (showResult) {
                                if (isCorrect) {
                                    bgColor = 'rgba(0, 255, 136, 0.2)';
                                    borderColor = '#00ff88';
                                } else if (isSelected && !isCorrect) {
                                    bgColor = 'rgba(255, 68, 68, 0.2)';
                                    borderColor = '#ff4444';
                                }
                            } else if (isSelected) {
                                bgColor = 'rgba(25, 129, 236, 0.32)';
                                borderColor = '#86daff';
                            }

                            return (
                                <motion.button
                                    key={idx}
                                    whileHover={{ scale: (showResult || isEliminated) ? 1 : 1.02 }}
                                    whileTap={{ scale: (showResult || isEliminated) ? 1 : 0.98 }}
                                    onClick={() => handleOptionSelect(option, idx)}
                                    disabled={showResult || isEliminated}
                                    style={{
                                        ...styles.optionButton,
                                        background: bgColor,
                                        borderColor: borderColor,
                                        opacity: isEliminated ? 0.25 : 1,
                                        textDecoration: isEliminated ? 'line-through' : 'none',
                                    }}
                                >
                                    <div style={styles.optionText}>
                                        {isEliminated ? `✗ ${option.action || option.hands}` : (option.action || option.hands)}
                                    </div>
                                    {option.percent && (
                                        <div style={styles.optionPercent}>{option.percent}</div>
                                    )}
                                    {showResult && option.ev !== undefined && (
                                        <div style={{
                                            fontSize: 12,
                                            color: option.ev >= 0 ? '#00ff88' : '#ff4444',
                                            marginTop: 4
                                        }}>
                                            EV: {option.ev >= 0 ? '+' : ''}{option.ev}bb
                                        </div>
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Explanation */}
                    <AnimatePresence>
                        {showResult && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={styles.explanationBox}
                            >
                                <div style={{
                                    fontSize: 18,
                                    fontWeight: 700,
                                    marginBottom: 8,
                                    color: currentChallenge.options[selectedOption]?.correct ? '#00ff88' : '#ff4444'
                                }}>
                                    {currentChallenge.options[selectedOption]?.correct
                                        ? 'Correct - You Win This Practice Round'
                                        : 'Review This Spot - The Simulated Coach Wins This Round'}
                                </div>
                                <p style={styles.explanationText}>{currentChallenge.explanation}</p>
                                <GameNextButton onClick={handleNextRound}>
                                    {currentRound < ROUNDS_PER_MATCH - 1 ? 'Next Round →' : 'View Results →'}
                                </GameNextButton>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </GameFrame>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'result') {
        const lastMatch = matchHistory[matchHistory.length - 1];
        const playerWon = lastMatch?.result === 'W';
        const accuracy = Math.round((playerScore / ROUNDS_PER_MATCH) * 100);

        return (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                <GameFrame>
                    <GameResult
                        headline={`${playerScore} - ${opponentScore}`}
                        label={`${playerWon ? 'Local Practice Win' : 'Local Practice Review'} Vs Simulated ${opponent?.name || 'Practice Coach'}`}
                        metrics={[
                            { label: 'Local Score', value: lastMatch?.score || `${playerScore}-${opponentScore}` },
                            { label: 'Accuracy', value: `${accuracy}%` },
                            { label: 'Session Only', value: 'Local' },
                        ]}
                    />

                    <AnimatedAccuracyBar accuracy={accuracy} grade={playerWon ? 'A' : 'D'} label="Round Win Rate" />

                    <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={ROUNDS_PER_MATCH} />

                    {mistakesRef.current.length > 0 && (
                        <div className="preflop-sd-row" style={{ marginBottom: 12 }}>
                            <div className="preflop-sd-kicker" style={{ marginBottom: 8, color: '#ff8a9a' }}>Rounds Lost</div>
                            {mistakesRef.current.map((m, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                                    padding: '7px 0',
                                    borderBottom: i < mistakesRef.current.length - 1 ? '1px solid rgba(134,218,255,0.12)' : 'none'
                                }}>
                                    <div>
                                        <span style={{ color: '#f2f7ff', fontSize: 13, fontWeight: 600 }}>{m.title}</span>
                                        <span style={{ color: '#93a9bd', fontSize: 12, marginLeft: 6 }}>{m.type.replace('-', ' ')}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#bdd0e2' }}>
                                        <span style={{ color: '#ff8a9a' }}>{typeof m.picked === 'string' && m.picked.length > 20 ? m.picked.slice(0, 20) + '...' : m.picked}</span>
                                        <span style={{ margin: '0 4px' }}>{'\u2192'}</span>
                                        <span style={{ color: '#6ef0b5' }}>{typeof m.correct === 'string' && m.correct.length > 20 ? m.correct.slice(0, 20) + '...' : m.correct}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <GameActions
                        onReplay={startLocalPractice}
                        replayLabel="Start Next Local Run"
                        onExit={() => setMatchState('lobby')}
                        exitLabel="Back To Practice Menu"
                    />

                    <GameShare onShare={() => shareResult({
                        gameTitle: 'LOCAL VS PRACTICE',
                        grade: playerWon ? 'S' : 'D',
                        score: playerScore,
                        scoreLabel: playerWon ? 'LOCAL WIN' : 'LOCAL REVIEW',
                        stats: [
                            { label: 'Local Score', value: lastMatch?.score || `${playerScore}-${opponentScore}` },
                            { label: 'Accuracy', value: accuracy + '%' },
                            { label: 'Settlement', value: 'Session Only' },
                        ],
                        color: '#86daff',
                        subtitle: `Simulated drill vs ${opponent?.name || 'Practice Coach'}`,
                    })} />

                    <GameCoachTip>{getCoachingTip(playerWon ? 'A' : 'C')}</GameCoachTip>
                </GameFrame>
            </motion.div>
        );
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    authorityDisplay: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 32,
    },
    authorityName: {
        fontSize: 20,
        fontWeight: 700,
        color: '#f2f7ff',
        fontFamily: "var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif",
    },
    authorityValue: {
        fontSize: 15,
        color: '#bdd0e2',
    },
    battleHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        background: 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
        border: '3px solid transparent',
        borderImage: "url('/images/smarterdesign/chrome-stat.webp') 11 / 4px stretch",
        marginBottom: 16,
    },
    playerPanel: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    playerName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    playerMeta: {
        fontSize: 12,
        fontWeight: 500,
        color: '#bdd0e2',
    },
    practiceBoundary: {
        margin: '-8px 0 16px',
        textAlign: 'center',
        fontSize: 11,
        color: '#86daff',
        fontWeight: 700,
        letterSpacing: 0.5,
    },
    scorePanel: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    scoreNumber: {
        fontSize: 34,
        fontWeight: 700,
        color: '#f2f7ff',
        fontFamily: "var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif",
        fontVariantNumeric: 'tabular-nums',
    },
    scoreSeparator: {
        fontSize: 24,
        color: '#93a9bd',
    },
    roundIndicator: {
        textAlign: 'center',
        fontSize: 14,
        color: '#bdd0e2',
        marginBottom: 12,
    },
    challengeCard: {
        background: 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
        border: '5px solid transparent',
        borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.42)',
        padding: 18,
    },
    challengeHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    challengeType: {
        fontSize: 13,
        color: '#86daff',
        fontWeight: 700,
        letterSpacing: 0.5,
        fontFamily: "var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif",
    },
    difficultyBadge: {
        padding: '2px 10px',
        border: '2px solid transparent',
        borderImage: "url('/images/smarterdesign/chrome-stat.webp') 11 / 3px stretch",
        background: '#0a1726',
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif",
    },
    challengeTitle: {
        fontSize: 26,
        fontWeight: 700,
        color: '#f2f7ff',
        marginBottom: 8,
        fontFamily: "var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif",
    },
    challengeQuestion: {
        fontSize: 16,
        color: '#bdd0e2',
        marginBottom: 24,
        lineHeight: 1.5,
    },
    optionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginBottom: 24,
    },
    optionButton: {
        minHeight: 52,
        padding: '14px',
        border: '2px solid',
        borderRadius: 0,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.2s ease',
    },
    optionText: {
        wordBreak: 'break-word',
    },
    optionPercent: {
        fontSize: 12,
        color: '#bdd0e2',
        marginTop: 4,
    },
    explanationBox: {
        background: '#071422',
        border: '3px solid transparent',
        borderImage: "url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch",
        padding: 16,
        marginTop: 16,
    },
    explanationText: {
        fontSize: 14,
        color: '#bdd0e2',
        lineHeight: 1.6,
        marginBottom: 20,
    },
};
