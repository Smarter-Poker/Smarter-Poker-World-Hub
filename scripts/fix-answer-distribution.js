#!/usr/bin/env node
/**
 * ANSWER DISTRIBUTION FIX
 * ========================
 * Problem: A=19%, B=34%, C=33%, D=14% — severely skewed
 * Target: ~25% each letter
 * 
 * Method: For each over-represented position (B/C), randomly swap the correct answer
 * with an under-represented position (A/D) by shuffling options and updating correct_index.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CATS = ['poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge', 'tournament_facts',
    'gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

async function main() {
    const dryRun = !process.argv.includes('--execute');

    console.log(`MODE: ${dryRun ? 'DRY RUN (use --execute to apply)' : 'EXECUTING CHANGES'}`);
    console.log('='.repeat(60));

    let totalFixed = 0;

    for (const cat of CATS) {
        const { data, error } = await s.from('trivia_questions')
            .select('id, question, options, correct_index, explanation, category')
            .eq('category', cat);

        if (error || !data) {
            console.error(`Error fetching ${cat}:`, error?.message);
            continue;
        }

        // Count current distribution
        const dist = { 0: 0, 1: 0, 2: 0, 3: 0 };
        data.forEach(q => dist[q.correct_index]++);

        const total = data.length;
        const target = Math.floor(total / 4);

        console.log(`\n${cat} (${total})`);
        console.log(`  Before: A:${pct(dist[0], total)} B:${pct(dist[1], total)} C:${pct(dist[2], total)} D:${pct(dist[3], total)}`);

        // Identify overrepresented and underrepresented positions
        const overPositions = [];
        const underPositions = [];

        for (let i = 0; i < 4; i++) {
            if (dist[i] > target + 2) overPositions.push(i);
            if (dist[i] < target - 2) underPositions.push(i);
        }

        if (overPositions.length === 0 || underPositions.length === 0) {
            console.log('  Already balanced, skipping');
            continue;
        }

        // Get questions with correct answers in overrepresented positions
        const overQuestions = data.filter(q => overPositions.includes(q.correct_index));

        // Shuffle to randomize which questions we fix
        shuffle(overQuestions);

        let catFixed = 0;

        for (const q of overQuestions) {
            // Check if we still need to rebalance
            if (underPositions.every(i => dist[i] >= target)) break;

            // Find the most underrepresented position
            let targetIdx = underPositions.reduce((best, i) => dist[i] < dist[best] ? i : best, underPositions[0]);

            if (dist[targetIdx] >= target) continue;
            if (dist[q.correct_index] <= target) continue;

            // Swap: move the correct option to the target position
            const newOptions = [...q.options];
            const correctOption = newOptions[q.correct_index];
            const swapOption = newOptions[targetIdx];

            newOptions[q.correct_index] = swapOption;
            newOptions[targetIdx] = correctOption;

            // Update counts
            dist[q.correct_index]--;
            dist[targetIdx]++;

            if (!dryRun) {
                await s.from('trivia_questions')
                    .update({ options: newOptions, correct_index: targetIdx })
                    .eq('id', q.id);
            }

            catFixed++;
            totalFixed++;
        }

        console.log(`  After:  A:${pct(dist[0], total)} B:${pct(dist[1], total)} C:${pct(dist[2], total)} D:${pct(dist[3], total)}`);
        console.log(`  Fixed: ${catFixed} questions`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Total questions redistributed: ${totalFixed}`);

    // Verify final distribution
    if (!dryRun) {
        console.log('\nFinal verification...');
        const { data: all } = await s.from('trivia_questions').select('correct_index');
        const finalDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
        all.forEach(q => finalDist[q.correct_index]++);
        const totalAll = all.length;
        console.log(`  A:${pct(finalDist[0], totalAll)} B:${pct(finalDist[1], totalAll)} C:${pct(finalDist[2], totalAll)} D:${pct(finalDist[3], totalAll)}`);
    }

    process.exit(0);
}

function pct(n, total) { return `${n}(${Math.round(n / total * 100)}%)`; }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } }

main().catch(e => { console.error(e); process.exit(1); });
