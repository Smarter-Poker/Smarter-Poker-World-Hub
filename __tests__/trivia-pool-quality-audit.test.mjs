import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadSurface } from './social-poker-card-harness.mjs';
import {
    auditTriviaQuestionStructure,
    buildEligiblePromptHashSet,
    formatQualityIssueLabel,
    hashTriviaPrompt,
    isThinCategory,
    normalizeTriviaPrompt,
    QUALITY_ISSUE_LABELS,
    rankCurationCandidates,
    THIN_CATEGORY_PRIORITY,
} from '../src/lib/trivia/questionQualityAudit.mjs';
import {
    evaluateQuestionBankAudit,
    formatQuestionBankAuditReport,
} from '../scripts/trivia/audit-thin-categories.mjs';
import { normalizeOperatorContext } from '../src/lib/trivia/operationsSnapshot.mjs';
import { TRIVIA_STUDY_CATEGORIES } from '../src/lib/trivia/trainingSpotMap.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function validRow(overrides = {}) {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        category: 'rule_knowledge',
        difficulty: 'medium',
        question: 'In a live No-Limit Holdem cash game, what happens when a player tosses in a single oversized chip without announcing a raise?',
        options: [
            'It is ruled a call unless the player verbally declared a raise first',
            'It automatically counts as a minimum raise to double the prior bet',
            'The dealer returns the oversized chip and folds the player hand',
            'It acts as an all-in shove whenever the chip exceeds half the pot',
        ],
        correct_index: 0,
        explanation: 'Under standard TDA and casino house rules, silently tossing a single oversized chip into the pot is always ruled a call.',
        quality_score: 7,
        audit_verified: null,
        open_valid_reports: 0,
        created_at: '2026-11-20T00:00:00.000Z',
        ...overrides,
    };
}

function mockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

