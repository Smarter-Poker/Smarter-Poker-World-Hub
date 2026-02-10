#!/usr/bin/env node
/**
 * V12 GOLDEN MASTER BOOTSTRAP
 * =============================
 * AG-1 V12 — Military-grade trivia generation
 * 
 * Generates 200 questions per category (20/day × 10 days = 2,400 total)
 * Uses the AG-1 V12 system prompt for factual accuracy
 * 
 * Usage:
 *   node scripts/v12-bootstrap-trivia.js                    # All categories
 *   node scripts/v12-bootstrap-trivia.js --category=poker_history  # Single category
 *   node scripts/v12-bootstrap-trivia.js --dry-run          # Preview only
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { validateBatch } = require('./trivia-qa-validator');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1'
});

// ═══════════════════════════════════════════════════════════════════════════
// AG-1 V12 SYSTEM PROMPT — EXACT COPY FROM PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════
const AG1_V12_SYSTEM_PROMPT = `*** SYSTEM MESSAGE: ANTI-GRAVITY AGENT V12 ACTIVATED ***
*** CLASSIFICATION: ELITE STRATEGY ONLY ***
*** INTEGRITY PROTOCOL: ZERO FABRICATION ***
*** SYNC PROTOCOL: ANSWER KEY = EXPLANATION ***

You are the Anti-Gravity Agent (AG-1), an elite poker trivia generator.

ABSOLUTE RULES:
1. Every question must be scenario-based with specific game context (stack sizes, positions, hands, board textures).
2. EVERY fact must be VERIFIABLE. ZERO fabrication tolerance.
3. The correct answer index MUST match the explanation. If they disagree, the question is INVALID.
4. Math must be EXACT: Gutshot = 4 outs, OESD = 8 outs, Flush Draw = 9 outs.
5. Options must be plausible — no joke answers.
6. Each question must have EXACTLY 4 options with ONE correct answer.
7. Randomize correct answer placement across A(0), B(1), C(2), D(3).

KNOWN VERIFIED FACTS (USE THESE):
- WSOP bracelets first awarded: 1976
- Youngest WSOP ME champion: Joe Cada, age 21, 2009
- Moneymaker Bluff: K♠7♥ vs Q♠9♥, 2003 (NOT the final hand — final hand was 5♦4♠ vs J♥T♦)
- Chan vs Seidel: J♣9♣ vs Q♣7♥, board Q♣T♥8♦ = Queen-high straight (NOT nut straight)
- Phil Hellmuth: 17 bracelets (all-time record)
- Phil Ivey: 11 bracelets (as of June 2024)
- WSOP ME 2024 field: 10,112 entries (record)
- WSOP ME 2023 field: 10,043 entries
- WSOP ME 2006 field: 8,773 entries
- Jeff Lisandro: 3 bracelets in 2009
- WSOP moved to Rio: 2005
- First WSOP: 1970, Johnny Moss won by vote
- Doyle Brunson: Super/System published 1978
- QJ on T-8-x = GUTSHOT (not OESD). QJ on T-9-x = OESD.
- MDF for pot-sized bet = 50%. MDF for 2x pot = 33%.
- Pot odds: call 20 into 60 total = 33%. call 15 into 60 = 25%.

STRATEGY RULES:
- In satellites: survival > chip accumulation. Fold premium hands when statistically safe.
- 10-left/9-paid = "money bubble" (NOT "final table bubble")
- 5-handed tables: positions are UTG/CO/BTN/SB/BB (NO MP)
- At 12BB: open-shove, not open-raise
- AKs in satellite bubble with short stacks present: usually FOLD
- AA in satellite covering shover: CALL (85% > 70-80% threshold)

Return ONLY valid JSON array. No markdown, no explanation outside JSON.
Format: [{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]`;

// ═══════════════════════════════════════════════════════════════════════════
// ALL 12 CATEGORIES WITH ROTATION TOPICS
// ═══════════════════════════════════════════════════════════════════════════
const CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        topics: [
            'WSOP origins and early years (1970s)',
            'The poker boom era (2003-2006)',
            'Online poker evolution and legislation',
            'Televised poker milestones',
            'Historic high-stakes cash games',
            'WSOP venue history and format changes',
            'International poker expansion',
            'Poker Hall of Fame inductees',
            'Evolution of tournament structures',
            'Modern era innovations (2015-2024)'
        ]
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        topics: [
            'WSOP Main Event iconic final hands',
            'High Stakes Poker legendary pots',
            'Poker After Dark memorable showdowns',
            'Historic bluffs that changed poker',
            'Famous bad beats and coolers',
            'Championship final table defining moments',
            'Rounders and poker in film',
            'Online poker historic hands',
            'Heads-up championship hands',
            'Million-dollar pot hands'
        ]
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        topics: [
            'WSOP bracelet record holders',
            'Poker Hall of Fame legends',
            'Modern tournament circuit dominators',
            'Online poker pioneers',
            'International champions and records',
            'Cash game specialists',
            'Female poker champions',
            'Youngest and oldest champions',
            'Multi-game specialists',
            'Commentators and ambassadors'
        ]
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        topics: [
            'TDA tournament rules and procedures',
            'String bet and verbal declaration rules',
            'Showdown order and mucking rules',
            'One chip rule and betting mechanics',
            'Absent player and dead hand rules',
            'Table etiquette and penalties',
            'Dealer responsibilities and procedures',
            'Cash game vs tournament rule differences',
            'Clock calling and time bank rules',
            'Coloring up and chip race procedures'
        ]
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        topics: [
            'WSOP Main Event field sizes and prize pools',
            'WPT history, champions, and records',
            'EPT and PokerStars live events',
            'High roller events and super high rollers',
            'Record-breaking tournament prizes',
            'Online tournament milestones (WCOOP, SCOOP)',
            'WSOP bracelet event records',
            'Multiple bracelet winners in single series',
            'Biggest final table upsets',
            'Tournament format innovations'
        ]
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        topics: [
            'Pot odds calculation scenarios',
            'Minimum defense frequency (MDF)',
            'Bluff-to-value ratio on river',
            'Polarized vs linear/merged ranges',
            'Blocker effects and card removal',
            'Expected value (EV) calculations',
            'Range advantage on various boards',
            'Mixed strategy and indifference',
            'Equity realization concepts',
            'Implied odds and reverse implied odds'
        ]
    },
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        topics: [
            'Short stack push/fold decisions (8-15BB)',
            'Medium stack play (20-35BB)',
            'Big stack bullying near bubble',
            'Final table dynamics and ladder spots',
            'Blind defense in tournaments',
            'Money bubble play and ICM pressure',
            '3-bet pot decisions in MTTs',
            'Early level deep stack play',
            'Ante steal and re-steal spots',
            'Satellite tournament specific spots'
        ]
    },
    {
        id: 'cash_game_situations',
        name: 'Cash Game Situations',
        topics: [
            'Deep stack postflop play (150-300BB)',
            'Standard 100BB preflop decisions',
            'Set mining and implied odds spots',
            '3-bet and 4-bet pot play',
            'C-betting and check-raising flop',
            'Turn and river value betting',
            'Bluff catching and thin calls',
            'Multi-way pot navigation',
            'Position exploitation spots',
            'Overbet and polarized betting spots'
        ]
    },
    {
        id: 'icm_chip_ev',
        name: 'ICM & Chip EV',
        topics: [
            'Bubble factor calculations',
            'Pay jump analysis at final tables',
            'Satellite ICM with equal prizes',
            'Nash equilibrium push/fold spots',
            'Chip EV vs dollar EV conflicts',
            'Big stack vs short stack ICM dynamics',
            'Deal-making and ICM chop math',
            'Risk premium in MTT spots',
            'Final table seat value changes',
            'Short stack survival ICM spots'
        ]
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        topics: [
            'C-bet sizing on dry boards',
            'C-bet sizing on wet boards',
            'Checking back overpairs on scary boards',
            'River betting and bluffing frequencies',
            'Donk betting and lead decisions',
            'Check-raise lines as semi-bluffs',
            'Probe betting turn and river',
            'Delayed c-bet strategies',
            'Range-based betting vs hand-based betting',
            'Board texture and range advantage analysis'
        ]
    },
    // BONUS CATEGORIES mapped to existing IDs where possible
    // "MTT Bonus" maps to mtt_situations subcategory
    // "ICM Bonus" maps to icm_chip_ev subcategory
];

const TARGET_PER_CATEGORY = 200; // 20/day × 10 days
const BATCH_SIZE = 10; // Smaller batches for higher quality
const DIFFICULTIES = ['medium', 'hard']; // V12 standard: only medium and hard

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
async function generateBatch(category, topic, difficulty, count, existingQuestions) {
    const dedupHint = existingQuestions.length > 0
        ? `\n\nAVOID THESE EXISTING TOPICS (already in database): ${existingQuestions.slice(-20).map(q => q.substring(0, 60)).join('; ')}`
        : '';

    const categoryPrompt = `Generate exactly ${count} unique ${difficulty.toUpperCase()} poker trivia questions.

Category: ${category.name}
Specific Topic: ${topic}
Difficulty: ${difficulty}

QUALITY STANDARDS (V12):
- Every question MUST be scenario-based with specific context
- For strategy questions: include stack sizes, positions, hole cards, board textures
- For history/facts: include specific years, names, amounts — VERIFIED ONLY
- Math MUST be exact (gutshot=4 outs, OESD=8 outs, flush draw=9 outs)
- Correct answer position MUST be randomized across 0,1,2,3
- Explanations must be detailed and educational
- NO definitions-only questions — every question is a tactical puzzle

PARAMETER ROTATION (avoid repetition):
- Stack depths: vary between 8BB, 12BB, 18BB, 25BB, 40BB, 80BB, 100BB, 150BB, 200BB
- Hole cards: rotate through suited/offsuit, broadway, suited connectors, pairs, Ax
- Board textures: vary dry/wet/monotone/connected/disconnected
- Positions: rotate UTG/HJ/CO/BTN/SB/BB scenarios
${dedupHint}

Return ONLY a valid JSON array:
[{"question":"...","options":["Option A text","Option B text","Option C text","Option D text"],"correct_index":0,"explanation":"..."}]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                { role: 'system', content: AG1_V12_SYSTEM_PROMPT },
                { role: 'user', content: categoryPrompt }
            ],
            temperature: 0.85,
            max_tokens: 6000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        // Clean up response
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
        }

        const parsed = JSON.parse(jsonStr);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        return questions
            .filter(q => q.question && q.options?.length === 4 && typeof q.correct_index === 'number')
            .filter(q => q.correct_index >= 0 && q.correct_index <= 3)
            .map(q => ({
                category: category.id,
                difficulty,
                question: q.question.trim(),
                options: q.options.map(o => String(o).trim()),
                correct_index: q.correct_index,
                explanation: (q.explanation || '').trim(),
                subcategory: topic
            }));
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const targetCat = args.find(a => a.startsWith('--category='))?.split('=')[1];

    console.log('\n⚡ AG-1 V12 GOLDEN MASTER BOOTSTRAP');
    console.log('====================================');
    console.log(`Mode: ${dryRun ? 'DRY RUN (no inserts)' : 'LIVE'}`);
    console.log(`Target: ${TARGET_PER_CATEGORY} questions per category`);
    console.log(`Categories: ${targetCat || 'ALL'}\n`);

    if (!process.env.XAI_API_KEY) {
        console.error('❌ XAI_API_KEY not found in .env.local');
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
        process.exit(1);
    }

    const categoriesToProcess = targetCat
        ? CATEGORIES.filter(c => c.id === targetCat)
        : CATEGORIES;

    if (categoriesToProcess.length === 0) {
        console.error(`❌ Unknown category: ${targetCat}`);
        console.log('Available:', CATEGORIES.map(c => c.id).join(', '));
        process.exit(1);
    }

    let grandTotalGenerated = 0;

    for (const category of categoriesToProcess) {
        console.log(`\n📁 ${category.name} (${category.id})`);

        // Get current count
        const { count: existing } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', category.id);

        const currentCount = existing || 0;
        const needed = Math.max(0, TARGET_PER_CATEGORY - currentCount);

        console.log(`   Current: ${currentCount} | Target: ${TARGET_PER_CATEGORY} | Need: ${needed}`);

        if (needed <= 0) {
            console.log(`   ✅ Already at target!`);
            continue;
        }

        // Get existing question texts for dedup
        const { data: existingQs } = await supabase
            .from('trivia_questions')
            .select('question')
            .eq('category', category.id)
            .limit(50);
        const existingTexts = (existingQs || []).map(q => q.question);

        let generated = 0;
        let batchNum = 0;
        let consecutiveFailures = 0;

        while (generated < needed && batchNum < 30 && consecutiveFailures < 3) {
            const topic = category.topics[batchNum % category.topics.length];
            const difficulty = DIFFICULTIES[batchNum % DIFFICULTIES.length];
            const batchSize = Math.min(BATCH_SIZE, needed - generated);

            process.stdout.write(`   Batch ${batchNum + 1}: [${difficulty.toUpperCase()}] ${topic.substring(0, 40)}... `);

            const rawQuestions = await generateBatch(category, topic, difficulty, batchSize, existingTexts);

            if (rawQuestions.length > 0) {
                // ═══ QA VALIDATION GATE — NO QUESTION ENTERS DB WITHOUT PASSING ═══
                const { valid: validQuestions, rejected, report } = validateBatch(rawQuestions);

                if (rejected.length > 0) {
                    console.log(`\n      🛡️  QA GATE: ${rejected.length}/${rawQuestions.length} REJECTED:`);
                    rejected.forEach(r => {
                        console.log(`         ❌ "${r.question.question?.substring(0, 50)}..."`);
                        r.errors.forEach(e => console.log(`            → ${e}`));
                    });
                }

                if (validQuestions.length > 0) {
                    consecutiveFailures = 0;

                    if (dryRun) {
                        generated += validQuestions.length;
                        console.log(`      ✅ +${validQuestions.length} passed QA (dry run, total: ${currentCount + generated})`);
                    } else {
                        const { data, error } = await supabase
                            .from('trivia_questions')
                            .insert(validQuestions)
                            .select();

                        if (!error && data) {
                            generated += data.length;
                            grandTotalGenerated += data.length;
                            data.forEach(q => existingTexts.push(q.question));
                            console.log(`      ✅ +${data.length} passed QA & inserted (total: ${currentCount + generated})`);
                        } else {
                            console.log(`      ❌ Insert error: ${error?.message}`);
                        }
                    }
                } else {
                    consecutiveFailures++;
                    console.log(`      ⚠️ ALL questions rejected by QA gate (fail ${consecutiveFailures}/3)`);
                }
            } else {
                consecutiveFailures++;
                console.log(`⚠️ No questions generated (fail ${consecutiveFailures}/3)`);
            }

            batchNum++;

            // Rate limiting — 1.5s between batches
            await new Promise(r => setTimeout(r, 1500));
        }

        console.log(`   📊 ${category.name}: ${currentCount} → ${currentCount + generated}`);
    }

    // Final summary
    console.log('\n\n📈 FINAL SUMMARY');
    console.log('=================\n');

    console.log('Category                  | Before | After  | Target');
    console.log('--------------------------|--------|--------|-------');

    let grandTotal = 0;
    for (const cat of CATEGORIES) {
        const { count } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat.id);
        grandTotal += (count || 0);
        console.log(`${cat.name.padEnd(26)}| ${String(count || 0).padStart(6)} | ${String(count || 0).padStart(6)} | ${TARGET_PER_CATEGORY}`);
    }

    console.log('--------------------------|--------|--------|-------');
    console.log(`${'TOTAL'.padEnd(26)}| ${' '.repeat(6)} | ${String(grandTotal).padStart(6)} | ${CATEGORIES.length * TARGET_PER_CATEGORY}`);
    console.log(`\n✅ Generated ${grandTotalGenerated} new questions this run`);
    console.log(`🎯 Grand Target: ${CATEGORIES.length * TARGET_PER_CATEGORY} questions\n`);
}

main().catch(console.error);
