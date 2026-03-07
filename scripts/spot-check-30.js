#!/usr/bin/env node
/**
 * Verify specific question has 4 options, then spot-check 3 per category (30 total)
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CATS = ['poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge', 'tournament_facts',
    'gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

async function main() {
    // Verify the question that appeared to have 3 options
    const { data: verify } = await s.from('trivia_questions').select('id, options').eq('id', '37ceeadf-2ef2-4102-b9c7-37f063c02ee2').maybeSingle();
    if (verify) {
        console.log(`Verify Q 37ceeadf: ${verify.options.length} options`);
        verify.options.forEach((o, i) => console.log(`  ${i}: ${o.substring(0, 60)}`));
    }
    console.log('');

    // Spot-check 3 per category = 30 total
    let issueCount = 0;
    for (const cat of CATS) {
        const { count } = await s.from('trivia_questions').select('*', { count: 'exact', head: true }).eq('category', cat);

        // Pick 3 random offsets
        const offsets = new Set();
        while (offsets.size < 3 && offsets.size < count) {
            offsets.add(Math.floor(Math.random() * count));
        }

        console.log(`\n=== ${cat.toUpperCase()} (${count} total) ===`);

        for (const offset of offsets) {
            const { data } = await s.from('trivia_questions')
                .select('id, question, options, correct_index, explanation, difficulty')
                .eq('category', cat)
                .range(offset, offset);

            if (!data || !data[0]) continue;
            const q = data[0];
            const letters = ['A', 'B', 'C', 'D'];

            // Check for issues
            const issues = [];

            // Letter prefix check
            for (let i = 0; i < q.options.length; i++) {
                if (/^[A-Da-d][.):\s-]\s*/i.test(q.options[i])) {
                    issues.push(`Option ${i} has letter prefix: "${q.options[i].substring(0, 30)}"`);
                }
            }

            // Non-BB ante check
            const fullText = q.question + ' ' + (q.explanation || '');
            const blinds = fullText.match(/(\d[\d,]*)\/(\d[\d,]*)/);
            if (blinds) {
                const bb = parseInt(blinds[2].replace(/,/g, ''));
                const anteMatch = fullText.match(/(\d[\d,]*)\s*ante/i);
                if (anteMatch) {
                    const ante = parseInt(anteMatch[1].replace(/,/g, ''));
                    if (ante > 0 && ante !== bb) {
                        issues.push(`Non-BB ante: blinds ${blinds[0]}, ante ${ante}`);
                    }
                }
            }

            // Options count
            if (q.options.length !== 4) issues.push(`Only ${q.options.length} options`);

            // Print
            const status = issues.length === 0 ? '✅' : '❌';
            console.log(`${status} [${q.difficulty}] ${q.question.substring(0, 100)}`);
            console.log(`   Answer: ${letters[q.correct_index]}) ${q.options[q.correct_index].substring(0, 60)}`);

            if (issues.length > 0) {
                issueCount++;
                for (const iss of issues) console.log(`   ⚠️  ${iss}`);
            }
        }
    }

    console.log(`\n\n${'═'.repeat(60)}`);
    console.log(`SPOT-CHECK COMPLETE: 30 questions, ${issueCount} issues`);
    console.log(`${'═'.repeat(60)}`);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
