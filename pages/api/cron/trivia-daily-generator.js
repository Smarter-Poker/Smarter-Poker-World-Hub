/**
 * DAILY TRIVIA QUESTION GENERATOR — Powered by Grok AI
 * Runs at 11:59 PM CST daily via Vercel cron
 * Generates 20 scenario-based questions per category (200 total)
 * 
 * Question Quality Standard (from Agent Skill: trivia-qa-pipeline):
 * - Every question must be SCENARIO-BASED with specific details
 * - Include stack sizes, positions, hands, and game context
 * - 4 plausible answer options, 1 clearly correct
 * - 2-4 sentence explanations with strategic reasoning
 * - Difficulty distribution: 25% easy, 50% medium, 25% hard
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const QUESTIONS_PER_CATEGORY = 20;
const BATCH_SIZE = 10; // Questions per Grok call (2 batches per category)

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY DEFINITIONS WITH SCENARIO-BASED PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const TRIVIA_CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        prompt: `Generate poker history trivia questions about SPECIFIC historical events, records, or milestones.
Each question must reference specific names, dates, dollar amounts, or tournament details.
Example format: "In what year did the WSOP Main Event first exceed 1,000 entrants, and who won that year?"
DO NOT ask vague questions like "What is the history of poker?" or "How did poker evolve?"`
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        prompt: `Generate trivia questions about SPECIFIC famous poker hands from television or documented play.
Include players' names, the event name, the cards involved, and what made the hand significant.
Example format: "In the 2003 WSOP Main Event final hand, Chris Moneymaker held 5♠4♠ against Sam Farha. What did Moneymaker flop to take down the pot?"
DO NOT ask generic questions like "What makes a poker hand famous?"`
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        prompt: `Generate trivia questions about SPECIFIC, verifiable facts about named professional poker players.
Reference their tournament results, career earnings, playing style, bracelet count, or notable achievements.
Example format: "Phil Ivey has won 10 WSOP bracelets. In which year did he win 3 bracelets in a single WSOP?"
DO NOT ask opinion-based or subjective questions.`
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        prompt: `Generate poker rules trivia questions based on SPECIFIC table scenarios.
Present a situation that requires knowledge of official TDA, WSOP, or Robert's Rules of Poker.
Example format: "In a $2/$5 No-Limit game, Player A bets $50. Player B throws in a single $100 chip without announcing anything. Under TDA rules, is this a call or a raise?"
DO NOT ask questions that can be answered with basic common sense.`
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        prompt: `Generate GTO theory trivia questions involving SPECIFIC mathematical concepts or solver principles.
Include specific frequencies, equity thresholds, pot odds calculations, or strategic ratios.
Example format: "According to Minimum Defense Frequency, if your opponent bets 75% pot on the river, what percentage of your range must you defend? (a) 43% (b) 57% (c) 67% (d) 75%"
Include the actual calculation or formula in the explanation.`
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        prompt: `Generate trivia questions about SPECIFIC poker tournament facts — prize pools, field sizes, records, or notable occurrences.
Example format: "The 2006 WSOP Main Event set a record with 8,773 entrants. Who won that year and what was the first-place prize?"
Every answer must be a verifiable fact. Reference specific years, numbers, and names.`
    },
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        prompt: `Generate multi-table tournament SCENARIO questions. EVERY question MUST include:
- Specific stack sizes in BB (e.g., "you have 22 BB")
- Your exact position (UTG, MP, CO, BTN, SB, BB)
- Your exact hand with suit symbols (e.g., A♠K♥)
- Tournament context (buy-in, players left, payout info, bubble status)
- Other relevant player stack sizes
- A clear action question ("What should you do?")

Topics to cover: bubble play, ICM pressure, short stack shoves, final table dynamics, pay jumps, satellite strategy, blind defense, ante stealing, re-entry decisions, heads-up play.

Example: "You're in a $200 MTT, 45 left, 40 get paid. You hold A♠J♦ on BTN with 25 BB. A tight player opens 2.2x from MP. Two short stacks (6-8 BB) are in the blinds. What's the best play?"

DO NOT generate definition questions like "What does ICM stand for?" or "What is bubble play?"`
    },
    {
        id: 'cash_game_situations',
        name: 'Cash Game Situations',
        prompt: `Generate cash game SCENARIO questions. EVERY question MUST include:
- Specific stack sizes in BB or dollar amounts
- Your exact position
- Your exact hand with suit symbols
- The game stakes (e.g., "$1/$2 No-Limit", "$2/$5 NL")
- Board texture if postflop (e.g., "Flop: K♥ 8♦ 3♠")
- Opponent reads or playing style when relevant

Topics: deep stack play, implied odds, float betting, 3-bet pots, multi-way pots, exploiting recreational players, set mining, check-raising, live tells, bet sizing.

Example: "You're playing $2/$5 NL with $1,000 effective. You open A♦K♦ to $15 from MP. A loose-passive player calls from BB. Flop: K♠ 8♥ 4♣ (Pot: $32). BB checks. What's the best sizing?"

DO NOT generate textbook questions like "What are implied odds?"`
    },
    {
        id: 'icm_chip_ev',
        name: 'ICM & Chip EV',
        prompt: `Generate ICM/Chip EV SCENARIO questions. EVERY question MUST include:
- Exact stack sizes for all relevant players
- Prize pool or payout structure details
- Your specific hand and position
- Tournament stage context

Topics: risk premium, bubble factor, Nash push/fold, final table ICM, satellite ICM, chip EV vs dollar EV, deal-making, survival equity.

Example: "Final table, 4 left. Payouts: 1st $45K, 2nd $28K, 3rd $18K, 4th $12K. You have 20 BB in CO with A♥K♥. Chip leader (55 BB) in BB. SB folds. Should you shove, raise small, or fold?"

DO NOT generate definition questions like "What is ICM?" or "Define bubble factor."`
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        prompt: `Generate GTO solver-based SCENARIO questions. EVERY question MUST include:
- Preflop action sequence  
- Exact board texture with suit symbols
- Your specific hand
- Stack depth and pot size
- Positions of all players

Topics: c-bet strategy by board texture, minimum defense frequency, polarized vs linear ranges, blocker effects, overbetting, river decisions, check-raise frequency, mixed strategies.

Example: "You open A♦Q♣ from CO, BB calls. Flop: J♥ 8♠ 3♦ (Pot: 6.5 BB). According to solvers, should you c-bet this flop at high frequency (~75%), low frequency (~30%), or check your entire range?"

DO NOT ask "What is GTO?" or "Define minimum defense frequency."`
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — QUALITY STANDARD
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are a world-class poker expert and trivia question writer for Smarter.Poker. You create scenario-based trivia questions for serious poker players.

ABSOLUTE RULES:
1. Every question MUST present a SPECIFIC game scenario — NEVER a definition, glossary entry, or textbook concept
2. Include specific stack sizes, positions, hand cards (with suit symbols ♠♥♦♣), and game context
3. All 4 answer options must be plausible actions a real player might consider — no obviously wrong filler
4. The correct answer must be defensible by established poker theory, solver output, or ICM calculations
5. Explanations must be 2-4 sentences explaining WHY the answer is correct AND why at least one wrong option is inferior
6. RANDOMIZE which option (A/B/C/D) is correct — distribute evenly across positions, do NOT always put the correct answer in the same spot
7. Use card suit symbols (♠♥♦♣) for all hands
8. All facts must be verifiable and accurate — no fabricated statistics or made-up player records

Return ONLY a valid JSON array (no markdown fences, no extra text):
[
  {
    "question": "The complete scenario-based question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0,
    "explanation": "2-4 sentence strategic explanation",
    "difficulty": "easy|medium|hard",
    "subcategory": "specific topic"
  }
]`;

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateBatch(category, difficulty, count) {
    const grok = getGrokClient();

    const userPrompt = `Generate exactly ${count} unique poker trivia questions for the "${category.name}" category.

${category.prompt}

Difficulty level for this batch: ${difficulty}
${difficulty === 'easy' ? '- Clear-cut situations. Most players with basic strategy knowledge should get these right.' : ''}
${difficulty === 'medium' ? '- Requires solid strategic understanding. Multiple options are plausible but one is clearly best.' : ''}
${difficulty === 'hard' ? '- Expert-level decisions requiring ICM awareness, solver knowledge, or deep strategic reasoning.' : ''}

Generate exactly ${count} questions. Each must be completely unique — no duplicate scenarios or repeated concepts.`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.85,
            max_tokens: 8000
        });

        const content = response.choices[0]?.message?.content?.trim();
        if (!content) return [];

        // Clean potential markdown fences
        const cleaned = content.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        // Validate and format each question
        return questions
            .filter(q =>
                q.question &&
                q.options?.length === 4 &&
                typeof q.correct_index === 'number' &&
                q.correct_index >= 0 && q.correct_index <= 3 &&
                q.explanation
            )
            .map(q => ({
                category: category.id,
                question: q.question.trim(),
                options: q.options.map(o => o.trim()),
                correct_index: q.correct_index,
                explanation: q.explanation.trim(),
                difficulty: q.difficulty || difficulty,
                subcategory: q.subcategory || null,
                created_at: new Date().toISOString()
            }));
    } catch (error) {
        console.error(`[Trivia Cron] Grok error for ${category.id}/${difficulty}:`, error.message);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE UTILITY
// ═══════════════════════════════════════════════════════════════════════════

function getTomorrowCST() {
    const now = new Date();
    const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cst.setDate(cst.getDate() + 1);
    const year = cst.getFullYear();
    const month = String(cst.getMonth() + 1).padStart(2, '0');
    const day = String(cst.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[Trivia Cron] Starting daily generation — 20 questions × 10 categories...');

    const tomorrowDate = getTomorrowCST();
    const results = {
        date: tomorrowDate,
        categorySummary: {},
        totalGenerated: 0,
        totalFailed: 0,
        dailySelected: null
    };

    try {
        const allGeneratedIds = [];

        for (const category of TRIVIA_CATEGORIES) {
            console.log(`[Trivia Cron] Generating ${QUESTIONS_PER_CATEGORY} for ${category.id}...`);

            let catGenerated = 0;

            // Generate in difficulty batches: 5 easy + 10 medium + 5 hard = 20
            const batches = [
                { difficulty: 'easy', count: 5 },
                { difficulty: 'medium', count: 10 },
                { difficulty: 'hard', count: 5 }
            ];

            for (const batch of batches) {
                const questions = await generateBatch(category, batch.difficulty, batch.count);

                if (questions.length > 0) {
                    const { data, error } = await supabase
                        .from('trivia_questions')
                        .insert(questions)
                        .select('id');

                    if (error) {
                        console.error(`[Trivia Cron] DB insert error for ${category.id}/${batch.difficulty}:`, error.message);
                        results.totalFailed += batch.count;
                    } else {
                        catGenerated += data.length;
                        allGeneratedIds.push(...data.map(d => d.id));
                    }
                } else {
                    console.warn(`[Trivia Cron] No questions generated for ${category.id}/${batch.difficulty}`);
                    results.totalFailed += batch.count;
                }

                // Delay between Grok calls to avoid rate limits
                await new Promise(r => setTimeout(r, 1000));
            }

            results.categorySummary[category.id] = catGenerated;
            results.totalGenerated += catGenerated;
            console.log(`[Trivia Cron] ${category.id}: ${catGenerated}/${QUESTIONS_PER_CATEGORY} generated`);
        }

        // Select one random question as tomorrow's DAILY question
        if (allGeneratedIds.length > 0) {
            const randomId = allGeneratedIds[Math.floor(Math.random() * allGeneratedIds.length)];

            const { error: updateError } = await supabase
                .from('trivia_questions')
                .update({ daily_date: tomorrowDate })
                .eq('id', randomId);

            if (!updateError) {
                results.dailySelected = { id: randomId, date: tomorrowDate };
                console.log(`[Trivia Cron] Selected daily question: ${randomId}`);
            }
        }

        console.log(`[Trivia Cron] Complete: ${results.totalGenerated} generated, ${results.totalFailed} failed`);

        return res.status(200).json({
            success: true,
            message: `Generated ${results.totalGenerated} questions for ${tomorrowDate}`,
            ...results
        });

    } catch (error) {
        console.error('[Trivia Cron] Fatal error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            ...results
        });
    }
}

export const config = {
    maxDuration: 300 // 5 minutes — needed for 30 Grok API calls
};
