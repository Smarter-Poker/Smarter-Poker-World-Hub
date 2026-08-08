/**
 * DAILY TRIVIA GENERATION CRON — the content engine
 * ═══════════════════════════════════════════════════════════════════════════
 * This route is the revived, corrected replacement for archive/cron/generate-trivia.js
 * (which was archived, unroutable, auth-bypassable and mathematically incapable
 * of satisfying the product promise). Everything the audit found wrong there is
 * fixed here:
 *
 *   ARCHIVED BUG                         FIX APPLIED HERE
 *   ----------------------------------   --------------------------------------
 *   Not a routable path (archive/)       lives in pages/api/cron/
 *   Auth bypass: any POST in prod ran    requireAdminSecret() — fail-closed,
 *   the job when CRON_SECRET mismatched  constant-time, header-only, no method
 *                                        or NODE_ENV exceptions
 *   ANON_KEY fallback => RLS-silent      service-role key REQUIRED, throws if absent
 *   10 questions/day total               generates per category AND tags a
 *                                        daily roster per category (see
 *                                        ROSTER_TAG_PER_CATEGORY)
 *   Only 6 fact categories               all 10 categories (incl. the 4 strategy
 *                                        ones that back the mtt/cash/icm/gto modes)
 *   1 Grok call per question             1 batched call per (category, difficulty)
 *   Single all-or-nothing insert at end  incremental insert per batch
 *   maxDuration 60 (job took 60-150s)    maxDuration 300 + wall-clock budget +
 *                                        resumable category cursor
 *   Duplicated local getTodayCST()       imports the canonical helper
 *   Dedup by prompt hint only            normalized-text Set checked in code
 *   5:59 UTC tagged the ENDING CST day   see SCHEDULE below
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHEDULE — "5 5 * * *" (05:05 UTC), registered in vercel.json.
 *
 * Vercel cron schedules are UTC; America/Chicago is UTC-6 (CST) or UTC-5 (CDT).
 * The app's day boundary is midnight CST (src/lib/trivia/getTodayCST.js), so a
 * fixed UTC time lands on a different side of the boundary in winter vs summer.
 * Rather than pick a time that is only correct half the year, this handler tags
 * the Chicago day in effect TAG_LEAD_MINUTES from now:
 *
 *   winter (CST, UTC-6): 05:05Z = 23:05 CST -> +90m = 00:35 next day -> tags TOMORROW
 *                        (roster is ready ~55 minutes BEFORE the day flips)
 *   summer (CDT, UTC-5): 05:05Z = 00:05 CDT -> +90m = 01:35 same day -> tags TODAY
 *                        (roster is built 5 minutes INTO the day)
 *
 * Verified against both DST changeover weekends: every Chicago day is targeted
 * exactly once, with no gap and no double-tag. As a safety net the handler ALSO
 * tops up the CURRENT day's roster, so a missed or delayed run self-heals.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { validateBatch, normalizeQuestionText } from '../../../src/lib/triviaValidator';
import { requireAdminSecret } from '../../../src/lib/trivia/adminAuth';
import { getTodayCST, getTodayStartCST } from '../../../src/lib/trivia/getTodayCST';
import {
    getPoolDepthReport,
    NO_REPEAT_WINDOW_DAYS,
    DEFAULT_QUALITY_FLOOR,
} from '../../../src/lib/triviaQuestionLoader';
import { reportApiError } from '../../../src/lib/sentryWrap';
// FEAT(adaptive-volume): the per-player demand model lives in the pool guard
// (CATEGORY_DAILY_DEMAND). Importing it — rather than copying the numbers —
// keeps the watchdog's "how short are we" math and this cron's "how much do we
// generate" math permanently in sync. The guard's default handler is unused
// here; only the named constant is pulled in, and there is no import cycle
// (the guard does not import this module).
import { CATEGORY_DAILY_DEMAND } from './trivia-pool-guard';

// Node.js runtime (Pages Router req/res API). Long job: 300s ceiling, with an
// internal wall-clock budget so the handler returns a resumable cursor instead
// of being killed mid-batch.
export const config = { maxDuration: 300 };

// ═══════════════════════════════════════════════════════════════════════════
// TUNING
// ═══════════════════════════════════════════════════════════════════════════

/** How far ahead the roster is tagged. See SCHEDULE above. */
const TAG_LEAD_MINUTES = 90;

/**
 * PER-PLAYER CONSUMPTION MODEL: how many questions a dedicated-mode player
 * burns per day (the loader serves 20/day for rules/mtt/cash/icm). Used ONLY
 * by the depth-demand math (buildDepthReport). NOT the roster tagging size.
 *
 * FIX(roster-cut): this constant used to drive BOTH the depth model AND how
 * many rows tagRosterForDay stamped with daily_date. Tagging 20/category
 * (200/day) while /api/trivia/daily serves slice(0, 20) burned 10x the
 * questions the endpoint delivers and locked the surplus out of rotation via
 * last_used_at. The two meanings are now decoupled:
 *   - ROSTER_PER_CATEGORY (20)   -> per-player demand, depth math only
 *   - ROSTER_TAG_PER_CATEGORY (3) -> rows actually tagged per category per day
 */
const ROSTER_PER_CATEGORY = 20;

/**
 * FEAT(roster-cut): rows tagged onto the daily roster per category per day.
 * The daily endpoint serves slice(0, 20) = order_index slots 0-1 across the
 * 10 categories (20 questions); slot 2 is headroom so a mid-day report
 * demotion (which clears daily_date) still leaves a full 20 to serve without
 * an emergency rebuild. Keep in sync with ROSTER_TAG_PER_CATEGORY in
 * pages/api/cron/trivia-pool-guard.js (rosterComplete check).
 */
const ROSTER_TAG_PER_CATEGORY = 3;

/** Quality floor for gameplay — must match [mode].js MIN_QUALITY_SCORE. */
const ROSTER_MIN_QUALITY = DEFAULT_QUALITY_FLOOR; // 6

/** Preferred floor for roster picks; falls back to ROSTER_MIN_QUALITY. */
const ROSTER_PREFERRED_QUALITY = 8;

/** New questions generated per category per run (PHASE A). */
const GENERATE_PER_CATEGORY = 10;

/**
 * FEAT(adaptive-volume): ceiling for the per-category quota when a category's
 * servable depth is below its 60-day target. Short categories scale from
 * GENERATE_PER_CATEGORY up to this, proportionally to their shortfall.
 */
const ADAPTIVE_MAX_PER_CATEGORY = 30;

/**
 * FEAT(self-audit): PHASE D knobs. ~30 questions/day at 2 cold answers each is
 * the whole 15,000-question pool audited on a rolling ~16-month cycle without
 * a separate audit cron (the external "Phase 52" audit never runs in this
 * repo's schedule).
 */
const AUDIT_PER_RUN = 30;
/** Both cold answers must clear this confidence before a disagree demotes. */
const AUDIT_MIN_CONFIDENCE = 0.6;
/** Below the serving floor (6); distinct from report-demote (3) and flag (2)
 *  so operators can tell WHY a row was buried. */
const AUDIT_DEMOTED_QUALITY = 4;

