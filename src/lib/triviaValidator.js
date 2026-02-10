/**
 * TRIVIA QA VALIDATION — ESM Module for API Routes
 * ═══════════════════════════════════════════════════
 * Same 5-layer validation as scripts/trivia-qa-validator.js
 * but as an ESM module for Next.js API routes.
 * 
 * Import: import { validateBatch, validateQuestion } from '../../src/lib/triviaValidator';
 */

const VALID_POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'EP', 'LP'];
const SPELLED_OUT_POSITIONS = [
    'under the gun', 'under-the-gun', 'middle position',
    'hijack', 'hi-jack', 'cutoff', 'cut-off', 'cut off',
    'button', 'small blind', 'big blind',
    'early position', 'late position',
    'on the button', 'in the blinds',
    'in the sb', 'in the bb', 'in the co', 'on the btn',
    'dealer', 'dealer button',
];
const STRATEGY_CATEGORIES = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios', 'gto_theory'];

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CHECK 1: STRUCTURE
function checkStructure(q) {
    const errors = [];
    if (!q.question || typeof q.question !== 'string' || q.question.trim().length < 20)
        errors.push('STRUCT-01: Question text missing or too short');
    if (!Array.isArray(q.options) || q.options.length !== 4)
        errors.push(`STRUCT-02: Must have exactly 4 options (got ${q.options?.length || 0})`);
    else {
        q.options.forEach((opt, i) => {
            if (!opt || typeof opt !== 'string' || opt.trim().length < 3)
                errors.push(`STRUCT-03: Option ${i} is empty or too short`);
        });
        const normalized = q.options.map(o => o.toLowerCase().trim());
        if (new Set(normalized).size !== 4)
            errors.push('STRUCT-04: Duplicate options detected');
    }
    if (typeof q.correct_index !== 'number' || q.correct_index < 0 || q.correct_index > 3)
        errors.push(`STRUCT-05: Invalid correct_index: ${q.correct_index}`);
    if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length < 30)
        errors.push('STRUCT-06: Explanation missing or too short');
    return errors;
}

// CHECK 2: SYNC CHECK — Answer ↔ Explanation alignment
function checkSync(q) {
    const errors = [];
    if (!q.options || !q.explanation || typeof q.correct_index !== 'number') return errors;
    const correctOption = q.options[q.correct_index];
    if (!correctOption) return ['SYNC-01: correct_index points to non-existent option'];
    const explanation = q.explanation.toLowerCase();
    const correctAction = correctOption.toLowerCase().split(/[\s,—-]+/)[0];
    const actionWords = ['fold', 'call', 'raise', 'shove', 'check', 'bet', 'limp', 'yes', 'no'];
    if (actionWords.includes(correctAction)) {
        const wrongOptions = q.options.filter((_, i) => i !== q.correct_index);
        for (const wrongOpt of wrongOptions) {
            const wrongAction = wrongOpt.toLowerCase().split(/[\s,—-]+/)[0];
            if (actionWords.includes(wrongAction) && wrongAction !== correctAction) {
                const correctCount = (explanation.match(new RegExp(`\\b${escapeRegex(correctAction)}\\b`, 'gi')) || []).length;
                const wrongCount = (explanation.match(new RegExp(`\\b${escapeRegex(wrongAction)}\\b`, 'gi')) || []).length;
                if (wrongCount > correctCount + 2)
                    errors.push(`SYNC-02: Explanation mentions wrong action "${wrongAction}" (${wrongCount}x) more than correct "${correctAction}" (${correctCount}x)`);
            }
        }
    }
    const optionLetters = ['a', 'b', 'c', 'd'];
    const explicitMatch = explanation.match(/correct\s*(?:answer|option|play|choice)?\s*is\s*(?:option\s*)?([a-d])/i);
    if (explicitMatch) {
        const idx = optionLetters.indexOf(explicitMatch[1].toLowerCase());
        if (idx !== -1 && idx !== q.correct_index)
            errors.push(`SYNC-03: Explanation says correct answer is ${explicitMatch[1].toUpperCase()} but correct_index=${q.correct_index}`);
    }
    return errors;
}

