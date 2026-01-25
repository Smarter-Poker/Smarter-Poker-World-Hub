/**
 * TRIVIA GAME PAGE - Individual mode gameplay
 * Route: /hub/trivia/[mode]
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getAuthUser } from '../../../src/lib/authUtils';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaGame from '../../../src/components/trivia/TriviaGame';
import TriviaResult from '../../../src/components/trivia/TriviaResult';
import LeaderboardDisplay from '../../../src/components/trivia/LeaderboardDisplay';
import { TRIVIA_MODES, calculateXP, calculateDiamonds } from '../../../src/lib/trivia/triviaEngine';

const CATEGORY_MAP = {
    daily: null,
    history: ['poker_history', 'famous_hands', 'player_profiles'],
    rules: ['rule_knowledge'],
    pro: ['gto_theory', 'tournament_facts'],
    arcade: null
};

export default function TriviaModePage() {
    const router = useRouter();
    const { mode } = router.query;

    const [gameState, setGameState] = useState('loading'); // loading, ready, playing, results
    const [questions, setQuestions] = useState([]);
    const [result, setResult] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [userStreak, setUserStreak] = useState(0);
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [error, setError] = useState(null);

    const supabase = createClientComponentClient();
    const modeConfig = mode ? TRIVIA_MODES[mode] : null;

    // Load questions and user data
    useEffect(() => {
        if (!mode || !modeConfig) return;

        async function initialize() {
            setGameState('loading');
            setError(null);

            try {
                // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
                const user = getAuthUser();
                if (user) {
                    setUserId(user.id);

                    // Get diamonds
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', user.id)
                        .single();

                    if (profile) {
                        setUserDiamonds(profile.diamonds || 0);
                    }

                    // Get streak
                    const { data: streakData } = await supabase
                        .from('trivia_streaks')
                        .select('current_streak')
                        .eq('user_id', user.id)
                        .single();

                    if (streakData) {
                        setUserStreak(streakData.current_streak || 0);
                    }
                }

                // Check arcade diamonds
                if (mode === 'arcade') {
                    const diamonds = userDiamonds || (await getUserDiamonds(user?.id));
                    if (diamonds < 10) {
                        setError('Not enough diamonds. You need 10 diamonds to play Diamond Arcade.');
                        setGameState('error');
                        return;
                    }
                }

                // Load questions
                const loadedQuestions = await loadQuestions(mode, modeConfig.questionsCount);
                if (loadedQuestions.length === 0) {
                    setError('No questions available. Please try again later.');
                    setGameState('error');
                    return;
                }

                setQuestions(loadedQuestions);

                // Load leaderboard for arcade
                if (mode === 'arcade') {
                    await loadLeaderboard();
                }

                setGameState('ready');
            } catch (err) {
                console.error('Error initializing trivia:', err);
                setError('Failed to load trivia. Please try again.');
                setGameState('error');
            }
        }

        initialize();
    }, [mode, supabase]);

    async function getUserDiamonds(userId) {
        if (!userId) return 0;
        const { data } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', userId)
            .single();
        return data?.diamonds || 0;
    }

    async function loadQuestions(mode, count) {
        const today = getTodayCST();

        // For daily mode, get today's question
        if (mode === 'daily') {
            const { data } = await supabase
                .from('trivia_questions')
                .select('*')
                .eq('daily_date', today)
                .order('order_index')
                .limit(1);

            if (data && data.length > 0) {
                return data;
            }

            // Fallback to random question
            const { data: fallback } = await supabase
                .from('trivia_questions')
                .select('*')
                .limit(1);

            return fallback || getFallbackQuestions(1);
        }

        // For category modes
        const categories = CATEGORY_MAP[mode];
        let query = supabase.from('trivia_questions').select('*');

        if (categories && categories.length > 0) {
            query = query.in('category', categories);
        }

        const { data } = await query.limit(50);

        if (!data || data.length === 0) {
            return getFallbackQuestions(count);
        }

        // Shuffle and return requested count
        return shuffleArray(data).slice(0, count);
    }

    async function loadLeaderboard() {
        const today = getTodayCST();
        const { data } = await supabase
            .from('trivia_scores')
            .select('*')
            .eq('play_date', today)
            .eq('mode', 'arcade')
            .order('score', { ascending: false })
            .limit(10);

        setLeaderboard(data || []);
    }

    function getFallbackQuestions(count) {
        const fallbacks = [
            {
                id: 'fb1',
                category: 'poker_history',
                difficulty: 'medium',
                question: 'In what year was the first World Series of Poker Main Event held?',
                options: ['1968', '1970', '1972', '1975'],
                correct_index: 1,
                explanation: 'The first WSOP was held in 1970 at Binion\'s Horseshoe Casino in Las Vegas.'
            },
            {
                id: 'fb2',
                category: 'player_profiles',
                difficulty: 'easy',
                question: 'Which player holds the record for most WSOP bracelets?',
                options: ['Phil Ivey', 'Doyle Brunson', 'Phil Hellmuth', 'Johnny Chan'],
                correct_index: 2,
                explanation: 'Phil Hellmuth holds the record with 17 WSOP bracelets.'
            },
            {
                id: 'fb3',
                category: 'rule_knowledge',
                difficulty: 'easy',
                question: 'In Texas Hold\'em, how many community cards are dealt in total?',
                options: ['3', '4', '5', '7'],
                correct_index: 2,
                explanation: 'Five community cards are dealt: 3 on the flop, 1 on the turn, and 1 on the river.'
            },
            {
                id: 'fb4',
                category: 'gto_theory',
                difficulty: 'hard',
                question: 'What does MDF stand for in GTO poker strategy?',
                options: ['Maximum Defense Frequency', 'Minimum Defense Frequency', 'Mean Defensive Fold', 'Marginal Defense Factor'],
                correct_index: 1,
                explanation: 'MDF (Minimum Defense Frequency) tells you how often to call to prevent opponent from profitably bluffing.'
            },
            {
                id: 'fb5',
                category: 'famous_hands',
                difficulty: 'medium',
                question: 'What is the "Dead Man\'s Hand" in poker?',
                options: ['Pocket Kings', 'Aces and Eights (black)', 'Queen-Seven offsuit', 'Two-Seven offsuit'],
                correct_index: 1,
                explanation: 'The Dead Man\'s Hand is two pair of black aces and black eights.'
            }
        ];

        return shuffleArray(fallbacks).slice(0, count);
    }

    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getTodayCST() {
        const now = new Date();
        const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        return `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;
    }

    const startGame = async () => {
        // Deduct diamonds for arcade mode
        if (mode === 'arcade' && userId) {
            const { error } = await supabase
                .from('profiles')
                .update({ diamonds: userDiamonds - 10 })
                .eq('id', userId);

            if (error) {
                console.error('Error deducting diamonds:', error);
                return;
            }
            setUserDiamonds(prev => prev - 10);
        }

        setGameState('playing');
    };

    const handleComplete = async (gameResult) => {
        const { correctCount, totalQuestions, timeSpent, timeRemaining } = gameResult;

        // Calculate rewards
        const xpEarned = calculateXP(mode, correctCount, totalQuestions, userStreak);
        const diamondsEarned = calculateDiamonds(mode, correctCount, totalQuestions, timeRemaining);

        // Update streak for daily mode
        let newStreak = userStreak;
        if (mode === 'daily' && correctCount > 0) {
            newStreak = userStreak + 1;
        } else if (mode === 'daily' && correctCount === 0) {
            newStreak = 0;
        }

        // Save results to database
        if (userId) {
            try {
                const today = getTodayCST();

                // Save score
                await supabase.from('trivia_scores').insert({
                    user_id: userId,
                    mode,
                    score: correctCount * 100 + (timeRemaining || 0) * 2,
                    correct_count: correctCount,
                    total_questions: totalQuestions,
                    time_spent: timeSpent,
                    xp_earned: xpEarned,
                    diamonds_earned: diamondsEarned,
                    play_date: today
                });

                // Update profile with XP and diamonds
                if (xpEarned > 0 || diamondsEarned > 0) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('xp, diamonds')
                        .eq('id', userId)
                        .single();

                    if (profile) {
                        await supabase
                            .from('profiles')
                            .update({
                                xp: (profile.xp || 0) + xpEarned,
                                diamonds: (profile.diamonds || 0) + diamondsEarned
                            })
                            .eq('id', userId);
                    }
                }

                // Record daily play
                if (mode === 'daily') {
                    await supabase.from('daily_trivia_plays').insert({
                        user_id: userId,
                        played_date: today,
                        was_correct: correctCount > 0,
                        streak_at_time: newStreak
                    });

                    // Update streak
                    await supabase.from('trivia_streaks').upsert({
                        user_id: userId,
                        current_streak: newStreak,
                        best_streak: Math.max(newStreak, userStreak),
                        last_play_date: today
                    });
                }
            } catch (err) {
                console.error('Error saving results:', err);
            }
        }

        setResult({
            mode,
            correctCount,
            totalQuestions,
            timeSpent,
            timeRemaining: timeRemaining || 0,
            xpEarned,
            diamondsEarned,
            streak: newStreak
        });

        setGameState('results');

        // Reload leaderboard for arcade
        if (mode === 'arcade') {
            await loadLeaderboard();
        }
    };

    const handlePlayAgain = () => {
        if (mode === 'arcade' && userDiamonds < 10) {
            router.push('/hub/trivia');
            return;
        }
        setResult(null);
        setGameState('ready');
    };

    if (!mode || !modeConfig) {
        return null;
    }

    return (
        <PageTransition>
            <Head>
                <title>{modeConfig.name} - Smarter.Poker Trivia</title>
                <meta name="description" content={modeConfig.description} />
                <meta name="viewport" content="width=800, user-scalable=no" />
            </Head>

            <div className="trivia-mode-page">
                <div className="bg-overlay" />

                <UniversalHeader pageDepth={2} />

                <div className="content">
                    {gameState === 'loading' && (
                        <div className="loading">
                            <div className="spinner" />
                            <p>Loading trivia...</p>
                        </div>
                    )}

                    {gameState === 'error' && (
                        <div className="error-state">
                            <p>{error}</p>
                            <button onClick={() => router.push('/hub/trivia')}>
                                Back to Trivia
                            </button>
                        </div>
                    )}

                    {gameState === 'ready' && (
                        <div className="ready-screen">
                            <div className="mode-info">
                                <h1>{modeConfig.name}</h1>
                                <p>{modeConfig.description}</p>

                                <div className="mode-details">
                                    <div className="detail">
                                        <span className="label">Questions</span>
                                        <span className="value">{modeConfig.questionsCount}</span>
                                    </div>
                                    {modeConfig.timeLimit && (
                                        <div className="detail">
                                            <span className="label">Time Limit</span>
                                            <span className="value">{modeConfig.timeLimit}s</span>
                                        </div>
                                    )}
                                    {modeConfig.diamondCost > 0 && (
                                        <div className="detail">
                                            <span className="label">Entry Cost</span>
                                            <span className="value">{modeConfig.diamondCost} 💎</span>
                                        </div>
                                    )}
                                </div>

                                <button className="start-btn" onClick={startGame}>
                                    {mode === 'arcade' ? `Play (${modeConfig.diamondCost} 💎)` : 'Start Quiz'}
                                </button>
                            </div>

                            {mode === 'arcade' && leaderboard.length > 0 && (
                                <div className="leaderboard-section">
                                    <LeaderboardDisplay entries={leaderboard} currentUserId={userId} />
                                </div>
                            )}
                        </div>
                    )}

                    {gameState === 'playing' && (
                        <TriviaGame
                            questions={questions}
                            mode={mode}
                            timeLimit={modeConfig.timeLimit}
                            onComplete={handleComplete}
                        />
                    )}

                    {gameState === 'results' && result && (
                        <div className="results-section">
                            <TriviaResult
                                {...result}
                                onPlayAgain={handlePlayAgain}
                            />

                            {mode === 'arcade' && leaderboard.length > 0 && (
                                <div className="leaderboard-section">
                                    <LeaderboardDisplay entries={leaderboard} currentUserId={userId} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .trivia-mode-page {
                    min-height: 100vh;
                    background: linear-gradient(135deg, #0a1628 0%, #1a2744 50%, #0f1d32 100%);
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    width: 800px;
                    max-width: 800px;
                    margin: 0 auto;
                }

                @media (max-width: 500px) { .trivia-mode-page { zoom: 0.5; } }
                @media (min-width: 501px) and (max-width: 700px) { .trivia-mode-page { zoom: 0.75; } }
                @media (min-width: 701px) and (max-width: 900px) { .trivia-mode-page { zoom: 0.95; } }
                @media (min-width: 901px) { .trivia-mode-page { zoom: 1.2; } }
                @media (min-width: 1400px) { .trivia-mode-page { zoom: 1.5; } }

                .bg-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background:
                        radial-gradient(ellipse at 30% 20%, rgba(14, 165, 233, 0.08), transparent 50%),
                        radial-gradient(ellipse at 70% 80%, rgba(139, 92, 246, 0.06), transparent 50%);
                    pointer-events: none;
                }

                .content {
                    position: relative;
                    padding: 100px 20px 40px;
                }

                .loading,
                .error-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.6);
                    text-align: center;
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #0ea5e9;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .error-state button {
                    margin-top: 20px;
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #ffffff;
                    cursor: pointer;
                }

                .ready-screen {
                    max-width: 600px;
                    margin: 0 auto;
                }

                .mode-info {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 40px;
                    text-align: center;
                    margin-bottom: 24px;
                }

                .mode-info h1 {
                    font-size: 32px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 12px 0;
                }

                .mode-info p {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0 0 32px 0;
                }

                .mode-details {
                    display: flex;
                    justify-content: center;
                    gap: 32px;
                    margin-bottom: 32px;
                }

                .detail {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .detail .label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 4px;
                }

                .detail .value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                }

                .start-btn {
                    padding: 16px 48px;
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    border: none;
                    border-radius: 10px;
                    color: #ffffff;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .start-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(14, 165, 233, 0.4);
                }

                .leaderboard-section {
                    margin-top: 24px;
                }

                .results-section {
                    max-width: 600px;
                    margin: 0 auto;
                }
            `}</style>
        </PageTransition>
    );
}
