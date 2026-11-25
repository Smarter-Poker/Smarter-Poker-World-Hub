#!/usr/bin/env node
/**
 * Read-Only Trivia Question Bank Structural Quality & Thin-Category Audit CLI
 *
 * Inspects the production Trivia question bank (via `supabase db query --linked`,
 * strictly read-only, never reads .env, never mutates rows) OR a supplied JSON
 * fixture (`--fixture=path/to/fixture.json`), and prints a breakdown of:
 *   - Eligible pool count & days-of-supply (eligible / 20) vs 90-day target (1,800)
 *   - Audit status mix (verified / audit_failed / unaudited) & review_queue depth
 *   - Structurally-ready curation candidates (passing auditTriviaQuestionStructure)
 *   - Top structural failure reasons per category
 *   - Highlighted breakdown of the 4 priority thin categories:
 *     rule_knowledge, cash_game_situations, mtt_situations, icm_chip_ev
 *
 * Usage:
 *   node scripts/trivia/audit-thin-categories.mjs
 *   node scripts/trivia/audit-thin-categories.mjs --json
 *   node scripts/trivia/audit-thin-categories.mjs --thin-only
 *   node scripts/trivia/audit-thin-categories.mjs --fixture=./fixture.json --json
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    auditTriviaQuestionStructure,
    buildEligiblePromptHashSet,
    CANONICAL_CATEGORIES,
    DAILY_SUPPLY_BURN_RATE,
    isThinCategory,
    NINETY_DAY_SUPPLY_TARGET,
    THIN_CATEGORY_PRIORITY,
} from '../../src/lib/trivia/questionQualityAudit.mjs';

function normalizeAuditStatus(row) {
    if (row?.audit_status) return String(row.audit_status);
    if (row?.audit_verified === true) return 'verified';
    if (row?.audit_verified === false) return 'audit_failed';
    return 'unaudited';
}

function qualityScoreBucket(score) {
    if (score === null || score === undefined || score === '') return 'null';
    const n = Number(score);
    if (!Number.isFinite(n)) return 'null';
    if (n >= 8) return '8_to_10';
    if (n >= 6) return '6_to_7';
    return '0_to_5';
}

/**
 * Pure deterministic evaluator over question bank rows.
 *
 * @param {Array<object>} rows
 * @param {object} [opts]
 * @param {Array<string>} [opts.extraEligiblePrompts]
 * @param {string} [opts.sourceLabel='fixture']
 */
