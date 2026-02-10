#!/usr/bin/env node
/**
 * Delete remaining sync-issue questions in icm_chip_ev
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
    // Check ALL categories for sync issues (not just icm_chip_ev)
    const cats = ['poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge', 'tournament_facts',
        'gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

    const badIds = [];

    for (const cat of cats) {
        const { data } = await s.from('trivia_questions')
            .select('id, question, explanation, options, correct_index')
            .eq('category', cat);

        if (!data) continue;

        for (const q of data) {
            const exp = (q.explanation || '').toLowerCase();
            const correctOpt = q.options[q.correct_index] || '';
            const correctAction = correctOpt.toLowerCase().split(/[\s,\u2014-]+/)[0];
            const actions = ['fold', 'call', 'raise', 'shove', 'check', 'bet'];

            if (!actions.includes(correctAction)) continue;

            const wrongOpts = q.options.filter((_, i) => i !== q.correct_index);
            for (const w of wrongOpts) {
                const wa = w.toLowerCase().split(/[\s,\u2014-]+/)[0];
                if (actions.includes(wa) && wa !== correctAction) {
                    const cc = (exp.match(new RegExp('\\b' + escapeRegex(correctAction) + '\\b', 'gi')) || []).length;
                    const wc = (exp.match(new RegExp('\\b' + escapeRegex(wa) + '\\b', 'gi')) || []).length;
                    if (wc > cc + 2) {
                        badIds.push(q.id);
                        console.log(`[SYNC] ${cat} | ${q.id} — exp says "${wa}" ${wc}x but answer is "${correctAction}" (${cc}x)`);
                        console.log(`  Q: ${q.question.substring(0, 80)}`);
                        break;
                    }
                }
            }
        }
    }

    console.log(`\nFound ${badIds.length} sync issues`);

    if (badIds.length > 0) {
        const { error } = await s.from('trivia_questions').delete().in('id', badIds);
        console.log(error ? 'Error: ' + error.message : `Deleted ${badIds.length} questions`);
    }

    const { count } = await s.from('trivia_questions').select('*', { count: 'exact', head: true });
    console.log(`Final count: ${count}`);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
