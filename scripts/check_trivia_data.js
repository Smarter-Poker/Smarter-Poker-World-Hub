#!/usr/bin/env node
/**
 * TRIVIA DATA SPOT CHECK
 * ═══════════════════════════════════════════════════════════════════════════
 * Quick health read of the question pool and the test user's trivia state.
 *
 * Usage: node scripts/check_trivia_data.js
 *
 * WHAT WAS BROKEN:
 *   - Counts came from `.select('category').limit(5000)` and then counted rows
 *     client side. PostgREST caps responses at its max-rows setting (1000 by
 *     default), so on a pool of 8,675+ rows every number printed here was
 *     silently wrong — and wrong in the reassuring direction. Counts now use
 *     `{ count: 'exact', head: true }`, which asks Postgres for the number and
 *     transfers no rows at all.
 *   - The test-user lookup used `.ilike('username','%daniel%').maybeSingle()`.
 *     maybeSingle returns an ERROR (not null) when more than one row matches,
 *     and the error was discarded by destructuring only `data`, so a second
 *     username containing "daniel" made the script report no test user at all.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
try {
    require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
} catch (_e) { /* env already provided */ }

const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Same id as scripts/e2e_trivia_test.js — the canonical test account. */
const TEST_USER_ID = '2d1cd6c3-5700-4af9-a271-d4863fdab20d';

const CATEGORIES = [
    'poker_history', 'famous_hands', 'player_profiles', 'tournament_facts',
    'rule_knowledge', 'gto_theory', 'mtt_situations', 'cash_game_situations',
    'icm_chip_ev', 'gto_scenarios',
];

/** Gameplay quality floor — must match [mode].js MIN_QUALITY_SCORE. */
const QUALITY_FLOOR = 6;
/** 20 questions/day x 60 days for a dedicated single-category mode. */
const SIXTY_DAY_FLOOR = 1200;

function count(filterFn) {
    let q = sb.from('trivia_questions').select('id', { count: 'exact', head: true });
    q = filterFn ? filterFn(q) : q;
    return q.then(({ count: n, error }) => {
        if (error) {
            console.log(`  count error: ${error.message}`);
            return null;
        }
        return n || 0;
    });
}

(async () => {
    // ── 1. Question counts by category (server-side counts, not row fetches) ──
    console.log('=== QUESTION COUNTS BY CATEGORY ===');
    const rows = await Promise.all(CATEGORIES.map(async (cat) => {
        const [total, usable] = await Promise.all([
            count(q => q.eq('category', cat)),
            count(q => q.eq('category', cat).gte('quality_score', QUALITY_FLOOR)),
        ]);
        return { cat, total: total ?? 0, usable: usable ?? 0 };
    }));

    rows.sort((a, b) => b.total - a.total);
    for (const r of rows) {
        const flag = r.usable < SIXTY_DAY_FLOOR ? `  << short of the 60-day floor (${SIXTY_DAY_FLOOR})` : '';
        console.log(`  ${r.cat.padEnd(24)} ${String(r.total).padStart(6)} total  ${String(r.usable).padStart(6)} usable${flag}`);
    }

    const [grandTotal, grandUsable] = await Promise.all([count(null), count(q => q.gte('quality_score', QUALITY_FLOOR))]);
    console.log(`  ${'TOTAL'.padEnd(24)} ${String(grandTotal).padStart(6)} total  ${String(grandUsable).padStart(6)} usable`);

    // ── 2. Test user ──
    // .limit(1) instead of .maybeSingle(): more than one match is normal and
    // must not turn into an error that gets silently swallowed.
    let profile = null;
    const { data: byId } = await sb
        .from('profiles')
        .select('id, username, diamonds')
        .eq('id', TEST_USER_ID)
        .maybeSingle();
    if (byId) {
        profile = byId;
    } else {
        const { data: byName, error: nameErr } = await sb
            .from('profiles')
            .select('id, username, diamonds')
            .ilike('username', '%daniel%')
            .order('username', { ascending: true })
            .limit(1);
        if (nameErr) console.log(`  profile lookup error: ${nameErr.message}`);
        profile = byName?.[0] || null;
    }

    if (profile) {
        console.log(`\n=== TEST USER ===`);
        console.log(`  User: ${profile.username} (${profile.id})`);
        console.log(`  Diamonds: ${profile.diamonds}`);
    } else {
        console.log('\n=== TEST USER ===\n  not found');
    }

    // ── 3. Score + history volume ──
    const { count: scoreCount } = await sb.from('trivia_scores').select('id', { count: 'exact', head: true });
    console.log(`\n=== EXISTING DATA ===`);
    console.log(`  Total trivia_scores records: ${scoreCount ?? 'unknown'}`);

    if (profile) {
        const { count: historyCount } = await sb
            .from('trivia_user_question_history')
            .select('question_id', { count: 'exact', head: true })
            .eq('user_id', profile.id);
        console.log(`  Questions this user has seen: ${historyCount ?? 'unknown'}`);

        const { data: streak } = await sb
            .from('trivia_streaks')
            .select('*')
            .eq('user_id', profile.id)
            .maybeSingle();
        console.log(`  User streak: ${streak ? JSON.stringify(streak) : 'none'}`);
    }

    // ── 4. Today's daily roster (written by /api/cron/generate-trivia) ──
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    console.log(`\n=== DAILY ROSTER (${today} CST) ===`);
    const rosterRows = await Promise.all(CATEGORIES.map(async (cat) => {
        const n = await count(q => q.eq('category', cat).eq('daily_date', today).gte('quality_score', QUALITY_FLOOR));
        return { cat, n: n ?? 0 };
    }));
    const rosterTotal = rosterRows.reduce((s, r) => s + r.n, 0);
    for (const r of rosterRows) {
        console.log(`  ${r.cat.padEnd(24)} ${String(r.n).padStart(3)}${r.n < 20 ? '  << under 20, mode falls back to the random pool' : ''}`);
    }
    console.log(`  roster total: ${rosterTotal} (target ${CATEGORIES.length * 20})`);

    // ── 5. Sample questions ──
    const { data: samples } = await sb
        .from('trivia_questions')
        .select('question, options, correct_index, category, difficulty')
        .limit(5);

    console.log('\n=== SAMPLE QUESTIONS ===');
    samples?.forEach((q, i) => {
        console.log(`\n  Q${i + 1} [${q.category}/${q.difficulty}]: ${q.question}`);
        q.options?.forEach((opt, j) => {
            console.log(`    ${j === q.correct_index ? '->' : '  '} ${String.fromCharCode(65 + j)}) ${opt}`);
        });
    });

    process.exit(0);
})();