test('auditTriviaQuestionStructure passes clean rows and enforces every structural failure rule', () => {
    const clean = auditTriviaQuestionStructure(validRow());
    assert.deepEqual(clean, { pass: true, score: 100, issues: [] });

    // Supports camelCase API payloads as well as snake_case DB rows.
    const cleanCamel = auditTriviaQuestionStructure({
        category: 'cash_game_situations',
        difficulty: 'hard',
        question: 'When facing a 75% pot river overbet in a 100bb cash game, what is the minimum defense frequency?',
        options: ['42.9%', '57.1%', '66.7%', '33.3%'],
        correctIndex: 1,
        explanation: 'MDF equals Pot divided by (Pot plus Bet), so 1 / 1.75 equals approximately 57.1 percent of your range.',
        auditVerified: null,
        openValidReports: 0,
    });
    assert.deepEqual(cleanCamel, { pass: true, score: 100, issues: [] });

    // Short question (< 25 trimmed chars)
    const shortQ = auditTriviaQuestionStructure(validRow({ question: '   Too short?   ' }));
    assert.equal(shortQ.pass, false);
    assert.ok(shortQ.issues.includes('short_question'));

    // Placeholder / TODO / truncated question
    for (const badPrompt of [
        'TODO: write a proper question about straddle rules in live cash games.',
        'What is the official TDA ruling when a player acts out of turn...',
        'Placeholder poker question covering multiway pot odds calculations here',
        'Lorem ipsum dolor sit amet consectetur adipiscing elit poker spot',
        'Which seat posts the big blind when [ ... ] occurs on a dead button?',
    ]) {
        const res = auditTriviaQuestionStructure(validRow({ question: badPrompt }));
        assert.equal(res.pass, false, `expected placeholder rejection for: ${badPrompt}`);
        assert.ok(res.issues.includes('placeholder_question'), `missing placeholder_question for: ${badPrompt}`);
    }

    // Invalid options count
    const threeOpts = auditTriviaQuestionStructure(validRow({ options: ['A', 'B', 'C'] }));
    assert.equal(threeOpts.pass, false);
    assert.ok(threeOpts.issues.includes('invalid_options_count'));

    const nonArrayOpts = auditTriviaQuestionStructure(validRow({ options: 'A, B, C, D' }));
    assert.equal(nonArrayOpts.pass, false);
    assert.ok(nonArrayOpts.issues.includes('invalid_options_count'));

    // Empty option
    const emptyOpt = auditTriviaQuestionStructure(validRow({ options: ['Call', '   ', 'Raise', 'Fold'] }));
    assert.equal(emptyOpt.pass, false);
    assert.ok(emptyOpt.issues.includes('empty_option'));

    // Duplicate options (case-insensitive & whitespace normalized)
    const dupOpts = auditTriviaQuestionStructure(validRow({ options: ['Minimum Raise', 'minimum   raise', 'Call', 'Fold'] }));
    assert.equal(dupOpts.pass, false);
    assert.ok(dupOpts.issues.includes('duplicate_options'));

    // Invalid correct_index
    for (const badIdx of [-1, 4, 1.5, '0', null, undefined, Number.NaN]) {
        const res = auditTriviaQuestionStructure(validRow({ correct_index: badIdx }));
        assert.equal(res.pass, false);
        assert.ok(res.issues.includes('invalid_correct_index'));
    }

    // Short explanation (< 30 trimmed chars) & placeholder explanation
    const shortExpl = auditTriviaQuestionStructure(validRow({ explanation: 'Too brief.' }));
    assert.equal(shortExpl.pass, false);
    assert.ok(shortExpl.issues.includes('short_explanation'));

    const todoExpl = auditTriviaQuestionStructure(validRow({ explanation: 'TODO fill in the exact ICM bubble factor derivation here later.' }));
    assert.equal(todoExpl.pass, false);
    assert.ok(todoExpl.issues.includes('placeholder_explanation'));

    // Non-canonical category & invalid difficulty
    const badMeta = auditTriviaQuestionStructure(validRow({ category: 'bogus_category', difficulty: 'extreme' }));
    assert.equal(badMeta.pass, false);
    assert.ok(badMeta.issues.includes('invalid_category'));
    assert.ok(badMeta.issues.includes('invalid_difficulty'));

    // audit_failed & open valid reports
    const failedAudit = auditTriviaQuestionStructure(validRow({ audit_verified: false }));
    assert.equal(failedAudit.pass, false);
    assert.ok(failedAudit.issues.includes('audit_failed'));

    const statusFailedAudit = auditTriviaQuestionStructure(validRow({ audit_status: 'audit_failed' }));
    assert.equal(statusFailedAudit.pass, false);
    assert.ok(statusFailedAudit.issues.includes('audit_failed'));

    const openReports = auditTriviaQuestionStructure(validRow({ open_valid_reports: 2 }));
    assert.equal(openReports.pass, false);
    assert.ok(openReports.issues.includes('open_valid_reports'));

    // Score clamps cleanly at 0 when many rules fail at once.
    const catastrophic = auditTriviaQuestionStructure({
        category: 'nope',
        difficulty: 'nope',
        question: 'TODO',
        options: [],
        correct_index: 9,
        explanation: 'no',
        audit_verified: false,
        open_valid_reports: 3,
    });
    assert.equal(catastrophic.pass, false);
    assert.equal(catastrophic.score, 0);
    assert.ok(catastrophic.issues.length >= 7);

    // Every issue label is Title Case and free of em-dashes.
    for (const [code, label] of Object.entries(QUALITY_ISSUE_LABELS)) {
        assert.equal(formatQualityIssueLabel(code), label);
        assert.doesNotMatch(label, /[—–]/);
    }
});

test('duplicate normalized prompt rejection matches casing/whitespace variants against eligible pool', () => {
    const eligiblePrompt = 'In a live No-Limit Holdem cash game, what happens when a player tosses in a single oversized chip without announcing a raise?';
    const hashes = buildEligiblePromptHashSet([{ question: eligiblePrompt }]);
    assert.equal(hashes.size, 1);
    assert.equal(hashTriviaPrompt(eligiblePrompt), hashTriviaPrompt(`  ${eligiblePrompt.toUpperCase().replace(/\s+/g, '   ')}  `));
    assert.equal(
        normalizeTriviaPrompt('  What   Is   MDF? '),
        'what is mdf?',
    );

    const dupRow = validRow({
        question: `   ${eligiblePrompt.toUpperCase().replace(/\s+/g, '  ')}  `,
    });
    const result = auditTriviaQuestionStructure(dupRow, { eligiblePromptHashes: hashes });
    assert.equal(result.pass, false);
    assert.ok(result.issues.includes('duplicate_eligible_prompt'));
    assert.ok(result.score < 100);
});