export function evaluateQuestionBankAudit(rows = [], opts = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const eligiblePromptSources = [];
    for (const prompt of Array.isArray(opts.extraEligiblePrompts) ? opts.extraEligiblePrompts : []) {
        eligiblePromptSources.push(prompt);
    }
    for (const row of safeRows) {
        if (row?.is_eligible === true) {
            eligiblePromptSources.push(row);
        }
    }
    const eligiblePromptHashes = buildEligiblePromptHashSet(eligiblePromptSources);

    const byCategory = new Map();
    const ensureCategory = (cat) => {
        const key = typeof cat === 'string' && cat.trim() ? cat.trim() : 'unknown';
        if (!byCategory.has(key)) {
            byCategory.set(key, {
                category: key,
                is_thin_category: isThinCategory(key),
                total_questions: 0,
                eligible_count: 0,
                days_of_supply: 0,
                ninety_day_target: NINETY_DAY_SUPPLY_TARGET,
                shortfall_90_day: NINETY_DAY_SUPPLY_TARGET,
                below_90_day_supply: true,
                audit_status: { verified: 0, audit_failed: 0, unaudited: 0 },
                quality_buckets: { '8_to_10': 0, '6_to_7': 0, '0_to_5': 0, null: 0 },
                review_queue_count: 0,
                non_eligible_total: 0,
                structurally_ready_candidates: 0,
                structurally_ready_review_queue: 0,
                structurally_ready_unaudited: 0,
                structurally_ready_canonical_unquarantined: 0,
                issue_counts: {},
            });
        }
        return byCategory.get(key);
    };

    for (const cat of CANONICAL_CATEGORIES) ensureCategory(cat);

    for (const row of safeRows) {
        const bucket = ensureCategory(row?.category);
        bucket.total_questions += 1;

        const status = normalizeAuditStatus(row);
        if (status in bucket.audit_status) {
            bucket.audit_status[status] += 1;
        } else {
            bucket.audit_status.unaudited += 1;
        }

        const qBucket = qualityScoreBucket(row?.quality_score);
        bucket.quality_buckets[qBucket] += 1;

        const isEligible = row?.is_eligible === true;
        const inReviewQueue = row?.in_review_queue === true;
        if (inReviewQueue) bucket.review_queue_count += 1;

        if (isEligible) {
            bucket.eligible_count += 1;
            continue;
        }

        bucket.non_eligible_total += 1;
        const audit = auditTriviaQuestionStructure(row, { eligiblePromptHashes });
        if (audit.pass) {
            bucket.structurally_ready_candidates += 1;
            if (inReviewQueue) bucket.structurally_ready_review_queue += 1;
            if (status === 'unaudited') bucket.structurally_ready_unaudited += 1;
            const reasons = Array.isArray(row?.reject_reasons) ? row.reject_reasons : [];
            if (!reasons.includes('duplicate_alias') && !reasons.includes('quarantined')) {
                bucket.structurally_ready_canonical_unquarantined += 1;
            }
        } else {
            for (const issue of audit.issues) {
                bucket.issue_counts[issue] = (bucket.issue_counts[issue] || 0) + 1;
            }
        }
    }

    const categories = Array.from(byCategory.values()).map((c) => {
        const daysOfSupply = Math.floor(c.eligible_count / DAILY_SUPPLY_BURN_RATE);
        const shortfall = Math.max(0, NINETY_DAY_SUPPLY_TARGET - c.eligible_count);
        return {
            ...c,
            days_of_supply: daysOfSupply,
            shortfall_90_day: shortfall,
            below_90_day_supply: c.eligible_count < NINETY_DAY_SUPPLY_TARGET,
        };
    });

    categories.sort((a, b) => (
        a.eligible_count - b.eligible_count
        || a.category.localeCompare(b.category)
    ));

    const thinCategories = THIN_CATEGORY_PRIORITY
        .map((cat) => categories.find((c) => c.category === cat))
        .filter(Boolean);

    const totals = categories.reduce((acc, c) => ({
        total_questions: acc.total_questions + c.total_questions,
        eligible_count: acc.eligible_count + c.eligible_count,
        review_queue_count: acc.review_queue_count + c.review_queue_count,
        structurally_ready_candidates: acc.structurally_ready_candidates + c.structurally_ready_candidates,
        structurally_ready_review_queue: acc.structurally_ready_review_queue + c.structurally_ready_review_queue,
        structurally_ready_unaudited: acc.structurally_ready_unaudited + c.structurally_ready_unaudited,
        categories_below_90_day: acc.categories_below_90_day + (c.below_90_day_supply ? 1 : 0),
    }), {
        total_questions: 0,
        eligible_count: 0,
        review_queue_count: 0,
        structurally_ready_candidates: 0,
        structurally_ready_review_queue: 0,
        structurally_ready_unaudited: 0,
        categories_below_90_day: 0,
    });

    return {
        generated_at: new Date().toISOString(),
        source: opts.sourceLabel || 'fixture',
        ninety_day_target: NINETY_DAY_SUPPLY_TARGET,
        daily_burn_rate: DAILY_SUPPLY_BURN_RATE,
        thin_category_priority: [...THIN_CATEGORY_PRIORITY],
        totals,
        thin_categories: thinCategories,
        categories,
    };
}

export function formatQuestionBankAuditReport(report, { thinOnly = false } = {}) {
    const lines = [];
    lines.push('========================================================================================');
    lines.push('TRIVIA QUESTION BANK STRUCTURAL QUALITY & THIN-CATEGORY AUDIT (READ-ONLY)');
    lines.push(`Source: ${report.source} | Target: ${report.ninety_day_target}/cat (90d @ ${report.daily_burn_rate}/day)`);
    lines.push('========================================================================================');

    const rowsToPrint = thinOnly ? report.thin_categories : report.categories;
    const header = [
        'CATEGORY'.padEnd(24),
        'ELIG'.padStart(6),
        'DAYS'.padStart(5),
        'GAP'.padStart(5),
        'REVQ'.padStart(6),
        'READY'.padStart(6),
        'RQ_RDY'.padStart(7),
        'UNAUD'.padStart(6),
        'FAIL'.padStart(5),
        'TOP ISSUES',
    ].join(' ');
    lines.push(header);
    lines.push('-'.repeat(header.length + 14));

    for (const c of rowsToPrint) {
        const prefix = c.is_thin_category ? '* ' : '  ';
        const topIssues = Object.entries(c.issue_counts || {})
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ') || 'none';
        lines.push([
            `${prefix}${c.category}`.padEnd(24),
            String(c.eligible_count).padStart(6),
            `${c.days_of_supply}d`.padStart(5),
            String(c.shortfall_90_day).padStart(5),
            String(c.review_queue_count).padStart(6),
            String(c.structurally_ready_candidates).padStart(6),
            String(c.structurally_ready_review_queue).padStart(7),
            String(c.audit_status.unaudited).padStart(6),
            String(c.audit_status.audit_failed).padStart(5),
            topIssues,
        ].join(' '));
    }

    lines.push('-'.repeat(header.length + 14));
    lines.push(
        `TOTALS: ${report.totals.total_questions} questions | `
        + `${report.totals.eligible_count} eligible | `
        + `${report.totals.review_queue_count} review_queue | `
        + `${report.totals.structurally_ready_candidates} structurally ready candidates `
        + `(${report.totals.structurally_ready_review_queue} in review_queue, ${report.totals.structurally_ready_unaudited} unaudited)`
    );
    lines.push('* = Priority Thin Category (rule_knowledge, cash_game_situations, mtt_situations, icm_chip_ev)');
    lines.push('========================================================================================');
    return lines.join('\n');
}