/** Baseline score for validator-passed questions (gameplay floor is 6). */
const SEEDED_QUALITY_SCORE = 7;

/** Wall-clock budget, leaving headroom under maxDuration. */
const RUN_BUDGET_MS = 240000;

/** Generation model. grok-3-mini is ~10x cheaper and passes the same gate. */
const MODEL = process.env.TRIVIA_GEN_MODEL || 'grok-3-mini';

/** Marker written to trivia_questions.source so runs are self-identifying. */
const SOURCE_TAG = `cron-generate:${MODEL}`;

/**
 * Difficulty mix enforced per run — 20/50/30. Without this the model emits
 * whatever it feels like (historically ~70% medium) and the level ramp in
 * survival/arcade runs out of hard questions long before the pool does.
 */
const DIFFICULTY_PLAN = [
    { difficulty: 'easy', share: 0.2 },
    { difficulty: 'medium', share: 0.5 },
    { difficulty: 'hard', share: 0.3 },
];

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIES — all 10. The 4 strategy categories were entirely absent from the
// archived job, which is why mtt/cash/icm/gto never had a daily roster.
// Source of truth: CATEGORY_MAPPINGS in src/lib/trivia/triviaEngine.ts.
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
    {
        id: 'poker_history',
        name: 'Poker History',
        kind: 'fact',
        guidance:
            'Milestones and eras of poker: the 1970-2025 WSOP timeline, the 2003 Moneymaker boom, ' +
            'Black Friday (April 15 2011), the UIGEA, the rise and fall of specific sites and rooms, ' +
            'the origins of Hold\'em in Robstown TX, pre-Hold\'em games (stud, draw, Faro).',
        topics: [
            'Origins of poker and pre-Hold\'em card games',
            'WSOP milestones by decade',
            'The 2003-2006 online poker boom',
            'Black Friday and poker legislation',
            'Historic high-stakes cash games',
            'Televised poker and its production history',
            'Landmark poker venues and card rooms',
        ],
    },
    {
        id: 'famous_hands',
        name: 'Famous Hands',
        kind: 'fact',
        guidance:
            'Specific televised or documented hands. EVERY question must name the event AND the year ' +
            '(e.g. "2003 WSOP Main Event", "2009 Poker After Dark"). Name the players and the actual ' +
            'cards where they are part of the public record. Never invent a hand.',
        topics: [
            'WSOP Main Event final-table hands',
            'High Stakes Poker iconic pots',
            'Poker After Dark memorable plays',
            'Historic bluffs and hero calls',
            'Famous bad beats and coolers',
            'Million-dollar televised pots',
            'Heads-up championship hands',
        ],
    },
    {
        id: 'player_profiles',
        name: 'Player Profiles',
        kind: 'fact',
        guidance:
            'Verifiable career facts only: bracelet counts, WPT/EPT titles, Hall of Fame induction years, ' +
            'documented live earnings milestones, well-known aliases and nicknames. If a figure changes ' +
            'year to year, anchor it to a stated year. Never fabricate a statistic.',
        topics: [
            'WSOP bracelet records',
            'Poker Hall of Fame inductees',
            'Online poker legends and their aliases',
            'International poker champions',
            'High-stakes cash game specialists',
            'Poker authors and their books',
            'Commentators and poker media figures',
        ],
    },
    {
        id: 'tournament_facts',
        name: 'Tournament Facts',
        kind: 'fact',
        guidance:
            'Tournament structures, records and results: WSOP Main Event champions and prize pools, ' +
            'the Big One for One Drop, Triton, EPT/WPT history, field-size records, payout structures, ' +
            'late registration and re-entry formats, satellite mechanics.',
        topics: [
            'WSOP Main Event champions and prize pools',
            'The Big One for One Drop and super high rollers',
            'EPT and WPT history',
            'Triton Series records',
            'Field-size and prize-pool records',
            'Tournament structures (turbo, deepstack, bounty, satellite)',
            'Online tournament milestones',
        ],
    },
    {
        id: 'rule_knowledge',
        name: 'Rules & Etiquette',
        kind: 'fact',
        guidance:
            'Official rules and rulings: TDA tournament rules, hand-ranking edge cases, minimum-raise and ' +
            'string-bet rules, all-in and side-pot procedure, dead button and dead hand rules, showdown ' +
            'order, exposed-card and misdeal procedure, one-chip rule, table etiquette. Prefer rulings a ' +
            'player actually hits at the table over dictionary definitions.',
        topics: [
            'Hand rankings and tie-breaking edge cases',
            'Betting rules, min-raise and string bets',
            'TDA tournament procedure',
            'All-in protocol and side pots',
            'Dealer, button and dead-button rules',
            'Showdown order and exposed cards',
            'Table etiquette and common disputes',
        ],
    },
    {
        id: 'gto_theory',
        name: 'GTO Theory',
        kind: 'strategy',
        guidance:
            'Game-theory concepts made concrete: minimum defence frequency, alpha/bluff-to-value ratios, ' +
            'polarization vs linear ranges, blockers, equity realization, indifference and mixed strategies. ' +
            'Anchor every concept to a hand the player is actually holding in a real spot.',
        topics: [
            'Minimum defence frequency in practice',
            'Bluff-to-value ratios by bet size',
            'Polarized vs linear range construction',
            'Blocker and unblocker effects',
            'Equity realization and position',
            'Indifference and mixed strategies',
            'Exploitative deviations from equilibrium',
        ],
    },
    {
        id: 'mtt_situations',
        name: 'MTT Situations',
        kind: 'strategy',
        guidance:
            'Multi-table tournament decision points: bubble and pay-jump pressure, short/medium/big stack ' +
            'play, push-fold thresholds, blind defence, resteals, final-table dynamics, satellites.',
        topics: [
            'Money-bubble decisions under ICM pressure',
            'Short stack play at 8-15BB',
            'Medium stack play at 25-40BB',
            'Big stack pressure and bullying',
            'Final table pay-jump spots',
            'Blind defence and resteals',
            'Satellite-specific strategy',
        ],
    },
    {
        id: 'cash_game_situations',
        name: 'Cash Game Situations',
        kind: 'strategy',
        guidance:
            'No-limit cash spots: deep-stack postflop play, SPR-driven decisions, set mining and implied ' +
            'odds, 3-bet and 4-bet pots, floats and probes, multiway navigation, live vs online reads. ' +
            'Cash games have NO antes unless the question explicitly describes a straddle/ante game.',
        topics: [
            'Deep-stack postflop play at 200BB+',
            'Set mining and implied odds',
            'Stack-to-pot ratio decisions',
            '3-bet and 4-bet pot navigation',
            'Float and probe betting',
            'Multiway pot decisions',
            'Exploiting recreational tendencies',
        ],
    },
    {
        id: 'icm_chip_ev',
        name: 'ICM & Chip EV',
        kind: 'strategy',
        guidance:
            'Independent Chip Model applied to real decisions: risk premium, bubble factor, chipEV vs $EV ' +
            'divergence, Nash push/fold ranges, satellite ICM, final-table deal-making. Give the actual ' +
            'stack distribution and payout context so the answer is computable, not a vibe.',
        topics: [
            'Risk premium on calls near the bubble',
            'Bubble factor and how it scales',
            'chipEV vs $EV divergence',
            'Nash push/fold ranges by stack depth',
            'Satellite ICM (flat payouts)',
            'Final-table pay-jump ladders',
            'ICM deal-making and chops',
        ],
    },
    {
        id: 'gto_scenarios',
        name: 'GTO Scenarios',
        kind: 'strategy',
        guidance:
            'Solver-style spots with a concrete board, position and stack depth: c-bet frequency by board ' +
            'texture, river polarization, MDF applications, node-locked exploits, blocker-driven bluff ' +
            'selection, optimal 3-bet/4-bet frequencies.',
        topics: [
            'C-betting by board texture',
            'River polarization and overbets',
            'MDF applications facing a bet',
            'Optimal 3-bet and 4-bet frequencies',
            'Blocker-driven bluff selection',
            'Node locking and exploitative deviation',
            'Mixed-strategy river decisions',
        ],
    },
];

