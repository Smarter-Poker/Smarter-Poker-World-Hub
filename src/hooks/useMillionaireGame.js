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

const QUESTIONS_PER_LEVEL = TRAINING_CONFIG.questionsPerLevel;

export default function useMillionaireGame(gameId, engineType = 'PIO', initialLevel = 1) {
    // Game state
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [level, setLevel] = useState(initialLevel);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
     * Fetch next question from API
     */
    const fetchQuestion = useCallback(async () => {
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
     * Advance to next question (after feedback)
     */
    const nextQuestion = useCallback(() => {
        if (questionNumber >= QUESTIONS_PER_LEVEL) {
            // Level complete - check if passed
            const passed = checkLevelPassed(level, correctCount);
            const xpEarned = getXPReward(level, correctCount, bestStreak * 5);

            setLevelPassed(passed);
            setTotalXP(prev => prev + xpEarned);
            setGameComplete(true);
        } else {
            // Go to next question
            setQuestionNumber(prev => prev + 1);
            fetchQuestion();
        }
    }, [questionNumber, level, correctCount, bestStreak, fetchQuestion]);

    /**
     * Start next level (if passed)
     */
    const startNextLevel = useCallback(() => {
        if (!levelPassed || level >= TRAINING_CONFIG.totalLevels) return;

        setLevel(prev => prev + 1);
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setGameComplete(false);
        setLevelPassed(false);
        fetchQuestion();
    }, [levelPassed, level, fetchQuestion]);

    /**
     * Retry current level
     */
    const retryLevel = useCallback(() => {
        setQuestionNumber(1);
        setCorrectCount(0);
        setStreak(0);
        setGameComplete(false);
        setLevelPassed(false);
        fetchQuestion();
    }, [fetchQuestion]);

    /**
     * Reset entire game
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
        fetchQuestion();
    }, [fetchQuestion]);

    // Load first question on mount
    useEffect(() => {
        if (gameId) {
            fetchQuestion();
        }
    }, [gameId]); // Only fetch on gameId change, not on every fetchQuestion change

    return {
        // Current state
        currentQuestion,
        questionNumber,
        totalQuestions: QUESTIONS_PER_LEVEL,
        level,
        loading,
        error,

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
        fetchQuestion,
    };
}
