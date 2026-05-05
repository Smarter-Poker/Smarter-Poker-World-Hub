#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 TRIVIA DETERMINISTIC SEEDER (Track A — strategy categories)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates trivia questions for the 5 strategy categories using the same
 * deterministic engine that powers training games. NO Grok AI involved.
 *
 * Source data:  solved_spots_gold (5.3M solver outputs) + memory_charts_gold
 * Target table: trivia_questions
 *
 * Usage:
 *   node scripts/trivia-deterministic-seed.js --dry-run --category=gto_theory --target=10
 *   node scripts/trivia-deterministic-seed.js --live --category=gto_theory --target=1500
 *   node scripts/trivia-deterministic-seed.js --live --all
 *
 * Categories handled:
 *   gto_theory, gto_scenarios, cash_game_situations, mtt_situations, icm_chip_ev
 *
 * Difficulty mix per category (defaults):
 *   easy   = 20% (300/1500), uses scenarios with avg max freq ≥80% (clear best action)
 *   medium = 50% (750/1500), uses scenarios with mixed strategies
 *   hard   = 30% (450/1500), uses scenarios with avg max freq ≤55% (close GTO spots)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── ENVIRONMENT (read from env, never hardcoded) ─────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_LIVE = args.includes('--live');
const IS_ALL = args.includes('--all');
const VERBOSE = args.includes('--verbose');
const ARG_CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1];
const ARG_TARGET = parseInt(args.find(a => a.startsWith('--target='))?.split('=')[1] || '0', 10);
const ARG_OFFSET = parseInt(args.find(a => a.startsWith('--offset='))?.split('=')[1] || '0', 10);

if (!IS_DRY_RUN && !IS_LIVE) {
    console.error('Usage: node scripts/trivia-deterministic-seed.js [--dry-run|--live] [--category=X] [--target=N] [--all]');
    process.exit(1);
}

// ─── HTTP CLIENT ──────────────────────────────────────────────────────────
const HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
};

async function supabaseQuery(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers: HEADERS });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`Query ${table} ${res.status}: ${t.slice(0, 200)}`);
    }
    return res.json();
}

async function supabaseInsert(table, rows) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows),
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`Insert ${table} ${res.status}: ${t.slice(0, 300)}`);
    }
    return true;
}

