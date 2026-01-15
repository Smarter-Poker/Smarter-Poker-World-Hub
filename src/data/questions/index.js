/**
 * 🎮 TRAINING QUESTIONS INDEX — Master Database for All 100 Games
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Imports and re-exports all question databases
 * Used by the play page to load questions dynamically based on gameId
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { MTT_QUESTIONS_PART1 } from './MTT_QUESTIONS_PART1';
import { CASH_QUESTIONS } from './CASH_QUESTIONS';
import { PSYCHOLOGY_QUESTIONS } from './PSYCHOLOGY_QUESTIONS';

// Consolidated question database
export const QUESTIONS_DATABASE = {
    // MTT Games
    ...MTT_QUESTIONS_PART1,

    // Cash Games
    ...CASH_QUESTIONS,

    // Psychology Games
    ...PSYCHOLOGY_QUESTIONS,
};

/**
 * Get questions for a specific game
 * @param {string} gameId - The game ID (e.g., 'mtt-1', 'cash-1')
 * @returns {Array} Array of 20 questions for the game
 */
export function getQuestionsForGame(gameId) {
    // Direct match
    if (QUESTIONS_DATABASE[gameId]) {
        return QUESTIONS_DATABASE[gameId];
    }

    // Fallback: Generate placeholder questions for games not yet seeded
    return generatePlaceholderQuestions(gameId);
}

/**
 * Generate placeholder questions for unseeded games
 * These use generic GTO scenarios until specific ones are added
 */