const STRATEGY_KINDS = new Set(['strategy']);

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE — service role only. The archived job fell back to the ANON key,
// which RLS silently rejects on write, so a "successful" run inserted nothing.
// ═══════════════════════════════════════════════════════════════════════════

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing — trivia generation cannot run');
        if (!key) {
            throw new Error(
                'SUPABASE_SERVICE_ROLE_KEY missing — trivia generation would be silently ' +
                'rejected by RLS with the anon key. Refusing to run.'
            );
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Fisher-Yates, unbiased. */
function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** 'YYYY-MM-DD' N days after the given day string. */
function addDays(dayStr, n) {
    const d = new Date(`${dayStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return getTodayCST(d);
}

// FIX(timezone): daysAgoIso() removed. It produced "now minus N days" as a
// bare UTC instant, while every day label in this file is a CST day string —
// so the last_used_at cutoff drifted up to 6 hours from the daily_date cutoff
// at the window boundary. Cutoffs are now derived from the CST day boundary
// via addDays() + getTodayStartCST() (see tagRosterForDay), so both filters
// agree on where "60 days ago" starts.

/**
 * Split a per-category quota across the enforced difficulty mix, distributing
 * the rounding remainder so the totals always add up exactly.
 */
function planDifficulties(total) {
    const plan = DIFFICULTY_PLAN.map(p => ({ difficulty: p.difficulty, count: Math.floor(total * p.share) }));
    let assigned = plan.reduce((s, p) => s + p.count, 0);
    let i = 0;
    while (assigned < total) {
        plan[i % plan.length].count += 1;
        assigned += 1;
        i += 1;
    }
    return plan.filter(p => p.count > 0);
}

/**
 * Normalized existing question texts for a category. Dedup happens in CODE,
 * not by hoping the model honours a prompt hint.
 * Returns { norms: Set<string>, samples: string[] } — samples are RAW texts so
 * the anti-duplicate prompt block is human-readable (the archived/seed version
 * fed the model normalized blobs like "whowonthe2003wsopmainevent", which it
 * cannot meaningfully match against).
 */
async function loadCategoryTexts(supabase, categoryId, sampleSize = 25) {
    const norms = new Set();
    const raw = [];
    const PAGE = 1000;
    for (let from = 0; from < 6000; from += PAGE) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('question')
            .eq('category', categoryId)
            .order('created_at', { ascending: false })
            .range(from, from + PAGE - 1);
        if (error) {
            console.warn(`[GenerateTrivia] dedup load failed for ${categoryId}:`, error.message);
            break;
        }
        const rows = data || [];
        if (rows.length === 0) break;
        for (const row of rows) {
            const norm = normalizeQuestionText(row?.question);
            if (norm) norms.add(norm);
            if (raw.length < sampleSize && row?.question) raw.push(String(row.question));
        }
        if (rows.length < PAGE) break;
    }
    // Sample a random slice of the newest texts so consecutive runs do not all
    // see the same 25 examples.
    return { norms, samples: shuffleInPlace(raw).slice(0, sampleSize) };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS — this is where "world class" is actually specified
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT =
    'You are a poker historian, rules authority and solver-literate strategist writing questions for a ' +
    'premium poker trivia product. Accuracy outranks everything: a question you are not certain about ' +
    'must not be written at all. You output ONLY valid JSON, never markdown, never commentary.';

const DIFFICULTY_BRIEF = {
    easy: 'a regular recreational player who watches poker content would get this right',
    medium: 'a serious hobbyist or low-stakes regular would get this right; a casual fan would not',
    hard: 'only a dedicated student of the game gets this right, but it is still objectively checkable',
};

function buildPrompt(category, difficulty, count, avoidSamples, topic) {
    const isStrategy = STRATEGY_KINDS.has(category.kind);

    const avoidBlock = avoidSamples.length > 0
        ? `\n\nALREADY IN THE POOL — do not repeat these, and do not merely reword them:\n${
            avoidSamples.map((q, i) => `${i + 1}. ${String(q).slice(0, 140)}`).join('\n')
        }\n`
        : '';

    const strategyRules = isStrategy
        ? `
SCENARIO REQUIREMENTS (this is a STRATEGY category — a question missing any of
these is rejected automatically by the validator and wastes the call):
- State the effective stack in big blinds, written as a number followed by BB (e.g. "40BB effective").
- State the hero's position using a standard abbreviation: UTG, MP, HJ, CO, BTN, SB or BB.
- State the hero's exact hole cards using rank+suit notation with lowercase suits
  (e.g. "As Kd", "Th 9h") or standard shorthand ("AKo", "77", "T9s"). Never say "a strong hand".
- Describe the action that led to the decision (who opened, to what size, who called).
- Tournament questions must use the BIG BLIND ANTE convention: the ante equals one big blind
  (e.g. "blinds 500/1,000 with a 1,000 ante"). Cash game questions have NO ante at all.
- Never recommend an open-shove deeper than 20BB.
- Do not offer a "raise" option when the hero is facing an all-in at equal effective stacks.
- Do not offer draw/improve options on the river.
`
        : `
FACTUAL REQUIREMENTS (this is a FACT category):
- Every question must be answerable from the public record. Name the event, the year, the player,
  the venue or the rule book that settles it.
- Prefer specific, checkable details (dates, counts, amounts, official rule numbers) over vibes.
- If you cannot state a fact with certainty, write a different question instead. Do not guess.
- Do not write a question whose answer changes over time unless you anchor it to a stated year.
`;

    return `Write exactly ${count} poker trivia questions.

CATEGORY: ${category.name}
FOCUS FOR THIS BATCH: ${topic}
CATEGORY GUIDANCE: ${category.guidance}
DIFFICULTY: ${difficulty} — ${DIFFICULTY_BRIEF[difficulty]}
${strategyRules}
UNIVERSAL REQUIREMENTS:
- Exactly 4 options. Exactly one is correct. correct_index is the 0-based index of the correct option.
- VARY correct_index across the batch — do not put the answer first every time.
- DISTRACTOR QUALITY IS GRADED. Each wrong option must be something a knowledgeable player could
  genuinely believe: the right kind of thing, the right order of magnitude, similar length and
  phrasing to the correct answer. Reject your own option if it is obviously wrong at a glance.
- NEVER use filler options: "none of the above", "it doesn't matter", "it's just luck", "who cares".
- The question text must NOT leak the answer.
- Every question needs an explanation of at least 2 full sentences (120+ characters) that teaches
  WHY the answer is right — cite the event/year/rule for facts, or the concept and the number for
  strategy. Do not write "Option B is correct"; explain the reasoning.
- No two questions in this batch may test the same fact or the same decision.
${avoidBlock}
Return ONLY this JSON object:
{"questions":[{"question":"...","options":["...","...","...","..."],"correct_index":0,"explanation":"...","theme":"3-6 word topic label","citation":"event/year/rule reference or null"}]}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE A — GENERATE
// ═══════════════════════════════════════════════════════════════════════════

function parseGrokJson(content) {
    if (!content || typeof content !== 'string') return null;
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.questions)) return parsed.questions;
        return null;
    } catch (_e) {
        return null;
    }
}

