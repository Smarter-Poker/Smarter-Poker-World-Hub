/**
 * 🎮 TRAINING RUN ENGINE — 20-Question / 85% Pass Rule
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * THE LAW:
 * - Each run is exactly 20 questions
 * - Pass threshold: >= 85% correct (17/20 or better)
 * - If < 85%, user does NOT advance; offer fun replay loop
 * 
 * This engine manages the complete lifecycle of a training run,
 * emitting all events to Central Bus for authoritative recording.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { centralBus, busEmitTraining } from './CentralBus';
import { eventBus } from './EventBus';

// Hard-coded constants (non-configurable by design)
export const RUN_RULES = {
    QUESTIONS_PER_RUN: 20,
    PASS_THRESHOLD: 0.85, // 85%
    PASS_CORRECT_COUNT: 17, // 17/20
    TIME_PER_QUESTION: 15, // seconds
    XP_BASE_CORRECT: 10,
    XP_STREAK_BONUS: 5,
    XP_SPEED_MULTIPLIERS: {
        LIGHTNING: 2.0,  // < 20% time used
        FAST: 1.5,       // < 40% time used
        NORMAL: 1.25,    // < 60% time used
        STANDARD: 1.0,   // >= 60% time used
    },
};

/**
 * Run State Machine States
 */
export const RunState = {
    IDLE: 'IDLE',
    LOADING: 'LOADING',
    ACTIVE: 'ACTIVE',
    QUESTION_SHOWN: 'QUESTION_SHOWN',
    ANSWER_PENDING: 'ANSWER_PENDING',
    RESULT_SHOWN: 'RESULT_SHOWN',
    RUN_COMPLETE: 'RUN_COMPLETE',
    OFFLINE_WARNING: 'OFFLINE_WARNING',
};

/**
 * 🎮 TRAINING RUN ENGINE CLASS
 */
class TrainingRunEngineClass {
    constructor() {
        this.state = RunState.IDLE;
        this.runId = null;
        this.gameId = null;
        this.difficulty = 1;
        this.mode = 'standard';

        // Run progress
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = [];
        this.correctCount = 0;
        this.streak = 0;
        this.maxStreak = 0;

        // Timing
        this.runStartTime = null;
        this.questionStartTime = null;
        this.totalTimeMs = 0;

        // Listeners
        this.listeners = new Set();
    }

    /**
     * Subscribe to run state changes
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    _notify() {
        const state = this.getState();
        this.listeners.forEach(cb => cb(state));
    }

    /**
     * Get current run state
     */
    getState() {
        return {
            state: this.state,
            runId: this.runId,
            gameId: this.gameId,
            questionNumber: this.currentQuestionIndex + 1,
            totalQuestions: RUN_RULES.QUESTIONS_PER_RUN,
            correctCount: this.correctCount,
            streak: this.streak,
            maxStreak: this.maxStreak,
            currentQuestion: this.questions[this.currentQuestionIndex] || null,
            progress: this.currentQuestionIndex / RUN_RULES.QUESTIONS_PER_RUN,
            score: this.currentQuestionIndex > 0
                ? Math.round((this.correctCount / this.currentQuestionIndex) * 100)
                : 0,
            isOnline: centralBus.isAuthoritativeMode(),
            canPass: this.correctCount >= RUN_RULES.PASS_CORRECT_COUNT - (RUN_RULES.QUESTIONS_PER_RUN - this.currentQuestionIndex),
            willPass: this.correctCount >= RUN_RULES.PASS_CORRECT_COUNT,
        };
    }

