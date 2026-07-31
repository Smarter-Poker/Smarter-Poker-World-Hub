#!/usr/bin/env node
/**
 * LOCAL TRIVIA BOOTSTRAP SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 * Bulk pool fill, run from a workstation so it is not bound by Vercel's
 * function timeout.
 *
 * Usage:
 *   node scripts/bootstrap-trivia.js                       # all categories
 *   node scripts/bootstrap-trivia.js --category=mtt_situations
 *   node scripts/bootstrap-trivia.js --target=2000         # per category
 *   node scripts/bootstrap-trivia.js --dry-run             # no writes
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XAI_API_KEY
 *
 * WHAT WAS BROKEN:
 *   - temperature 0.9 with NO response_format json_object, unlike every other
 *     Grok caller in the pipeline. Malformed-JSON batches were frequent, and
 *     each one was silently dropped (`return []`) after being paid for.
 *   - NO dedup against the existing pool anywhere. The only guard was a
 *     per-category count target, so any re-run below target inserted
 *     near-duplicates freely — inflating the count the 60-day depth
 *     calculation depends on with questions players would see twice.
 *   - Rows carried no `source`, so they were invisible to the Grok factual
 *     audit (which filters on source) and could never be verified.
 *   - Rows carried no `quality_score`, so the column default of 5 applied,
 *     which is BELOW the gameplay floor of 6 — every bootstrapped question was
 *     invisible to players until an audit re-scored it.
 *   - The four strategy categories were missing entirely.
 * ═══════════════════════════════════════════════════════════════════════════
 */

try { require('dotenv').config({ path: '.env.local' }); } catch (_e) { /* env already provided */ }
const { createClient } = require('@supabase/supabase-js');
const { validateBatch, normalizeQuestionText, STRATEGY_CATEGORIES } = require('./trivia-qa-validator');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ARG_CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1] || null;
const ARG_TARGET = parseInt(args.find(a => a.startsWith('--target='))?.split('=')[1] || '0', 10);
const MODEL = args.find(a => a.startsWith('--model='))?.split('=')[1] || 'grok-3';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Validator-passed generated content. The column default of 5 is below the
 *  gameplay floor of 6 and would hide every row from players. */
const SEEDED_QUALITY_SCORE = 7;
const SOURCE_TAG = 'grok-bootstrap';

const CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        topics: [
            'Origins of poker and card games',
            'Evolution of Texas Hold\'em',
            'Famous poker venues and casinos',
            'Televised poker history',
            'Online poker evolution',
            'Poker legislation history',
            'Historic high-stakes games'
        ]
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        topics: [
            'WSOP Main Event famous hands',
            'High Stakes Poker iconic moments',
            'Poker After Dark memorable plays',
            'Historic bluffs',
            'Famous bad beats',
            'Championship final table hands',
            'Million dollar pots'
        ]
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        topics: [
            'WSOP bracelet records',
            'Poker Hall of Fame members',
            'Famous tournament winners',
            'Online poker legends',
            'International poker champions',
            'Notable cash game players',
            'Poker personalities and commentators'
        ]
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        topics: [
            'WSOP history and statistics',
            'WPT history and champions',
            'EPT and international tours',
            'High roller events',
            'Record prize pools',
            'Notable tournament structures',
            'Online tournament milestones'
        ]
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        topics: [
            'Hand rankings and terminology',
            'Betting rules and structures',
            'Tournament rules (TDA)',
            'Cash game procedures',
            'Dealer responsibilities',
            'Table etiquette',
            'Common rule disputes'
        ]
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        topics: [
            'Range construction',
            'Pot odds and implied odds',
            'Position strategy',
            'Bet sizing concepts',
            'Balance and polarization',
            'Exploitative adjustments',
            'ICM and tournament theory'
        ]
    },
    // ── STRATEGY CATEGORIES ──
    // These back the mtt / cash / icm / gto modes and were absent from this
    // script entirely, so those modes could never be bootstrapped.
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        topics: [
            'Bubble play and ICM pressure',
            'Short stack strategy at 8-15BB',
            'Medium stack strategy at 25-40BB',
            'Big stack pressure and bullying',
            'Final table pay-jump spots',
            'Blind defence and resteals',
            'Satellite tournament strategy'
        ]
    },
    {
        id: 'cash_game_situations',
        name: 'Cash Game Situations',
        topics: [
            'Deep stack postflop play at 200BB+',
            'Set mining and implied odds',
            'Stack-to-pot ratio decisions',
            '3-bet and 4-bet pot navigation',
            'Float and probe betting',
            'Multiway pot decisions',
            'Exploiting recreational tendencies'
        ]
    },
    {
        id: 'icm_chip_ev',
        name: 'ICM & Chip EV',
        topics: [
            'Risk premium on bubble calls',
            'Bubble factor adjustments',
            'chipEV vs dollar EV divergence',
            'Nash push/fold ranges',
            'Satellite ICM with flat payouts',
            'Final table pay-jump ladders',
            'ICM deal-making and chops'
        ]
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        topics: [
            'C-betting by board texture',
            'River polarization and overbets',
            'MDF applications facing a bet',
            'Optimal 3-bet and 4-bet frequencies',
            'Blocker-driven bluff selection',
            'Node locking and exploitation',
            'Mixed-strategy river decisions'
        ]
    }
];

