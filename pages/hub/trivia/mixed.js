/**
 * MIXED MODE — Route: /hub/trivia/mixed
 * Rotating category trivia with per-category stats tracking
 * Cycles through: History → Rules → Pro → History → ...
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
import { Shuffle, Trophy, BookOpen, GraduationCap, Gem, CheckCircle, XCircle, ArrowRight, Target, Banknote, Calculator, Brain } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';

const CATEGORIES = [
    { id: 'poker_history', name: 'History', icon: Trophy, color: '#FFD700', dbCategories: ['poker_history', 'famous_hands', 'player_profiles', 'tournament_facts'] },
    { id: 'rule_knowledge', name: 'Rules', icon: BookOpen, color: '#4a90d9', dbCategories: ['rule_knowledge'] },
    { id: 'gto_theory', name: 'Pro', icon: GraduationCap, color: '#9D4EDD', dbCategories: ['gto_theory'] },
    // NEW STRATEGY CATEGORIES
    { id: 'mtt_situations', name: 'MTT', icon: Target, color: '#f97316', dbCategories: ['mtt_situations'] },
    { id: 'cash_game_situations', name: 'Cash', icon: Banknote, color: '#22c55e', dbCategories: ['cash_game_situations'] },
    { id: 'icm_chip_ev', name: 'ICM', icon: Calculator, color: '#06b6d4', dbCategories: ['icm_chip_ev'] },
    { id: 'gto_scenarios', name: 'GTO', icon: Brain, color: '#a855f7', dbCategories: ['gto_scenarios'] }
];

const QUESTIONS_PER_SESSION = 21; // 3 per category, 7 categories

export default function MixedModePage() {
    const router = useRouter();
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);

    const [gameState, setGameState] = useState('loading'); // loading, ready, playing, results
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);

    // Per-category stats for current session
    const [categoryStats, setCategoryStats] = useState({
        poker_history: { answered: 0, correct: 0 },
        rule_knowledge: { answered: 0, correct: 0 },
        gto_theory: { answered: 0, correct: 0 },
        mtt_situations: { answered: 0, correct: 0 },
        cash_game_situations: { answered: 0, correct: 0 },
        icm_chip_ev: { answered: 0, correct: 0 },
        gto_scenarios: { answered: 0, correct: 0 }
    });

    // Cumulative mastery from database
    const [categoryMastery, setCategoryMastery] = useState({});

    const [totalCorrect, setTotalCorrect] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);

    // 24-second shot clock
    const [timeLeft, setTimeLeft] = useState(24);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        async function initialize() {
            const user = getAuthUser();
            if (!user) {
                router.push('/hub/trivia');
                return;
            }

            setUserId(user.id);

            // Load user diamonds
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .single();

            if (profile) {
                setUserDiamonds(profile.diamonds || 0);
            }

            // Load category mastery
            const { data: mastery } = await supabase
                .from('trivia_category_mastery')
                .select('*')
                .eq('user_id', user.id);

            if (mastery) {
                const masteryMap = {};
                mastery.forEach(m => {
                    masteryMap[m.category] = m;
                });
                setCategoryMastery(masteryMap);
            }

            // Load questions
            await loadMixedQuestions(user.id);
            setGameState('ready');
        }

        initialize();
    }, []);

    // Shot clock effect
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
    }, [isTimerRunning, showResult]);

    async function loadMixedQuestions(uid) {
        try {
            // Get user's question history (60-day exclusion)
            let excludeIds = [];
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

            const { data: history } = await supabase
                .from('trivia_user_question_history')
                .select('question_id')
                .eq('user_id', uid)
                .gte('seen_at', sixtyDaysAgo.toISOString());

            if (history) {
                excludeIds = history.map(h => h.question_id);
            }

            // Load questions from all categories
            const allQuestions = [];

            for (const cat of CATEGORIES) {
                let query = supabase
                    .from('trivia_questions')
                    .select('*')
                    .in('category', cat.dbCategories)
                    .limit(50);

                const { data } = await query;

                if (data) {
                    // Filter out seen questions
                    let available = excludeIds.length > 0
                        ? data.filter(q => !excludeIds.includes(q.id))
                        : data;

                    // Shuffle and take 5 from each category
                    const shuffled = available.sort(() => Math.random() - 0.5).slice(0, 5);

                    // Tag with normalized category for tracking
                    shuffled.forEach(q => {
                        q.displayCategory = cat.id;
                    });

                    allQuestions.push(...shuffled);
                }
            }

            // Interleave categories: H, R, P, H, R, P, H, R, P, H, R, P, H, R, P
            const interleaved = [];
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < CATEGORIES.length; j++) {
                    const catQuestions = allQuestions.filter(q => q.displayCategory === CATEGORIES[j].id);
                    if (catQuestions[i]) {
                        interleaved.push(catQuestions[i]);
                    }
                }
            }

            setQuestions(interleaved);
        } catch (e) {
            console.error('Failed to load mixed questions:', e);
        }
    }

    function startGame() {
        setCurrentQuestionIndex(0);
        setSelectedAnswer(null);
        setShowResult(false);
        setTotalCorrect(0);
        setDiamondsEarned(0);
        setCategoryStats({
            poker_history: { answered: 0, correct: 0 },
            rule_knowledge: { answered: 0, correct: 0 },
            gto_theory: { answered: 0, correct: 0 }
        });
        setTimeLeft(24);
        setIsTimerRunning(true);
        setGameState('playing');
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
        const category = currentQuestion?.displayCategory || 'poker_history';

        // Update per-category stats
        setCategoryStats(prev => ({
            ...prev,
            [category]: {
                answered: prev[category].answered + 1,
                correct: prev[category].correct + (isCorrect ? 1 : 0)
            }
        }));

        if (isCorrect) {
            setTotalCorrect(prev => prev + 1);
            setDiamondsEarned(prev => prev + 1); // 1 diamond per correct
        }

        // Advance after delay
        setTimeout(() => {
            if (currentQuestionIndex + 1 >= questions.length) {
                finishGame();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setTimeLeft(24);
                setIsTimerRunning(true);
            }
        }, 1200);
    }

    async function finishGame() {
        setIsTimerRunning(false);
        setGameState('results');

        if (!userId) return;

        try {
            // Award diamonds
            if (diamondsEarned > 0) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .single();

                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({ diamonds: (profile.diamonds || 0) + diamondsEarned })
                        .eq('id', userId);
                    setUserDiamonds(prev => prev + diamondsEarned);
                }
            }

            // Update category mastery
            for (const [category, stats] of Object.entries(categoryStats)) {
                if (stats.answered === 0) continue;

                const { data: existing } = await supabase
                    .from('trivia_category_mastery')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('category', category)
                    .single();

                if (existing) {
                    const newTotal = existing.total_answered + stats.answered;
                    const newCorrect = existing.correct_count + stats.correct;
                    const accuracy = newTotal > 0 ? newCorrect / newTotal : 0;
                    const newLevel = Math.min(10, Math.max(1, Math.floor(accuracy * 10) + 1));

                    await supabase
                        .from('trivia_category_mastery')
                        .update({
                            total_answered: newTotal,
                            correct_count: newCorrect,
                            mastery_level: newLevel,
                            updated_at: new Date().toISOString()
                        })
                        .eq('user_id', userId)
                        .eq('category', category);
                } else {
                    await supabase
                        .from('trivia_category_mastery')
                        .insert({
                            user_id: userId,
                            category,
                            total_answered: stats.answered,
                            correct_count: stats.correct,
                            mastery_level: 1
                        });
                }
            }

            // Record question history
            if (questions.length > 0) {
                const historyRecords = questions.map(q => ({
                    user_id: userId,
                    question_id: q.id,
                    seen_at: new Date().toISOString(),
                    mode: 'mixed'
                }));

                await supabase
                    .from('trivia_user_question_history')
                    .upsert(historyRecords, {
                        onConflict: 'user_id,question_id',
                        ignoreDuplicates: false
                    });
            }

            // Save score
            await supabase.from('trivia_scores').insert({
                user_id: userId,
                mode: 'mixed',
                score: totalCorrect * 100,
                correct_count: totalCorrect,
                total_questions: questions.length,
                diamonds_earned: diamondsEarned,
                play_date: new Date().toISOString().split('T')[0]
            });

        } catch (e) {
            console.error('Failed to save results:', e);
        }
    }

    const currentQuestion = questions[currentQuestionIndex];
    const currentCategory = CATEGORIES.find(c => c.id === currentQuestion?.displayCategory) || CATEGORIES[0];
    const CategoryIcon = currentCategory.icon;

    return (
        <PageTransition>
            <Head>
                <title>Mixed Mode - Smarter.Poker Trivia</title>
                <meta name="description" content="Test all your poker knowledge with rotating categories!" />
            </Head>

            <div className="mixed-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                <div className="content">
                    {gameState === 'loading' && (
                        <div className="loading">
                            <div className="spinner" />
                            <p>Loading questions...</p>
                        </div>
                    )}

                    {gameState === 'ready' && (
                        <div
                            className="lobby-image-wrapper"
                            onClick={startGame}
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
                                src="/images/trivia/lobby-mixed.jpg"
                                alt="Mixed Mode - Start Challenge"
                                style={{ width: '100%', height: 'auto', display: 'block' }}
                            />
                        </div>
                    )}

                    {gameState === 'playing' && currentQuestion && (
                        <div className="playing-screen">
                            {/* Category indicator + Timer */}
                            <div className="top-bar">
                                <div className="category-badge" style={{ borderColor: currentCategory.color }}>
                                    <CategoryIcon size={18} color={currentCategory.color} />
                                    <span style={{ color: currentCategory.color }}>{currentCategory.name}</span>
                                </div>
                                <div className={`timer ${timeLeft <= 8 ? 'warning' : ''} ${timeLeft <= 3 ? 'danger' : ''}`}>
                                    {timeLeft}s
                                </div>
                            </div>

                            {/* Progress */}
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                                />
                            </div>
                            <div className="progress-text">
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

                                {showResult && currentQuestion.explanation && (
                                    <div className="explanation">
                                        <strong>💡</strong> {currentQuestion.explanation}
                                    </div>
                                )}
                            </MetalFrame>

                            {/* Per-category mini stats */}
                            <div className="category-stats">
                                {CATEGORIES.map(cat => {
                                    const stats = categoryStats[cat.id];
                                    return (
                                        <div key={cat.id} className="cat-stat" style={{ borderColor: cat.color }}>
                                            <span style={{ color: cat.color }}>{cat.name}</span>
                                            <span>{stats.correct}/{stats.answered}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {gameState === 'results' && (
                        <div className="results-screen">
                            <MetalFrame padding="32px" showBolts={true}>
                                <h1 className="results-title">MIXED MODE COMPLETE!</h1>

                                <div className="score-display">
                                    <div className="big-score">{totalCorrect}/{questions.length}</div>
                                    <div className="score-label">Correct</div>
                                </div>

                                <div className="diamonds-earned">
                                    <Gem size={24} color="#00D4FF" />
                                    <span>+{diamondsEarned} Diamonds</span>
                                </div>

                                <div className="category-breakdown">
                                    <h3>Category Breakdown</h3>
                                    {CATEGORIES.map(cat => {
                                        const stats = categoryStats[cat.id];
                                        const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
                                        return (
                                            <div key={cat.id} className="cat-result">
                                                <cat.icon size={20} color={cat.color} />
                                                <span className="cat-name" style={{ color: cat.color }}>{cat.name}</span>
                                                <span className="cat-score">{stats.correct}/{stats.answered}</span>
                                                <span className="cat-accuracy">{accuracy}%</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="result-actions">
                                    <HexButton onClick={startGame} variant="primary" size="md">
                                        <ArrowRight size={16} /> Play Again
                                    </HexButton>
                                    <HexButton onClick={() => router.push('/hub/trivia')} variant="secondary" size="md">
                                        Back to Trivia
                                    </HexButton>
                                </div>
                            </MetalFrame>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .mixed-page {
                    min-height: 100vh;
                    background: url('/images/trivia/starfield-bg.jpg') center center / cover no-repeat;
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
                    border-top-color: #00D4FF;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .mode-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .mode-header h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    color: #fff;
                    margin: 12px 0 8px;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
                }

                .mode-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .mode-info {
                    display: flex;
                    justify-content: center;
                    gap: 24px;
                    margin-bottom: 32px;
                }

                .info-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .info-item .label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    margin-bottom: 4px;
                }

                .info-item .value {
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                }

                /* Playing screen */
                .top-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .category-badge {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 2px solid;
                    border-radius: 8px;
                    font-weight: 600;
                }

                .timer {
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                    padding: 8px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border-radius: 8px;
                }

                .timer.warning { color: #fbbf24; }
                .timer.danger { color: #ef4444; animation: pulse 0.5s infinite; }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .progress-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    margin-bottom: 8px;
                    overflow: hidden;
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00D4FF, #8b5cf6);
                    border-radius: 3px;
                    transition: width 0.3s;
                }

                .progress-text {
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

                .option.selected {
                    border-color: #00D4FF;
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

                .option-text {
                    flex: 1;
                }

                .result-icon {
                    margin-left: auto;
                }

                .option.correct .result-icon { color: #22c55e; }
                .option.wrong .result-icon { color: #ef4444; }

                .explanation {
                    margin-top: 16px;
                    padding: 12px 16px;
                    background: rgba(0, 212, 255, 0.1);
                    border-left: 3px solid #00D4FF;
                    border-radius: 0 8px 8px 0;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .category-stats {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    margin-top: 16px;
                }

                .cat-stat {
                    padding: 8px 12px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid;
                    border-radius: 6px;
                    font-size: 13px;
                    display: flex;
                    gap: 8px;
                }

                /* Results */
                .results-screen { text-align: center; }

                .results-title {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 24px;
                    color: #00D4FF;
                    margin: 0 0 24px;
                    text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
                }

                .score-display {
                    margin-bottom: 16px;
                }

                .big-score {
                    font-size: 48px;
                    font-weight: 700;
                    color: #fff;
                }

                .score-label {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .diamonds-earned {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-size: 24px;
                    font-weight: 600;
                    color: #00D4FF;
                    margin-bottom: 24px;
                }

                .category-breakdown {
                    background: rgba(30, 41, 59, 0.4);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                }

                .category-breakdown h3 {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0 0 12px;
                    text-transform: uppercase;
                }

                .cat-result {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .cat-result:last-child { border-bottom: none; }

                .cat-name {
                    flex: 1;
                    text-align: left;
                    font-weight: 600;
                }

                .cat-score {
                    color: #fff;
                    font-weight: 600;
                }

                .cat-accuracy {
                    width: 50px;
                    text-align: right;
                    color: rgba(255, 255, 255, 0.5);
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
