#!/usr/bin/env node
/**
 * Check for questions with != 4 options and delete them
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CATS = ['poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge', 'tournament_facts',
    'gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

async function main() {
    const badIds = [];

    for (const cat of CATS) {
        const { data } = await s.from('trivia_questions').select('id, options, question').eq('category', cat);
        if (!data) continue;

        for (const q of data) {
            if (!Array.isArray(q.options) || q.options.length !== 4) {
                badIds.push(q.id);
                console.log(`[BAD] ${cat} | ${q.id} | options: ${q.options ? q.options.length : 'null'}`);
                console.log(`  Q: ${q.question.substring(0, 80)}`);
            }
            // Also check for any option that is empty or too short
            else {
                for (let i = 0; i < q.options.length; i++) {
                    if (!q.options[i] || q.options[i].trim().length < 3) {
                        badIds.push(q.id);
                        console.log(`[BAD-OPT] ${cat} | ${q.id} | option ${i} empty/short: "${q.options[i]}"`);
                        break;
                    }
                }
            }
        }
    }

    console.log(`\nTotal bad: ${badIds.length}`);

    if (badIds.length > 0) {
        for (let i = 0; i < badIds.length; i += 10) {
            const batch = badIds.slice(i, i + 10);
            const { error } = await s.from('trivia_questions').delete().in('id', batch);
            console.log(error ? `Error: ${error.message}` : `Deleted batch ${Math.floor(i / 10) + 1} (${batch.length})`);
        }
    }

    const { count } = await s.from('trivia_questions').select('*', { count: 'exact', head: true });
    console.log(`Final count: ${count}`);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