function generatePlaceholderQuestions(gameId) {
    const baseQuestions = [
        {
            id: 1,
            title: 'Preflop Decision',
            situation: 'UTG opens 2.5x. You have A♠K♦ on BTN. What\'s your play?',
            heroCards: ['As', 'Kd'],
            board: [],
            options: [
                { id: 'fold', text: 'FOLD', ev: -1.0 },
                { id: 'call', text: 'CALL', ev: 0.4 },
                { id: '3bet', text: '3-BET', ev: 1.2, isCorrect: true },
            ],
            explanation: 'AKo is a premium hand that should 3-bet for value.',
        },
        {
            id: 2,
            title: 'C-Bet Spot',
            situation: 'You raised preflop with Q♠Q♦. Flop: K♣7♥2♠. Action?',
            heroCards: ['Qs', 'Qd'],
            board: ['Kc', '7h', '2s'],
            options: [
                { id: 'check', text: 'CHECK', ev: 0.5, isCorrect: true },
                { id: 'bet-33', text: 'BET 33%', ev: 0.3 },
                { id: 'bet-75', text: 'BET 75%', ev: -0.2 },
            ],
            explanation: 'Underpair to board prefers checking to control pot.',
        },
        {
            id: 3,
            title: 'Value Bet River',
            situation: 'River: A♠K♣8♦3♥2♣. You have A♦K♥. Pot is 15BB.',
            heroCards: ['Ad', 'Kh'],
            board: ['As', 'Kc', '8d', '3h', '2c'],
            options: [
                { id: 'check', text: 'CHECK', ev: 0.8 },
                { id: 'bet-50', text: 'BET 50%', ev: 1.4, isCorrect: true },
                { id: 'bet-100', text: 'BET 100%', ev: 1.1 },
            ],
            explanation: 'Top two pair is strong. Value bet river.',
        },
        {
            id: 4,
            title: 'Bluff Spot',
            situation: 'River: Q♠J♠8♦4♥2♣. You have 7♣6♣ (missed draw). Pot 20BB.',
            heroCards: ['7c', '6c'],
            board: ['Qs', 'Js', '8d', '4h', '2c'],
            options: [
                { id: 'give-up', text: 'CHECK/FOLD', ev: 0.0, isCorrect: true },
                { id: 'bluff', text: 'BET 75%', ev: -0.3 },
            ],
            explanation: 'No blockers to value hands. Poor bluff candidate.',
        },
        {
            id: 5,
            title: 'Pot Control',
            situation: 'Turn: T♠9♣5♦K♥. You have T♦T♣ (top set). SPR 4.',
            heroCards: ['Td', 'Tc'],
            board: ['Ts', '9c', '5d', 'Kh'],
            options: [
                { id: 'check', text: 'CHECK', ev: 0.8 },
                { id: 'bet-50', text: 'BET 50%', ev: 1.6, isCorrect: true },
            ],
            explanation: 'Top set wants to build pot. Bet for value.',
        },
        {
            id: 6,
            title: 'Fold Equity',
            situation: 'You have 15BB. Folds to you in CO with K♠J♠.',
            heroCards: ['Ks', 'Js'],
            board: [],
            options: [
                { id: 'fold', text: 'FOLD', ev: -0.2 },
                { id: 'open', text: 'OPEN 2.2x', ev: 0.5 },
                { id: 'shove', text: 'ALL-IN', ev: 0.8, isCorrect: true },
            ],
            explanation: 'At 15BB, KJs has good shove equity from CO.',
        },
        {
            id: 7,
            title: 'Calling Range',
            situation: 'BB vs BTN open. You have 9♠8♠. BTN opens 2.5x.',
            heroCards: ['9s', '8s'],
            board: [],
            options: [
                { id: 'fold', text: 'FOLD', ev: 0.0 },
                { id: 'call', text: 'CALL', ev: 0.4, isCorrect: true },
                { id: '3bet', text: '3-BET', ev: 0.2 },
            ],
            explanation: '98s is a profitable defend vs BTN.',
        },
        {
            id: 8,
            title: 'Set Mining',
            situation: 'UTG opens 2.5x. You have 5♠5♦ in MP. 100BB deep.',
            heroCards: ['5s', '5d'],
            board: [],
            options: [
                { id: 'fold', text: 'FOLD', ev: 0.0 },
                { id: 'call', text: 'CALL', ev: 0.3, isCorrect: true },
            ],
            explanation: 'Small pairs set mine profitably at 100BB.',
        },
        {
            id: 9,
            title: 'Turn Decision',
            situation: 'Flop bet called. Turn: 2♥. Board: A♠K♣7♦2♥. You have K♦Q♠.',
            heroCards: ['Kd', 'Qs'],
            board: ['As', 'Kc', '7d', '2h'],
            options: [
                { id: 'check', text: 'CHECK', ev: 0.4, isCorrect: true },
                { id: 'bet', text: 'BET 66%', ev: 0.2 },
            ],
            explanation: 'Second pair on Ace-high board prefers pot control.',
        },
        {
            id: 10,
            title: 'River Bluff',
            situation: 'River: 4♠7♣9♦J♥K♠. You have A♦3♦. Pot 25BB.',
            heroCards: ['Ad', '3d'],
            board: ['4s', '7c', '9d', 'Jh', 'Ks'],
            options: [
                { id: 'give-up', text: 'CHECK', ev: 0.0 },
                { id: 'bluff', text: 'BET 75%', ev: 0.5, isCorrect: true },
            ],
            explanation: 'A-high loses at showdown. Bluff with no SDV.',
        },
        {
            id: 11,
            title: 'Multi-way Pot',
            situation: '3-way flop: A♣J♠4♦. You have A♠T♠ in MP.',
            heroCards: ['As', 'Ts'],
            board: ['Ac', 'Js', '4d'],
            options: [
                { id: 'check', text: 'CHECK', ev: 0.6, isCorrect: true },
                { id: 'bet', text: 'BET 33%', ev: 0.4 },
            ],
            explanation: 'Multi-way with second pair. Check to see turn.',
        },
        {
            id: 12,
            title: 'Squeeze Play',
            situation: 'UTG opens, BTN calls. You have A♣J♣ in BB.',
            heroCards: ['Ac', 'Jc'],
            board: [],
            options: [
                { id: 'fold', text: 'FOLD', ev: 0.0 },
                { id: 'call', text: 'CALL', ev: 0.3 },
                { id: 'squeeze', text: 'SQUEEZE', ev: 0.7, isCorrect: true },
            ],
            explanation: 'AJc is a good squeeze with dead money.',
        },
        {
            id: 13,
            title: 'Check-Raise',
            situation: 'Flop: 8♠7♠4♣. You have 6♠5♠ in BB. BTN bets 1/3.',
            heroCards: ['6s', '5s'],
            board: ['8s', '7s', '4c'],
            options: [
                { id: 'fold', text: 'FOLD', ev: -0.5 },
                { id: 'call', text: 'CALL', ev: 0.8 },
                { id: 'raise', text: 'CHECK-RAISE', ev: 1.4, isCorrect: true },
            ],
            explanation: 'Monster draw. Build pot with X/R.',
        },
        {
            id: 14,
            title: 'Thin Value',
            situation: 'River: Q♠9♣5♦2♥3♠. You have Q♦J♣. Pot 12BB.',
            heroCards: ['Qd', 'Jc'],
            board: ['Qs', '9c', '5d', '2h', '3s'],
            options: [
                { id: 'check', text: 'CHECK', ev: 0.4 },
                { id: 'bet-40', text: 'BET 40%', ev: 0.8, isCorrect: true },
            ],
            explanation: 'Top pair is thin value but worth betting.',
        },
        {
            id: 15,
            title: 'Overbet',
            situation: 'River: K♠K♣7♦4♥2♠. You have K♦Q♠.',
            heroCards: ['Kd', 'Qs'],
            board: ['Ks', 'Kc', '7d', '4h', '2s'],
            options: [
                { id: 'bet-50', text: 'BET 50%', ev: 1.2 },
                { id: 'overbet', text: 'OVERBET 150%', ev: 2.0, isCorrect: true },
            ],
            explanation: 'Quads! Overbet to max value from boats.',
        },
        {
            id: 16,
            title: 'Trap Line',
            situation: 'Flop: A♠A♣3♦. You have A♦K♠. What\'s your line?',
            heroCards: ['Ad', 'Ks'],
            board: ['As', 'Ac', '3d'],
            options: [
                { id: 'bet', text: 'BET 33%', ev: 0.8 },
                { id: 'check', text: 'CHECK', ev: 1.2, isCorrect: true },
            ],
            explanation: 'Trips on dry board. Trap to get action.',
        },
        {
            id: 17,
            title: 'Float Play',
            situation: 'CO opens, you call BTN with K♦J♠. Flop: A♠8♣4♦. CO bets 1/3.',
            heroCards: ['Kd', 'Js'],
            board: ['As', '8c', '4d'],
            options: [
                { id: 'fold', text: 'FOLD', ev: 0.0 },
                { id: 'call', text: 'CALL', ev: 0.3, isCorrect: true },
            ],
            explanation: 'Two overs + position. Float and take away.',
        },
        {
            id: 18,
            title: 'Donk Bet',
            situation: 'You called 3-bet OOP with 7♠7♣. Flop: 7♦3♣2♠.',
            heroCards: ['7s', '7c'],
            board: ['7d', '3c', '2s'],
            options: [
                { id: 'check', text: 'CHECK', ev: 1.0 },
                { id: 'donk', text: 'DONK 33%', ev: 1.4, isCorrect: true },
            ],
            explanation: 'Bottom set on dry board. Donk protects range.',
        },
        {
            id: 19,
            title: 'Delayed C-Bet',
            situation: 'You checked flop IP with A♦K♦. Turn: 2♣. Board: Q♠8♦4♥2♣.',
            heroCards: ['Ad', 'Kd'],
            board: ['Qs', '8d', '4h', '2c'],
            options: [
                { id: 'check', text: 'CHECK', ev: 0.2 },
                { id: 'bet', text: 'BET 50%', ev: 0.6, isCorrect: true },
            ],
            explanation: 'Take stab on blank turn after passive flop.',
        },
        {
            id: 20,
            title: 'Final Decision',
            situation: 'All-in for tournament life. You have J♠J♦ vs ??? on A♠K♣2♦.',
            heroCards: ['Js', 'Jd'],
            board: ['As', 'Kc', '2d'],
            options: [
                { id: 'hope', text: 'HOPE THEY HAVE QJ', ev: 0.0, isCorrect: true },
            ],
            explanation: 'Already committed. Pray for miracle.',
        },
    ];

    // Return the base questions (in production, each game would have unique questions)
    return baseQuestions;
}

/**
 * Get random question from game
 */
export function getRandomQuestion(gameId) {
    const questions = getQuestionsForGame(gameId);
    return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * Get question by ID
 */
export function getQuestionById(gameId, questionId) {
    const questions = getQuestionsForGame(gameId);
    return questions.find(q => q.id === questionId);
}

/**
 * Count total questions in database
 */
export function getTotalQuestionCount() {
    let count = 0;
    Object.values(QUESTIONS_DATABASE).forEach(questions => {
        count += questions.length;
    });
    return count;
}

export default QUESTIONS_DATABASE;