async function supabaseCount(table, filter = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id${filter}&limit=1`, {
        headers: { ...HEADERS, 'Prefer': 'count=exact' },
    });
    const cr = res.headers.get('content-range') || '';
    return cr ? parseInt(cr.split('/')[1] || '0', 10) : 0;
}

// ─── DETERMINISTIC LOGIC (ported from DeterministicGTOEngine + reseed script) ──

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i]));

const ACTION_LABELS = {
    'c': 'Check', 'x': 'Check', 'f': 'Fold', 'fold': 'Fold', 'push': 'Push All-In',
    'b16': 'Bet 16% pot', 'b20': 'Bet 20% pot', 'b25': 'Bet 25% pot',
    'b33': 'Bet 33% pot', 'b40': 'Bet 40% pot', 'b45': 'Bet 45% pot',
    'b50': 'Bet 50% pot', 'b55': 'Bet 55% pot', 'b60': 'Bet 60% pot',
    'b66': 'Bet 67% pot', 'b75': 'Bet 75% pot', 'b80': 'Bet 80% pot',
    'b100': 'Bet pot', 'b125': 'Bet 125% pot', 'b150': 'Overbet 150%',
    'b200': 'Overbet 200%', 'b300': 'Overbet 300%', 'allin': 'All-In', 'r': 'Raise',
};

const POT_BY_STREET = { 'preflop': 2.5, 'flop': 6, 'turn': 14, 'river': 30 };
const VILLAIN_MAP = { 'BTN': 'BB', 'SB': 'BB', 'BB': 'BTN', 'UTG': 'BB', 'MP': 'BB', 'CO': 'BTN', 'HJ': 'CO', 'UTG+1': 'BB', 'MP+1': 'BB' };

function getActionLabel(code) {
    if (ACTION_LABELS[code]) return ACTION_LABELS[code];
    const bm = code.match(/^b(\d+)$/);
    if (bm) return `Bet ${bm[1]}% pot`;
    const rm = code.match(/^r(\d+)$/);
    if (rm) return `Raise ${rm[1]}%`;
    return code.toUpperCase();
}

function parseBoardFromHash(hash) {
    if (!hash) return [];
    const parts = hash.split('_');
    const boardStr = parts[parts.length - 1];
    if (!boardStr || boardStr.length < 4) return [];
    const cards = [];
    for (let i = 0; i < boardStr.length; i += 2) {
        if (i + 1 < boardStr.length) {
            const card = boardStr.substring(i, i + 2);
            if (/^[2-9TJQKA][shdc]$/i.test(card)) cards.push(card);
        }
    }
    return cards;
}

function extractPositionFromHash(hash) {
    if (!hash) return 'BTN';
    const POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO', 'HJ'];
    for (const part of hash.split('_')) {
        if (POSITIONS.includes(part.toUpperCase())) return part.toUpperCase();
    }
    return 'BTN';
}

function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
}

/**
 * Build a deterministic question from a solved_spots_gold row.
 * Mirrors DeterministicGTOEngine.buildQuestionFromScenario.
 *
 * Returns null if scenario has no usable strategy data.
 */
function buildQuestionFromScenario(scenario, questionIndex) {
    const sm = scenario.strategy_matrix || {};
    const actions = sm.actions || [];
    const frequencies = sm.frequencies || {};
    const handEVs = sm.hand_evs || {};
    if (actions.length === 0) return null;

    // Pick a sample action with frequencies, then find hands with non-zero freq somewhere
    const sampleAction = actions.find(a => frequencies[a]) || actions[0];
    const handFreqs = frequencies[sampleAction] || {};
    const allHands = Object.keys(handFreqs).filter(h => {
        if (!h || h.length < 2) return false;
        return actions.some(a => {
            const f = frequencies[a]?.[h];
            return typeof f === 'number' && f > 0;
        });
    });
    if (allHands.length === 0) return null;

    const seed = hashSeed(`${scenario.scenario_hash || scenario.id}_${questionIndex}`);
    const heroHand = allHands[seed % allHands.length];

    // Per-action frequencies for this hand
    const handActions = {};
    const validActions = [];
    let optimalAction = null;
    let maxFreq = -1;
    actions.forEach(a => {
        const f = frequencies[a]?.[heroHand];
        if (typeof f === 'number' && f >= 0 && f <= 1) {
            handActions[a] = f;
            validActions.push(a);
            if (f > maxFreq) { maxFreq = f; optimalAction = a; }
        }
    });
    if (!optimalAction || validActions.length === 0) return null;

    // GTO frequencies normalized to 100
    const gtoFrequencies = {};
    validActions.forEach(a => { gtoFrequencies[a] = Math.round((handActions[a] || 0) * 100); });
    const total = Object.values(gtoFrequencies).reduce((s, v) => s + v, 0);
    if (total > 0 && total !== 100) {
        Object.keys(gtoFrequencies).forEach(k => {
            gtoFrequencies[k] = Math.round(gtoFrequencies[k] * 100 / total);
        });
        const newTotal = Object.values(gtoFrequencies).reduce((s, v) => s + v, 0);
        if (newTotal !== 100) gtoFrequencies[optimalAction] += (100 - newTotal);
    }

    // Build options (up to 4)
    const options = validActions.slice(0, 4).map(a => ({
        id: a,
        text: getActionLabel(a),
        frequency: gtoFrequencies[a],
    }));
    if (options.length < 2) {
        const fillers = ['f', 'c', 'b33', 'allin'].filter(a => !validActions.includes(a));
        while (options.length < 2 && fillers.length > 0) {
            const fa = fillers.shift();
            options.push({ id: fa, text: getActionLabel(fa), frequency: 0 });
        }
    }
    // Pad to 4 with frequency-0 fillers (trivia UI expects 4 options)
    const allFillers = ['f', 'c', 'b33', 'b75', 'allin', 'r', 'b50', 'b100'];
    while (options.length < 4) {
        const fa = allFillers.find(x => !options.some(o => o.id === x));
        if (!fa) break;
        options.push({ id: fa, text: getActionLabel(fa), frequency: 0 });
    }
    if (options.length < 4) return null; // can't build 4-option

    // Board / position / explanation
    const board = parseBoardFromHash(scenario.scenario_hash);
    const heroPos = extractPositionFromHash(scenario.scenario_hash);
    const villainPos = VILLAIN_MAP[heroPos] || 'BB';
    const street = scenario.street || 'flop';

    const freqPct = (maxFreq * 100).toFixed(0);
    let explanation;
    if (maxFreq >= 0.95) {
        explanation = `GTO solver: Pure ${getActionLabel(optimalAction)} (${freqPct}%). ${heroHand} has a clear optimal line on the ${street}.`;
    } else {
        const mixedParts = validActions
            .filter(a => handActions[a] > 0.01)
            .sort((a, b) => handActions[b] - handActions[a])
            .map(a => `${getActionLabel(a)} ${(handActions[a] * 100).toFixed(0)}%`)
            .join(', ');
        explanation = `GTO solver mixes: ${mixedParts}. Primary line is ${getActionLabel(optimalAction)} at ${freqPct}%.${maxFreq < 0.6 ? ' This is a close GTO spot.' : ''}`;
    }
    if (board.length > 0) explanation = `Board: ${board.join(' ')}. ${explanation}`;

    // Question text
    let questionText;
    if (street === 'preflop') {
        questionText = `You hold ${heroHand} in ${heroPos} preflop (${scenario.stack_depth || 100}BB). What is the GTO play?`;
    } else {
        questionText = `You hold ${heroHand} on the ${street}. Board: ${board.join(' ')}. What is the GTO play?`;
    }

    return {
        questionText,
        options, // [{id,text,frequency}]
        correctAction: optimalAction,
        correctIndex: options.findIndex(o => o.id === optimalAction),
        explanation,
        gtoFrequencies,
        maxFreq,
        scenarioHash: scenario.scenario_hash,
        scenarioId: scenario.id,
        heroHand,
        board,
        heroPos,
        villainPos,
        street,
        stackDepth: scenario.stack_depth,
        gameType: scenario.game_type,
        isMixedStrategy: maxFreq < 0.95 && validActions.filter(a => handActions[a] > 0.05).length > 1,
    };
}

/**
 * Build a deterministic question from a memory_charts_gold row (push/fold).
 * Used for icm_chip_ev and mtt_situations short-stack categories.
 */
function buildQuestionFromChart(chart, questionIndex) {
    const handMatrix = chart.hand_matrix || {};
    const hands = Object.keys(handMatrix);
    if (hands.length === 0) return null;

    const seed = hashSeed(`${chart.chart_id}_${questionIndex}`);
    const heroHand = hands[seed % hands.length];
    const hd = handMatrix[heroHand];
    if (!hd || typeof hd.push !== 'number') return null;

    const pushFreq = hd.push;
    const correctAction = pushFreq > 0.5 ? 'push' : 'fold';
    const stackDepth = chart.stack_depth || 10;
    const heroPos = chart.hero_position || 'BTN';
    const villainAction = chart.villain_action || 'Folded to you';

    const gtoFrequencies = {
        push: Math.round(pushFreq * 100),
        fold: Math.round((1 - pushFreq) * 100),
    };
    const fsum = gtoFrequencies.push + gtoFrequencies.fold;
    if (fsum !== 100) gtoFrequencies[correctAction] += (100 - fsum);

    // 4 options for trivia consistency: Push, Fold, + 2 plausible-but-wrong
    const options = [
        { id: 'push', text: 'Push All-In', frequency: gtoFrequencies.push },
        { id: 'fold', text: 'Fold', frequency: gtoFrequencies.fold },
        { id: 'minraise', text: 'Min-raise (limp)', frequency: 0 },
        { id: 'limp', text: 'Limp (call BB)', frequency: 0 },
    ];

    const explanation = correctAction === 'push'
        ? `ICM chart: ${heroHand} is a ${gtoFrequencies.push}% push from ${heroPos} at ${stackDepth}BB. Push. The hand has sufficient equity and fold equity to shove.`
        : `ICM chart: ${heroHand} only pushes ${gtoFrequencies.push}% from ${heroPos} at ${stackDepth}BB — the hand lacks fold equity or equity-when-called. This is a fold.`;

    const questionText = `You are in ${heroPos} with ${heroHand} at ${stackDepth}BB. ${villainAction}. What is the optimal action?`;

    return {
        questionText,
        options,
        correctAction,
        correctIndex: options.findIndex(o => o.id === correctAction),
        explanation,
        gtoFrequencies,
        maxFreq: Math.max(pushFreq, 1 - pushFreq),
        chartId: chart.chart_id,
        heroHand,
        heroPos,
        stackDepth,
        gameType: chart.game_type || 'Tournament',
        isMixedStrategy: pushFreq > 0.05 && pushFreq < 0.95,
    };
}

// ─── CATEGORY ROUTING ─────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
    gto_theory: {
        sources: [
            { table: 'solved_spots_gold', filter: '&game_type=eq.9max_cash&street=eq.flop' },
            { table: 'solved_spots_gold', filter: '&game_type=eq.cash&street=eq.flop' },
            { table: 'solved_spots_gold', filter: '&game_type=eq.cash&street=eq.turn' },
        ],
    },
    gto_scenarios: {
        sources: [
            { table: 'solved_spots_gold', filter: '&game_type=eq.cash&street=eq.river' },
            { table: 'solved_spots_gold', filter: '&game_type=eq.9max_cash&street=eq.turn' },
        ],
    },
    cash_game_situations: {
        sources: [
            { table: 'solved_spots_gold', filter: '&game_type=eq.cash' },
            { table: 'solved_spots_gold', filter: '&game_type=eq.9max_cash' },
        ],
    },
    mtt_situations: {
        sources: [
            { table: 'solved_spots_gold', filter: '&game_type=eq.mtt_chipev' },
            { table: 'solved_spots_gold', filter: '&game_type=eq.mtt_9max_chipev' },
            { table: 'memory_charts_gold', filter: '' }, // short-stack push/fold for tournament
        ],
    },
    icm_chip_ev: {
        sources: [
            { table: 'solved_spots_gold', filter: '&game_type=eq.mtt_icm' },
            { table: 'memory_charts_gold', filter: '' },
        ],
    },
};

const DIFFICULTY_MIX = { easy: 0.20, medium: 0.50, hard: 0.30 };

/**
 * Map (maxFreq) → difficulty bucket.
 * easy   = max freq ≥ 0.80 (very clear best action)
 * hard   = max freq ≤ 0.55 (close mixed strategy)
 * medium = everything else
 */
function classifyDifficulty(question) {
    const f = question.maxFreq;
    if (f >= 0.80) return 'easy';
    if (f <= 0.55) return 'hard';
    return 'medium';
}

// ─── VALIDATOR ────────────────────────────────────────────────────────────

function validateTriviaRow(row, errors) {
    if (!row.question || row.question.length < 10) errors.push('Short question');
    if (!Array.isArray(row.options) || row.options.length !== 4) errors.push('Need 4 options');
    if (!Number.isInteger(row.correct_index) || row.correct_index < 0 || row.correct_index > 3) {
        errors.push('correct_index out of range');
    }
    const optTexts = row.options || [];
    const distinct = new Set(optTexts).size;
    if (distinct !== optTexts.length) errors.push('Duplicate option texts');
    if (!row.explanation || row.explanation.length < 20) errors.push('Short explanation');
    return errors.length === 0;
}

// ─── ROW BUILDER (engine output → trivia_questions row) ───────────────────

function buildTriviaRow(question, category, difficulty) {
    const optionTexts = question.options.map(o => o.text);
    return {
        category,
        difficulty,
        question: question.questionText,
        options: optionTexts,
        correct_index: question.correctIndex,
        explanation: question.explanation,
        // Source tag in subcategory until engine_metadata column ships
        subcategory: `det:${question.scenarioHash || question.chartId || 'unknown'}:${question.heroHand}`,
        quality_score: question.maxFreq >= 0.95 ? 10 : question.maxFreq >= 0.70 ? 8 : 6,
    };
}

// ─── DEDUP CACHE ──────────────────────────────────────────────────────────

async function loadExistingSubcategorySet(category) {
    // Pull existing subcategory tags to avoid duplicates
    const existing = new Set();
    let offset = 0;
    while (true) {
        const rows = await supabaseQuery('trivia_questions',
            `?category=eq.${category}&select=subcategory&limit=1000&offset=${offset}`);
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
            if (r.subcategory) existing.add(r.subcategory);
        }
        if (rows.length < 1000) break;
        offset += 1000;
    }
    return existing;
}

// ─── MAIN PER-CATEGORY DRIVER ─────────────────────────────────────────────

async function seedCategory(category, target) {
    const cfg = CATEGORY_CONFIG[category];
    if (!cfg) {
        console.error(`Unknown category: ${category}`);
        return { category, generated: 0, error: 'unknown category' };
    }
    console.log(`\n🎯 ${category} — target ${target}`);

    // Current counts per difficulty
    const before = {};
    for (const d of ['easy', 'medium', 'hard']) {
        before[d] = await supabaseCount('trivia_questions', `&category=eq.${category}&difficulty=eq.${d}`);
    }
    console.log(`   current: easy=${before.easy} medium=${before.medium} hard=${before.hard}`);

    const targetMix = {
        easy: Math.floor(target * DIFFICULTY_MIX.easy),
        medium: Math.floor(target * DIFFICULTY_MIX.medium),
        hard: Math.floor(target * DIFFICULTY_MIX.hard),
    };
    const need = {
        easy: Math.max(0, targetMix.easy - before.easy),
        medium: Math.max(0, targetMix.medium - before.medium),
        hard: Math.max(0, targetMix.hard - before.hard),
    };
    console.log(`   target:  easy=${targetMix.easy} medium=${targetMix.medium} hard=${targetMix.hard}`);
    console.log(`   needed:  easy=${need.easy} medium=${need.medium} hard=${need.hard}`);

    if (need.easy + need.medium + need.hard === 0) {
        console.log('   ✅ already at target');
        return { category, generated: 0, skipped: true };
    }

    // Load dedupe cache
    const existingSubcats = await loadExistingSubcategorySet(category);
    console.log(`   existing subcat tags: ${existingSubcats.size}`);

    const generated = { easy: [], medium: [], hard: [] };
    const validatorRejections = [];

    // Iterate sources, fetch large pools, generate questions
    for (const source of cfg.sources) {
        if (generated.easy.length >= need.easy &&
            generated.medium.length >= need.medium &&
            generated.hard.length >= need.hard) break;

        const POOL_SIZE = 2000;
        let pool;
        try {
            const select = source.table === 'memory_charts_gold'
                ? 'chart_id,game_type,stack_depth,hero_position,villain_action,hand_matrix'
                : 'id,scenario_hash,street,stack_depth,game_type,strategy_matrix';
            pool = await supabaseQuery(source.table,
                `?select=${select}${source.filter}&limit=${POOL_SIZE}`);
            console.log(`   pool from ${source.table}${source.filter}: ${pool.length} rows`);
        } catch (e) {
            console.warn(`   pool fetch failed: ${e.message}`);
            continue;
        }
        if (!pool || pool.length === 0) continue;

        // Generate questions from pool, classify into difficulty buckets
        for (let i = 0; i < pool.length * 4; i++) {
            const scenario = pool[i % pool.length];
            const variant = Math.floor(i / pool.length);
            const q = source.table === 'memory_charts_gold'
                ? buildQuestionFromChart(scenario, variant)
                : buildQuestionFromScenario(scenario, variant);
            if (!q) continue;

            const subcatTag = `det:${q.scenarioHash || q.chartId || 'unknown'}:${q.heroHand}`;
            if (existingSubcats.has(subcatTag)) continue;
            existingSubcats.add(subcatTag);

            const diff = classifyDifficulty(q);
            if (generated[diff].length >= need[diff]) continue;

            const row = buildTriviaRow(q, category, diff);
            const errs = [];
            if (!validateTriviaRow(row, errs)) {
                validatorRejections.push({ id: subcatTag, errs });
                continue;
            }
            generated[diff].push(row);

            if (generated.easy.length >= need.easy &&
                generated.medium.length >= need.medium &&
                generated.hard.length >= need.hard) break;
        }
    }

    const total = generated.easy.length + generated.medium.length + generated.hard.length;
    console.log(`   built: easy=${generated.easy.length} medium=${generated.medium.length} hard=${generated.hard.length} (total ${total})`);
    if (validatorRejections.length > 0) {
        console.log(`   validator rejected: ${validatorRejections.length}`);
        if (VERBOSE) console.log(`   sample rejection: ${JSON.stringify(validatorRejections[0])}`);
    }

    if (IS_LIVE && total > 0) {
        const rows = [...generated.easy, ...generated.medium, ...generated.hard];
        const BATCH = 250;
        for (let i = 0; i < rows.length; i += BATCH) {
            const slice = rows.slice(i, i + BATCH);
            try {
                await supabaseInsert('trivia_questions', slice);
                process.stdout.write(`   inserted ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
            } catch (e) {
                console.error(`\n   insert failed at row ${i}: ${e.message}`);
                return { category, generated: i, error: e.message };
            }
        }
        console.log(`\n   ✅ inserted ${rows.length}`);
    } else if (IS_DRY_RUN) {
        console.log(`   🔍 DRY RUN — would insert ${total} rows`);
        if (VERBOSE && total > 0) {
            console.log(`   sample easy:   ${JSON.stringify(generated.easy[0] || null).slice(0, 400)}`);
            console.log(`   sample medium: ${JSON.stringify(generated.medium[0] || null).slice(0, 400)}`);
            console.log(`   sample hard:   ${JSON.stringify(generated.hard[0] || null).slice(0, 400)}`);
        }
    }

    return { category, generated: total, rejections: validatorRejections.length, before, need };
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────

