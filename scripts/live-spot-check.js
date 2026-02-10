#!/usr/bin/env node
/**
 * LIVE SPOT-CHECK — Pull 2 random questions per category for expert review
 * Final pre-launch quality gate before human trials
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

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  LIVE SPOT-CHECK — 2 Random Questions Per Category');
    console.log('  Pre-Launch Quality Gate');
    console.log('═══════════════════════════════════════════════════════════\n');

    for (const cat of CATEGORIES) {
        // Get total count for this category
        const { count } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat);

        // Pick 2 random offsets
        const offset1 = Math.floor(Math.random() * count);
        let offset2 = Math.floor(Math.random() * count);
        while (offset2 === offset1 && count > 1) offset2 = Math.floor(Math.random() * count);

        const { data: q1 } = await supabase
            .from('trivia_questions')
            .select('id, question, options, correct_index, explanation, difficulty')
            .eq('category', cat)
            .range(offset1, offset1);

        const { data: q2 } = await supabase
            .from('trivia_questions')
            .select('id, question, options, correct_index, explanation, difficulty')
            .eq('category', cat)
            .range(offset2, offset2);

        const questions = [...(q1 || []), ...(q2 || [])];

        console.log('╔══════════════════════════════════════════════════════════');
        console.log(`║ CATEGORY: ${cat.toUpperCase()} (${count} total)`);
        console.log('╚══════════════════════════════════════════════════════════\n');

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const letters = ['A', 'B', 'C', 'D'];
            console.log(`  [Q${i + 1}] [${q.difficulty}] ID: ${q.id}`);
            console.log(`  ${q.question}`);
            console.log('');
            q.options.forEach((opt, idx) => {
                const marker = idx === q.correct_index ? '✅' : '  ';
                console.log(`    ${marker} ${letters[idx]}) ${opt}`);
            });
            console.log('');
            console.log(`  📝 ${q.explanation}`);
            console.log('  ─────────────────────────────────────────────────');
            console.log('');
        }
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
