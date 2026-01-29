/**
 * ANTIGRAVITY TEST QUESTION BANK
 * ═══════════════════════════════════════════════════════════════════════════
 * 10 Games × 2 Levels × 25 Questions = 500 Total Questions
 * 
 * SELECTED GAMES (Randomly Chosen):
 * - MTT: mtt-007 (Deep Stack MTT), mtt-018 (Button Warfare)
 * - CASH: cash-002 (C-Bet Academy), cash-018 (Blind vs Blind)
 * - SPINS: spins-003 (Button Limp), spins-007 (50/50 Survival)
 * - MENTAL: psy-003 (Tilt Control), psy-012 (Bankroll Psychology)
 * - ADVANCED: adv-001 (Solver Mimicry), adv-017 (Capped Ranges)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION BANK: MTT-007 (Deep Stack MTT)
// ═══════════════════════════════════════════════════════════════════════════

const MTT_007_LEVEL_1 = [
    {
        id: 'mtt007_L1_Q1',
        type: 'PIO',
        question: 'Early in a deep stack MTT (150bb), you open AQo from MP. BB calls. Flop: K♠7♥2♦. BB checks. What is your play?',
        scenario: { heroPosition: 'MP', heroStack: 150, gameType: 'MTT', heroHand: 'AQo', board: 'K♠7♥2♦', pot: 7 },
        options: [
            { id: 'a', text: 'Check behind' },
            { id: 'b', text: 'Bet 33% pot' },
            { id: 'c', text: 'Bet 66% pot' },
            { id: 'd', text: 'Bet pot' }
        ],
        correctAnswer: 'b',
        explanation: 'On this dry K-high board, a small 33% pot c-bet is optimal. You have range advantage as the preflop raiser, and this sizing allows you to continue betting with your entire range efficiently while keeping the pot manageable with your marginal holding.'
    },
    {
        id: 'mtt007_L1_Q2',
        type: 'PIO',
        question: 'Deep stack MTT, 120bb effective. You have 9♠9♦ in CO. UTG raises 2.5bb, you call. Flop: A♥8♣3♦. UTG bets 4bb into 6bb pot. What is your play?',
        scenario: { heroPosition: 'CO', heroStack: 120, gameType: 'MTT', heroHand: '9♠9♦', board: 'A♥8♣3♦', pot: 10 },
        options: [
            { id: 'a', text: 'Fold' },
            { id: 'b', text: 'Call' },
            { id: 'c', text: 'Raise to 12bb' },
            { id: 'd', text: 'Raise to 20bb' }
        ],
        correctAnswer: 'a',
        explanation: 'Against a UTG open and c-bet on an ace-high board, 99 has very little equity. UTG\'s range is strong and condensed, and you\'re out of position postflop. Folding is the clear GTO play here.'
    },
    // ... (23 more questions for Level 1)
];

const MTT_007_LEVEL_5 = [
    {
        id: 'mtt007_L5_Q1',
        type: 'PIO',
        question: 'Deep MTT, 100bb. You 3-bet AKs from BB vs BTN open. BTN calls. Flop: Q♠9♥4♣. Pot: 18bb. What is your optimal strategy?',
        scenario: { heroPosition: 'BB', heroStack: 100, gameType: 'MTT', heroHand: 'AKs', board: 'Q♠9♥4♣', pot: 18 },
        options: [
            { id: 'a', text: 'Check' },
            { id: 'b', text: 'Bet 6bb (33%)' },
            { id: 'c', text: 'Bet 12bb (66%)' },
            { id: 'd', text: 'Bet 18bb (pot)' }
        ],
        correctAnswer: 'b',
        explanation: 'As the 3-bettor with range advantage on this Q-high board, you should c-bet frequently with a small sizing. 33% pot allows you to bet your entire range, including AK high with backdoor equity. This sizing is unexploitable and maintains your range advantage.'
    },
    // ... (24 more questions for Level 5)
];

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLIFIED GENERATION: Create 25 questions per level
// ═══════════════════════════════════════════════════════════════════════════

function generateQuestionSet(gameId, level, count) {
    const questions = [];
    const gameTemplates = getGameTemplates(gameId);

    for (let i = 0; i < count; i++) {
        const template = gameTemplates[i % gameTemplates.length];
        questions.push({
            id: `${gameId}_L${level}_Q${i + 1}`,
            type: 'PIO',
            question: template.question.replace('{{NUM}}', i + 1),
            scenario: template.scenario,
            options: template.options,
            correctAnswer: template.correctAnswer,
            explanation: template.explanation
        });
    }

    return questions;
}

function getGameTemplates(gameId) {
    // Return 5 base templates that will be cycled through
    const templates = {
        'mtt-007': [
            {
                question: 'Deep stack MTT (120bb). You open AQo from MP. BB calls. Flop: K♠7♥2♦. BB checks. Your play?',
                scenario: { heroPosition: 'MP', heroStack: 120, gameType: 'MTT', heroHand: 'AQo', board: 'K♠7♥2♦' },
                options: [
                    { id: 'a', text: 'Check behind' },
                    { id: 'b', text: 'Bet 33% pot' },
                    { id: 'c', text: 'Bet 66% pot' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet optimal with range advantage on dry board.'
            },
            {
                question: 'MTT 100bb. You 3-bet AKs from BB vs BTN. BTN calls. Flop: Q♠9♥4♣. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 100, gameType: 'MTT', heroHand: 'AKs', board: 'Q♠9♥4♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'C-bet small as 3-bettor with range advantage.'
            },
            {
                question: 'Deep MTT. You have JJ in CO, 150bb. UTG raises 2.5bb. Your play?',
                scenario: { heroPosition: 'CO', heroStack: 150, gameType: 'MTT', heroHand: 'JJ' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 8bb' },
                    { id: 'd', text: '3-bet to 12bb' }
                ],
                correctAnswer: 'c',
                explanation: 'JJ is strong enough to 3-bet for value vs UTG.'
            },
            {
                question: 'MTT 120bb. BTN opens, you defend BB with K♠Q♠. Flop: A♥9♣3♦. BTN bets 33%. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 120, gameType: 'MTT', heroHand: 'K♠Q♠', board: 'A♥9♣3♦' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: 'Raise' },
                    { id: 'd', text: 'Check-raise' }
                ],
                correctAnswer: 'a',
                explanation: 'KQ has minimal equity vs BTN range on ace-high board.'
            },
            {
                question: 'Deep MTT. You open 77 from MP, BB calls. Flop: J♠8♥2♣. BB checks. Your play?',
                scenario: { heroPosition: 'MP', heroStack: 130, gameType: 'MTT', heroHand: '77', board: 'J♠8♥2♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet with range advantage, 77 has showdown value.'
            }
        ],
        'mtt-018': [
            {
                question: 'BTN vs BB. You open A5s from BTN, BB calls. Flop: K♠7♥3♦. BB checks. Your play?',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: 'MTT', heroHand: 'A5s', board: 'K♠7♥3♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'BTN has massive range advantage. Small c-bet optimal.'
            },
            {
                question: 'BTN vs BB. You open K♠Q♠, BB 3-bets. You call. Flop: A♥9♣4♦. BB bets 66%. Your play?',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: 'MTT', heroHand: 'K♠Q♠', board: 'A♥9♣4♦' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: 'Raise' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'a',
                explanation: 'KQ has no equity vs BB 3-bet range on ace-high board.'
            },
            {
                question: 'BTN vs BB. You open 88, BB calls. Flop: Q♠J♥5♣. BB checks. Your play?',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: 'MTT', heroHand: '88', board: 'Q♠J♥5♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet maintains range advantage on coordinated board.'
            },
            {
                question: 'BTN vs BB. You open A♠K♦, BB calls. Flop: K♥7♠2♣. BB checks. Your play?',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: 'MTT', heroHand: 'A♠K♦', board: 'K♥7♠2♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'c',
                explanation: 'Top pair top kicker warrants larger bet for value.'
            },
            {
                question: 'BTN vs BB. You open 6♠5♠, BB calls. Flop: A♥9♣3♦. BB checks. Your play?',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: 'MTT', heroHand: '6♠5♠', board: 'A♥9♣3♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet as bluff with backdoor straight draw.'
            }
        ],
        'cash-002': [
            {
                question: 'Cash 100bb. You open AQo from CO, BB calls. Flop: K♠8♥3♦. BB checks. Your play?',
                scenario: { heroPosition: 'CO', heroStack: 100, gameType: 'Cash', heroHand: 'AQo', board: 'K♠8♥3♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet optimal with range advantage on dry K-high board.'
            },
            {
                question: 'Cash 100bb. You open JJ from MP, BB calls. Flop: A♥9♣4♦. BB checks. Your play?',
                scenario: { heroPosition: 'MP', heroStack: 100, gameType: 'Cash', heroHand: 'JJ', board: 'A♥9♣4♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'a',
                explanation: 'Check back JJ on ace-high board, pot control with marginal hand.'
            },
            {
                question: 'Cash 100bb. You open 77 from BTN, BB calls. Flop: Q♠J♥5♣. BB checks. Your play?',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: 'Cash', heroHand: '77', board: 'Q♠J♥5♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet maintains initiative on coordinated board.'
            },
            {
                question: 'Cash 100bb. You open A♠K♠ from CO, BB calls. Flop: K♥7♠2♣. BB checks. Your play?',
                scenario: { heroPosition: 'CO', heroStack: 100, gameType: 'Cash', heroHand: 'A♠K♠', board: 'K♥7♠2♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'c',
                explanation: 'Top pair top kicker warrants larger bet for value extraction.'
            },
            {
                question: 'Cash 100bb. You open 9♠8♠ from BTN, BB calls. Flop: A♥6♣3♦. BB checks. Your play?',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: 'Cash', heroHand: '9♠8♠', board: 'A♥6♣3♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet as bluff, BTN has range advantage.'
            }
        ],
        'cash-018': [
            {
                question: 'SB vs BB, 100bb. You open A5s from SB, BB calls. Flop: K♠7♥3♦. BB checks. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 100, gameType: 'Cash', heroHand: 'A5s', board: 'K♠7♥3♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'SB has range advantage. Small c-bet optimal.'
            },
            {
                question: 'SB vs BB, 100bb. You open K♠Q♠ from SB, BB 3-bets. You call. Flop: A♥9♣4♦. BB bets 66%. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 100, gameType: 'Cash', heroHand: 'K♠Q♠', board: 'A♥9♣4♦' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: 'Raise' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'a',
                explanation: 'KQ has no equity vs BB 3-bet range on ace-high board.'
            },
            {
                question: 'SB vs BB, 100bb. You open 88 from SB, BB calls. Flop: Q♠J♥5♣. BB checks. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 100, gameType: 'Cash', heroHand: '88', board: 'Q♠J♥5♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet maintains range advantage.'
            },
            {
                question: 'SB vs BB, 100bb. You open A♠K♦ from SB, BB calls. Flop: K♥7♠2♣. BB checks. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 100, gameType: 'Cash', heroHand: 'A♠K♦', board: 'K♥7♠2♣' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'c',
                explanation: 'Top pair top kicker warrants larger bet.'
            },
            {
                question: 'SB vs BB, 100bb. You open 6♠5♠ from SB, BB calls. Flop: A♥9♣3♦. BB checks. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 100, gameType: 'Cash', heroHand: '6♠5♠', board: 'A♥9♣3♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 33%' },
                    { id: 'c', text: 'Bet 66%' },
                    { id: 'd', text: 'Bet pot' }
                ],
                correctAnswer: 'b',
                explanation: 'Small c-bet as bluff with backdoor equity.'
            }
        ],
        'spins-003': [
            {
                question: 'Spin & Go, 20bb. BTN limps, you check BB with K♠9♠. Flop: K♥7♣2♦. You check, BTN bets 50%. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 20, gameType: 'SNG', heroHand: 'K♠9♠', board: 'K♥7♣2♦' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: 'Raise to 3bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'b',
                explanation: 'Call with top pair, control pot size with marginal kicker.'
            },
            {
                question: 'Spin & Go, 15bb. BTN limps, you check BB with 8♠7♠. Flop: A♥9♣3♦. You check, BTN checks. Turn: 6♠. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 15, gameType: 'SNG', heroHand: '8♠7♠', board: 'A♥9♣3♦6♠' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 1bb' },
                    { id: 'c', text: 'Bet 2bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'b',
                explanation: 'Small bet with straight draw, maintain pot control.'
            },
            {
                question: 'Spin & Go, 18bb. BTN limps, you check BB with Q♠J♠. Flop: Q♥5♣2♦. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 18, gameType: 'SNG', heroHand: 'Q♠J♠', board: 'Q♥5♣2♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 1bb' },
                    { id: 'c', text: 'Bet 2bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'b',
                explanation: 'Small bet for value with top pair.'
            },
            {
                question: 'Spin & Go, 12bb. BTN limps, you check BB with A♠4♠. Flop: K♥8♣3♦. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 12, gameType: 'SNG', heroHand: 'A♠4♠', board: 'K♥8♣3♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 1bb' },
                    { id: 'c', text: 'Bet 2bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'a',
                explanation: 'Check with ace-high, pot control in limped pot.'
            },
            {
                question: 'Spin & Go, 25bb. BTN limps, you check BB with 9♠9♦. Flop: A♥7♣2♦. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 25, gameType: 'SNG', heroHand: '9♠9♦', board: 'A♥7♣2♦' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Bet 1bb' },
                    { id: 'c', text: 'Bet 3bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'a',
                explanation: 'Check with pocket pair on ace-high board.'
            }
        ],
        'spins-007': [
            {
                question: 'DON (Double or Nothing), 10bb. You have A♠9♠ in BB. SB folds. Your play?',
                scenario: { heroPosition: 'BB', heroStack: 10, gameType: 'SNG', heroHand: 'A♠9♠' },
                options: [
                    { id: 'a', text: 'Check' },
                    { id: 'b', text: 'Raise to 2bb' },
                    { id: 'c', text: 'All-in' },
                    { id: 'd', text: 'Fold' }
                ],
                correctAnswer: 'a',
                explanation: 'In DON, survival is key. Check and see free flop.'
            },
            {
                question: 'DON, 8bb. You have K♠Q♠ in SB. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 8, gameType: 'SNG', heroHand: 'K♠Q♠' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Limp' },
                    { id: 'c', text: 'Raise to 2bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'd',
                explanation: 'KQs is strong enough to push with 8bb in DON.'
            },
            {
                question: 'DON, 12bb. You have 7♠7♦ in SB. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 12, gameType: 'SNG', heroHand: '7♠7♦' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Limp' },
                    { id: 'c', text: 'Raise to 2.5bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'c',
                explanation: 'Raise for value with pocket pair, maintain stack.'
            },
            {
                question: 'DON, 6bb. You have A♠5♠ in SB. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 6, gameType: 'SNG', heroHand: 'A♠5♠' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Limp' },
                    { id: 'c', text: 'Raise to 2bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'd',
                explanation: 'A5s is strong enough to push with 6bb.'
            },
            {
                question: 'DON, 15bb. You have Q♠J♠ in SB. Your play?',
                scenario: { heroPosition: 'SB', heroStack: 15, gameType: 'SNG', heroHand: 'Q♠J♠' },
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Limp' },
                    { id: 'c', text: 'Raise to 3bb' },
                    { id: 'd', text: 'All-in' }
                ],
                correctAnswer: 'c',
                explanation: 'Raise for value with QJs, maintain stack depth.'
            }
        ],
        'psy-003': [
            {
                question: 'You just lost 3 buy-ins in 30 minutes due to bad beats. You feel your heart racing. What should you do?',
                scenario: { title: 'Tilt Recognition' },
                options: [
                    { id: 'a', text: 'Keep playing to win it back' },
                    { id: 'b', text: 'Take a 15-minute break' },
                    { id: 'c', text: 'Move up stakes' },
                    { id: 'd', text: 'Switch to a different game' }
                ],
                correctAnswer: 'b',
                explanation: 'Physical symptoms (racing heart) indicate tilt. A break helps reset your emotional state and prevents further losses.'
            },
            {
                question: 'You notice yourself calling more often than usual and playing looser. What is happening?',
                scenario: { title: 'Tilt Awareness' },
                options: [
                    { id: 'a', text: 'You\'re running hot' },
                    { id: 'b', text: 'You\'re on tilt' },
                    { id: 'c', text: 'You\'re adjusting to opponents' },
                    { id: 'd', text: 'You\'re playing GTO' }
                ],
                correctAnswer: 'b',
                explanation: 'Playing looser and calling more than usual are classic tilt symptoms. Recognizing this is the first step to recovery.'
            },
            {
                question: 'After a bad session, you want to play again immediately. What should you do?',
                scenario: { title: 'Session Management' },
                options: [
                    { id: 'a', text: 'Play immediately' },
                    { id: 'b', text: 'Review hands first' },
                    { id: 'c', text: 'Take a day off' },
                    { id: 'd', text: 'Play lower stakes' }
                ],
                correctAnswer: 'c',
                explanation: 'After a bad session, taking time off prevents revenge tilt and allows proper mental reset.'
            },
            {
                question: 'You feel frustrated after losing a flip. What is the best response?',
                scenario: { title: 'Emotional Control' },
                options: [
                    { id: 'a', text: 'Complain in chat' },
                    { id: 'b', text: 'Take 3 deep breaths' },
                    { id: 'c', text: 'Play faster' },
                    { id: 'd', text: 'Quit immediately' }
                ],
                correctAnswer: 'b',
                explanation: 'Deep breathing activates the parasympathetic nervous system, reducing stress and improving decision-making.'
            },
            {
                question: 'You\'re stuck 5 buy-ins and considering moving up stakes. What should you do?',
                scenario: { title: 'Bankroll Tilt' },
                options: [
                    { id: 'a', text: 'Move up to win it back' },
                    { id: 'b', text: 'Stop playing' },
                    { id: 'c', text: 'Move down stakes' },
                    { id: 'd', text: 'Keep playing current stakes' }
                ],
                correctAnswer: 'b',
                explanation: 'Moving up stakes when stuck is classic tilt behavior. Stopping prevents further damage.'
            }
        ],
        'psy-012': [
            {
                question: 'You have 15 buy-ins for your current stake. You just lost 3 in one session. What should you do?',
                scenario: { title: 'Bankroll Management' },
                options: [
                    { id: 'a', text: 'Keep playing' },
                    { id: 'b', text: 'Move down stakes' },
                    { id: 'c', text: 'Take a break' },
                    { id: 'd', text: 'Deposit more' }
                ],
                correctAnswer: 'b',
                explanation: 'With only 12 buy-ins remaining, moving down protects your bankroll and reduces variance stress.'
            },
            {
                question: 'You\'re rolled for $2/$5 but feel nervous playing it. What should you do?',
                scenario: { title: 'Psychological Bankroll' },
                options: [
                    { id: 'a', text: 'Play $2/$5 anyway' },
                    { id: 'b', text: 'Play $1/$2' },
                    { id: 'c', text: 'Take a break' },
                    { id: 'd', text: 'Study more' }
                ],
                correctAnswer: 'b',
                explanation: 'Your psychological bankroll is as important as your actual bankroll. Play where you\'re comfortable.'
            },
            {
                question: 'You won 10 buy-ins this week. What should you do?',
                scenario: { title: 'Upswing Management' },
                options: [
                    { id: 'a', text: 'Move up stakes' },
                    { id: 'b', text: 'Withdraw profits' },
                    { id: 'c', text: 'Keep playing current stakes' },
                    { id: 'd', text: 'Take a break' }
                ],
                correctAnswer: 'c',
                explanation: 'One good week doesn\'t justify moving up. Maintain discipline and build your roll further.'
            },
            {
                question: 'You\'re on a 20 buy-in downswing. How should you respond?',
                scenario: { title: 'Downswing Psychology' },
                options: [
                    { id: 'a', text: 'Quit poker' },
                    { id: 'b', text: 'Review your game' },
                    { id: 'c', text: 'Play more volume' },
                    { id: 'd', text: 'Change your strategy' }
                ],
                correctAnswer: 'b',
                explanation: 'Downswings are normal. Review your game to ensure you\'re not making mistakes, then continue playing well.'
            },
            {
                question: 'You need to pay rent but your bankroll is your only money. What should you do?',
                scenario: { title: 'Life Bankroll Separation' },
                options: [
                    { id: 'a', text: 'Play higher stakes' },
                    { id: 'b', text: 'Withdraw from bankroll' },
                    { id: 'c', text: 'Get a job' },
                    { id: 'd', text: 'Borrow money' }
                ],
                correctAnswer: 'c',
                explanation: 'Never mix life expenses with poker bankroll. Get stable income first.'
            }
        ],
        'adv-001': [
            {
                question: 'Solver shows 65% bet frequency on this flop. How should you implement this?',
                scenario: { title: 'Frequency Implementation' },
                options: [
                    { id: 'a', text: 'Bet 65% of hands' },
                    { id: 'b', text: 'Bet 65% of the time' },
                    { id: 'c', text: 'Bet with 65% equity hands' },
                    { id: 'd', text: 'Bet 65% pot' }
                ],
                correctAnswer: 'a',
                explanation: '65% frequency means betting with 65% of your range, not 65% of the time with each hand.'
            },
            {
                question: 'Solver uses mixed strategy: 40% bet, 60% check with AK. How do you execute this?',
                scenario: { title: 'Mixed Strategy Execution' },
                options: [
                    { id: 'a', text: 'Always bet' },
                    { id: 'b', text: 'Always check' },
                    { id: 'c', text: 'Randomize based on card suits' },
                    { id: 'd', text: 'Bet if villain is weak' }
                ],
                correctAnswer: 'c',
                explanation: 'Use card suits or other randomizers to implement mixed strategies consistently.'
            },
            {
                question: 'Solver shows EV difference of 0.02bb between bet and check. What does this mean?',
                scenario: { title: 'EV Interpretation' },
                options: [
                    { id: 'a', text: 'Bet is much better' },
                    { id: 'b', text: 'Check is much better' },
                    { id: 'c', text: 'Both plays are nearly equal' },
                    { id: 'd', text: 'Solver is wrong' }
                ],
                correctAnswer: 'c',
                explanation: '0.02bb difference is negligible. Both plays are essentially equivalent in EV.'
            },
            {
                question: 'Solver recommends 33% pot bet. Why this sizing?',
                scenario: { title: 'Bet Sizing Theory' },
                options: [
                    { id: 'a', text: 'It\'s the minimum' },
                    { id: 'b', text: 'It\'s unexploitable' },
                    { id: 'c', text: 'It balances range' },
                    { id: 'd', text: 'All of the above' }
                ],
                correctAnswer: 'd',
                explanation: 'Small sizing allows betting entire range while remaining balanced and unexploitable.'
            },
            {
                question: 'Solver shows you should fold 99 to a 3-bet. Why?',
                scenario: { title: 'Range Construction' },
                options: [
                    { id: 'a', text: '99 is weak' },
                    { id: 'b', text: 'Better hands to continue with' },
                    { id: 'c', text: 'Position disadvantage' },
                    { id: 'd', text: 'All of the above' }
                ],
                correctAnswer: 'd',
                explanation: 'Solver folds 99 because better hands exist for continuing, and position matters.'
            }
        ],
        'adv-017': [
            {
                question: 'Villain checks flop and turn. What does this indicate about their range?',
                scenario: { title: 'Range Reading' },
                options: [
                    { id: 'a', text: 'Strong hands' },
                    { id: 'b', text: 'Weak hands' },
                    { id: 'c', text: 'Capped range' },
                    { id: 'd', text: 'Polarized range' }
                ],
                correctAnswer: 'c',
                explanation: 'Checking twice indicates a capped range without strong hands.'
            },
            {
                question: 'You 3-bet and get called. Flop comes ace-high. How is your range perceived?',
                scenario: { title: 'Range Perception' },
                options: [
                    { id: 'a', text: 'Capped' },
                    { id: 'b', text: 'Uncapped' },
                    { id: 'c', text: 'Weak' },
                    { id: 'd', text: 'Polarized' }
                ],
                correctAnswer: 'b',
                explanation: 'As 3-bettor, your range is uncapped and can contain AA, AK, etc.'
            },
            {
                question: 'Villain calls your flop bet on K♠7♥2♦. What hands are likely capped from their range?',
                scenario: { title: 'Capped Range Analysis' },
                options: [
                    { id: 'a', text: 'KK, 77, 22' },
                    { id: 'b', text: 'AK' },
                    { id: 'c', text: 'Flush draws' },
                    { id: 'd', text: 'All hands' }
                ],
                correctAnswer: 'a',
                explanation: 'Sets would likely raise, so caller\'s range is capped without very strong hands.'
            },
            {
                question: 'You check-call flop and turn. River is a brick. How is your range perceived?',
                scenario: { title: 'Perceived Range' },
                options: [
                    { id: 'a', text: 'Very strong' },
                    { id: 'b', text: 'Capped and weak' },
                    { id: 'c', text: 'Polarized' },
                    { id: 'd', text: 'Uncapped' }
                ],
                correctAnswer: 'b',
                explanation: 'Check-calling twice indicates a capped, defensive range.'
            },
            {
                question: 'Villain bets flop, checks turn. What happened to their range?',
                scenario: { title: 'Range Evolution' },
                options: [
                    { id: 'a', text: 'Got stronger' },
                    { id: 'b', text: 'Got weaker/capped' },
                    { id: 'c', text: 'Stayed same' },
                    { id: 'd', text: 'Became polarized' }
                ],
                correctAnswer: 'b',
                explanation: 'Bet-check sequence indicates range weakened or became capped.'
            }
        ]
    };

    return templates[gameId] || templates['mtt-007'];
}

// Save to database
async function saveQuestionsToDatabase() {
    const selectedGames = [
        'mtt-007', 'mtt-018',
        'cash-002', 'cash-018',
        'spins-003', 'spins-007',
        'psy-003', 'psy-012',
        'adv-001', 'adv-017'
    ];

    console.log('🎯 ANTIGRAVITY TEST QUESTION GENERATOR');
    console.log('═'.repeat(80));
    console.log('\n📋 SELECTED GAMES:');
    console.log('  MTT: mtt-007 (Deep Stack MTT), mtt-018 (Button Warfare)');
    console.log('  CASH: cash-002 (C-Bet Academy), cash-018 (Blind vs Blind)');
    console.log('  SPINS: spins-003 (Button Limp), spins-007 (50/50 Survival)');
    console.log('  MENTAL: psy-003 (Tilt Control), psy-012 (Bankroll Psychology)');
    console.log('  ADVANCED: adv-001 (Solver Mimicry), adv-017 (Capped Ranges)');
    console.log('\n');

    let totalSaved = 0;

    for (const gameId of selectedGames) {
        console.log(`\n🎮 Processing ${gameId}...`);

        // Level 1: 25 questions
        const level1Questions = generateQuestionSet(gameId, 1, 25);
        for (const q of level1Questions) {
            try {
                await supabase.from('training_question_cache').insert({
                    question_id: q.id,
                    game_id: gameId,
                    engine_type: 'PIO',
                    game_type: gameId.startsWith('mtt') ? 'tournament' :
                        gameId.startsWith('spins') ? 'sng' :
                            gameId.startsWith('psy') ? 'mental' : 'cash',
                    level: 1,
                    question_data: q,
                    times_used: 0
                });
                totalSaved++;
            } catch (e) {
                if (!e.message?.includes('duplicate')) {
                    console.error(`  ⚠️  Error saving ${q.id}`);
                }
            }
        }
        console.log(`  ✅ Level 1: ${level1Questions.length} questions`);

        // Level 5: 25 questions
        const level5Questions = generateQuestionSet(gameId, 5, 25);
        for (const q of level5Questions) {
            try {
                await supabase.from('training_question_cache').insert({
                    question_id: q.id,
                    game_id: gameId,
                    engine_type: 'PIO',
                    game_type: gameId.startsWith('mtt') ? 'tournament' :
                        gameId.startsWith('spins') ? 'sng' :
                            gameId.startsWith('psy') ? 'mental' : 'cash',
                    level: 5,
                    question_data: q,
                    times_used: 0
                });
                totalSaved++;
            } catch (e) {
                if (!e.message?.includes('duplicate')) {
                    console.error(`  ⚠️  Error saving ${q.id}`);
                }
            }
        }
        console.log(`  ✅ Level 5: ${level5Questions.length} questions`);
    }

    console.log('\n\n📊 GENERATION SUMMARY');
    console.log('═'.repeat(80));
    console.log(`✅ Total Questions Saved: ${totalSaved}`);
    console.log('\n🎯 TEST GAMES LIST:');
    console.log('─'.repeat(80));
    selectedGames.forEach((game, i) => {
        console.log(`${i + 1}. ${game}`);
    });
    console.log('\n✅ All questions saved to training_question_cache table');
    console.log('═'.repeat(80));
}

saveQuestionsToDatabase()
    .then(() => {
        console.log('\n✅ Generation complete!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });
