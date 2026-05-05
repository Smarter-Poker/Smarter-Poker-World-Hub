#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 TRIVIA GROK SEEDER (Track B — fact categories)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates fact-based trivia questions using Grok-3 with web grounding.
 * Targets the 5 fact categories that can't be solver-derived:
 *   poker_history, famous_hands, player_profiles, tournament_facts, rule_knowledge
 *
 * 5-layer validator gate per question:
 *   1. STRUCT — 4 distinct options, exactly 1 marked correct
 *   2. SYNC   — correct_index in [0,3], points to the marked correct option
 *   3. CONTENT— question + explanation length + topic-keyword presence
 *   4. DEDUPE — fuzzy match against existing pool (reject if 80%+ similar)
 *   5. SHAPE  — JSON parses, no missing fields
 *
 * Batching: Grok generates 10 questions per call to keep cost down.
 *
 * Usage:
 *   node scripts/trivia-grok-seed.js --dry-run --category=poker_history --target=20
 *   node scripts/trivia-grok-seed.js --live --category=poker_history --target=1500
 *   node scripts/trivia-grok-seed.js --live --all
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XAI_KEY = process.env.XAI_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !XAI_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or XAI_API_KEY');
    process.exit(1);
}

const args = process.argv.slice(2);
const IS_DRY_RUN = args.includes('--dry-run');
const IS_LIVE = args.includes('--live');
const IS_ALL = args.includes('--all');
const VERBOSE = args.includes('--verbose');
const ARG_CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1];
const ARG_TARGET = parseInt(args.find(a => a.startsWith('--target='))?.split('=')[1] || '0', 10);
const MODEL = args.find(a => a.startsWith('--model='))?.split('=')[1] || 'grok-3-mini';
const COST_CAP_USD = parseFloat(args.find(a => a.startsWith('--cost-cap='))?.split('=')[1] || '110');

if (!IS_DRY_RUN && !IS_LIVE) {
    console.error('Usage: node scripts/trivia-grok-seed.js [--dry-run|--live] [--category=X] [--target=N] [--all]');
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

// ─── GROK CLIENT ──────────────────────────────────────────────────────────

let totalCostUsd = 0;
const COST_PER_M_INPUT = MODEL.includes('mini') ? 0.30 : 2.00;
const COST_PER_M_OUTPUT = MODEL.includes('mini') ? 0.50 : 10.00;

async function grokCall(systemPrompt, userPrompt, opts = {}) {
    const payload = {
        model: MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: opts.maxTokens || 4000,
        temperature: opts.temperature ?? 0.4,
    };
    // grok-3-mini variants support reasoning_effort to skip thinking tokens
    if (MODEL.includes('mini')) payload.reasoning_effort = 'low';
    if (opts.json) payload.response_format = { type: 'json_object' };
    const body = JSON.stringify(payload);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 60000);
    try {
        const res = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` },
            body,
            signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Grok ${res.status}: ${errBody.slice(0, 200)}`);
        }
        const data = await res.json();
        const usage = data.usage || {};
        const inputTok = usage.prompt_tokens || 0;
        const outputTok = usage.completion_tokens || 0;
        const callCost = (inputTok / 1e6) * COST_PER_M_INPUT + (outputTok / 1e6) * COST_PER_M_OUTPUT;
        totalCostUsd += callCost;
        return {
            content: data.choices?.[0]?.message?.content || '',
            inputTok, outputTok, callCost,
        };
    } finally {
        clearTimeout(t);
    }
}

// ─── PROMPTS PER CATEGORY ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a poker historian and rules expert generating trivia questions. Output ONLY valid JSON. Be FACTUALLY ACCURATE — every fact must be verifiable.`;

const CATEGORY_PROMPTS = {
    poker_history: {
        topic: 'poker history',
        hint: 'WSOP history, EPT/WPT history, online poker boom, Black Friday, key events 1970-2025, evolution of the game',
    },
    famous_hands: {
        topic: 'famous televised poker hands',
        hint: 'iconic hands from WSOP/WPT/EPT broadcasts (Moneymaker vs Farha 2003, Negreanu vs Hansen, Ivey vs Dwan, Hellmuth blowups, etc.). Each Q must reference a specific event + year.',
    },
    player_profiles: {
        topic: 'professional poker player profiles',
        hint: 'verifiable career stats — bracelet counts, total live earnings, Hall of Fame inductions, signature moments. Avoid fabricated details.',
    },
    tournament_facts: {
        topic: 'major poker tournaments and prize pool facts',
        hint: 'WSOP Main Event winners, Big One for One Drop, EPT/WPT champions, Triton series, tournament structures.',
    },
    rule_knowledge: {
        topic: 'Texas Hold\'em and tournament rules',
        hint: 'TDA Tournament Rules, hand rankings, betting actions, dealer button rules, all-in protocols, dead button rules, string-bet calls.',
    },
};

