/**
 * 💎 POWER-UP SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * Diamond-purchasable power-ups for training games.
 * Each power-up has a cost, effect, and single-use-per-game constraint.
 *
 * Available Power-Ups:
 *   STREAK_FREEZE  — Saves one life (Speed Drill) or undoes one mistake
 *   TIME_BOOST     — Adds +10 seconds (Pressure Cooker)
 *   HINT_REVEAL    — Shows a hint for the current hand (any game)
 *   DOUBLE_POINTS  — Next correct answer worth 2x points (any game)
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const POWER_UPS = {
    STREAK_FREEZE: {
        id: 'STREAK_FREEZE',
        name: 'Streak Freeze',
        icon: '🛡️',
        description: 'Saves one life or undoes your next mistake',
        cost: 25,
        color: '#00D4FF',
        maxPerGame: 1,
    },
    TIME_BOOST: {
        id: 'TIME_BOOST',
        name: 'Time Boost',
        icon: '⏱️',
        description: 'Adds +10 seconds to the clock',
        cost: 15,
        color: '#ff6b00',
        maxPerGame: 2,
    },
    HINT_REVEAL: {
        id: 'HINT_REVEAL',
        name: 'Hint',
        icon: '💡',
        description: 'Eliminates one wrong answer',
        cost: 20,
        color: '#FFD700',
        maxPerGame: 1,
    },
    DOUBLE_POINTS: {
        id: 'DOUBLE_POINTS',
        name: 'Double Points',
        icon: '✨',
        description: 'Next correct answer is worth 2x points',
        cost: 30,
        color: '#A78BFA',
        maxPerGame: 1,
    },
};

/**
 * Get available power-ups for a game mode
 */
export function getGamePowerUps(gameMode) {
    switch (gameMode) {
        case 'speed-drill':
            return [POWER_UPS.STREAK_FREEZE, POWER_UPS.HINT_REVEAL, POWER_UPS.DOUBLE_POINTS];
        case 'pressure-cooker':
            return [POWER_UPS.TIME_BOOST, POWER_UPS.STREAK_FREEZE, POWER_UPS.HINT_REVEAL];
        case 'pattern-recognition':
            return [POWER_UPS.HINT_REVEAL, POWER_UPS.DOUBLE_POINTS];
        case 'mixed-strategy':
            return [POWER_UPS.HINT_REVEAL, POWER_UPS.DOUBLE_POINTS];
        case 'spot-trainer':
            return [POWER_UPS.HINT_REVEAL, POWER_UPS.STREAK_FREEZE];
        case 'tournament':
            return [POWER_UPS.STREAK_FREEZE, POWER_UPS.HINT_REVEAL];
        default:
            return [POWER_UPS.STREAK_FREEZE, POWER_UPS.HINT_REVEAL];
    }
}

/**
 * Purchase a power-up using DiamondEngine
 * Returns true if purchase succeeded
 */
export function purchasePowerUp(powerUp, DiamondEngine) {
    if (!DiamondEngine) return false;
    const balance = DiamondEngine.getBalance();
    if (balance < powerUp.cost) return false;
    DiamondEngine.deduct(powerUp.cost, `Power-up: ${powerUp.name}`);
    return true;
}
