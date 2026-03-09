/**
 * PVP PAGE — Route: /hub/trivia/pvp
 * 1v1 trivia battles with diamond stakes
 * Uses Supabase Realtime for live matchmaking
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import {
    joinMatchmakingQueue,
    leaveMatchmakingQueue,
    findMatch,
    subscribeToQueue,
    subscribeToMatch,
    submitMatchScore,
    processMatchReward
} from '../../../src/services/pvpMatchmaking';
import { busEmit } from '../../../src/engine/EventBus';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import { Trophy, Gem, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';

const STAKE_OPTIONS = [10, 25, 50, 100];

/** Shuffle options for each question so correct answer isn't always A */
function shuffleOptions(questions) {
    return questions.map(q => {
        const opts = [...q.options];
        const correctText = opts[q.correct_index];
        // Fisher-Yates shuffle
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return { ...q, options: opts, correct_index: opts.indexOf(correctText) };
    });
}

export default function PvPPage() {
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [gameState, setGameState] = useState('lobby'); // lobby, searching, battle, waiting, result
    const [userId, setUserId] = useState(null);
    const [username, setUsername] = useState('');
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [stakeAmount, setStakeAmount] = useState(0);
    const [questions, setQuestions] = useState([]);
    const [opponent, setOpponent] = useState(null);
    const [result, setResult] = useState(null);
    const [stats, setStats] = useState({ wins: 0, losses: 0 });
    const [matchId, setMatchId] = useState(null);
    const [isPlayer1, setIsPlayer1] = useState(false);

    // Battle state
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [playerScore, setPlayerScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(null);
    const [timeLeft, setTimeLeft] = useState(40);
    const [isTimerRunning, setIsTimerRunning] = useState(false);

    const timerRef = useRef(null);
    const queueSubscription = useRef(null);
    const matchSubscription = useRef(null);
    const searchTimeout = useRef(null);
    const playerScoreRef = useRef(0);
    const playerAnswersRef = useRef([]); // Track correct/incorrect per question

    // Horse (AI opponent) battle state
    const [isHorseMatch, setIsHorseMatch] = useState(false);
    const horseAnswersRef = useRef([]);

    useEffect(() => {
        if (authLoading) return;
        loadUserData();

        return () => {
            // Cleanup subscriptions
            if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }
            if (matchSubscription.current) { matchSubscription.current(); matchSubscription.current = null; }
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current);
            }
        };
    }, [avatarUser?.id, authLoading]);

    // Timer effect
    useEffect(() => {
        if (!isTimerRunning || showResult) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isTimerRunning, showResult, currentQuestionIndex]);

    async function loadUserData() {
        const user = avatarUser || getAuthUser();
        if (!user) {
            router.push('/hub/trivia');
            return;
        }

        setUserId(user.id);

        // Get diamond balance and username
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds, username')
            .eq('id', user.id)
            .maybeSingle();

        if (profile) {
            setUserDiamonds(profile.diamonds || 0);
            setUsername(profile.username || 'Player');
        }

        // Get PvP stats from persistent stats table
        const { data: pvpStats } = await supabase
            .from('trivia_pvp_stats')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (pvpStats) {
            setStats({
                wins: pvpStats.wins || 0,
                losses: pvpStats.losses || 0,
                ties: pvpStats.ties || 0,
                winStreak: pvpStats.win_streak || 0,
                bestStreak: pvpStats.best_streak || 0
            });
        }
    }

    // Persist PvP stats after each match
    async function updatePvpStats(outcome, diamondsDelta) {
        if (!userId) return;

        // Fetch current stats
        const { data: current } = await supabase
            .from('trivia_pvp_stats')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        const prev = current || { wins: 0, losses: 0, ties: 0, win_streak: 0, best_streak: 0, total_diamonds_won: 0, total_diamonds_lost: 0 };

        let newStats = { ...prev };
        if (outcome === 'win') {
            newStats.wins = (prev.wins || 0) + 1;
            newStats.win_streak = (prev.win_streak || 0) + 1;
            newStats.best_streak = Math.max(newStats.win_streak, prev.best_streak || 0);
            newStats.total_diamonds_won = (prev.total_diamonds_won || 0) + (diamondsDelta || 0);
        } else if (outcome === 'loss') {
            newStats.losses = (prev.losses || 0) + 1;
            newStats.win_streak = 0;
            newStats.total_diamonds_lost = (prev.total_diamonds_lost || 0) + (diamondsDelta || 0);
        } else if (outcome === 'tie') {
            newStats.ties = (prev.ties || 0) + 1;
            // Streak continues on ties
        }
        newStats.updated_at = new Date().toISOString();

        await supabase
            .from('trivia_pvp_stats')
            .upsert({
                user_id: userId,
                wins: newStats.wins,
                losses: newStats.losses,
                ties: newStats.ties,
                win_streak: newStats.win_streak,
                best_streak: newStats.best_streak,
                total_diamonds_won: newStats.total_diamonds_won,
                total_diamonds_lost: newStats.total_diamonds_lost,
                updated_at: newStats.updated_at
            }, { onConflict: 'user_id' });

        setStats({
            wins: newStats.wins,
            losses: newStats.losses,
            ties: newStats.ties,
            winStreak: newStats.win_streak,
            bestStreak: newStats.best_streak
        });
    }

    async function handleFindMatch(stake) {
        if (userDiamonds < stake) {
            alert('Not enough diamonds!');
            return;
        }

        setStakeAmount(stake);
        setGameState('searching');

        // Deduct stake immediately via RPC for audit trail
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: -stake,
            p_type: 'pvp_stake',
            p_description: `PvP stake — ${stake}💎 entry`,
            p_reference_id: null
        });
        setUserDiamonds(prev => prev - stake);
        busEmit.diamondsSpent(stake, 'PvP Stake Entry');

        // Always set 5-second horse fallback as safety net
        // This fires regardless of whether the queue join or real match succeeds
        searchTimeout.current = setTimeout(() => {
            handleHorseMatch(stake);
        }, 5000);

        // Try to join the matchmaking queue (best-effort for real matches)
        try {
            const { data: queueEntry } = await joinMatchmakingQueue(userId, stake);

            if (queueEntry) {
                // Subscribe to queue changes to detect new opponents
                queueSubscription.current = subscribeToQueue(stake, async (newPlayer) => {
                    if (newPlayer.user_id !== userId) {
                        const matchData = await findMatch(userId, stake);
                        if (matchData) {
                            // Cancel horse fallback — real match found
                            if (searchTimeout.current) clearTimeout(searchTimeout.current);
                            handleMatchFound(matchData);
                        }
                    }
                });

                // Also immediately try to find an existing opponent
                const matchData = await findMatch(userId, stake);
                if (matchData) {
                    // Cancel horse fallback — real match found
                    if (searchTimeout.current) clearTimeout(searchTimeout.current);
                    handleMatchFound(matchData);
                }
            }
        } catch (err) {
        }
    }

    // Horse Match - Select random AI horse as opponent
    async function handleHorseMatch(stake) {
        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }

        // Get random AI horse from profiles
        const { data: horses } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('is_horse', true)
            .limit(50);

        let horseOpponent;
        if (horses && horses.length > 0) {
            const randomHorse = horses[Math.floor(Math.random() * horses.length)];
            // Generate realistic W/L record based on stake
            const baseWins = Math.floor(Math.random() * 50) + 20;
            const baseLosses = Math.floor(Math.random() * 30) + 10;
            horseOpponent = {
                id: randomHorse.id,
                username: randomHorse.username,
                avatar_url: randomHorse.avatar_url,
                wins: baseWins,
                losses: baseLosses,
                isHorse: true
            };
        } else {
            // Fallback horse if no horse profiles found
            horseOpponent = {
                id: 'horse-fallback',
                username: 'SharkyAce',
                avatar_url: null,
                wins: 42,
                losses: 18,
                isHorse: true
            };
        }

        // Load questions for horse match with 60-day exclusion
        let excludeIds = [];
        if (userId) {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const { data: recentHistory } = await supabase
                .from('trivia_user_question_history')
                .select('question_id')
                .eq('user_id', userId)
                .gte('seen_at', sixtyDaysAgo.toISOString())
                .limit(200); // pvp seen questions

            if (recentHistory) {
                excludeIds = recentHistory.map(h => h.question_id);
            }
        }

        const { data: questions } = await supabase
            .from('trivia_questions')
            .select('*')
            .limit(100);

        let matchQuestions = [];
        if (questions && questions.length >= 20) {
            let available = excludeIds.length > 0
                ? questions.filter(q => !excludeIds.includes(q.id))
                : questions;
            if (available.length < 20) available = questions;
            matchQuestions = available.sort(() => Math.random() - 0.5).slice(0, 20);
        }

        // Shuffle options FIRST so correct_index is updated before horse answer calc
        const shuffledQuestions = shuffleOptions(matchQuestions);

        // Pre-calculate horse answers based on stake-dependent accuracy
        // Higher stakes = smarter horse (60-85% accuracy)
        const horseAccuracy = 0.60 + (Math.min(stake, 100) / 100) * 0.25;
        const horseAnswers = shuffledQuestions.map(q => {
            if (Math.random() < horseAccuracy) {
                return q.correct_index; // Correct answer
            } else {
                // Random wrong answer
                const wrongIndices = [0, 1, 2, 3].filter(i => i !== q.correct_index);
                return wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
            }
        });
        horseAnswersRef.current = horseAnswers;

        setIsHorseMatch(true);
        setOpponent(horseOpponent);
        setQuestions(shuffledQuestions);
        setMatchId(`horse-match-${Date.now()}`);
        setIsPlayer1(true);

        // Start battle after short delay
        setTimeout(() => {
            setGameState('battle');
            setCurrentQuestionIndex(0);
            setPlayerScore(0);
            playerScoreRef.current = 0;
            playerAnswersRef.current = [];
            setSelectedAnswer(null);
            setShowResult(false);
            setTimeLeft(40);
            setIsTimerRunning(true);
        }, 2000);
    }

    function handleMatchFound(matchData) {
        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        setMatchId(matchData.match.id);
        setOpponent(matchData.opponent);
        setQuestions(shuffleOptions(matchData.questions));
        setIsPlayer1(matchData.match.player1_id === userId);

        // Subscribe to match updates
        matchSubscription.current = subscribeToMatch(matchData.match.id, handleMatchUpdate);

        // Start the battle after short delay
        setTimeout(() => {
            setGameState('battle');
            setCurrentQuestionIndex(0);
            setPlayerScore(0);
            playerScoreRef.current = 0;
            playerAnswersRef.current = [];
            setSelectedAnswer(null);
            setShowResult(false);
            setTimeLeft(40);
            setIsTimerRunning(true);
        }, 2000);
    }

    async function handleNoMatchFound() {
        // This is now only called if horse match also fails
        // Refund stake via audit-safe RPC
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: stakeAmount,
            p_type: 'pvp_refund',
            p_description: `PvP match failed — ${stakeAmount}💎 refund`,
            p_reference_id: null
        });
        // Refresh balance from DB
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .maybeSingle();
        if (profile) setUserDiamonds(profile.diamonds || 0);

        await leaveMatchmakingQueue(userId);
        setGameState('lobby');
        alert('Unable to start match. Please try again!');
    }

    async function handleCancelSearch() {
        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        leaveMatchmakingQueue(userId);

        // Refund stake via audit-safe RPC
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: stakeAmount,
            p_type: 'pvp_refund',
            p_description: `PvP cancelled — ${stakeAmount}💎 refund`,
            p_reference_id: null
        });
        // Refresh balance from DB
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .maybeSingle();
        if (profile) setUserDiamonds(profile.diamonds || 0);

        setGameState('lobby');
        setOpponent(null);
    }

    function handleMatchUpdate(updatedMatch) {
        // Check if opponent submitted their score
        const opponentScoreField = isPlayer1 ? 'player2_score' : 'player1_score';
        if (updatedMatch[opponentScoreField] !== null && updatedMatch[opponentScoreField] !== opponentScore) {
            setOpponentScore(updatedMatch[opponentScoreField]);
        }

        // Check if match is complete
        if (updatedMatch.status === 'complete' && gameState !== 'result') {
            handleBattleComplete(updatedMatch);
        }
    }

    function handleTimeout() {
        setIsTimerRunning(false);
        selectAnswer(-1); // Wrong answer
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null || showResult) return;

        setIsTimerRunning(false);
        setSelectedAnswer(index);
        setShowResult(true);

        const currentQuestion = questions[currentQuestionIndex];
        const isCorrect = index >= 0 && index === currentQuestion?.correct_index;

        // Track answer accuracy per question for history recording
        playerAnswersRef.current[currentQuestionIndex] = isCorrect;

        if (isCorrect) {
            const newScore = playerScoreRef.current + 1;
            playerScoreRef.current = newScore;
            setPlayerScore(newScore);
            busEmit.decisionCorrect(newScore);
        } else {
            busEmit.decisionIncorrect(playerScoreRef.current);
            busEmit.screenShake('light');
        }

        // Advance quickly — no GTO explanations in PvP
        setTimeout(() => {
            if (currentQuestionIndex + 1 >= questions.length) {
                finishBattle();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setTimeLeft(40);
                setIsTimerRunning(true);
            }
        }, 500);
    }

    async function finishBattle() {
        setIsTimerRunning(false);
        setGameState('waiting');

        // Use ref for accurate score — React state may be stale inside this closure
        const finalScore = playerScoreRef.current;

        // Handle horse match differently
        if (isHorseMatch) {
            await finishHorseBattle(finalScore);
            return;
        }

        // Submit our score for real match
        await submitMatchScore(matchId, userId, finalScore, isPlayer1);
    }

    // Complete horse battle - calculate result and award winnings
    async function finishHorseBattle(playerFinalScore) {
        // Calculate horse score from pre-generated answers
        const horseScore = horseAnswersRef.current.reduce((score, answer, idx) => {
            return score + (answer === questions[idx]?.correct_index ? 1 : 0);
        }, 0);

        const won = playerFinalScore > horseScore;
        const tied = playerFinalScore === horseScore;

        // Calculate winnings — 10% rake on total pot
        const totalPot = stakeAmount * 2;
        const rakeAmount = Math.floor(totalPot * 0.1);
        let winnings = 0;

        if (won) {
            winnings = totalPot - rakeAmount;
            // Award winnings via audit-safe RPC
            await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: winnings,
                p_type: 'pvp_win',
                p_description: `PvP win — ${winnings}💎 payout`,
                p_reference_id: matchId
            });
            // Refresh balance from DB
            const { data: winProfile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (winProfile) setUserDiamonds(winProfile.diamonds || 0);

            busEmit.diamondsEarned(winnings, 'PvP Victory');
            busEmit.celebration('confetti');
        } else if (tied) {
            // Refund stake on tie via audit-safe RPC
            await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: userId,
                p_amount: stakeAmount,
                p_type: 'pvp_refund',
                p_description: `PvP tie — ${stakeAmount}💎 refund`,
                p_reference_id: matchId
            });
            const { data: tieProfile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (tieProfile) setUserDiamonds(tieProfile.diamonds || 0);
            winnings = stakeAmount;
        } else {
            busEmit.screenShake('medium');
        }

        // Update persistent stats
        if (won) {
            await updatePvpStats('win', winnings - stakeAmount);
        } else if (tied) {
            await updatePvpStats('tie', 0);
        } else {
            await updatePvpStats('loss', stakeAmount);
        }

        setOpponentScore(horseScore);
        setResult({
            won,
            tied,
            playerScore: playerFinalScore,
            opponentScore: horseScore,
            winnings: won ? winnings : (tied ? stakeAmount : 0),
            opponent,
            isHorseMatch: true
        });

        // Record question history for 60-day non-repeat (with actual accuracy)
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions.map((q, idx) => ({
                    user_id: userId,
                    question_id: q.id,
                    was_correct: playerAnswersRef.current[idx] === true,
                    seen_at: new Date().toISOString(),
                    mode: 'pvp'
                }));

                await supabase.from('trivia_user_question_history')
                    .upsert(historyRecords, {
                        onConflict: 'user_id,question_id',
                        ignoreDuplicates: false
                    });
            } catch (e) {
                console.error('[PVP] Error recording history:', e);
            }
        }

        setGameState('result');
    }

    async function handleBattleComplete(match) {
        if (matchSubscription.current) { matchSubscription.current(); matchSubscription.current = null; }

        const won = match.winner_id === userId;
        const myScore = isPlayer1 ? match.player1_score : match.player2_score;
        const theirScore = isPlayer1 ? match.player2_score : match.player1_score;

        // Process rewards if we won
        if (won) {
            const loserId = isPlayer1 ? match.player2_id : match.player1_id;
            await processMatchReward(userId, loserId, stakeAmount);

            // Reload diamonds
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds);

            busEmit.diamondsEarned(stakeAmount * 2 * 0.9, 'PvP Real Match Victory');
            busEmit.celebration('confetti');
        } else {
            busEmit.screenShake('medium');
        }

        // Calculate winnings — 10% rake on total pot
        const totalPot = stakeAmount * 2;
        const rakeAmount = Math.floor(totalPot * 0.1);
        const winnings = won ? totalPot - rakeAmount : 0;

        setResult({
            won,
            playerScore: myScore,
            opponentScore: theirScore,
            winnings,
            opponent
        });

        // Update persistent stats via upsert (not just local setState)
        if (won) {
            await updatePvpStats('win', winnings - stakeAmount);
        } else if (match.winner_id && match.winner_id !== userId) {
            await updatePvpStats('loss', stakeAmount);
        } else {
            await updatePvpStats('tie', 0);
        }

        // Record question history for 60-day non-repeat (with actual accuracy)
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions.map((q, idx) => ({
                    user_id: userId,
                    question_id: q.id,
                    was_correct: playerAnswersRef.current[idx] === true,
                    seen_at: new Date().toISOString(),
                    mode: 'pvp'
                }));

                await supabase.from('trivia_user_question_history')
                    .upsert(historyRecords, {
                        onConflict: 'user_id,question_id',
                        ignoreDuplicates: false
                    });
            } catch (e) {
                console.error('[PVP] Error recording history:', e);
            }
        }

        setGameState('result');
    }

    function handlePlayAgain() {
        setGameState('lobby');
        setResult(null);
        setOpponent(null);
        setMatchId(null);
        setQuestions([]);
        setPlayerScore(0);
        playerScoreRef.current = 0;
        playerAnswersRef.current = [];
        setOpponentScore(null);
        setCurrentQuestionIndex(0);
        setSelectedAnswer(null);
        setShowResult(false);
        setTimeLeft(40);
        setIsTimerRunning(false);
        setIsHorseMatch(false);
        setStakeAmount(0);
        horseAnswersRef.current = [];
        // Refresh diamond balance from DB
        loadUserData();
    }

    const currentQuestion = questions[currentQuestionIndex];

    return (
        <PageTransition>
            <SEOHead
                title="PvP Trivia — Player vs Player"
                description="Challenge Other Players To Head-to-head Poker Trivia Battles. Prove Who Knows Poker Best."
                canonical="/hub/trivia/pvp"
            >

            </SEOHead>

            <div className="pvp-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                <div className="content">
                    {/* Stats Bar - only visible during gameplay */}
                    {gameState !== 'lobby' && (
                        <div className="stats-bar">
                            <div className="stat">
                                <Trophy size={16} />
                                <span>{stats.wins}W - {stats.losses}L</span>
                            </div>
                            <div className="stat diamonds">
                                <Gem size={16} />
                                <span>{userDiamonds}</span>
                            </div>
                        </div>
                    )}

                    {/* Lobby */}
                    {gameState === 'lobby' && (
                        <div className="lobby">
                            <div
                                className="lobby-image-wrapper"
                                style={{
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                }}
                            >
                                <Image src="/images/trivia/lobby-pvp.jpg" alt="1v1 Battle - Start Challenge" width={686} height={1024} className="lobby-image" style={{ width: '100%', height: 'auto', display: 'block' }} />
                            </div>

                            {/* Diamond Balance */}
                            <div className="lobby-balance">
                                <Gem size={18} />
                                <span>{userDiamonds} Diamonds Available</span>
                            </div>

                            {/* Stake Selection */}
                            <div className="stake-selection">
                                <h3>Select Your Stake</h3>
                                <div className="stake-grid">
                                    {STAKE_OPTIONS.map(stake => (
                                        <button
                                            key={stake}
                                            className={`stake-btn ${userDiamonds < stake ? 'disabled' : ''}`}
                                            onClick={() => userDiamonds >= stake && handleFindMatch(stake)}
                                            disabled={userDiamonds < stake}
                                        >
                                            <span className="stake-amount">{stake} 💎</span>
                                            <span className="stake-win">Win {Math.floor(stake * 2 * 0.9)} 💎</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="rake-notice">10% house rake on prize pool</p>
                            </div>

                            {/* Record */}
                            <div className="lobby-record">
                                <Trophy size={16} />
                                <span>{stats.wins}W - {stats.losses}L</span>
                                {stats.bestStreak > 0 && (
                                    <span className="best-streak">Best Streak: {stats.bestStreak} 🔥</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Searching for opponent */}
                    {gameState === 'searching' && (
                        <div className="result-panel-overlay">
                            <button className="panel-back-top" onClick={handleCancelSearch}>← Cancel</button>
                            <div className="result-panel-container finding-container">
                                <img
                                    src="/trivia/panels/panel-finding.jpg"
                                    alt=""
                                    className="result-panel-bg"
                                    loading="lazy" />
                                {/* Record positioned in upper area */}
                                <div className="finding-record-zone">
                                    <span className="finding-record">{stats.wins}W - {stats.losses}L</span>
                                </div>
                                {/* Spinner in center */}
                                <div className="finding-spinner-zone">
                                    <Loader size={52} className="finding-spinner-icon" />
                                </div>
                                {/* Opponent info when found */}
                                {opponent && (
                                    <div className="finding-opponent-zone">
                                        <div className="panel-stats">
                                            <div className="panel-stat-row">
                                                <span className="panel-stat-label">PLAYER</span>
                                                <span className="panel-stat-value cyan">{opponent.username}</span>
                                            </div>
                                            <div className="panel-stat-row">
                                                <span className="panel-stat-label">RECORD</span>
                                                <span className="panel-stat-value white">{opponent.wins}W - {opponent.losses}L</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {/* Stake at the bottom, close to CANCEL */}
                                <div className="finding-stake-zone">
                                    <span className="finding-stake-label">STAKE</span>
                                    <span className="finding-stake-value">{stakeAmount} 💎</span>
                                </div>
                                {/* Invisible cancel hitbox over baked-in CANCEL button */}
                                <button className="finding-cancel-hitbox" onClick={handleCancelSearch} aria-label="Cancel Search" />
                            </div>
                        </div>
                    )}

                    {/* Battle */}
                    {gameState === 'battle' && currentQuestion && (
                        <div className="battle">
                            {/* Battle header */}
                            <div className="battle-header">
                                <div className="player you">
                                    <span className="name">{username}</span>
                                    <span className="score">{playerScore}</span>
                                </div>
                                <div className="vs">VS</div>
                                <div className="player opponent">
                                    <span className="name">{opponent?.username}</span>
                                    <span className="score">?</span>
                                </div>
                            </div>

                            {/* Timer */}
                            <div className={`battle-timer ${timeLeft <= 5 ? 'danger' : ''}`}>
                                <Clock size={20} />
                                <span>{timeLeft}s</span>
                            </div>

                            {/* Progress */}
                            <div className="battle-progress">
                                Question {currentQuestionIndex + 1} of {questions.length}
                            </div>

                            {/* Question */}
                            <MetalFrame padding="24px" showBolts={false}>
                                <h2 className="question-text">{toTitleCase(currentQuestion.question)}</h2>

                                <div className="options">
                                    {currentQuestion.options.map((option, idx) => {
                                        let className = 'option';
                                        if (showResult) {
                                            if (idx === currentQuestion.correct_index) {
                                                className += ' correct';
                                            } else if (idx === selectedAnswer) {
                                                className += ' wrong';
                                            }
                                        } else if (idx === selectedAnswer) {
                                            className += ' selected';
                                        }

                                        return (
                                            <button
                                                key={idx}
                                                className={className}
                                                onClick={() => selectAnswer(idx)}
                                                disabled={showResult}
                                            >
                                                <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                                                <span className="option-text">{toTitleCase(option)}</span>
                                                {showResult && idx === currentQuestion.correct_index && (
                                                    <CheckCircle size={20} className="result-icon" />
                                                )}
                                                {showResult && idx === selectedAnswer && idx !== currentQuestion.correct_index && (
                                                    <XCircle size={20} className="result-icon" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </MetalFrame>
                        </div>
                    )}

                    {/* Waiting for opponent */}
                    {gameState === 'waiting' && (
                        <div className="waiting">
                            <MetalFrame padding="32px" showBolts={true}>
                                <h2>Battle Complete!</h2>
                                <p>Your Score: <strong>{playerScore}</strong></p>
                                <div className="waiting-spinner">
                                    <div className="spinner" />
                                    <span>Waiting For Opponent To Finish...</span>
                                </div>
                            </MetalFrame>
                        </div>
                    )}

                    {/* Results — title + buttons are baked into panel image, only overlay stats */}
                    {gameState === 'result' && result && (
                        <div className="result-panel-overlay">
                            <div className="result-panel-container">
                                <img
                                    src={result.won || result.tied ? '/trivia/panels/panel-win.jpg' : '/trivia/panels/panel-defeat.jpg'}
                                    alt=""
                                    className="result-panel-bg"
                                    loading="lazy" />
                                {/* Win/Loss record in the top header bar */}
                                <div className="result-score-zone">
                                    <div className="panel-stats">
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">RECORD</span>
                                            <span className="panel-stat-value white">{stats.wins}W - {stats.losses}L</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Game stats inside the main box, below the baked-in title */}
                                <div className="result-stats-zone">
                                    <div className="panel-stats">
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">YOUR SCORE</span>
                                            <span className="panel-stat-value cyan">{result.playerScore}/{questions.length}</span>
                                        </div>
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">{result.opponent?.username || 'OPPONENT'}</span>
                                            <span className="panel-stat-value red">{result.opponentScore}/{questions.length}</span>
                                        </div>
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">WIN STREAK</span>
                                            <span className="panel-stat-value gold">{stats.winStreak || 0} 🔥</span>
                                        </div>
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">DIAMONDS</span>
                                            <span className={`panel-stat-value ${result.won ? 'green' : result.tied ? 'white' : 'red'}`}>
                                                {result.won ? `+${result.winnings}` : result.tied ? `+${stakeAmount}` : `-${stakeAmount}`} 💎
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {/* Invisible hitboxes over baked-in PLAY AGAIN and BACK TO TRIVIA buttons */}
                                <button className="result-play-again-hitbox" onClick={handlePlayAgain} aria-label="Play Again" />
                                <button className="result-back-hitbox" onClick={() => router.push('/hub/trivia')} aria-label="Back To Trivia" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .pvp-page {
                    min-height: 100vh;
                    background: #0a0e1a;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay {
                    display: none;
                }

                .content {
                    position: relative;
                    padding: 80px 0 40px;
                    max-width: 100%;
                    margin: 0 auto;
                }

                .stats-bar {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    margin-bottom: 20px;
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                }

                .stat.diamonds { color: #00d4ff; }

                /* Lobby */
                .lobby-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .lobby-header h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    color: #ef4444;
                    margin: 12px 0 8px;
                    text-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
                }

                .lobby-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .lobby-balance {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px 16px;
                    color: #00d4ff;
                    font-weight: 700;
                    font-size: 16px;
                    margin: 12px 0;
                }

                .lobby-record {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 12px 16px;
                    color: rgba(255, 255, 255, 0.7);
                    font-weight: 600;
                    font-size: 14px;
                    margin-top: 8px;
                }

                .best-streak {
                    color: #ffd700;
                    margin-left: 8px;
                }

                .stake-selection h3 {
                    text-align: center;
                    color: #fff;
                    margin: 0 0 16px;
                }

                .stake-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                    margin-bottom: 12px;
                }

                .stake-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 2px solid rgba(0, 212, 255, 0.3);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #fff;
                }

                .stake-btn:hover:not(.disabled) {
                    background: rgba(0, 212, 255, 0.1);
                    border-color: #00d4ff;
                    transform: translateY(-2px);
                }

                .stake-btn.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .stake-amount {
                    font-size: 24px;
                    font-weight: 700;
                }

                .stake-win {
                    font-size: 12px;
                    color: #22c55e;
                }

                .rake-notice {
                    text-align: center;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                    margin: 0;
                }

                .how-it-works {
                    margin-top: 24px;
                    padding-top: 24px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .how-it-works h4 {
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 12px;
                    text-transform: uppercase;
                    margin: 0 0 12px;
                }

                .how-it-works ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .how-it-works li {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                    margin-bottom: 8px;
                }

                /* Battle */
                .battle-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border-radius: 12px;
                    margin-bottom: 16px;
                }

                .player {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .player .name {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .player .score {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                }

                .player.you .score { color: #00d4ff; }
                .player.opponent .score { color: #ef4444; }

                .vs {
                    font-size: 20px;
                    font-weight: 700;
                    color: rgba(255, 255, 255, 0.3);
                }

                .battle-timer {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 12px;
                }

                .battle-timer.danger {
                    color: #ef4444;
                    animation: pulse 0.5s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.1); }
                }

                .battle-progress {
                    text-align: center;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 16px;
                }

                .question-text {
                    font-size: 18px;
                    color: #fff;
                    margin: 0 0 20px;
                    line-height: 1.5;
                }

                .options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .option {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                    color: #fff;
                }

                /* hover removed per user request */

                .option.correct {
                    background: rgba(34, 197, 94, 0.2);
                    border-color: #22c55e;
                }

                .option.wrong {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                }

                .option-letter {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .option-text { flex: 1; }
                .result-icon { margin-left: auto; }
                .option.correct .result-icon { color: #22c55e; }
                .option.wrong .result-icon { color: #ef4444; }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #00d4ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .waiting-spinner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    margin: 24px 0;
                }

                /* Waiting */
                .waiting { text-align: center; }
                .waiting h2 { color: #fff; margin: 0 0 12px; }
                .waiting p { color: rgba(255, 255, 255, 0.7); }

                /* ===== PANEL OVERLAY SYSTEM (All 3 Panels) ===== */
                .result-panel-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.85);
                    animation: panelFadeIn 0.4s ease;
                }

                @keyframes panelFadeIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }

                .panel-back-top {
                    position: absolute;
                    top: 16px;
                    left: 16px;
                    z-index: 1010;
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 0.85rem;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.7);
                    background: rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 6px;
                    padding: 8px 16px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .panel-back-top:hover {
                    color: #00f0ff;
                    border-color: rgba(0, 240, 255, 0.35);
                    background: rgba(0, 0, 0, 0.7);
                    text-shadow: 0 0 8px rgba(0, 240, 255, 0.5);
                }

                .result-panel-container {
                    position: relative;
                    width: 92vw;
                    max-width: 700px;
                }

                /* ===== Finding Opponent Panel Zones ===== */
                .finding-record-zone {
                    position: absolute;
                    top: 38%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                    text-align: center;
                }

                .finding-record {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 2rem;
                    color: rgba(255, 255, 255, 0.9);
                    letter-spacing: 0.08em;
                    text-shadow: 0 0 10px rgba(0, 240, 255, 0.4);
                }

                .finding-spinner-zone {
                    position: absolute;
                    top: 52%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                    text-align: center;
                }

                .finding-spinner-icon {
                    color: #00f0ff;
                    animation: spinLoader 1.2s linear infinite;
                    filter: drop-shadow(0 0 10px rgba(0, 240, 255, 0.6));
                }

                @keyframes spinLoader {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .finding-opponent-zone {
                    position: absolute;
                    top: 55%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                    width: 75%;
                }

                .finding-opponent-zone .panel-stats {
                    width: 100%;
                    max-width: none;
                }

                .finding-opponent-zone .panel-stat-label {
                    font-size: 1.1rem;
                }

                .finding-opponent-zone .panel-stat-value {
                    font-size: 1.3rem;
                }

                .finding-stake-zone {
                    position: absolute;
                    bottom: 18%;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .finding-stake-label {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 1.3rem;
                    color: rgba(255, 255, 255, 0.6);
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                }

                .finding-stake-value {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 800;
                    font-size: 1.6rem;
                    color: #ffd700;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
                }

                .finding-cancel-hitbox {
                    position: absolute;
                    bottom: 3%;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 35%;
                    height: 9%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 10;
                }

                .result-panel-bg {
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 4px;
                }

                /* Score zone - positioned in the top header box */
                .result-score-zone {
                    position: absolute;
                    top: 5%;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2;
                    width: 70%;
                }

                .result-score-zone .panel-stats {
                    width: 100%;
                    max-width: none;
                    gap: 2px;
                }

                .result-score-zone .panel-stat-label {
                    font-size: 0.95rem;
                }

                .result-score-zone .panel-stat-value {
                    font-size: 1.1rem;
                }

                /* Stats zone - positioned below the baked-in title area */
                .result-stats-zone {
                    position: absolute;
                    top: 58%;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2;
                    width: 75%;
                }

                .result-stats-zone .panel-stats {
                    width: 100%;
                    max-width: none;
                    gap: 4px;
                }

                .result-stats-zone .panel-stat-label {
                    font-size: 1.1rem;
                }

                .result-stats-zone .panel-stat-value {
                    font-size: 1.3rem;
                }

                /* Invisible hitboxes over baked-in buttons */
                .result-play-again-hitbox {
                    position: absolute;
                    bottom: 8%;
                    left: 5%;
                    width: 45%;
                    height: 9%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 10;
                }

                .result-back-hitbox {
                    position: absolute;
                    bottom: 8%;
                    right: 5%;
                    width: 45%;
                    height: 9%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 10;
                }

                /* ===== PANEL TITLE — User's exact Orbitron spec ===== */
                .panel-title {
                    font-family: 'Orbitron', 'Exo 2', 'Rajdhani', sans-serif;
                    font-weight: 900;
                    font-size: 5rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    color: #ffffff;
                    text-align: center;
                    text-shadow:
                        0 0 12px #00ffff99,
                        0 0 24px #00ffff44,
                        3px 3px 6px #000000aa;
                    background: linear-gradient(to bottom, #ffffff, #d0d0d0);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                    line-height: 1.05;
                    white-space: pre-line;
                    margin: 0 0 4% 0;
                    padding: 0.5rem 0;
                }

                .panel-title.lose {
                    text-shadow:
                        0 0 12px #ff444499,
                        0 0 24px #ff444444,
                        3px 3px 6px #000000aa;
                }

                .panel-title.tie {
                    text-shadow:
                        0 0 12px #ffd70099,
                        0 0 24px #ffd70044,
                        3px 3px 6px #000000aa;
                }

                .ellipsis-pulse {
                    animation: ellipsisPulse 1.5s infinite;
                }

                @keyframes ellipsisPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.2; }
                }

                /* ===== STAT ROWS ===== */
                .panel-stats {
                    width: 75%;
                    max-width: 400px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 5%;
                }

                .panel-stat-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-size: 1rem;
                    letter-spacing: 0.04em;
                }

                .panel-stat-label {
                    color: rgba(255, 255, 255, 0.6);
                    font-weight: 700;
                    text-transform: uppercase;
                }

                .panel-stat-value {
                    font-weight: 900;
                }

                .panel-stat-value.cyan { color: #00f0ff; }
                .panel-stat-value.red { color: #ef4444; }
                .panel-stat-value.green { color: #22c55e; }
                .panel-stat-value.gold { color: #ffd700; }
                .panel-stat-value.white { color: #e8e8e8; }

                .panel-stat-divider {
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.3), transparent);
                    margin: 4px 0;
                }

                /* ===== PANEL BUTTONS ===== */
                .panel-buttons {
                    display: flex;
                    gap: 16px;
                    align-items: center;
                }

                .panel-btn-primary {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 800;
                    font-size: 1.1rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    color: #00f0ff;
                    background: linear-gradient(to bottom, #3a3e4a, #2a2e3a);
                    border: 1px solid rgba(0, 240, 255, 0.35);
                    border-radius: 6px;
                    padding: 12px 32px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
                }

                .panel-btn-primary:hover {
                    background: linear-gradient(to bottom, #4a4e5a, #3a3e4a);
                    box-shadow: 0 0 20px rgba(0, 240, 255, 0.3);
                    transform: translateY(-1px);
                }

                .panel-btn-secondary {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 0.85rem;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.5);
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 6px;
                    padding: 12px 24px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .panel-btn-secondary:hover {
                    color: rgba(255, 255, 255, 0.8);
                    border-color: rgba(255, 255, 255, 0.3);
                }

                /* ===== RESPONSIVE SCALING ===== */
                @media (max-width: 600px) {
                    .panel-title {
                        font-size: 2.5rem;
                    }
                    .panel-stat-row {
                        font-size: 0.8rem;
                    }
                    .panel-btn-primary {
                        font-size: 0.9rem;
                        padding: 10px 24px;
                    }
                    .panel-btn-secondary {
                        font-size: 0.75rem;
                        padding: 10px 18px;
                    }
                }

                @media (max-width: 400px) {
                    .panel-title {
                        font-size: 1.8rem;
                    }
                    .panel-stat-row {
                        font-size: 0.7rem;
                    }
                }

                /* ===== MOBILE OPTIMIZATION ===== */
                @media (max-width: 768px) {
                    .content {
                        padding: 60px 0 20px;
                    }

                    .lobby-image-wrapper {
                        max-height: calc(100dvh - 60px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .lobby-image {
                        max-height: calc(100dvh - 60px);
                        width: 100%;
                        object-fit: contain;
                    }
                }
            `}</style>
        </PageTransition>
    );
}