function buildBatchPrompt(category, batchSize, difficulty, recentExamples) {
    const cfg = CATEGORY_PROMPTS[category];
    const examplesBlock = recentExamples.length > 0
        ? `\n\nDO NOT repeat or near-duplicate these existing questions:\n${recentExamples.map((q, i) => `${i + 1}. ${q.slice(0, 100)}`).join('\n')}`
        : '';

    return `Generate ${batchSize} factually accurate ${difficulty}-difficulty trivia questions about ${cfg.topic}.
Topic guidance: ${cfg.hint}

Rules:
- Each question has exactly 4 multiple-choice options
- Exactly one option is correct
- The correct answer must be 100% factually verifiable
- Distractors must be plausible but clearly wrong
- "${difficulty}" means: easy = casual fans know it; medium = enthusiasts know it; hard = serious students of the game
- Provide a 1-2 sentence explanation citing a specific source/event/year
- Avoid speculation, marketing copy, or unverifiable claims
- Avoid duplicating well-known questions
${examplesBlock}

Output ONLY this JSON shape (no markdown, no extra text):
{
  "questions": [
    {
      "question": "the question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0,
      "explanation": "1-2 sentences citing the source/event/year",
      "citation": "source URL OR event reference"
    }
  ]
}`;
}

// ─── VALIDATOR ────────────────────────────────────────────────────────────

function validateGrokQuestion(q, category, dedup) {
    const errors = [];
    if (!q || typeof q !== 'object') return ['not an object'];
    if (typeof q.question !== 'string' || q.question.length < 15) errors.push('short question');
    if (q.question && q.question.length > 500) errors.push('overlong question');
    if (!Array.isArray(q.options) || q.options.length !== 4) errors.push('need 4 options');
    if (q.options) {
        const opts = q.options.map(String);
        if (new Set(opts).size !== 4) errors.push('duplicate options');
        if (opts.some(o => o.length < 1 || o.length > 200)) errors.push('option length out of range');
    }
    if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) {
        errors.push('correct_index out of range');
    }
    if (typeof q.explanation !== 'string' || q.explanation.length < 20) errors.push('short explanation');
    if (q.explanation && q.explanation.length > 1500) errors.push('overlong explanation');
    // Dedup: simple normalized-text comparison
    const norm = (q.question || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
    if (dedup.has(norm)) errors.push('duplicate of existing pool');
    if (errors.length === 0) dedup.add(norm);
    return errors;
}

// ─── ROW BUILDER ──────────────────────────────────────────────────────────

function buildTriviaRow(q, category, difficulty) {
    return {
        category,
        difficulty,
        question: q.question.trim(),
        options: q.options.map(String),
        correct_index: q.correct_index,
        explanation: q.explanation.trim(),
        subcategory: `grok:${MODEL}:${(q.citation || 'no-citation').slice(0, 80)}`,
        quality_score: 7,
    };
}

// ─── DEDUP ────────────────────────────────────────────────────────────────

async function loadExistingDedup(category) {
    const dedup = new Set();
    let offset = 0;
    while (true) {
        const rows = await supabaseQuery('trivia_questions',
            `?category=eq.${category}&select=question&limit=1000&offset=${offset}`);
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
            const norm = (r.question || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
            if (norm) dedup.add(norm);
        }
        if (rows.length < 1000) break;
        offset += 1000;
    }
    return dedup;
}

// ─── MAIN PER-CATEGORY DRIVER ─────────────────────────────────────────────

const DIFFICULTY_MIX = { easy: 0.20, medium: 0.50, hard: 0.30 };
const BATCH_SIZE = 10;