/** Per-category depth target. 20 questions/day x 60 days = 1,200 usable is the
 *  hard floor for a dedicated mode; 2,000 raw leaves headroom for the rows the
 *  factual audit demotes below the quality floor. */
const DEFAULT_TARGET_PER_CATEGORY = 2000;

/** 20/50/30 difficulty split, applied as a share of the per-category target. */
const DIFFICULTY_SHARES = { easy: 0.20, medium: 0.50, hard: 0.30 };

const BATCH_SIZE = 15; // Questions per API call

function difficultyTargets(perCategory) {
    return {
        easy: Math.round(perCategory * DIFFICULTY_SHARES.easy),
        medium: Math.round(perCategory * DIFFICULTY_SHARES.medium),
        hard: Math.round(perCategory * DIFFICULTY_SHARES.hard),
    };
}

/** Unbiased shuffle — used to spread the stored correct_index. */
function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Normalized existing question texts for a category, so a re-run cannot insert
 * a question the pool already holds.
 */
async function loadExistingTexts(categoryId) {
    const texts = new Set();
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('question')
            .eq('category', categoryId)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) {
            console.log(`   WARN dedup load failed: ${error.message}`);
            break;
        }
        const rows = data || [];
        if (rows.length === 0) break;
        for (const row of rows) {
            const norm = normalizeQuestionText(row?.question);
            if (norm) texts.add(norm);
        }
        if (rows.length < PAGE) break;
    }
    return texts;
}

async function getGrokClient() {
    const OpenAI = require('openai');
    return new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: 'https://api.x.ai/v1'
    });
}

