/**
 * 🎯 GOD MODE TRAINING — Real-time GTO Training with Database Integration
 * 
 * Features:
 * - Loads 20 questions from solved_spots_gold database
 * - Poker table visualization with 3D card animations
 * - Real-time GTO validation and feedback
 * - Score/streak tracking
 * - Level progression system
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { generateLevelQuiz } from '../../../../lib/god-mode-service';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function GodModeTraining() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [quiz, setQuiz] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showFeedback, setShowFeedback] = useState(false);
    const [lastAnswer, setLastAnswer] = useState(null);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        loadQuiz();
    }, []);

    async function loadQuiz() {
        try {
            // Get authenticated user
            const { data: { user: authUser } } = await supabase.auth.getUser();

            if (!authUser) {
                router.push('/intro');
                return;
            }

            setUser(authUser);

            // Generate quiz for Level 1
            const quizData = await generateLevelQuiz(authUser.id, 1);

            if (!quizData) {
                console.error('Failed to generate quiz');
                return;
            }

            setQuiz(quizData);
            setLoading(false);

            console.log('✅ Quiz loaded:', quizData.total_questions, 'questions');

        } catch (error) {
            console.error('Error loading quiz:', error);
            setLoading(false);
        }
    }

    function validateAction(question, userAction) {
        const matrix = question.strategy_matrix;

        // Calculate aggregate frequencies for this action across all hands
        const hands = Object.values(matrix);
        let totalFreq = 0;
        let totalEV = 0;
        let bestEV = -Infinity;

        hands.forEach(hand => {
            const actionData = hand.actions[userAction.id];
            if (actionData) {
                totalFreq += actionData.freq;
                totalEV += actionData.ev * actionData.freq;
                bestEV = Math.max(bestEV, hand.max_ev);
            }
        });

        const avgFreq = totalFreq / hands.length;
        const isCorrect = avgFreq > 0.1; // Action is played >10% of the time

        // Calculate EV loss
        const evLoss = isCorrect ? 0 : Math.abs(totalEV - bestEV);

        // Get GTO frequencies for feedback
        const gtoFrequencies = {};
        ['Fold', 'Call', 'Raise'].forEach(action => {
            let freq = 0;
            hands.forEach(hand => {
                freq += hand.actions[action]?.freq || 0;
            });
            gtoFrequencies[action] = freq / hands.length;
        });

        return {
            isCorrect,
            evLoss,
            gtoFrequencies
        };
    }

    function handleActionClick(action) {
        const question = quiz.questions[currentIndex];
        const result = validateAction(question, action);

        // Update score and streak
        if (result.isCorrect) {
            setScore(score + 1);
            setStreak(streak + 1);
        } else {
            setStreak(0);
        }

        // Show feedback
        setLastAnswer({ ...result, userAction: action.label });
        setShowFeedback(true);
    }

    function handleNextQuestion() {
        setShowFeedback(false);

        if (currentIndex + 1 < quiz.questions.length) {
            setCurrentIndex(currentIndex + 1);
        } else {
            // Quiz complete
            setIsComplete(true);
            saveResults();
        }
    }

    async function saveResults() {
        const finalScore = (score / quiz.total_questions) * 100;
        const passed = finalScore >= 85;

        try {
            await supabase.from('user_progress').upsert({
                user_id: user.id,
                level_id: quiz.level_id,
                score: finalScore,
                passed: passed,
                completed_at: new Date().toISOString()
            });

            if (passed) {
                // Unlock next level
                await supabase.from('user_progress').insert({
                    user_id: user.id,
                    level_id: quiz.level_id + 1,
                    unlocked: true
                });
            }
        } catch (error) {
            console.error('Error saving results:', error);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
                <div className="text-center">
                    <div className="loading loading-spinner loading-lg text-primary"></div>
                    <p className="text-white mt-4">Loading GTO Training...</p>
                </div>
            </div>
        );
    }

    if (!quiz) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
                <div className="text-center text-white">
                    <p className="text-xl">Failed to load quiz</p>
                    <button onClick={() => router.push('/hub/training')} className="btn btn-primary mt-4">
                        Back to Training
                    </button>
                </div>
            </div>
        );
    }

    const currentQuestion = quiz.questions[currentIndex];

    return (
        <>
            <Head>
                <title>God Mode Training | Smarter Poker</title>
            </Head>

            <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4">
                {/* Header */}
                <Header
                    levelName={quiz.level_name}
                    score={score}
                    total={quiz.total_questions}
                    streak={streak}
                    currentQuestion={currentIndex + 1}
                />

                {/* Main Content */}
                {!isComplete ? (
                    <div className="max-w-4xl mx-auto mt-8">
                        {/* Poker Table */}
                        <PokerTable
                            boardCards={currentQuestion.board_cards}
                            street={currentQuestion.street}
                        />

                        {/* Action Controls */}
                        <ActionControls
                            onAction={handleActionClick}
                            disabled={showFeedback}
                        />

                        {/* Feedback Overlay */}
                        {showFeedback && (
                            <FeedbackOverlay
                                isCorrect={lastAnswer.isCorrect}
                                userAction={lastAnswer.userAction}
                                gtoFrequencies={lastAnswer.gtoFrequencies}
                                evLoss={lastAnswer.evLoss}
                                onNext={handleNextQuestion}
                            />
                        )}
                    </div>
                ) : (
                    <CompletionScreen
                        score={score}
                        total={quiz.total_questions}
                        levelName={quiz.level_name}
                        onRetry={() => {
                            setCurrentIndex(0);
                            setScore(0);
                            setStreak(0);
                            setIsComplete(false);
                        }}
                        onContinue={() => router.push('/hub/training')}
                    />
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// HEADER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function Header({ levelName, score, total, streak, currentQuestion }) {
    return (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 max-w-4xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-cyan-400">{levelName}</h1>
                    <p className="text-sm text-gray-400">Question {currentQuestion} of {total}</p>
                </div>
                <div className="flex gap-6">
                    <div className="text-center">
                        <div className="text-3xl font-bold text-green-400">{score}/{total}</div>
                        <div className="text-xs text-gray-400">Score</div>
                    </div>
                    <div className="text-center">
                        <div className="text-3xl font-bold text-orange-400">🔥 {streak}</div>
                        <div className="text-xs text-gray-400">Streak</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// POKER TABLE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function PokerTable({ boardCards, street }) {
    return (
        <div className="bg-gradient-to-br from-green-900 to-green-800 rounded-3xl p-8 shadow-2xl mb-8">
            <div className="text-center mb-4">
                <span className="badge badge-lg badge-primary">{street}</span>
            </div>

            <div className="flex justify-center gap-3">
                {boardCards.map((card, i) => (
                    <Card key={i} card={card} delay={i * 100} />
                ))}
            </div>

            <div className="text-center mt-6 text-green-200">
                <p className="text-sm">What's the GTO play?</p>
            </div>
        </div>
    );
}

function Card({ card, delay }) {
    const [isFlipped, setIsFlipped] = useState(false);

    useEffect(() => {
        setTimeout(() => setIsFlipped(true), delay);
    }, [delay]);

    // Parse card (e.g., "As" -> "A♠")
    const rank = card[0];
    const suitChar = card[1];
    const suitSymbol = {
        's': '♠',
        'h': '♥',
        'd': '♦',
        'c': '♣'
    }[suitChar] || suitChar;

    const isRed = suitChar === 'h' || suitChar === 'd';

    return (
        <div
            className="card-3d"
            style={{
                transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(90deg)',
                transition: 'transform 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
            }}
        >
            <div className="bg-white rounded-lg shadow-xl p-4 w-20 h-28 flex flex-col justify-between">
                <div className={`text-2xl font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>
                    {rank}
                </div>
                <div className={`text-4xl text-center ${isRed ? 'text-red-600' : 'text-black'}`}>
                    {suitSymbol}
                </div>
                <div className={`text-2xl font-bold text-right ${isRed ? 'text-red-600' : 'text-black'}`}>
                    {rank}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

function ActionControls({ onAction, disabled }) {
    const actions = [
        { id: 'Call', label: 'Check', color: 'btn-info' },
        { id: 'Raise', label: 'Bet Small (33%)', color: 'btn-warning' },
        { id: 'Raise', label: 'Bet Medium (75%)', color: 'btn-error' },
        { id: 'Raise', label: 'All-In', color: 'btn-secondary' }
    ];

    return (
        <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
            {actions.map((action, i) => (
                <button
                    key={i}
                    onClick={() => onAction(action)}
                    disabled={disabled}
                    className={`btn ${action.color} btn-lg text-lg font-bold`}
                >
                    {action.label}
                </button>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FEEDBACK OVERLAY
// ═══════════════════════════════════════════════════════════════════════════

function FeedbackOverlay({ isCorrect, userAction, gtoFrequencies, evLoss, onNext }) {
    return (
        <div className="modal modal-open">
            <div className={`modal-box ${isCorrect ? 'bg-green-900/90' : 'bg-red-900/90'} backdrop-blur-lg`}>
                <h3 className="font-bold text-3xl mb-4">
                    {isCorrect ? '✅ Correct!' : '❌ Incorrect'}
                </h3>

                <p className="text-lg mb-4">
                    You chose: <strong>{userAction}</strong>
                </p>

                {!isCorrect && (
                    <div className="bg-black/30 rounded-lg p-4 mb-4">
                        <p className="font-bold mb-2">GTO Strategy:</p>
                        <ul className="space-y-1">
                            {Object.entries(gtoFrequencies).map(([action, freq]) => (
                                <li key={action} className="flex justify-between">
                                    <span>{action}:</span>
                                    <span className="font-bold">{(freq * 100).toFixed(1)}%</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm text-red-300 mt-3">
                            EV Loss: {evLoss.toFixed(2)} BB
                        </p>
                    </div>
                )}

                <div className="modal-action">
                    <button onClick={onNext} className="btn btn-primary btn-lg">
                        Next Question →
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETION SCREEN
// ═══════════════════════════════════════════════════════════════════════════

function CompletionScreen({ score, total, levelName, onRetry, onContinue }) {
    const percentage = (score / total) * 100;
    const passed = percentage >= 85;

    return (
        <div className="max-w-2xl mx-auto mt-20 text-center">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-12">
                <h2 className="text-4xl font-bold mb-4">
                    {passed ? '🎉 Level Complete!' : '📚 Keep Practicing'}
                </h2>

                <div className="text-6xl font-bold my-8">
                    {score}/{total}
                </div>

                <div className="text-2xl mb-8">
                    {percentage.toFixed(0)}% Correct
                </div>

                {passed ? (
                    <div className="alert alert-success mb-8">
                        <span>✅ Next level unlocked!</span>
                    </div>
                ) : (
                    <div className="alert alert-warning mb-8">
                        <span>Need 85% to unlock next level</span>
                    </div>
                )}

                <div className="flex gap-4 justify-center">
                    <button onClick={onRetry} className="btn btn-secondary btn-lg">
                        🔄 Retry Level
                    </button>
                    <button onClick={onContinue} className="btn btn-primary btn-lg">
                        Continue Training
                    </button>
                </div>
            </div>
        </div>
    );
}