function resolveLinkedRepoCwd() {
    const cwd = process.cwd();
    if (existsSync(resolve(cwd, 'supabase/.temp/project-ref'))) return cwd;
    const canonical = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub';
    if (existsSync(resolve(canonical, 'supabase/.temp/project-ref'))) return canonical;
    return cwd;
}

function runSupabaseJsonQuery(sql) {
    const stdout = execFileSync('supabase', ['db', 'query', '--linked', sql], {
        cwd: resolveLinkedRepoCwd(),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const firstBrace = stdout.indexOf('{');
    const lastBrace = stdout.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) {
        throw new Error('Unable to parse JSON response from supabase db query');
    }
    const parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
    return Array.isArray(parsed?.rows) ? parsed.rows : [];
}

function fetchProductionBankRows() {
    const eligibleRows = runSupabaseJsonQuery(`
SELECT
    q.id,
    q.category,
    q.difficulty,
    q.question,
    q.quality_score,
    q.audit_verified,
    true AS is_eligible,
    false AS in_review_queue,
    0::integer AS open_valid_reports,
    '{}'::text[] AS reject_reasons
FROM public.trivia_eligible_question_pool_v1 ep
JOIN public.trivia_questions q ON q.id = ep.question_id;
`);

    const candidateRows = runSupabaseJsonQuery(`
WITH rq AS (
    SELECT question_id FROM public.trivia_review_queue_v1
)
SELECT
    q.id,
    q.category,
    q.difficulty,
    q.question,
    q.options,
    q.correct_index,
    q.explanation,
    q.quality_score,
    q.audit_verified,
    false AS is_eligible,
    (rq.question_id IS NOT NULL) AS in_review_queue,
    COALESCE(e.open_valid_reports, 0)::integer AS open_valid_reports,
    COALESCE(e.reject_reasons, '{}'::text[]) AS reject_reasons
FROM public.trivia_questions q
LEFT JOIN public.trivia_question_eligibility_v1 e ON e.question_id = q.id
LEFT JOIN rq ON rq.question_id = q.id
WHERE COALESCE(e.reject_reasons, ARRAY['unindexed']::text[]) <> '{}'::text[];
`);

    return [...eligibleRows, ...candidateRows];
}

function parseCliArgs(argv) {
    const opts = { jsonOnly: false, thinOnly: false, fixturePath: null };
    for (const arg of argv) {
        if (arg === '--json') opts.jsonOnly = true;
        else if (arg === '--thin-only') opts.thinOnly = true;
        else if (arg.startsWith('--fixture=')) {
            opts.fixturePath = arg.slice('--fixture='.length).trim();
        }
    }
    return opts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        const opts = parseCliArgs(process.argv.slice(2));
        let rows;
        let sourceLabel;
        if (opts.fixturePath) {
            const raw = JSON.parse(readFileSync(resolve(opts.fixturePath), 'utf8'));
            rows = Array.isArray(raw) ? raw : (Array.isArray(raw?.rows) ? raw.rows : []);
            sourceLabel = `fixture:${opts.fixturePath}`;
        } else {
            rows = fetchProductionBankRows();
            sourceLabel = 'production:supabase-linked';
        }
        const report = evaluateQuestionBankAudit(rows, { sourceLabel });
        if (opts.jsonOnly) {
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        } else {
            process.stdout.write(`${formatQuestionBankAuditReport(report, { thinOnly: opts.thinOnly })}\n`);
        }
        process.exitCode = 0;
    } catch (error) {
        console.error(`[audit-thin-categories] ERROR: ${error?.message || error}`);
        process.exitCode = 2;
    }
}
