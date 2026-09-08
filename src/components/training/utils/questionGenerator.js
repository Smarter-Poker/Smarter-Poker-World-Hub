/**
 * QUESTION GENERATOR UTILITY
 * Handles question generation, shuffling, and preloading for training sessions
 */

import { authedFetch } from '../../../lib/authUtils';

export function createQuestionGeneratorSessionId() {
    const randomUUID = globalThis?.crypto?.randomUUID;
    if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto);
    return `training-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function assertSignedQuestions(data, expectedSessionId) {
    if (String(data?.sessionId || '') !== String(expectedSessionId || '')) {
        throw new Error('Training delivery returned a mismatched session');
    }
    if (!data?.attemptId) {
        throw new Error('Training delivery returned without an attempt identity');
    }
    for (const question of data?.questions || []) {
        const context = question?._gradingContext;
        if (
            !context?.receipt
            || !context?.submissionId
            || !context?.attemptId
            || !context?.snapshotKey
            || !context?.sessionKind
            || !Number.isInteger(Number(context?.sessionTargetHands))
            || !Number.isInteger(Number(context?.handOrdinal))
            || !Number.isInteger(Number(context?.decisionOrdinal))
            || typeof context?.countsTowardCompletion !== 'boolean'
            || typeof context?.practiceOnly !== 'boolean'
            || String(context.sessionId || '') !== String(expectedSessionId || '')
            || String(context.attemptId) !== String(data.attemptId)
        ) {
            throw new Error('Training delivery returned an unsigned question');
        }
        const expiresAt = Date.parse(context.expiresAt || '');
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
            throw new Error('Training delivery returned an expired question');
        }
    }
}

/**
 * Fetch questions in batch from the training API
 * @param {Object} params - Fetch parameters
 * @param {string} params.gameId - Game identifier
 * @param {number} params.level - Current level
 * @param {number} params.count - Number of questions to fetch
 * @param {Object} params.trainerConfig - Optional custom trainer configuration
 * @returns {Promise<Array>} - Array of question objects
 */
export async function fetchQuestionBatch(params) {
    const {
        gameId,
        level,
        count,
        trainerConfig = null,
        difficulty = trainerConfig?.difficulty || 'standard',
        targetStreet = trainerConfig?.targetStreet || trainerConfig?.street || null,
        sessionId = createQuestionGeneratorSessionId(),
        handOrdinalStart = 1,
    } = params;
    const gameMode = trainerConfig?.gameMode || 'full';
    const handSelection = trainerConfig?.handSelection || 'all';

    if (!gameId) {
        throw new Error('gameId is required');
    }

    let apiUrl;
    let queryParams;

    if (trainerConfig) {
        // CUSTOM TRAINER MODE — use custom-train API with detailed config
        queryParams = new URLSearchParams({
            gameId,
            gameType: trainerConfig.gameType || 'cash',
            stackDepth: (trainerConfig.stackDepth || 100).toString(),
            count: (trainerConfig.questionsCount || count).toString(),
            level: level.toString(),
            difficulty,
            sessionId,
            gameMode,
            handSelection,
            handOrdinalStart: Math.max(1, Number(handOrdinalStart) || 1).toString(),
        });
        if (trainerConfig.position && trainerConfig.position !== 'any') {
            queryParams.set('position', trainerConfig.position);
        }
        if (trainerConfig.villainPosition) {
            queryParams.set('villainPosition', trainerConfig.villainPosition);
        }
        if (trainerConfig.actionScenario) {
            queryParams.set('actionScenario', trainerConfig.actionScenario);
        }
        if (targetStreet) {
            queryParams.set('street', targetStreet);
        }
        if (trainerConfig.handClass) {
            queryParams.set('handClass', trainerConfig.handClass);
        }
        if (trainerConfig.boardTexture) {
            queryParams.set('boardTexture', trainerConfig.boardTexture);
        }
        if (trainerConfig.spotType) {
            queryParams.set('spotType', trainerConfig.spotType);
        }
        apiUrl = `/api/training/custom-train?${queryParams}`;
    } else {
        // STANDARD MODE — use batch-preload
        queryParams = new URLSearchParams({
            gameId,
            level: level.toString(),
            count: count.toString(),
            difficulty,
            sessionId,
            gameMode,
            handSelection,
            handOrdinalStart: Math.max(1, Number(handOrdinalStart) || 1).toString(),
        });
        if (targetStreet) queryParams.set('targetStreet', targetStreet);
        apiUrl = `/api/training/batch-preload?${queryParams}`;
    }

    const response = await authedFetch(apiUrl);

    // Safe JSON parsing to prevent Unexpected Token '<' HTML crash
    const textResponse = await response.text();
    let data;
    try {
        data = JSON.parse(textResponse);
    } catch (e) {
        console.warn('[questionGenerator] Non-JSON response:', textResponse.substring(0, 100));
        if (response.status === 401) throw new Error('Auth required');
        throw new Error(`Server error (${response.status})`);
    }

    if (!response.ok || !data.questions || data.questions.length === 0) {
        throw new Error('No questions returned from API');
    }

    assertSignedQuestions(data, sessionId);

    return data.questions;
}

/**
 * Fetch a single question
 * @param {Object} params - Fetch parameters
 * @param {string} params.gameId - Game identifier
 * @param {number} params.level - Current level
 * @returns {Promise<Object>} - Single question object
 */
export async function fetchSingleQuestion(params) {
    const {
        gameId,
        level,
        difficulty = 'standard',
        targetStreet = null,
        sessionId = createQuestionGeneratorSessionId(),
        gameMode = 'full',
        handSelection = 'all',
        handOrdinal = 1,
    } = params;

    if (!gameId) {
        throw new Error('gameId is required');
    }

    const queryParams = new URLSearchParams({
        gameId,
        level: level.toString(),
        count: '1',
        difficulty,
        sessionId,
        gameMode,
        handSelection,
        handOrdinalStart: Math.max(1, Number(handOrdinal) || 1).toString(),
    });
    if (targetStreet) queryParams.set('targetStreet', targetStreet);

    const response = await authedFetch(`/api/training/batch-preload?${queryParams}`);

    // Safe JSON parsing
    const textResponse = await response.text();
    let data;
    try {
        data = JSON.parse(textResponse);
    } catch (e) {
        if (response.status === 401) throw new Error('Auth required');
        throw new Error('Invalid response from server');
    }

    if (!response.ok || !data.questions || data.questions.length === 0) {
        throw new Error('No question returned');
    }

    assertSignedQuestions(data, sessionId);

    return data.questions[0];
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} - New shuffled array
 */
export function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Get next question from preloaded array
 * @param {Array} preloadedQuestions - Array of preloaded questions
 * @param {number} currentIndex - Current question index (0-based)
 * @returns {Object|null} - Next question or null if no more questions
 */
export function getNextQuestion(preloadedQuestions, currentIndex) {
    if (!preloadedQuestions || currentIndex >= preloadedQuestions.length) {
        return null;
    }
    return preloadedQuestions[currentIndex];
}

/**
 * Validate question object has required fields
 * @param {Object} question - Question object to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function validateQuestion(question) {
    if (!question) return false;
    if (!question.question && !question.text) return false;
    if (!question.options || !Array.isArray(question.options)) return false;
    if (question.options.length === 0) return false;
    if (!question.correctAnswer) return false;
    return true;
}

/**
 * Filter questions by difficulty
 * @param {Array} questions - Array of questions
 * @param {number} minDifficulty - Minimum difficulty (1-10)
 * @param {number} maxDifficulty - Maximum difficulty (1-10)
 * @returns {Array} - Filtered questions
 */
export function filterQuestionsByDifficulty(questions, minDifficulty = 1, maxDifficulty = 10) {
    return questions.filter(q => {
        const difficulty = q.difficulty || 5;
        return difficulty >= minDifficulty && difficulty <= maxDifficulty;
    });
}

/**
 * Group questions by category
 * @param {Array} questions - Array of questions
 * @returns {Object} - Questions grouped by category
 */
export function groupQuestionsByCategory(questions) {
    return questions.reduce((acc, question) => {
        const category = question.category || 'general';
        if (!acc[category]) acc[category] = [];
        acc[category].push(question);
        return acc;
    }, {});
}

/**
 * Record answered question to prevent repeats
 * @param {Object} params - Record parameters
 * @param {string} params.userId - User ID
 * @param {string} params.gameId - Game ID
 * @param {string} params.questionId - Question ID
 * @param {string} params.selectedAnswer - Selected answer
 * @param {boolean} params.isCorrect - Whether answer was correct
 * @param {number} params.level - Current level
 * @returns {Promise<void>}
 */
export async function recordAnsweredQuestion(params) {
    const {
        userId,
        gameId,
        question,
        questionId = question?.id,
        policyChecksum = question?.policyChecksum,
        selectedAnswer,
        isCorrect,
        level,
        gradingReceipt = question?._gradingContext?.receipt,
        submissionId = question?._gradingContext?.submissionId,
        sessionId = question?._gradingContext?.sessionId,
        attemptId = question?._gradingContext?.attemptId,
        snapshotKey = question?._gradingContext?.snapshotKey,
        sessionKind = question?._gradingContext?.sessionKind,
        sessionTargetHands = question?._gradingContext?.sessionTargetHands,
        handOrdinal = question?._gradingContext?.handOrdinal,
        decisionOrdinal = question?._gradingContext?.decisionOrdinal,
        countsTowardCompletion = question?._gradingContext?.countsTowardCompletion,
        practiceOnly = question?._gradingContext?.practiceOnly,
        gradingMode = question?._gradingContext?.difficultyMode,
        rng = null,
    } = params;

    if (!gameId || !questionId || selectedAnswer === undefined || selectedAnswer === null) {
        throw new Error('gameId, questionId, and selectedAnswer are required');
    }
    if (
        !gradingReceipt
        || !submissionId
        || !sessionId
        || !attemptId
        || !snapshotKey
        || !sessionKind
        || !/^[0-9a-f]{64}$/i.test(String(policyChecksum || ''))
        || !Number.isInteger(Number(sessionTargetHands))
        || !Number.isInteger(Number(handOrdinal))
        || !Number.isInteger(Number(decisionOrdinal))
        || typeof countsTowardCompletion !== 'boolean'
        || typeof practiceOnly !== 'boolean'
        || !gradingMode
    ) {
        throw new Error('A signed training question is required before recording an answer');
    }

    const immutableSubmission = JSON.stringify({
        ...(userId ? { userId } : {}),
        gameId,
        questionId,
        policyChecksum,
        selectedAnswer,
        isCorrect,
        level,
        gradingReceipt,
        submissionId,
        sessionId,
        attemptId,
        snapshotKey,
        sessionKind,
        sessionTargetHands,
        handOrdinal,
        decisionOrdinal,
        countsTowardCompletion,
        practiceOnly,
        gradingMode,
        rng,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await authedFetch('/api/training/record-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: immutableSubmission,
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
            if (
                payload?.success !== true
                || String(payload?.submissionId || '') !== String(submissionId)
                || String(payload?.sessionId || '') !== String(sessionId)
                || String(payload?.attemptId || '') !== String(attemptId)
                || String(payload?.snapshotKey || '') !== String(snapshotKey)
                || Number(payload?.handOrdinal) !== Number(handOrdinal)
                || Number(payload?.decisionOrdinal) !== Number(decisionOrdinal)
            ) {
                throw new Error('The Training server did not acknowledge this exact signed answer');
            }
            return payload;
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === 2) {
            const error = new Error(payload?.error || `Answer persistence failed (${response.status})`);
            error.code = payload?.code || null;
            throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
}
