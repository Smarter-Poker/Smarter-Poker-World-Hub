/**
 * 🕵️ LEAK SIGNAL ANALYZER
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes player mistakes in real-time to detect underlying strategic leaks.
 * 
 * Logic:
 * 1. Listens to DECISION_INCORRECT events
 * 2. Classifies the error type (e.g. "Calling when should Raise" = Passive)
 * 3. Tracks frequency in a rolling window
 * 4. Emits LEAK_DETECTED if threshold is breeched
 * 5. Persists to Supabase and pushes to Jarvis PA
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { eventBus, EventType } from './EventBus';
import { leakService } from '../services/LeakService';

export const LEAK_TYPES = {
    PASSIVE_PLAY: {
        id: 'PASSIVE_PLAY',
        name: 'Passive Play',
        description: 'You are calling when you should be raising. You are missing value and fold equity.',
        drill: 'aggression-basics'
    },
    OVER_FOLDING: {
        id: 'OVER_FOLDING',
        name: 'Over Folding',
        description: 'You are folding too much. Opponents can exploit this with any two cards.',
        drill: 'defense-frequency'
    },
    CALLING_STATION: {
        id: 'CALLING_STATION',
        name: 'Calling Station',
        description: 'You are calling when you should fold. You are paying off value bets too lightly.',
        drill: 'discipline-folds'
    },
    MANIAC_AGGRESSION: {
        id: 'MANIAC_AGGRESSION',
        name: 'Unwarranted Aggression',
        description: 'You are raising when you should be checking or calling. You are over-bluffing.',
        drill: 'value-betting'
    }
};

class LeakSignalAnalyzer {
    constructor() {
        this.mistakeHistory = []; // { type, timestamp }
        this.WINDOW_SIZE = 20; // Check last 20 mistakes
        this.THRESHOLD = 3; // 3 of same type triggers leak

        this.activeLeaks = new Set(); // IDs of currently active leaks
        this.userId = null; // Set by the game component
    }

    /**
     * Set the current user ID for Supabase persistence
     */
    setUserId(userId) {
        this.userId = userId;
    }

    start() {
        // Listen to events
        eventBus.on(EventType.DECISION_INCORRECT, (payload) => this.handleIncorrectDecision(payload));
        console.log('🕵️ Leak Signal Analyzer: Online');
    }

    handleIncorrectDecision(payload) {
        // We expect payload to containing detailed decision info
        // Note: The UI must pass this info to the EventBus!
        const { userAction, bestAction, scenario } = payload;

        if (!userAction || !bestAction) return;

        const leakType = this.classifyMistake(userAction, bestAction);

        if (leakType) {
            this.recordMistake(leakType);
            this.checkForLeaks(leakType, scenario);
        }
    }

    classifyMistake(user, ideal) {
        // user = 'call', ideal = 'raise' -> PASSIVE
        // user = 'fold', ideal = 'call'/'raise' -> OVER_FOLDING
        // user = 'call', ideal = 'fold' -> CALLING_STATION
        // user = 'raise', ideal = 'call'/'fold' -> MANIAC

        const u = user.toLowerCase();
        const i = ideal.toLowerCase();

        if (u === 'call' && i === 'raise') return LEAK_TYPES.PASSIVE_PLAY;
        if (u === 'fold' && (i === 'call' || i === 'raise')) return LEAK_TYPES.OVER_FOLDING;
        if (u === 'call' && i === 'fold') return LEAK_TYPES.CALLING_STATION;
        if (u === 'raise' && (i === 'call' || i === 'fold')) return LEAK_TYPES.MANIAC_AGGRESSION;

        return null;
    }

    recordMistake(leakType) {
        this.mistakeHistory.push({
            type: leakType.id,
            timestamp: Date.now()
        });

        // Keep history trimmed
        if (this.mistakeHistory.length > this.WINDOW_SIZE) {
            this.mistakeHistory.shift();
        }
    }

    checkForLeaks(lastLeakType, scenario = null) {
        const typeId = lastLeakType.id;

        // Count occurrences in window
        const count = this.mistakeHistory.filter(m => m.type === typeId).length;

        if (count >= this.THRESHOLD) {
            // Leak Detected!
            if (!this.activeLeaks.has(typeId)) {
                this.triggerLeakSignal(lastLeakType, count, scenario);
                this.activeLeaks.add(typeId);

                // Reset this leak type in history to avoid spamming
                this.mistakeHistory = this.mistakeHistory.filter(m => m.type !== typeId);
            }
        }
    }

    async triggerLeakSignal(leakType, count, scenario = null) {
        console.log(`🚨 LEAK DETECTED: ${leakType.name} (${count} times)`);

        // Emit event for UI to show modal/toast
        eventBus.emit('LEAK_DETECTED', {
            leak: leakType,
            count: count,
            timestamp: Date.now()
        }, 'LeakSignalAnalyzer');

        // Persist to Supabase and push to Jarvis if user is authenticated
        if (this.userId) {
            try {
                const context = {
                    count,
                    scenario: scenario?.title || null,
                    timestamp: Date.now()
                };

                // Record the leak to Supabase
                const leak = await leakService.recordLeak(this.userId, leakType, context);

                // Push notification to Jarvis PA
                if (leak) {
                    await leakService.pushToJarvis(this.userId, leakType, leak.id);
                }
            } catch (err) {
                console.error('[LeakSignalAnalyzer] Failed to persist leak:', err);
            }
        }
    }

    reset() {
        this.mistakeHistory = [];
        this.activeLeaks.clear();
    }
}

export const leakAnalyzer = new LeakSignalAnalyzer();
export default leakAnalyzer;
