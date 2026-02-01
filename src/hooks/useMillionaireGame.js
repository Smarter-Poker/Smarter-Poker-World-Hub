/**
 * 🎰 USE MILLIONAIRE GAME — Training Game Flow Controller
 * ═══════════════════════════════════════════════════════════════════════════
 * Manages the "Who Wants to Be a Millionaire" style training game:
 * - Fetches questions via API (PIO/CHART/SCENARIO engines)
 * - Tracks answers and enforces no-repeat logic
 * - Calculates scores and level progression
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect } from 'react';
import { getAuthUser } from '../lib/authUtils';
import TRAINING_CONFIG, { checkLevelPassed, getXPReward, getRequiredCorrect } from '../config/trainingConfig';

const QUESTIONS_PER_LEVEL = 25; // 25 questions per level

export default function useMillionaireGame(gameId, engineType = 'PIO', initialLevel = 1) {
    // Game state
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [level, setLevel] = useState(initialLevel);
    const [loading, setLoading] = useState(true); // Start true until pre-load completes
    const [error, setError] = useState(null);

    // 🚀 PRE-LOADED QUESTIONS - All 25 fetched at once
    const [preloadedQuestions, setPreloadedQuestions] = useState([]);
    const [preloadComplete, setPreloadComplete] = useState(false);

    // Score tracking
    const [correctCount, setCorrectCount] = useState(0);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [totalXP, setTotalXP] = useState(0);

    // Feedback state
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackResult, setFeedbackResult] = useState(null); // 'correct' | 'wrong'
    const [explanation, setExplanation] = useState('');

    // Game completion state
    const [gameComplete, setGameComplete] = useState(false);
    const [levelPassed, setLevelPassed] = useState(false);

    // Get user ID for no-repeat tracking
    const userId = getAuthUser()?.id;

    /**
     * 🚀 BATCH PRE-LOAD ALL QUESTIONS AT ONCE
     * Fetches all 25 questions when game starts
     * No more individual loading - instant question serving
     */
    const preloadAllQuestions = useCallback(async () => {
        if (!gameId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                gameId,
                level: level.toString(),
                count: QUESTIONS_PER_LEVEL.toString(),
            });

            console.log(`[MillionaireGame] Pre-loading ${QUESTIONS_PER_LEVEL} questions for ${gameId} level ${level}`);

            const response = await fetch(`/api/training/batch-preload?${params}`);
            const data = await response.json();

            if (!response.ok || !data.questions || data.questions.length === 0) {
                // Batch pre-load failed - fallback to single-question mode
                console.warn('[MillionaireGame] Batch pre-load failed, using single-question mode');
                setPreloadComplete(false);
                setLoading(false);

                // Fetch first question using old API
                return fetchSingleQuestion();
            }

            console.log(`[MillionaireGame] ✅ Pre-loaded ${data.questions.length} questions`);

            setPreloadedQuestions(data.questions);
            setPreloadComplete(true);

            // Set first question immediately
            setCurrentQuestion(data.questions[0]);
            setLoading(false);

        } catch (err) {
            console.error('[MillionaireGame] Pre-load error:', err);
            console.warn('[MillionaireGame] Falling back to single-question mode');
            setPreloadComplete(false);
            setLoading(false);

            // Fallback to single-question mode
            return fetchSingleQuestion();
        }
    }, [gameId, level]);

    /**
     * FALLBACK: Fetch single question (old behavior)
     * Used when batch pre-load fails
     */
    const fetchSingleQuestion = useCallback(async () => {
        if (!gameId) return;

        setLoading(true);
        setError(null);
        setShowFeedback(false);

        try {
            const params = new URLSearchParams({
                gameId,
                engineType,
                level: level.toString(),
                ...(userId && { userId }),
            });

            const response = await fetch(`/api/training/get-question?${params}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch question');
            }

            setCurrentQuestion(data.question);
        } catch (err) {
            console.error('[MillionaireGame] Fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [gameId, engineType, level, userId]);


    /**
     * Record answer to API (for no-repeat tracking)
     */
    const recordAnswer = useCallback(async (questionId, selectedAnswer, isCorrect) => {
        if (!userId || !gameId) return;

        try {
            await fetch('/api/training/record-question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    questionId,
                    selectedAnswer,
                    isCorrect,
                    level,
                }),
            });
        } catch (err) {
            // Non-blocking - continue even if recording fails
            console.warn('[MillionaireGame] Record error:', err);
        }
    }, [userId, gameId, level]);

    /**
     * Submit answer and show feedback
     */
    const submitAnswer = useCallback(async (selectedOptionId) => {
        if (!currentQuestion || showFeedback) return;

        const isCorrect = selectedOptionId === currentQuestion.correctAnswer;

        // Update scores
        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > bestStreak) setBestStreak(newStreak);
                return newStreak;
            });
        } else {
            setStreak(0);
        }

        // Show feedback
        setFeedbackResult(isCorrect ? 'correct' : 'wrong');
        setExplanation(currentQuestion.explanation || '');
        setShowFeedback(true);

        // Record to backend (async, non-blocking)
        recordAnswer(currentQuestion.id, selectedOptionId, isCorrect);
    }, [currentQuestion, showFeedback, bestStreak, recordAnswer]);

    /**
     * Save progress to database
     */
    const saveProgress = useCallback(async (passed, accuracy) => {
        if (!userId || !gameId) return;

        try {
            await fetch('/api/training/save-progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    gameId,
                    level,
                    questionsAnswered: QUESTIONS_PER_LEVEL,
                    questionsCorrect: correctCount,
                    accuracy,
                    passed,
                    streak: bestStreak,
                    xpEarned: totalXP,
                    diamondsEarned: 0, // TODO: Calculate diamond rewards
                    timeSpentSeconds: 0, // TODO: Track time
                }),
            });
        } catch (err) {
            console.warn('[MillionaireGame] Save progress error:', err);
        }
    }, [userId, gameId, level, correctCount, bestStreak, totalXP]);

    /**
     * Advance to next question or complete level
     * 🚀 INSTANT - Serves from pre-loaded array, no API call
     * FALLBACK - Fetches single question if pre-load failed
     */
    const nextQuestion = useCallback(() => {
        setShowFeedback(false);

        if (questionNumber >= QUESTIONS_PER_LEVEL) {
            // Level complete
            const accuracy = Math.round((correctCount / QUESTIONS_PER_LEVEL) * 100);
            const passed = checkLevelPassed(level, correctCount, QUESTIONS_PER_LEVEL);

            setLevelPassed(passed);
            setGameComplete(true);

            // Save progress to database
            saveProgress(passed, accuracy);
        } else {
            if (preloadComplete && preloadedQuestions[questionNumber]) {
                // Serve next question from pre-loaded array (INSTANT)
                setCurrentQuestion(preloadedQuestions[questionNumber]);
                setQuestionNumber(prev => prev + 1);
            } else {
                // Fallback to single-question mode
                setQuestionNumber(prev => prev + 1);
                fetchSingleQuestion();
            }
        }
    }, [questionNumber, correctCount, level, preloadComplete, preloadedQuestions, saveProgress, fetchSingleQuestion]);

    /**
     * Start next level (if passed)
     * 🚀 Pre-loads all questions for new level
     */
    const startNextLevel = useCallback(() => {
        if (!levelPassed || level >= TRAINING_CONFIG.totalLevels) return;

        setLevel(prev => prev + 1);
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setGameComplete(false);
        setLevelPassed(false);
        setPreloadComplete(false);
        preloadAllQuestions();
    }, [levelPassed, level, preloadAllQuestions]);

    /**
     * Retry current level
     * 🚀 Pre-loads fresh set of questions
     */
    const retryLevel = useCallback(() => {
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setGameComplete(false);
        setLevelPassed(false);
        setPreloadComplete(false);
        preloadAllQuestions();
    }, [preloadAllQuestions]);

    /**
     * Reset entire game
     * 🚀 Pre-loads questions for level 1
     */
    const resetGame = useCallback(() => {
        setLevel(1);
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setBestStreak(0);
        setTotalXP(0);
        setGameComplete(false);
        setLevelPassed(false);
        setPreloadComplete(false);
        preloadAllQuestions();
    }, [preloadAllQuestions]);

    // 🚀 Pre-load all questions on mount
    useEffect(() => {
        if (gameId) {
            preloadAllQuestions();
        }
    }, [gameId]); // Only pre-load on gameId change

    return {
        // Current state
        currentQuestion,
        questionNumber,
        totalQuestions: QUESTIONS_PER_LEVEL,
        level,
        loading,
        error,

        // Pre-load state
        preloadComplete,

        // Score state
        correctCount,
        streak,
        bestStreak,
        totalXP,
        requiredCorrect: getRequiredCorrect(level),
        passThreshold: TRAINING_CONFIG.passThresholds[level],

        // Feedback state
        showFeedback,
        feedbackResult,
        explanation,

        // Completion state
        gameComplete,
        levelPassed,

        // Actions
        submitAnswer,
        nextQuestion,
        startNextLevel,
        retryLevel,
        resetGame,
    };
}