/**
 * Build a DB row from a model question.
 *
 * Options are shuffled HERE — before validation — so that:
 *   (a) the stored correct_index distribution is not biased toward 0 (a well
 *       documented LLM habit; consumers that forget to shuffle client-side
 *       would otherwise leak the answer), and
 *   (b) the SYNC checks still see a coherent question, which they would not if
 *       we shuffled after validating.
 */
function buildRow(q, category, difficulty, topic) {
    const options = q.options.map(o => String(o).trim());
    const correctText = options[q.correct_index];
    const pairs = options.map((text, i) => ({ text, wasCorrect: i === q.correct_index }));
    shuffleInPlace(pairs);
    const newIndex = pairs.findIndex(p => p.wasCorrect);

    return {
        category: category.id,
        difficulty,
        question: String(q.question).trim(),
        options: pairs.map(p => p.text),
        correct_index: newIndex >= 0 ? newIndex : 0,
        explanation: String(q.explanation || '').trim(),
        subcategory: topic.slice(0, 120),
        theme: typeof q.theme === 'string' ? q.theme.slice(0, 80) : null,
        quality_score: SEEDED_QUALITY_SCORE,
        source: SOURCE_TAG,
        engine_metadata: {
            model: MODEL,
            topic,
            citation: typeof q.citation === 'string' ? q.citation.slice(0, 300) : null,
            original_correct_answer: correctText,
            generated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
    };
}

async function generateBatch(grok, category, difficulty, count, avoidSamples, topic) {
    const response = await grok.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildPrompt(category, difficulty, count, avoidSamples, topic) },
        ],
        response_format: { type: 'json_object' },
        // 0.9 (the old value) produced malformed JSON and invented facts.
        temperature: 0.7,
        max_tokens: 4000,
    });

    const raw = parseGrokJson(response?.choices?.[0]?.message?.content);
    if (!raw) return [];

    return raw
        .filter(q =>
            q && typeof q.question === 'string'
            && Array.isArray(q.options) && q.options.length === 4
            && Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3
        )
        .map(q => buildRow(q, category, difficulty, topic));
}

/**
 * FIX(parse-retry): a Grok batch that throws OR parses to [] (malformed /
 * truncated JSON is silently swallowed by parseGrokJson) used to be counted
 * straight into grokFailures with no second chance, leaving that category's
 * difficulty quota unmet for the day. Retry the SAME prompt exactly once
 * before giving up. The retry is skipped when the wall-clock budget is spent,
 * so a slow run cannot double its own overrun.
 *
 * @returns {Promise<{candidates: object[], error: string|null, retried: boolean}>}
 */
async function generateBatchWithRetry(grok, category, difficulty, count, avoidSamples, topic, deadline) {
    let lastError = null;
    let retried = false;
    for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() > deadline) {
            return { candidates: [], error: lastError || 'budget exhausted before attempt', retried };
        }
        retried = attempt > 0;
        try {
            const candidates = await generateBatch(grok, category, difficulty, count, avoidSamples, topic);
            if (candidates.length > 0) return { candidates, error: null, retried };
            lastError = 'empty or unparseable response';
        } catch (e) {
            lastError = String(e?.message || e).slice(0, 160);
        }
    }
    return { candidates: [], error: lastError, retried: true };
}

/**
 * Generate + validate + insert new questions for ONE category.
 * Every question passes src/lib/triviaValidator.validateBatch (structure, sync,
 * math, logic, quality) AND normalized-text dedup before it touches the DB.
 * Inserts happen per batch, so a timeout keeps everything already written.
 */