async function generateBatch(grok, category, topic, difficulty, count) {
    const difficultyGuidelines = {
        easy: `
- Common knowledge most poker fans would know
- Basic facts often mentioned in poker media
- Simple statistics and dates
- Famous players everyone knows`,
        medium: `
- Requires solid poker knowledge
- Specific tournament results and statistics
- Strategy concepts that regular players understand
- Historical events poker enthusiasts would recall`,
        hard: `
- Expert-level deep knowledge required
- Obscure historical facts
- Specific hand details and exact figures
- Advanced strategy concepts
- Trivia only serious poker students would know`
    };

    const isStrategy = STRATEGY_CATEGORIES.includes(category.id);
    const scenarioRules = isStrategy
        ? `
SCENARIO REQUIREMENTS (strategy category — a question missing any of these is
rejected by the QA validator and the API call is wasted):
- State the effective stack in big blinds ("40BB effective").
- State the hero's position: UTG, MP, HJ, CO, BTN, SB or BB.
- State the hero's exact hole cards ("As Kd", "Th 9h") or shorthand ("AKo", "77", "T9s").
- Describe the action that created the decision.
- Tournament questions use the BIG BLIND ANTE (ante equals one big blind). Cash games have no ante.
- Never recommend an open-shove deeper than 20BB.
- Never offer a "raise" option when the hero faces an all-in at equal effective stacks.
- Never offer a draw/improve option on the river.`
        : `
FACTUAL REQUIREMENTS (fact category):
- Every answer must be verifiable from the public record: name the event, year, player or rule.
- Anchor any figure that changes over time to a stated year.
- If you are not certain of a fact, write a different question instead.`;

    const prompt = `Generate exactly ${count} unique ${difficulty.toUpperCase()} difficulty poker trivia questions.

Category: ${category.name}
Topic: ${topic}
Difficulty: ${difficulty}

DIFFICULTY GUIDELINES for ${difficulty}:
${difficultyGuidelines[difficulty]}
${scenarioRules}

UNIVERSAL REQUIREMENTS:
- Each question has EXACTLY 4 options and exactly ONE correct answer.
- VARY correct_index across the batch; do not always answer with the first option.
- Every wrong option must be genuinely tempting: right category of answer, similar length,
  similar specificity. No filler such as "none of the above" or "it doesn't matter".
- The question text must not leak the answer.
- Every explanation must be at least 2 sentences (120+ characters) and teach WHY the answer is
  right — cite the event/year/rule for facts, or the concept and the number for strategy.
- No two questions in the batch may test the same fact or decision.

Return ONLY this JSON object (no markdown):
{"questions":[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]}`;

    try {
        const response = await grok.chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: 'system',
                    content: `You are an expert poker historian and strategist creating ${difficulty} difficulty trivia questions. Focus on: ${topic}. Output ONLY valid JSON, never markdown.`
                },
                { role: 'user', content: prompt }
            ],
            // json_object mode + a calmer temperature. At 0.9 with no response
            // format, malformed batches were routine and silently discarded
            // after being billed.
            response_format: { type: 'json_object' },
            temperature: 0.7,
            max_tokens: 4000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
        }

        const parsed = JSON.parse(jsonStr);
        const questions = Array.isArray(parsed) ? parsed : parsed.questions || [];

        return questions
            .filter(q => q.question && q.options?.length === 4 && Number.isInteger(q.correct_index)
                && q.correct_index >= 0 && q.correct_index <= 3)
            .map(q => {
                // Shuffle BEFORE validation so the stored correct_index is not
                // biased toward 0 and the validator still sees a coherent row.
                const pairs = q.options.map((text, i) => ({
                    text: String(text).trim(),
                    wasCorrect: i === q.correct_index,
                }));
                shuffleInPlace(pairs);
                const newIndex = pairs.findIndex(p => p.wasCorrect);
                return {
                    category: category.id,
                    difficulty: difficulty,
                    question: q.question.trim(),
                    options: pairs.map(p => p.text),
                    correct_index: newIndex >= 0 ? newIndex : 0,
                    explanation: String(q.explanation || '').trim(),
                    subcategory: topic,
                    source: SOURCE_TAG,
                    quality_score: SEEDED_QUALITY_SCORE,
                    engine_metadata: { model: MODEL, topic, generated_at: new Date().toISOString() },
                };
            });
    } catch (error) {
        console.error(`  Error generating ${difficulty} for ${topic}: ${error.message}`);
        return [];
    }
}

async function getCurrentCounts(categories) {
    const counts = {};
    // Counts are issued in parallel per category — this used to be 3 serial
    // round trips per category (30 in total) before a single question was made.
    await Promise.all(categories.map(async (cat) => {
        const [easy, medium, hard] = await Promise.all(['easy', 'medium', 'hard'].map(diff =>
            supabase
                .from('trivia_questions')
                .select('id', { count: 'exact', head: true })
                .eq('category', cat.id)
                .eq('difficulty', diff)
                .then(({ count }) => count || 0)
        ));
        counts[cat.id] = { easy, medium, hard, total: easy + medium + hard };
    }));
    return counts;
}

