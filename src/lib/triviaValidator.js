/**
 * TRIVIA QA VALIDATION — canonical 5-layer validator
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH for question quality rules. Every server-side
 * generation path (pages/api/admin/trivia-bootstrap*.js, the archived cron)
 * imports this module.
 *
 * This file had silently drifted from scripts/trivia-qa-validator.js — it was
 * missing MATH-03, MATH-05, LOGIC-03..LOGIC-06, QUAL-05, SYNC-04, STRUCT-07
 * and the filler patterns, so API-side generation was validated strictly more
 * weakly than script-side generation. All of those are ported below.
 *
 * Integration pass: the last two divergences are now closed too —
 *   - QUAL-03 used a case-insensitive inline regex that matched "th" in "the",
 *     so it never rejected a question. It now uses hasHoleCards().
 *   - LOGIC-07 (BB ante) was applied to every category and to historical
 *     questions. It is now scoped to STRATEGY_CATEGORIES and skipped for
 *     pre-2018-dated text, matching the script.
 *
 * CROSS-FILE REQUEST: scripts/trivia-qa-validator.js should re-export
 * validateQuestion/validateBatch from here instead of keeping a hand-synced
 * copy (that file is outside this fixer's ownership).
 *
 * Import: import { validateBatch, validateQuestion } from '../../src/lib/triviaValidator';
 */

const VALID_POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'EP', 'LP'];
const SPELLED_OUT_POSITIONS = [
    'Under-the-Gun', 'under-the-gun', 'middle position',
    'hijack', 'hi-jack', 'cutoff', 'cut-off', 'cut off',
    'button', 'Small-Blind', 'Big-Blind',
    'early position', 'late position',
    'on the button', 'in the blinds',
    'in the sb', 'in the bb', 'in the co', 'on the btn',
    'dealer', 'dealer button',
];
const STRATEGY_CATEGORIES = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios', 'gto_theory'];

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * HOLE-CARD DETECTION (ported from scripts/trivia-qa-validator.js)
 * ═══════════════════════════════════════════════════════════════════════════
 * The old inline QUAL-03 test was:
 *     /[AKQJT2-9][♠♣♥♦hdcs]/i.test(q.question) || /pocket\s*[2-9AKQJT]/i
 * The `/i` flag made the rank class match lowercase letters, so the "th" in
 * "the" (t + h) satisfied it — i.e. essentially every English sentence passed
 * and the check was dead. A strategy question with no hole cards at all
 * ("You are on the BTN with 25BB. Villain shoves...") validated clean.
 *
 * The replacement is case-SENSITIVE on the rank (poker notation is uppercase)
 * and word-boundary anchored, and additionally accepts the shorthand forms
 * real poker writing uses.
 */
const HOLE_CARD_PATTERNS = [
    // Two explicit cards with letter suits: "As Kd", "Th9h". Requiring BOTH
    // cards is what kills the "As the flop..." false positive that a single
    // rank+suit pattern would still allow.
    /\b[AKQJT2-9][shdc]\s?[AKQJT2-9][shdc]\b/,
    // Suit glyphs never occur in prose, so one card is enough: "A♠".
    /[AKQJT2-9][♠♣♥♦]/,
    // Pocket pairs in shorthand: "AA", "77".
    /\b(?:AA|KK|QQ|JJ|TT|99|88|77|66|55|44|33|22)\b/,
    // Suited/offsuit shorthand: "AKo", "T9s".
    /\b[AKQJT2-9]{2}[so]\b/,
    // Spelled out: "pocket aces", "pocket 7s".
    /pocket\s*(?:[2-9AKQJT]|aces|kings|queens|jacks|tens|pair)/i,
];

/**
 * True when the text names specific hole cards.
 * @param {string} text
 * @returns {boolean}
 */