    /**
     * Start a new training run
     * @param {string} gameId - The training game ID (e.g., 'mtt_01')
     * @param {Array} questions - Array of 20 question objects
     * @param {number} difficulty - Difficulty level 1-5
     * @param {string} mode - 'standard' | 'blitz' | 'practice'
     */
    async startRun(gameId, questions, difficulty = 1, mode = 'standard') {
        // Validate question count
        if (!questions || questions.length !== RUN_RULES.QUESTIONS_PER_RUN) {
            throw new Error(`Run requires exactly ${RUN_RULES.QUESTIONS_PER_RUN} questions, got ${questions?.length || 0}`);
        }

        // Check Central Bus connection
        if (!centralBus.isAuthoritativeMode()) {
            this.state = RunState.OFFLINE_WARNING;
            this._notify();
            return { success: false, offline: true };
        }

        // Initialize run
        this.runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.gameId = gameId;
        this.difficulty = difficulty;
        this.mode = mode;
        this.questions = questions;
        this.currentQuestionIndex = 0;
        this.answers = [];
        this.correctCount = 0;
        this.streak = 0;
        this.maxStreak = 0;
        this.runStartTime = Date.now();
        this.totalTimeMs = 0;

        // Emit RUN_STARTED to Central Bus
        const result = await busEmitTraining.runStarted(gameId, difficulty, mode);

        if (!result.success) {
            this.state = RunState.OFFLINE_WARNING;
            this._notify();
            return result;
        }

        this.state = RunState.ACTIVE;
        this._notify();

        // Show first question
        await this._showCurrentQuestion();

        return { success: true, runId: this.runId };
    }

    /**
     * Submit answer for current question
     * @param {string} answerId - The selected answer ID
     * @returns Response time bonus info
     */
    async submitAnswer(answerId) {
        if (this.state !== RunState.QUESTION_SHOWN) {
            console.warn('[TrainingRunEngine] Cannot submit answer in state:', this.state);
            return null;
        }

        this.state = RunState.ANSWER_PENDING;
        this._notify();

        const question = this.questions[this.currentQuestionIndex];
        const responseTimeMs = Date.now() - this.questionStartTime;

        // Find selected and correct answers
        const selectedOption = question.options.find(o => o.id === answerId);
        const isCorrect = selectedOption?.isGTO === true;

        // Calculate speed bonus
        const percentTimeUsed = (responseTimeMs / (RUN_RULES.TIME_PER_QUESTION * 1000)) * 100;
        let speedMultiplier = RUN_RULES.XP_SPEED_MULTIPLIERS.STANDARD;
        let speedLabel = 'STANDARD';

        if (percentTimeUsed <= 20) {
            speedMultiplier = RUN_RULES.XP_SPEED_MULTIPLIERS.LIGHTNING;
            speedLabel = 'LIGHTNING';
        } else if (percentTimeUsed <= 40) {
            speedMultiplier = RUN_RULES.XP_SPEED_MULTIPLIERS.FAST;
            speedLabel = 'FAST';
        } else if (percentTimeUsed <= 60) {
            speedMultiplier = RUN_RULES.XP_SPEED_MULTIPLIERS.NORMAL;
            speedLabel = 'NORMAL';
        }

        // Record answer
        const answerRecord = {
            questionId: question.id,
            answerId,
            isCorrect,
            responseTimeMs,
            speedMultiplier,
            speedLabel,
        };
        this.answers.push(answerRecord);

        // Update counters
        if (isCorrect) {
            this.correctCount++;
            this.streak++;
            this.maxStreak = Math.max(this.maxStreak, this.streak);
        } else {
            this.streak = 0;
        }

        this.totalTimeMs += responseTimeMs;

        // Emit to Central Bus
        await busEmitTraining.answerSubmitted(
            question.id,
            answerId,
            isCorrect,
            responseTimeMs
        );

        this.state = RunState.RESULT_SHOWN;
        this._notify();

        return {
            isCorrect,
            correctAnswer: question.options.find(o => o.isGTO)?.id,
            explanation: question.explanation,
            speedMultiplier,
            speedLabel,
            responseTimeMs,
            streak: this.streak,
            correctCount: this.correctCount,
            questionsRemaining: RUN_RULES.QUESTIONS_PER_RUN - (this.currentQuestionIndex + 1),
        };
    }

