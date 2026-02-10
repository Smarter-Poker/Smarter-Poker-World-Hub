#!/usr/bin/env node
/**
 * TRIVIA QA VALIDATION LAYER — Military-Grade Question Validator
 * ================================================================
 * AG-1 V12 Compliance Check — Zero Bad Questions Tolerated
 * 
 * Validates questions against:
 * 1. SYNC CHECK: correct_index matches explanation
 * 2. MATH CHECK: pot odds, equity, stack sizes, outs
 * 3. LOGIC CHECK: impossible options (raise vs all-in, etc)
 * 4. STRUCTURE CHECK: 4 options, valid index, non-empty fields
 * 5. QUALITY CHECK: scenario depth, explanation length
 * 
 * Usage:
 *   const { validateQuestion, validateBatch } = require('./trivia-qa-validator');
 *   const { valid, rejected, report } = validateBatch(questions);
 */

// ═══════════════════════════════════════════════════════════════════════════
// POKER CONSTANTS — Ground Truth
// ═══════════════════════════════════════════════════════════════════════════
const VALID_POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'EP', 'LP'];
const SPELLED_OUT_POSITIONS = [
    'under the gun', 'under-the-gun',
    'middle position',
    'hijack', 'hi-jack',
    'cutoff', 'cut-off', 'cut off',
    'button',
    'small blind', 'big blind',
    'early position', 'late position',
    'on the button', 'in the blinds',
    'in the sb', 'in the bb',
    'in the co', 'on the btn',
    'dealer', 'dealer button',
];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['♠', '♣', '♥', '♦', 's', 'c', 'h', 'd', '♤', '♧', '♡', '♢'];

// Categories that are strategy-based (need scenario validation)
const STRATEGY_CATEGORIES = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios', 'gto_theory'];

// ═══════════════════════════════════════════════════════════════════════════
// CHECK 1: STRUCTURE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
function checkStructure(q) {
    const errors = [];

    if (!q.question || typeof q.question !== 'string' || q.question.trim().length < 20) {
        errors.push('STRUCT-01: Question text missing or too short (< 20 chars)');
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`STRUCT-02: Must have exactly 4 options (got ${q.options?.length || 0})`);
    } else {
        q.options.forEach((opt, i) => {
            if (!opt || typeof opt !== 'string' || opt.trim().length < 3) {
                errors.push(`STRUCT-03: Option ${i} is empty or too short`);
            }
        });

        // Check for duplicate options
        const normalized = q.options.map(o => o.toLowerCase().trim());
        const unique = new Set(normalized);
        if (unique.size !== 4) {
            errors.push('STRUCT-04: Duplicate options detected');
        }
    }

    if (typeof q.correct_index !== 'number' || q.correct_index < 0 || q.correct_index > 3) {
        errors.push(`STRUCT-05: Invalid correct_index: ${q.correct_index} (must be 0-3)`);
    }

    if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length < 30) {
        errors.push('STRUCT-06: Explanation missing or too short (< 30 chars)');
    }

    if (!q.category || typeof q.category !== 'string') {
        errors.push('STRUCT-07: Category missing');
    }

    return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK 2: SYNC CHECK — Correct Answer ↔ Explanation Alignment
