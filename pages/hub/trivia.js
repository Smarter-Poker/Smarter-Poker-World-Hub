/**
 * SMARTER.POKER DAILY TRIVIA - AI-POWERED QUIZ
 * Build: 20260124-v1
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - 10 AI-generated daily trivia questions
 * - 6 Categories: Poker History, Famous Hands, GTO Theory, Player Profiles, Tournament Facts, Rule Knowledge
 * - XP and Diamond rewards
 * - Daily leaderboard
 * - Streak tracking
 * - Questions refresh every day at midnight UTC
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
    Trophy, Clock, Zap, Check, X, ChevronRight, Star,
    Award, Target, Brain, Flame, Crown, RefreshCw, Play,
    HelpCircle, CheckCircle, XCircle, Timer, Gift, Sparkles
} from 'lucide-react';

import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIES = {
    poker_history: { name: 'Poker History', icon: '📜', color: '#fbbf24', description: 'The legends and milestones of poker' },
    famous_hands: { name: 'Famous Hands', icon: '🃏', color: '#ef4444', description: 'Iconic hands that made history' },
    gto_theory: { name: 'GTO Theory', icon: '🧮', color: '#8b5cf6', description: 'Game theory optimal concepts' },
    player_profiles: { name: 'Player Profiles', icon: '👤', color: '#06b6d4', description: 'Know the pros and legends' },
    tournament_facts: { name: 'Tournament Facts', icon: '🏆', color: '#22c55e', description: 'Major tournament knowledge' },
    rule_knowledge: { name: 'Rules & Etiquette', icon: '📋', color: '#f97316', description: 'Official rules and table manners' }
};

const DIFFICULTY_XP = {
    easy: 10,
    medium: 20,
    hard: 30
};

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK QUESTIONS (Used when API unavailable)
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_QUESTIONS = [
    {
        id: 'fb1',
        category: 'poker_history',
        difficulty: 'medium',
        question: 'In what year was the first World Series of Poker Main Event held?',
        options: ['1968', '1970', '1972', '1975'],
        correct_index: 1,
        explanation: 'The first WSOP was held in 1970 at Binion\'s Horseshoe Casino in Las Vegas. Johnny Moss was voted champion by his peers.'
    },
    {
        id: 'fb2',
        category: 'famous_hands',
        difficulty: 'medium',
        question: 'What hand did Chris Moneymaker hold when he won the 2003 WSOP Main Event?',
        options: ['5-4 suited', 'A-K suited', 'Pocket Fives', '7-2 offsuit'],
        correct_index: 2,
        explanation: 'Chris Moneymaker held pocket fives and made a full house to beat Sam Farha\'s top pair, sparking the "poker boom."'
    },
    {
        id: 'fb3',
        category: 'gto_theory',
        difficulty: 'hard',
        question: 'In GTO poker, what is the "Minimum Defense Frequency" concept used for?',
        options: ['Calculating pot odds', 'Determining how often to call to prevent profitable bluffs', 'Sizing your bets', 'Choosing starting hands'],
        correct_index: 1,
        explanation: 'MDF tells you the minimum frequency you must call/continue to prevent your opponent from profitably bluffing with any two cards.'
    },
    {
        id: 'fb4',
        category: 'player_profiles',
        difficulty: 'easy',
        question: 'Which player holds the record for most WSOP bracelets?',
        options: ['Phil Ivey', 'Doyle Brunson', 'Phil Hellmuth', 'Johnny Chan'],
        correct_index: 2,
        explanation: 'Phil Hellmuth holds the record with 17 WSOP bracelets, more than any other player in history.'
    },
    {
        id: 'fb5',
        category: 'tournament_facts',
        difficulty: 'medium',
        question: 'What is the largest first-place prize ever awarded in a poker tournament?',
        options: ['$8.5 million', '$10 million', '$12 million', '$18.3 million'],
        correct_index: 3,
        explanation: 'Antonio Esfandiari won $18.3 million in the 2012 Big One for One Drop, the largest first-place prize in poker history.'
    },
    {
        id: 'fb6',
        category: 'rule_knowledge',
        difficulty: 'easy',
        question: 'In Texas Hold\'em, what happens if two players have the exact same hand?',
        options: ['The player with position wins', 'The pot is split equally', 'There\'s a runout card', 'The player who bet first wins'],
        correct_index: 1,
        explanation: 'When hands are identical, the pot is split equally among the tied players. This is called a "chop."'
    },
    {
        id: 'fb7',
        category: 'poker_history',
        difficulty: 'hard',
        question: 'Who is credited with inventing Texas Hold\'em poker?',
        options: ['Doyle Brunson', 'Unknown - originated in Robstown, Texas', 'Johnny Moss', 'Benny Binion'],
        correct_index: 1,
        explanation: 'The origins of Texas Hold\'em are unclear, but it\'s believed to have originated in Robstown, Texas in the early 1900s.'
    },
    {
        id: 'fb8',
        category: 'famous_hands',
        difficulty: 'medium',
        question: 'In the famous "durrrr vs. Ivey" Million Dollar Challenge, what game did they play?',
        options: ['No-Limit Hold\'em', 'Pot-Limit Omaha', 'Mixed Games', 'No-Limit Hold\'em and PLO (multi-table)'],
        correct_index: 3,
        explanation: 'The durrrr Challenge featured both No-Limit Hold\'em and Pot-Limit Omaha across four tables simultaneously.'
    },
    {
        id: 'fb9',
        category: 'gto_theory',
        difficulty: 'medium',
        question: 'What does "polarized range" mean in poker?',
        options: ['Playing only premium hands', 'A range containing only very strong hands or bluffs', 'Adjusting to opponent tendencies', 'Playing in position only'],
        correct_index: 1,
        explanation: 'A polarized range contains only the strongest value hands and bluffs, with no medium-strength hands.'
    },
    {
        id: 'fb10',
        category: 'tournament_facts',
        difficulty: 'easy',
        question: 'What is the buy-in for the WSOP Main Event?',
        options: ['$5,000', '$10,000', '$25,000', '$50,000'],
        correct_index: 1,
        explanation: 'The WSOP Main Event has had a $10,000 buy-in since its inception in 1970.'
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function TriviaPage() {
    // Game state
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, results
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [score, setScore] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [xpEarned, setXpEarned] = useState(0);
    const [streak, setStreak] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isLoading, setIsLoading] = useState(true);
    const [hasPlayedToday, setHasPlayedToday] = useState(false);
    const [todayScore, setTodayScore] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [userStats, setUserStats] = useState({ totalPlayed: 0, bestScore: 0, currentStreak: 0 });

    const timerRef = useRef(null);

    // ═══════════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ═══════════════════════════════════════════════════════════════════════

    const fetchDailyQuestions = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/trivia/daily');
            if (response.ok) {
                const data = await response.json();
                if (data.questions && data.questions.length > 0) {
                    setQuestions(data.questions);
                    setHasPlayedToday(data.hasPlayedToday || false);
                    setTodayScore(data.todayScore || null);
                    setLeaderboard(data.leaderboard || []);
                    setUserStats(data.userStats || { totalPlayed: 0, bestScore: 0, currentStreak: 0 });
                } else {
                    // Use fallback questions
                    setQuestions(shuffleArray([...FALLBACK_QUESTIONS]).slice(0, 10));
                }
            } else {
                // Use fallback questions
                setQuestions(shuffleArray([...FALLBACK_QUESTIONS]).slice(0, 10));
            }
        } catch (error) {
            console.error('Error fetching trivia:', error);
            setQuestions(shuffleArray([...FALLBACK_QUESTIONS]).slice(0, 10));
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchDailyQuestions();
    }, [fetchDailyQuestions]);

    // ═══════════════════════════════════════════════════════════════════════
    // GAME LOGIC
    // ═══════════════════════════════════════════════════════════════════════

    const startGame = () => {
        setGameState('playing');
        setCurrentIndex(0);
        setScore(0);
        setCorrectCount(0);
        setXpEarned(0);
        setStreak(0);
        setSelectedAnswer(null);
        setShowExplanation(false);
        setTimeLeft(30);
        startTimer();
    };

    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(30);
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
    };

    const handleTimeout = () => {
        if (selectedAnswer === null) {
            setSelectedAnswer(-1); // Timeout marker
            setShowExplanation(true);
            setStreak(0);
        }
    };

    const selectAnswer = (index) => {
        if (selectedAnswer !== null) return;

        clearInterval(timerRef.current);
        setSelectedAnswer(index);
        setShowExplanation(true);

        const currentQuestion = questions[currentIndex];
        const isCorrect = index === currentQuestion.correct_index;

        if (isCorrect) {
            // Calculate XP with streak bonus
            const baseXP = DIFFICULTY_XP[currentQuestion.difficulty] || 15;
            const streakBonus = Math.min(streak, 5) * 5;
            const timeBonus = Math.floor(timeLeft / 3);
            const totalXP = baseXP + streakBonus + timeBonus;

            setScore(prev => prev + 100 + (timeLeft * 2));
            setCorrectCount(prev => prev + 1);
            setXpEarned(prev => prev + totalXP);
            setStreak(prev => prev + 1);

            // Celebration for correct answer
            if (streak >= 2) {
                confetti({
                    particleCount: 30 + (streak * 10),
                    spread: 60,
                    origin: { y: 0.7 }
                });
            }
        } else {
            setStreak(0);
        }
    };

    const nextQuestion = () => {
        if (currentIndex >= questions.length - 1) {
            endGame();
        } else {
            setCurrentIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowExplanation(false);
            startTimer();
        }
    };

    const endGame = async () => {
        clearInterval(timerRef.current);
        setGameState('results');

        // Celebration for completing
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });

        // Submit score to API
        try {
            await fetch('/api/trivia/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    score,
                    correctCount,
                    xpEarned,
                    totalQuestions: questions.length
                })
            });
        } catch (error) {
            console.error('Error submitting score:', error);
        }
    };

    const resetGame = () => {
        setGameState('lobby');
        setCurrentIndex(0);
        setScore(0);
        setCorrectCount(0);
        setXpEarned(0);
        setStreak(0);
        setSelectedAnswer(null);
        setShowExplanation(false);
        fetchDailyQuestions();
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getTimeUntilReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setUTCHours(24, 0, 0, 0);
        const diff = tomorrow - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    const currentQuestion = questions[currentIndex];

    return (
        <PageTransition>
            <Head>
                <title>Daily Trivia - Smarter.Poker</title>
                <meta name="description" content="Test your poker knowledge with AI-generated daily trivia questions" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div className="trivia-page">
                {/* Background Effects */}
                <div className="bg-grid" />
                <div className="bg-glow" />

                {/* Header */}
                <UniversalHeader pageDepth={1} />

                {/* Main Content */}
                <div className="content">
                    {isLoading ? (
                        <div className="loading-state">
                            <div className="spinner"><Brain size={48} /></div>
                            <p>Loading today's questions...</p>
                        </div>
                    ) : gameState === 'lobby' ? (
                        <LobbyView
                            questions={questions}
                            hasPlayedToday={hasPlayedToday}
                            todayScore={todayScore}
                            leaderboard={leaderboard}
                            userStats={userStats}
                            timeUntilReset={getTimeUntilReset()}
                            onStart={startGame}
                        />
                    ) : gameState === 'playing' ? (
                        <GameView
                            question={currentQuestion}
                            questionIndex={currentIndex}
                            totalQuestions={questions.length}
                            selectedAnswer={selectedAnswer}
                            showExplanation={showExplanation}
                            timeLeft={timeLeft}
                            score={score}
                            streak={streak}
                            onSelectAnswer={selectAnswer}
                            onNext={nextQuestion}
                        />
                    ) : (
                        <ResultsView
                            score={score}
                            correctCount={correctCount}
                            totalQuestions={questions.length}
                            xpEarned={xpEarned}
                            onReset={resetGame}
                        />
                    )}
                </div>
            </div>

            <style jsx>{`
                .trivia-page {
                    min-height: 100vh;
                    background: #0a1628;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    width: 800px;
                    max-width: 800px;
                    margin: 0 auto;
                    overflow-x: hidden;
                }

                @media (max-width: 500px) { .trivia-page { zoom: 0.5; } }
                @media (min-width: 501px) and (max-width: 700px) { .trivia-page { zoom: 0.75; } }
                @media (min-width: 701px) and (max-width: 900px) { .trivia-page { zoom: 0.95; } }
                @media (min-width: 901px) { .trivia-page { zoom: 1.2; } }
                @media (min-width: 1400px) { .trivia-page { zoom: 1.5; } }

                .bg-grid {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-image:
                        linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
                    background-size: 60px 60px;
                    pointer-events: none;
                }

                .bg-glow {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    width: 100%;
                    height: 100%;
                    transform: translate(-50%, -50%);
                    background: radial-gradient(ellipse at center, rgba(0, 204, 255, 0.15), transparent 60%);
                    pointer-events: none;
                }

                .content {
                    position: relative;
                    padding: 100px 24px 40px;
                    max-width: 800px;
                    margin: 0 auto;
                }

                .loading-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.7);
                }

                .spinner {
                    animation: pulse 1.5s ease-in-out infinite;
                    color: #00ccff;
                    margin-bottom: 16px;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.1); }
                }
            `}</style>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOBBY VIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function LobbyView({ questions, hasPlayedToday, todayScore, leaderboard, userStats, timeUntilReset, onStart }) {
    return (
        <div className="lobby">
            {/* Hero Section */}
            <div className="hero">
                <div className="hero-icon">
                    <Brain size={64} />
                </div>
                <h1>Daily Poker Trivia</h1>
                <p>10 AI-generated questions refresh every day at midnight UTC</p>
            </div>

            {/* Stats Cards */}
            <div className="stats-row">
                <div className="stat-card">
                    <Flame className="stat-icon streak" />
                    <div className="stat-value">{userStats.currentStreak || 0}</div>
                    <div className="stat-label">Day Streak</div>
                </div>
                <div className="stat-card">
                    <Trophy className="stat-icon gold" />
                    <div className="stat-value">{userStats.bestScore || 0}</div>
                    <div className="stat-label">Best Score</div>
                </div>
                <div className="stat-card">
                    <Target className="stat-icon cyan" />
                    <div className="stat-value">{userStats.totalPlayed || 0}</div>
                    <div className="stat-label">Games Played</div>
                </div>
            </div>

            {/* Categories Preview */}
            <div className="categories-section">
                <h2>Today's Categories</h2>
                <div className="categories-grid">
                    {Object.entries(CATEGORIES).map(([key, cat]) => (
                        <div key={key} className="category-chip" style={{ borderColor: cat.color }}>
                            <span className="cat-icon">{cat.icon}</span>
                            <span className="cat-name">{cat.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Play Button or Already Played */}
            {hasPlayedToday ? (
                <div className="already-played">
                    <CheckCircle size={32} className="check-icon" />
                    <h3>You've played today!</h3>
                    <p>Your score: <strong>{todayScore}</strong> points</p>
                    <div className="reset-timer">
                        <Clock size={16} />
                        <span>New questions in: {timeUntilReset}</span>
                    </div>
                    <button className="play-again-btn" onClick={onStart}>
                        <RefreshCw size={18} />
                        Practice Again (No XP)
                    </button>
                </div>
            ) : (
                <button className="start-btn" onClick={onStart}>
                    <Play size={24} />
                    Start Today's Trivia
                    <span className="xp-badge">+XP</span>
                </button>
            )}

            {/* Leaderboard Preview */}
            {leaderboard.length > 0 && (
                <div className="leaderboard-section">
                    <h2><Crown size={20} /> Today's Leaderboard</h2>
                    <div className="leaderboard-list">
                        {leaderboard.slice(0, 5).map((entry, i) => (
                            <div key={i} className={`lb-entry ${i < 3 ? 'top-3' : ''}`}>
                                <span className="lb-rank">{i + 1}</span>
                                <span className="lb-name">{entry.username || 'Anonymous'}</span>
                                <span className="lb-score">{entry.score} pts</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style jsx>{`
                .lobby {
                    display: flex;
                    flex-direction: column;
                    gap: 32px;
                }

                .hero {
                    text-align: center;
                    padding: 40px 20px;
                }

                .hero-icon {
                    width: 120px;
                    height: 120px;
                    margin: 0 auto 24px;
                    background: linear-gradient(135deg, rgba(0, 204, 255, 0.2), rgba(139, 92, 246, 0.2));
                    border: 3px solid #00ccff;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #00ccff;
                    box-shadow: 0 0 40px rgba(0, 204, 255, 0.3);
                }

                .hero h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 36px;
                    font-weight: 800;
                    color: #ffffff;
                    margin-bottom: 12px;
                    text-shadow: 0 0 20px rgba(0, 204, 255, 0.3);
                }

                .hero p {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .stats-row {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 16px;
                }

                .stat-card {
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                }

                .stat-icon {
                    width: 28px;
                    height: 28px;
                    margin-bottom: 8px;
                }

                .stat-icon.streak { color: #f97316; }
                .stat-icon.gold { color: #fbbf24; }
                .stat-icon.cyan { color: #00ccff; }

                .stat-value {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    font-weight: 700;
                    color: #ffffff;
                }

                .stat-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-top: 4px;
                }

                .categories-section {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 16px;
                    padding: 24px;
                }

                .categories-section h2 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.8);
                    margin-bottom: 16px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .categories-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                }

                .category-chip {
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid;
                    border-radius: 8px;
                    padding: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .cat-icon {
                    font-size: 20px;
                }

                .cat-name {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.8);
                    font-weight: 500;
                }

                .start-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    width: 100%;
                    padding: 20px 32px;
                    background: linear-gradient(135deg, #00ccff, #0088cc);
                    border: none;
                    border-radius: 12px;
                    color: #ffffff;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 18px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 0 30px rgba(0, 204, 255, 0.4);
                }

                .start-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 0 40px rgba(0, 204, 255, 0.6);
                }

                .xp-badge {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 12px;
                }

                .already-played {
                    text-align: center;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    border-radius: 16px;
                    padding: 32px;
                }

                .check-icon {
                    color: #22c55e;
                    margin-bottom: 12px;
                }

                .already-played h3 {
                    color: #22c55e;
                    font-size: 20px;
                    margin-bottom: 8px;
                }

                .already-played p {
                    color: rgba(255, 255, 255, 0.7);
                    margin-bottom: 16px;
                }

                .already-played strong {
                    color: #fbbf24;
                    font-size: 24px;
                }

                .reset-timer {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 14px;
                    margin-bottom: 20px;
                }

                .play-again-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .play-again-btn:hover {
                    background: rgba(255, 255, 255, 0.15);
                    color: #ffffff;
                }

                .leaderboard-section {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 16px;
                    padding: 24px;
                }

                .leaderboard-section h2 {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 16px;
                    color: #fbbf24;
                    margin-bottom: 16px;
                }

                .leaderboard-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .lb-entry {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                }

                .lb-entry.top-3 {
                    background: linear-gradient(90deg, rgba(251, 191, 36, 0.1), transparent);
                    border: 1px solid rgba(251, 191, 36, 0.2);
                }

                .lb-rank {
                    width: 32px;
                    font-family: 'Orbitron', sans-serif;
                    font-weight: 700;
                    color: #fbbf24;
                }

                .lb-name {
                    flex: 1;
                    color: rgba(255, 255, 255, 0.9);
                }

                .lb-score {
                    font-family: 'Orbitron', sans-serif;
                    font-weight: 600;
                    color: #00ccff;
                }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME VIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function GameView({ question, questionIndex, totalQuestions, selectedAnswer, showExplanation, timeLeft, score, streak, onSelectAnswer, onNext }) {
    const category = CATEGORIES[question?.category] || { name: 'Poker', icon: '🃏', color: '#00ccff' };
    const isCorrect = selectedAnswer === question?.correct_index;
    const timedOut = selectedAnswer === -1;

    return (
        <div className="game-view">
            {/* Progress Bar */}
            <div className="progress-section">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${((questionIndex + 1) / totalQuestions) * 100}%` }}
                    />
                </div>
                <div className="progress-text">
                    Question {questionIndex + 1} of {totalQuestions}
                </div>
            </div>

            {/* Stats Row */}
            <div className="game-stats">
                <div className="stat">
                    <Trophy size={16} />
                    <span>{score}</span>
                </div>
                {streak > 1 && (
                    <div className="stat streak-badge">
                        <Flame size={16} />
                        <span>{streak}x Streak!</span>
                    </div>
                )}
                <div className={`timer ${timeLeft <= 10 ? 'warning' : ''} ${timeLeft <= 5 ? 'critical' : ''}`}>
                    <Timer size={16} />
                    <span>{timeLeft}s</span>
                </div>
            </div>

            {/* Category Badge */}
            <div className="category-badge" style={{ borderColor: category.color, color: category.color }}>
                <span>{category.icon}</span>
                <span>{category.name}</span>
                <span className="difficulty">{question?.difficulty?.toUpperCase()}</span>
            </div>

            {/* Question Card */}
            <div className="question-card">
                <h2>{question?.question}</h2>

                {/* Answer Options */}
                <div className="options">
                    {question?.options?.map((option, index) => {
                        let optionClass = 'option';
                        if (showExplanation) {
                            if (index === question.correct_index) {
                                optionClass += ' correct';
                            } else if (index === selectedAnswer && !isCorrect) {
                                optionClass += ' incorrect';
                            }
                        } else if (selectedAnswer === index) {
                            optionClass += ' selected';
                        }

                        return (
                            <button
                                key={index}
                                className={optionClass}
                                onClick={() => onSelectAnswer(index)}
                                disabled={showExplanation}
                            >
                                <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                                <span className="option-text">{option}</span>
                                {showExplanation && index === question.correct_index && (
                                    <CheckCircle size={20} className="result-icon" />
                                )}
                                {showExplanation && index === selectedAnswer && !isCorrect && (
                                    <XCircle size={20} className="result-icon" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Explanation */}
            <AnimatePresence>
                {showExplanation && (
                    <motion.div
                        className={`explanation ${isCorrect ? 'correct' : 'incorrect'}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                        <div className="result-header">
                            {timedOut ? (
                                <>
                                    <Clock size={24} />
                                    <span>Time's Up!</span>
                                </>
                            ) : isCorrect ? (
                                <>
                                    <CheckCircle size={24} />
                                    <span>Correct!</span>
                                    <span className="xp-gain">+{DIFFICULTY_XP[question?.difficulty] || 15} XP</span>
                                </>
                            ) : (
                                <>
                                    <XCircle size={24} />
                                    <span>Incorrect</span>
                                </>
                            )}
                        </div>
                        <p>{question?.explanation}</p>
                        <button className="next-btn" onClick={onNext}>
                            {questionIndex >= totalQuestions - 1 ? 'See Results' : 'Next Question'}
                            <ChevronRight size={20} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
                .game-view {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .progress-section {
                    margin-bottom: 8px;
                }

                .progress-bar {
                    height: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00ccff, #8b5cf6);
                    transition: width 0.3s ease;
                }

                .progress-text {
                    text-align: center;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: 8px;
                }

                .game-stats {
                    display: flex;
                    justify-content: center;
                    gap: 24px;
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: rgba(255, 255, 255, 0.8);
                    font-family: 'Orbitron', sans-serif;
                    font-weight: 600;
                }

                .streak-badge {
                    color: #f97316;
                    animation: pulse 0.5s ease-in-out infinite alternate;
                }

                .timer {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #22c55e;
                    font-family: 'Orbitron', sans-serif;
                    font-weight: 600;
                }

                .timer.warning { color: #fbbf24; }
                .timer.critical { color: #ef4444; animation: pulse 0.5s ease-in-out infinite alternate; }

                @keyframes pulse {
                    from { opacity: 1; }
                    to { opacity: 0.5; }
                }

                .category-badge {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px 20px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid;
                    border-radius: 20px;
                    font-size: 14px;
                    width: fit-content;
                    margin: 0 auto;
                }

                .difficulty {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 10px;
                    letter-spacing: 1px;
                }

                .question-card {
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 32px;
                }

                .question-card h2 {
                    font-size: 22px;
                    font-weight: 600;
                    color: #ffffff;
                    line-height: 1.4;
                    margin-bottom: 28px;
                    text-align: center;
                }

                .options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .option {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 16px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .option:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.1);
                    border-color: rgba(0, 204, 255, 0.5);
                }

                .option.selected {
                    background: rgba(0, 204, 255, 0.15);
                    border-color: #00ccff;
                }

                .option.correct {
                    background: rgba(34, 197, 94, 0.2);
                    border-color: #22c55e;
                }

                .option.incorrect {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                }

                .option:disabled {
                    cursor: default;
                }

                .option-letter {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    font-family: 'Orbitron', sans-serif;
                    font-weight: 600;
                    font-size: 14px;
                    flex-shrink: 0;
                }

                .option-text {
                    flex: 1;
                }

                .result-icon {
                    flex-shrink: 0;
                }

                .explanation {
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 16px;
                    padding: 24px;
                    border: 1px solid;
                }

                .explanation.correct {
                    border-color: rgba(34, 197, 94, 0.3);
                    background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), transparent);
                }

                .explanation.incorrect {
                    border-color: rgba(239, 68, 68, 0.3);
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), transparent);
                }

                .result-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 20px;
                    font-weight: 700;
                }

                .explanation.correct .result-header { color: #22c55e; }
                .explanation.incorrect .result-header { color: #ef4444; }

                .xp-gain {
                    background: rgba(34, 197, 94, 0.2);
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 14px;
                }

                .explanation p {
                    color: rgba(255, 255, 255, 0.8);
                    line-height: 1.6;
                    margin-bottom: 20px;
                }

                .next-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 14px 24px;
                    background: linear-gradient(135deg, #00ccff, #0088cc);
                    border: none;
                    border-radius: 10px;
                    color: #ffffff;
                    font-weight: 600;
                    font-size: 16px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .next-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 0 20px rgba(0, 204, 255, 0.4);
                }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS VIEW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function ResultsView({ score, correctCount, totalQuestions, xpEarned, onReset }) {
    const percentage = Math.round((correctCount / totalQuestions) * 100);

    let grade, gradeColor, message;
    if (percentage >= 90) {
        grade = 'S'; gradeColor = '#fbbf24'; message = 'Poker Genius!';
    } else if (percentage >= 80) {
        grade = 'A'; gradeColor = '#22c55e'; message = 'Excellent!';
    } else if (percentage >= 70) {
        grade = 'B'; gradeColor = '#00ccff'; message = 'Great Job!';
    } else if (percentage >= 60) {
        grade = 'C'; gradeColor = '#8b5cf6'; message = 'Good Effort!';
    } else if (percentage >= 50) {
        grade = 'D'; gradeColor = '#f97316'; message = 'Keep Practicing!';
    } else {
        grade = 'F'; gradeColor = '#ef4444'; message = 'Study Up!';
    }

    return (
        <div className="results-view">
            <div className="results-card">
                <div className="trophy-section">
                    <Trophy size={64} className="trophy-icon" />
                    <h1>Quiz Complete!</h1>
                    <p className="message">{message}</p>
                </div>

                <div className="grade-circle" style={{ borderColor: gradeColor }}>
                    <span className="grade" style={{ color: gradeColor }}>{grade}</span>
                    <span className="percentage">{percentage}%</span>
                </div>

                <div className="results-stats">
                    <div className="result-stat">
                        <CheckCircle size={24} className="correct-icon" />
                        <div className="result-value">{correctCount}/{totalQuestions}</div>
                        <div className="result-label">Correct Answers</div>
                    </div>
                    <div className="result-stat">
                        <Trophy size={24} className="score-icon" />
                        <div className="result-value">{score}</div>
                        <div className="result-label">Total Score</div>
                    </div>
                    <div className="result-stat">
                        <Zap size={24} className="xp-icon" />
                        <div className="result-value">+{xpEarned}</div>
                        <div className="result-label">XP Earned</div>
                    </div>
                </div>

                <div className="actions">
                    <Link href="/hub" className="back-btn">
                        Back to Hub
                    </Link>
                    <button className="retry-btn" onClick={onReset}>
                        <RefreshCw size={18} />
                        Play Again
                    </button>
                </div>
            </div>

            <style jsx>{`
                .results-view {
                    display: flex;
                    justify-content: center;
                    padding: 20px 0;
                }

                .results-card {
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.2));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    padding: 48px;
                    text-align: center;
                    max-width: 500px;
                    width: 100%;
                }

                .trophy-section {
                    margin-bottom: 32px;
                }

                .trophy-icon {
                    color: #fbbf24;
                    margin-bottom: 16px;
                }

                h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 32px;
                    font-weight: 800;
                    color: #ffffff;
                    margin-bottom: 8px;
                }

                .message {
                    font-size: 18px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .grade-circle {
                    width: 140px;
                    height: 140px;
                    margin: 0 auto 32px;
                    border: 4px solid;
                    border-radius: 50%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.3);
                }

                .grade {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 56px;
                    font-weight: 900;
                }

                .percentage {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .results-stats {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 16px;
                    margin-bottom: 32px;
                }

                .result-stat {
                    padding: 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                }

                .correct-icon { color: #22c55e; }
                .score-icon { color: #fbbf24; }
                .xp-icon { color: #8b5cf6; }

                .result-value {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 8px 0 4px;
                }

                .result-label {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .actions {
                    display: flex;
                    gap: 16px;
                }

                .back-btn {
                    flex: 1;
                    padding: 14px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 10px;
                    color: rgba(255, 255, 255, 0.8);
                    font-weight: 600;
                    text-decoration: none;
                    text-align: center;
                    transition: all 0.2s ease;
                }

                .back-btn:hover {
                    background: rgba(255, 255, 255, 0.15);
                }

                .retry-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 14px 24px;
                    background: linear-gradient(135deg, #00ccff, #0088cc);
                    border: none;
                    border-radius: 10px;
                    color: #ffffff;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .retry-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 0 20px rgba(0, 204, 255, 0.4);
                }
            `}</style>
        </div>
    );
}
