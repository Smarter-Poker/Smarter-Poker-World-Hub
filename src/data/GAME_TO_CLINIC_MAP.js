/**
 * 🗺️ GAME-TO-CLINIC ROUTING MAP
 * ═══════════════════════════════════════════════════════════════════════════
 * Maps TRAINING_LIBRARY game IDs to TRAINING_CLINICS clinic IDs
 * 
 * This allows games to keep their original names and images while
 * routing to the appropriate clinic data for the UniversalTrainingTable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const GAME_TO_CLINIC_MAP = {
    // MTT Games → Clinic 13 (Tournament World)
    'mtt-001': 'clinic-13',
    'mtt-002': 'clinic-13',
    'mtt-003': 'clinic-13',
    'mtt-004': 'clinic-13',
    'mtt-005': 'clinic-13',

    // Cash Games → Clinic 22 (Deep Stack Strategy)
    'cash-001': 'clinic-22',
    'cash-002': 'clinic-22',
    'cash-003': 'clinic-22',
    'cash-004': 'clinic-22',
    'cash-005': 'clinic-22',

    // Spins/SNGs → Clinic 21 (Short Stack Ninja)
    'spins-001': 'clinic-21',
    'spins-002': 'clinic-21',
    'spins-003': 'clinic-21',
    'spins-004': 'clinic-21',
    'spins-005': 'clinic-21',

    // Psychology Games → Clinic 07 (The Cooler Cage)
    'psychology-001': 'clinic-07',
    'psychology-002': 'clinic-07',
    'psychology-003': 'clinic-07',

    // Advanced Games → Clinic 09 (Context Switcher)
    'advanced-001': 'clinic-09',
    'advanced-002': 'clinic-09',
    'advanced-003': 'clinic-09',

    // GTO Fundamentals → Clinic 01-04 (Defense Clinics)
    'gto-fundamentals-001': 'clinic-01',
    'gto-fundamentals-002': 'clinic-02',
    'gto-fundamentals-003': 'clinic-03',
    'gto-fundamentals-004': 'clinic-04',

    // Exploitative → Clinic 10 (Exploitative Deviation)
    'exploitative-001': 'clinic-10',
    'exploitative-002': 'clinic-10',
    'exploitative-003': 'clinic-10',

    // Math → Clinic 12 (Asymmetric Stack)
    'math-001': 'clinic-12',
    'math-002': 'clinic-12',
    'math-003': 'clinic-12',
};

/**
 * Get clinic ID for a given game ID
 * @param {string} gameId - The game ID from TRAINING_LIBRARY
 * @returns {string|null} - The clinic ID from TRAINING_CLINICS, or null if not found
 */
export function getClinicIdForGame(gameId) {
    return GAME_TO_CLINIC_MAP[gameId] || null;
}

/**
 * Check if a game ID has a clinic mapping
 * @param {string} gameId - The game ID to check
 * @returns {boolean}
 */
export function hasClinicMapping(gameId) {
    return gameId in GAME_TO_CLINIC_MAP;
}
