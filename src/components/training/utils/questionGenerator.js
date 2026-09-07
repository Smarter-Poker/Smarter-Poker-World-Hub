/**
 * QUESTION GENERATOR UTILITY
 * Handles question generation, shuffling, and preloading for training sessions
 */

import { authedFetch } from '../../../lib/authUtils';

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
    const { gameId, level, count, trainerConfig = null } = params;

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
        if (trainerConfig.street) {
            queryParams.set('street', trainerConfig.street);
        }
        if (trainerConfig.handClass) {
            queryParams.set('handClass', trainerConfig.handClass);
        }
        apiUrl = `/api/training/custom-train?${queryParams}`;
    } else {
        // STANDARD MODE — use batch-preload
        queryParams = new URLSearchParams({
            gameId,
            level: level.toString(),
            count: count.toString(),
        });
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
    const { gameId, level } = params;

    if (!gameId) {
        throw new Error('gameId is required');
    }

    const queryParams = new URLSearchParams({
        gameId,
        level: level.toString(),
        count: '1',
    });

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
    const { userId, gameId, questionId, selectedAnswer, isCorrect, level } = params;

    if (!userId || !gameId) return;

    try {
        await authedFetch('/api/training/record-question', {
            method: 'POST',
            body: JSON.stringify({
                userId,
                gameId,
                questionId,
                selectedAnswer,
                isCorrect,
                level,
            }),
        });
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
}
