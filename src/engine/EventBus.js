/**
 * 🚌 GLOBAL EVENT BUS
 * ═══════════════════════════════════════════════════════════════════════════
 * The Central Nervous System of PokerIQ Training.
 * All engines, services, and components communicate through this bus.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const EventType = {
    STREAK_MILESTONE: 'STREAK_MILESTONE',
    STREAK_LOST: 'STREAK_LOST',
    COMBO_LEVEL_UP: 'COMBO_LEVEL_UP',
    DIAMONDS_EARNED: 'DIAMONDS_EARNED',
    DIAMONDS_SPENT: 'DIAMONDS_SPENT',
    DECISION_CORRECT: 'DECISION_CORRECT',
    DECISION_INCORRECT: 'DECISION_INCORRECT',
    HAND_COMPLETE: 'HAND_COMPLETE',
    SESSION_START: 'SESSION_START',
    SESSION_END: 'SESSION_END',
    LEVEL_UNLOCKED: 'LEVEL_UNLOCKED',
    MASTERY_ACHIEVED: 'MASTERY_ACHIEVED',
    TIMER_WARNING: 'TIMER_WARNING',
    TIMER_CRITICAL: 'TIMER_CRITICAL',
    TIMER_EXPIRED: 'TIMER_EXPIRED',
    SCREEN_SHAKE: 'SCREEN_SHAKE',
    SCREEN_FLASH: 'SCREEN_FLASH',
    CELEBRATION: 'CELEBRATION',
    SOUND_PLAY: 'SOUND_PLAY',
};

class GlobalEventBus {
    constructor() {
        this.listeners = new Map();
        this.history = [];
    }

    on(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);

        return () => {
            this.listeners.get(eventType)?.delete(callback);
        };
    }

    emit(eventType, payload = {}, source = 'system') {
        const event = {
            type: eventType,
            payload,
            timestamp: Date.now(),
            source
        };

        this.history.unshift(event);
        if (this.history.length > 100) {
            this.history.pop();
        }

        const callbacks = this.listeners.get(eventType);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(event);
                } catch (error) {
                    console.error(`Event bus error for ${eventType}:`, error);
                }
            });
        }

        if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
            console.log(`🚌 [BUS] ${eventType}`, payload);
        }
    }

    getHistory(limit = 10) {
        return this.history.slice(0, limit);
    }
}

export const eventBus = new GlobalEventBus();

// Convenience emit functions
export const busEmit = {
    diamondsEarned: (amount, reason) =>
        eventBus.emit(EventType.DIAMONDS_EARNED, { amount, reason }, 'DiamondEngine'),

    decisionCorrect: (streak) =>
        eventBus.emit(EventType.DECISION_CORRECT, { streak }, 'TrainingArena'),

    decisionIncorrect: (lostStreak) =>
        eventBus.emit(EventType.DECISION_INCORRECT, { lostStreak }, 'TrainingArena'),

    screenShake: (intensity = 'medium') =>
        eventBus.emit(EventType.SCREEN_SHAKE, { intensity }, 'Effects'),

    screenFlash: (color, duration = 200) =>
        eventBus.emit(EventType.SCREEN_FLASH, { color, duration }, 'Effects'),

    celebration: (type) =>
        eventBus.emit(EventType.CELEBRATION, { type }, 'Celebration'),

    timerWarning: () =>
        eventBus.emit(EventType.TIMER_WARNING, {}, 'PressureTimer'),

    timerCritical: () =>
        eventBus.emit(EventType.TIMER_CRITICAL, {}, 'PressureTimer'),

    timerExpired: () =>
        eventBus.emit(EventType.TIMER_EXPIRED, {}, 'PressureTimer')
};