test('THIN_CATEGORY_PRIORITY and rankCurationCandidates sort clean thin-category candidates to the top', () => {
    assert.deepEqual(
        [...THIN_CATEGORY_PRIORITY],
        ['rule_knowledge', 'cash_game_situations', 'mtt_situations', 'icm_chip_ev'],
    );
    assert.equal(isThinCategory('rule_knowledge'), true);
    assert.equal(isThinCategory('icm_chip_ev'), true);
    assert.equal(isThinCategory('poker_history'), false);

    const rows = [
        validRow({ id: 'non-thin-broken', category: 'poker_history', explanation: 'short' }),
        validRow({ id: 'non-thin-clean', category: 'poker_history', quality_score: 9 }),
        validRow({ id: 'thin-broken-rules', category: 'rule_knowledge', explanation: 'short' }),
        validRow({ id: 'thin-clean-icm', category: 'icm_chip_ev', quality_score: 7 }),
        validRow({ id: 'thin-clean-cash', category: 'cash_game_situations', quality_score: 6 }),
        validRow({ id: 'thin-clean-rules', category: 'rule_knowledge', quality_score: 6 }),
        validRow({ id: 'thin-clean-mtt', category: 'mtt_situations', quality_score: 8 }),
    ];
    const snapshotIds = rows.map((r) => r.id);

    const ranked = rankCurationCandidates(rows, { thinFirst: true });

    // Original array is untouched.
    assert.deepEqual(rows.map((r) => r.id), snapshotIds);

    // Clean thin categories appear strictly first in priority order, then clean non-thin, then broken thin, then broken non-thin.
    assert.deepEqual(ranked.map((r) => r.id), [
        'thin-clean-rules',
        'thin-clean-cash',
        'thin-clean-mtt',
        'thin-clean-icm',
        'non-thin-clean',
        'thin-broken-rules',
        'non-thin-broken',
    ]);
    assert.equal(ranked[0].isThinCategory, true);
    assert.equal(ranked[0].qualityAudit.pass, true);
    assert.equal(ranked[4].isThinCategory, false);
    assert.equal(ranked[4].qualityAudit.pass, true);
    assert.equal(ranked[5].isThinCategory, true);
    assert.equal(ranked[5].qualityAudit.pass, false);
    assert.equal(ranked[6].isThinCategory, false);
    assert.equal(ranked[6].qualityAudit.pass, false);
});

