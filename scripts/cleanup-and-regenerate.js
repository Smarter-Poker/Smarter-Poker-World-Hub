#!/usr/bin/env node
/**
 * TRIVIA DB CLEANUP & REGENERATION
 * ==================================
 * 1. Runs full QA validation on all DB questions
 * 2. DELETES questions that fail validation (not just un-tags)
 * 3. Regenerates replacements through the validated pipeline
 * 
 * Usage:
 *   node scripts/cleanup-and-regenerate.js              # Audit only (dry run)
 *   node scripts/cleanup-and-regenerate.js --delete      # Delete bad questions
 *   node scripts/cleanup-and-regenerate.js --regenerate  # Delete + regenerate
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { validateBatch, validateQuestion, STRATEGY_CATEGORIES } = require('./trivia-qa-validator');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1'
});

// Same AG-1 V12 system prompt from bootstrap
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
- Jeff Lisandro: 3 bracelets in 2009
- QJ on T-8-x = GUTSHOT (not OESD). QJ on T-9-x = OESD.
- MDF for pot-sized bet = 50%. MDF for 2x pot = 33%.

CRITICAL STRATEGY RULES:
- When facing an ALL-IN / SHOVE, the only valid responses are CALL or FOLD. Never include "Raise" as an option.
- In satellites: survival > chip accumulation. Fold premium hands when statistically safe.
- At 12BB: open-shove, not open-raise.
- 5-handed tables: positions are UTG/CO/BTN/SB/BB (NO MP)
- Pot odds must be mathematically consistent with the scenario described.

Return ONLY valid JSON array. No markdown, no explanation outside JSON.
Format: [{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"..."}]`;

const ALL_CATEGORIES = [
    'poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge',
    'tournament_facts', 'gto_theory', 'mtt_situations', 'cash_game_situations',
    'icm_chip_ev', 'gto_scenarios'
];

async function generateReplacements(category, count, existingTexts) {
    const categoryNames = {
        'mtt_situations': 'MTT Situations',
        'cash_game_situations': 'Cash Game Situations',
        'icm_chip_ev': 'ICM & Chip EV',
        'gto_scenarios': 'GTO Scenarios',
        'gto_theory': 'GTO Theory',
        'poker_history': 'Poker History',
        'famous_hands': 'Famous Hands',
        'player_profiles': 'Player Profiles',
        'rule_knowledge': 'Rules & Etiquette',
        'tournament_facts': 'Tournament Facts',
    };

    const prompt = `Generate exactly ${count} unique MEDIUM/HARD poker trivia questions.

Category: ${categoryNames[category] || category}

QUALITY STANDARDS (V12 — ZERO TOLERANCE):
- Every question MUST be scenario-based with specific context
- For strategy: include stack sizes, positions, hole cards, board textures
- For history/facts: include specific years, names, amounts — VERIFIED ONLY
- Math MUST be exact (gutshot=4 outs, OESD=8 outs, flush draw=9 outs)
- When villain shoves all-in, the ONLY valid responses are CALL or FOLD (never raise)
- Pot odds must be mathematically correct for the described scenario
- Randomize correct answer placement across 0,1,2,3
- NO joke answers, NO definitions-only, NO filler options

AVOID THESE EXISTING TOPICS: ${existingTexts.slice(-15).map(q => q.substring(0, 50)).join('; ')}

Return ONLY a valid JSON array:
[{"question":"...","options":["Option A","Option B","Option C","Option D"],"correct_index":0,"explanation":"..."}]`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                { role: 'system', content: AG1_V12_SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            temperature: 0.8,
            max_tokens: 8000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) return [];

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
                category,
                difficulty: 'medium',
                question: q.question.trim(),
                options: q.options.map(o => String(o).trim()),
                correct_index: q.correct_index,
                explanation: (q.explanation || '').trim(),
            }));
    } catch (error) {
        console.error(`  ❌ Generation error: ${error.message}`);
        return [];
    }
}

async function main() {
    const args = process.argv.slice(2);
    const shouldDelete = args.includes('--delete') || args.includes('--regenerate');
    const shouldRegenerate = args.includes('--regenerate');

    console.log('\n🔬 TRIVIA QA — FULL DATABASE AUDIT');
    console.log('====================================');
    console.log(`Mode: ${shouldRegenerate ? 'DELETE + REGENERATE' : shouldDelete ? 'DELETE BAD' : 'AUDIT ONLY'}\n`);

    let totalValid = 0;
    let totalInvalid = 0;
    const invalidByCat = {};

    // Phase 1: Full audit
    for (const cat of ALL_CATEGORIES) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('*')
            .eq('category', cat);

        if (error || !data) {
            console.error(`Error fetching ${cat}:`, error?.message);
            continue;
        }

        const { valid, rejected } = validateBatch(data);
        totalValid += valid.length;
        totalInvalid += rejected.length;
        invalidByCat[cat] = rejected;

        const pct = data.length > 0 ? Math.round(valid.length / data.length * 100) : 100;
        const icon = pct === 100 ? '✅' : pct >= 80 ? '⚠️' : '❌';
        console.log(`${icon} ${cat.padEnd(25)} ${String(data.length).padStart(4)} total | ${String(valid.length).padStart(4)} valid | ${String(rejected.length).padStart(4)} bad | ${pct}% pass`);

        if (rejected.length > 0) {
            // Show top 3 errors for this category
            const errorCodes = {};
            rejected.forEach(r => r.errors.forEach(e => {
                const code = e.split(':')[0];
                errorCodes[code] = (errorCodes[code] || 0) + 1;
            }));
            const topErrors = Object.entries(errorCodes).sort((a, b) => b[1] - a[1]).slice(0, 3);
            topErrors.forEach(([code, count]) => {
                console.log(`     ${code}: ${count}x`);
            });
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 TOTAL: ${totalValid + totalInvalid} questions | ✅ ${totalValid} valid | ❌ ${totalInvalid} invalid`);
    console.log(`   Pass Rate: ${Math.round(totalValid / (totalValid + totalInvalid) * 100)}%`);
    console.log(`${'═'.repeat(60)}`);

    // Phase 2: Delete bad questions
    if (shouldDelete && totalInvalid > 0) {
        console.log(`\n🗑️  PHASE 2: DELETING ${totalInvalid} invalid questions...\n`);

        for (const [cat, rejected] of Object.entries(invalidByCat)) {
            if (rejected.length === 0) continue;

            const badIds = rejected.map(r => r.question.id).filter(Boolean);
            if (badIds.length === 0) continue;

            const { error: delError } = await supabase
                .from('trivia_questions')
                .delete()
                .in('id', badIds);

            if (delError) {
                console.error(`  ❌ ${cat}: Delete failed — ${delError.message}`);
            } else {
                console.log(`  🗑️  ${cat}: Deleted ${badIds.length} bad questions`);
            }
        }
    }

    // Phase 3: Regenerate replacements
    if (shouldRegenerate && totalInvalid > 0) {
        console.log(`\n⚡ PHASE 3: REGENERATING ${totalInvalid} replacement questions...\n`);

        let totalRegenerated = 0;
        let totalAttempts = 0;

        for (const [cat, rejected] of Object.entries(invalidByCat)) {
            const needed = rejected.length;
            if (needed === 0) continue;

            console.log(`\n📂 ${cat}: Need ${needed} replacements`);

            // Get existing questions for dedup
            const { data: existing } = await supabase
                .from('trivia_questions')
                .select('question')
                .eq('category', cat)
                .limit(50);
            const existingTexts = (existing || []).map(q => q.question);

            let generated = 0;
            let attempts = 0;
            const MAX_ATTEMPTS = Math.ceil(needed / 5) + 3; // Allow retries

            while (generated < needed && attempts < MAX_ATTEMPTS) {
                attempts++;
                totalAttempts++;
                const batchSize = Math.min(10, needed - generated);

                process.stdout.write(`   Attempt ${attempts}: generating ${batchSize}... `);

                const raw = await generateReplacements(cat, batchSize, existingTexts);

                if (raw.length === 0) {
                    console.log('❌ No output');
                    continue;
                }

                // Run through QA validator
                const { valid: validQs, rejected: rejectedQs } = validateBatch(raw);

                if (rejectedQs.length > 0) {
                    console.log(`🛡️ ${rejectedQs.length}/${raw.length} rejected by QA`);
                    rejectedQs.forEach(r => {
                        r.errors.slice(0, 2).forEach(e => console.log(`      → ${e}`));
                    });
                }

                if (validQs.length > 0) {
                    const { data, error } = await supabase
                        .from('trivia_questions')
                        .insert(validQs)
                        .select();

                    if (!error && data) {
                        generated += data.length;
                        totalRegenerated += data.length;
                        data.forEach(q => existingTexts.push(q.question));
                        console.log(`✅ +${data.length} inserted (${generated}/${needed})`);
                    } else {
                        console.log(`❌ Insert error: ${error?.message}`);
                    }
                } else if (rejectedQs.length === 0) {
                    console.log('⚠️ Empty batch');
                }

                // Rate limit
                await new Promise(r => setTimeout(r, 2000));
            }

            console.log(`   📊 ${cat}: ${generated}/${needed} regenerated`);
        }

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`⚡ REGENERATION COMPLETE: ${totalRegenerated} new questions (${totalAttempts} attempts)`);
        console.log(`${'═'.repeat(60)}`);

        // Phase 4: Final verification
        console.log('\n🔍 PHASE 4: FINAL VERIFICATION...\n');

        let finalValid = 0;
        let finalTotal = 0;

        for (const cat of ALL_CATEGORIES) {
            const { data } = await supabase
                .from('trivia_questions')
                .select('*')
                .eq('category', cat);

            if (!data) continue;

            const { valid } = validateBatch(data);
            finalValid += valid.length;
            finalTotal += data.length;

            const pct = data.length > 0 ? Math.round(valid.length / data.length * 100) : 100;
            console.log(`   ${pct === 100 ? '✅' : '⚠️'} ${cat.padEnd(25)} ${valid.length}/${data.length} valid (${pct}%)`);
        }

        console.log(`\n   📊 FINAL: ${finalValid}/${finalTotal} valid (${Math.round(finalValid / finalTotal * 100)}%)`);
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