    /**
     * Proceed to next question (or complete run)
     */
    async nextQuestion() {
        if (this.state !== RunState.RESULT_SHOWN) {
            console.warn('[TrainingRunEngine] Cannot proceed in state:', this.state);
            return;
        }

        this.currentQuestionIndex++;

        // Check if run complete
        if (this.currentQuestionIndex >= RUN_RULES.QUESTIONS_PER_RUN) {
            await this._completeRun();
            return;
        }

        // Show next question
        await this._showCurrentQuestion();
    }

    /**
     * Abort current run (user quit or offline)
     */
    async abortRun() {
        if (this.state === RunState.IDLE) return;

        // Emit partial run completion
        const score = this.currentQuestionIndex > 0
            ? Math.round((this.correctCount / this.currentQuestionIndex) * 100)
            : 0;

        await centralBus.emit('RUN_ABORTED', {
            game_id: this.gameId,
            questions_answered: this.currentQuestionIndex,
            correct_count: this.correctCount,
            score,
            reason: 'USER_ABORT',
        });

        this._reset();
    }

    /**
     * Force proceed despite offline warning
     * (for practice mode only — progress won't be recorded)
     */
    async forceProceedOffline() {
        if (this.state !== RunState.OFFLINE_WARNING) return;

        this.mode = 'practice'; // Mark as practice so user knows
        this.state = RunState.ACTIVE;
        this._notify();
        await this._showCurrentQuestion();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════

    async _showCurrentQuestion() {
        const question = this.questions[this.currentQuestionIndex];
        if (!question) {
            console.error('[TrainingRunEngine] No question at index:', this.currentQuestionIndex);
            return;
        }

        this.questionStartTime = Date.now();
        this.state = RunState.QUESTION_SHOWN;

        // Emit to Central Bus
        await busEmitTraining.questionShown(
            question.id,
            question.handId || null,
            question.nodeId || null
        );

        this._notify();
    }

    async _completeRun() {
        const score = Math.round((this.correctCount / RUN_RULES.QUESTIONS_PER_RUN) * 100);
        const passed = score >= 85;
        const passFail = passed ? 'PASS' : 'FAIL';

        // Calculate mastery delta
        const masteryDelta = passed ? Math.round(score / 10) : 0;

        // Streak update
        const streakUpdate = {
            maxStreak: this.maxStreak,
            finalStreak: this.streak,
        };

        // Emit to Central Bus
        await busEmitTraining.runCompleted(
            this.gameId,
            score,
            passFail,
            masteryDelta,
            streakUpdate
        );

        this.state = RunState.RUN_COMPLETE;
        this._notify();

        // Emit local events for UI celebrations
        if (passed) {
            eventBus.emit('CELEBRATION', { type: 'LEVEL_PASSED', score }, 'TrainingRunEngine');
        }

        return {
            score,
            passed,
            correctCount: this.correctCount,
            totalQuestions: RUN_RULES.QUESTIONS_PER_RUN,
            masteryDelta,
            maxStreak: this.maxStreak,
            totalTimeMs: this.totalTimeMs,
            averageTimeMs: Math.round(this.totalTimeMs / RUN_RULES.QUESTIONS_PER_RUN),
        };
    }

    _reset() {
        this.state = RunState.IDLE;
        this.runId = null;
        this.gameId = null;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.answers = [];
        this.correctCount = 0;
        this.streak = 0;
        this.maxStreak = 0;
        this.runStartTime = null;
        this.questionStartTime = null;
        this.totalTimeMs = 0;
        this._notify();
    }

    /**
     * Restart the same run (for failed attempts)
     */
    async restartRun() {
        if (!this.questions.length || !this.gameId) {
            console.warn('[TrainingRunEngine] No run to restart');
            return null;
        }

        // Shuffle questions for replay variety
        const shuffled = [...this.questions].sort(() => Math.random() - 0.5);

        return this.startRun(this.gameId, shuffled, this.difficulty, this.mode);
    }
}

// Singleton export
export const trainingRunEngine = new TrainingRunEngineClass();

export default trainingRunEngine;