test('read-only audit CLI evaluates JSON fixtures deterministically and contains zero write SQL or .env reads', () => {
    const cliSource = read('scripts/trivia/audit-thin-categories.mjs');
    const codeOnly = cliSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(codeOnly, /\.env|dotenv|SUPABASE_SERVICE_ROLE_KEY/i);
    assert.doesNotMatch(codeOnly, /\b(INSERT|UPDATE|DELETE|ALTER|TRUNCATE|DROP)\s+/i);

    const fixtureRows = [
        validRow({
            id: 'elig-1',
            category: 'rule_knowledge',
            audit_verified: true,
            quality_score: 9,
            is_eligible: true,
            in_review_queue: false,
        }),
        validRow({
            id: 'cand-ready-rq',
            category: 'rule_knowledge',
            question: 'When two players go all-in on the river and one tables their hand face up, who must show first under standard showdown rules?',
            is_eligible: false,
            in_review_queue: true,
            audit_verified: null,
            quality_score: 7,
        }),
        validRow({
            id: 'cand-dup',
            category: 'cash_game_situations',
            question: validRow().question.toUpperCase(),
            is_eligible: false,
            in_review_queue: false,
            audit_verified: null,
            quality_score: 3,
        }),
        validRow({
            id: 'cand-failed',
            category: 'mtt_situations',
            question: 'On the final table bubble with 12 big blinds in the cutoff, what is the optimal push-fold threshold?',
            is_eligible: false,
            in_review_queue: false,
            audit_verified: false,
            quality_score: 2,
        }),
    ];

    const report = evaluateQuestionBankAudit(fixtureRows, { sourceLabel: 'unit-test' });
    assert.equal(report.categories.length, 10);
    assert.equal(report.thin_categories.length, 4);
    assert.equal(report.totals.eligible_count, 1);
    assert.equal(report.totals.structurally_ready_candidates, 1);
    assert.equal(report.totals.structurally_ready_review_queue, 1);

    const rulesCat = report.thin_categories.find((c) => c.category === 'rule_knowledge');
    assert.equal(rulesCat.eligible_count, 1);
    assert.equal(rulesCat.structurally_ready_review_queue, 1);

    const cashCat = report.thin_categories.find((c) => c.category === 'cash_game_situations');
    assert.equal(cashCat.structurally_ready_candidates, 0);
    assert.equal(cashCat.issue_counts.duplicate_eligible_prompt, 1);

    const formatted = formatQuestionBankAuditReport(report);
    assert.match(formatted, /\* rule_knowledge/);
    assert.match(formatted, /\* cash_game_situations/);
    assert.match(formatted, /\* mtt_situations/);
    assert.match(formatted, /\* icm_chip_ev/);

    const dir = mkdtempSync(join(tmpdir(), 'trivia-audit-cli-'));
    try {
        const fixtureFile = join(dir, 'fixture.json');
        writeFileSync(fixtureFile, JSON.stringify({ rows: fixtureRows }), 'utf8');
        const out = execFileSync(
            process.execPath,
            [join(ROOT, 'scripts/trivia/audit-thin-categories.mjs'), `--fixture=${fixtureFile}`, '--json'],
            { encoding: 'utf8' },
        );
        const parsed = JSON.parse(out);
        assert.equal(parsed.totals.eligible_count, 1);
        assert.equal(parsed.totals.structurally_ready_candidates, 1);
        assert.deepEqual(parsed.thin_category_priority, [...THIN_CATEGORY_PRIORITY]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('/api/admin/trivia-pool-curate attaches qualityAudit & isThinCategory and honors ?priority=thin_categories', async () => {
    const authResult = { user: { id: '33333333-3333-4333-8333-333333333333' }, error: null };
    const opContext = { allowed: true, roles: ['supervisor'], capabilities: ['snapshot', 'question_quarantine', 'question_release'] };
    const profileRow = { is_admin: true, role: 'admin' };

    const reviewRows = [
        {
            question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
            category: 'poker_history',
            difficulty: 'medium',
            quality_score: 7,
            priority: 1,
            inconclusive_attempts: 0,
            created_at: '2026-11-01T00:00:00.000Z',
        },
        {
            question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
            category: 'rule_knowledge',
            difficulty: 'easy',
            quality_score: 7,
            priority: 1,
            inconclusive_attempts: 0,
            created_at: '2026-11-02T00:00:00.000Z',
        },
        {
            question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
            category: 'rule_knowledge',
            difficulty: 'medium',
            quality_score: 7,
            priority: 1,
            inconclusive_attempts: 0,
            created_at: '2026-11-03T00:00:00.000Z',
        },
    ];

    const questionRows = [
        {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
            question: 'Who won the 2003 World Series of Poker Main Event to ignite the global poker boom?',
            options: ['Chris Moneymaker', 'Sam Farha', 'Greg Raymer', 'Joe Hachem'],
            correct_index: 0,
            explanation: 'Chris Moneymaker won the 2003 WSOP Main Event after qualifying via an online satellite tournament.',
            audit_verified: null,
            source: 'grok-3-mini',
        },
        {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
            question: 'In a live tournament, what happens when a player silently tosses in one oversized chip facing a bet?',
            options: ['Ruled a call', 'Ruled a call', 'Minimum raise', 'Automatic fold'],
            correct_index: 0,
            explanation: 'Short.',
            audit_verified: null,
            source: 'grok-3-mini',
        },
        {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
            question: 'Under TDA tournament rules, what is the required minimum re-raise increment after an opening bet and raise?',
            options: [
                'At least the size of the largest previous full bet or raise on that street',
                'Exactly double the current total pot size regardless of prior sizing',
                'One single big blind chip regardless of the size of the previous raise',
                'Half of the previous raise rounded down to the nearest denomination chip',
            ],
            correct_index: 0,
            explanation: 'Standard TDA rules require any full re-raise to be at least as large as the largest prior full bet or raise on that street.',
            audit_verified: null,
            source: 'grok-3-mini',
        },
    ];

    const mockClient = {
        from(table) {
            if (table === 'profiles') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: profileRow, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'trivia_review_queue_v1') {
                let filtered = [...reviewRows];
                const chain = {
                    eq: (col, val) => { filtered = filtered.filter((r) => r[col] === val); return chain; },
                    in: (col, vals) => { filtered = filtered.filter((r) => vals.includes(r[col])); return chain; },
                    order: () => chain,
                    limit: async (n) => ({ data: filtered.slice(0, n), error: null }),
                };
                return { select: () => chain };
            }
            if (table === 'trivia_questions') {
                return {
                    select: () => ({
                        in: async (_col, ids) => ({
                            data: questionRows.filter((q) => ids.includes(q.id)),
                            error: null,
                        }),
                    }),
                };
            }
            if (table === 'trivia_question_eligibility_v1') {
                return {
                    select: () => ({
                        in: async () => ({
                            data: [
                                { question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', open_valid_reports: 0, reject_reasons: ['audit_unset'] },
                                { question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', open_valid_reports: 1, reject_reasons: ['audit_unset', 'open_report'] },
                                { question_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', open_valid_reports: 0, reject_reasons: ['audit_unset'] },
                            ],
                            error: null,
                        }),
                    }),
                };
            }
            if (table === 'trivia_eligible_questions_serving_v1') {
                return {
                    select: () => ({
                        in: async () => ({ data: [], error: null }),
                    }),
                };
            }
            throw new Error(`Unexpected table ${table}`);
        },
        async rpc(name) {
            if (name === 'trivia_operator_context_v1') return { data: opContext, error: null };
            if (name === 'trivia_question_calibration_report_v1') {
                return {
                    data: {
                        success: true,
                        min_shown: 15,
                        ninety_day_target_per_category: 1800,
                        summary: { flagged_count: 0, categories_below_90_day: 4 },
                        outliers: [],
                        category_depth: [],
                    },
                    error: null,
                };
            }
            throw new Error(`Unexpected rpc ${name}`);
        },
    };

    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';

    const { module } = loadSurface('pages/api/admin/trivia-pool-curate.js', {
        mocks: {
            '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {}, write: {} } },
            '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
            '../../../src/lib/serverAuth': { getServerUserWithFallback: async () => authResult },
            '../../../src/lib/supabaseServerClient': { createClient: () => mockClient },
            '../../../src/lib/trivia/operationsSnapshot.mjs': { normalizeOperatorContext },
            '../../../src/lib/trivia/trainingSpotMap.mjs': { TRIVIA_STUDY_CATEGORIES },
            '../../../src/lib/trivia/questionQualityAudit.mjs': {
                auditTriviaQuestionStructure,
                buildEligiblePromptHashSet,
                isThinCategory,
                rankCurationCandidates,
                THIN_CATEGORY_PRIORITY,
            },
        },
    });
    const handler = module.default;

    const badPriorityRes = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { priority: 'bogus_mode' } }, badPriorityRes);
    assert.equal(badPriorityRes.statusCode, 400);
    assert.equal(badPriorityRes.body?.error, 'invalid_priority');

    const prioritizedRes = mockRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer tok' }, query: { priority: 'thin_categories', limit: '10' } }, prioritizedRes);
    assert.equal(prioritizedRes.statusCode, 200);
    assert.equal(prioritizedRes.body?.queue?.priority, 'thin_categories');

    const items = prioritizedRes.body?.queue?.items || [];
    assert.equal(items.length, 3);

    // Clean thin-category rule_knowledge item (#3) MUST rank first, then clean poker_history (#1), then broken rule_knowledge (#2).
    assert.equal(items[0].questionId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');
    assert.equal(items[0].isThinCategory, true);
    assert.deepEqual(items[0].qualityAudit, { pass: true, score: 100, issues: [] });

    assert.equal(items[1].questionId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
    assert.equal(items[1].isThinCategory, false);
    assert.equal(items[1].qualityAudit.pass, true);

    assert.equal(items[2].questionId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
    assert.equal(items[2].isThinCategory, true);
    assert.equal(items[2].qualityAudit.pass, false);
    assert.ok(items[2].qualityAudit.issues.includes('duplicate_options'));
    assert.ok(items[2].qualityAudit.issues.includes('short_explanation'));
    assert.ok(items[2].qualityAudit.issues.includes('open_valid_reports'));
});

test('/admin/trivia-pool UI exposes Thin Categories First toggle, structural pre-check badges, and preserves visual contracts', () => {
    const pool = read('pages/admin/trivia-pool.js');
    assert.match(pool, /aria-label="Trivia Questions By Category"/);
    assert.match(pool, /Thin Categories First/);
    assert.match(pool, /aria-pressed=\{thinCategoriesFirst\}/);
    assert.match(pool, /priority:\s*thinFirst\s*\?\s*'thin_categories'\s*:\s*'default'/);
    assert.match(pool, /Ready For Review/);
    assert.match(pool, /Thin Priority/);
    assert.match(pool, /Select Ready Only/);
    assert.match(pool, /formatQualityIssueLabel/);
    assert.doesNotMatch(pool, /[—–]/, 'trivia-pool.js must not contain em-dashes or en-dashes');
    assert.doesNotMatch(pool, /[↻✓✗◆]/u, 'trivia-pool.js must not use retired symbol icons');
    assert.doesNotMatch(pool, /fontSize:\s*(?:9|10|11)(?:\D|$)/, 'trivia-pool.js must keep fontSize >= 12');
    assert.doesNotMatch(pool, /from ['"](?:lucide-react|react-icons|@heroicons|@fortawesome)/);
});
