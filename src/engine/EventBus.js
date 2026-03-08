/**
 * 🚌 GLOBAL EVENT BUS
 * ═══════════════════════════════════════════════════════════════════════════
 * The Central Nervous System of PokerIQ + Club Commander.
 * All engines, services, and components communicate through this bus.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const EventType = {
    // ── Training / GTO ──
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

    // ── Commander Operations ──
    WAITLIST_PLAYER_ADDED: 'WAITLIST_PLAYER_ADDED',
    WAITLIST_PLAYER_CALLED: 'WAITLIST_PLAYER_CALLED',
    WAITLIST_PLAYER_SEATED: 'WAITLIST_PLAYER_SEATED',
    TABLE_OPENED: 'TABLE_OPENED',
    TABLE_CLOSED: 'TABLE_CLOSED',
    STAFF_CLOCKED_IN: 'STAFF_CLOCKED_IN',
    STAFF_CLOCKED_OUT: 'STAFF_CLOCKED_OUT',
    COMP_ISSUED: 'COMP_ISSUED',
    INCIDENT_REPORTED: 'INCIDENT_REPORTED',
    TOURNAMENT_STARTED: 'TOURNAMENT_STARTED',
    TOURNAMENT_LEVEL_CHANGE: 'TOURNAMENT_LEVEL_CHANGE',
    DATA_MUTATED: 'DATA_MUTATED',
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

// ─── Staff Context Helper ──────────────────────────────────────
// Reads staff session from localStorage once per emit for payload enrichment.
function _getStaffCtx() {
    if (typeof window === 'undefined') return {};
    try {
        const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        return { staffId: s.id || null, venueId: s.venue_id || null, role: s.role || null, staffName: s.name || null };
    } catch { return {}; }
}

// Convenience emit functions
export const busEmit = {
    // ── Training / GTO ──
    diamondsEarned: (amount, reason) =>
        eventBus.emit(EventType.DIAMONDS_EARNED, { amount, reason }, 'DiamondEngine'),

    diamondsSpent: (amount, reason) =>
        eventBus.emit(EventType.DIAMONDS_SPENT, { amount, reason }, 'DiamondEngine'),

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
        eventBus.emit(EventType.TIMER_EXPIRED, {}, 'PressureTimer'),

    sessionStart: (source = 'FlowState') =>
        eventBus.emit(EventType.SESSION_START, { ..._getStaffCtx() }, source),

    sessionEnd: (source = 'FlowState') =>
        eventBus.emit(EventType.SESSION_END, { ..._getStaffCtx() }, source),

    // ── Commander Operations ──
    waitlistPlayerAdded: (playerName, gameType) =>
        eventBus.emit(EventType.WAITLIST_PLAYER_ADDED, { playerName, gameType, ..._getStaffCtx() }, 'WaitlistDesk'),

    waitlistPlayerCalled: (playerName, gameType) =>
        eventBus.emit(EventType.WAITLIST_PLAYER_CALLED, { playerName, gameType, ..._getStaffCtx() }, 'WaitlistDesk'),

    waitlistPlayerSeated: (playerName, tableNumber, seatNumber) =>
        eventBus.emit(EventType.WAITLIST_PLAYER_SEATED, { playerName, tableNumber, seatNumber, ..._getStaffCtx() }, 'WaitlistDesk'),

    tableOpened: (tableNumber, gameType) =>
        eventBus.emit(EventType.TABLE_OPENED, { tableNumber, gameType, ..._getStaffCtx() }, 'FloorManager'),

    tableClosed: (tableNumber) =>
        eventBus.emit(EventType.TABLE_CLOSED, { tableNumber, ..._getStaffCtx() }, 'FloorManager'),

    staffClockedIn: (staffName) =>
        eventBus.emit(EventType.STAFF_CLOCKED_IN, { staffName, ..._getStaffCtx() }, 'TimeClock'),

    staffClockedOut: (staffName) =>
        eventBus.emit(EventType.STAFF_CLOCKED_OUT, { staffName, ..._getStaffCtx() }, 'TimeClock'),

    compIssued: (memberName, amount, category) =>
        eventBus.emit(EventType.COMP_ISSUED, { memberName, amount, category, ..._getStaffCtx() }, 'CompSystem'),

    incidentReported: (type, severity) =>
        eventBus.emit(EventType.INCIDENT_REPORTED, { type, severity, ..._getStaffCtx() }, 'IncidentManager'),

    tournamentStarted: (tournamentName, entryCount) =>
        eventBus.emit(EventType.TOURNAMENT_STARTED, { tournamentName, entryCount, ..._getStaffCtx() }, 'TournamentDirector'),

    tournamentLevelChange: (level, blinds) =>
        eventBus.emit(EventType.TOURNAMENT_LEVEL_CHANGE, { level, blinds, ..._getStaffCtx() }, 'TournamentDirector'),

    dataMutated: (entity) =>
        eventBus.emit(EventType.DATA_MUTATED, { entity, ..._getStaffCtx() }, 'DataSync'),
};

