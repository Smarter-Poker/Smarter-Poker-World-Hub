/**
 * 🏆 XP ENGINE (VIDEO GAME MODE)
 * ═══════════════════════════════════════════════════════════════════════════
 * The "Addiction" Core. Makes every action FEEL rewarding.
 * 
 * Laws:
 * - XP CAN NEVER BE LOST (Immutable)
 * - Streak multipliers reward consistency
 * - Combo bonuses for consecutive correct answers
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eventBus, EventType } from './EventBus';

const XP_BASE = {
    CORRECT: 100,
    INCORRECT: 0,
    STREAK_5: 300,
    STREAK_10: 500,
    STREAK_25: 1500,
    STREAK_50: 5000,
    STREAK_100: 15000,
    LEVEL_COMPLETE: 1000,
};

const STREAK_MULTIPLIER = (streak) => {
    if (streak >= 25) return 3.0;
    if (streak >= 15) return 2.5;
    if (streak >= 10) return 2.0;
    if (streak >= 7) return 1.75;
    if (streak >= 5) return 1.5;
    if (streak >= 3) return 1.25;
    return 1.0;
};

const COMBO_THRESHOLDS = [0, 3, 5, 7, 10];
const COMBO_NAMES = ['NORMAL', 'GOOD', 'GREAT', 'EXCELLENT', 'PERFECT'];
const STREAK_MILESTONES = [5, 10, 25, 50, 100];

class XPEngine {
    constructor(initialXP = 0) {
        this.state = {
            sessionXP: 0,
            totalXP: initialXP,
            currentStreak: 0,
            maxStreak: 0,
            correctCount: 0,
            incorrectCount: 0,
            comboLevel: 0
        };
        this.listeners = [];
        this.previousComboLevel = 0;
    }

    recordCorrect() {
        this.state.currentStreak++;
        this.state.correctCount++;

        if (this.state.currentStreak > this.state.maxStreak) {
            this.state.maxStreak = this.state.currentStreak;
        }

        const multiplier = STREAK_MULTIPLIER(this.state.currentStreak);
        const baseXP = XP_BASE.CORRECT;
        const totalXP = Math.round(baseXP * multiplier);

        this.previousComboLevel = this.state.comboLevel;
        this.state.comboLevel = COMBO_THRESHOLDS.findIndex(
            (threshold, i) => this.state.currentStreak >= threshold &&
                (i === COMBO_THRESHOLDS.length - 1 || this.state.currentStreak < COMBO_THRESHOLDS[i + 1])
        );

        this.state.sessionXP += totalXP;
        this.state.totalXP += totalXP;

        const event = {
            type: 'CORRECT',
            baseXP,
            multiplier,
            totalXP,
            streak: this.state.currentStreak,
            timestamp: Date.now()
        };

        eventBus.emit(EventType.DECISION_CORRECT, {
            xp: totalXP,
            streak: this.state.currentStreak,
            multiplier,
            combo: this.getComboName()
        }, 'XPEngine');

        eventBus.emit(EventType.XP_EARNED, {
            amount: totalXP,
            source: 'TRAINING_CORRECT',
            multiplier
        }, 'XPEngine');

        if (this.state.comboLevel > this.previousComboLevel) {
            eventBus.emit(EventType.COMBO_LEVEL_UP, {
                newLevel: this.getComboName(),
                streak: this.state.currentStreak
            }, 'XPEngine');
        }

        if (STREAK_MILESTONES.includes(this.state.currentStreak)) {
            this.awardStreakMilestone(this.state.currentStreak);
        }

        this.notify(event);
        return event;
    }

    recordIncorrect(context = {}) {
        const lostStreak = this.state.currentStreak;
        this.state.currentStreak = 0;
        this.state.comboLevel = 0;
        this.state.incorrectCount++;

        const event = {
            type: 'INCORRECT',
            baseXP: 0,
            multiplier: 1,
            totalXP: 0,
            streak: lostStreak,
            timestamp: Date.now(),
            ...context
        };

        eventBus.emit(EventType.DECISION_INCORRECT, { lostStreak, ...context }, 'XPEngine');

        if (lostStreak >= 3) {
            eventBus.emit(EventType.STREAK_LOST, { lostStreak }, 'XPEngine');
        }

        this.notify(event);
        return event;
    }

    awardStreakMilestone(streak) {
        const bonusMap = {
            5: XP_BASE.STREAK_5,
            10: XP_BASE.STREAK_10,
            25: XP_BASE.STREAK_25,
            50: XP_BASE.STREAK_50,
            100: XP_BASE.STREAK_100
        };
        const bonus = bonusMap[streak] || 0;

        if (bonus > 0) {
            this.state.sessionXP += bonus;
            this.state.totalXP += bonus;

            eventBus.emit(EventType.STREAK_MILESTONE, {
                streak,
                bonusXP: bonus
            }, 'XPEngine');

            eventBus.emit(EventType.XP_BONUS, {
                amount: bonus,
                reason: `${streak} STREAK!`
            }, 'XPEngine');
        }
    }

    getState() {
        return { ...this.state };
    }

    getComboName() {
        return COMBO_NAMES[this.state.comboLevel] || 'NORMAL';
    }

    getMultiplier() {
        return STREAK_MULTIPLIER(this.state.currentStreak);
    }

    getAccuracy() {
        const total = this.state.correctCount + this.state.incorrectCount;
        if (total === 0) return 0;
        return Math.round((this.state.correctCount / total) * 100);
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify(event) {
        this.listeners.forEach(l => l(this.state, event));
    }

    resetSession() {
        this.state.sessionXP = 0;
        this.state.currentStreak = 0;
        this.state.maxStreak = 0;
        this.state.correctCount = 0;
        this.state.incorrectCount = 0;
        this.state.comboLevel = 0;
        this.previousComboLevel = 0;
        eventBus.emit(EventType.SESSION_START, {}, 'XPEngine');
    }

    endSession() {
        eventBus.emit(EventType.SESSION_END, {
            accuracy: this.getAccuracy(),
            totalXP: this.state.sessionXP,
            maxStreak: this.state.maxStreak,
            handsPlayed: this.state.correctCount + this.state.incorrectCount
        }, 'XPEngine');
    }
}

export const xpEngine = new XPEngine();
export default XPEngine;
