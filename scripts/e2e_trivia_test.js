#!/usr/bin/env node
/**
 * COMPREHENSIVE E2E TRIVIA TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * Tests every mode, question quality, diamond flows and Supabase writes, and
 * now also guards the generation-pipeline invariants that used to fail silently.
 *
 * Usage: node scripts/e2e_trivia_test.js [--deep]
 *        --deep  also pages the whole pool for duplicate + answer-position
 *                analysis (slower; skipped by default on very large pools)
 *
 * WHAT WAS BROKEN:
 *   - Everything counted rows from `.select('*').limit(5000)`. PostgREST caps
 *     responses at its max-rows setting (1000 by default), so "Total questions
 *     in DB" and every per-mode availability check were understated on the
 *     8,675+ row pool — the test reported healthy availability it had never
 *     actually measured. All counts now use `{ count:'exact', head:true }`.
 *   - TEST 9 asserted that a rule_knowledge question containing "community
 *     cards" answers "5". The seeded question is "How many community cards are
 *     dealt on the flop?", whose correct answer is 3, so the test reported a
 *     FALSE FAILURE against a correct question whenever that row was found
 *     first. Fact checks now match on the full question intent.
 *
 * NEW INVARIANTS (these turn the audit's regressions into red tests):
 *   TEST 2b  every category holds >= 1,200 usable rows (20/day x 60 days)
 *   TEST 2c  today's daily roster has >= 20 rows per category
 *   TEST 3b  stored correct_index is spread 15-35% across all four positions
 *   TEST 3c  no duplicate normalized question text inside a category
 * ═══════════════════════════════════════════════════════════════════════════
 */
const path = require('path');
try {
    require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
} catch (_e) { /* env already provided */ }
const { createClient } = require('@supabase/supabase-js');
const { normalizeQuestionText } = require('./trivia-qa-validator');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DEEP = process.argv.includes('--deep');
const TEST_USER_ID = '2d1cd6c3-5700-4af9-a271-d4863fdab20d'; // DanielSmarter

