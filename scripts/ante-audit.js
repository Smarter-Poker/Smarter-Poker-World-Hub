#!/usr/bin/env node
/**
 * ANTE AUDIT — Find all questions with non-BB ante structures
 * Rule: In tournaments, ante = 1BB ALWAYS (BB ante format)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const categories = [
        'mtt_situations', 'icm_chip_ev', 'tournament_facts',
        'poker_history', 'famous_hands', 'player_profiles',
        'gto_theory', 'gto_scenarios', 'cash_game_situations',
        'rule_knowledge'
    ];

    const badIds = [];

    for (const cat of categories) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('id, question, options, correct_index, explanation')
            .eq('category', cat);

        if (error || !data) {
            console.log(`❌ Failed: ${cat} - ${error?.message}`);
            continue;
        }

        for (const q of data) {
            const allText = q.question + ' ' + (q.explanation || '') + ' ' + q.options.join(' ');

            // Pattern 1: "X/Y with a Z ante" where Z != Y
            const explicit = allText.match(/(\d[\d,]*)\/(\d[\d,]*).*?(?:with\s+(?:a\s+)?)?(\d[\d,]*)\s*ante/i);
            if (explicit) {
                const bb = parseInt(explicit[2].replace(/,/g, ''));
                const ante = parseInt(explicit[3].replace(/,/g, ''));
                if (ante > 0 && ante !== bb) {
                    badIds.push(q.id);
                    console.log(`[BAD] ${cat} | ${q.id}`);
                    console.log(`  Blinds: ${explicit[1]}/${explicit[2]} | Ante: ${ante} (should be ${bb})`);
                    console.log(`  Q: ${q.question.substring(0, 120)}`);
                    console.log('');
                    continue;
                }
            }

            // Pattern 2: "ante of X" or "X ante" with explicit blind levels
            const blinds = allText.match(/(\d[\d,]*)\/(\d[\d,]*)/);
            if (blinds) {
                const bb = parseInt(blinds[2].replace(/,/g, ''));

                // Find all ante mentions
                const antePatterns = [
                    ...allText.matchAll(/(\d[\d,]*)\s*ante/gi),
                    ...allText.matchAll(/ante\s+(?:of\s+)?(\d[\d,]*)/gi),
                ];

                for (const match of antePatterns) {
                    const ante = parseInt(match[1].replace(/,/g, ''));
                    if (ante > 0 && ante !== bb && !badIds.includes(q.id)) {
                        badIds.push(q.id);
                        console.log(`[BAD] ${cat} | ${q.id}`);
                        console.log(`  Blinds: ${blinds[0]} | Ante: ${ante} (should be ${bb})`);
                        console.log(`  Q: ${q.question.substring(0, 120)}`);
                        console.log('');
                    }
                }
            }
        }
    }

    console.log(`\n=== TOTAL BAD ANTE QUESTIONS: ${badIds.length} ===`);
    console.log('IDs:', JSON.stringify(badIds));

    if (badIds.length > 0) {
        console.log('\nDeleting...');
        for (let i = 0; i < badIds.length; i += 10) {
            const batch = badIds.slice(i, i + 10);
            const { error } = await supabase.from('trivia_questions').delete().in('id', batch);
            if (error) console.log(`  ❌ Batch error: ${error.message}`);
            else console.log(`  ✅ Deleted batch ${Math.floor(i / 10) + 1} (${batch.length})`);
        }
    }

    const { count } = await supabase.from('trivia_questions').select('*', { count: 'exact', head: true });
    console.log(`\n📊 Remaining questions: ${count}`);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
