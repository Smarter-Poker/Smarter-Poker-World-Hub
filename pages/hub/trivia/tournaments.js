/**
 * TOURNAMENTS PAGE — Route: /hub/trivia/tournaments
 * Weekly tournament hub with registration, live leaderboard, and results
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Trophy, Calendar, Clock, Gem, Users, CheckCircle, XCircle, Medal, Award } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';

export default function TournamentsPage() {
    const router = useRouter();
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [tournaments, setTournaments] = useState([]);
    const [activeTournament, setActiveTournament] = useState(null);
    const [userEntry, setUserEntry] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [pastResults, setPastResults] = useState([]);
    const [gameState, setGameState] = useState('loading'); // loading, lobby, playing, complete

    // Playing state
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState(0);
    const [startTime, setStartTime] = useState(null);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isTimerRunning, setIsTimerRunning] = useState(false);

    const timerRef = useRef(null);

    useEffect(() => {
        loadData();

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
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

    async function loadData() {
        const user = getAuthUser();
        if (!user) {
            router.push('/hub/trivia');
            return;
        }

        setUserId(user.id);

        // Load diamonds
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', user.id)
            .single();

        if (profile) setUserDiamonds(profile.diamonds || 0);

        // Load upcoming/active tournaments
        const { data: tournamentData } = await supabase
            .from('trivia_tournaments')
            .select('*')
            .in('status', ['upcoming', 'active'])
            .order('start_time', { ascending: true });

        setTournaments(tournamentData || []);

        // Find active tournament
        const active = tournamentData?.find(t => t.status === 'active');
        if (active) {
            setActiveTournament(active);
            await loadLeaderboard(active.id);

            // Check if user already played
            const { data: entry } = await supabase
                .from('trivia_tournament_entries')
                .select('*')
                .eq('tournament_id', active.id)
                .eq('user_id', user.id)
                .single();

            if (entry?.completed_at) {
                setUserEntry(entry);
            }
        }

        // Load past results
        const { data: past } = await supabase
            .from('trivia_tournaments')
            .select('*')
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(5);

        setPastResults(past || []);
        setGameState('lobby');
    }

    async function loadLeaderboard(tournamentId) {
        const { data } = await supabase
            .from('trivia_tournament_entries')
            .select('*, profiles(username)')
            .eq('tournament_id', tournamentId)
            .not('completed_at', 'is', null)
            .order('score', { ascending: false })
            .order('time_spent', { ascending: true })
            .limit(50);

        setLeaderboard(data || []);
    }

    async function handleRegister(tournament) {
        if (userDiamonds < tournament.entry_fee) {
            alert('Not enough diamonds!');
            return;
        }

        // Deduct entry fee
        await supabase
            .from('profiles')
            .update({ diamonds: userDiamonds - tournament.entry_fee })
            .eq('id', userId);
        setUserDiamonds(prev => prev - tournament.entry_fee);

        // Create entry
        const { data: entry } = await supabase
            .from('trivia_tournament_entries')
            .insert({
                tournament_id: tournament.id,
                user_id: userId,
                score: 0,
                time_spent: 0
            })
            .select()
            .single();

        // Update prize pool
        await supabase
            .from('trivia_tournaments')
            .update({
                prize_pool: (tournament.prize_pool || 0) + tournament.entry_fee
            })
            .eq('id', tournament.id);

        setUserEntry(entry);
        setActiveTournament(tournament);

        // Start playing immediately if tournament is active
        if (tournament.status === 'active') {
            startTournamentPlay(tournament);
        }
    }

    function startTournamentPlay(tournament) {
        setQuestions(tournament.questions || []);
        setCurrentQuestionIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setShowResult(false);
        setStartTime(Date.now());
        setTimeLeft(30);
        setIsTimerRunning(true);
        setGameState('playing');
    }

    function handleTimeout() {
        setIsTimerRunning(false);
        selectAnswer(-1);
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null || showResult) return;

        setIsTimerRunning(false);
        setSelectedAnswer(index);
        setShowResult(true);

        const currentQuestion = questions[currentQuestionIndex];
        const isCorrect = index === currentQuestion?.correct_index;

        if (isCorrect) {
            setScore(prev => prev + 100);
        }

        setTimeout(() => {
            if (currentQuestionIndex + 1 >= questions.length) {
                finishTournament();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setTimeLeft(30);
                setIsTimerRunning(true);
            }
        }, 1000);
    }

    async function finishTournament() {
        setIsTimerRunning(false);
        const totalTime = Math.round((Date.now() - startTime) / 1000);

        // Update entry
        await supabase
            .from('trivia_tournament_entries')
            .update({
                score,
                time_spent: totalTime,
                completed_at: new Date().toISOString()
            })
            .eq('tournament_id', activeTournament.id)
            .eq('user_id', userId);

        setUserEntry(prev => ({
            ...prev,
            score,
            time_spent: totalTime,
            completed_at: new Date().toISOString()
        }));

        // Record question history for 60-day non-repeat tracking
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions
                    .filter(q => q.id) // Only record questions with valid IDs
                    .map(q => ({
                        user_id: userId,
                        question_id: q.id,
                        was_correct: true,
                        seen_at: new Date().toISOString(),
                        mode: 'tournament'
                    }));

                if (historyRecords.length > 0) {
                    await supabase.from('trivia_user_question_history')
                        .upsert(historyRecords, {
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: false
                        });
                }
            } catch (e) {
                console.error('[Tournaments] Error recording history:', e);
            }
        }

        await loadLeaderboard(activeTournament.id);
        setGameState('complete');
    }

    function getCountdown(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        const diff = start - now;

        if (diff <= 0) return 'Starting...';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ${hours % 24}h`;
        }
        return `${hours}h ${minutes}m`;
    }

    const currentQuestion = questions[currentQuestionIndex];

    return (
        <PageTransition>
            <Head>
                <title>Tournaments - Smarter.Poker Trivia</title>
                <meta name="description" content="Compete in weekly trivia tournaments for big diamond prizes!" />
            </Head>

            <div className="tournaments-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                <div className="content">
                    {gameState === 'loading' && (
                        <div className="loading">
                            <div className="spinner" />
                            <p>Loading tournaments...</p>
                        </div>
                    )}

                    {gameState === 'lobby' && (
                        <div className="lobby">
                            {/* Lobby Image Header */}
                            <div className="lobby-image-wrapper">
                                <img
                                    src="/images/trivia/lobby-tournaments.jpg"
                                    alt="Tournaments - Weekly Competitions Win Big Prizes!"
                                    className="lobby-image"
                                />
                            </div>

                            {/* Header */}
                            <div className="page-header">
                                <Trophy size={32} color="#FFD700" />
                                <h1>TOURNAMENTS</h1>
                                <div className="diamond-balance">
                                    <Gem size={18} /> {userDiamonds}
                                </div>
                            </div>

                            {/* Active Tournament */}
                            {activeTournament && (
                                <MetalFrame padding="24px" showBolts={true} className="active-tournament">
                                    <div className="tournament-badge live">
                                        <span className="pulse" />
                                        LIVE NOW
                                    </div>
                                    <h2>{activeTournament.name}</h2>

                                    <div className="tournament-info">
                                        <div className="info-item">
                                            <Gem size={16} />
                                            <span>Prize Pool: {activeTournament.prize_pool || activeTournament.entry_fee}💎</span>
                                        </div>
                                        <div className="info-item">
                                            <Users size={16} />
                                            <span>{leaderboard.length} players</span>
                                        </div>
                                        <div className="info-item">
                                            <Clock size={16} />
                                            <span>Ends: {new Date(activeTournament.end_time).toLocaleTimeString()}</span>
                                        </div>
                                    </div>

                                    {userEntry?.completed_at ? (
                                        <div className="already-played">
                                            <CheckCircle size={20} color="#22c55e" />
                                            <span>You scored {userEntry.score} points!</span>
                                        </div>
                                    ) : (
                                        <HexButton
                                            onClick={() => userEntry ? startTournamentPlay(activeTournament) : handleRegister(activeTournament)}
                                            variant="primary"
                                            size="lg"
                                        >
                                            {userEntry ? 'PLAY NOW' : `ENTER (${activeTournament.entry_fee}💎)`}
                                        </HexButton>
                                    )}

                                    {/* Mini Leaderboard */}
                                    {leaderboard.length > 0 && (
                                        <div className="mini-leaderboard">
                                            <h4>Top Players</h4>
                                            {leaderboard.slice(0, 5).map((entry, idx) => (
                                                <div key={entry.id} className={`lb-row ${entry.user_id === userId ? 'you' : ''}`}>
                                                    <span className="rank">{idx + 1}</span>
                                                    <span className="name">{entry.profiles?.username || 'Player'}</span>
                                                    <span className="score">{entry.score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </MetalFrame>
                            )}

                            {/* Upcoming Tournaments */}
                            {tournaments.filter(t => t.status === 'upcoming').length > 0 && (
                                <div className="upcoming-section">
                                    <h3>Upcoming Tournaments</h3>
                                    {tournaments.filter(t => t.status === 'upcoming').map(tournament => (
                                        <MetalFrame key={tournament.id} padding="20px" showBolts={false} className="tournament-card">
                                            <div className="tournament-row">
                                                <div className="tournament-details">
                                                    <h4>{tournament.name}</h4>
                                                    <div className="tournament-meta">
                                                        <Calendar size={14} />
                                                        <span>{new Date(tournament.start_time).toLocaleDateString()}</span>
                                                        <Clock size={14} />
                                                        <span>{new Date(tournament.start_time).toLocaleTimeString()}</span>
                                                    </div>
                                                </div>
                                                <div className="tournament-action">
                                                    <div className="countdown">{getCountdown(tournament.start_time)}</div>
                                                    <div className="entry-fee">{tournament.entry_fee}💎 entry</div>
                                                </div>
                                            </div>
                                        </MetalFrame>
                                    ))}
                                </div>
                            )}

                            {/* Past Results */}
                            {pastResults.length > 0 && (
                                <div className="past-section">
                                    <h3>Past Tournaments</h3>
                                    {pastResults.map(tournament => (
                                        <MetalFrame key={tournament.id} padding="16px" showBolts={false} className="past-card">
                                            <div className="past-header">
                                                <span>{tournament.name}</span>
                                                <span className="prize-pool">{tournament.prize_pool}💎 pool</span>
                                            </div>
                                            {tournament.winners && (
                                                <div className="winners">
                                                    {tournament.winners.slice(0, 3).map((winner, idx) => (
                                                        <div key={idx} className="winner">
                                                            {idx === 0 ? <Trophy size={14} color="#FFD700" /> :
                                                                idx === 1 ? <Medal size={14} color="#C0C0C0" /> :
                                                                    <Award size={14} color="#CD7F32" />}
                                                            <span>{winner.username}</span>
                                                            <span className="prize">+{winner.prize}💎</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </MetalFrame>
                                    ))}
                                </div>
                            )}

                            {/* No tournaments message */}
                            {tournaments.length === 0 && (
                                <MetalFrame padding="32px" showBolts={true}>
                                    <div className="no-tournaments">
                                        <Trophy size={48} color="rgba(255,255,255,0.2)" />
                                        <p>No tournaments scheduled yet.</p>
                                        <span>Check back every Saturday at 8 PM CST!</span>
                                    </div>
                                </MetalFrame>
                            )}
                        </div>
                    )}

                    {/* Playing */}
                    {gameState === 'playing' && currentQuestion && (
                        <div className="playing">
                            <div className="play-header">
                                <div className="question-counter">
                                    Q{currentQuestionIndex + 1}/{questions.length}
                                </div>
                                <div className="current-score">
                                    Score: {score}
                                </div>
                                <div className={`timer ${timeLeft <= 10 ? 'danger' : ''}`}>
                                    {timeLeft}s
                                </div>
                            </div>

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
                                                    <CheckCircle size={20} className="correct-icon" />
                                                )}
                                                {showResult && idx === selectedAnswer && idx !== currentQuestion.correct_index && (
                                                    <XCircle size={20} className="wrong-icon" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </MetalFrame>
                        </div>
                    )}

                    {/* Complete */}
                    {gameState === 'complete' && (
                        <div className="complete">
                            <MetalFrame padding="32px" showBolts={true}>
                                <Trophy size={48} color="#FFD700" />
                                <h1>Tournament Complete!</h1>

                                <div className="final-score">
                                    <span className="score-value">{score}</span>
                                    <span className="score-label">Points</span>
                                </div>

                                <p className="time-info">
                                    Completed in {userEntry?.time_spent || 0} seconds
                                </p>

                                {/* Find user's rank */}
                                <div className="rank-display">
                                    <span>Current Rank:</span>
                                    <strong>#{leaderboard.findIndex(e => e.user_id === userId) + 1}</strong>
                                    <span>of {leaderboard.length}</span>
                                </div>

                                <p className="prize-note">
                                    Winners will be announced when the tournament ends!
                                </p>

                                <HexButton
                                    onClick={() => router.push('/hub/trivia')}
                                    variant="primary"
                                    size="md"
                                >
                                    Back to Trivia
                                </HexButton>
                            </MetalFrame>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .tournaments-page {
                    min-height: 100vh;
                    background: url('/images/trivia/starfield-bg.png') center center / cover no-repeat;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay {
                    display: none;
                }

                .content {
                    position: relative;
                    padding: 100px 20px 40px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .lobby-image-wrapper {
                    border-radius: 16px;
                    overflow: hidden;
                    margin-bottom: 24px;
                }

                .lobby-image {
                    width: 100%;
                    height: auto;
                    display: block;
                }

                .loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.6);
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #FFD700;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .page-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 24px;
                }

                .page-header h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    color: #fff;
                    margin: 0;
                    flex: 1;
                }

                .diamond-balance {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 8px;
                    color: #00D4FF;
                    font-weight: 600;
                }

                /* Active Tournament */
                .active-tournament {
                    margin-bottom: 24px;
                }

                .tournament-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                    margin-bottom: 12px;
                }

                .tournament-badge.live {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }

                .pulse {
                    width: 8px;
                    height: 8px;
                    background: #ef4444;
                    border-radius: 50%;
                    animation: pulse 1.5s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                }

                .active-tournament h2 {
                    font-size: 20px;
                    color: #fff;
                    margin: 0 0 16px;
                }

                .tournament-info {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 16px;
                    margin-bottom: 20px;
                }

                .info-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .already-played {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: rgba(34, 197, 94, 0.15);
                    border-radius: 8px;
                    color: #22c55e;
                    font-weight: 600;
                }

                .mini-leaderboard {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .mini-leaderboard h4 {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    margin: 0 0 12px;
                }

                .lb-row {
                    display: flex;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .lb-row.you {
                    background: rgba(0, 212, 255, 0.1);
                    margin: 0 -16px;
                    padding: 8px 16px;
                    border-radius: 6px;
                }

                .lb-row .rank {
                    width: 30px;
                    font-weight: 700;
                    color: #FFD700;
                }

                .lb-row .name {
                    flex: 1;
                    color: #fff;
                }

                .lb-row .score {
                    font-weight: 600;
                    color: #00D4FF;
                }

                /* Upcoming */
                .upcoming-section, .past-section {
                    margin-top: 24px;
                }

                .upcoming-section h3, .past-section h3 {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0 0 12px;
                }

                .tournament-card {
                    margin-bottom: 12px;
                }

                .tournament-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .tournament-details h4 {
                    font-size: 16px;
                    color: #fff;
                    margin: 0 0 6px;
                }

                .tournament-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .tournament-action {
                    text-align: right;
                }

                .countdown {
                    font-size: 18px;
                    font-weight: 700;
                    color: #FFD700;
                }

                .entry-fee {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                /* Past */
                .past-card {
                    margin-bottom: 12px;
                }

                .past-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                }

                .prize-pool {
                    color: #00D4FF;
                }

                .winners {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .winner {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    color: #fff;
                }

                .winner .prize {
                    margin-left: auto;
                    color: #22c55e;
                }

                .no-tournaments {
                    text-align: center;
                    color: rgba(255, 255, 255, 0.5);
                }

                .no-tournaments p {
                    font-size: 18px;
                    margin: 16px 0 8px;
                    color: #fff;
                }

                /* Playing */
                .play-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding: 12px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border-radius: 10px;
                }

                .question-counter, .current-score {
                    font-weight: 600;
                    color: #fff;
                }

                .timer {
                    font-size: 20px;
                    font-weight: 700;
                    color: #fff;
                    padding: 4px 12px;
                    background: rgba(0, 212, 255, 0.2);
                    border-radius: 6px;
                }

                .timer.danger {
                    color: #ef4444;
                    background: rgba(239, 68, 68, 0.2);
                    animation: pulse 0.5s infinite;
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
                .correct-icon { color: #22c55e; margin-left: auto; }
                .wrong-icon { color: #ef4444; margin-left: auto; }

                /* Complete */
                .complete { text-align: center; }

                .complete h1 {
                    font-size: 24px;
                    color: #FFD700;
                    margin: 16px 0;
                }

                .final-score {
                    margin: 24px 0;
                }

                .score-value {
                    display: block;
                    font-size: 56px;
                    font-weight: 700;
                    color: #fff;
                }

                .score-label {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .time-info {
                    color: rgba(255, 255, 255, 0.6);
                    margin-bottom: 20px;
                }

                .rank-display {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 16px;
                    background: rgba(255, 215, 0, 0.1);
                    border-radius: 10px;
                    margin-bottom: 20px;
                    color: #fff;
                }

                .rank-display strong {
                    font-size: 24px;
                    color: #FFD700;
                }

                .prize-note {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 24px;
                }
            `}</style>
        </PageTransition>
    );
}