export function hasHoleCards(text) {
    if (!text || typeof text !== 'string') return false;
    // Strip stack sizes first so "22 BB effective" is not read as pocket deuces.
    const stripped = text.replace(/\b\d+[\d,]*\s*(?:BB|bb|big\s+blinds?|chips?)\b/g, ' ');
    return HOLE_CARD_PATTERNS.some(p => p.test(stripped));
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
    if (!q.category || typeof q.category !== 'string')
        errors.push('STRUCT-07: Category missing');
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
    // SYNC-04 — "Option X is correct" phrasing (was missing from this copy).
    const optionIsCorrect = explanation.match(/option\s*([a-d])\s*(?:is\s*(?:the\s*)?correct|is\s*right)/i);
    if (optionIsCorrect) {
        const idx = optionLetters.indexOf(optionIsCorrect[1].toLowerCase());
        if (idx !== -1 && idx !== q.correct_index)
            errors.push(`SYNC-04: Explanation states "Option ${optionIsCorrect[1].toUpperCase()} is correct" but correct_index=${q.correct_index}`);
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
    // MATH-03: pot odds sanity (ported — was missing from this copy).
    const potOddsMatch = fullText.match(/getting\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:pot\s*)?odds/i);
    if (potOddsMatch && stackShoveMatch) {
        const denom = parseFloat(potOddsMatch[2]);
        if (denom > 0) {
            const claimedRatio = parseFloat(potOddsMatch[1]) / denom;
            const shoveAmt = parseInt(stackShoveMatch[2]);
            const pot = shoveAmt + 1;              // shove + our blind
            const callAmt = Math.max(1, shoveAmt - 1);
            const actualRatio = pot / callAmt;
            if (actualRatio > 0 && Math.abs(claimedRatio - actualRatio) / actualRatio > 0.3)
                errors.push(`MATH-03: Claimed ${potOddsMatch[1]}:${potOddsMatch[2]} odds (${claimedRatio.toFixed(1)}:1) but scenario gives ~${actualRatio.toFixed(1)}:1`);
        }
    }

    // MATH-04: MDF vs bet size.
    // Only cross-check when the text contains exactly ONE distinct bet-size
    // percentage. A question that walks through several streets ("bet 50% pot
    // on the flop, 75% pot on the turn... MDF is 57%") used to be validated
    // against whichever size appeared first, rejecting correct questions and
    // passing wrong ones.
    const mdfMatch = fullText.match(/MDF.*?(\d+)%/i);
    if (mdfMatch) {
        const claimedMdf = parseInt(mdfMatch[1]);
        const potPctMatches = fullText.match(/(\d+)\s*%\s*(?:of\s*(?:the\s*)?)?pot/gi) || [];
        const distinctSizes = new Set(
            potPctMatches
                .map(m => parseInt(m.match(/(\d+)/)?.[1] || '', 10))
                .filter(n => Number.isFinite(n))
        );
        const potSizedBet = /pot[- ]?size[d]?\s*bet/i.test(fullText);
        if (potSizedBet) distinctSizes.add(100);

        if (distinctSizes.size === 1) {
            const betPct = [...distinctSizes][0];
            const expectedMdf = Math.round((1 / (1 + betPct / 100)) * 100);
            if (Math.abs(claimedMdf - expectedMdf) > 5)
                errors.push(`MATH-04: MDF claimed ${claimedMdf}% but for ${betPct}% pot bet, MDF should be ~${expectedMdf}%`);
        }
    }

    // MATH-05: impossible equity percentages (ported).
    const equityMatches = fullText.match(/(\d+(?:\.\d+)?)\s*%\s*equity/gi) || [];
    for (const m of equityMatches) {
        const pct = parseFloat(m);
        if (Number.isFinite(pct) && (pct > 100 || pct < 0))
            errors.push(`MATH-05: Impossible equity percentage: ${pct}%`);
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

    const fullText = `${q.question} ${q.explanation || ''}`;
    const correctOption = (q.options?.[q.correct_index] || '').toLowerCase();

    // LOGIC-03: folding while the text says the odds are favorable (ported).
    if (correctOption.startsWith('fold') && /getting.*?odds.*?favorable/i.test(fullText))
        errors.push('LOGIC-03: Correct answer is Fold but question states odds are favorable');

    // LOGIC-04: MP does not exist 5-handed (ported).
    if (/5[- ]?handed/i.test(q.question) && /\bMP\b/.test(q.question))
        errors.push('LOGIC-04: MP position referenced in 5-handed game (positions are UTG/CO/BTN/SB/BB)');

    // LOGIC-05: open-shove recommended at a deep stack (ported).
    const stackMatch = fullText.match(/(\d+)\s*BB\s*(?:effective|stack)/i);
    if (stackMatch) {
        const stack = parseInt(stackMatch[1]);
        if (stack > 30 && correctOption.includes('shove') && /open/i.test(correctOption))
            errors.push(`LOGIC-05: Open-shoving recommended at ${stack}BB — too deep for open-shove (typically <20BB)`);
    }

    // LOGIC-06: satellite survival beats chip accumulation (ported).
    if (/satellite/i.test(q.question) && (correctOption.includes('shove') || correctOption.includes('all-in'))) {
        const shortStacksPresent = /short\s*stack|(\d)\s*BB.*?blind/i.test(q.question);
        const playerIsSafe = /safe|covered|3rd|2nd|chip\s*lead/i.test(q.question);
        if (shortStacksPresent && playerIsSafe)
            errors.push('LOGIC-06: Aggressive play recommended in satellite when player is safe and short stacks present — survival > chip accumulation');
    }

    // --- LOGIC-07 — BB ANTE RULE: Tournament antes must equal 1BB ---
    //
    // SCOPE (ported from scripts/trivia-qa-validator.js — this copy applied the
    // rule to EVERY category). The big-blind ante is a modern STRATEGY
    // convention; it only became standard around 2018. Applied to fact
    // categories the rule rejected historically ACCURATE questions — "at the
    // 2006 WSOP Main Event with blinds 2,000/4,000 and a 500 ante" is correct
    // for its era, and the generator prompts explicitly ask
    // famous_hands/tournament_facts for event+year specificity. It now runs
    // only for strategy categories, and is skipped entirely when the text is
    // anchored to a pre-2018 year.
    //
    // ANCHORING: the blinds pattern is anchored to the word "blinds". The old
    // bare /(\d[\d,]*)\/(\d[\d,]*)/ matched any fraction in the text — "1/2 of
    // the pot", "finished 2/3" — and paired it with an unrelated ante figure.
    if (STRATEGY_CATEGORIES.includes(q.category) && !/\b(19\d\d|200\d|201[0-7])\b/.test(fullText)) {
        const BLINDS_RE = /blinds?\s*(?:are|of|at|:)?\s*(\d[\d,]*)\s*\/\s*(\d[\d,]*)/i;
        const blindsAnteMatch = fullText.match(
            /blinds?\s*(?:are|of|at|:)?\s*(\d[\d,]*)\s*\/\s*(\d[\d,]*)[^.]{0,80}?(\d[\d,]*)\s*ante/i
        );
        if (blindsAnteMatch) {
            const bb = parseInt(blindsAnteMatch[2].replace(/,/g, ''));
            const ante = parseInt(blindsAnteMatch[3].replace(/,/g, ''));
            if (ante > 0 && bb > 0 && ante !== bb) {
                errors.push(`LOGIC-07: Non-BB ante (blinds ${blindsAnteMatch[1]}/${blindsAnteMatch[2]}, ante ${ante}). Must use BB ante (ante = ${bb})`);
            }
        } else {
            const blindsOnly = fullText.match(BLINDS_RE);
            const anteOnly = fullText.match(/(\d[\d,]*)\s*ante\b/i) || fullText.match(/\bante\s+(?:of\s+)?(\d[\d,]*)/i);
            if (blindsOnly && anteOnly) {
                const bb2 = parseInt(blindsOnly[2].replace(/,/g, ''));
                const ante2 = parseInt(anteOnly[1].replace(/,/g, ''));
                if (ante2 > 0 && bb2 > 0 && ante2 !== bb2) {
                    errors.push(`LOGIC-07: Non-BB ante (BB=${bb2}, ante=${ante2}). Must use BB ante`);
                }
            }
        }
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
        // Must name specific hole cards. See hasHoleCards() — the old inline
        // regex was case-insensitive and matched "th" in "the", so this rule
        // never rejected anything.
        if (!hasHoleCards(q.question))
            errors.push('QUAL-03: Strategy question missing specific hole cards');
    }
    if (q.explanation && q.explanation.length < 80)
        errors.push('QUAL-04: Explanation too brief');

    // QUAL-05: definition-only questions must be scenario-based (ported).
    if (q.question && /^what\s+(is|does|are)\s+/i.test(q.question)
        && !/scenario|situation|hand|board|stack/i.test(q.question))
        errors.push('QUAL-05: Definition-only question detected — must be scenario-based');

    if (q.options) {
        const fillerPatterns = [
            /doesn't matter/i,
            /it'?s just luck/i,
            // Word-boundary form of the script's /random/i so legitimate GTO
            // language ("randomize between call and fold", "played randomly")
            // is not rejected as filler.
            /\brandom\b/i,
            /who cares/i,
            /always fold/i,
            /none of the above/i,
        ];
        q.options.forEach((opt, i) => {
            for (const p of fillerPatterns)
                if (p.test(opt)) errors.push(`QUAL-06: Option ${i} looks like filler: "${String(opt).substring(0, 40)}"`);
        });
    }
    return errors;
}

/**
 * Normalized question text for cross-batch duplicate detection.
 * Lowercase, punctuation stripped, whitespace collapsed.
 * @param {string} text
 * @returns {string}
 */
export function normalizeQuestionText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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

/**
 * Validate a batch, additionally rejecting duplicates.
 *
 * @param {object[]} questions
 * @param {object} [opts]
 * @param {Set<string>} [opts.existingTexts] - normalized texts already in the
 *        pool. Pass this from generation endpoints so re-runs stop inflating
 *        a category with paraphrased near-duplicates that still count toward
 *        the depth target the 60-day guarantee depends on.
 * @returns {{valid: object[], rejected: Array<{valid:boolean,errors:string[],question:object}>}}
 */
export function validateBatch(questions, opts = {}) {
    const valid = [];
    const rejected = [];
    const existing = opts.existingTexts instanceof Set ? opts.existingTexts : null;
    const seenInBatch = new Set();

    for (const q of Array.isArray(questions) ? questions : []) {
        const result = validateQuestion(q);
        if (!result.valid) { rejected.push(result); continue; }

        const norm = normalizeQuestionText(q?.question);
        if (norm && seenInBatch.has(norm)) {
            rejected.push({ valid: false, errors: ['DUP-01: Duplicate question inside this batch'], question: q });
            continue;
        }
        if (norm && existing?.has(norm)) {
            rejected.push({ valid: false, errors: ['DUP-02: Question already exists in the pool'], question: q });
            continue;
        }
        if (norm) seenInBatch.add(norm);
        valid.push(q);
    }
    return { valid, rejected };
}