// ═══════════════════════════════════════════════════════════════════════════
function checkSync(q) {
    const errors = [];
    if (!q.options || !q.explanation || typeof q.correct_index !== 'number') return errors;

    const correctOption = q.options[q.correct_index];
    if (!correctOption) return ['SYNC-01: correct_index points to non-existent option'];

    const explanation = q.explanation.toLowerCase();
    const correctText = correctOption.toLowerCase();

    // Extract the first meaningful word/phrase from the correct option
    const correctAction = correctText.split(/[\s,—-]+/)[0]; // e.g., "call", "fold", "raise", "shove"
    const actionWords = ['fold', 'call', 'raise', 'shove', 'check', 'bet', 'limp', 'yes', 'no'];

    // For strategy questions, check if explanation supports the correct action
    if (actionWords.includes(correctAction)) {
        // Check if any OTHER option's action word appears more prominently in explanation
        const wrongOptions = q.options.filter((_, i) => i !== q.correct_index);
        for (const wrongOpt of wrongOptions) {
            const wrongAction = wrongOpt.toLowerCase().split(/[\s,—-]+/)[0];
            if (actionWords.includes(wrongAction) && wrongAction !== correctAction) {
                // Count how many times each action appears in explanation
                const correctCount = (explanation.match(new RegExp(`\\b${escapeRegex(correctAction)}\\b`, 'gi')) || []).length;
                const wrongCount = (explanation.match(new RegExp(`\\b${escapeRegex(wrongAction)}\\b`, 'gi')) || []).length;

                // If wrong action appears MORE than correct action in explanation, flag it
                if (wrongCount > correctCount + 2) {
                    errors.push(`SYNC-02: Explanation mentions wrong action "${wrongAction}" (${wrongCount}x) more than correct "${correctAction}" (${correctCount}x)`);
                }
            }
        }
    }

    // Check if explanation explicitly says "correct answer is Option X" and it matches
    const optionLetters = ['a', 'b', 'c', 'd'];
    const explicitMatch = explanation.match(/correct\s*(?:answer|option|play|choice)?\s*is\s*(?:option\s*)?([a-d])/i);
    if (explicitMatch) {
        const claimedIndex = optionLetters.indexOf(explicitMatch[1].toLowerCase());
        if (claimedIndex !== -1 && claimedIndex !== q.correct_index) {
            errors.push(`SYNC-03: Explanation says "correct answer is ${explicitMatch[1].toUpperCase()}" but correct_index points to ${optionLetters[q.correct_index].toUpperCase()}`);
        }
    }

    // Check for "Option X is correct" pattern
    const optionIsCorrect = explanation.match(/option\s*([a-d])\s*(?:is\s*(?:the\s*)?correct|is\s*right)/i);
    if (optionIsCorrect) {
        const claimedIndex = optionLetters.indexOf(optionIsCorrect[1].toLowerCase());
        if (claimedIndex !== -1 && claimedIndex !== q.correct_index) {
            errors.push(`SYNC-04: Explanation states "Option ${optionIsCorrect[1].toUpperCase()} is correct" but correct_index=${q.correct_index}`);
        }
    }

    return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK 3: MATH VALIDATION — Pot Odds, Equity, Stack/Shove, Outs
// ═══════════════════════════════════════════════════════════════════════════
function checkMath(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    // --- Outs check ---
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
            if (claimed !== pattern.expected) {
                errors.push(`MATH-01: ${pattern.name} claimed ${claimed} outs but should be ${pattern.expected}`);
            }
        }
    }

    // --- Stack vs Shove check ---
    const stackShoveMatch = fullText.match(/(\d+)\s*BB\s*effective.*?shoves?\s*(?:for\s*)?(\d+)\s*BB/i);
    if (stackShoveMatch) {
        const effective = parseInt(stackShoveMatch[1]);
        const shoveSize = parseInt(stackShoveMatch[2]);
        if (shoveSize > effective) {
            errors.push(`MATH-02: Shove size (${shoveSize}BB) exceeds effective stack (${effective}BB)`);
        }
    }

    // --- Pot odds sanity check ---
    const potOddsMatch = fullText.match(/getting\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*(?:pot\s*)?odds/i);
    if (potOddsMatch && stackShoveMatch) {
        const claimedRatio = parseFloat(potOddsMatch[1]) / parseFloat(potOddsMatch[2]);
        const shoveAmt = parseInt(stackShoveMatch[2]);
        // Rough actual odds: pot = shoveAmt + 1BB (our blind), call = shoveAmt - 1BB
        const pot = shoveAmt + 1;
        const callAmt = Math.max(1, shoveAmt - 1);
        const actualRatio = pot / callAmt;

        // Allow 30% tolerance
        if (Math.abs(claimedRatio - actualRatio) / actualRatio > 0.3) {
            errors.push(`MATH-03: Claimed ${potOddsMatch[1]}:${potOddsMatch[2]} odds (${claimedRatio.toFixed(1)}:1) but scenario gives ~${actualRatio.toFixed(1)}:1`);
        }
    }

    // --- MDF check ---
    const mdfMatch = fullText.match(/MDF.*?(\d+)%/i);
    if (mdfMatch) {
        const claimedMdf = parseInt(mdfMatch[1]);
        const betSizeMatch = fullText.match(/(\d+)%\s*(?:of\s*)?pot/i) || fullText.match(/pot[- ]?size[d]?\s*bet/i);
        if (betSizeMatch) {
            const betPct = betSizeMatch[1] ? parseInt(betSizeMatch[1]) : 100;
            const expectedMdf = Math.round((1 / (1 + betPct / 100)) * 100);
            if (Math.abs(claimedMdf - expectedMdf) > 5) {
                errors.push(`MATH-04: MDF claimed ${claimedMdf}% but for ${betPct}% pot bet, MDF should be ~${expectedMdf}%`);
            }
        }
    }

    // --- Equity percentage sanity ---
    const equityMatch = fullText.match(/(\d+(?:\.\d+)?)\s*%\s*equity/gi);
    if (equityMatch) {
        for (const m of equityMatch) {
            const pct = parseFloat(m);
            if (pct > 100 || pct < 0) {
                errors.push(`MATH-05: Impossible equity percentage: ${pct}%`);
            }
        }
    }

    return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK 4: LOGIC VALIDATION — Impossible Options, Action Consistency
