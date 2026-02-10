/**
 * ONE-TIME SEED: Tag 20 questions per category with today's and tomorrow's date
 * So games have daily-tagged content immediately for testing.
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CATEGORIES = [
    'poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge',
    'tournament_facts', 'gto_theory', 'mtt_situations', 'cash_game_situations',
    'icm_chip_ev', 'gto_scenarios'
];

const PER_CATEGORY = 20;

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

async function seedDate(date) {
    console.log(`\nSeeding ${date}...`);

    // Check if already done
    const { count } = await supabase
        .from('trivia_questions')
        .select('*', { count: 'exact', head: true })
        .eq('daily_date', date);

    if (count >= PER_CATEGORY * CATEGORIES.length) {
        console.log(`  Already seeded: ${count} questions`);
        return;
    }

    let total = 0;
    for (const cat of CATEGORIES) {
        // Get unused questions for this category
        const { data: pool } = await supabase
            .from('trivia_questions')
            .select('id')
            .eq('category', cat)
            .or(`daily_date.is.null,daily_date.lt.2026-01-01`)
            .limit(200);

        let candidates = pool || [];

        // Fallback: get all questions ordered by oldest usage
        if (candidates.length < PER_CATEGORY) {
            const { data: all } = await supabase
                .from('trivia_questions')
                .select('id')
                .eq('category', cat)
                .neq('daily_date', date)
                .order('daily_date', { ascending: true, nullsFirst: true })
                .limit(200);
            candidates = all || [];
        }

        const selected = shuffle(candidates).slice(0, PER_CATEGORY);
        const ids = selected.map(q => q.id);

        if (ids.length > 0) {
            const { error } = await supabase
                .from('trivia_questions')
                .update({ daily_date: date })
                .in('id', ids);

            if (error) {
                console.log(`  ${cat}: ERROR - ${error.message}`);
            } else {
                total += ids.length;
                console.log(`  ${cat}: ${ids.length} tagged`);
            }
        } else {
            console.log(`  ${cat}: NO QUESTIONS`);
        }
    }
    console.log(`  Total: ${total} for ${date}`);
}

async function main() {
    console.log('🌱 Daily Question Seeder');

    // Seed both today and tomorrow
    await seedDate('2026-02-09');
    await seedDate('2026-02-10');

    // Final verify
    console.log('\n📊 Verification:');
    for (const date of ['2026-02-09', '2026-02-10']) {
        const { count } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('daily_date', date);
        console.log(`  ${date}: ${count} daily questions`);
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
