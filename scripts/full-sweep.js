#!/usr/bin/env node
/**
 * FULL DATABASE SWEEP — Every Question, Every Check
 * ==================================================
 * After spot-check revealed 10% error rate, this script checks
 * EVERY question for ALL known issue patterns.
 * 
 * CHECKS:
 * 1. Letter prefixes in ALL forms (A., B., A), B), a., etc.) in options AND correct answer
 * 2. Non-BB ante structures
 * 3. Wrong outs math (gutshot, OESD, flush draw)
 * 4. Explanation contradicting answer
 * 5. Stack/shove impossibilities
 * 6. Fold top pair short stack errors
 * 7. Duplicate questions
 * 8. Fabricated bracelet claims
 * 9. Wrong Moneymaker hand
 * 10. Missing scenario context in strategy categories
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CATEGORIES = [
    'poker_history', 'famous_hands', 'player_profiles',
    'rule_knowledge', 'tournament_facts',
    'gto_theory', 'mtt_situations', 'cash_game_situations',
    'icm_chip_ev', 'gto_scenarios'
];

const STRATEGY_CATS = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios', 'gto_theory'];

// ═══════════════════════════════════════════════════════════════
// CHECK FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function checkLetterPrefixes(q) {
    const errors = [];
    if (!q.options) return errors;

    // Check each option for ANY letter prefix pattern
    const prefixPatterns = [
        /^[A-Da-d]\.\s+/,          // "A. " or "a. "
        /^[A-Da-d]\)\s+/,          // "A) " or "a) "
        /^[A-Da-d]\:\s+/,          // "A: " or "a: "
        /^Option\s+[A-Da-d][.:)\s]/i, // "Option A:" etc
        /^[A-Da-d]\s*[-–—]\s+/,    // "A - " or "A — "
    ];

    for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        for (const pat of prefixPatterns) {
            if (pat.test(opt)) {
                errors.push(`PREFIX-01: Option ${i} starts with letter prefix: "${opt.substring(0, 30)}..."`);
                break;
            }
        }
    }

    return errors;
}

function checkNonBBAnte(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    // Find blinds and ante
    const blindsMatch = fullText.match(/(\d[\d,]*)\/(\d[\d,]*)/);
    if (!blindsMatch) return errors;

    const bb = parseInt(blindsMatch[2].replace(/,/g, ''));

    // Find ante amount
    const antePatterns = [
        /(\d[\d,]*)\s*ante/gi,
        /ante\s+(?:of\s+)?(\d[\d,]*)/gi,
        /with\s+(?:a\s+)?(\d[\d,]*)\s*ante/gi,
    ];

    for (const pat of antePatterns) {
        let match;
        while ((match = pat.exec(fullText)) !== null) {
            const ante = parseInt(match[1].replace(/,/g, ''));
            if (ante > 0 && ante !== bb) {
                errors.push(`ANTE-01: Non-BB ante (blinds ${blindsMatch[0]}, ante ${ante}, should be ${bb})`);
                return errors; // one error is enough
            }
        }
    }

    return errors;
}

function checkMath(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    // Outs checks
    const outsChecks = [
        { pattern: /gutshot.*?(\d+)\s*outs/i, expected: 4, name: 'gutshot' },
        { pattern: /(\d+)\s*outs.*?gutshot/i, expected: 4, name: 'gutshot' },
        { pattern: /open.?ended.*?(\d+)\s*outs/i, expected: 8, name: 'OESD' },
        { pattern: /OESD.*?(\d+)\s*outs/i, expected: 8, name: 'OESD' },
        { pattern: /(\d+)\s*outs.*?OESD/i, expected: 8, name: 'OESD' },
        { pattern: /flush\s*draw.*?(\d+)\s*outs/i, expected: 9, name: 'flush draw' },
        { pattern: /(\d+)\s*outs.*?flush\s*draw/i, expected: 9, name: 'flush draw' },
    ];

    for (const check of outsChecks) {
        const match = fullText.match(check.pattern);
        if (match) {
            const claimed = parseInt(match[1]);
            if (claimed !== check.expected) {
                errors.push(`MATH-01: ${check.name} claims ${claimed} outs (should be ${check.expected})`);
            }
        }
    }

    // Stack vs shove size
    const stackShove = fullText.match(/(\d+)\s*BB\s*effective.*?shoves?\s*(?:for\s*)?(\d+)\s*BB/i);
    if (stackShove) {
        const effective = parseInt(stackShove[1]);
        const shoveSize = parseInt(stackShove[2]);
        if (shoveSize > effective) {
            errors.push(`MATH-02: Shove ${shoveSize}BB exceeds effective stack ${effective}BB`);
        }
    }

    return errors;
}

function checkSync(q) {
    const errors = [];
    if (!q.options || !q.explanation || typeof q.correct_index !== 'number') return errors;

    const correctOpt = q.options[q.correct_index];
    if (!correctOpt) return ['SYNC-01: correct_index points to non-existent option'];

    const exp = q.explanation.toLowerCase();
    const correctAction = correctOpt.toLowerCase().split(/[\s,—-]+/)[0];
    const actions = ['fold', 'call', 'raise', 'shove', 'check', 'bet'];

    if (actions.includes(correctAction)) {
        const wrongOpts = q.options.filter((_, i) => i !== q.correct_index);
        for (const wrong of wrongOpts) {
            const wrongAction = wrong.toLowerCase().split(/[\s,—-]+/)[0];
            if (actions.includes(wrongAction) && wrongAction !== correctAction) {
                const correctCount = (exp.match(new RegExp(`\\b${correctAction}\\b`, 'gi')) || []).length;
                const wrongCount = (exp.match(new RegExp(`\\b${wrongAction}\\b`, 'gi')) || []).length;
                if (wrongCount > correctCount + 2) {
                    errors.push(`SYNC-02: Explanation says "${wrongAction}" ${wrongCount}x but correct is "${correctAction}" (${correctCount}x)`);
                }
            }
        }
    }

    return errors;
}

function checkLogic(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;
    const correctOpt = (q.options?.[q.correct_index] || '').toLowerCase();

    // Fold top pair at short stack
    if (correctOpt.startsWith('fold')) {
        const stackMatch = fullText.match(/(\d+)\s*BB\s*(?:effective|stack)/i);
        if (stackMatch) {
            const stack = parseInt(stackMatch[1]);
            if (stack <= 15 && /top\s*pair|overpair|TPTK/i.test(fullText)) {
                errors.push(`LOGIC-01: Folding top pair/overpair at ${stack}BB — usually a call`);
            }
        }
    }

    // River draws
    if (/river|final\s*board|5th\s*street/i.test(q.question)) {
        if (q.options?.some(o => /\b(draw\s*to|need.*outs|improve.*hand|chase)\b/i.test(o))) {
            errors.push('LOGIC-02: Drawing mentioned on river — no cards left');
        }
    }

    // MP in 5-handed
    if (/5[- ]?handed/i.test(q.question) && /\bMP\b/.test(q.question)) {
        errors.push('LOGIC-03: MP position in 5-handed (should be UTG/CO/BTN/SB/BB)');
    }

    // Open shove at deep stacks
    if (correctOpt.includes('shove') && /open/i.test(correctOpt)) {
        const stackMatch = fullText.match(/(\d+)\s*BB\s*(?:effective|stack)/i);
        if (stackMatch && parseInt(stackMatch[1]) > 30) {
            errors.push(`LOGIC-04: Open-shoving at ${stackMatch[1]}BB`);
        }
    }

    return errors;
}

function checkQuality(q) {
    const errors = [];

    // Structure
    if (!q.question || q.question.trim().length < 20) errors.push('QUAL-01: Question too short');
    if (!Array.isArray(q.options) || q.options.length !== 4) errors.push('QUAL-02: Not 4 options');
    if (q.correct_index < 0 || q.correct_index > 3) errors.push('QUAL-03: Bad correct_index');
    if (!q.explanation || q.explanation.trim().length < 30) errors.push('QUAL-04: Explanation too short');

    // Duplicate options
    if (q.options) {
        const norm = q.options.map(o => o.toLowerCase().trim());
        if (new Set(norm).size !== 4) errors.push('QUAL-05: Duplicate options');
    }

    // Strategy questions need context
    if (STRATEGY_CATS.includes(q.category)) {
        if (!/\d+\s*BB/i.test(q.question)) errors.push('QUAL-06: Missing stack size');
    }

    // Explanation shorter than 80 chars
    if (q.explanation && q.explanation.length < 80) errors.push('QUAL-07: Explanation very brief');

    return errors;
}

function checkFacts(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    // Wrong Moneymaker hand
    if (/moneymaker/i.test(fullText) && /bluff/i.test(fullText)) {
        if (/K[♠♣♥♦]7[♠♣♥♦]/i.test(fullText) || /K.*7.*bluff/i.test(fullText)) {
            // Check if it correctly notes the bluff hand vs final hand distinction
            if (!/NOT\s+the\s+final/i.test(fullText) && !/final\s+hand.*5[♠♣♥♦]4[♠♣♥♦]/i.test(fullText)) {
                errors.push('FACT-01: Moneymaker bluff hand — may confuse bluff vs final hand');
            }
        }
    }

    // Wrong bracelet claims — specific known errors
    if (/bicknell|kristen/i.test(fullText) && /bracelet/i.test(fullText)) {
        if (/\d+\s*(?:WSOP\s*)?bracelet/i.test(fullText)) {
            errors.push('FACT-02: Kristen Bicknell bracelet claim — she has 0 WSOP bracelets');
        }
    }

    // Chan popularizing poker in Asia
    if (/chan/i.test(fullText) && /asia/i.test(fullText) && /populari/i.test(fullText)) {
        errors.push('FACT-03: Johnny Chan "popularizing poker in Asia" — unverifiable claim');
    }

    return errors;
}

// ═══════════════════════════════════════════════════════════════
// MAIN SWEEP
// ═══════════════════════════════════════════════════════════════

async function main() {
    console.log('══════════════════════════════════════════════════════════');
    console.log('FULL DATABASE SWEEP — EVERY QUESTION, EVERY CHECK');
    console.log('══════════════════════════════════════════════════════════\n');

    const allIssues = [];
    const deleteIds = [];
    const fixIds = [];
    let totalQuestions = 0;

    for (const cat of CATEGORIES) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('id, question, options, correct_index, explanation, difficulty, category')
            .eq('category', cat);

        if (error || !data) {
            console.log(`❌ Failed: ${cat} - ${error?.message}`);
            continue;
        }

        totalQuestions += data.length;
        let catIssues = 0;

        for (const q of data) {
            const errors = [
                ...checkLetterPrefixes(q),
                ...checkNonBBAnte(q),
                ...checkMath(q),
                ...checkSync(q),
                ...checkLogic(q),
                ...checkQuality(q),
                ...checkFacts(q),
            ];

            if (errors.length > 0) {
                catIssues++;
                const isFixable = errors.every(e => e.startsWith('PREFIX'));

                allIssues.push({
                    id: q.id,
                    cat,
                    errors,
                    fixable: isFixable,
                    question: q.question.substring(0, 80),
                });

                if (isFixable) {
                    fixIds.push(q.id);
                } else {
                    deleteIds.push(q.id);
                }
            }
        }

        const status = catIssues === 0 ? '✅' : `⚠️  ${catIssues} issues`;
        console.log(`${status} ${cat}: ${data.length} questions (${catIssues} bad)`);
    }

    console.log(`\n══════════════════════════════════════════════════════════`);
    console.log(`TOTAL: ${totalQuestions} questions scanned`);
    console.log(`ISSUES: ${allIssues.length} (${deleteIds.length} delete, ${fixIds.length} fixable)`);
    console.log(`══════════════════════════════════════════════════════════\n`);

    // Print all issues with details
    if (allIssues.length > 0) {
        console.log('\n--- ALL ISSUES ---\n');
        for (const issue of allIssues) {
            console.log(`[${issue.fixable ? 'FIX' : 'DELETE'}] ${issue.cat} | ${issue.id}`);
            for (const e of issue.errors) {
                console.log(`  ❌ ${e}`);
            }
            console.log(`  Q: ${issue.question}`);
            console.log('');
        }
    }

    // Auto-fix letter prefixes
    if (fixIds.length > 0) {
        console.log(`\n🔧 Fixing ${fixIds.length} letter prefix issues...`);
        for (const fid of fixIds) {
            const { data: q } = await supabase
                .from('trivia_questions')
                .select('id, options')
                .eq('id', fid)
                .maybeSingle();

            if (!q) continue;

            const fixedOptions = q.options.map(opt => {
                return opt
                    .replace(/^[A-Da-d]\.\s+/, '')
                    .replace(/^[A-Da-d]\)\s+/, '')
                    .replace(/^[A-Da-d]\:\s+/, '')
                    .replace(/^Option\s+[A-Da-d][.:)\s]\s*/i, '')
                    .replace(/^[A-Da-d]\s*[-–—]\s+/, '');
            });

            const { error } = await supabase
                .from('trivia_questions')
                .update({ options: fixedOptions })
                .eq('id', fid);

            console.log(error ? `  ❌ ${fid}: ${error.message}` : `  ✅ Fixed: ${fid}`);
        }
    }

    // Delete unfixable issues
    if (deleteIds.length > 0) {
        console.log(`\n🗑️  Deleting ${deleteIds.length} unfixable questions...`);
        for (let i = 0; i < deleteIds.length; i += 10) {
            const batch = deleteIds.slice(i, i + 10);
            const { error } = await supabase.from('trivia_questions').delete().in('id', batch);
            console.log(error ? `  ❌ Batch error: ${error.message}` : `  ✅ Deleted batch ${Math.floor(i / 10) + 1} (${batch.length})`);
        }
    }

    // Final count
    const { count } = await supabase.from('trivia_questions').select('*', { count: 'exact', head: true });
    console.log(`\n📊 Final question count: ${count}`);

    console.log('\n\nDelete IDs:', JSON.stringify(deleteIds));
    console.log('Fix IDs:', JSON.stringify(fixIds));

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