// ═══════════════════════════════════════════════════════════════════════════
function checkLogic(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;
    const optionsText = (q.options || []).join(' ').toLowerCase();

    // --- Raise vs All-in check ---
    const isAllInSituation = /\b(shoves?\s*(all[- ]?in)?|all[- ]?in|jams?)\b/i.test(q.question);
    if (isAllInSituation) {
        // Check if effective stacks are mentioned (equal effective = can't raise)
        const hasEqualEffective = /(\d+)\s*BB\s*effective/i.test(q.question);
        const hasRaiseOption = q.options?.some(o => /^raise/i.test(o.trim()));

        if (hasRaiseOption && hasEqualEffective) {
            // Check if the question mentions multiple stack sizes (not equal effective)
            const stackMentions = q.question.match(/(\d+)\s*BB/gi) || [];
            const uniqueStacks = new Set(stackMentions.map(s => parseInt(s)));

            // If only one stack size (effective) and facing all-in, raising is impossible
            if (uniqueStacks.size <= 2) {
                errors.push('LOGIC-01: "Raise" option exists when facing all-in with roughly equal effective stacks — raising is impossible');
            }
        }
    }

    // --- Check after river action ---
    const isRiver = /river|final\s*board|complete\s*board|5th\s*street/i.test(q.question);
    if (isRiver) {
        // Only flag if options suggest IMPROVING hand or drawing to outs
        const hasDrawImproveOption = q.options?.some(o =>
            /\b(draw\s*to|need.*outs|improve.*hand|chase|still\s*draw)\b/i.test(o)
        );
        if (hasDrawImproveOption) {
            errors.push('LOGIC-02: Drawing/improving mentioned as option on the river — no more cards to come');
        }
    }

    // --- Fold option for getting correct odds ---
    const correctOption = q.options?.[q.correct_index]?.toLowerCase() || '';
    if (correctOption.startsWith('fold') && /getting.*?odds.*?favorable/i.test(fullText)) {
        errors.push('LOGIC-03: Correct answer is Fold but question states odds are favorable');
    }

    // --- Position check: MP in 5-handed ---
    if (/5[- ]?handed/i.test(q.question) && /\bMP\b/.test(q.question)) {
        errors.push('LOGIC-04: MP position referenced in 5-handed game (positions are UTG/CO/BTN/SB/BB)');
    }

    // --- Open-shove at deep stacks ---
    const stackMatch = fullText.match(/(\d+)\s*BB\s*(?:effective|stack)/i);
    if (stackMatch) {
        const stack = parseInt(stackMatch[1]);
        if (stack > 30 && correctOption.includes('shove') && /open/i.test(correctOption)) {
            errors.push(`LOGIC-05: Open-shoving recommended at ${stack}BB — too deep for open-shove (typically <20BB)`);
        }
    }

    // --- Satellite strategy check ---
    if (/satellite/i.test(q.question)) {
        if (correctOption.includes('shove') || correctOption.includes('all-in')) {
            // In satellites with short stacks present and player is safe, shoving premium is often wrong
            const shortStacksPresent = /short\s*stack|(\d)\s*BB.*?blind/i.test(q.question);
            const playerIsSafe = /safe|covered|3rd|2nd|chip\s*lead/i.test(q.question);
            if (shortStacksPresent && playerIsSafe) {
                errors.push('LOGIC-06: Aggressive play recommended in satellite when player is safe and short stacks present — survival > chip accumulation');
            }
        }
    }

    // --- BB ANTE RULE: Tournament antes must equal 1BB ---
    // Modern tournaments ALWAYS use BB ante. "2000/4000 with 400 ante" is WRONG — ante must be 4000.
    const blindsAnteMatch = fullText.match(/(\d[\d,]*)\/(\d[\d,]*).*?(\d[\d,]*)\s*ante/i);
    if (blindsAnteMatch) {
        const bb = parseInt(blindsAnteMatch[2].replace(/,/g, ''));
        const ante = parseInt(blindsAnteMatch[3].replace(/,/g, ''));
        if (ante > 0 && ante !== bb) {
            errors.push(`LOGIC-07: Non-BB ante detected (blinds ${blindsAnteMatch[1]}/${blindsAnteMatch[2]}, ante ${ante}). Tournaments use BB ante — ante must equal 1BB (${bb})`);
        }
    }
    // Also catch "ante of X" or "X ante" patterns with explicit blinds
    if (!blindsAnteMatch) {
        const blindsOnly = fullText.match(/(\d[\d,]*)\/(\d[\d,]*)/);
        const anteOnly = fullText.match(/(?:with\s+(?:a\s+)?)?(\d[\d,]*)\s*ante/i) || fullText.match(/ante\s+(?:of\s+)?(\d[\d,]*)/i);
        if (blindsOnly && anteOnly) {
            const bb2 = parseInt(blindsOnly[2].replace(/,/g, ''));
            const ante2 = parseInt(anteOnly[1].replace(/,/g, ''));
            if (ante2 > 0 && ante2 !== bb2) {
                errors.push(`LOGIC-07: Non-BB ante detected (BB=${bb2}, ante=${ante2}). Tournaments use BB ante — ante must equal 1BB`);
            }
        }
    }

    return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECK 5: QUALITY VALIDATION — Depth, Specificity, Educational Value
// ═══════════════════════════════════════════════════════════════════════════
function checkQuality(q) {
    const errors = [];

    // Strategy categories need scenario depth
    if (STRATEGY_CATEGORIES.includes(q.category)) {
        // Must have specific stack sizes
        if (!/\d+\s*BB/i.test(q.question)) {
            errors.push('QUAL-01: Strategy question missing stack size (BB)');
        }

        // Must have position info — check both abbreviated and spelled-out
        const qLower = q.question.toLowerCase();
        const hasAbbrevPosition = VALID_POSITIONS.some(pos => {
            const regex = new RegExp(`\\b${pos}\\b`, 'i');
            return regex.test(q.question);
        });
        const hasSpelledPosition = SPELLED_OUT_POSITIONS.some(pos => qLower.includes(pos));
        if (!hasAbbrevPosition && !hasSpelledPosition && !/position/i.test(q.question)) {
            errors.push('QUAL-02: Strategy question missing position context');
        }

        // Must have specific hole cards
        const hasCards = /[AKQJT2-9][♠♣♥♦hdcs]/i.test(q.question) || /pocket\s*[2-9AKQJT]/i.test(q.question);
        if (!hasCards) {
            errors.push('QUAL-03: Strategy question missing specific hole cards');
        }
    }

    // Explanation must be educational (not just "this is correct")
    if (q.explanation && q.explanation.length < 80) {
        errors.push('QUAL-04: Explanation too brief (< 80 chars) — must be educational');
    }

    // No definition-only questions
    if (/^what\s+(is|does|are)\s+/i.test(q.question) && !/scenario|situation|hand|board|stack/i.test(q.question)) {
        errors.push('QUAL-05: Definition-only question detected — must be scenario-based');
    }

    // Check for joke/filler options
    if (q.options) {
        const fillerPatterns = [
            /doesn't matter/i,
            /it's just luck/i,
            /random/i,
            /who cares/i,
            /always fold/i,
            /none of the above/i,
        ];
        q.options.forEach((opt, i) => {
            for (const pattern of fillerPatterns) {
                if (pattern.test(opt)) {
                    errors.push(`QUAL-06: Option ${i} looks like a joke/filler: "${opt.substring(0, 40)}"`);
                }
            }
        });
    }

    return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a single question. Returns { valid: boolean, errors: string[] }
 */
function validateQuestion(q) {
    const allErrors = [
        ...checkStructure(q),
        ...checkSync(q),
        ...checkMath(q),
        ...checkLogic(q),
        ...checkQuality(q),
    ];

    return {
        valid: allErrors.length === 0,
        errors: allErrors,
        question: q
    };
}

/**
 * Validate a batch of questions. Returns { valid: [], rejected: [], report: string }
 */
function validateBatch(questions) {
    const valid = [];
    const rejected = [];
    const errorCounts = {};

    for (const q of questions) {
        const result = validateQuestion(q);
        if (result.valid) {
            valid.push(q);
        } else {
            rejected.push(result);
            result.errors.forEach(err => {
                const code = err.split(':')[0];
                errorCounts[code] = (errorCounts[code] || 0) + 1;
            });
        }
    }

    const report = [
        `\n📋 QA VALIDATION REPORT`,
        `========================`,
        `Total: ${questions.length} | ✅ Passed: ${valid.length} | ❌ Rejected: ${rejected.length}`,
        `Pass Rate: ${questions.length > 0 ? Math.round(valid.length / questions.length * 100) : 0}%`,
        '',
        'Error Breakdown:',
        ...Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => `  ${code}: ${count} occurrences`),
    ].join('\n');

    return { valid, rejected, report };
}

/**
 * Validate questions already in DB. Returns counts and optionally removes failures.
 */
async function validateDatabase(supabase, categories, { removeInvalid = false, logDetails = true } = {}) {
    let totalValid = 0;
    let totalInvalid = 0;
    const allInvalidIds = [];

    for (const cat of categories) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('*')
            .eq('category', cat);

        if (error || !data) {
            console.error(`Error fetching ${cat}:`, error?.message);
            continue;
        }

        const { valid, rejected, report } = validateBatch(data);
        totalValid += valid.length;
        totalInvalid += rejected.length;

        console.log(`\n📂 ${cat} (${data.length} total)`);
        console.log(`   ✅ Valid: ${valid.length} | ❌ Invalid: ${rejected.length}`);

        if (logDetails && rejected.length > 0) {
            rejected.slice(0, 5).forEach(r => {
                console.log(`   ❌ "${r.question.question?.substring(0, 60)}..."`);
                r.errors.forEach(e => console.log(`      → ${e}`));
            });
            if (rejected.length > 5) {
                console.log(`   ... and ${rejected.length - 5} more`);
            }
        }

        rejected.forEach(r => allInvalidIds.push(r.question.id));
    }

    if (removeInvalid && allInvalidIds.length > 0) {
        console.log(`\n🗑️  Removing ${allInvalidIds.length} invalid questions from daily rotation...`);

        // Remove from daily rotation but don't delete
        const { error: updateError } = await supabase
            .from('trivia_questions')
            .update({ daily_date: null })
            .in('id', allInvalidIds);

        if (updateError) {
            console.error('Error removing invalid questions:', updateError.message);
        } else {
            console.log('✅ Invalid questions removed from daily rotation');
        }
    }

    return { totalValid, totalInvalid, invalidIds: allInvalidIds };
}

// Helper
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    validateQuestion,
    validateBatch,
    validateDatabase,
    checkStructure,
    checkSync,
    checkMath,
    checkLogic,
    checkQuality,
    STRATEGY_CATEGORIES,
};
