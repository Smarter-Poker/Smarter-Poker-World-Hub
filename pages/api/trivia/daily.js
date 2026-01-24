/**
 * DAILY TRIVIA API - Fetch Today's Questions
 * ═══════════════════════════════════════════════════════════════════════════
 * Returns today's AI-generated trivia questions
 * Falls back to generating questions if none exist
 * All dates are in CST (Central Standard Time / America/Chicago)
 * Questions reset at 11:59:59 PM CST daily
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// TIMEZONE HELPER - All trivia dates are in CST
// ═══════════════════════════════════════════════════════════════════════════

function getTodayCST() {
    // Get current date in CST (Central Standard Time / America/Chicago)
    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const year = cstDate.getFullYear();
    const month = String(cstDate.getMonth() + 1).padStart(2, '0');
    const day = String(cstDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK QUESTIONS (Used when database is empty)
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_QUESTIONS = [
    {
        id: 'fb1',
        category: 'poker_history',
        difficulty: 'medium',
        question: 'In what year was the first World Series of Poker Main Event held?',
        options: ['1968', '1970', '1972', '1975'],
        correct_index: 1,
        explanation: 'The first WSOP was held in 1970 at Binion\'s Horseshoe Casino in Las Vegas. Johnny Moss was voted champion by his peers.'
    },
    {
        id: 'fb2',
        category: 'famous_hands',
        difficulty: 'medium',
        question: 'What hand did Chris Moneymaker hold when he won the 2003 WSOP Main Event?',
        options: ['5-4 suited', 'A-K suited', 'Pocket Fives', '7-2 offsuit'],
        correct_index: 2,
        explanation: 'Chris Moneymaker held pocket fives and made a full house to beat Sam Farha\'s top pair, sparking the "poker boom."'
    },
    {
        id: 'fb3',
        category: 'gto_theory',
        difficulty: 'hard',
        question: 'In GTO poker, what is the "Minimum Defense Frequency" concept used for?',
        options: ['Calculating pot odds', 'Determining how often to call to prevent profitable bluffs', 'Sizing your bets', 'Choosing starting hands'],
        correct_index: 1,
        explanation: 'MDF tells you the minimum frequency you must call/continue to prevent your opponent from profitably bluffing with any two cards.'
    },
    {
        id: 'fb4',
        category: 'player_profiles',
        difficulty: 'easy',
        question: 'Which player holds the record for most WSOP bracelets?',
        options: ['Phil Ivey', 'Doyle Brunson', 'Phil Hellmuth', 'Johnny Chan'],
        correct_index: 2,
        explanation: 'Phil Hellmuth holds the record with 17 WSOP bracelets, more than any other player in history.'
    },
    {
        id: 'fb5',
        category: 'tournament_facts',
        difficulty: 'medium',
        question: 'What is the largest first-place prize ever awarded in a poker tournament?',
        options: ['$8.5 million', '$10 million', '$12 million', '$18.3 million'],
        correct_index: 3,
        explanation: 'Antonio Esfandiari won $18.3 million in the 2012 Big One for One Drop, the largest first-place prize in poker history.'
    },
    {
        id: 'fb6',
        category: 'rule_knowledge',
        difficulty: 'easy',
        question: 'In Texas Hold\'em, what happens if two players have the exact same hand?',
        options: ['The player with position wins', 'The pot is split equally', 'There\'s a runout card', 'The player who bet first wins'],
        correct_index: 1,
        explanation: 'When hands are identical, the pot is split equally among the tied players. This is called a "chop."'
    },
    {
        id: 'fb7',
        category: 'poker_history',
        difficulty: 'hard',
        question: 'Who is credited with inventing Texas Hold\'em poker?',
        options: ['Doyle Brunson', 'Unknown - originated in Robstown, Texas', 'Johnny Moss', 'Benny Binion'],
        correct_index: 1,
        explanation: 'The origins of Texas Hold\'em are unclear, but it\'s believed to have originated in Robstown, Texas in the early 1900s.'
    },
    {
        id: 'fb8',
        category: 'famous_hands',
        difficulty: 'medium',
        question: 'What is the "Dead Man\'s Hand" in poker?',
        options: ['Pocket Kings', 'Aces and Eights (black)', 'Queen-Seven offsuit', 'Two-Seven offsuit'],
        correct_index: 1,
        explanation: 'The Dead Man\'s Hand is two pair of black aces and black eights. It\'s the hand Wild Bill Hickok allegedly held when he was shot and killed in 1876.'
    },
    {
        id: 'fb9',
        category: 'gto_theory',
        difficulty: 'medium',
        question: 'What does "polarized range" mean in poker?',
        options: ['Playing only premium hands', 'A range containing only very strong hands or bluffs', 'Adjusting to opponent tendencies', 'Playing in position only'],
        correct_index: 1,
        explanation: 'A polarized range contains only the strongest value hands and bluffs, with no medium-strength hands.'
    },
    {
        id: 'fb10',
        category: 'tournament_facts',
        difficulty: 'easy',
        question: 'What is the buy-in for the WSOP Main Event?',
        options: ['$5,000', '$10,000', '$25,000', '$50,000'],
        correct_index: 1,
        explanation: 'The WSOP Main Event has had a $10,000 buy-in since its inception in 1970.'
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const today = getTodayCST();

        // Try to fetch today's questions from database
        const { data: questions, error } = await supabase
            .from('trivia_questions')
            .select('id, category, difficulty, question, options, correct_index, explanation')
            .eq('daily_date', today)
            .order('order_index', { ascending: true });

        if (error) {
            console.error('[Trivia API] Database error:', error);
        }

        // Get user stats if authenticated (placeholder - would use auth)
        const userStats = {
            totalPlayed: 0,
            bestScore: 0,
            currentStreak: 0
        };

        // Get today's leaderboard
        const { data: leaderboard } = await supabase
            .from('trivia_scores')
            .select('username, score')
            .eq('play_date', today)
            .order('score', { ascending: false })
            .limit(10);

        // Return questions (fallback if none in database)
        const finalQuestions = (questions && questions.length >= 10)
            ? questions
            : shuffleArray([...FALLBACK_QUESTIONS]).slice(0, 10);

        return res.status(200).json({
            success: true,
            date: today,
            questions: finalQuestions,
            hasPlayedToday: false, // Would check auth
            todayScore: null,
            leaderboard: leaderboard || [],
            userStats
        });

    } catch (error) {
        console.error('[Trivia API] Error:', error);

        // Return fallback questions on error
        return res.status(200).json({
            success: true,
            questions: shuffleArray([...FALLBACK_QUESTIONS]).slice(0, 10),
            hasPlayedToday: false,
            todayScore: null,
            leaderboard: [],
            userStats: { totalPlayed: 0, bestScore: 0, currentStreak: 0 }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
