/**
 * ❓ TRAINING QUESTIONS LIBRARY
 * Database of 20 seeded questions for ALL 100 games.
 */

// Helper to generate consistent pseudo-random questions for games we are autofilling
// to ensure the user has content to play immediately.
const generateQuestions = (gameId, category, count = 20) => {
    return Array.from({ length: count }).map((_, i) => ({
        id: `${gameId}-q${i + 1}`,
        scenario: `Level ${i + 1} Scenario for ${gameId}`,
        potSize: 12 + i,
        board: ['As', 'Kd', '7h'], // Placeholder board
        heroHand: ['Ah', 'Kh'],    // Placeholder hand
        action: 'Hero is BTN. CO opens 2.5bb. Hero?',
        options: [
            { id: 'fold', text: 'Fold', correct: false },
            { id: 'call', text: 'Call', correct: false },
            { id: 'raise', text: 'Raise to 8bb', correct: true },
            { id: 'shove', text: 'All-In', correct: false }
        ],
        explanation: `This is a standard value 3-bet configuration for ${category} strategy in this specific spot.`,
        difficulty: Math.min(5, Math.floor(i / 4) + 1)
    }));
};

// Start with empty library
const LIBRARY = {};

// ═══════════════════════════════════════════════════════════════════════════
// POPULATE LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

// MTT GAMES (mtt-001 to mtt-025)
for (let i = 1; i <= 25; i++) {
    const id = `mtt-${String(i).padStart(3, '0')}`;
    LIBRARY[id] = generateQuestions(id, 'MTT Tournament');
}

// CASH GAMES (cash-001 to cash-025)
for (let i = 1; i <= 25; i++) {
    const id = `cash-${String(i).padStart(3, '0')}`;
    LIBRARY[id] = generateQuestions(id, 'Cash Game');
}

// SPINS (spins-001 to spins-010)
for (let i = 1; i <= 10; i++) {
    const id = `spins-${String(i).padStart(3, '0')}`;
    LIBRARY[id] = generateQuestions(id, 'Spins/Jackpot');
}

// PSYCHOLOGY (psy-001 to psy-020)
for (let i = 1; i <= 20; i++) {
    const id = `psy-${String(i).padStart(3, '0')}`;
    // Custom structure for psych questions
    LIBRARY[id] = Array.from({ length: 20 }).map((_, q) => ({
        id: `${id}-q${q + 1}`,
        scenario: `Mental Game Situation #${q + 1}`,
        board: [], // No board often for psych
        heroHand: [],
        action: 'After losing a 80/20 pot for your tournament life, you feel heat rising. What is the best immediate response?',
        options: [
            { id: 'A', text: 'Scream into a pillow', correct: false },
            { id: 'B', text: 'Take a deep breath and reset', correct: true },
            { id: 'C', text: 'Check the lobby for the next tourney instantly', correct: false },
            { id: 'D', text: 'Complaint in chat', correct: false }
        ],
        explanation: 'Resetting your physiological state is the first priority to prevent tilt carryover.',
        difficulty: Math.min(5, Math.floor(q / 4) + 1)
    }));
}

// ADVANCED (adv-001 to adv-020)
for (let i = 1; i <= 20; i++) {
    const id = `adv-${String(i).padStart(3, '0')}`;
    LIBRARY[id] = generateQuestions(id, 'GTO Solver Theory');
}

export const QUESTIONS_LIBRARY = LIBRARY;

export const getQuestionsForGame = (gameId) => {
    return QUESTIONS_LIBRARY[gameId] || [];
};

export default QUESTIONS_LIBRARY;
