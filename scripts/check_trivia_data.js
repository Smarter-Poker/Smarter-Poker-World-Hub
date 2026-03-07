const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // 1. Check question counts by category
    const { data: questions, error: qErr } = await sb
        .from('trivia_questions')
        .select('category')
        .limit(5000);

    if (qErr) {
        console.log('ERROR fetching questions:', qErr.message);
        process.exit(1);
    }

    // Count by category
    const cats = {};
    questions.forEach(q => {
        cats[q.category] = (cats[q.category] || 0) + 1;
    });
    console.log('=== QUESTION COUNTS BY CATEGORY ===');
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count} questions`);
    });
    console.log(`  TOTAL: ${questions.length} questions`);

    // 2. Check test user diamond balance
    const { data: profile } = await sb
        .from('profiles')
        .select('id, username, diamonds')
        .ilike('username', '%daniel%')
        .maybeSingle();

    if (profile) {
        console.log(`\n=== TEST USER ===`);
        console.log(`  User: ${profile.username} (${profile.id})`);
        console.log(`  Diamonds: ${profile.diamonds}`);
    }

    // 3. Check existing trivia scores count
    const { count: scoreCount } = await sb
        .from('trivia_scores')
        .select('*', { count: 'exact', head: true });
    console.log(`\n=== EXISTING DATA ===`);
    console.log(`  Total trivia_scores records: ${scoreCount}`);

    // 4. Check trivia_streaks
    if (profile) {
        const { data: streak } = await sb
            .from('trivia_streaks')
            .select('*')
            .eq('user_id', profile.id)
            .maybeSingle();
        console.log(`  User streak: ${streak ? JSON.stringify(streak) : 'none'}`);
    }

    // 5. Sample 3 questions to verify quality
    const { data: samples } = await sb
        .from('trivia_questions')
        .select('question, options, correct_index, category, difficulty')
        .limit(5);

    console.log('\n=== SAMPLE QUESTIONS ===');
    samples?.forEach((q, i) => {
        console.log(`\n  Q${i + 1} [${q.category}/${q.difficulty}]: ${q.question}`);
        q.options?.forEach((opt, j) => {
            console.log(`    ${j === q.correct_index ? '✅' : '  '} ${String.fromCharCode(65 + j)}) ${opt}`);
        });
    });

    process.exit(0);
})();
