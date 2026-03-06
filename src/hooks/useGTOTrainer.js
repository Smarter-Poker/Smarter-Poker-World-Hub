/**
 * 🎰 USE MILLIONAIRE GAME — GTO Wizard-Style Training Flow Controller
 * ═══════════════════════════════════════════════════════════════════════════
 * Manages the training game with GTOW scoring integration:
 * - Fetches questions via API (PIO/CHART/SCENARIO engines)
 * - Tracks answers and enforces no-repeat logic
 * - Calculates GTOW Score, EV loss, and 5-tier move classification
 * - Exposes scoring metrics for GTO Wizard-style feedback UI
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAuthUser, getSessionToken } from '../lib/authUtils';
import TRAINING_CONFIG, { checkLevelPassed, getXPReward, getRequiredCorrect } from '../config/trainingConfig';
import useGTOWScore, { simulateGTOFrequencies, classifyMove } from './useGTOWScore';
import { trainingSounds } from '../utils/trainingSounds';

const QUESTIONS_PER_LEVEL = TRAINING_CONFIG.questionsPerLevel; // 25 questions per level

export default function useGTOTrainer(gameId, engineType = 'PIO', initialLevel = 1, trainerConfig = null) {
    // If custom trainer config provided, use its questions count
    const baseQuestionsPerLevel = trainerConfig?.questionsCount || QUESTIONS_PER_LEVEL;
    const [effectiveQuestionsPerLevel, setEffectiveQuestionsPerLevel] = useState(baseQuestionsPerLevel);
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

    // GTOW scoring integration
    const gtowScoring = useGTOWScore();
    const [lastMoveClassification, setLastMoveClassification] = useState(null);
    const [lastEVLoss, setLastEVLoss] = useState(0);
    const [lastGTOFrequencies, setLastGTOFrequencies] = useState(null);

    // ═══ MULTI-STREET STATE ═══
    const [currentStreet, setCurrentStreet] = useState('flop');
    const [isMultiStreetActive, setIsMultiStreetActive] = useState(false);
    const [handSummary, setHandSummary] = useState(null);
    const [lastSelectedAction, setLastSelectedAction] = useState(null);
    const multiStreetHandRef = useRef(null);

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
            const token = getSessionToken();
            let apiUrl;
            let params;

            if (trainerConfig) {
                // CUSTOM TRAINER MODE — use custom-train API with detailed config
                params = new URLSearchParams({
                    gameType: trainerConfig.gameType || 'cash',
                    stackDepth: (trainerConfig.stackDepth || 100).toString(),
                    count: (trainerConfig.questionsCount || effectiveQuestionsPerLevel).toString(),
                });
                if (trainerConfig.position && trainerConfig.position !== 'any') {
                    params.set('position', trainerConfig.position);
                }
                if (trainerConfig.villainPosition) {
                    params.set('villainPosition', trainerConfig.villainPosition);
                }
                if (trainerConfig.actionScenario) {
                    params.set('actionScenario', trainerConfig.actionScenario);
                }
                if (trainerConfig.street) {
                    params.set('street', trainerConfig.street);
                }
                if (trainerConfig.handClass) {
                    params.set('handClass', trainerConfig.handClass);
                }
                apiUrl = `/api/training/custom-train?${params}`;
                console.log(`[MillionaireGame] Custom trainer: ${trainerConfig.label || 'custom config'}`);
            } else {
                // STANDARD MODE — use batch-preload
                params = new URLSearchParams({
                    gameId,
                    level: level.toString(),
                    count: effectiveQuestionsPerLevel.toString(),
                });
                apiUrl = `/api/training/batch-preload?${params}`;
                console.log(`[MillionaireGame] Pre-loading ${effectiveQuestionsPerLevel} questions for ${gameId} level ${level}`);
            }

            const response = await fetch(apiUrl, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            // Safe JSON parsing to prevent Unexpected Token '<' HTML crash
            let data;
            const textResponse = await response.text();
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                console.error('[MillionaireGame] Non-JSON response:', textResponse.substring(0, 100));
                if (response.status === 401) throw new Error('Auth required');
                throw new Error(`Server error (${response.status})`);
            }

            if (!response.ok || !data.questions || data.questions.length === 0) {
                console.warn('[MillionaireGame] Pre-load failed, using single-question mode');
                setPreloadComplete(false);
                setLoading(false);
                return fetchSingleQuestion();
            }

            console.log(`[MillionaireGame] ✅ Pre-loaded ${data.questions.length} questions`);

            setPreloadedQuestions(data.questions);
            setPreloadComplete(true);
            setCurrentQuestion(data.questions[0]);

            // Bug 5 fix: Cap question count at actual returned count to prevent game never ending
            if (data.questions.length < effectiveQuestionsPerLevel) {
                console.warn(`[MillionaireGame] API returned ${data.questions.length}/${effectiveQuestionsPerLevel} questions, capping`);
                setEffectiveQuestionsPerLevel(data.questions.length);
            }

            setLoading(false);

        } catch (err) {
            console.error('[MillionaireGame] Pre-load error:', err);
            setPreloadComplete(false);
            setLoading(false);
            return fetchSingleQuestion();
        }
    }, [gameId, level, trainerConfig, effectiveQuestionsPerLevel]);

    /**
     * FALLBACK: Fetch single question via deterministic batch-preload (count=1)
     * Eliminates all Grok AI dependency — pure solver data only
     */
    const fetchSingleQuestion = useCallback(async () => {
        if (!gameId) return;

        setLoading(true);
        setError(null);
        setShowFeedback(false);

        try {
            const params = new URLSearchParams({
                gameId,
                level: level.toString(),
                count: '1',
            });

            const token = getSessionToken();
            const response = await fetch(`/api/training/batch-preload?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            // Safe JSON parsing
            let data;
            const textResponse = await response.text();
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                if (response.status === 401) throw new Error('Auth required');
                throw new Error(`Server error (${response.status})`);
            }

            if (!response.ok || !data.questions || data.questions.length === 0) {
                throw new Error(data.error || 'No solver data available');
            }

            setCurrentQuestion(data.questions[0]);
        } catch (err) {
            console.error('[MillionaireGame] Fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [gameId, level]);


    /**
     * Record answer to API (for no-repeat tracking)
     */
    const recordAnswer = useCallback(async (questionId, selectedAnswer, isCorrect) => {
        if (!userId || !gameId) return;

        try {
            const token = getSessionToken();
            await fetch('/api/training/record-question', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
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
        const correctAnswer = currentQuestion.correctAnswer;
        const options = currentQuestion.options || [];
        const scenario = currentQuestion.scenario || {};

        // ═══ PREFER REAL PIO DATA, FALL BACK TO SIMULATED ═══
        const hasPIOData = currentQuestion.gtoFrequencies && Object.keys(currentQuestion.gtoFrequencies).length > 0;
        const frequencies = hasPIOData
            ? currentQuestion.gtoFrequencies  // Real PIO solver frequencies (0-100%)
            : simulateGTOFrequencies(options, correctAnswer, level);

        // Classify the move — pass real PIO data for accurate EV loss when available
        const moveResult = classifyMove(
            selectedOptionId,
            correctAnswer,
            frequencies,
            level,
            hasPIOData ? currentQuestion.evData : null,        // Real EV data (or null)
            hasPIOData ? currentQuestion.rawFrequencies : null, // Full PIO frequency matrix
            currentQuestion.heroHand || scenario.heroHand,      // Hero hand for EV lookup
            scenario.pot                                        // Pot size for scaling
        );

        // Store for UI consumption
        setLastMoveClassification(moveResult.classification);
        setLastEVLoss(moveResult.evLoss);
        setLastGTOFrequencies(frequencies);

        // Record to GTOW scoring engine
        const selectedText = options.find(o => o.id === selectedOptionId)?.text || selectedOptionId;
        const correctText = options.find(o => o.id === correctAnswer)?.text || correctAnswer;
        gtowScoring.recordMove({
            classification: moveResult.classification,
            evLoss: moveResult.evLoss,
            frequencyDiff: moveResult.frequencyDiff,
            isRealData: moveResult.isRealData || false,
            handData: {
                heroCards: currentQuestion.heroCards || scenario.heroHand,
                board: scenario.board,
                heroPosition: scenario.heroPosition || scenario.position,
                pot: scenario.pot,
                action: selectedText,
                correctAction: correctText,
                question: currentQuestion.question || currentQuestion.text,
                source: currentQuestion.source || 'UNKNOWN',
                gtoFrequencies: frequencies || {},
            },
        });

        // Update legacy scores
        let currentStreakCount = prevStreak => prevStreak; // fallback
        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > bestStreak) setBestStreak(newStreak);
                if (newStreak % 5 === 0) trainingSounds.play('streak'); // Streak milestone
                return newStreak;
            });
        } else {
            setStreak(0);
        }

        // Audio Feedback for Move Quality
        const cls = moveResult.classification;
        if (cls === 'Blunder' || cls === 'Mistake' || cls === 'Inaccuracy' || !isCorrect) {
            trainingSounds.play('incorrect');
        } else {
            trainingSounds.play('correct');
        }

        // Show feedback
        setFeedbackResult(isCorrect ? 'correct' : 'wrong');
        setExplanation(currentQuestion.explanation || '');
        setShowFeedback(true);

        // Store the selected action for multi-street advance
        setLastSelectedAction(selectedOptionId);

        // ═══ MULTI-STREET: Record action on current hand ═══
        if (multiStreetHandRef.current && !multiStreetHandRef.current.isComplete) {
            multiStreetHandRef.current.recordAction(
                selectedOptionId,
                moveResult.classification,
                moveResult.evLoss
            );
        }

        // Record to backend (async, non-blocking)
        recordAnswer(currentQuestion.id, selectedOptionId, isCorrect);
    }, [currentQuestion, showFeedback, bestStreak, recordAnswer, level, gtowScoring]);

    /**
     * ═══ MULTI-STREET: Advance to next street within same hand ═══
     * Called by nextQuestion() when multi-street hand is active.
     * Queries API for next-street solver data.
     */
    const advanceToNextStreet = useCallback(async () => {
        const hand = multiStreetHandRef.current;
        if (!hand || hand.isComplete) return false;

        try {
            setLoading(true);

            // Call API endpoint to get next-street question
            const token = getSessionToken();
            const params = new URLSearchParams({
                gameId,
                heroHand: hand.heroHand,
                boardCards: hand.boardCards.join(','),
                street: hand.nextStreetName,
                pot: Math.round(hand.pot).toString(),
                stackDepth: hand.stackDepth.toString(),
            });

            const response = await fetch(`/api/training/next-street?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });

            if (response.ok) {
                const data = await response.json();
                if (data.question) {
                    // Enrich with multi-street context
                    const nextQ = data.question;
                    nextQ.scenario = {
                        ...nextQ.scenario,
                        isMultiStreet: true,
                        streetNumber: hand.streetIndex + 2,
                        previousActions: hand.streetActions,
                        pot: Math.round(hand.pot),
                        board: hand.boardCards.join(' ') + ' ' + (data.newCard || ''),
                    };
                    nextQ.heroCards = hand.heroCards;

                    setCurrentQuestion(nextQ);
                    setCurrentStreet(hand.nextStreetName);
                    setShowFeedback(false);
                    setLoading(false);
                    return true;
                }
            }

            // Next street failed — end the hand
            setIsMultiStreetActive(false);
            setHandSummary(hand.getHandSummary());
            multiStreetHandRef.current = null;
            setLoading(false);
            return false;

        } catch (err) {
            console.warn('[MillionaireGame] Multi-street advance error:', err);
            setIsMultiStreetActive(false);
            multiStreetHandRef.current = null;
            setLoading(false);
            return false;
        }
    }, [gameId]);

    /**
     * Save progress to database
     */
    const saveProgress = useCallback(async (passed, accuracy) => {
        if (!userId || !gameId) return;

        try {
            const token = getSessionToken();
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            };

            // Save basic progress (training_progress + training_level_history)
            await fetch('/api/training/save-progress', {
                method: 'POST', headers,
                body: JSON.stringify({
                    userId, gameId, level,
                    questionsAnswered: effectiveQuestionsPerLevel,
                    questionsCorrect: correctCount,
                    accuracy, passed,
                    streak: bestStreak,
                    xpEarned: totalXP,
                    diamondsEarned: 0,
                    timeSpentSeconds: 0,
                }),
            });

            // NOTE: save-session is handled by GodModeArena's auto-save useEffect
            // to avoid duplicate training_sessions rows.

            // Dispatch event bus for real-time updates across pages
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('trainingSessionSaved', {
                    detail: { gameId, gtowScore: gtowScoring.gtowScore, handsPlayed: gtowScoring.handsPlayed },
                }));
            }

        } catch (err) {
            console.warn('[MillionaireGame] Save progress error:', err);
        }
    }, [userId, gameId, level, correctCount, bestStreak, totalXP, gtowScoring, trainerConfig]);

    /**
     * Advance to next question or complete level
     * 🚀 MULTI-STREET: First tries to advance the street within same hand
     * If no next street → advance to next hand from pre-loaded array
     */
    const nextQuestion = useCallback(async () => {
        setShowFeedback(false);

        // ═══ MULTI-STREET: Try advancing street first ═══
        if (isMultiStreetActive && multiStreetHandRef.current && !multiStreetHandRef.current.isComplete) {
            // Hero didn't fold — try to advance to next street
            if (lastSelectedAction !== 'f') {
                const advanced = await advanceToNextStreet();
                if (advanced) return; // Successfully moved to next street
            }

            // Multi-street hand is done — save summary
            setHandSummary(multiStreetHandRef.current.getHandSummary());
            setIsMultiStreetActive(false);
            multiStreetHandRef.current = null;
        }

        // Reset street state for new hand
        setCurrentStreet('flop');
        setHandSummary(null);

        if (questionNumber >= effectiveQuestionsPerLevel) {
            // Level complete
            const accuracy = Math.round((correctCount / effectiveQuestionsPerLevel) * 100);
            const passed = checkLevelPassed(level, correctCount, effectiveQuestionsPerLevel);

            setLevelPassed(passed);
            setGameComplete(true);

            // Audio feedback for level completion
            if (passed) {
                if (accuracy === 100) trainingSounds.play('mastery');
                else trainingSounds.play('levelUp');
            } else {
                trainingSounds.play('incorrect');
            }

            // Save progress to database
            saveProgress(passed, accuracy);
        } else {
            if (preloadComplete && preloadedQuestions[questionNumber]) {
                // Serve next question from pre-loaded array (INSTANT)
                const nextQ = preloadedQuestions[questionNumber];
                setCurrentQuestion(nextQ);
                setQuestionNumber(prev => prev + 1);

                // ═══ START MULTI-STREET HAND if this is a postflop PIO question ═══
                const scenario = nextQ.scenario || {};
                const street = scenario.street || '';
                if ((street === 'flop' || street === 'turn') && nextQ.source === 'DETERMINISTIC_SOLVER') {
                    try {
                        const { MultiStreetHand } = await import('../engines/MultiStreetHandManager');
                        multiStreetHandRef.current = new MultiStreetHand(nextQ);
                        setIsMultiStreetActive(true);
                        setCurrentStreet(street);
                    } catch (e) {
                        console.warn('[MillionaireGame] MultiStreetHand import failed:', e);
                    }
                }
            } else {
                // Fallback to single-question mode
                setQuestionNumber(prev => prev + 1);
                fetchSingleQuestion();
            }
        }
    }, [questionNumber, correctCount, level, preloadComplete, preloadedQuestions, saveProgress, fetchSingleQuestion, isMultiStreetActive, advanceToNextStreet, lastSelectedAction]);

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
        setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
        preloadAllQuestions();
    }, [preloadAllQuestions, baseQuestionsPerLevel]);

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
        setEffectiveQuestionsPerLevel(baseQuestionsPerLevel); // Reset to original count
        preloadAllQuestions();
    }, [preloadAllQuestions, baseQuestionsPerLevel]);

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
        totalQuestions: effectiveQuestionsPerLevel,
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

        // GTOW scoring state
        moveClassification: lastMoveClassification,
        evLoss: lastEVLoss,
        gtoFrequencies: lastGTOFrequencies,
        gtowScore: gtowScoring.gtowScore,
        totalEVLoss: gtowScoring.totalEVLoss,
        sessionMistakes: gtowScoring.mistakeCount,
        handHistory: gtowScoring.handHistory,
        avgEVLossPerHand: gtowScoring.avgEVLossPerHand,
        avgEVLossPerMistake: gtowScoring.avgEVLossPerMistake,
        avgFrequencyDiff: gtowScoring.avgFrequencyDiff,

        // Multi-street state
        currentStreet,
        isMultiStreetActive,
        handSummary,

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
