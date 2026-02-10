#!/usr/bin/env node
/**
 * Verify famous hands question and check all option prefixes in detail
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // Get the specific question
    const { data } = await s.from('trivia_questions')
        .select('id, question, options, correct_index, explanation')
        .ilike('question', '%Stu Ungar%third%Main Event%');

    if (data && data[0]) {
        const q = data[0];
        console.log('=== Stu Ungar Question ===');
        console.log('Q:', q.question);
        console.log('');
        q.options.forEach((o, i) => {
            const marker = i === q.correct_index ? '✅' : '  ';
            console.log(`${marker} ${i}: "${o}"`);
        });
        console.log('');
        console.log('Explanation:', q.explanation.substring(0, 200));
    }

    // Now check all 1944 questions for options starting with "A. ", "B. ", "C. ", "D. " ONLY (strict) 
    console.log('\n\n=== STRICT PREFIX CHECK (only actual letter prefixes) ===\n');

    const { data: all } = await s.from('trivia_questions').select('id, options, question, category');
    let count = 0;

    for (const q of all) {
        if (!q.options) continue;
        for (let i = 0; i < q.options.length; i++) {
            const opt = q.options[i];
            // Only match actual letter prefixes, NOT poker hands like "A-5"
            // These patterns: "A. ", "A) ", "B. ", etc — but NOT "A-5" or "A-high"
            if (/^[A-Da-d]\.\s/.test(opt) || /^[A-Da-d]\)\s/.test(opt)) {
                count++;
                console.log(`[PREFIX] ${q.category} | ${q.id}`);
                console.log(`  Opt ${i}: "${opt.substring(0, 60)}"`);
                console.log(`  Q: ${q.question.substring(0, 80)}`);
                console.log('');
            }
        }
    }

    console.log(`Total actual letter prefix issues: ${count}`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