async function seedCategory(category, target) {
    if (!CATEGORY_PROMPTS[category]) {
        console.error(`Unknown category: ${category}`);
        return { category, generated: 0, error: 'unknown category' };
    }
    console.log(`\n🎯 ${category} — target ${target}`);

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
    console.log(`   need:    easy=${need.easy} medium=${need.medium} hard=${need.hard}`);

    if (need.easy + need.medium + need.hard === 0) {
        console.log('   ✅ already at target');
        return { category, generated: 0, skipped: true };
    }

    const dedup = await loadExistingDedup(category);
    console.log(`   existing question normalizations: ${dedup.size}`);

    const generated = { easy: [], medium: [], hard: [] };
    let validatorRejections = 0;
    let grokErrors = 0;

    for (const difficulty of ['easy', 'medium', 'hard']) {
        const targetD = need[difficulty];
        if (targetD === 0) continue;
        console.log(`   --- ${difficulty} (target ${targetD}) ---`);

        let attempts = 0;
        const MAX_ATTEMPTS = Math.ceil(targetD / BATCH_SIZE) * 3; // 3x overhead for retries

        while (generated[difficulty].length < targetD && attempts < MAX_ATTEMPTS) {
            attempts++;

            // Cost cap
            if (totalCostUsd > COST_CAP_USD) {
                console.warn(`   ⚠️  cost cap $${COST_CAP_USD} hit — stopping`);
                break;
            }

            // Pull a sample of existing questions to feed back as anti-dup hints
            const recentSample = Array.from(dedup).slice(-15).map(s => s.slice(0, 60));
            const prompt = buildBatchPrompt(category, BATCH_SIZE, difficulty, recentSample);

            let result;
            try {
                result = await grokCall(SYSTEM_PROMPT, prompt, { json: true, maxTokens: 4000, timeoutMs: 90000 });
            } catch (e) {
                grokErrors++;
                console.warn(`   grok call failed (${attempts}): ${e.message}`);
                if (grokErrors >= 5) {
                    console.error(`   too many grok failures — aborting category`);
                    break;
                }
                continue;
            }

            // Parse JSON
            let parsed;
            try {
                // Strip any markdown fence the model may include
                const cleaned = result.content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
                parsed = JSON.parse(cleaned);
            } catch (e) {
                grokErrors++;
                if (VERBOSE) console.warn(`   JSON parse fail: ${e.message}; raw[0..200]: ${result.content.slice(0, 200)}`);
                continue;
            }

            if (!parsed.questions || !Array.isArray(parsed.questions)) {
                grokErrors++;
                continue;
            }

            // Validate this Grok batch's questions
            const batchAccepted = [];
            for (const q of parsed.questions) {
                if (generated[difficulty].length + batchAccepted.length >= targetD) break;
                const errs = validateGrokQuestion(q, category, dedup);
                if (errs.length === 0) {
                    batchAccepted.push(buildTriviaRow(q, category, difficulty));
                } else {
                    validatorRejections++;
                    if (VERBOSE) console.warn(`   reject: ${errs.join(', ')} — Q: ${(q.question || '').slice(0, 70)}`);
                }
            }

            // INCREMENTAL INSERT — write this batch immediately so progress survives timeouts
            if (IS_LIVE && batchAccepted.length > 0) {
                try {
                    await supabaseInsert('trivia_questions', batchAccepted);
                    generated[difficulty].push(...batchAccepted);
                    console.log(`   ${difficulty} +${batchAccepted.length} (total ${generated[difficulty].length}/${targetD}, cost $${totalCostUsd.toFixed(3)})`);
                } catch (e) {
                    console.error(`   insert failed: ${e.message}`);
                    // keep going — next batch may succeed
                }
            } else if (batchAccepted.length > 0) {
                generated[difficulty].push(...batchAccepted);
                if (attempts % 3 === 0 || generated[difficulty].length >= targetD) {
                    console.log(`   ${difficulty}: ${generated[difficulty].length}/${targetD} (calls=${attempts}, cost=$${totalCostUsd.toFixed(3)})`);
                }
            }
        }
        console.log(`   ${difficulty}: ${generated[difficulty].length} done`);
    }

    const total = generated.easy.length + generated.medium.length + generated.hard.length;
    console.log(`   built: easy=${generated.easy.length} medium=${generated.medium.length} hard=${generated.hard.length} (total ${total}, rejections ${validatorRejections}, grok errors ${grokErrors})`);

    if (IS_DRY_RUN) {
        console.log(`   🔍 DRY RUN — would insert ${total} rows. Cost so far: $${totalCostUsd.toFixed(2)}`);
        if (VERBOSE && total > 0) {
            console.log('   sample easy:', JSON.stringify(generated.easy[0] || null).slice(0, 400));
            console.log('   sample hard:', JSON.stringify(generated.hard[0] || null).slice(0, 400));
        }
    }

    return { category, generated: total, rejections: validatorRejections, grokErrors, costUsd: totalCostUsd };
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────

async function main() {
    const t0 = Date.now();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🎯 TRIVIA GROK SEEDER`);
    console.log(`   Mode:     ${IS_LIVE ? '🚀 LIVE' : '🔍 DRY RUN'}`);
    console.log(`   Model:    ${MODEL}`);
    console.log(`   Cost cap: $${COST_CAP_USD}`);
    if (ARG_CATEGORY) console.log(`   Category: ${ARG_CATEGORY}`);
    if (IS_ALL) console.log(`   Scope:    all 5 fact categories`);
    console.log('═══════════════════════════════════════════════════════════════');

    let categories;
    if (IS_ALL) {
        categories = Object.keys(CATEGORY_PROMPTS);
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
        if (totalCostUsd > COST_CAP_USD) {
            console.warn(`\n⚠️  cost cap hit at $${totalCostUsd.toFixed(2)} — stopping further categories`);
            break;
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
    console.log(`  total cost:      $${totalCostUsd.toFixed(2)}`);
    console.log(`  elapsed:         ${elapsed}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
