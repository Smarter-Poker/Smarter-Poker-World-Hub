#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎯 TRIVIA GROK SEEDER (Track B — fact categories)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates fact-based trivia questions using Grok-3 with web grounding.
 * Targets the 5 fact categories that can't be solver-derived:
 *   poker_history, famous_hands, player_profiles, tournament_facts, rule_knowledge
 *
 * Validation gate per question (in this order):
 *   1. SHAPE   — JSON parses, 4 distinct options, correct_index in [0,3],
 *                question and explanation within length bounds
 *   2. DEDUPE  — token-set Jaccard similarity against the existing pool AND
 *                against everything accepted earlier in this run; >= 0.80
 *                similar is rejected
 *   3. FULL QA — the shared 5-check validator (STRUCT / SYNC / MATH / LOGIC /
 *                QUAL) from scripts/trivia-qa-validator.js, the same gate every
 *                bootstrap path uses
 *
 * Batching: Grok generates 10 questions per call to keep cost down.
 *
 * Usage:
 *   node scripts/trivia-grok-seed.js --dry-run --category=poker_history --target=20
 *   node scripts/trivia-grok-seed.js --live --category=poker_history --target=1500
 *   node scripts/trivia-grok-seed.js --live --all --target=2000
 *
 * WHAT WAS BROKEN:
 *   - The header claimed "fuzzy match, reject if 80%+ similar" but the code
 *     compared an exact 80-character prefix of the normalized text. Any
 *     rewording sailed straight through, while two genuinely different
 *     questions that happened to share an opening clause were wrongly rejected.
 *     Dedup is now token-set Jaccard over the FULL normalized text.
 *   - The anti-duplicate prompt block was built from the dedup Set, whose
 *     members are normalized blobs ("whowonthe2003wsopmaineventafterqualifying").
 *     The model was asked not to repeat strings it could not read. A parallel
 *     array of RAW question texts is now kept and fed to the prompt.
 *   - buildTriviaRow set no `source` column and stuffed model + citation into
 *     `subcategory` truncated to 80 chars, so rows were invisible to the
 *     factual audit (which filters on source), the citation was lossy, and
 *     subcategory could not be used for topic analytics.
 *   - Only the loose local shape check ran; the shared 5-check validator that
 *     gates every other path did not. The highest-volume pipeline had the
 *     weakest validation.
 *   - The stored correct_index was whatever the model emitted, which skews
 *     heavily toward index 0.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { validateQuestion, normalizeQuestionText, tokenSet, jaccardSimilarity } = require('./trivia-qa-validator');

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
    // recentExamples are RAW question texts. Feeding the model normalized
    // blobs, as this used to, gave it nothing it could actually compare against.
    const examplesBlock = recentExamples.length > 0
        ? `\n\nALREADY IN THE POOL — do not repeat these and do not merely reword them:\n${
            recentExamples.map((q, i) => `${i + 1}. ${String(q).slice(0, 140)}`).join('\n')
        }\n`
        : '';

    return `Generate ${batchSize} factually accurate ${difficulty}-difficulty trivia questions about ${cfg.topic}.
Topic guidance: ${cfg.hint}

ACCURACY (non-negotiable):
- The correct answer must be verifiable from the public record. Name the event, year, player,
  venue or rule that settles it.
- Anchor any figure that changes over time to a stated year.
- If you are not certain of a fact, write a different question instead. Never guess.

DISTRACTOR QUALITY (this is graded):
- Every wrong option must be something a knowledgeable poker fan could genuinely believe:
  the right kind of answer, the right order of magnitude, similar length and phrasing.
- Wrong years must be plausible years. Wrong players must be contemporaries. Wrong amounts
  must be in the same range.
- NEVER use filler options such as "none of the above", "it doesn't matter" or joke answers.
- The question text must not leak the answer.

DIFFICULTY:
- "${difficulty}" means: easy = casual fans know it; medium = enthusiasts know it;
  hard = serious students of the game know it, but it is still objectively checkable.

FORM:
- Exactly 4 options, exactly one correct.
- VARY correct_index across the batch — do not always answer with the first option.
- Explanations must be at least 2 sentences (120+ characters) and teach the fact,
  citing the source/event/year. Do not write "Option B is correct".
- No two questions in this batch may test the same fact.
${examplesBlock}
Output ONLY this JSON shape (no markdown, no extra text):
{
  "questions": [
    {
      "question": "the question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0,
      "explanation": "2+ sentences citing the source/event/year",
      "theme": "3-6 word topic label",
      "citation": "source URL OR event reference"
    }
  ]
}`;
}

// ─── VALIDATOR ────────────────────────────────────────────────────────────

/** Reject anything at or above this token-set Jaccard similarity. */
const DEDUP_SIMILARITY_THRESHOLD = 0.80;

/**
 * Per-category duplicate index.
 *
 * Holds exact normalized texts for O(1) rejection plus a parallel array of
 * token sets for near-duplicate (Jaccard) comparison, and the RAW texts used to
 * build the anti-duplicate prompt block.
 */
