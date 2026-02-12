/**
 * TOURNAMENTS PAGE — Route: /hub/trivia/tournaments
 * Daily bracket tournament with registration, bracket view, and round play
 * Tournaments start daily at 7PM CST, each round lasts 24 hours
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
import { Trophy, Calendar, Clock, Gem, Users, CheckCircle, XCircle, Medal, Award, Bell, Swords, AlertTriangle } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';

export default function TournamentsPage() {
    const router = useRouter();
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [tournaments, setTournaments] = useState([]);
    const [activeTournament, setActiveTournament] = useState(null);
    const [userEntry, setUserEntry] = useState(null);
    const [pastResults, setPastResults] = useState([]);
    const [gameState, setGameState] = useState('loading');
    const [notifications, setNotifications] = useState([]);

    // Bracket state
    const [rounds, setRounds] = useState([]);
    const [currentRoundData, setCurrentRoundData] = useState(null);
    const [myMatchup, setMyMatchup] = useState(null);
    const [opponentInfo, setOpponentInfo] = useState(null);

    // Playing state
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState(0);
    const [startTime, setStartTime] = useState(null);
    const [timeLeft, setTimeLeft] = useState(40);
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

    // Request browser notification permission
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Poll for notifications every 30 seconds
    useEffect(() => {
        if (!userId) return;
        const interval = setInterval(loadNotifications, 30000);
        return () => clearInterval(interval);
    }, [userId]);

    async function loadNotifications() {
        if (!userId) return;
        const { data } = await supabase
            .from('trivia_tournament_notifications')
            .select('*')
            .eq('user_id', userId)
            .eq('read', false)
            .order('created_at', { ascending: false })
            .limit(10);

        if (data && data.length > 0) {
            setNotifications(data);
            // Show browser notification for unread items
            if ('Notification' in window && Notification.permission === 'granted') {
                const latest = data[0];
                new Notification('Smarter Poker Tournament', {
                    body: latest.message,
                    icon: '/images/trivia/lobby-tournaments.jpg'
                });
            }
        }
    }

    async function dismissNotification(id) {
        await supabase
            .from('trivia_tournament_notifications')
            .update({ read: true })
            .eq('id', id);
        setNotifications(prev => prev.filter(n => n.id !== id));
    }

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

        // Find active tournament and load bracket data
        const active = tournamentData?.find(t => t.status === 'active');
        if (active) {
            setActiveTournament(active);
            await loadBracketData(active, user.id);

            // Check if user is registered
            const { data: entry } = await supabase
                .from('trivia_tournament_entries')
                .select('*')
                .eq('tournament_id', active.id)
                .eq('user_id', user.id)
                .single();

            setUserEntry(entry);
        }

        // Load past results
        const { data: past } = await supabase
            .from('trivia_tournaments')
            .select('*')
            .in('status', ['completed', 'cancelled'])
            .order('completed_at', { ascending: false })
            .limit(5);

        setPastResults(past || []);

        // Load notifications
        await loadNotifications();

        setGameState('lobby');
    }

    async function loadBracketData(tournament, uid) {
        // Load all rounds for this tournament
        const { data: roundsData } = await supabase
            .from('trivia_tournament_rounds')
            .select('*')
            .eq('tournament_id', tournament.id)
            .order('round_number', { ascending: true });

        setRounds(roundsData || []);

        // Find the current active round
        const activeRound = roundsData?.find(r => r.status === 'active');
        setCurrentRoundData(activeRound);

        // Find user's matchup in the current round
        if (activeRound && uid) {
            const matchups = activeRound.matchups || [];
            const myMatch = matchups.find(m =>
                m.player1_id === uid || m.player2_id === uid
            );
            setMyMatchup(myMatch);

            // Load opponent info
            if (myMatch) {
                const opponentId = myMatch.player1_id === uid ? myMatch.player2_id : myMatch.player1_id;
                if (opponentId) {
                    const { data: oppProfile } = await supabase
                        .from('profiles')
                        .select('username, avatar_url')
                        .eq('id', opponentId)
                        .single();

                    const { data: oppStats } = await supabase
                        .from('trivia_pvp_stats')
                        .select('wins, losses')
                        .eq('user_id', opponentId)
                        .single();

                    setOpponentInfo({
                        id: opponentId,
                        username: oppProfile?.username || 'Player',
                        avatar_url: oppProfile?.avatar_url,
                        wins: oppStats?.wins || 0,
                        losses: oppStats?.losses || 0
                    });
                }
            }
        }
    }

    async function handleRegister(tournament) {
        if (userDiamonds < tournament.entry_fee) {
            alert('Not enough diamonds!');
            return;
        }

        // Deduct entry fee
        const newBalance = userDiamonds - tournament.entry_fee;
        await supabase
            .from('profiles')
            .update({ diamonds: newBalance })
            .eq('id', userId);

        setUserDiamonds(newBalance);

        // Create entry
        const { data: entry } = await supabase
            .from('trivia_tournament_entries')
            .insert({
                tournament_id: tournament.id,
                user_id: userId,
                score: 0,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        setUserEntry(entry);

        // Update prize pool (net of 10% house rake)
        const netEntryFee = tournament.entry_fee - Math.floor(tournament.entry_fee * 0.1);
        await supabase
            .from('trivia_tournaments')
            .update({
                prize_pool: (tournament.prize_pool || 0) + netEntryFee
            })
            .eq('id', tournament.id);

        // Refresh tournament data
        await loadData();
    }

    async function startRoundPlay() {
        if (!activeTournament?.questions || activeTournament.questions.length === 0) {
            alert('No questions available for this round.');
            return;
        }

        // Use 20 questions per round (random from all categories)
        setQuestions(activeTournament.questions.slice(0, 20));
        setCurrentQuestionIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setShowResult(false);
        setTimeLeft(40);
        setStartTime(Date.now());
        setIsTimerRunning(true);
        setGameState('playing');
    }

    function handleTimeout() {
        setIsTimerRunning(false);
        selectAnswer(-1); // Wrong answer on timeout
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

        // Advance quickly — no GTO explanations in tournaments
        setTimeout(() => {
            if (currentQuestionIndex + 1 >= questions.length) {
                finishRoundPlay();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setTimeLeft(40);
                setIsTimerRunning(true);
            }
        }, 500);
    }

    async function finishRoundPlay() {
        setIsTimerRunning(false);
        const totalTime = Math.round((Date.now() - startTime) / 1000);

        // Submit score for bracket matchup
        if (currentRoundData && myMatchup) {
            const isPlayer1 = myMatchup.player1_id === userId;
            const scoreField = isPlayer1 ? 'player1_score' : 'player2_score';

            // Update the matchup in the round
            const updatedMatchups = currentRoundData.matchups.map(m => {
                if (m.match_index === myMatchup.match_index) {
                    return { ...m, [scoreField]: score };
                }
                return m;
            });

            // Check if both players have played — determine winner inline
            const updatedMatch = updatedMatchups.find(m => m.match_index === myMatchup.match_index);
            if (updatedMatch.player1_score !== null && updatedMatch.player2_score !== null) {
                if (updatedMatch.player1_score > updatedMatch.player2_score) {
                    updatedMatch.winner_id = updatedMatch.player1_id;
                } else if (updatedMatch.player2_score > updatedMatch.player1_score) {
                    updatedMatch.winner_id = updatedMatch.player2_id;
                } else {
                    // Tie — use time_spent as tiebreaker (faster wins)
                    updatedMatch.winner_id = userId; // Current player wins ties since they played
                }
            }

            await supabase
                .from('trivia_tournament_rounds')
                .update({ matchups: updatedMatchups })
                .eq('id', currentRoundData.id);

            // Also update the user's entry
            await supabase
                .from('trivia_tournament_entries')
                .update({
                    score: (userEntry?.score || 0) + score,
                    time_spent: (userEntry?.time_spent || 0) + totalTime,
                    completed_at: new Date().toISOString()
                })
                .eq('tournament_id', activeTournament.id)
                .eq('user_id', userId);
        }

        // Record question history
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions
                    .filter(q => q.id)
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

        // Refresh bracket data
        await loadBracketData(activeTournament, userId);
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

    function getDeadlineCountdown(deadline) {
        if (!deadline) return '';
        const diff = new Date(deadline) - new Date();
        if (diff <= 0) return 'Expired';
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m remaining`;
    }

    function getRoundName(roundNum, totalRounds) {
        if (!totalRounds) return `Round ${roundNum}`;
        const remaining = totalRounds - roundNum;
        if (remaining === 0) return 'Finals';
        if (remaining === 1) return 'Semi-Finals';
        if (remaining === 2) return 'Quarter-Finals';
        return `Round ${roundNum}`;
    }

    const currentQuestion = questions[currentQuestionIndex];
    const hasPlayedThisRound = myMatchup && (
        (myMatchup.player1_id === userId && myMatchup.player1_score !== null) ||
        (myMatchup.player2_id === userId && myMatchup.player2_score !== null)
    );
    const isEliminated = userEntry?.eliminated_round != null;

    return (
        <PageTransition>
            <Head>
                <title>Tournaments - Smarter.Poker Trivia</title>
                <meta name="description" content="Daily bracket tournaments at 7PM CST! Compete for diamond prizes!" />
            </Head>

            <div className="tournaments-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                <div className="content">
                    {/* Notifications Banner */}
                    {notifications.length > 0 && (
                        <div className="notifications-banner">
                            {notifications.map(n => (
                                <div key={n.id} className={`notification ${n.notification_type}`}>
                                    <Bell size={16} />
                                    <span>{n.message}</span>
                                    <button onClick={() => dismissNotification(n.id)} className="dismiss">✕</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {gameState === 'loading' && (
                        <div className="loading">
                            <div className="spinner" />
                            <p>Loading tournaments...</p>
                        </div>
                    )}

                    {gameState === 'lobby' && (
                        <div className="lobby">
                            {/* Lobby Image */}
                            <div className="lobby-image-wrapper">
                                <img
                                    src="/images/trivia/lobby-tournaments.jpg"
                                    alt="Tournaments - Daily Bracket Competitions"
                                    className="lobby-image"
                                />
                            </div>

                            {/* Active Tournament with Bracket */}
                            {activeTournament && (
                                <MetalFrame padding="24px" showBolts={true} className="active-tournament">
                                    <div className="tournament-badge live">
                                        <span className="pulse" />
                                        LIVE — Round {activeTournament.current_round || 1}
                                    </div>
                                    <h2>{activeTournament.name}</h2>

                                    <div className="tournament-info">
                                        <div className="info-item">
                                            <Gem size={16} />
                                            <span>Prize Pool: {activeTournament.prize_pool || 0}💎</span>
                                        </div>
                                        <div className="info-item">
                                            <Swords size={16} />
                                            <span>Round {activeTournament.current_round}/{activeTournament.total_rounds || '?'}</span>
                                        </div>
                                        {activeTournament.round_deadline && (
                                            <div className="info-item deadline">
                                                <Clock size={16} />
                                                <span>{getDeadlineCountdown(activeTournament.round_deadline)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Your Match Status */}
                                    {userEntry && !isEliminated && myMatchup && (
                                        <div className="match-card">
                                            <h4>Your Match — {getRoundName(activeTournament.current_round, activeTournament.total_rounds)}</h4>
                                            <div className="match-vs">
                                                <div className="match-player you">
                                                    <span className="player-name">You</span>
                                                    {hasPlayedThisRound && (
                                                        <span className="player-score">
                                                            {myMatchup.player1_id === userId ? myMatchup.player1_score : myMatchup.player2_score}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="vs-text">VS</span>
                                                <div className="match-player opponent">
                                                    <span className="player-name">{opponentInfo?.username || 'BYE'}</span>
                                                    {opponentInfo && (
                                                        <span className="player-record">{opponentInfo.wins}W-{opponentInfo.losses}L</span>
                                                    )}
                                                </div>
                                            </div>

                                            {myMatchup.is_bye ? (
                                                <div className="bye-notice">
                                                    <CheckCircle size={20} color="#22c55e" />
                                                    <span>BYE — You advance automatically!</span>
                                                </div>
                                            ) : hasPlayedThisRound ? (
                                                <div className="already-played">
                                                    <CheckCircle size={20} color="#22c55e" />
                                                    <span>Score submitted! Waiting for opponent...</span>
                                                </div>
                                            ) : (
                                                <HexButton
                                                    onClick={startRoundPlay}
                                                    variant="primary"
                                                    size="lg"
                                                >
                                                    PLAY YOUR MATCH
                                                </HexButton>
                                            )}

                                            {myMatchup.winner_id && (
                                                <div className={`match-result ${myMatchup.winner_id === userId ? 'won' : 'lost'}`}>
                                                    {myMatchup.winner_id === userId ? '🏆 You Won!' : '❌ Eliminated'}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Eliminated notice */}
                                    {isEliminated && (
                                        <div className="eliminated-notice">
                                            <AlertTriangle size={20} />
                                            <span>Eliminated in Round {userEntry.eliminated_round}</span>
                                        </div>
                                    )}

                                    {/* Not registered */}
                                    {!userEntry && activeTournament.current_round === 0 && (
                                        <HexButton
                                            onClick={() => handleRegister(activeTournament)}
                                            variant="primary"
                                            size="lg"
                                        >
                                            ENTER ({activeTournament.entry_fee}💎)
                                        </HexButton>
                                    )}

                                    {/* Bracket Visualization */}
                                    {rounds.length > 0 && (
                                        <div className="bracket-section">
                                            <h4>Tournament Bracket</h4>
                                            <div className="bracket-rounds">
                                                {rounds.map(round => (
                                                    <div key={round.id} className={`bracket-round ${round.status === 'active' ? 'active' : ''}`}>
                                                        <div className="round-header">
                                                            {getRoundName(round.round_number, activeTournament.total_rounds)}
                                                            {round.status === 'active' && <span className="round-active-dot" />}
                                                        </div>
                                                        <div className="round-matchups">
                                                            {(round.matchups || []).map((matchup, idx) => (
                                                                <div key={idx} className={`bracket-matchup ${matchup.winner_id ? 'completed' : ''} ${matchup.player1_id === userId || matchup.player2_id === userId ? 'my-match' : ''
                                                                    }`}>
                                                                    <div className={`bracket-player ${matchup.winner_id === matchup.player1_id ? 'winner' : ''}`}>
                                                                        <BracketPlayerName playerId={matchup.player1_id} userId={userId} />
                                                                        {matchup.player1_score !== null && (
                                                                            <span className="bracket-score">{matchup.player1_score}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className={`bracket-player ${matchup.winner_id === matchup.player2_id ? 'winner' : ''}`}>
                                                                        <BracketPlayerName playerId={matchup.player2_id} userId={userId} />
                                                                        {matchup.player2_score !== null && (
                                                                            <span className="bracket-score">{matchup.player2_score}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
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
                                                        <span>7:00 PM CST</span>
                                                    </div>
                                                </div>
                                                <div className="tournament-action">
                                                    <div className="countdown">{getCountdown(tournament.start_time)}</div>
                                                    <div className="entry-fee">{tournament.entry_fee}💎 entry</div>
                                                    {!userEntry && (
                                                        <HexButton
                                                            onClick={() => handleRegister(tournament)}
                                                            variant="secondary"
                                                            size="sm"
                                                        >
                                                            Register
                                                        </HexButton>
                                                    )}
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
                                                <span className="prize-pool">
                                                    {tournament.status === 'cancelled' ? 'Cancelled' : `${tournament.prize_pool || 0}💎 pool`}
                                                </span>
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

                            {/* No tournaments */}
                            {tournaments.length === 0 && (
                                <MetalFrame padding="32px" showBolts={true}>
                                    <div className="no-tournaments">
                                        <Trophy size={48} color="rgba(255,255,255,0.2)" />
                                        <p>No tournaments scheduled yet.</p>
                                        <span>Daily tournaments start at 7 PM CST!</span>
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

                    {/* Round Complete */}
                    {gameState === 'complete' && (
                        <div className="complete">
                            <MetalFrame padding="32px" showBolts={true}>
                                <Trophy size={48} color="#FFD700" />
                                <h1>Round Complete!</h1>

                                <div className="final-score">
                                    <span className="score-value">{score}</span>
                                    <span className="score-label">Points</span>
                                </div>

                                <p className="prize-note">
                                    Your score has been submitted. The round ends when all matches are played or the deadline passes.
                                </p>

                                <HexButton
                                    onClick={() => { setGameState('lobby'); loadData(); }}
                                    variant="primary"
                                    size="md"
                                >
                                    View Bracket
                                </HexButton>
                            </MetalFrame>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .tournaments-page {
                    min-height: 100vh;
                    background: #0a0e1a;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay { display: none; }

                .content {
                    position: relative;
                    padding: 80px 0 40px;
                    max-width: 100%;
                    margin: 0 auto;
                }

                /* Notifications */
                .notifications-banner {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 16px;
                    padding: 0 16px;
                }

                .notification {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    color: #fff;
                    animation: slideIn 0.3s ease;
                }

                .notification.round_start {
                    background: rgba(34, 197, 94, 0.15);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                }

                .notification.forfeit_warning {
                    background: rgba(239, 168, 68, 0.15);
                    border: 1px solid rgba(239, 168, 68, 0.3);
                }

                .notification.eliminated {
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }

                .notification.winner {
                    background: rgba(255, 215, 0, 0.15);
                    border: 1px solid rgba(255, 215, 0, 0.3);
                }

                .dismiss {
                    background: none;
                    border: none;
                    color: rgba(255,255,255,0.5);
                    cursor: pointer;
                    margin-left: auto;
                    font-size: 16px;
                }

                @keyframes slideIn {
                    from { transform: translateY(-10px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                /* Lobby */
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

                /* Active Tournament */
                .active-tournament { margin-bottom: 24px; }

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

                .info-item.deadline {
                    color: #ef4444;
                    font-weight: 600;
                }

                /* Match Card */
                .match-card {
                    background: rgba(30, 41, 59, 0.5);
                    border: 1px solid rgba(0, 212, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    margin: 16px 0;
                }

                .match-card h4 {
                    font-size: 14px;
                    color: #00D4FF;
                    text-transform: uppercase;
                    margin: 0 0 16px;
                }

                .match-vs {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                }

                .match-player {
                    text-align: center;
                    flex: 1;
                }

                .player-name {
                    display: block;
                    font-size: 16px;
                    font-weight: 700;
                    color: #fff;
                }

                .player-score {
                    display: block;
                    font-size: 24px;
                    font-weight: 800;
                    color: #FFD700;
                    margin-top: 4px;
                }

                .player-record {
                    display: block;
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                    margin-top: 2px;
                }

                .vs-text {
                    font-size: 14px;
                    font-weight: 700;
                    color: rgba(255,255,255,0.3);
                    padding: 0 16px;
                }

                .bye-notice, .already-played {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: rgba(34, 197, 94, 0.15);
                    border-radius: 8px;
                    color: #22c55e;
                    font-weight: 600;
                }

                .match-result {
                    margin-top: 12px;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    font-weight: 700;
                    font-size: 18px;
                }

                .match-result.won {
                    background: rgba(34, 197, 94, 0.2);
                    color: #22c55e;
                }

                .match-result.lost {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }

                .eliminated-notice {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 16px;
                    background: rgba(239, 68, 68, 0.15);
                    border-radius: 8px;
                    color: #ef4444;
                    font-weight: 600;
                    margin: 16px 0;
                }

                /* Bracket */
                .bracket-section {
                    margin-top: 24px;
                    padding-top: 24px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                }

                .bracket-section h4 {
                    font-size: 14px;
                    color: rgba(255,255,255,0.5);
                    text-transform: uppercase;
                    margin: 0 0 16px;
                }

                .bracket-rounds {
                    display: flex;
                    gap: 16px;
                    overflow-x: auto;
                    padding-bottom: 12px;
                }

                .bracket-round {
                    min-width: 180px;
                    flex-shrink: 0;
                }

                .bracket-round.active {
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 8px;
                    padding: 8px;
                    background: rgba(0, 212, 255, 0.05);
                }

                .round-header {
                    font-size: 12px;
                    font-weight: 700;
                    color: rgba(255,255,255,0.6);
                    text-transform: uppercase;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .round-active-dot {
                    width: 6px;
                    height: 6px;
                    background: #00D4FF;
                    border-radius: 50%;
                    animation: pulse 1.5s infinite;
                }

                .round-matchups {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .bracket-matchup {
                    background: rgba(30, 41, 59, 0.4);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 6px;
                    overflow: hidden;
                }

                .bracket-matchup.my-match {
                    border-color: rgba(0, 212, 255, 0.4);
                }

                .bracket-matchup.completed {
                    opacity: 0.7;
                }

                .bracket-player {
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 10px;
                    font-size: 12px;
                    color: rgba(255,255,255,0.6);
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .bracket-player:last-child {
                    border-bottom: none;
                }

                .bracket-player.winner {
                    color: #22c55e;
                    font-weight: 600;
                }

                .bracket-score {
                    font-weight: 700;
                    color: #FFD700;
                }

                /* Upcoming/Past sections */
                .upcoming-section, .past-section { margin-top: 24px; }

                .upcoming-section h3, .past-section h3 {
                    font-size: 16px;
                    color: rgba(255,255,255,0.6);
                    margin: 0 0 12px;
                }

                .tournament-card { margin-bottom: 12px; }

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
                    color: rgba(255,255,255,0.5);
                }

                .tournament-action { text-align: right; }

                .countdown {
                    font-size: 18px;
                    font-weight: 700;
                    color: #FFD700;
                }

                .entry-fee {
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                    margin-bottom: 8px;
                }

                /* Past */
                .past-card { margin-bottom: 12px; }

                .past-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    color: rgba(255,255,255,0.7);
                    font-size: 14px;
                }

                .prize-pool { color: #00D4FF; }

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

                .winner .prize { margin-left: auto; color: #22c55e; }

                .no-tournaments {
                    text-align: center;
                    color: rgba(255,255,255,0.5);
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

                .final-score { margin: 24px 0; }

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

                .prize-note {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 24px;
                }
            `}</style>
        </PageTransition>
    );
}

// Helper component to display player names in bracket
function BracketPlayerName({ playerId, userId }) {
    const [name, setName] = useState(null);

    useEffect(() => {
        if (!playerId) {
            setName('BYE');
            return;
        }
        if (playerId === userId) {
            setName('You');
            return;
        }

        supabase
            .from('profiles')
            .select('username')
            .eq('id', playerId)
            .single()
            .then(({ data }) => {
                setName(data?.username || 'Player');
            });
    }, [playerId, userId]);

    return <span className={playerId === userId ? 'bracket-you' : ''}>{name || '...'}</span>;
}