async function main() {
    const t0 = Date.now();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🎯 TRIVIA DETERMINISTIC SEEDER`);
    console.log(`   Mode:     ${IS_LIVE ? '🚀 LIVE (writes to DB)' : '🔍 DRY RUN'}`);
    if (ARG_CATEGORY) console.log(`   Category: ${ARG_CATEGORY}`);
    if (IS_ALL) console.log(`   Scope:    all 5 strategy categories`);
    console.log('═══════════════════════════════════════════════════════════════');

    let categories;
    if (IS_ALL) {
        categories = Object.keys(CATEGORY_CONFIG);
    } else if (ARG_CATEGORY) {
        categories = [ARG_CATEGORY];
    } else {
        console.error('Specify --category=X or --all');
        process.exit(1);
    }

    const target = ARG_TARGET || 1500;
    const results = [];
    for (const cat of categories) {
        try {
            results.push(await seedCategory(cat, target));
        } catch (e) {
            console.error(`Error seeding ${cat}: ${e.message}`);
            results.push({ category: cat, error: e.message, generated: 0 });
        }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('\n═══ SUMMARY ═══');
    let total = 0;
    for (const r of results) {
        const status = r.error ? `❌ ${r.error}` : r.skipped ? `⏭️  skipped` : `✅ ${r.generated}`;
        console.log(`  ${r.category.padEnd(25)} ${status}`);
        total += r.generated || 0;
    }
    console.log(`\n  total generated: ${total}`);
    console.log(`  elapsed: ${elapsed}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