async function generateForCategory(supabase, grok, category, quota, deadline) {
    const result = {
        category: category.id,
        requested: quota,
        inserted: 0,
        rejectedQuality: 0,
        rejectedDuplicate: 0,
        grokFailures: 0,
        byDifficulty: {},
        errors: [],
    };

    if (Date.now() > deadline) {
        result.errors.push(`budget exhausted before ${category.id}`);
        return result;
    }

    const { norms, samples } = await loadCategoryTexts(supabase, category.id);
    const topicOffset = Math.floor(Math.random() * category.topics.length);
    const plan = planDifficulties(quota);

    // The three difficulty batches are independent, so they are issued
    // CONCURRENTLY. Sequentially they cost ~3 model round trips per category,
    // which at 10 categories overran the wall-clock budget and left the tail
    // categories starved every run; in parallel a category costs roughly one
    // round trip.
    const settled = await Promise.all(plan.map(async ({ difficulty, count }, i) => {
        const topic = category.topics[(topicOffset + i) % category.topics.length];
        // Over-request proportionally: the validator is strict and the
        // normalized-text dedup bites hardest in narrow categories (a
        // rule_knowledge quota of ~26 was netting ~18/day because the flat
        // +2 spare could not absorb the rejects). Spare scales with the
        // batch so short categories - which get the biggest batches from
        // the adaptive planner - also get the most reject headroom, while
        // healthy categories keep the old +2. Inserts stay capped at
        // `count` (valid.slice below), so quotas are never exceeded.
        // FIX(parse-retry): throw/[] now gets ONE same-prompt retry (budget
        // permitting) before it is surfaced as a grok failure.
        const { candidates, error } = await generateBatchWithRetry(
            grok, category, difficulty, count + Math.max(2, Math.ceil(count * 0.5)), samples, topic, deadline
        );
        return { difficulty, count, candidates, error };
    }));

    // Validation and insertion run SEQUENTIALLY over the settled batches so the
    // dedup set is consistent — two concurrent batches must not both accept the
    // same question.
    for (const { difficulty, count, candidates, error } of settled) {
        if (error) {
            result.grokFailures += 1;
            result.errors.push(`grok ${category.id}/${difficulty}: ${error}`);
            continue;
        }
        if (candidates.length === 0) {
            result.grokFailures += 1;
            continue;
        }

        // ═══ VALIDATION GATE — nothing unvalidated is ever inserted ═══
        const { valid, rejected } = validateBatch(candidates, { existingTexts: norms });
        for (const r of rejected) {
            if (r.errors.some(e => e.startsWith('DUP-'))) result.rejectedDuplicate += 1;
            else result.rejectedQuality += 1;
            if (r.errors.length) console.debug(`[GenerateTrivia] reject ${category.id}: ${r.errors[0]}`);
        }

        const toInsert = valid.slice(0, count);
        if (toInsert.length === 0) continue;

        // Register accepted texts BEFORE the insert so the next batch in this
        // same run cannot slip a near-identical question past the gate.
        for (const q of toInsert) {
            const norm = normalizeQuestionText(q.question);
            if (norm) norms.add(norm);
            if (samples.length < 40) samples.push(q.question);
        }

        const { data, error: insertError } = await supabase
            .from('trivia_questions')
            .insert(toInsert)
            .select('id');

        if (insertError) {
            result.errors.push(`insert ${category.id}/${difficulty}: ${insertError.message}`);
            continue;
        }

        const n = data?.length || 0;
        result.inserted += n;
        result.byDifficulty[difficulty] = (result.byDifficulty[difficulty] || 0) + n;
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE B — TAG THE DAILY ROSTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure `day` has ROSTER_TAG_PER_CATEGORY questions tagged for every category.
 *
 * Idempotent by construction: it counts what is already tagged for that day and
 * only tops up the difference, so a retry, a duplicate cron delivery or a manual
 * trigger cannot double-tag. Candidates exclude anything featured on a daily
 * roster inside the no-repeat window, so the roster itself honours the 60-day
 * promise.
 */
async function tagRosterForDay(supabase, day, deadline) {
    const rosterCutoffDay = addDays(day, -NO_REPEAT_WINDOW_DAYS);
    // FIX(timezone): both cutoffs now share the SAME CST day boundary. The old
    // daysAgoIso(60) was a UTC instant relative to "now", which disagreed with
    // rosterCutoffDay (a CST day string) by up to 6 hours — rows re-entered
    // one filter's window hours before the other's.
    const usedCutoffIso = getTodayStartCST(rosterCutoffDay);
    const nowIso = new Date().toISOString();

    const perCategory = {};
    // id -> slot, so every category's Nth question shares an order_index and the
    // roster can be written with ROSTER_TAG_PER_CATEGORY bulk updates instead of
    // one round trip per row.
    const bySlot = new Map();
    let shortfall = 0;

    for (const category of CATEGORIES) {
        if (Date.now() > deadline) {
            perCategory[category.id] = { tagged: 0, existing: null, skipped: 'budget' };
            continue;
        }

        const { count: alreadyTagged, error: countErr } = await supabase
            .from('trivia_questions')
            .select('id', { count: 'exact', head: true })
            .eq('category', category.id)
            .eq('daily_date', day)
            .gte('quality_score', ROSTER_MIN_QUALITY);

        if (countErr) {
            perCategory[category.id] = { tagged: 0, error: countErr.message };
            continue;
        }

        const have = alreadyTagged || 0;
        // FIX(roster-cut): top-up target is the TAGGING size (3), not the
        // per-player consumption model (20). See the constant block up top.
        const need = ROSTER_TAG_PER_CATEGORY - have;
        if (need <= 0) {
            perCategory[category.id] = { tagged: 0, existing: have, complete: true };
            continue;
        }

        // Candidate selection, in preference order:
        //   1. quality_score >= 8, never featured or featured > 60 days ago
        //   2. same, but quality_score >= 6 (the gameplay floor)
        // Within each tier: least-recently-featured, then least-recently-used.
        // NOTE on the `.or(... .is.null ...)` forms: a bare `.neq('daily_date', day)`
        // would silently DROP every never-featured row, because in SQL
        // `NULL <> '2026-07-26'` is NULL, not TRUE. Each filter therefore spells
        // out the null branch explicitly. Chained `.or()` calls are ANDed.
        const selectCandidates = async (minQuality, respectWindow) => {
            let q = supabase
                .from('trivia_questions')
                .select('id')
                .eq('category', category.id)
                .gte('quality_score', minQuality);
            if (respectWindow) {
                q = q
                    .or(`daily_date.is.null,daily_date.lt.${rosterCutoffDay}`)
                    .or(`last_used_at.is.null,last_used_at.lt.${usedCutoffIso}`);
            } else {
                q = q.or(`daily_date.is.null,daily_date.neq.${day}`);
            }
            const { data, error } = await q
                .order('daily_date', { ascending: true, nullsFirst: true })
                .order('last_used_at', { ascending: true, nullsFirst: true })
                .order('id', { ascending: true })
                .limit(need * 4);
            if (error) {
                console.warn(`[GenerateTrivia] candidate query failed (${category.id}):`, error.message);
                return [];
            }
            return data || [];
        };

        let candidates = await selectCandidates(ROSTER_PREFERRED_QUALITY, true);
        let tier = 'quality>=8, outside 60d window';
        if (candidates.length < need) {
            candidates = await selectCandidates(ROSTER_MIN_QUALITY, true);
            tier = 'quality>=6, outside 60d window';
        }
        if (candidates.length < need) {
            // Pool-depth emergency: the category cannot fill a roster without
            // replaying something from inside the window. Serve the oldest.
            candidates = await selectCandidates(ROSTER_MIN_QUALITY, false);
            tier = 'quality>=6, INSIDE 60d window (pool too shallow)';
        }

        const chosen = shuffleInPlace(candidates.slice(0, need * 2)).slice(0, need);
        chosen.forEach((row, i) => {
            const slot = have + i;
            if (!bySlot.has(slot)) bySlot.set(slot, []);
            bySlot.get(slot).push(row.id);
        });

        const missing = Math.max(0, need - chosen.length);
        shortfall += missing;
        perCategory[category.id] = {
            existing: have,
            tagged: chosen.length,
            missing,
            tier,
        };
    }

    // One update per order_index slot (<= ROSTER_TAG_PER_CATEGORY round trips
    // for the whole roster).
    const slotEntries = [...bySlot.entries()];
    const updateResults = await Promise.all(slotEntries.map(([slot, ids]) =>
        supabase
            .from('trivia_questions')
            .update({ daily_date: day, order_index: slot, last_used_at: nowIso })
            .in('id', ids)
            .then(({ error }) => {
                if (error) {
                    console.warn('[GenerateTrivia] roster tag failed:', error.message);
                    return 0;
                }
                return ids.length;
            })
    ));

    return {
        day,
        tagged: updateResults.reduce((a, b) => a + b, 0),
        // FIX(roster-cut): target reflects what is actually tagged (3/category),
        // not the per-player demand model.
        target: ROSTER_TAG_PER_CATEGORY * CATEGORIES.length,
        shortfall,
        categories: perCategory,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// POOL DEPTH — the 60-day math, computed not assumed
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Required usable questions per category = questions served per day by the mode
 * that category backs x 60 days, plus headroom for audit attrition.
 *
 * Modes are single-category for rules/mtt/cash/icm (20 q/day each) and
 * multi-category for history/pro/gto; survival draws 200/run from everything.
 * Reuses getPoolDepthReport() from src/lib/triviaQuestionLoader.js rather than
 * re-deriving the arithmetic.
 */
const DEDICATED_MODE_CATEGORIES = new Set([
    'rule_knowledge',
    'mtt_situations',
    'cash_game_situations',
    'icm_chip_ev',
]);
/** Attrition headroom: the audit demotes a slice of every category below qs 6. */
const DEPTH_HEADROOM = 1.25;
const SURVIVAL_QUESTIONS_PER_RUN = 200;

async function buildDepthReport(supabase) {
    const perCategory = await Promise.all(CATEGORIES.map(async (cat) => {
        const perDay = CATEGORY_DAILY_DEMAND[cat.id] ?? 10;
        const report = await getPoolDepthReport(supabase, {
            category: cat.id,
            minQuality: ROSTER_MIN_QUALITY,
            questionsPerDay: perDay,
            windowDays: NO_REPEAT_WINDOW_DAYS,
        });
        const recommended = Math.ceil(report.required * DEPTH_HEADROOM);
        return [cat.id, {
            name: cat.name,
            total: report.total,
            usable: report.usable,
            questionsPerDay: perDay,
            required: report.required,
            recommendedWithHeadroom: recommended,
            shortfall: report.shortfall,
            shortfallWithHeadroom: Math.max(0, recommended - report.usable),
            daysOfCoverage: report.daysOfCoverage,
            meetsGuarantee: report.meetsGuarantee,
        }];
    }));

    const overall = await getPoolDepthReport(supabase, {
        minQuality: ROSTER_MIN_QUALITY,
        questionsPerDay: SURVIVAL_QUESTIONS_PER_RUN,
        windowDays: NO_REPEAT_WINDOW_DAYS,
    });

    const categories = Object.fromEntries(perCategory);
    return {
        windowDays: NO_REPEAT_WINDOW_DAYS,
        qualityFloor: ROSTER_MIN_QUALITY,
        categories,
        survival: {
            questionsPerRun: SURVIVAL_QUESTIONS_PER_RUN,
            required: overall.required,
            usable: overall.usable,
            shortfall: overall.shortfall,
            daysOfCoverage: overall.daysOfCoverage,
            meetsGuarantee: overall.meetsGuarantee,
        },
        totalShortfall: Object.values(categories).reduce((s, c) => s + c.shortfall, 0),
        categoriesBelowFloor: Object.entries(categories)
            .filter(([, c]) => !c.meetsGuarantee)
            .map(([id, c]) => `${id} (${c.usable}/${c.required})`),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// FEAT(adaptive-volume) — self-healing generation depth
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Plan this run's per-category generation quotas from measured pool depth.
 *
 * Demand model (same as trivia-pool-guard):
 *   target(category) = CATEGORY_DAILY_DEMAND[category] x 60 days x 1.25 headroom
 *
 * A category at/above its target generates the base quota (the steady-state
 * drip). A category below target scales linearly with its shortfall fraction,
 * capped at ADAPTIVE_MAX_PER_CATEGORY (30). One cheap head-count per category;
 * any count error falls back to the base quota for that category so a flaky
 * read can never zero out generation.
 *
 * @returns {Promise<{plan: Map<string, object>, ordered: object[], measured: boolean}>}
 *          `ordered` is CATEGORIES sorted shortest-first (lowest fill ratio),
 *          so a budget timeout starves the healthiest categories, not the
 *          neediest. `measured:false` means every count failed — callers keep
 *          the original rotation order and base quotas.
 */
async function planAdaptiveQuotas(supabase, baseQuota) {
    const counts = await Promise.all(CATEGORIES.map(async (cat) => {
        const { count, error } = await supabase
            .from('trivia_questions')
            .select('id', { count: 'exact', head: true })
            .eq('category', cat.id)
            .gte('quality_score', ROSTER_MIN_QUALITY);
        if (error) {
            console.warn(`[GenerateTrivia] adaptive depth count failed (${cat.id}):`, error.message);
            return { id: cat.id, servable: null };
        }
        return { id: cat.id, servable: count || 0 };
    }));

    const plan = new Map();
    let anyMeasured = false;
    for (const { id, servable } of counts) {
        const perDay = CATEGORY_DAILY_DEMAND[id] ?? 10;
        const target = Math.ceil(perDay * NO_REPEAT_WINDOW_DAYS * DEPTH_HEADROOM);
        if (servable == null) {
            plan.set(id, { quota: baseQuota, servable: null, target, shortfall: null, fillRatio: 1 });
            continue;
        }
        anyMeasured = true;
        const shortfall = Math.max(0, target - servable);
        const fillRatio = target > 0 ? servable / target : 1;
        const quota = shortfall === 0
            ? baseQuota
            : Math.min(
                ADAPTIVE_MAX_PER_CATEGORY,
                Math.max(
                    baseQuota,
                    Math.ceil(baseQuota + (ADAPTIVE_MAX_PER_CATEGORY - baseQuota) * Math.min(1, shortfall / target))
                )
            );
        plan.set(id, { quota, servable, target, shortfall, fillRatio });
    }

    // Shortest categories first. Unmeasured categories keep a neutral ratio of
    // 1 so they sort behind every genuinely short category.
    const ordered = CATEGORIES.slice().sort(
        (a, b) => (plan.get(a.id)?.fillRatio ?? 1) - (plan.get(b.id)?.fillRatio ?? 1)
    );
    return { plan, ordered, measured: anyMeasured };
}

// ═══════════════════════════════════════════════════════════════════════════
// FEAT(self-audit) — PHASE D: cold-answer fact check, no external audit needed
// ═══════════════════════════════════════════════════════════════════════════

/** Parse one cold-answer completion: {"answer_index":0-3,"confidence":0-1}. */
function parseColdAnswer(content) {
    if (!content || typeof content !== 'string') return null;
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        const idx = Number.isInteger(parsed?.answer_index) ? parsed.answer_index : null;
        if (idx == null || idx < 0 || idx > 3) return null;
        const conf = Number.isFinite(parsed?.confidence)
            ? Math.max(0, Math.min(1, parsed.confidence))
            : null;
        return { index: idx, confidence: conf };
    } catch (_e) {
        return null;
    }
}

/**
 * Ask the model to answer a stored question COLD — the stored correct_index is
 * never sent, so agreement is evidence, not echo. Two cold answers are wanted;
 * they are batched into ONE API call via `n: 2` (two independent samples at
 * temperature 0.5). If the provider ignores `n` or one sample fails to parse,
 * exactly one follow-up single call tops it up.
 *
 * @returns {Promise<{answers: Array<{index:number, confidence:number|null}>, error: string|null}>}
 */
async function coldAnswerQuestion(grok, q) {
    const request = {
        model: MODEL,
        messages: [
            {
                role: 'system',
                content: 'You are a poker expert answering a multiple-choice trivia question cold. ' +
                    'Output ONLY valid JSON, never markdown, never commentary.',
            },
            {
                role: 'user',
                content: `Answer this poker question. Reply ONLY with JSON {"answer_index":<0-3>,"confidence":<0-1>}.\n\n` +
                    `QUESTION: ${q.question}\nOPTIONS:\n${q.options.map((o, i) => `${i}. ${o}`).join('\n')}`,
            },
        ],
        response_format: { type: 'json_object' },
        // Non-zero so the two samples are semi-independent; at 0 they would
        // always be identical and "both agree" would carry no extra signal.
        temperature: 0.5,
        // Cap tokens hard — the reply is a ~15-token JSON object.
        max_tokens: 60,
        n: 2,
    };

    let answers = [];
    try {
        const response = await grok.chat.completions.create(request);
        answers = (response?.choices || [])
            .map(c => parseColdAnswer(c?.message?.content))
            .filter(Boolean);
    } catch (e) {
        return { answers: [], error: String(e?.message || e).slice(0, 160) };
    }

    if (answers.length < 2) {
        try {
            const retry = await grok.chat.completions.create({ ...request, n: 1 });
            const extra = parseColdAnswer(retry?.choices?.[0]?.message?.content);
            if (extra) answers.push(extra);
        } catch (_e) {
            // keep whatever we have; the caller treats <2 answers as inconclusive
        }
    }
    return { answers: answers.slice(0, 2), error: null };
}

/**
 * PHASE D — rolling self-audit of the servable pool.
 *
 * Picks up to AUDIT_PER_RUN oldest never-audited servable questions (ANY
 * source — the external "Phase 52" audit does not exist in this repo's
 * schedule, so this is the only fact check the pool gets) and cold-asks the
 * model twice per question. Outcomes:
 *   - both cold answers == stored correct_index
 *         -> audit_verified = true, last_audited_at = now
 *   - both agree with EACH OTHER, disagree with stored, both confident
 *         -> quality_score = AUDIT_DEMOTED_QUALITY (4), daily_date cleared
 *            (same pull-from-rotation semantics as report-question's
 *            3-strike demotion), engine_metadata.audit note kept
 *   - anything else (mixed, unparseable, low confidence, API error)
 *         -> last_audited_at = now only, so the row leaves the never-audited
 *            queue; once that queue drains, a follow-up change can re-audit by
 *            ordering on last_audited_at ASC instead of IS NULL.
 *
 * Budget-aware: stops between questions when `deadline` passes; never starts
 * a question with <5s left.
 */
async function selfAuditQuestions(supabase, grok, deadline) {
    const out = {
        attempted: 0,
        verified: 0,
        demoted: 0,
        inconclusive: 0,
        apiErrors: 0,
        skipped: null,
    };
    if (!grok) {
        out.skipped = 'grok client unavailable';
        return out;
    }
    if (Date.now() > deadline) {
        out.skipped = 'budget exhausted before audit';
        return out;
    }

    const { data, error } = await supabase
        .from('trivia_questions')
        .select('id, question, options, correct_index, quality_score, engine_metadata')
        .is('last_audited_at', null)
        .gte('quality_score', ROSTER_MIN_QUALITY)
        .order('created_at', { ascending: true })
        .limit(AUDIT_PER_RUN);
    if (error) {
        out.skipped = `candidate query failed: ${error.message}`;
        return out;
    }

    for (const q of data || []) {
        if (Date.now() > deadline - 5000) {
            out.skipped = 'budget exhausted mid-audit';
            break;
        }
        const nowIso = new Date().toISOString();

        // Structurally unauditable rows are stamped and skipped rather than
        // burning two model calls on garbage.
        if (
            typeof q.question !== 'string'
            || !Array.isArray(q.options) || q.options.length !== 4
            || !Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3
        ) {
            await supabase.from('trivia_questions')
                .update({ last_audited_at: nowIso })
                .eq('id', q.id);
            out.inconclusive += 1;
            continue;
        }

        out.attempted += 1;
        const { answers, error: coldErr } = await coldAnswerQuestion(grok, q);
        if (coldErr) out.apiErrors += 1;

        const bothParsed = answers.length === 2;
        const bothMatchStored = bothParsed
            && answers[0].index === q.correct_index
            && answers[1].index === q.correct_index;
        const bothAgreeWrong = bothParsed
            && answers[0].index === answers[1].index
            && answers[0].index !== q.correct_index
            && (answers[0].confidence ?? 0) >= AUDIT_MIN_CONFIDENCE
            && (answers[1].confidence ?? 0) >= AUDIT_MIN_CONFIDENCE;

        let update;
        if (bothMatchStored) {
            update = { audit_verified: true, last_audited_at: nowIso };
            out.verified += 1;
        } else if (bothAgreeWrong) {
            update = {
                quality_score: AUDIT_DEMOTED_QUALITY,
                last_audited_at: nowIso,
                // Pull it off any tagged roster immediately, mirroring
                // report-question's demotion semantics.
                daily_date: null,
                engine_metadata: {
                    ...(q.engine_metadata && typeof q.engine_metadata === 'object' ? q.engine_metadata : {}),
                    audit: {
                        cold_answers: answers,
                        stored_correct_index: q.correct_index,
                        model: MODEL,
                        at: nowIso,
                    },
                },
            };
            out.demoted += 1;
        } else {
            update = { last_audited_at: nowIso };
            out.inconclusive += 1;
        }

        const { error: updErr } = await supabase
            .from('trivia_questions')
            .update(update)
            .eq('id', q.id);
        if (updErr) console.warn(`[GenerateTrivia] audit update failed (${q.id}):`, updErr.message);
    }

    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    try {
        // Fail-closed, constant-time, header-only. No NODE_ENV or method
        // exception: the archived job let ANY unauthenticated POST in
        // production spend Grok tokens and write to trivia_questions.
        if (!requireAdminSecret(req, res, { label: 'cron-generate-trivia' })) return;

        const started = Date.now();
        const deadline = started + RUN_BUDGET_MS;
        const supabase = getSupabase();

        // ─── Which Chicago day(s) are we building for? ───────────────────
        const now = new Date();
        const todayCST = getTodayCST(now);
        const leadDay = getTodayCST(new Date(now.getTime() + TAG_LEAD_MINUTES * 60000));
        const explicitDay = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
            ? req.query.date
            : null;
        // Today first (self-heals a missed run), then the lead day.
        const daysToTag = explicitDay ? [explicitDay] : [...new Set([todayCST, leadDay])];

        const skipGeneration = req.query.skipGeneration === '1' || req.query.rosterOnly === '1';
        const perCategoryQuota = Math.max(
            0,
            Math.min(30, parseInt(req.query.generate, 10) || GENERATE_PER_CATEGORY)
        );

        // ─── Resumable, always-advancing category cursor ─────────────────
        // A fixed order means a timeout always starves the SAME tail
        // categories. The cursor rotates daily and can be overridden by a
        // retry using the `nextCursor` this handler returns.
        const dayNumber = Math.floor(Date.parse(`${todayCST}T00:00:00Z`) / 86400000);
        const requestedCursor = parseInt(req.query.cursor, 10);
        const startCursor = Number.isFinite(requestedCursor)
            ? ((requestedCursor % CATEGORIES.length) + CATEGORIES.length) % CATEGORIES.length
            : ((dayNumber % CATEGORIES.length) + CATEGORIES.length) % CATEGORIES.length;

        const summary = {
            ok: true,
            model: MODEL,
            startedAt: new Date(started).toISOString(),
            todayCST,
            daysTagged: daysToTag,
            cursor: startCursor,
            nextCursor: null,
            timedOut: false,
            generation: {
                skipped: skipGeneration,
                requestedPerCategory: perCategoryQuota,
                inserted: 0,
                rejectedQuality: 0,
                rejectedDuplicate: 0,
                grokFailures: 0,
                adaptive: null,
                categories: {},
            },
            roster: [],
            depth: null,
            audit: null,
            warnings: [],
        };

        // FEAT(self-audit): the Grok client is hoisted so PHASE D can reuse it
        // even when generation is skipped (rosterOnly runs still audit).
        let grok = null;

        // ═══ PHASE A — grow the pool ═══════════════════════════════════
        if (!skipGeneration && perCategoryQuota > 0) {
            // FEAT(adaptive-volume): measure servable depth per category and
            // scale quotas BEFORE spending any Grok budget. Short categories
            // (servable < CATEGORY_DAILY_DEMAND x 60 x 1.25) generate up to
            // ADAPTIVE_MAX_PER_CATEGORY; healthy ones stay at the base drip.
            // The iteration order becomes shortest-first so a budget timeout
            // starves the healthiest categories, not the neediest. The
            // resumable cursor now indexes into THIS ordering; depth barely
            // moves between a run and its immediate ?cursor= retry, so the
            // resume point stays meaningful.
            const adaptive = await planAdaptiveQuotas(supabase, perCategoryQuota);
            const orderedCats = adaptive.measured ? adaptive.ordered : CATEGORIES;
            summary.generation.adaptive = Object.fromEntries(
                [...adaptive.plan.entries()].map(([id, p]) => [id, {
                    servable: p.servable,
                    target: p.target,
                    shortfall: p.shortfall,
                    quota: p.quota,
                }])
            );
            const plannedTotal = [...adaptive.plan.values()].reduce((s, p) => s + p.quota, 0)
                || perCategoryQuota * CATEGORIES.length;

            // Cheap idempotency guard: if this run already produced its daily
            // quota (retry, duplicate cron delivery, manual re-trigger), do not
            // spend the Grok budget again. The target is the ADAPTIVE total, so
            // a resumed run keeps going until the scaled plan is met.
            const { count: madeToday } = await supabase
                .from('trivia_questions')
                .select('id', { count: 'exact', head: true })
                .eq('source', SOURCE_TAG)
                .gte('created_at', getTodayStartCST(todayCST));

            const dailyTarget = plannedTotal;
            if ((madeToday || 0) >= dailyTarget) {
                summary.generation.skipped = true;
                summary.generation.reason = `already generated ${madeToday} questions today (target ${dailyTarget})`;
            } else {
                try {
                    grok = getGrokClient();
                } catch (e) {
                    grok = null;
                    summary.warnings.push(`Grok client unavailable: ${String(e?.message || e).slice(0, 200)}`);
                }

                if (grok) {
                    for (let i = 0; i < orderedCats.length; i++) {
                        const category = orderedCats[(startCursor + i) % orderedCats.length];
                        if (Date.now() > deadline) {
                            summary.timedOut = true;
                            summary.nextCursor = (startCursor + i) % orderedCats.length;
                            summary.warnings.push(
                                `Generation stopped at ${category.id} — re-invoke with ?cursor=${summary.nextCursor} to resume.`
                            );
                            break;
                        }
                        // FEAT(adaptive-volume): per-category quota from the plan.
                        const catQuota = adaptive.plan.get(category.id)?.quota ?? perCategoryQuota;
                        const r = await generateForCategory(supabase, grok, category, catQuota, deadline);
                        summary.generation.inserted += r.inserted;
                        summary.generation.rejectedQuality += r.rejectedQuality;
                        summary.generation.rejectedDuplicate += r.rejectedDuplicate;
                        summary.generation.grokFailures += r.grokFailures;
                        summary.generation.categories[category.id] = {
                            requested: catQuota,
                            inserted: r.inserted,
                            byDifficulty: r.byDifficulty,
                            rejectedQuality: r.rejectedQuality,
                            rejectedDuplicate: r.rejectedDuplicate,
                        };
                        if (r.errors.length) summary.warnings.push(...r.errors.slice(0, 2));
                    }
                }
            }
        }

        // ═══ PHASE B — tag the roster (ALWAYS runs, even if PHASE A failed
        // or timed out; a shallow pool must still get a daily roster) ═════
        for (const day of daysToTag) {
            summary.roster.push(await tagRosterForDay(supabase, day, started + RUN_BUDGET_MS + 30000));
        }

        // ═══ PHASE C — report depth vs the 60-day requirement ══════════
        try {
            summary.depth = await buildDepthReport(supabase);
            if (summary.depth.categoriesBelowFloor.length > 0) {
                summary.warnings.push(
                    `POOL DEPTH: ${summary.depth.categoriesBelowFloor.length} categories below the ` +
                    `${NO_REPEAT_WINDOW_DAYS}-day floor: ${summary.depth.categoriesBelowFloor.join(', ')}`
                );
            }
            if (!summary.depth.survival.meetsGuarantee) {
                summary.warnings.push(
                    `POOL DEPTH: survival needs ${summary.depth.survival.required} usable questions, ` +
                    `pool has ${summary.depth.survival.usable} (short by ${summary.depth.survival.shortfall}).`
                );
            }
        } catch (e) {
            summary.warnings.push(`depth report failed: ${String(e?.message || e).slice(0, 200)}`);
        }

        // ═══ PHASE D — SELF-AUDIT (FEAT: closes the never-runs fact-check
        // gap; the external "Phase 52" audit is not in this repo's schedule).
        // Budget: the ORIGINAL RUN_BUDGET_MS deadline — on generation-heavy
        // days this phase yields entirely rather than risk the 300s kill.
        try {
            if (!grok) {
                // rosterOnly / generation-skipped runs still audit.
                try {
                    grok = getGrokClient();
                } catch (e) {
                    grok = null;
                    summary.warnings.push(
                        `audit skipped — Grok client unavailable: ${String(e?.message || e).slice(0, 200)}`
                    );
                }
            }
            summary.audit = await selfAuditQuestions(supabase, grok, deadline);
            if (summary.audit.demoted > 0) {
                summary.warnings.push(
                    `AUDIT: demoted ${summary.audit.demoted} questions whose stored answer twice ` +
                    'disagreed with confident cold answers — review engine_metadata.audit.'
                );
            }
        } catch (e) {
            summary.warnings.push(`self-audit failed: ${String(e?.message || e).slice(0, 200)}`);
        }

        const rosterShortfall = summary.roster.reduce((s, r) => s + (r.shortfall || 0), 0);
        summary.elapsedMs = Date.now() - started;
        summary.ok = rosterShortfall === 0;
        if (rosterShortfall > 0) {
            summary.warnings.push(`ROSTER: ${rosterShortfall} slots could not be filled from the pool.`);
        }

        return res.status(200).json(summary);
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        console.warn('[GenerateTrivia] fatal:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({ ok: false, error: err?.message || 'Internal server error' });
        }
    }
}
