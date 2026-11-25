/**
 * Deterministic Structural Quality Auditor & Thin-Category Curation Priority
 *
 * Pure, isomorphic (Node + browser) validator for Trivia question rows.
 * Never mutates database state or approves poker facts automatically;
 * only grades structural readiness so supervisors can safely review
 * clean thin-category candidates first in /admin/trivia-pool.
 */

import { TRIVIA_STUDY_CATEGORIES } from './trainingSpotMap.mjs';

export const THIN_CATEGORY_PRIORITY = Object.freeze([
    'rule_knowledge',
    'cash_game_situations',
    'mtt_situations',
    'icm_chip_ev',
]);

export const VALID_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
export const CANONICAL_CATEGORIES = TRIVIA_STUDY_CATEGORIES;

export const MIN_QUESTION_LENGTH = 25;
export const MIN_EXPLANATION_LENGTH = 30;
export const NINETY_DAY_SUPPLY_TARGET = 1800;
export const DAILY_SUPPLY_BURN_RATE = 20;

const CANONICAL_CATEGORY_SET = new Set(TRIVIA_STUDY_CATEGORIES);
const VALID_DIFFICULTY_SET = new Set(VALID_DIFFICULTIES);
const THIN_CATEGORY_SET = new Set(THIN_CATEGORY_PRIORITY);