function createDedupIndex() {
    return {
        norms: new Set(),
        tokenSets: [],
        rawTexts: [],
        /** @returns {string|null} the reason it is a duplicate, or null */
        check(text) {
            const norm = normalizeQuestionText(text);
            if (!norm) return 'empty question text';
            if (this.norms.has(norm)) return 'exact duplicate of existing pool';
            const ts = tokenSet(text);
            if (ts.size === 0) return null;
            for (const other of this.tokenSets) {
                if (jaccardSimilarity(ts, other) >= DEDUP_SIMILARITY_THRESHOLD) {
                    return `near-duplicate (>= ${Math.round(DEDUP_SIMILARITY_THRESHOLD * 100)}% token overlap)`;
                }
            }
            return null;
        },
        add(text) {
            const norm = normalizeQuestionText(text);
            if (!norm) return;
            this.norms.add(norm);
            this.tokenSets.push(tokenSet(text));
            this.rawTexts.push(String(text));
        },
        /** A random sample of RAW texts for the prompt's do-not-repeat block. */
        sample(n) {
            if (this.rawTexts.length <= n) return [...this.rawTexts];
            const out = [];
            const taken = new Set();
            while (out.length < n && taken.size < this.rawTexts.length) {
                const i = Math.floor(Math.random() * this.rawTexts.length);
                if (taken.has(i)) continue;
                taken.add(i);
                out.push(this.rawTexts[i]);
            }
            return out;
        },
        get size() { return this.norms.size; },
    };
}

/**
 * Shape check + duplicate check + the shared 5-check QA validator.
 * Returns [] when the question is acceptable.
 */
function validateGrokQuestion(q, category, difficulty, dedup) {
    const errors = [];
    if (!q || typeof q !== 'object') return ['not an object'];
    if (typeof q.question !== 'string' || q.question.length < 15) errors.push('short question');
    if (q.question && q.question.length > 500) errors.push('overlong question');
    if (!Array.isArray(q.options) || q.options.length !== 4) errors.push('need 4 options');
    if (q.options) {
        const opts = q.options.map(o => String(o).trim().toLowerCase());
        if (new Set(opts).size !== 4) errors.push('duplicate options');
        if (opts.some(o => o.length < 1 || o.length > 200)) errors.push('option length out of range');
    }
    if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) {
        errors.push('correct_index out of range');
    }
    if (typeof q.explanation !== 'string' || q.explanation.length < 20) errors.push('short explanation');
    if (q.explanation && q.explanation.length > 1500) errors.push('overlong explanation');
    if (errors.length > 0) return errors;

    const dupReason = dedup.check(q.question);
    if (dupReason) return [dupReason];

    return [];
}

// ─── ROW BUILDER ──────────────────────────────────────────────────────────

/** Unbiased shuffle. */
function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Build the DB row. Options are shuffled here, BEFORE the QA validator runs, so
 * the stored correct_index is uniformly distributed (models overwhelmingly
 * answer with index 0) while the validator still sees a coherent question.
 * The client-side shuffle protects the display; this protects every consumer
 * that renders the stored order directly.
 */
function buildTriviaRow(q, category, difficulty) {
    const pairs = q.options.map((text, i) => ({
        text: String(text).trim(),
        wasCorrect: i === q.correct_index,
    }));
    shuffleInPlace(pairs);
    const newIndex = pairs.findIndex(p => p.wasCorrect);

    return {
        category,
        difficulty,
        question: q.question.trim(),
        options: pairs.map(p => p.text),
        correct_index: newIndex >= 0 ? newIndex : 0,
        explanation: q.explanation.trim(),
        // subcategory is a TOPIC label again (usable for analytics), the model
        // identity lives in `source`, and the citation is preserved in full in
        // engine_metadata instead of being truncated to 80 chars.
        subcategory: typeof q.theme === 'string' && q.theme.trim()
            ? q.theme.trim().slice(0, 120)
            : CATEGORY_PROMPTS[category]?.topic || category,
        theme: typeof q.theme === 'string' ? q.theme.trim().slice(0, 80) : null,
        source: `grok-seed:${MODEL}`,
        engine_metadata: {
            model: MODEL,
            citation: typeof q.citation === 'string' ? q.citation.slice(0, 500) : null,
            generated_at: new Date().toISOString(),
        },
        quality_score: 7,
    };
}

// ─── DEDUP ────────────────────────────────────────────────────────────────

async function loadExistingDedup(category) {
    const dedup = createDedupIndex();
    let offset = 0;
    while (true) {
        const rows = await supabaseQuery('trivia_questions',
            `?category=eq.${category}&select=question&limit=1000&offset=${offset}`);
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
            if (r.question) dedup.add(r.question);
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
    console.log(`   existing questions indexed for dedup: ${dedup.size}`);

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

            // Anti-duplicate hints must be READABLE question text, and a random
            // sample so consecutive batches do not all see the same examples.
            const recentSample = dedup.sample(15);
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

            // Validate this Grok batch: shape + dedup, then the SHARED 5-check
            // QA validator every other seeding path uses. Only questions that
            // clear both gates are added to the dedup index and inserted.
            const batchAccepted = [];
            for (const q of parsed.questions) {
                if (generated[difficulty].length + batchAccepted.length >= targetD) break;

                const errs = validateGrokQuestion(q, category, difficulty, dedup);
                if (errs.length > 0) {
                    validatorRejections++;
                    if (VERBOSE) console.warn(`   reject: ${errs.join(', ')} — Q: ${(q.question || '').slice(0, 70)}`);
                    continue;
                }

                const row = buildTriviaRow(q, category, difficulty);
                const qa = validateQuestion(row);
                if (!qa.valid) {
                    validatorRejections++;
                    if (VERBOSE) console.warn(`   QA reject: ${qa.errors.join(' | ')} — Q: ${row.question.slice(0, 70)}`);
                    continue;
                }

                // Only registered AFTER both gates pass, so a rejected question
                // does not poison the dedup index against a later good one.
                dedup.add(row.question);
                batchAccepted.push(row);
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

    // 20 questions/day x 60 days = 1,200 usable is the hard floor for a
    // dedicated single-category mode; 2,000 raw leaves headroom for the rows
    // the factual audit later demotes below the quality floor of 6.
    const target = ARG_TARGET || 2000;
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
