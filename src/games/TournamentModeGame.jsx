/* ═══════════════════════════════════════════════════════════════════════════
   🏆 TOURNAMENT MODE — Competitive Ranked Battles with ELO
   Head-to-head style range battles with ELO ranking system
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { SoundEngine } from './GameEngine';
import { shareResult, savePersonalBest, getCoachingTip, getNextGameSuggestion } from '../utils/shareCard';
import { busEmit } from '../engine/EventBus';
import PositionWeaknessHeatmap from '../components/training/PositionWeaknessHeatmap';
import AnimatedAccuracyBar from '../components/training/AnimatedAccuracyBar';
import { recordSessionWeakness } from '../utils/weaknessTracker';
import { getGamePowerUps, purchasePowerUp } from '../utils/powerUps';
import PowerUpBar from '../components/training/PowerUpBar';
// confetti loaded lazily on first use
let _confetti = null;
async function fireConfetti(opts) {
    try {
        if (!_confetti) { const m = await import('canvas-confetti'); _confetti = m.default || m; }
        _confetti(opts);
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
}

// Supabase services for persistence
import gameSessionService from '../services/GameSessionService';
import achievementService from '../services/AchievementService';
import leaderboardService from '../services/LeaderboardService';
import { processGameResult } from './ELOService';

// ═══════════════════════════════════════════════════════════════════════════
// ELO SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
const calculateEloChange = (playerRating, opponentRating, won, kFactor = 32) => {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    const actualScore = won ? 1 : 0;
    return Math.round(kFactor * (actualScore - expectedScore));
};

const getRankTier = (elo) => {
    if (elo >= 2400) return { name: 'Grandmaster', color: '#FFD700', icon: '👑' };
    if (elo >= 2000) return { name: 'Master', color: '#C0C0C0', icon: '💎' };
    if (elo >= 1800) return { name: 'Diamond', color: '#00D4FF', icon: '💠' };
    if (elo >= 1600) return { name: 'Platinum', color: '#8B5CF6', icon: '🔮' };
    if (elo >= 1400) return { name: 'Gold', color: '#FFB800', icon: '🥇' };
    if (elo >= 1200) return { name: 'Silver', color: '#A8A8A8', icon: '🥈' };
    if (elo >= 1000) return { name: 'Bronze', color: '#CD7F32', icon: '🥉' };
    return { name: 'Beginner', color: '#666', icon: '🎮' };
};

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

// Avatar assignment by specialty
const SPECIALTY_AVATARS = {
    cash_games: '💰', tournaments: '🏆', high_stakes: '🎩', mixed_games: '🔀',
    online: '💻', live: '🎯', plo: '🃏', stud: '♠️',
};
const FALLBACK_AVATARS = ['🦈', '🧙', '🎩', '🤖', '🎯', '👑', '🃏', '⚡', '🔒', '🧩', '💎', '🛡️', '📊', '🎲', '🏅'];

// Horse pool — loaded from Supabase content_authors (300+ real personas)
let _horsesCache = null;
let _horsesFetchPromise = null;

async function loadHorses() {
    if (_horsesCache) return _horsesCache;
    if (_horsesFetchPromise) return _horsesFetchPromise;

    _horsesFetchPromise = (async () => {
        try {
            const { data, error } = await supabase
                .from('content_authors')
                .select('alias, name, location, specialty, stakes')
                .order('name');

            if (error || !data || data.length === 0) {
                console.warn('[Tournament] Failed to load horses, using fallback');
                return null;
            }

            _horsesCache = data.map(h => ({
                name: h.alias || h.name,
                displayName: h.name,
                location: h.location,
                specialty: h.specialty,
                stakes: h.stakes,
                avatar: SPECIALTY_AVATARS[h.specialty] || FALLBACK_AVATARS[Math.floor(Math.random() * FALLBACK_AVATARS.length)],
            }));
            console.debug(`[Tournament] Loaded ${_horsesCache.length} horses from Supabase`);
            return _horsesCache;
        } catch (err) {
            console.warn('[Tournament] Horse fetch error:', err);
            return null;
        } finally {
            _horsesFetchPromise = null;
        }
    })();
    return _horsesFetchPromise;
}

// Eagerly start loading horses when this module loads
if (typeof window !== 'undefined') loadHorses();

const getSimulatedOpponent = (playerElo, horses) => {
    const eloVariance = Math.random() * 300 - 150; // ±150 ELO

    if (horses && horses.length > 0) {
        const horse = horses[Math.floor(Math.random() * horses.length)];
        return {
            name: horse.name,
            displayName: horse.displayName,
            location: horse.location,
            elo: Math.round(playerElo + eloVariance),
            avatar: horse.avatar,
        };
    }

    // Fallback if Supabase unavailable
    const names = ['GTO_Shark', 'RangeGuru', 'PokerWiz', 'SolverPro', 'ACE_Hunter', 'NitQueen', 'BluffMaster', 'EV_Wizard'];
    const idx = Math.floor(Math.random() * names.length);
    return {
        name: names[idx],
        displayName: names[idx],
        location: '',
        elo: Math.round(playerElo + eloVariance),
        avatar: FALLBACK_AVATARS[idx % FALLBACK_AVATARS.length],
    };
};

// Card display component
const CardDisplay = ({ cards, size = 'medium' }) => {
    const sizeStyles = {
        small: { width: 28, height: 40, fontSize: 12 },
        medium: { width: 40, height: 56, fontSize: 16 },
        large: { width: 52, height: 72, fontSize: 20 },
    };
    const style = sizeStyles[size];

    const getSuitColor = (suit) => {
        if (suit === 'h' || suit === 'd') return '#ff4444';
        return '#111';
    };

    const getSuitSymbol = (suit) => {
        const symbols = { h: '♥', d: '♦', c: '♣', s: '♠' };
        return symbols[suit] || suit;
    };

    if (!cards || cards.length === 0) return null;

    return (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {cards.map((card, idx) => {
                const rank = card.slice(0, -1);
                const suit = card.slice(-1);
                return (
                    <div
                        key={idx}
                        style={{
                            width: style.width,
                            height: style.height,
                            background: 'linear-gradient(135deg, #fff, #f0f0f0)',
                            borderRadius: 6,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: style.fontSize,
                            fontWeight: 700,
                            color: getSuitColor(suit),
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            border: '1px solid rgba(0,0,0,0.1)',
                        }}
                    >
                        <span>{rank}</span>
                        <span style={{ fontSize: style.fontSize * 0.8 }}>{getSuitSymbol(suit)}</span>
                    </div>
                );
            })}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// TOURNAMENT MODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function TournamentModeGame({ onExit, onScoreUpdate, DiamondEngine, userId }) {
    // State
    const [playerElo, setPlayerElo] = useState(1200);
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
    const [matchmakingPhase, setMatchmakingPhase] = useState('searching'); // 'searching' | 'found' | 'loading'
    const [searchTimer, setSearchTimer] = useState(0);
    const [playersOnline, setPlayersOnline] = useState(0);
    const [horses, setHorses] = useState(null);
    const matchRef = useRef([]);
    const searchTimerRef = useRef(null);
    const mistakesRef = useRef([]);
    const [usedPowerUps, setUsedPowerUps] = useState(new Set());
    const [activePowerUp, setActivePowerUp] = useState(null);
    const [streakFreezeAvailable, setStreakFreezeAvailable] = useState(false);
    const [eliminatedOptionIdx, setEliminatedOptionIdx] = useState(null);
    const availablePowerUps = getGamePowerUps('tournament');

    // Load horses from Supabase on mount
    useEffect(() => {
        loadHorses().then(data => { if (data) setHorses(data); });
    }, []);

    const ROUNDS_PER_MATCH = 5;

    // Load ELO from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedElo = localStorage.getItem('memory_tournament_elo');
            if (savedElo) setPlayerElo(parseInt(savedElo));
        }
    }, []);

    // Save ELO updates
    const updatePlayerElo = (newElo) => {
        setPlayerElo(newElo);
        if (typeof window !== 'undefined') {
            localStorage.setItem('memory_tournament_elo', newElo.toString());
        }
    };

    // Start matchmaking — simulates searching for real players, then matches a ghost player after ~7s
    const startMatchmaking = () => {
        setMatchState('matching');
        setMatchmakingPhase('searching');
        setSearchTimer(0);
        // Use horse count as base for "players online" — feels authentic
        const horseCount = horses?.length || 100;
        setPlayersOnline(Math.floor(Math.random() * Math.min(horseCount, 80)) + Math.floor(horseCount * 0.6));

        // Animate the search timer
        let elapsed = 0;
        clearInterval(searchTimerRef.current);
        searchTimerRef.current = setInterval(() => {
            elapsed += 100;
            setSearchTimer(elapsed);
            // Randomly fluctuate players online count for realism
            if (elapsed % 1500 === 0) {
                setPlayersOnline(prev => prev + Math.floor(Math.random() * 5) - 2);
            }
        }, 100);

        // After ~7 seconds, "find" a ghost player opponent
        setTimeout(() => {
            clearInterval(searchTimerRef.current);
            setMatchmakingPhase('found');
            SoundEngine.play('matchFound');

            const opp = getSimulatedOpponent(playerElo, horses);
            setOpponent(opp);

            // BUG-12 FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
            const shuffled = [...TOURNAMENT_CHALLENGES];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            matchRef.current = shuffled.slice(0, ROUNDS_PER_MATCH);

            // Show "opponent found" for 2 seconds then start battle
            setTimeout(() => {
                setMatchmakingPhase('loading');
                setTimeout(() => {
                    setMatchState('battle');
                    setCurrentRound(0);
                    setPlayerScore(0);
                    setOpponentScore(0);
                    setCurrentChallenge(matchRef.current[0]);
                    mistakesRef.current = [];
                    setUsedPowerUps(new Set()); setActivePowerUp(null); setStreakFreezeAvailable(false); setEliminatedOptionIdx(null);
                }, 800);
            }, 2000);
        }, 5000 + Math.random() * 4000); // 5-9 seconds (avg ~7s)
    };

    // Cleanup search timer on unmount
    useEffect(() => {
        return () => clearInterval(searchTimerRef.current);
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
                // Opponent "wins" this round
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
            // Match complete
            const playerWon = playerScore > opponentScore;
            savePersonalBest('tournament', playerElo + (playerWon ? 10 : 0), playerWon ? 'S' : 'D');
            const eloChange = calculateEloChange(playerElo, opponent.elo, playerWon);
            const newElo = playerElo + eloChange;

            updatePlayerElo(newElo);
            setRoundsPlayed(prev => prev + 1);

            // Record match in history
            setMatchHistory(prev => [...prev, {
                opponent: opponent.name,
                result: playerWon ? 'W' : 'L',
                score: `${playerScore}-${opponentScore}`,
                eloChange,
            }]);

            // Award diamonds for winning
            const diamondsEarned = playerWon ? Math.round((5 + Math.abs(eloChange) / 10)) : 0;
            if (diamondsEarned > 0 && DiamondEngine) {
                void DiamondEngine.award(diamondsEarned).then(newBalance => {
                    if (Number.isFinite(newBalance)) onScoreUpdate?.(newBalance);
                });
            }

            if (playerWon) {
                SoundEngine.play('levelUp');
                fireConfetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // 📊 PERSIST TO SUPABASE — Session, ELO, Leaderboard, Achievements
            // ═══════════════════════════════════════════════════════════════════════════
            if (userId) {
                const gameMode = 'tournament';
                const accuracy = Math.round((playerScore / ROUNDS_PER_MATCH) * 100);

                // 1. Update leaderboard (only if won)
                if (playerWon) {
                    leaderboardService.updateLeaderboard(
                        userId,
                        gameMode,
                        1, // level
                        newElo,
                        accuracy,
                        0, // timeTaken
                        null // sessionId
                    ).then(res => {
                        console.debug('[Tournament] Leaderboard updated:', res);
                    }).catch(err => {
                        console.warn('[Tournament] Leaderboard update failed:', err);
                    });
                }

                // 2. Update ELO rating in profiles table
                processGameResult(userId, 1, accuracy, roundsPlayed)
                    .then(eloResult => {
                        console.debug('[Tournament] ELO persisted:', eloResult);
                    }).catch(err => {
                        console.warn('[Tournament] ELO persist failed:', err);
                    });

                // 3. Record game session for analytics
                gameSessionService.recordSession(userId, {
                    gameMode,
                    level: 1,
                    scenarioId: `match-vs-${opponent.name}`,
                    score: playerScore,
                    accuracy,
                    timeTaken: 0,
                    diamondsSpent: 0,
                    diamondsEarned: 0,
                    completed: true
                }).then(sessionResult => {
                    console.debug('[Tournament] Session recorded:', sessionResult);
                }).catch(err => {
                    console.warn('[Tournament] Session recording failed:', err);
                });

                // 4. Check and unlock achievements
                achievementService.checkAndUnlock(userId, {
                    gamesPlayed: roundsPlayed + 1,
                    accuracy,
                    timeTaken: 0,
                    level: 1,
                    gameMode,
                    totalDiamonds: 0,
                    aiScenariosCompleted: 0,
                    currentStreak: playerWon ? 1 : 0,
                    modesPlayed: [gameMode]
                }).then(unlocked => {
                    if (unlocked.length > 0) {
                        console.debug('[Tournament] Achievements unlocked:', unlocked);
                    }
                }).catch(err => {
                    console.warn('[Tournament] Achievement check failed:', err);
                });
            }

            setMatchState('result');
            recordSessionWeakness('tournament', mistakesRef.current, roundsPlayed);
        }
    };

    const playerRank = getRankTier(playerElo);

    // ═══════════════════════════════════════════════════════════════════════
    // LOBBY VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'lobby') {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <button onClick={onExit} style={styles.backButton}>
                        ← Exit
                    </button>
                </div>

                <div style={styles.lobbyCard}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>⚔️</div>
                    <h1 style={styles.lobbyTitle}>TOURNAMENT MODE</h1>
                    <p style={styles.lobbySubtitle}>Ranked Range Battles</p>

                    {/* Player Rank Display */}
                    <div style={styles.rankDisplay}>
                        <div style={{ fontSize: 48 }}>{playerRank.icon}</div>
                        <div>
                            <div style={{ ...styles.rankName, color: playerRank.color }}>
                                {playerRank.name}
                            </div>
                            <div style={styles.eloValue}>{playerElo} ELO</div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div style={styles.statsRow}>
                        <div style={styles.statItem}>
                            <div style={styles.statNumber}>{matchHistory.filter(m => m.result === 'W').length}</div>
                            <div style={styles.statLabel}>Wins</div>
                        </div>
                        <div style={styles.statItem}>
                            <div style={styles.statNumber}>{matchHistory.filter(m => m.result === 'L').length}</div>
                            <div style={styles.statLabel}>Losses</div>
                        </div>
                        <div style={styles.statItem}>
                            <div style={styles.statNumber}>
                                {matchHistory.length > 0
                                    ? Math.round((matchHistory.filter(m => m.result === 'W').length / matchHistory.length) * 100)
                                    : 0}%
                            </div>
                            <div style={styles.statLabel}>Win Rate</div>
                        </div>
                    </div>

                    <button onClick={startMatchmaking} style={styles.findMatchButton}>
                        ⚔️ FIND MATCH
                    </button>

                    {/* Recent Matches */}
                    {matchHistory.length > 0 && (
                        <div style={styles.recentMatches}>
                            <h3 style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>RECENT MATCHES</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {matchHistory.slice(-5).reverse().map((match, idx) => (
                                    <div key={idx} style={styles.matchItem}>
                                        <span>{match.result === 'W' ? '✅' : '❌'}</span>
                                        <span style={{ color: '#fff' }}>Vs {match.opponent}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{match.score}</span>
                                        <span style={{ color: match.eloChange >= 0 ? '#00ff88' : '#ff4444' }}>
                                            {match.eloChange >= 0 ? '+' : ''}{match.eloChange}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MATCHMAKING VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'matching') {
        const searchSec = (searchTimer / 1000).toFixed(1);
        const opponentRankPreview = opponent ? getRankTier(opponent.elo) : null;

        return (
            <div style={styles.container}>
                <div style={styles.matchmakingCard}>
                    <AnimatePresence mode="wait">
                        {matchmakingPhase === 'searching' && (
                            <motion.div
                                key="searching"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                style={{ textAlign: 'center' }}
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    style={{ fontSize: 64, marginBottom: 24 }}
                                >
                                    ⚔️
                                </motion.div>
                                <h2 style={styles.matchmakingTitle}>Finding Opponent...</h2>
                                <p style={styles.matchmakingSubtitle}>Searching For A Worthy Challenger</p>

                                {/* Search progress bar */}
                                <div style={{ margin: '20px auto', maxWidth: 300 }}>
                                    <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
                                        <motion.div
                                            animate={{ x: ['-100%', '100%'] }}
                                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                                            style={{ height: '100%', width: '40%', background: 'linear-gradient(90deg, transparent, #9333EA, transparent)', borderRadius: 2 }}
                                        />
                                    </div>
                                </div>

                                <div style={styles.eloSearchRange}>
                                    ELO Range: {playerElo - 200} - {playerElo + 200}
                                </div>

                                {/* Live search stats */}
                                <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 20 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ color: '#9333EA', fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700 }}>{searchSec}s</div>
                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>SEARCH TIME</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ color: '#00ff88', fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700 }}>{playersOnline}</div>
                                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>PLAYERS ONLINE</div>
                                    </div>
                                </div>

                                {/* Cancel button */}
                                <button onClick={() => { clearInterval(searchTimerRef.current); setMatchState('lobby'); }} style={{
                                    marginTop: 24, padding: '10px 32px', background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'rgba(255,255,255,0.6)',
                                    cursor: 'pointer', fontSize: 13
                                }}>Cancel Search</button>
                            </motion.div>
                        )}

                        {matchmakingPhase === 'found' && opponent && (
                            <motion.div
                                key="found"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{ textAlign: 'center' }}
                            >
                                <div style={{ fontSize: 48, marginBottom: 16, color: '#00ff88' }}>OPPONENT FOUND!</div>

                                {/* VS Card */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 24, marginBottom: 24 }}>
                                    {/* Player */}
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 48 }}>{playerRank.icon}</div>
                                        <div style={{ color: '#fff', fontWeight: 700, marginTop: 8 }}>You</div>
                                        <div style={{ color: playerRank.color, fontSize: 14, fontWeight: 600 }}>{playerElo} ELO</div>
                                    </div>

                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.3, type: 'spring' }}
                                        style={{ fontSize: 36, color: '#ff4444', fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif", fontWeight: 900 }}
                                    >
                                        VS
                                    </motion.div>

                                    {/* Horse Opponent */}
                                    <motion.div
                                        initial={{ x: 50, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                        style={{ textAlign: 'center' }}
                                    >
                                        <div style={{ fontSize: 48 }}>{opponent.avatar}</div>
                                        <div style={{ color: '#fff', fontWeight: 700, marginTop: 8 }}>{opponent.name}</div>
                                        <div style={{ color: opponentRankPreview?.color || '#fff', fontSize: 14, fontWeight: 600 }}>{opponent.elo} ELO</div>
                                        {opponent.location && (
                                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>{opponent.location}</div>
                                        )}
                                    </motion.div>
                                </div>

                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1 }}
                                    style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}
                                >
                                    Preparing Battle...
                                </motion.div>
                            </motion.div>
                        )}

                        {matchmakingPhase === 'loading' && (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ textAlign: 'center' }}
                            >
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    style={{ fontSize: 64, marginBottom: 16 }}
                                >
                                    ⚔️
                                </motion.div>
                                <div style={{ color: '#fff', fontSize: 24, fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif", fontWeight: 700 }}>BATTLE STARTING...</div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BATTLE VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'battle' && currentChallenge) {
        const opponentRank = getRankTier(opponent?.elo || 1200);

        return (
            <div style={styles.container}>
                {/* Score Header */}
                <div style={styles.battleHeader}>
                    {/* Player */}
                    <div style={styles.playerPanel}>
                        <div style={{ fontSize: 32 }}>{playerRank.icon}</div>
                        <div>
                            <div style={styles.playerName}>You</div>
                            <div style={{ ...styles.playerElo, color: playerRank.color }}>{playerElo}</div>
                        </div>
                    </div>

                    {/* Score */}
                    <div style={styles.scorePanel}>
                        <span style={{ ...styles.scoreNumber, color: '#00ff88' }}>{playerScore}</span>
                        <span style={styles.scoreSeparator}>-</span>
                        <span style={{ ...styles.scoreNumber, color: '#ff4444' }}>{opponentScore}</span>
                    </div>

                    {/* Opponent */}
                    <div style={styles.playerPanel}>
                        <div style={{ fontSize: 32 }}>{opponent?.avatar}</div>
                        <div>
                            <div style={styles.playerName}>{opponent?.name}</div>
                            <div style={{ ...styles.playerElo, color: opponentRank.color }}>{opponent?.elo}</div>
                        </div>
                    </div>
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
                        diamondBalance={DiamondEngine?.getBalance() || 0}
                        compact
                    />
                )}

                {/* Challenge Card */}
                <div style={styles.challengeCard}>
                    <div style={styles.challengeHeader}>
                        <span style={styles.challengeType}>{currentChallenge.type.replace('-', ' ').toUpperCase()}</span>
                        <span style={{
                            ...styles.difficultyBadge, background:
                                currentChallenge.difficulty === 'Expert' ? '#ff4444' :
                                    currentChallenge.difficulty === 'Hard' ? '#ff9900' :
                                        currentChallenge.difficulty === 'Medium' ? '#00D4FF' : '#00ff88'
                        }}>
                            {currentChallenge.difficulty}
                        </span>
                    </div>

                    <h2 style={styles.challengeTitle}>{currentChallenge.title}</h2>
                    <p style={styles.challengeQuestion}>{currentChallenge.question}</p>

                    {/* Hero Hand if available */}
                    {currentChallenge.heroHand && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>YOUR HAND</div>
                            <CardDisplay cards={currentChallenge.heroHand} size="medium" />
                        </div>
                    )}

                    {/* Board if available */}
                    {currentChallenge.board && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>BOARD</div>
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

                            let bgColor = isEliminated ? 'rgba(50,50,50,0.15)' : 'rgba(255,255,255,0.05)';
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
                                bgColor = 'rgba(0, 212, 255, 0.2)';
                                borderColor = '#00D4FF';
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
                                        ? '✅ Correct! +1 Point'
                                        : `❌ Wrong! Opponent scores`}
                                </div>
                                <p style={styles.explanationText}>{currentChallenge.explanation}</p>
                                <button onClick={handleNextRound} style={styles.nextRoundButton}>
                                    {currentRound < ROUNDS_PER_MATCH - 1 ? 'Next Round →' : 'View Results →'}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESULT VIEW
    // ═══════════════════════════════════════════════════════════════════════
    if (matchState === 'result') {
        const lastMatch = matchHistory[matchHistory.length - 1];
        const playerWon = lastMatch?.result === 'W';
        const totalRounds = playerScore + opponentScore;
        const accuracy = totalRounds > 0 ? Math.round((playerScore / totalRounds) * 100) : 0;
        const diamondReward = playerWon ? Math.round((5 + Math.abs(lastMatch?.eloChange || 0) / 10)) : 0;
        const resultColor = playerWon ? '#00ff88' : '#ff4444';

        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={styles.container}
            >
                <div style={{ maxWidth: 500, margin: '20px auto', textAlign: 'center' }}>
                    {/* Result Hero Card */}
                    <div style={{
                        background: `linear-gradient(135deg, ${resultColor}15, ${resultColor}05)`,
                        border: `1px solid ${resultColor}40`,
                        borderRadius: 20, padding: 28, marginBottom: 20
                    }}>
                        <div style={{ fontSize: 14, color: resultColor, fontWeight: 700, marginBottom: 8, letterSpacing: 2 }}>
                            {playerWon ? 'VICTORY!' : 'DEFEAT'}
                        </div>
                        <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif", fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: 4 }}>
                            <span style={{ color: '#00ff88' }}>{playerScore}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 8px' }}>-</span>
                            <span style={{ color: '#ff4444' }}>{opponentScore}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                            Vs {opponent?.name || 'Opponent'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif", fontSize: 24, fontWeight: 800, color: lastMatch?.eloChange >= 0 ? '#00ff88' : '#ff4444' }}>
                                    {lastMatch?.eloChange >= 0 ? '+' : ''}{lastMatch?.eloChange}
                                </div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>ELO CHANGE</div>
                            </div>
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                <div style={{ fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif", fontSize: 24, fontWeight: 800, color: '#FFD700' }}>{playerElo}</div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>NEW ELO</div>
                            </div>
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14 }}>
                                <div style={{ fontSize: 24, fontWeight: 800 }}>{playerRank.icon}</div>
                                <div style={{ fontSize: 10, color: playerRank.color, fontWeight: 600 }}>{playerRank.name}</div>
                            </div>
                        </div>
                    </div>

                    {/* Animated Win Rate Bar */}
                    <AnimatedAccuracyBar accuracy={accuracy} grade={playerWon ? 'A' : 'D'} label="ROUND WIN RATE" />

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

                    {/* Position Weakness Heatmap */}
                    <PositionWeaknessHeatmap mistakes={mistakesRef.current} totalAnswers={roundsPlayed} />

                    {/* Weakness Detection */}
                    {mistakesRef.current.length > 0 && (
                        <div style={{
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'left'
                        }}>
                            <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 700, marginBottom: 10, letterSpacing: 1, textAlign: 'center' }}>
                                {'\u26A0\uFE0F'} ROUNDS LOST
                            </div>
                            {mistakesRef.current.map((m, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '8px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: 8,
                                    marginBottom: i < mistakesRef.current.length - 1 ? 6 : 0
                                }}>
                                    <div>
                                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>{m.title}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginLeft: 6 }}>{m.type.replace('-', ' ')}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                                        <span style={{ color: '#EF4444' }}>{typeof m.picked === 'string' && m.picked.length > 20 ? m.picked.slice(0, 20) + '...' : m.picked}</span>
                                        <span style={{ margin: '0 4px' }}>{'\u2192'}</span>
                                        <span style={{ color: '#00ff88' }}>{typeof m.correct === 'string' && m.correct.length > 20 ? m.correct.slice(0, 20) + '...' : m.correct}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button onClick={startMatchmaking} style={{
                            flex: '1 1 80px', minHeight: 52, padding: '14px 0', fontSize: 14, fontWeight: 700,
                            background: 'linear-gradient(135deg, #9333EA, #D946EF)', color: '#fff',
                            border: 'none', borderRadius: 12, cursor: 'pointer', touchAction: 'manipulation'
                        }}>FIND NEXT MATCH</button>
                        <button onClick={() => setMatchState('lobby')} style={{
                            flex: '1 1 80px', minHeight: 52, padding: '14px 0', fontSize: 14, fontWeight: 600,
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 12, color: '#fff', cursor: 'pointer', touchAction: 'manipulation'
                        }}>BACK TO LOBBY</button>
                    </div>

                    {/* Share Result */}
                    <button onClick={() => shareResult({
                        gameTitle: 'VS RANKED',
                        grade: playerWon ? 'S' : 'D',
                        score: playerScore,
                        scoreLabel: playerWon ? 'VICTORY' : 'DEFEAT',
                        stats: [
                            { label: 'ELO Change', value: `${lastMatch?.eloChange >= 0 ? '+' : ''}${lastMatch?.eloChange}` },
                            { label: 'New ELO', value: playerElo },
                            { label: 'Win Rate', value: accuracy + '%' },
                        ],
                        color: '#9333EA',
                        subtitle: `vs ${opponent?.name || 'Opponent'}`,
                    })} style={{
                        width: '100%', marginTop: 12, padding: '12px 0', fontSize: 13, fontWeight: 600,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 10, color: 'rgba(255,255,255,0.5)', cursor: 'pointer'
                    }}>{'\uD83D\uDCF4'} Share Result</button>

                    {/* Coach Tip */}
                    <div style={{
                        background: 'rgba(147,51,234,0.08)', border: '1px solid rgba(147,51,234,0.2)',
                        borderRadius: 10, padding: 14, marginTop: 12, textAlign: 'center'
                    }}>
                        <div style={{ fontSize: 10, color: '#9333EA', fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
                            {'\u2694\uFE0F'} COACH TIP
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                            {getCoachingTip(playerWon ? 'A' : 'C')}
                        </div>
                    </div>

                    {/* Suggested Next Game */}
                    {(() => {
                        const suggestion = getNextGameSuggestion('tournament', playerWon ? 'A' : 'C');
                        if (!suggestion) return null;
                        return (
                            <div style={{
                                background: `${suggestion.color}10`, border: `1px solid ${suggestion.color}30`,
                                borderRadius: 10, padding: 14, marginTop: 10, textAlign: 'center', cursor: 'pointer'
                            }} onClick={() => setMatchState('lobby')}>
                                <div style={{ fontSize: 10, color: suggestion.color, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                                    {suggestion.icon} SUGGESTED NEXT
                                </div>
                                <div style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>{suggestion.title}</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{suggestion.reason}</div>
                            </div>
                        );
                    })()}
                </div>
            </motion.div>
        );
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a12, #1a0a2a)',
        padding: 16,
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    header: {
        marginBottom: 20,
    },
    backButton: {
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    lobbyCard: {
        maxWidth: 500,
        margin: '0 auto',
        textAlign: 'center',
        padding: 32,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05), rgba(138, 43, 226, 0.05))',
        border: '2px solid rgba(0, 212, 255, 0.2)',
        borderRadius: 24,
    },
    lobbyTitle: {
        fontSize: 36,
        fontWeight: 900,
        color: '#fff',
        marginBottom: 8,
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
    },
    lobbySubtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 32,
    },
    rankDisplay: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 32,
    },
    rankName: {
        fontSize: 24,
        fontWeight: 700,
    },
    eloValue: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.6)',
    },
    statsRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: 32,
        marginBottom: 32,
    },
    statItem: {
        textAlign: 'center',
    },
    statNumber: {
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },
    findMatchButton: {
        width: '100%',
        padding: '18px 32px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        border: 'none',
        borderRadius: 50,
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(255, 107, 0, 0.4)',
        marginBottom: 24,
    },
    recentMatches: {
        marginTop: 24,
        textAlign: 'left',
    },
    matchItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        fontSize: 14,
    },
    matchmakingCard: {
        maxWidth: 400,
        margin: '100px auto',
        textAlign: 'center',
        padding: 48,
        background: 'rgba(0,0,0,0.4)',
        borderRadius: 24,
        border: '2px solid rgba(255,255,255,0.1)',
    },
    matchmakingTitle: {
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    matchmakingSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 24,
    },
    eloSearchRange: {
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        fontSize: 14,
        color: '#00D4FF',
        display: 'inline-block',
    },
    battleHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.4)',
        borderRadius: 16,
        marginBottom: 20,
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
    playerElo: {
        fontSize: 12,
        fontWeight: 500,
    },
    scorePanel: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    scoreNumber: {
        fontSize: 36,
        fontWeight: 900,
    },
    scoreSeparator: {
        fontSize: 24,
        color: 'rgba(255,255,255,0.3)',
    },
    roundIndicator: {
        textAlign: 'center',
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 16,
    },
    challengeCard: {
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        padding: 24,
    },
    challengeHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    challengeType: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
    },
    difficultyBadge: {
        padding: '4px 10px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        color: '#fff',
    },
    challengeTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    challengeQuestion: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 24,
        lineHeight: 1.5,
    },
    optionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        marginBottom: 24,
    },
    optionButton: {
        padding: '16px',
        border: '2px solid',
        borderRadius: 12,
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
        color: 'rgba(255,255,255,0.5)',
        marginTop: 4,
    },
    explanationBox: {
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 20,
        marginTop: 20,
    },
    explanationText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 1.6,
        marginBottom: 20,
    },
    nextRoundButton: {
        width: '100%',
        padding: '14px 24px',
        background: 'linear-gradient(135deg, #00D4FF, #0088dd)',
        border: 'none',
        borderRadius: 30,
        fontSize: 16,
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    resultCard: {
        maxWidth: 500,
        margin: '40px auto',
        textAlign: 'center',
        padding: 48,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(138, 43, 226, 0.1))',
        border: '2px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 24,
    },
    resultTitle: {
        fontSize: 48,
        fontWeight: 900,
        marginBottom: 16,
        fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
    },
    resultScore: {
        fontSize: 48,
        fontWeight: 900,
        marginBottom: 16,
    },
    eloChange: {
        fontSize: 20,
        marginBottom: 32,
    },
    newRankDisplay: {
        marginBottom: 24,
    },
    newRankName: {
        fontSize: 24,
        fontWeight: 700,
        marginBottom: 4,
    },
    newEloValue: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.6)',
    },
    diamondReward: {
        fontSize: 20,
        fontWeight: 700,
        color: '#FFD700',
        marginBottom: 32,
    },
    resultButtons: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    rematchButton: {
        width: '100%',
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #ff6b00, #ff0066)',
        border: 'none',
        borderRadius: 50,
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
    },
    lobbyButton: {
        width: '100%',
        padding: '14px 32px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 50,
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },
};