const PLACEHOLDER_RE = /\b(?:TODO|TBD|FIXME|XXX|PLACEHOLDER)\b|lorem\s+ipsum|\[\s*\.\.\.\s*\]|\[\s*insert\b|\.{3}\s*$|\u2026\s*$/i;

const ISSUE_PENALTIES = Object.freeze({
    short_question: 25,
    placeholder_question: 25,
    invalid_options_count: 30,
    empty_option: 20,
    duplicate_options: 20,
    invalid_correct_index: 25,
    short_explanation: 20,
    placeholder_explanation: 15,
    invalid_category: 20,
    invalid_difficulty: 15,
    duplicate_eligible_prompt: 30,
    audit_failed: 40,
    open_valid_reports: 35,
});

export const QUALITY_ISSUE_LABELS = Object.freeze({
    short_question: 'Short Question',
    placeholder_question: 'Placeholder Text',
    invalid_options_count: 'Invalid Options Count',
    empty_option: 'Empty Option',
    duplicate_options: 'Duplicate Options',
    invalid_correct_index: 'Invalid Correct Index',
    short_explanation: 'Short Explanation',
    placeholder_explanation: 'Placeholder Explanation',
    invalid_category: 'Invalid Category',
    invalid_difficulty: 'Invalid Difficulty',
    duplicate_eligible_prompt: 'Duplicate Prompt',
    audit_failed: 'Audit Failed',
    open_valid_reports: 'Open Valid Reports',
});

export function formatQualityIssueLabel(issue) {
    if (typeof issue === 'string' && Object.prototype.hasOwnProperty.call(QUALITY_ISSUE_LABELS, issue)) {
        return QUALITY_ISSUE_LABELS[issue];
    }
    return String(issue || 'Unknown Issue')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function isThinCategory(category) {
    return typeof category === 'string' && THIN_CATEGORY_SET.has(category);
}

export function normalizeTriviaPrompt(text) {
    if (typeof text !== 'string') return '';
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministic 128-bit pure-JS hash (four independent 32-bit FNV-1a lanes)
 * over the normalized prompt string. Zero Node-only imports so both API routes
 * and client bundles can share this module cleanly.
 */
export function hashTriviaPrompt(text) {
    const normalized = normalizeTriviaPrompt(text);
    if (!normalized) return '';
    const seeds = [0x811c9dc5, 0x9e3779b1, 0x85ebca77, 0xc2b2ae3d];
    const primes = [0x01000193, 0x01000193, 0x27d4eb2f, 0x165667b1];
    const lanes = seeds.slice();
    for (let i = 0; i < normalized.length; i += 1) {
        const code = normalized.charCodeAt(i);
        for (let lane = 0; lane < 4; lane += 1) {
            lanes[lane] ^= (code + lane * 31 + i) & 0xff;
            lanes[lane] = Math.imul(lanes[lane], primes[lane]) >>> 0;
            lanes[lane] ^= (code >>> 8) & 0xff;
            lanes[lane] = Math.imul(lanes[lane], primes[lane]) >>> 0;
        }
    }
    return lanes.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

export function buildEligiblePromptHashSet(eligibleRowsOrPrompts) {
    const hashes = new Set();
    if (!eligibleRowsOrPrompts) return hashes;
    for (const entry of eligibleRowsOrPrompts) {
        const raw = typeof entry === 'string' ? entry : entry?.question;
        const hash = hashTriviaPrompt(raw);
        if (hash) hashes.add(hash);
    }
    return hashes;
}

function toPromptHashSet(eligiblePromptHashes) {
    if (!eligiblePromptHashes) return null;
    if (eligiblePromptHashes instanceof Set) return eligiblePromptHashes;
    if (Array.isArray(eligiblePromptHashes)) return new Set(eligiblePromptHashes);
    return null;
}

/**
 * Deterministic structural evaluator for a single trivia_questions row.
 * Accepts both snake_case DB rows and camelCase API queue items.
 *
 * @param {object} row
 * @param {object} [opts]
 * @param {Set<string>|string[]} [opts.eligiblePromptHashes]
 * @returns {{ pass: boolean, score: number, issues: string[] }}
 */
export function auditTriviaQuestionStructure(row, { eligiblePromptHashes } = {}) {
    const issues = [];
    const safeRow = row && typeof row === 'object' ? row : {};

    // 1. Question text length & placeholder / truncation check
    const rawQuestion = typeof safeRow.question === 'string' ? safeRow.question : '';
    const trimmedQuestion = rawQuestion.trim();
    if (trimmedQuestion.length < MIN_QUESTION_LENGTH) {
        issues.push('short_question');
    }
    if (trimmedQuestion.length > 0 && PLACEHOLDER_RE.test(trimmedQuestion)) {
        issues.push('placeholder_question');
    }

    // 2. Options: array of exactly 4 distinct non-empty strings
    const rawOptions = safeRow.options;
    if (!Array.isArray(rawOptions) || rawOptions.length !== 4) {
        issues.push('invalid_options_count');
    } else {
        const seenOptions = new Set();
        let hasEmpty = false;
        let hasDuplicate = false;
        for (const opt of rawOptions) {
            if (typeof opt !== 'string' || opt.trim().length === 0) {
                hasEmpty = true;
                continue;
            }
            const normalizedOpt = opt.trim().toLowerCase().replace(/\s+/g, ' ');
            if (seenOptions.has(normalizedOpt)) {
                hasDuplicate = true;
            } else {
                seenOptions.add(normalizedOpt);
            }
        }
        if (hasEmpty) issues.push('empty_option');
        if (hasDuplicate) issues.push('duplicate_options');
    }

    // 3. correct_index integer in 0..3
    const rawCorrectIndex = safeRow.correct_index !== undefined
        ? safeRow.correct_index
        : safeRow.correctIndex;
    if (
        typeof rawCorrectIndex !== 'number'
        || !Number.isInteger(rawCorrectIndex)
        || rawCorrectIndex < 0
        || rawCorrectIndex > 3
    ) {
        issues.push('invalid_correct_index');
    }

    // 4. Explanation length >= 30 chars (and no placeholders)
    const rawExplanation = typeof safeRow.explanation === 'string' ? safeRow.explanation : '';
    const trimmedExplanation = rawExplanation.trim();
    if (trimmedExplanation.length < MIN_EXPLANATION_LENGTH) {
        issues.push('short_explanation');
    }
    if (trimmedExplanation.length > 0 && PLACEHOLDER_RE.test(trimmedExplanation)) {
        issues.push('placeholder_explanation');
    }

    // 5. Canonical category and difficulty in easy|medium|hard
    const category = typeof safeRow.category === 'string' ? safeRow.category.trim() : '';
    if (!CANONICAL_CATEGORY_SET.has(category)) {
        issues.push('invalid_category');
    }
    const difficulty = typeof safeRow.difficulty === 'string' ? safeRow.difficulty.trim() : '';
    if (!VALID_DIFFICULTY_SET.has(difficulty)) {
        issues.push('invalid_difficulty');
    }

    // 6. Duplicate normalized prompt vs existing eligible pool
    const hashSet = toPromptHashSet(eligiblePromptHashes);
    if (hashSet && hashSet.size > 0 && trimmedQuestion.length > 0) {
        const normalizedPrompt = normalizeTriviaPrompt(trimmedQuestion);
        const promptHash = hashTriviaPrompt(trimmedQuestion);
        if (hashSet.has(promptHash) || hashSet.has(normalizedPrompt)) {
            issues.push('duplicate_eligible_prompt');
        }
    }

    // 7. Not audit_failed and zero open valid reports
    const rejectReasons = Array.isArray(safeRow.reject_reasons)
        ? safeRow.reject_reasons
        : Array.isArray(safeRow.rejectReasons)
            ? safeRow.rejectReasons
            : [];

    const auditStatus = safeRow.audit_status ?? safeRow.auditStatus ?? null;
    const auditVerified = safeRow.audit_verified !== undefined
        ? safeRow.audit_verified
        : safeRow.auditVerified;
    const isAuditFailed = auditVerified === false
        || auditStatus === 'audit_failed'
        || rejectReasons.includes('audit_failed');
    if (isAuditFailed) {
        issues.push('audit_failed');
    }

    const rawOpenReports = safeRow.open_valid_reports
        ?? safeRow.openValidReports
        ?? safeRow.open_reports
        ?? safeRow.openReports
        ?? 0;
    const openReportsCount = Number(rawOpenReports);
    if (
        (Number.isFinite(openReportsCount) && openReportsCount > 0)
        || rejectReasons.includes('open_report')
    ) {
        issues.push('open_valid_reports');
    }

    let score = 100;
    for (const issue of issues) {
        score -= ISSUE_PENALTIES[issue] ?? 15;
    }
    score = Math.max(0, Math.min(100, score));

    return {
        pass: issues.length === 0,
        score,
        issues,
    };
}

function parseTimestampMs(raw) {
    if (!raw) return Number.POSITIVE_INFINITY;
    const ms = Date.parse(String(raw));
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function getNumericOrFallback(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Ranks curation candidates so structurally clean thin-category candidates
 * float to the top for rapid supervisor bulk review.
 *
 * Does not mutate input rows; returns a new array with `qualityAudit` and
 * `isThinCategory` attached to every candidate.
 *
 * @param {Array<object>} rows
 * @param {object} [opts]
 * @param {Set<string>|string[]} [opts.eligiblePromptHashes]
 * @param {string[]} [opts.thinCategories=THIN_CATEGORY_PRIORITY]
 * @param {boolean} [opts.thinFirst=true]
 */
export function rankCurationCandidates(rows = [], opts = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const thinList = Array.isArray(opts.thinCategories) && opts.thinCategories.length > 0
        ? opts.thinCategories
        : THIN_CATEGORY_PRIORITY;
    const thinIndexMap = new Map(thinList.map((cat, idx) => [cat, idx]));
    const thinFirst = opts.thinFirst !== false;
    const eligiblePromptHashes = opts.eligiblePromptHashes;

    const annotated = safeRows.map((row) => {
        const qualityAudit = auditTriviaQuestionStructure(row, { eligiblePromptHashes });
        const thin = thinIndexMap.has(row?.category);
        return {
            ...row,
            isThinCategory: thin,
            qualityAudit,
        };
    });

    annotated.sort((a, b) => {
        const tierOf = (item) => {
            if (thinFirst) {
                if (item.isThinCategory && item.qualityAudit.pass) return 0;
                if (!item.isThinCategory && item.qualityAudit.pass) return 1;
                if (item.isThinCategory && !item.qualityAudit.pass) return 2;
                return 3;
            }
            return item.qualityAudit.pass ? 0 : 1;
        };

        const tierDiff = tierOf(a) - tierOf(b);
        if (tierDiff !== 0) return tierDiff;

        if (thinFirst && a.isThinCategory && b.isThinCategory) {
            const catRankDiff = thinIndexMap.get(a.category) - thinIndexMap.get(b.category);
            if (catRankDiff !== 0) return catRankDiff;
        }

        const auditScoreDiff = (b.qualityAudit?.score ?? 0) - (a.qualityAudit?.score ?? 0);
        if (auditScoreDiff !== 0) return auditScoreDiff;

        const qScoreA = getNumericOrFallback(a.qualityScore ?? a.quality_score, -1);
        const qScoreB = getNumericOrFallback(b.qualityScore ?? b.quality_score, -1);
        if (qScoreB !== qScoreA) return qScoreB - qScoreA;

        const prioA = getNumericOrFallback(a.priority, 999);
        const prioB = getNumericOrFallback(b.priority, 999);
        if (prioA !== prioB) return prioA - prioB;

        const createdDiff = parseTimestampMs(a.createdAt ?? a.created_at) - parseTimestampMs(b.createdAt ?? b.created_at);
        if (createdDiff !== 0) return createdDiff;

        const idA = String(a.questionId ?? a.id ?? '');
        const idB = String(b.questionId ?? b.id ?? '');
        return idA.localeCompare(idB);
    });

    return annotated;
}
