/**
 * DAILY TRIVIA QUESTION GENERATOR — Anti-Gravity Agent (AG-1)
 * Runs at 11:59 PM CST daily via Vercel cron
 * Generates 20 scenario-based questions per category (200 total)
 * 
 * Quality Standard: Anti-Gravity Agent Protocol
 * - Context Is King: stack sizes, positions, hands, stage
 * - Distractor Protocol: plausible mistakes only, no jokes
 * - Explanation Is The Payload: math, logic, EV reasoning
 * - No Ambiguity: one clearly correct answer per question
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const QUESTIONS_PER_CATEGORY = 20;

// ═══════════════════════════════════════════════════════════════════════════
// ANTI-GRAVITY AGENT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const AG1_SYSTEM_PROMPT = `*** SYSTEM MESSAGE: ANTI-GRAVITY AGENT V5 ACTIVATED ***
*** CLASSIFICATION: ELITE STRATEGY ONLY ***
*** INTEGRITY PROTOCOL: ZERO FABRICATION ***
*** SYNC PROTOCOL: ANSWER KEY = EXPLANATION ***

IDENTITY:
You are the "Anti-Gravity Agent"—a high-level Tournament Poker Logic Engine. You do not deal in "luck," "feel," or vague definitions. You deal in EV (Expected Value), ICM (Independent Chip Model), and Range Morphology.

MISSION OBJECTIVE:
Generate high-stakes, scenario-based poker trivia questions. You must reject lazy content. Every question must be a tactical puzzle.

MANDATORY RULES OF ENGAGEMENT (The 7 Commandments):

1.  **CONTEXT IS KING (The Setup):**
    Never ask "What should you do with AK?" or "What is a donk bet?"
    ALWAYS specify the environment:
    -   **Tournament Stage:** (e.g., Bubble, Final Table, Level 1, Satellite).
    -   **Effective Stack:** (e.g., 12BB, 35BB, 100BB deep).
    -   **Position:** (e.g., Hero on CO, Villain on BTN).
    -   **The Action:** (e.g., "Villain opens 2.2x, Hero 3-bets to 8BB...").

2.  **THE DISTRACTOR PROTOCOL (Wrong Answers):**
    -   The wrong options must be **PLAUSIBLE MISTAKES** (e.g., a "Nit fold" or a "Maniac shove").
    -   Do not use joke answers (e.g., "Cry," "Flip the table," "It's all luck").
    -   Distractors should represent common leaks players actually have.

3.  **EXPLANATION IS THE PAYLOAD:**
    -   The explanation must explain the **MATH** and **LOGIC**.
    -   Use terms like: *Equity, Pot Odds, ICM Pressure, Range Advantage, Capped Range, Fold Equity.*
    -   Explicitly state why the correct answer is +EV and why the runner-up answer is -EV.
    -   ALWAYS refer to options as A, B, C, D — NEVER use zero-indexed references (0, 1, 2, 3).

4.  **ZERO FABRICATION PROTOCOL (Historical Integrity):**
    -   For historical/factual categories: NEVER invent cards, dates, dollar amounts, or player names.
    -   If you are not 100% certain of a specific fact, DO NOT include it.
    -   VERIFY BOARD PHYSICS: If you claim a hand makes a straight/flush, verify it on the board.

5.  **ANSWER-EXPLANATION ALIGNMENT (SYNC CHECK):**
    -   The correct_index MUST match the option defended in the explanation.
    -   MANDATORY PRE-OUTPUT CHECK: Read the option at correct_index. Read the first sentence of the explanation. They MUST refer to the SAME option letter and SAME action.
    -   If explanation argues Option B is correct, correct_index MUST be 1.

6.  **CORRECT MATH (Pot Odds Formula):**
    -   Pot Odds = Call / (Pot_Before_Bet + Bet + Call)
    -   Example: Pot_Before=18.5BB, Bet=10BB, Call=10BB → 10/(18.5+10+10) = 10/38.5 = ~26%
    -   The denominator is EVERYTHING in the pot after your call.
    -   DO NOT omit your call from the denominator.

7.  **STRICT JSON OUTPUT:**
    -   Output pure, unformatted JSON only. No markdown fences.

TARGET PARAMETERS:
-   Focus on creating "Trap" scenarios where the intuitive play is wrong.
-   Ensure distinct difference between "Shove" and "Small Raise" scenarios based on stack depth.
-   SPR Check: If raising creates SPR < 2, SHOVE instead.
-   10-15BB on bubble: SHOVE or FOLD — never min-raise into awkward SPR.

EXECUTE GENERATION.`;

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY DEFINITIONS WITH TOPIC ROTATIONS
// ═══════════════════════════════════════════════════════════════════════════

const TRIVIA_CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        topicFocuses: [
            'WSOP milestone years and records',
            'Origin and evolution of specific poker variants',
            'Online poker boom and key moments',
            'Landmark legislation and regulatory events'
        ],
        prompt: `Generate poker history trivia questions about SPECIFIC historical events, records, or milestones.
Each question must reference specific names, dates, dollar amounts, or tournament details.
DO NOT ask vague questions like "What is the history of poker?" or "How did poker evolve?"`
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        topicFocuses: [
            'WSOP Main Event iconic hands',
            'High Stakes Poker / Poker After Dark hands',
            'Online poker legendary hands',
            'World Poker Tour memorable moments'
        ],
        prompt: `Generate trivia questions about SPECIFIC famous poker hands from television or documented play.
Include players' names, the event name, the cards involved, and what made the hand significant.
DO NOT ask generic questions like "What makes a poker hand famous?"`
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        topicFocuses: [
            'WSOP bracelet records and achievements',
            'Career earnings milestones',
            'Cross-discipline poker accomplishments',
            'Notable rivalries and heads-up battles'
        ],
        prompt: `Generate trivia questions about SPECIFIC, verifiable facts about named professional poker players.
Reference tournament results, career earnings, bracelet counts, or notable achievements.
DO NOT ask opinion-based or subjective questions.`
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        topicFocuses: [
            'TDA ruling scenarios',
            'Betting rules and string bet situations',
            'All-in and side pot calculations',
            'Tournament clock and level structure rules'
        ],
        prompt: `Generate poker rules trivia based on SPECIFIC table scenarios requiring knowledge of TDA, WSOP, or Robert's Rules.
Present a concrete situation, not a definition.
DO NOT ask questions answerable with basic common sense.`
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        topicFocuses: [
            'Pot odds and equity threshold math',
            'MDF calculations and applications',
            'Range balancing and polarization theory',
            'Indifference and mixed strategy concepts'
        ],
        prompt: `Generate GTO theory trivia involving SPECIFIC mathematical concepts or solver principles.
Include specific frequencies, equity thresholds, pot odds calculations, or strategic ratios.
Include the actual calculation in the explanation.`
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        topicFocuses: [
            'WSOP records and statistics',
            'WPT/EPT history and champions',
            'Online tournament milestones',
            'High roller and super high roller records'
        ],
        prompt: `Generate trivia about SPECIFIC poker tournament facts — prize pools, field sizes, records, or notable occurrences.
Every answer must be a verifiable fact. Reference specific years, numbers, and names.`
    },
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        topicFocuses: [
            'Pre-flop push/fold charts (10-20 BB)',
            'Post-flop play in 3-bet pots',
            'ICM and pay jumps at the Final Table',
            'Blind defense vs late position opens',
            'Big stack bullying and chip accumulation',
            'Satellite bubble and survival strategy',
            'Multi-way pot navigation in tournaments',
            'Re-entry and late registration decisions'
        ],
        prompt: `Generate MTT SCENARIO questions. EVERY question MUST include:
- Specific stack sizes in BB
- Hero's exact position (UTG, MP, CO, BTN, SB, BB)
- Hero's exact hand with suit symbols (♠♥♦♣)
- Tournament context (buy-in, stage, players left, payout info)
- Other relevant player stack sizes and actions
DO NOT generate definition questions like "What does ICM stand for?"`
    },
    {
        id: 'cash_game_situations',
        name: 'Cash Game Situations',
        topicFocuses: [
            'Deep stack (200+ BB) postflop decisions',
            '3-bet pot play in position',
            'Multi-way pot navigation',
            'Exploiting recreational players',
            'Float and probe betting lines',
            'Set mining and implied odds spots',
            'Blind defense and squeeze plays',
            'River decision making (value vs bluff)'
        ],
        prompt: `Generate cash game SCENARIO questions. EVERY question MUST include:
- Specific stack sizes in BB or dollar amounts
- Hero's position and opponent's position
- Hero's exact hand with suit symbols
- Game stakes (e.g., "$1/$2 NL", "$2/$5 NL")
- Board texture if postflop
DO NOT generate textbook questions like "What are implied odds?"`
    },
    {
        id: 'icm_chip_ev',
        name: 'ICM & Chip EV',
        topicFocuses: [
            'Bubble factor and risk premium',
            'Final table pay jump analysis',
            'Nash push/fold ranges',
            'Satellite ICM survival math',
            'Chip EV vs Dollar EV divergence',
            'Deal-making and ICM chops',
            'Short stack survival equity',
            'Big stack accumulation vs ICM conservation'
        ],
        prompt: `Generate ICM/Chip EV SCENARIO questions. EVERY question MUST include:
- Exact stack sizes for all relevant players in BB
- Prize pool or payout structure details
- Hero's specific hand and position
- Tournament stage context
DO NOT generate definition questions like "What is ICM?" or "Define bubble factor."`
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        topicFocuses: [
            'C-bet strategy by board texture',
            'Minimum defense frequency applications',
            'Polarized vs linear range construction',
            'Blocker effects in bluffing decisions',
            'Overbetting the river',
            'Check-raise frequency optimization',
            'Multi-street planning and range evolution',
            'Node locking and exploitative adjustments'
        ],
        prompt: `Generate GTO solver-based SCENARIO questions. EVERY question MUST include:
- Preflop action sequence
- Exact board texture with suit symbols
- Hero's specific hand
- Stack depth and pot size
- Positions of all players involved
DO NOT ask "What is GTO?" or "Define minimum defense frequency."`
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION WITH TOPIC ROTATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateBatch(category, difficulty, count, topicFocus) {
    const grok = getGrokClient();

    const userPrompt = `Generate exactly ${count} unique poker trivia questions.

CATEGORY: ${category.name}
TOPIC FOCUS: ${topicFocus}
DIFFICULTY: ${difficulty}

${category.prompt}

${difficulty === 'easy' ? 'DIFFICULTY LEVEL: Clear-cut situations. The correct play is well-established. Tests foundational strategy knowledge.' : ''}
${difficulty === 'medium' ? 'DIFFICULTY LEVEL: Multiple options are plausible but one is clearly best. Tests intermediate strategic understanding.' : ''}
${difficulty === 'hard' ? 'DIFFICULTY LEVEL: "Trap" scenarios where the intuitive play is WRONG. Expert-level decisions requiring ICM, solver output, or deep range analysis.' : ''}

CRITICAL REMINDERS:
- Every wrong answer must be a PLAUSIBLE MISTAKE a real player would make — no joke answers
- Explanations must include MATH and LOGIC (equity %, pot odds, fold equity, ICM pressure)
- RANDOMIZE which option (A/B/C/D) is correct — distribute evenly
- Each question must be completely unique — no duplicate scenarios

Return ONLY a valid JSON array:
[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"...","difficulty":"${difficulty}","subcategory":"${topicFocus}"}]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                { role: 'system', content: AG1_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.85,
            max_tokens: 8000
        });

        const content = response.choices[0]?.message?.content?.trim();
        if (!content) return [];

        const cleaned = content.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        return questions
            .filter(q =>
                q.question &&
                q.options?.length === 4 &&
                typeof q.correct_index === 'number' &&
                q.correct_index >= 0 && q.correct_index <= 3 &&
                q.explanation &&
                q.explanation.length > 50 // Reject thin explanations
            )
            .map(q => ({
                category: category.id,
                question: q.question.trim(),
                options: q.options.map(o => o.trim()),
                correct_index: q.correct_index,
                explanation: q.explanation.trim(),
                difficulty: q.difficulty || difficulty,
                subcategory: q.subcategory || topicFocus,
                created_at: new Date().toISOString()
            }));
    } catch (error) {
        console.error(`[AG-1] Grok error for ${category.id}/${topicFocus}:`, error.message);
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

    console.log('[AG-1] Anti-Gravity Agent activated — 20 questions × 10 categories...');

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
            console.log(`[AG-1] Generating ${QUESTIONS_PER_CATEGORY} for ${category.id}...`);

            let catGenerated = 0;
            const focuses = category.topicFocuses;

            // Generate in difficulty batches with rotating topic focuses:
            // 5 easy (2 topics) + 10 medium (3 topics) + 5 hard (2 topics) = 20
            const batches = [
                { difficulty: 'easy', count: 3, topicFocus: focuses[0 % focuses.length] },
                { difficulty: 'easy', count: 2, topicFocus: focuses[1 % focuses.length] },
                { difficulty: 'medium', count: 4, topicFocus: focuses[2 % focuses.length] },
                { difficulty: 'medium', count: 3, topicFocus: focuses[3 % focuses.length] },
                { difficulty: 'medium', count: 3, topicFocus: focuses[4 % focuses.length] },
                { difficulty: 'hard', count: 3, topicFocus: focuses[5 % focuses.length] },
                { difficulty: 'hard', count: 2, topicFocus: focuses[6 % focuses.length] }
            ];

            for (const batch of batches) {
                const questions = await generateBatch(category, batch.difficulty, batch.count, batch.topicFocus);

                if (questions.length > 0) {
                    const { data, error } = await supabase
                        .from('trivia_questions')
                        .insert(questions)
                        .select('id');

                    if (error) {
                        console.error(`[AG-1] DB error ${category.id}/${batch.difficulty}:`, error.message);
                        results.totalFailed += batch.count;
                    } else {
                        catGenerated += data.length;
                        allGeneratedIds.push(...data.map(d => d.id));
                    }
                } else {
                    results.totalFailed += batch.count;
                }

                // Rate limit between Grok calls
                await new Promise(r => setTimeout(r, 800));
            }

            results.categorySummary[category.id] = catGenerated;
            results.totalGenerated += catGenerated;
            console.log(`[AG-1] ${category.id}: ${catGenerated}/${QUESTIONS_PER_CATEGORY}`);
        }

        // Select daily question
        if (allGeneratedIds.length > 0) {
            const randomId = allGeneratedIds[Math.floor(Math.random() * allGeneratedIds.length)];
            const { error: updateError } = await supabase
                .from('trivia_questions')
                .update({ daily_date: tomorrowDate })
                .eq('id', randomId);

            if (!updateError) {
                results.dailySelected = { id: randomId, date: tomorrowDate };
            }
        }

        console.log(`[AG-1] Mission complete: ${results.totalGenerated} generated, ${results.totalFailed} failed`);

        return res.status(200).json({
            success: true,
            message: `AG-1 generated ${results.totalGenerated} questions for ${tomorrowDate}`,
            ...results
        });

    } catch (error) {
        console.error('[AG-1] Fatal error:', error);
        return res.status(500).json({ success: false, error: error.message, ...results });
    }
}

export const config = {
    maxDuration: 300 // 5 minutes for 70 Grok API calls
};
