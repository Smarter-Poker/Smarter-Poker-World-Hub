#!/usr/bin/env node
/**
 * NEAR-DUPLICATE CLEANUP
 * =======================
 * Identifies question pairs with >85% word similarity within the same category.
 * Keeps the better question (longer explanation, more unique content).
 * Deletes the weaker one from each pair.
 * 
 * Uses Jaccard similarity on word bags for fast comparison.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CATS = ['poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge', 'tournament_facts',
    'gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

const SIMILARITY_THRESHOLD = 0.80; // 80% word overlap = near-duplicate

function wordBag(text) {
    return new Set((text || '').toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2));
}

function jaccard(setA, setB) {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

async function main() {
    const dryRun = !process.argv.includes('--execute');

    console.log(`MODE: ${dryRun ? 'DRY RUN (use --execute to apply)' : 'EXECUTING DELETIONS'}`);
    console.log(`Similarity threshold: ${SIMILARITY_THRESHOLD * 100}%`);
    console.log('='.repeat(60));

    let totalPairs = 0;
    let totalDeletes = 0;
    const allDeleteIds = new Set();

    for (const cat of CATS) {
        const { data, error } = await s.from('trivia_questions')
            .select('id, question, options, correct_index, explanation, category')
            .eq('category', cat);

        if (error || !data) continue;

        // Build word bags for all questions
        const bags = data.map(q => ({ q, bag: wordBag(q.question) }));

        const catPairs = [];

        // O(n^2) comparison within category
        for (let i = 0; i < bags.length; i++) {
            for (let j = i + 1; j < bags.length; j++) {
                const sim = jaccard(bags[i].bag, bags[j].bag);
                if (sim >= SIMILARITY_THRESHOLD) {
                    catPairs.push({
                        a: bags[i].q,
                        b: bags[j].q,
                        similarity: sim
                    });
                }
            }
        }

        if (catPairs.length === 0) {
            console.log(`\n${cat}: 0 near-duplicate pairs`);
            continue;
        }

        totalPairs += catPairs.length;

        // Sort by similarity descending — handle most similar first
        catPairs.sort((a, b) => b.similarity - a.similarity);

        console.log(`\n${cat}: ${catPairs.length} near-duplicate pairs`);

        for (const pair of catPairs) {
            // Skip if both already marked for deletion
            if (allDeleteIds.has(pair.a.id) && allDeleteIds.has(pair.b.id)) continue;
            // Skip if one already marked
            if (allDeleteIds.has(pair.a.id) || allDeleteIds.has(pair.b.id)) continue;

            // Choose which to delete — keep the one with the longer explanation
            const aScore = (pair.a.explanation || '').length;
            const bScore = (pair.b.explanation || '').length;

            const deleteQ = aScore >= bScore ? pair.b : pair.a;
            allDeleteIds.add(deleteQ.id);
            totalDeletes++;

            if (dryRun && totalDeletes <= 10) {
                console.log(`  [${Math.round(pair.similarity * 100)}%] Delete: ${deleteQ.question.substring(0, 60)}...`);
            }
        }

        console.log(`  -> ${catPairs.length} pairs, ${[...allDeleteIds].filter(id => data.some(q => q.id === id)).length} marked for deletion`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total near-duplicate pairs: ${totalPairs}`);
    console.log(`Questions to delete: ${allDeleteIds.size}`);

    if (!dryRun && allDeleteIds.size > 0) {
        const ids = [...allDeleteIds];
        console.log(`\nDeleting ${ids.length} questions...`);
        for (let i = 0; i < ids.length; i += 20) {
            const batch = ids.slice(i, i + 20);
            const { error } = await s.from('trivia_questions').delete().in('id', batch);
            console.log(error ? `  Error: ${error.message}` : `  Deleted batch ${Math.floor(i / 20) + 1}`);
        }
    }

    const { count } = await s.from('trivia_questions').select('*', { count: 'exact', head: true });
    console.log(`\nFinal DB count: ${count}`);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
