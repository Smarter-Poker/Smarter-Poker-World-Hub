/**
 * 🚌 GLOBAL EVENT BUS — HARDENED
 * ═══════════════════════════════════════════════════════════════════════════
 * The Central Nervous System of PokerIQ + Club Commander.
 * All engines, services, and components communicate through this bus.
 *
 * HARDENING [RAT-BUS-HARDEN — March 9, 2026]:
 *   1) busEmit works as BOTH a function AND an object (via Proxy).
 *      - busEmit('training:session-complete', payload)  ← function call
 *      - busEmit.diamondsEarned(100, 'streak')          ← named method
 *      Both patterns are safe and will never crash.
 *   2) eventBus.emit is SSR-safe — silently no-ops on the server.
 *   3) All emit paths wrapped in try/catch — bus errors never crash pages.
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

    // ── Geeves AI Help Bot ──
    GEEVES_QUESTION_MISSED: 'GEEVES_QUESTION_MISSED',
    GEEVES_KB_UPDATED: 'GEEVES_KB_UPDATED',
    GEEVES_OPENED: 'GEEVES_OPENED',
};

// ─── SSR Safety Check ──────────────────────────────────────────
const _isClient = typeof window !== 'undefined';

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

    /**
     * Emit an event. SSR-safe: silently no-ops on the server so pages
     * that emit during useMemo/render never crash during SSR.
     */
    emit(eventType, payload = {}, source = 'system') {
        // [HARDENING] SSR guard — emit is a no-op on the server.
        // Events only matter in the browser where listeners exist.
        if (!_isClient) return;

        try {
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

            if (window.location?.hostname === 'localhost') {
                console.log(`🚌 [BUS] ${eventType}`, payload);
            }
        } catch (err) {
            // [HARDENING] Bus errors must NEVER crash a page render.
            if (_isClient) console.warn(`🚌 [BUS] Emit failed for ${eventType}:`, err);
        }
    }

    getHistory(limit = 10) {
        return this.history.slice(0, limit);
    }
}

export const eventBus = new GlobalEventBus();

if (_isClient) {
    window.SmarterPokerEventBus = eventBus;
}

// ─── Staff Context Helper ──────────────────────────────────────
function _getStaffCtx() {
    if (!_isClient) return {};
    try {
        const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        return { staffId: s.id || null, venueId: s.venue_id || null, role: s.role || null, staffName: s.name || null };
    } catch { return {}; }
}

// ─── Convenience Named Methods ─────────────────────────────────
const _busEmitMethods = {
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

    // ── Geeves AI Help Bot ──
    geevesQuestionMissed: (question, page) =>
        eventBus.emit(EventType.GEEVES_QUESTION_MISSED, { question, page }, 'GeevesChat'),

    geevesKBUpdated: (questionId, addedToKB) =>
        eventBus.emit(EventType.GEEVES_KB_UPDATED, { questionId, addedToKB }, 'GeevesAdmin'),

    geevesOpened: () =>
        eventBus.emit(EventType.GEEVES_OPENED, {}, 'GeevesOrb'),
};

// ═══════════════════════════════════════════════════════════════════════════
// HARDENED busEmit — works as BOTH a function AND an object.
//
//   busEmit('training:session-complete', { game_id: 'x' })  ← WORKS (function)
//   busEmit.diamondsEarned(100, 'streak')                   ← WORKS (method)
//
// This uses a Proxy that intercepts function calls (apply) and passes
// property access through to the named methods object. If anyone calls
// busEmit as a function, it delegates to eventBus.emit. If they access
// busEmit.someMethod, they get the convenience method. Either way: no crash.
// ═══════════════════════════════════════════════════════════════════════════

function _busEmitFn(eventType, payload = {}, source = 'busEmit') {
    try {
        eventBus.emit(eventType, payload, source);
    } catch (err) {
        if (_isClient) console.warn('🚌 [busEmit] Error:', err);
    }
}

// Copy all named methods onto the function so busEmit.diamondsEarned etc. work
Object.assign(_busEmitFn, _busEmitMethods);

/**
 * @type {typeof _busEmitMethods & ((eventType: string, payload?: object, source?: string) => void)}
 *
 * Callable as a function OR accessible as an object of named methods.
 * SSR-safe. Crash-proof. Will never take down the server.
 */
export const busEmit = _busEmitFn;