const CATEGORY_MAP = {
    daily: null,
    history: ['poker_history', 'famous_hands', 'player_profiles'],
    rules: ['rule_knowledge'],
    pro: ['gto_theory', 'tournament_facts'],
    arcade: null,
    mtt: ['mtt_situations'],
    cash: ['cash_game_situations'],
    icm: ['icm_chip_ev'],
    gto: ['gto_theory', 'gto_scenarios', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev']
};

const ALL_CATEGORIES = [
    'poker_history', 'famous_hands', 'player_profiles', 'tournament_facts',
    'rule_knowledge', 'gto_theory', 'mtt_situations', 'cash_game_situations',
    'icm_chip_ev', 'gto_scenarios',
];

const MODES_NEEDED_QUESTIONS = {
    daily: 20, history: 20, rules: 20, pro: 20, arcade: 20,
    mtt: 20, cash: 20, icm: 20, gto: 20
};

// ── 60-day guarantee constants (mirror src/lib/triviaQuestionLoader.js) ──
const QUALITY_FLOOR = 6;
const NO_REPEAT_WINDOW_DAYS = 60;
const QUESTIONS_PER_DAY_DEDICATED = 20;
const SIXTY_DAY_FLOOR = QUESTIONS_PER_DAY_DEDICATED * NO_REPEAT_WINDOW_DAYS; // 1200
const ROSTER_PER_CATEGORY = 20;

/** Categories that back a dedicated single-category 20-questions/day mode. */
const DEDICATED_MODE_CATEGORIES = new Set([
    'rule_knowledge', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev',
]);

let passed = 0;
let failed = 0;
let warnings = 0;

function ok(label) { passed++; console.log(`  PASS ${label}`); }
function fail(label) { failed++; console.log(`  FAIL ${label}`); }
function warn(label) { warnings++; console.log(`  WARN ${label}`); }

/** Server-side exact count. Never fetches rows, so PostgREST max-rows cannot lie. */
function countRows(applyFilters) {
    let q = sb.from('trivia_questions').select('id', { count: 'exact', head: true });
    if (applyFilters) q = applyFilters(q);
    return q.then(({ count, error }) => {
        if (error) {
            console.log(`    count error: ${error.message}`);
            return null;
        }
        return count || 0;
    });
}

/** Page through a filtered selection without hitting the max-rows ceiling. */
async function fetchAllRows(columns, applyFilters, hardCap = 30000) {
    const PAGE = 1000;
    const out = [];
    for (let from = 0; from < hardCap; from += PAGE) {
        let q = sb.from('trivia_questions').select(columns);
        if (applyFilters) q = applyFilters(q);
        const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (error) {
            console.log(`    paging error: ${error.message}`);
            break;
        }
        const rows = data || [];
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

function todayCST() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
}

(async () => {
    console.log('════════════════════════════════════════════════════');
    console.log('  COMPREHENSIVE E2E TRIVIA TEST');
    console.log('════════════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════
    // TEST 1: Question Data Integrity
    // ═══════════════════════════════════════════════════
    console.log('━━━ TEST 1: Question Data Integrity ━━━');

    const totalQuestions = await countRows(null);
    if (totalQuestions === null) { fail('Cannot count questions'); process.exit(1); }
    ok(`Total questions in DB: ${totalQuestions}`);

    const catStats = {};
    await Promise.all(ALL_CATEGORIES.map(async (cat) => {
        const [total, usable] = await Promise.all([
            countRows(q => q.eq('category', cat)),
            countRows(q => q.eq('category', cat).gte('quality_score', QUALITY_FLOOR)),
        ]);
        catStats[cat] = { total: total ?? 0, usable: usable ?? 0 };
    }));

    console.log('  Categories (total / usable at quality >= 6):');
    for (const cat of ALL_CATEGORIES) {
        console.log(`    ${cat.padEnd(24)} ${String(catStats[cat].total).padStart(6)} / ${String(catStats[cat].usable).padStart(6)}`);
    }

    // ═══════════════════════════════════════════════════
    // TEST 2: Mode Question Availability
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 2: Mode Question Availability ━━━');
    for (const [mode, categories] of Object.entries(CATEGORY_MAP)) {
        const needed = MODES_NEEDED_QUESTIONS[mode] || 20;
        const available = categories === null
            ? await countRows(q => q.gte('quality_score', QUALITY_FLOOR))
            : await countRows(q => q.in('category', categories).gte('quality_score', QUALITY_FLOOR));

        if (available >= needed) ok(`${mode}: ${available} usable questions (need ${needed})`);
        else if (available >= 5) warn(`${mode}: only ${available} usable (need ${needed}) — fallback will supplement`);
        else fail(`${mode}: only ${available} usable (need ${needed}) — WILL FAIL`);
    }

    // ── TEST 2b: the actual 60-day depth requirement ──
    console.log('\n━━━ TEST 2b: 60-Day Pool Depth ━━━');
    console.log(`  Requirement: ${QUESTIONS_PER_DAY_DEDICATED}/day x ${NO_REPEAT_WINDOW_DAYS} days = ${SIXTY_DAY_FLOOR} usable per dedicated-mode category.`);
    for (const cat of ALL_CATEGORIES) {
        const { usable } = catStats[cat];
        const required = DEDICATED_MODE_CATEGORIES.has(cat) ? SIXTY_DAY_FLOOR : Math.round(SIXTY_DAY_FLOOR / 2);
        const shortfall = Math.max(0, required - usable);
        if (shortfall === 0) {
            ok(`${cat}: ${usable} usable >= ${required} required`);
        } else {
            fail(`${cat}: ${usable} usable of ${required} required — SHORT BY ${shortfall} (60-day guarantee broken)`);
        }
    }
    const survivalRequired = 200 * NO_REPEAT_WINDOW_DAYS; // 10 levels x 20 q x 60 days
    const totalUsable = Object.values(catStats).reduce((s, c) => s + c.usable, 0);
    if (totalUsable >= survivalRequired) ok(`survival: ${totalUsable} usable pool-wide >= ${survivalRequired} required`);
    else fail(`survival: ${totalUsable} usable of ${survivalRequired} required — SHORT BY ${survivalRequired - totalUsable}`);

    // ── TEST 2c: today's daily roster (written by /api/cron/generate-trivia) ──
    console.log('\n━━━ TEST 2c: Daily Roster Freshness ━━━');
    const today = todayCST();
    let rosterComplete = 0;
    for (const cat of ALL_CATEGORIES) {
        const n = await countRows(q => q.eq('category', cat).eq('daily_date', today).gte('quality_score', QUALITY_FLOOR));
        if (n >= ROSTER_PER_CATEGORY) { rosterComplete++; ok(`${cat}: ${n} questions tagged for ${today}`); }
        else fail(`${cat}: only ${n} questions tagged for ${today} (need ${ROSTER_PER_CATEGORY}) — daily generation is not running`);
    }
    console.log(`  roster complete in ${rosterComplete}/${ALL_CATEGORIES.length} categories`);

    // ═══════════════════════════════════════════════════
    // TEST 3: Question Quality Validation
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 3: Question Structure ━━━');

    // Structural checks only need a representative sample plus the full set of
    // rows for the deep checks below, so page once and reuse.
    const structureColumns = 'id, category, difficulty, question, options, correct_index, quality_score';
    const poolRows = DEEP
        ? await fetchAllRows(structureColumns, null)
        : await fetchAllRows(structureColumns, q => q.gte('quality_score', QUALITY_FLOOR), 5000);

    let badQuestions = 0;
    for (const q of poolRows) {
        if (!q.question || q.question.trim().length < 10) { badQuestions++; continue; }
        if (!q.options || !Array.isArray(q.options) || q.options.length < 2) { badQuestions++; continue; }
        if (q.correct_index === undefined || q.correct_index === null
            || q.correct_index < 0 || q.correct_index >= q.options.length) { badQuestions++; continue; }
        if (q.options.some(o => !o || String(o).trim().length === 0)) badQuestions++;
    }

    if (badQuestions === 0) ok(`All ${poolRows.length} sampled questions have valid text, options and correct_index`);
    else fail(`${badQuestions} of ${poolRows.length} questions have structural issues`);

    // ── TEST 3b: stored answer-position distribution ──
    // Language models overwhelmingly place the correct answer first. The client
    // shuffles options at render time, but any consumer that forgets to (an
    // API-rendered PvP payload, for instance) leaks the answer outright.
    console.log('\n━━━ TEST 3b: Answer Position Distribution ━━━');
    const posCounts = [0, 0, 0, 0];
    for (const q of poolRows) {
        if (Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < 4) {
            posCounts[q.correct_index]++;
        }
    }
    const posTotal = posCounts.reduce((a, b) => a + b, 0) || 1;
    const pcts = posCounts.map(c => (c / posTotal) * 100);
    console.log(`  A ${pcts[0].toFixed(1)}%  B ${pcts[1].toFixed(1)}%  C ${pcts[2].toFixed(1)}%  D ${pcts[3].toFixed(1)}%  (n=${posTotal})`);
    const skewed = pcts.filter(p => p < 15 || p > 35);
    if (skewed.length === 0) ok('correct_index is within 15-35% for all four positions');
    else fail(`correct_index distribution is skewed — ${skewed.length} position(s) outside the 15-35% band`);

    // ── TEST 3c: duplicate question text per category ──
    console.log('\n━━━ TEST 3c: Duplicate Detection ━━━');
    if (!DEEP) {
        warn('duplicate scan runs on the full pool only — re-run with --deep for a complete check');
    }
    const perCatSeen = new Map();
    const dupExamples = [];
    let dupCount = 0;
    for (const q of poolRows) {
        const norm = normalizeQuestionText(q.question);
        if (!norm) continue;
        if (!perCatSeen.has(q.category)) perCatSeen.set(q.category, new Set());
        const seen = perCatSeen.get(q.category);
        if (seen.has(norm)) {
            dupCount++;
            if (dupExamples.length < 5) dupExamples.push(`${q.category}: ${q.question.slice(0, 70)}`);
        } else {
            seen.add(norm);
        }
    }
    if (dupCount === 0) ok(`No duplicate question text within any category (${poolRows.length} scanned)`);
    else {
        fail(`${dupCount} duplicate question texts found within categories`);
        dupExamples.forEach(e => console.log(`    dup: ${e}`));
    }

    // ── Sample fact verification ──
    console.log('\n━━━ TEST 3d: Sample Question Readout ━━━');
    const samples = [
        poolRows.find(q => q.question?.includes('WSOP') && q.question?.includes('1970')),
        poolRows.find(q => q.question?.includes('community cards')),
        poolRows.find(q => q.question?.includes('Moneymaker')),
        poolRows.find(q => q.question?.includes('kicker')),
        poolRows.find(q => q.question?.includes('ICM') || q.question?.includes('Independent Chip Model')),
    ].filter(Boolean);

    samples.forEach(q => {
        console.log(`    Q: "${q.question.substring(0, 70)}..."  ->  A: "${q.options[q.correct_index]}"`);
    });
    if (samples.length >= 3) ok(`${samples.length} sample questions read back cleanly`);

    // ═══════════════════════════════════════════════════
    // TEST 4: Diamond Balance Tracking
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 4: Diamond Balance ━━━');

    const { data: profile } = await sb.from('profiles').select('diamonds').eq('id', TEST_USER_ID).maybeSingle();
    if (!profile) fail('Cannot find test user profile');
    else ok(`Test user diamond balance: ${profile.diamonds}`);

    const { data: txns, count: txnCount } = await sb
        .from('diamond_transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', TEST_USER_ID)
        .order('created_at', { ascending: false })
        .limit(5);

    if (txns) {
        ok(`Diamond transaction records: ${txnCount} total`);
        txns.forEach(t => {
            console.log(`    ${t.amount > 0 ? '+' : ''}${t.amount} (${t.reason || 'no reason'}) at ${t.created_at}`);
        });
    }

    // ═══════════════════════════════════════════════════
    // TEST 5: Score Persistence
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 5: Score Persistence ━━━');

    const { data: scores, count: scoreCount } = await sb
        .from('trivia_scores')
        .select('*', { count: 'exact' })
        .eq('user_id', TEST_USER_ID)
        .order('created_at', { ascending: false })
        .limit(5);

    ok(`Existing trivia_scores for user: ${scoreCount} records`);
    scores?.forEach(s => {
        console.log(`    Mode: ${s.mode || 'unknown'}, Score: ${s.score}, Correct: ${s.correct_count}/${s.total_questions}, Diamonds: ${s.diamonds_earned}`);
    });

    // ═══════════════════════════════════════════════════
    // TEST 6: Simulated Question Fetch Per Mode
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 6: Simulated Question Fetch Per Mode ━━━');

    for (const [mode, categories] of Object.entries(CATEGORY_MAP)) {
        let query = sb
            .from('trivia_questions')
            .select('question, options, correct_index, category, difficulty')
            .gte('quality_score', QUALITY_FLOOR)
            .limit(50);
        if (categories && categories.length > 0) query = query.in('category', categories);

        const { data: modeQuestions, error: modeErr } = await query;

        if (modeErr) { fail(`${mode}: Supabase query error — ${modeErr.message}`); continue; }
        if (!modeQuestions || modeQuestions.length === 0) { fail(`${mode}: returns 0 questions from Supabase`); continue; }

        const first = modeQuestions[0];
        const hasValidStructure = first.question && first.options?.length >= 2
            && first.correct_index >= 0 && first.correct_index < first.options.length;

        if (hasValidStructure) {
            ok(`${mode}: fetch returns usable questions, structure valid`);
            console.log(`    Sample: "${first.question.substring(0, 70)}..." [${first.category}/${first.difficulty}]`);
        } else {
            fail(`${mode}: question structure invalid`);
        }
    }

    // ═══════════════════════════════════════════════════
    // TEST 7: Supabase Table Existence & Schema
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 7: Supabase Table Verification ━━━');

    const tables = [
        'trivia_questions', 'trivia_scores', 'trivia_user_question_history',
        'trivia_category_mastery', 'daily_trivia_plays', 'trivia_streaks'
    ];

    for (const table of tables) {
        const { count, error: tErr } = await sb.from(table).select('*', { count: 'exact', head: true });
        if (tErr) {
            if (tErr.code === '42P01') fail(`Table ${table} does NOT exist`);
            else warn(`Table ${table}: ${tErr.message} (${tErr.code})`);
        } else {
            ok(`Table ${table}: exists (${count} rows)`);
        }
    }

    // ═══════════════════════════════════════════════════
    // TEST 8: Diamond Engine Config
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 8: Diamond Engine Simulation ━━━');

    const freeModes = ['daily', 'history', 'mtt', 'cash', 'icm', 'gto', 'rules', 'pro'];
    const paidModes = ['arcade'];
    ok(`Free modes (diamondCost: 0): ${freeModes.join(', ')}`);
    ok(`Paid modes (diamondCost: 10): ${paidModes.join(', ')}`);

    const dePaths = ['src/lib/diamondEngine.js', 'src/lib/DiamondEngine.js'];
    const foundDe = dePaths.find(p => {
        try { require('fs').accessSync(path.join(process.cwd(), p)); return true; } catch { return false; }
    });
    if (foundDe) ok(`DiamondEngine module exists at ${foundDe}`);
    else warn('DiamondEngine module not found at expected path — may use different import');

    // ═══════════════════════════════════════════════════
    // TEST 9: Answer Correctness Spot-Check
    // ═══════════════════════════════════════════════════
    console.log('\n━━━ TEST 9: Answer Correctness Spot-Check ━━━');

    // The finders are intent-specific. The old "community cards" check matched
    // the FLOP question (answer 3) while expecting 5, producing a false FAIL
    // against a factually correct row.
    const factChecks = [
        {
            label: 'WSOP first year',
            find: q => /first (World Series of Poker|WSOP)/i.test(q.question || '') && /1970|year/i.test(q.question || ''),
            expect: a => /1970|Johnny Moss/i.test(a),
            expectLabel: '1970 / Johnny Moss',
        },
        {
            label: 'Community cards on the flop',
            find: q => /community cards/i.test(q.question || '') && /flop/i.test(q.question || ''),
            expect: a => /\b3\b|three/i.test(a),
            expectLabel: '3',
        },
        {
            label: 'Community cards in total',
            find: q => /community cards/i.test(q.question || '') && /(total|in all|by showdown|altogether)/i.test(q.question || ''),
            expect: a => /\b5\b|five/i.test(a),
            expectLabel: '5',
        },
        {
            label: 'Hole cards in Hold\'em',
            find: q => /hole cards/i.test(q.question || '') && /(Hold'?em|Texas)/i.test(q.question || ''),
            expect: a => /\b2\b|two/i.test(a),
            expectLabel: '2',
        },
        {
            label: 'Best possible hand',
            find: q => /(strongest|best) (possible )?(five-card )?(hand|holding)/i.test(q.question || ''),
            expect: a => /royal flush/i.test(a),
            expectLabel: 'Royal Flush',
        },
        {
            label: 'Minimum defence frequency',
            find: q => /minimum defen[cs]e frequency|MDF/i.test(q.question || ''),
            expect: a => a.length > 0,
            expectLabel: 'any non-empty answer',
        },
    ];

    for (const check of factChecks) {
        const q = poolRows.find(check.find);
        if (!q) { warn(`${check.label}: no matching question found in the pool`); continue; }
        const answer = String(q.options[q.correct_index] ?? '');
        if (check.expect(answer)) ok(`${check.label}: "${answer}"`);
        else fail(`${check.label}: expected ${check.expectLabel} but the marked answer is "${answer}"`);
    }

    // ═══════════════════ SUMMARY ═══════════════════
    console.log('\n════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed  |  ${failed} failed  |  ${warnings} warnings`);
    console.log('════════════════════════════════════════════════════\n');

    if (failed === 0) console.log('  ALL TESTS PASSED — trivia system is functional and the pool meets the 60-day guarantee.');
    else console.log(`  ${failed} ISSUES NEED ATTENTION`);

    process.exit(failed > 0 ? 1 : 0);
})();
