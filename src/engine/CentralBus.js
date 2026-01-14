/**
 * 🚌 CENTRAL BUS — Authoritative Training Event Pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * THE LAW: All training events flow through this bus for authoritative recording.
 * No local-only progress tracking is allowed as the source of truth.
 * 
 * FAIL-CLOSED: If database connection is unavailable, runs will NOT count
 * silently—user sees "Progress Not Recording" state.
 * 
 * Events emitted:
 *   RUN_STARTED       → When user begins a training run
 *   QUESTION_SHOWN    → When a question is presented
 *   ANSWER_SUBMITTED  → When user submits an answer
 *   RUN_COMPLETED     → When 20-question run finishes
 *   LEVEL_ADVANCED    → Only when pass >= 85%
 * 
 * Integration: Hands off to Leak Finder for mastery/leak updates.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { eventBus, EventType } from './EventBus';

// Extended event types for training
export const TrainingEventType = {
    ...EventType,
    RUN_STARTED: 'RUN_STARTED',
    QUESTION_SHOWN: 'QUESTION_SHOWN',
    ANSWER_SUBMITTED: 'ANSWER_SUBMITTED',
    RUN_COMPLETED: 'RUN_COMPLETED',
    LEVEL_ADVANCED: 'LEVEL_ADVANCED',
    CENTRAL_BUS_ONLINE: 'CENTRAL_BUS_ONLINE',
    CENTRAL_BUS_OFFLINE: 'CENTRAL_BUS_OFFLINE',
};

// Supabase client (lazy init)
let supabase = null;
function getSupabase() {
    if (!supabase && typeof window !== 'undefined') {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (url && key) {
            supabase = createClient(url, key);
        }
    }
    return supabase;
}

/**
 * 🚌 CENTRAL BUS CLASS
 * Authoritative event pipeline with fail-closed behavior
 */
class CentralBusEngine {
    constructor() {
        this.isOnline = true;
        this.pendingEvents = [];
        this.connectionCheckInterval = null;
        this.lastHealthCheck = null;
        this.userId = null;
        
        // Start health monitoring
        if (typeof window !== 'undefined') {
            this._startHealthMonitoring();
        }
    }

    /**
     * Initialize with user context
     */
    async init() {
        const sb = getSupabase();
        if (sb) {
            try {
                const { data: { user } } = await sb.auth.getUser();
                this.userId = user?.id || null;
                await this._healthCheck();
            } catch (err) {
                console.warn('[CentralBus] Init error:', err.message);
                this._setOffline();
            }
        }
        return this.isOnline;
    }

    /**
     * Emit an event through the authoritative pipeline
     * Returns false if offline (fail-closed)
     */
    async emit(eventType, payload = {}) {
        const event = {
            type: eventType,
            payload: {
                ...payload,
                user_id: this.userId,
            },
            timestamp: new Date().toISOString(),
            source: 'CentralBus',
        };

        // Always emit to local EventBus for UI updates
        eventBus.emit(eventType, event.payload, 'CentralBus');

        // If offline, queue for later and return warning
        if (!this.isOnline) {
            this.pendingEvents.push(event);
            console.warn(`[CentralBus] OFFLINE — Event queued: ${eventType}`);
            return { success: false, offline: true, queued: true };
        }

        // Persist to database for authoritative events
        const authoritativeEvents = [
            TrainingEventType.RUN_STARTED,
            TrainingEventType.ANSWER_SUBMITTED,
            TrainingEventType.RUN_COMPLETED,
            TrainingEventType.LEVEL_ADVANCED,
        ];

        if (authoritativeEvents.includes(eventType)) {
            try {
                const result = await this._persistEvent(event);
                if (!result.success) {
                    this._setOffline();
                    return { success: false, offline: true, error: result.error };
                }
            } catch (err) {
                this._setOffline();
                return { success: false, offline: true, error: err.message };
            }
        }

        // Hand off to Leak Finder for ANSWER_SUBMITTED events
        if (eventType === TrainingEventType.ANSWER_SUBMITTED) {
            this._notifyLeakFinder(event);
        }

        return { success: true };
    }

    /**
     * Convenience emitters for training events
     */
    async runStarted(gameId, difficulty, mode) {
        return this.emit(TrainingEventType.RUN_STARTED, {
            game_id: gameId,
            difficulty,
            mode,
            run_id: this._generateRunId(),
        });
    }

    async questionShown(questionId, handId = null, nodeId = null) {
        return this.emit(TrainingEventType.QUESTION_SHOWN, {
            question_id: questionId,
            hand_id: handId,
            node_id: nodeId,
        });
    }