// CHECK 3: MATH — Outs, pot odds, MDF, equity
function checkMath(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;
    const outsPatterns = [
        { regex: /gutshot.*?(\d+)\s*outs/i, expected: 4, name: 'gutshot' },
        { regex: /(\d+)\s*outs.*?gutshot/i, expected: 4, name: 'gutshot' },
        { regex: /open.?ended\s*straight\s*draw.*?(\d+)\s*outs/i, expected: 8, name: 'OESD' },
        { regex: /OESD.*?(\d+)\s*outs/i, expected: 8, name: 'OESD' },
        { regex: /(\d+)\s*outs.*?OESD/i, expected: 8, name: 'OESD' },
        { regex: /flush\s*draw.*?(\d+)\s*outs/i, expected: 9, name: 'flush draw' },
        { regex: /(\d+)\s*outs.*?flush\s*draw/i, expected: 9, name: 'flush draw' },
    ];
    for (const pattern of outsPatterns) {
        const match = fullText.match(pattern.regex);
        if (match) {
            const claimed = parseInt(match[1]);
            if (claimed !== pattern.expected)
                errors.push(`MATH-01: ${pattern.name} claimed ${claimed} outs but should be ${pattern.expected}`);
        }
    }
    const stackShoveMatch = fullText.match(/(\d+)\s*BB\s*effective.*?shoves?\s*(?:for\s*)?(\d+)\s*BB/i);
    if (stackShoveMatch) {
        const effective = parseInt(stackShoveMatch[1]);
        const shoveSize = parseInt(stackShoveMatch[2]);
        if (shoveSize > effective)
            errors.push(`MATH-02: Shove size (${shoveSize}BB) exceeds effective stack (${effective}BB)`);
    }
    const mdfMatch = fullText.match(/MDF.*?(\d+)%/i);
    if (mdfMatch) {
        const claimedMdf = parseInt(mdfMatch[1]);
        const betSizeMatch = fullText.match(/(\d+)%\s*(?:of\s*)?pot/i) || fullText.match(/pot[- ]?size[d]?\s*bet/i);
        if (betSizeMatch) {
            const betPct = betSizeMatch[1] ? parseInt(betSizeMatch[1]) : 100;
            const expectedMdf = Math.round((1 / (1 + betPct / 100)) * 100);
            if (Math.abs(claimedMdf - expectedMdf) > 5)
                errors.push(`MATH-04: MDF claimed ${claimedMdf}% but for ${betPct}% pot bet, MDF should be ~${expectedMdf}%`);
        }
    }
    return errors;
}

// CHECK 4: LOGIC — Impossible options
function checkLogic(q) {
    const errors = [];
    const isAllInSituation = /\b(shoves?\s*(all[- ]?in)?|all[- ]?in|jams?)\b/i.test(q.question);
    if (isAllInSituation) {
        const hasEqualEffective = /(\d+)\s*BB\s*effective/i.test(q.question);
        const hasRaiseOption = q.options?.some(o => /^raise/i.test(o.trim()));
        if (hasRaiseOption && hasEqualEffective) {
            const stackMentions = q.question.match(/(\d+)\s*BB/gi) || [];
            const uniqueStacks = new Set(stackMentions.map(s => parseInt(s)));
            if (uniqueStacks.size <= 2)
                errors.push('LOGIC-01: "Raise" option when facing all-in with equal effective stacks');
        }
    }
    const isRiver = /river|final\s*board|complete\s*board|5th\s*street/i.test(q.question);
    if (isRiver) {
        const hasDrawImproveOption = q.options?.some(o =>
            /\b(draw\s*to|need.*outs|improve.*hand|chase|still\s*draw)\b/i.test(o)
        );
        if (hasDrawImproveOption)
            errors.push('LOGIC-02: Drawing/improving mentioned on the river — no more cards to come');
    }
    return errors;
}

// CHECK 5: QUALITY — Scenario depth
function checkQuality(q) {
    const errors = [];
    if (STRATEGY_CATEGORIES.includes(q.category)) {
        if (!/\d+\s*BB/i.test(q.question))
            errors.push('QUAL-01: Strategy question missing stack size (BB)');
        const qLower = q.question.toLowerCase();
        const hasAbbrev = VALID_POSITIONS.some(pos => new RegExp(`\\b${pos}\\b`, 'i').test(q.question));
        const hasSpelled = SPELLED_OUT_POSITIONS.some(pos => qLower.includes(pos));
        if (!hasAbbrev && !hasSpelled && !/position/i.test(q.question))
            errors.push('QUAL-02: Strategy question missing position context');
        const hasCards = /[AKQJT2-9][♠♣♥♦hdcs]/i.test(q.question) || /pocket\s*[2-9AKQJT]/i.test(q.question);
        if (!hasCards)
            errors.push('QUAL-03: Strategy question missing specific hole cards');
    }
    if (q.explanation && q.explanation.length < 80)
        errors.push('QUAL-04: Explanation too brief');
    if (q.options) {
        const fillerPatterns = [/doesn't matter/i, /it's just luck/i, /who cares/i, /always fold/i, /none of the above/i];
        q.options.forEach((opt, i) => {
            for (const p of fillerPatterns)
                if (p.test(opt)) errors.push(`QUAL-06: Option ${i} looks like filler: "${opt.substring(0, 40)}"`);
        });
    }
    return errors;
}

// MASTER VALIDATOR
export function validateQuestion(q) {
    const allErrors = [
        ...checkStructure(q),
        ...checkSync(q),
        ...checkMath(q),
        ...checkLogic(q),
        ...checkQuality(q),
    ];
    return { valid: allErrors.length === 0, errors: allErrors, question: q };
}

export function validateBatch(questions) {
    const valid = [];
    const rejected = [];
    for (const q of questions) {
        const result = validateQuestion(q);
        if (result.valid) valid.push(q);
        else rejected.push(result);
    }
    return { valid, rejected };
}