async function main() {
    const perCategory = ARG_TARGET > 0 ? ARG_TARGET : DEFAULT_TARGET_PER_CATEGORY;
    const DIFFICULTY_TARGETS = difficultyTargets(perCategory);
    const categories = ARG_CATEGORY
        ? CATEGORIES.filter(c => c.id === ARG_CATEGORY)
        : CATEGORIES;

    console.log('\nTRIVIA QUESTION BOOTSTRAP');
    console.log('=========================');
    console.log(`  model:            ${MODEL}`);
    console.log(`  target/category:  ${perCategory} (easy ${DIFFICULTY_TARGETS.easy} / medium ${DIFFICULTY_TARGETS.medium} / hard ${DIFFICULTY_TARGETS.hard})`);
    console.log(`  categories:       ${categories.map(c => c.id).join(', ')}`);
    console.log(`  mode:             ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

    if (categories.length === 0) {
        console.error(`Unknown category: ${ARG_CATEGORY}`);
        console.error(`Valid: ${CATEGORIES.map(c => c.id).join(', ')}`);
        process.exit(1);
    }
    if (!process.env.XAI_API_KEY) {
        console.error('XAI_API_KEY not found in .env.local');
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
        process.exit(1);
    }

    const grok = await getGrokClient();

    console.log('Checking current question counts...\n');
    const currentCounts = await getCurrentCounts(categories);

    let totalGenerated = 0;
    let totalDuplicates = 0;
    let totalQaRejected = 0;

    for (const category of categories) {
        console.log(`\n[${category.name}]`);
        console.log(`   Current: easy ${currentCounts[category.id].easy} | medium ${currentCounts[category.id].medium} | hard ${currentCounts[category.id].hard}`);

        // Loaded ONCE per category and updated in memory as rows are inserted.
        // Without this, a re-run below target inserted paraphrases of questions
        // the pool already held.
        const existingTexts = await loadExistingTexts(category.id);
        console.log(`   Existing normalized question texts: ${existingTexts.size}`);

        for (const [difficulty, target] of Object.entries(DIFFICULTY_TARGETS)) {
            const current = currentCounts[category.id][difficulty];
            const needed = Math.max(0, target - current);

            if (needed === 0) {
                console.log(`   ${difficulty}: already at target (${target})`);
                continue;
            }

            console.log(`   ${difficulty}: generating ${needed} questions...`);

            let generated = 0;
            let batchNum = 0;
            let consecutiveEmpty = 0;
            // Allow 3x the theoretical batch count so validator rejections and
            // duplicates do not stop the run short of target.
            const maxBatches = Math.ceil(needed / BATCH_SIZE) * 3;

            while (generated < needed && batchNum < maxBatches) {
                const topic = category.topics[batchNum % category.topics.length];
                const batchSize = Math.min(BATCH_SIZE, needed - generated);

                process.stdout.write(`      batch ${batchNum + 1}: ${topic.slice(0, 34).padEnd(34)} `);

                const questions = await generateBatch(grok, category, topic, difficulty, batchSize);

                if (questions.length === 0) {
                    console.log('no questions returned');
                    consecutiveEmpty++;
                    // Back off on repeated failures rather than hammering the API.
                    if (consecutiveEmpty >= 4) {
                        console.log('      4 empty batches in a row — moving on');
                        break;
                    }
                    batchNum++;
                    await new Promise(r => setTimeout(r, 2000 * consecutiveEmpty));
                    continue;
                }
                consecutiveEmpty = 0;

                // ═══ QA VALIDATION + DEDUP GATE ═══
                const { valid: validQuestions, rejected } = validateBatch(questions, { existingTexts });
                const dupes = rejected.filter(r => r.errors.some(e => e.startsWith('DUP-'))).length;
                totalDuplicates += dupes;
                totalQaRejected += rejected.length - dupes;

                if (validQuestions.length === 0) {
                    console.log(`all ${questions.length} rejected (${dupes} dup, ${rejected.length - dupes} QA)`);
                    batchNum++;
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                if (DRY_RUN) {
                    generated += validQuestions.length;
                    totalGenerated += validQuestions.length;
                    console.log(`would insert ${validQuestions.length} (${generated}/${needed}, ${dupes} dup, ${rejected.length - dupes} QA)`);
                } else {
                    const { data, error } = await supabase
                        .from('trivia_questions')
                        .insert(validQuestions)
                        .select('id');

                    if (error) {
                        console.log(`insert error: ${error.message}`);
                    } else {
                        generated += data.length;
                        totalGenerated += data.length;
                        console.log(`+${data.length} (${generated}/${needed}, ${dupes} dup, ${rejected.length - dupes} QA)`);
                    }
                }

                // Feed accepted rows back into the dedup set immediately so the
                // NEXT batch in this run cannot repeat them either.
                for (const q of validQuestions) {
                    const norm = normalizeQuestionText(q.question);
                    if (norm) existingTexts.add(norm);
                }

                batchNum++;
                await new Promise(r => setTimeout(r, 1000)); // rate limiting
            }
        }
    }

    console.log(`\nRejections this run: ${totalDuplicates} duplicates, ${totalQaRejected} QA failures.`);

    // Final summary
    console.log('\n\nFINAL SUMMARY');
    console.log('=============\n');

    const finalCounts = await getCurrentCounts(CATEGORIES);
    let grandTotal = 0;

    console.log('Category              | Easy  | Medium | Hard  | Total');
    console.log('----------------------|-------|--------|-------|------');

    for (const cat of CATEGORIES) {
        const c = finalCounts[cat.id];
        grandTotal += c.total;
        console.log(`${cat.name.padEnd(21)} | ${String(c.easy).padStart(5)} | ${String(c.medium).padStart(6)} | ${String(c.hard).padStart(5)} | ${String(c.total).padStart(5)}`);
    }

    console.log('----------------------|-------|--------|-------|------');
    console.log(`TOTAL                 |       |        |       | ${grandTotal}`);
    console.log(`\nGenerated ${totalGenerated} new questions this run.`);
    console.log(`Target: ${CATEGORIES.length * perCategory} questions (${perCategory} per category).`);
    console.log('Run scripts/trivia-pool-report.js to see depth against the 60-day guarantee.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
