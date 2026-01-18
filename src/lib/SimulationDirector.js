/**
 * 🎬 SIMULATION DIRECTOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Auto-play engine that reads action logs and animates poker sequences.
 * Handles timing, visual callbacks, and hero handoff.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Play through an action log with visual callbacks
 * @param {Array} actionLog - Array of action objects
 * @param {Object} callbacks - Visual callback functions
 * @param {Function} onComplete - Called when sequence finishes
 */
export function playActionLog(actionLog, callbacks, onComplete) {
    let currentTime = 0;
    const timeouts = [];

    actionLog.forEach((action) => {
        currentTime += action.delay;

        const timeout = setTimeout(() => {
            executeAction(action, callbacks);
        }, currentTime);

        timeouts.push(timeout);
    });

    // Hero handoff after all actions complete
    const finalTimeout = setTimeout(() => {
        if (callbacks.onHeroTurn) {
            callbacks.onHeroTurn();
        }
        if (onComplete) {
            onComplete();
        }
    }, currentTime + 500);

    timeouts.push(finalTimeout);

    // Return cleanup function
    return () => {
        timeouts.forEach(t => clearTimeout(t));
    };
}

/**
 * Execute a single action with visual callback
 */
function executeAction(action, callbacks) {
    switch (action.type) {
        case 'deal':
            if (callbacks.onDeal) {
                callbacks.onDeal(action.playerId);
            }
            break;

        case 'blind':
            if (callbacks.onBlind) {
                callbacks.onBlind(action.playerId, action.amount, action.label);
            }
            break;

        case 'bet':
            if (callbacks.onBet) {
                callbacks.onBet(action.playerId, action.amount, action.label);
            }
            break;

        case 'fold':
            if (callbacks.onFold) {
                callbacks.onFold(action.playerId);
            }
            break;

        case 'check':
            if (callbacks.onCheck) {
                callbacks.onCheck(action.playerId);
            }
            break;

        default:
            console.warn('Unknown action type:', action.type);
    }
}

/**
 * Get chip color class based on amount
 */
export function getChipColor(amount) {
    if (amount >= 5000) return 'chip-teal';
    if (amount >= 1000) return 'chip-blue';
    if (amount >= 500) return 'chip-pink';
    if (amount >= 100) return 'chip-black';
    if (amount >= 25) return 'chip-green';
    return 'chip-green';
}

/**
 * Format chip label
 */
export function formatChipLabel(amount) {
    if (amount >= 1) {
        return `${amount.toFixed(1)} BB`;
    }
    return `${amount.toFixed(1)} BB`;
}

/**
 * Calculate cumulative delay up to a specific action index
 */
export function getCumulativeDelay(actionLog, upToIndex) {
    return actionLog
        .slice(0, upToIndex + 1)
        .reduce((sum, action) => sum + action.delay, 0);
}

/**
 * Pause/Resume simulation
 */
export class SimulationController {
    constructor() {
        this.timeouts = [];
        this.isPaused = false;
        this.pausedAt = 0;
        this.startTime = 0;
    }

    start(actionLog, callbacks, onComplete) {
        this.startTime = Date.now();
        this.cleanup = playActionLog(actionLog, callbacks, onComplete);
    }

    pause() {
        if (!this.isPaused) {
            this.isPaused = true;
            this.pausedAt = Date.now() - this.startTime;
            if (this.cleanup) {
                this.cleanup();
            }
        }
    }

    resume(actionLog, callbacks, onComplete) {
        if (this.isPaused) {
            this.isPaused = false;
            // Resume from paused position
            const remainingLog = actionLog.map(action => ({
                ...action,
                delay: Math.max(0, action.delay - this.pausedAt)
            }));
            this.cleanup = playActionLog(remainingLog, callbacks, onComplete);
        }
    }

    stop() {
        if (this.cleanup) {
            this.cleanup();
        }
        this.isPaused = false;
        this.pausedAt = 0;
    }
}
