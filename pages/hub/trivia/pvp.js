/**
 * PVP PAGE — Route: /hub/trivia/pvp
 * 1v1 trivia battles with diamond stakes
 * Uses Supabase Realtime for live matchmaking
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import {
    joinMatchmakingQueue,
    leaveMatchmakingQueue,
    findMatch,
    subscribeToQueue,
    subscribeToMatch,
    submitMatchScore,
    processMatchReward
} from '../../../src/services/pvpMatchmaking';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Swords, Trophy, Gem, Users, Clock, CheckCircle, XCircle, Zap } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';

const STAKE_OPTIONS = [10, 25, 50, 100];

export default function PvPPage() {
    const router = useRouter();
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

    // Horse (AI opponent) battle state
    const [isHorseMatch, setIsHorseMatch] = useState(false);
    const horseAnswersRef = useRef([]);

    useEffect(() => {
        loadUserData();

        return () => {
            // Cleanup subscriptions
            if (queueSubscription.current) {
                supabase.removeChannel(queueSubscription.current);
            }
            if (matchSubscription.current) {
                supabase.removeChannel(matchSubscription.current);
            }
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current);
            }
        };
    }, []);

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
        const user = getAuthUser();
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
            .single();

        if (profile) {
            setUserDiamonds(profile.diamonds || 0);
            setUsername(profile.username || 'Player');
        }

        // Get PvP stats from persistent stats table
        const { data: pvpStats } = await supabase
            .from('trivia_pvp_stats')
            .select('*')
            .eq('user_id', user.id)
            .single();

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
            .single();

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

        // Deduct stake immediately
        await supabase
            .from('profiles')
            .update({ diamonds: userDiamonds - stake })
            .eq('id', userId);
        setUserDiamonds(prev => prev - stake);

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
            console.warn('[PvP] Queue join failed, horse fallback will handle it:', err);
        }
    }

    // Horse Match - Select random AI horse as opponent
    async function handleHorseMatch(stake) {
        if (queueSubscription.current) {
            supabase.removeChannel(queueSubscription.current);
        }

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
                .gte('seen_at', sixtyDaysAgo.toISOString());

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

        // Pre-calculate horse answers based on stake-dependent accuracy
        // Higher stakes = smarter horse (60-85% accuracy)
        const horseAccuracy = 0.60 + (Math.min(stake, 100) / 100) * 0.25;
        const horseAnswers = matchQuestions.map(q => {
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
        setQuestions(matchQuestions);
        setMatchId(`horse-match-${Date.now()}`);
        setIsPlayer1(true);

        // Start battle after short delay
        setTimeout(() => {
            setGameState('battle');
            setCurrentQuestionIndex(0);
            setPlayerScore(0);
            setSelectedAnswer(null);
            setShowResult(false);
            setTimeLeft(40);
            setIsTimerRunning(true);
        }, 2000);
    }

    function handleMatchFound(matchData) {
        if (queueSubscription.current) {
            supabase.removeChannel(queueSubscription.current);
        }
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        setMatchId(matchData.match.id);
        setOpponent(matchData.opponent);
        setQuestions(matchData.questions);
        setIsPlayer1(matchData.match.player1_id === userId);

        // Subscribe to match updates
        matchSubscription.current = subscribeToMatch(matchData.match.id, handleMatchUpdate);

        // Start the battle after short delay
        setTimeout(() => {
            setGameState('battle');
            setCurrentQuestionIndex(0);
            setPlayerScore(0);
            setSelectedAnswer(null);
            setShowResult(false);
            setTimeLeft(40);
            setIsTimerRunning(true);
        }, 2000);
    }

    async function handleNoMatchFound() {
        // This is now only called if horse match also fails
        // Refund stake as fallback
        await supabase
            .from('profiles')
            .update({ diamonds: userDiamonds + stakeAmount })
            .eq('id', userId);
        setUserDiamonds(prev => prev + stakeAmount);

        await leaveMatchmakingQueue(userId);
        setGameState('lobby');
        alert('Unable to start match. Please try again!');
    }

    async function handleCancelSearch() {
        if (queueSubscription.current) {
            supabase.removeChannel(queueSubscription.current);
        }
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        leaveMatchmakingQueue(userId);

        // Refund stake — fetch fresh balance from DB to avoid stale state
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .single();

        if (profile) {
            const refundedBalance = (profile.diamonds || 0) + stakeAmount;
            await supabase
                .from('profiles')
                .update({ diamonds: refundedBalance })
                .eq('id', userId);
            setUserDiamonds(refundedBalance);
        }

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
        const isCorrect = index === currentQuestion?.correct_index;

        if (isCorrect) {
            setPlayerScore(prev => prev + 1);
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

        const finalScore = playerScore + (selectedAnswer === questions[currentQuestionIndex]?.correct_index ? 1 : 0);

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
            // Award winnings to player
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .single();

            if (profile) {
                await supabase
                    .from('profiles')
                    .update({ diamonds: (profile.diamonds || 0) + winnings })
                    .eq('id', userId);
                setUserDiamonds((profile.diamonds || 0) + winnings);
            }
        } else if (tied) {
            // Refund stake on tie
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .single();

            if (profile) {
                await supabase
                    .from('profiles')
                    .update({ diamonds: (profile.diamonds || 0) + stakeAmount })
                    .eq('id', userId);
                setUserDiamonds((profile.diamonds || 0) + stakeAmount);
            }
            winnings = stakeAmount; // Show refund amount
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

        // Record question history for 60-day non-repeat
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions.map(q => ({
                    user_id: userId,
                    question_id: q.id,
                    was_correct: true,
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
        if (matchSubscription.current) {
            supabase.removeChannel(matchSubscription.current);
        }

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
                .single();
            if (profile) setUserDiamonds(profile.diamonds);
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

        // Update stats
        if (won) {
            setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else if (match.winner_id && match.winner_id !== userId) {
            setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        }

        // Record question history for 60-day non-repeat
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions.map(q => ({
                    user_id: userId,
                    question_id: q.id,
                    was_correct: true,
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
        setOpponentScore(null);
        setIsHorseMatch(false);
        horseAnswersRef.current = [];
    }

    const currentQuestion = questions[currentQuestionIndex];

    return (
        <PageTransition>
            <Head>
                <title>1v1 Battle - Smarter.Poker Trivia</title>
                <meta name="description" content="Challenge players to 1v1 trivia battles!" />
            </Head>

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
                                onClick={() => handleFindMatch(STAKE_OPTIONS[0])}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0, 212, 255, 0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <img
                                    src="/images/trivia/lobby-pvp.jpg"
                                    alt="1v1 Battle - Start Challenge"
                                    style={{ width: '100%', height: 'auto', display: 'block' }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Searching for opponent */}
                    {gameState === 'searching' && (
                        <div className="searching">
                            <MetalFrame padding="32px" showBolts={true}>
                                <div className="search-content">
                                    <Users size={48} className="pulse-icon" />
                                    <h2>Finding Opponent...</h2>
                                    <p>Stake: {stakeAmount} 💎</p>

                                    {opponent ? (
                                        <div className="opponent-found">
                                            <Zap size={24} color="#22c55e" />
                                            <span>Opponent Found!</span>
                                            <strong>{opponent.username}</strong>
                                            <span className="opp-stats">{opponent.wins}W - {opponent.losses}L</span>
                                        </div>
                                    ) : (
                                        <div className="search-spinner">
                                            <div className="spinner" />
                                            <span>Looking for players at {stakeAmount}💎 stake...</span>
                                        </div>
                                    )}

                                    <HexButton onClick={handleCancelSearch} variant="secondary" size="md">
                                        Cancel
                                    </HexButton>
                                </div>
                            </MetalFrame>
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
                                    <span>Waiting for opponent to finish...</span>
                                </div>
                            </MetalFrame>
                        </div>
                    )}

                    {/* Results */}
                    {gameState === 'result' && result && (
                        <div className="result-screen">
                            <MetalFrame padding="32px" showBolts={true}>
                                <div className={`result-header ${result.won ? 'win' : 'lose'}`}>
                                    <Swords size={48} />
                                    <h1>{result.won ? 'VICTORY!' : result.playerScore === result.opponentScore ? 'TIE!' : 'DEFEAT'}</h1>
                                </div>

                                <div className="result-summary">
                                    <div className="score-comparison">
                                        <div className="player-result you">
                                            <span className="name">You</span>
                                            <span className="final-score">{result.playerScore}</span>
                                        </div>
                                        <span className="vs-small">vs</span>
                                        <div className="player-result opp">
                                            <span className="name">{result.opponent?.username}</span>
                                            <span className="final-score">{result.opponentScore}</span>
                                        </div>
                                    </div>

                                    <div className={`diamond-change ${result.won ? 'win' : 'lose'}`}>
                                        <Gem size={24} />
                                        <span>{result.won ? '+' : ''}{result.won ? result.winnings : -stakeAmount}</span>
                                    </div>
                                </div>

                                <div className="result-actions">
                                    <HexButton
                                        label="Battle Again"
                                        onClick={handlePlayAgain}
                                        variant="primary"
                                    />
                                    <HexButton
                                        label="Back to Trivia"
                                        onClick={() => router.push('/hub/trivia')}
                                        variant="secondary"
                                    />
                                </div>
                            </MetalFrame>
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

                /* Searching */
                .search-content {
                    text-align: center;
                }

                .search-content h2 {
                    color: #fff;
                    margin: 16px 0 8px;
                }

                .search-content p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0 0 24px;
                }

                .pulse-icon {
                    color: #00d4ff;
                    animation: pulse 1.5s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.1); }
                }

                .search-spinner, .waiting-spinner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    margin: 24px 0;
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #00d4ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .opponent-found {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    padding: 24px;
                    background: rgba(34, 197, 94, 0.1);
                    border-radius: 12px;
                    margin: 24px 0;
                }

                .opponent-found strong {
                    font-size: 20px;
                    color: #fff;
                }

                .opp-stats {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
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

                .option:hover:not(:disabled) {
                    background: rgba(30, 41, 59, 0.9);
                    border-color: rgba(0, 212, 255, 0.5);
                }

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

                /* Waiting */
                .waiting { text-align: center; }
                .waiting h2 { color: #fff; margin: 0 0 12px; }
                .waiting p { color: rgba(255, 255, 255, 0.7); }

                /* Results */
                .result-screen { text-align: center; }

                .result-header { margin-bottom: 24px; }
                .result-header.win { color: #22c55e; }
                .result-header.lose { color: #ef4444; }

                .result-header h1 {
                    font-size: 32px;
                    margin: 12px 0 0 0;
                }

                .result-summary { margin-bottom: 24px; }

                .score-comparison {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 24px;
                    margin-bottom: 16px;
                }

                .player-result {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .player-result .name {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .player-result .final-score {
                    font-size: 36px;
                    font-weight: 700;
                }

                .player-result.you .final-score { color: #00d4ff; }
                .player-result.opp .final-score { color: #ef4444; }

                .vs-small {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.3);
                }

                .diamond-change {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    font-size: 32px;
                    font-weight: 700;
                    padding: 16px;
                    border-radius: 12px;
                }

                .diamond-change.win {
                    background: rgba(34, 197, 94, 0.15);
                    color: #22c55e;
                }

                .diamond-change.lose {
                    background: rgba(239, 68, 68, 0.15);
                    color: #ef4444;
                }

                .result-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
            `}</style>
        </PageTransition>
    );
}