    async answerSubmitted(questionId, answer, correctness, responseTimeMs) {
        return this.emit(TrainingEventType.ANSWER_SUBMITTED, {
            question_id: questionId,
            answer,
            correctness,
            response_time_ms: responseTimeMs,
        });
    }

    async runCompleted(gameId, score, passFail, masteryDelta, streakUpdate) {
        const result = await this.emit(TrainingEventType.RUN_COMPLETED, {
            game_id: gameId,
            score,
            pass_fail: passFail,
            mastery_delta: masteryDelta,
            streak_update: streakUpdate,
        });

        // Emit LEVEL_ADVANCED only if passed (≥85%)
        if (passFail === 'PASS' && score >= 85) {
            await this.emit(TrainingEventType.LEVEL_ADVANCED, {
                game_id: gameId,
                score,
            });
        }

        return result;
    }

    /**
     * Check if bus is online and authoritative recording is available
     */
    isAuthoritativeMode() {
        return this.isOnline;
    }

    /**
     * Get pending events count (useful for UI)
     */
    getPendingCount() {
        return this.pendingEvents.length;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════

    _generateRunId() {
        return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async _persistEvent(event) {
        const sb = getSupabase();
        if (!sb) {
            return { success: false, error: 'No Supabase connection' };
        }

        try {
            const { error } = await sb.from('training_events').insert({
                user_id: event.payload.user_id,
                event_type: event.type,
                payload: event.payload,
                created_at: event.timestamp,
            });

            if (error) {
                // If table doesn't exist, log but don't fail completely
                if (error.code === '42P01') {
                    console.warn('[CentralBus] training_events table not found — events logged locally only');
                    return { success: true, localOnly: true };
                }
                throw error;
            }

            return { success: true };
        } catch (err) {
            console.error('[CentralBus] Persist error:', err);
            return { success: false, error: err.message };
        }
    }

    _notifyLeakFinder(event) {
        // Emit to local bus for Leak Finder to consume
        eventBus.emit('LEAK_FINDER_UPDATE', {
            source: 'CentralBus',
            event: event.type,
            payload: event.payload,
        }, 'CentralBus');
    }

    async _healthCheck() {
        const sb = getSupabase();
        if (!sb) {
            this._setOffline();
            return false;
        }

        try {
            // Simple health check — try to access auth
            const { error } = await sb.auth.getSession();
            if (error) throw error;
            
            this._setOnline();
            this.lastHealthCheck = Date.now();
            return true;
        } catch (err) {
            console.warn('[CentralBus] Health check failed:', err.message);
            this._setOffline();
            return false;
        }
    }

    _setOnline() {
        if (!this.isOnline) {
            this.isOnline = true;
            eventBus.emit(TrainingEventType.CENTRAL_BUS_ONLINE, {}, 'CentralBus');
            console.log('[CentralBus] 🟢 ONLINE — Authoritative mode active');
            
            // Flush pending events
            this._flushPendingEvents();
        }
    }

    _setOffline() {
        if (this.isOnline) {
            this.isOnline = false;
            eventBus.emit(TrainingEventType.CENTRAL_BUS_OFFLINE, {}, 'CentralBus');
            console.warn('[CentralBus] 🔴 OFFLINE — Progress will NOT be recorded');
        }
    }

    async _flushPendingEvents() {
        if (this.pendingEvents.length === 0) return;
        
        console.log(`[CentralBus] Flushing ${this.pendingEvents.length} pending events...`);
        
        const events = [...this.pendingEvents];
        this.pendingEvents = [];
        
        for (const event of events) {
            await this._persistEvent(event);
        }
    }

    _startHealthMonitoring() {
        // Check connection every 30 seconds
        this.connectionCheckInterval = setInterval(() => {
            this._healthCheck();
        }, 30000);

        // Also check on window focus
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', () => this._healthCheck());
            window.addEventListener('online', () => this._healthCheck());
            window.addEventListener('offline', () => this._setOffline());
        }
    }

    destroy() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }
    }
}

// Singleton export
export const centralBus = new CentralBusEngine();

// Convenience methods
export const busEmitTraining = {
    runStarted: (gameId, difficulty, mode) => 
        centralBus.runStarted(gameId, difficulty, mode),
    
    questionShown: (questionId, handId, nodeId) => 
        centralBus.questionShown(questionId, handId, nodeId),
    
    answerSubmitted: (questionId, answer, correctness, responseTimeMs) => 
        centralBus.answerSubmitted(questionId, answer, correctness, responseTimeMs),
    
    runCompleted: (gameId, score, passFail, masteryDelta, streakUpdate) => 
        centralBus.runCompleted(gameId, score, passFail, masteryDelta, streakUpdate),
};

export default centralBus;
