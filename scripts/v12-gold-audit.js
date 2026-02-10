#!/usr/bin/env node
/**
 * V12 GOLD STANDARD AUDIT — COMPREHENSIVE DEEP AUDIT
 * ====================================================
 * AG-1 V12 Compliance Check — Every question, every rule.
 * 
 * 15 CHECK MODULES:
 * 1.  STRUCT — 4 options, valid index, non-empty, no dupes
 * 2.  SYNC — Answer↔explanation alignment
 * 3.  MATH — Outs, pot odds, MDF, equity, stack vs shove
 * 4.  LOGIC — BB ante, MP in 5-handed, shove at deep, satellite
 * 5.  QUALITY — Stack size, position, hole cards for strategy Qs
 * 6.  PREFIX — No letter prefixes in options
 * 7.  CARD-COL — No duplicate cards between hand and board
 * 8.  HAND-RANK — Claims like "top pair"/"set" match actual cards
 * 9.  POS-ORDER — OOP can't "check to" IP player
 * 10. RIVER — No draws/outs/improving on river
 * 11. TURN — No runner-runner claims on turn
 * 12. SHORT-STK — At ≤12BB, should be shove/fold not raise
 * 13. DIST — Answer distribution per category (~25% each)
 * 14. DUPE — Near-duplicate question detection
 * 15. FACTS — Known poker facts verification
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CATS = ['poker_history', 'famous_hands', 'player_profiles', 'rule_knowledge', 'tournament_facts',
    'gto_theory', 'mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

const STRATEGY_CATS = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios', 'gto_theory'];

const VALID_POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'EP', 'LP'];
const SPELLED_OUT_POSITIONS = [
    'under the gun', 'under-the-gun', 'middle position', 'hijack', 'hi-jack',
    'cutoff', 'cut-off', 'cut off', 'button', 'small blind', 'big blind',
    'early position', 'late position', 'on the button', 'in the blinds',
    'in the sb', 'in the bb', 'in the co', 'on the btn', 'dealer', 'dealer button',
];

const CARD_RANKS = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, 'T': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
const SUIT_SYMBOLS = ['♠', '♣', '♥', '♦', 's', 'c', 'h', 'd', '♤', '♧', '♡', '♢'];

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════
// CARD EXTRACTION UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract individual cards from text. Returns array of normalized card strings like "Ah", "Ks"
 */
function extractCards(text) {
    const cards = [];
    // Pattern: rank + suit symbol (e.g., A♠, K♥, T♣)
    const pattern = /([AKQJT2-9])\s*([♠♣♥♦♤♧♡♢])/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const rank = match[1];
        const suit = match[2].replace('♤', '♠').replace('♧', '♣').replace('♡', '♥').replace('♢', '♦');
        cards.push(rank + suit);
    }
    // Also match text suits: As, Kh, Tc, 9d
    const textPattern = /([AKQJT2-9])([shcd])\b/g;
    while ((match = textPattern.exec(text)) !== null) {
        const rank = match[1];
        const suitMap = { s: '♠', h: '♥', c: '♣', d: '♦' };
        cards.push(rank + suitMap[match[2]]);
    }
    return [...new Set(cards)];
}

/**
 * Extract board cards specifically — look for "board is" or "flop is" patterns
 */
function extractBoard(text) {
    const boardPatterns = [
        /(?:board|flop|flop is|flop comes?|board (?:is|reads|shows|of))\s*[:.]?\s*([AKQJT2-9][♠♣♥♦♤♧♡♢shcd]\s*){3,5}/gi,
        /(?:turn|turn is|turn card)\s*[:.]?\s*([AKQJT2-9][♠♣♥♦♤♧♡♢shcd])/gi,
        /(?:river|river is|river card)\s*[:.]?\s*([AKQJT2-9][♠♣♥♦♤♧♡♢shcd])/gi,
    ];
    const boardCards = [];
    for (const pattern of boardPatterns) {
        let m;
        while ((m = pattern.exec(text)) !== null) {
            boardCards.push(...extractCards(m[0]));
        }
    }
    return [...new Set(boardCards)];
}

/**
 * Extract hero's hole cards — look for "with" or "holding" patterns
 */
function extractHeroCards(text) {
    const heroPatterns = [
        /(?:with|holding|hold|have|dealt)\s+([AKQJT2-9][♠♣♥♦♤♧♡♢shcd]\s*[AKQJT2-9][♠♣♥♦♤♧♡♢shcd])/gi,
        /(?:your\s+hand|hero|you\s+have)\s*[:.]?\s*([AKQJT2-9][♠♣♥♦♤♧♡♢shcd]\s*[AKQJT2-9][♠♣♥♦♤♧♡♢shcd])/gi,
    ];
    const heroCards = [];
    for (const pattern of heroPatterns) {
        let m;
        while ((m = pattern.exec(text)) !== null) {
            heroCards.push(...extractCards(m[0]));
        }
    }
    return [...new Set(heroCards)].slice(0, 2);
}

// ═══════════════════════════════════════════════════════════════════
// CHECK MODULES
// ═══════════════════════════════════════════════════════════════════

function check1_structure(q) {
    const errors = [];
    if (!q.question || q.question.trim().length < 20) errors.push('STRUCT-01: Question too short');
    if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`STRUCT-02: Must have 4 options (got ${q.options?.length || 0})`);
        return errors;
    }
    q.options.forEach((opt, i) => {
        if (!opt || opt.trim().length < 3) errors.push(`STRUCT-03: Option ${i} empty/short`);
    });
    const normalized = q.options.map(o => o.toLowerCase().trim());
    if (new Set(normalized).size !== 4) errors.push('STRUCT-04: Duplicate options');
    if (typeof q.correct_index !== 'number' || q.correct_index < 0 || q.correct_index > 3)
        errors.push(`STRUCT-05: Invalid correct_index: ${q.correct_index}`);
    if (!q.explanation || q.explanation.trim().length < 30) errors.push('STRUCT-06: Explanation too short');
    return errors;
}

function check2_sync(q) {
    const errors = [];
    if (!q.options || !q.explanation || typeof q.correct_index !== 'number') return errors;
    const correctOption = q.options[q.correct_index];
    if (!correctOption) return ['SYNC-01: correct_index points to nothing'];

    const explanation = q.explanation.toLowerCase();
    const correctAction = correctOption.toLowerCase().split(/[\s,\u2014-]+/)[0];
    const actionWords = ['fold', 'call', 'raise', 'shove', 'check', 'bet', 'limp'];

    if (actionWords.includes(correctAction)) {
        const wrongOptions = q.options.filter((_, i) => i !== q.correct_index);
        for (const wrongOpt of wrongOptions) {
            const wrongAction = wrongOpt.toLowerCase().split(/[\s,\u2014-]+/)[0];
            if (actionWords.includes(wrongAction) && wrongAction !== correctAction) {
                const cc = (explanation.match(new RegExp('\\b' + escapeRegex(correctAction) + '\\b', 'gi')) || []).length;
                const wc = (explanation.match(new RegExp('\\b' + escapeRegex(wrongAction) + '\\b', 'gi')) || []).length;
                if (wc > cc + 2) {
                    errors.push(`SYNC-02: Explanation says "${wrongAction}" ${wc}x but correct is "${correctAction}" (${cc}x)`);
                }
            }
        }
    }

    // Check explicit "correct answer is Option X" 
    const optionLetters = ['a', 'b', 'c', 'd'];
    const explicitMatch = explanation.match(/correct\s*(?:answer|option|play|choice)?\s*is\s*(?:option\s*)?([a-d])/i);
    if (explicitMatch) {
        const claimed = optionLetters.indexOf(explicitMatch[1].toLowerCase());
        if (claimed !== -1 && claimed !== q.correct_index)
            errors.push(`SYNC-03: Explanation says "${explicitMatch[1].toUpperCase()}" but correct_index=${q.correct_index}`);
    }

    const optionIsCorrect = explanation.match(/option\s*([a-d])\s*(?:is\s*(?:the\s*)?correct|is\s*right)/i);
    if (optionIsCorrect) {
        const claimed = optionLetters.indexOf(optionIsCorrect[1].toLowerCase());
        if (claimed !== -1 && claimed !== q.correct_index)
            errors.push(`SYNC-04: Explanation says "Option ${optionIsCorrect[1].toUpperCase()} is correct" but correct_index=${q.correct_index}`);
    }

    return errors;
}

function check3_math(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    // Outs check
    const outsPatterns = [
        { regex: /gutshot.*?(\d+)\s*outs/i, expected: 4, name: 'gutshot' },
        { regex: /(\d+)\s*outs.*?gutshot/i, expected: 4, name: 'gutshot' },
        { regex: /open.?ended\s*straight\s*draw.*?(\d+)\s*outs/i, expected: 8, name: 'OESD' },
        { regex: /OESD.*?(\d+)\s*outs/i, expected: 8, name: 'OESD' },
        { regex: /(\d+)\s*outs.*?OESD/i, expected: 8, name: 'OESD' },
        { regex: /flush\s*draw.*?(\d+)\s*outs/i, expected: 9, name: 'flush draw' },
        { regex: /(\d+)\s*outs.*?flush\s*draw/i, expected: 9, name: 'flush draw' },
    ];
    for (const p of outsPatterns) {
        const m = fullText.match(p.regex);
        if (m && parseInt(m[1]) !== p.expected)
            errors.push(`MATH-01: ${p.name} claimed ${m[1]} outs, should be ${p.expected}`);
    }

    // Stack vs shove
    const stackShoveMatch = fullText.match(/(\d+)\s*BB\s*effective.*?shoves?\s*(?:for\s*)?(\d+)\s*BB/i);
    if (stackShoveMatch) {
        const eff = parseInt(stackShoveMatch[1]);
        const shove = parseInt(stackShoveMatch[2]);
        if (shove > eff) errors.push(`MATH-02: Shove ${shove}BB > effective ${eff}BB`);
    }

    // MDF check
    const mdfMatch = fullText.match(/MDF.*?(\d+)%/i);
    if (mdfMatch) {
        const claimed = parseInt(mdfMatch[1]);
        const betMatch = fullText.match(/(\d+)%\s*(?:of\s*)?pot/i) || fullText.match(/pot[- ]?size[d]?\s*bet/i);
        if (betMatch) {
            const betPct = betMatch[1] ? parseInt(betMatch[1]) : 100;
            const expected = Math.round((1 / (1 + betPct / 100)) * 100);
            if (Math.abs(claimed - expected) > 5)
                errors.push(`MATH-04: MDF claimed ${claimed}% but for ${betPct}% pot bet should be ~${expected}%`);
        }
    }

    // Equity sanity
    const equityMatches = fullText.match(/(\d+(?:\.\d+)?)\s*%\s*equity/gi);
    if (equityMatches) {
        for (const m of equityMatches) {
            const pct = parseFloat(m);
            if (pct > 100) errors.push(`MATH-05: Impossible equity ${pct}%`);
        }
    }

    return errors;
}

function check4_logic(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;
    const correctOpt = (q.options?.[q.correct_index] || '').toLowerCase();

    // BB Ante Rule
    const blindsAnteMatch = fullText.match(/(\d[\d,]*)\/(\d[\d,]*).*?(\d[\d,]*)\s*ante/i);
    if (blindsAnteMatch) {
        const bb = parseInt(blindsAnteMatch[2].replace(/,/g, ''));
        const ante = parseInt(blindsAnteMatch[3].replace(/,/g, ''));
        if (ante > 0 && ante !== bb)
            errors.push(`LOGIC-07: Non-BB ante (blinds ${blindsAnteMatch[1]}/${blindsAnteMatch[2]}, ante ${ante})`);
    }
    if (!blindsAnteMatch) {
        const blindsOnly = fullText.match(/(\d[\d,]*)\/(\d[\d,]*)/);
        const anteOnly = fullText.match(/(?:with\s+(?:a\s+)?)?(\d[\d,]*)\s*ante/i) || fullText.match(/ante\s+(?:of\s+)?(\d[\d,]*)/i);
        if (blindsOnly && anteOnly) {
            const bb2 = parseInt(blindsOnly[2].replace(/,/g, ''));
            const ante2 = parseInt(anteOnly[1].replace(/,/g, ''));
            if (ante2 > 0 && ante2 !== bb2)
                errors.push(`LOGIC-07: Non-BB ante (BB=${bb2}, ante=${ante2})`);
        }
    }

    // MP in 5-handed
    if (/5[- ]?handed/i.test(q.question) && /\bMP\b/.test(q.question))
        errors.push('LOGIC-04: MP in 5-handed game');

    // Open-shove at deep stacks
    const stackMatch = fullText.match(/(\d+)\s*BB\s*(?:effective|stack)/i);
    if (stackMatch) {
        const stack = parseInt(stackMatch[1]);
        if (stack > 30 && correctOpt.includes('shove') && /open/i.test(correctOpt))
            errors.push(`LOGIC-05: Open-shove at ${stack}BB (too deep)`);
    }

    // Satellite logic
    if (/satellite/i.test(q.question)) {
        if (correctOpt.includes('shove') || correctOpt.includes('all-in')) {
            const shortPresent = /short\s*stack|(\d)\s*BB.*?blind/i.test(q.question);
            const playerSafe = /safe|covered|3rd|2nd|chip\s*lead/i.test(q.question);
            if (shortPresent && playerSafe)
                errors.push('LOGIC-06: Aggressive play in satellite when safe w/ short stacks present');
        }
    }

    // Raise vs all-in with equal effective stacks
    const isAllIn = /\b(shoves?\s*(all[- ]?in)?|all[- ]?in|jams?)\b/i.test(q.question);
    if (isAllIn) {
        const hasEqualEff = /(\d+)\s*BB\s*effective/i.test(q.question);
        const hasRaise = q.options?.some(o => /^raise/i.test(o.trim()));
        if (hasRaise && hasEqualEff) {
            const stackMentions = q.question.match(/(\d+)\s*BB/gi) || [];
            const unique = new Set(stackMentions.map(s => parseInt(s)));
            if (unique.size <= 2)
                errors.push('LOGIC-01: "Raise" option when facing all-in w/ equal effective stacks');
        }
    }

    // Fold with favorable odds
    if (correctOpt.startsWith('fold') && /getting.*?odds.*?favorable/i.test(fullText))
        errors.push('LOGIC-03: Fold when odds are favorable');

    return errors;
}

function check5_quality(q) {
    const errors = [];

    if (STRATEGY_CATS.includes(q.category)) {
        if (!/\d+\s*BB/i.test(q.question))
            errors.push('QUAL-01: Strategy Q missing stack size (BB)');

        const qLower = q.question.toLowerCase();
        const hasAbbr = VALID_POSITIONS.some(p => new RegExp('\\b' + p + '\\b', 'i').test(q.question));
        const hasSpelled = SPELLED_OUT_POSITIONS.some(p => qLower.includes(p));
        if (!hasAbbr && !hasSpelled && !/position/i.test(q.question))
            errors.push('QUAL-02: Strategy Q missing position');

        const hasCards = /[AKQJT2-9][♠♣♥♦hdcs]/i.test(q.question) || /pocket\s*[2-9AKQJT]/i.test(q.question);
        if (!hasCards) errors.push('QUAL-03: Strategy Q missing hole cards');
    }

    if (q.explanation && q.explanation.length < 80) errors.push('QUAL-04: Explanation < 80 chars');

    if (/^what\s+(is|does|are)\s+/i.test(q.question) && !/scenario|situation|hand|board|stack/i.test(q.question))
        errors.push('QUAL-05: Definition-only question');

    // Filler options
    if (q.options) {
        const fillers = [/doesn't matter/i, /it's just luck/i, /who cares/i, /none of the above/i];
        q.options.forEach((opt, i) => {
            for (const f of fillers) {
                if (f.test(opt)) errors.push(`QUAL-06: Filler option ${i}: "${opt.substring(0, 40)}"`);
            }
        });
    }

    return errors;
}

function check6_prefix(q) {
    const errors = [];
    if (!q.options) return errors;
    for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        // Match: "A. ", "A) ", "B. ", etc — but NOT poker hands like "A-5" or "A♠"
        if (/^[A-Da-d]\.\s/.test(opt) || /^[A-Da-d]\)\s/.test(opt)) {
            errors.push(`PREFIX-01: Option ${i} has letter prefix: "${opt.substring(0, 30)}"`);
        }
    }
    return errors;
}

function check7_cardCollision(q) {
    const errors = [];
    const qText = q.question || '';
    const heroCards = extractHeroCards(qText);
    const boardCards = extractBoard(qText);

    if (heroCards.length >= 2 && boardCards.length >= 3) {
        // Check for collision
        for (const hc of heroCards) {
            for (const bc of boardCards) {
                if (hc === bc) {
                    errors.push(`CARD-COL-01: Hero card ${hc} duplicates board card`);
                }
            }
        }

        // Check for duplicate cards on the board
        const seen = new Set();
        for (const bc of boardCards) {
            if (seen.has(bc)) errors.push(`CARD-COL-02: Duplicate board card ${bc}`);
            seen.add(bc);
        }
    }

    // Same rank+suit appearing in hero hand
    if (heroCards.length === 2 && heroCards[0] === heroCards[1]) {
        errors.push(`CARD-COL-03: Hero has two identical cards: ${heroCards[0]}`);
    }

    return errors;
}

function check8_handRanking(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`.toLowerCase();
    const qText = q.question || '';

    const heroCards = extractHeroCards(qText);
    const boardCards = extractBoard(qText);

    // Only validate if we have enough card info
    if (heroCards.length < 2 || boardCards.length < 3) return errors;

    const heroRanks = heroCards.map(c => c[0]);
    const boardRanks = boardCards.map(c => c[0]);

    // Check "gutshot" vs "OESD" classification based on actual cards
    // If hero has two cards and board has 3+, check if straight draw classification is correct
    const allRanks = [...heroRanks, ...boardRanks].map(r => CARD_RANKS[r] || parseInt(r)).filter(Boolean);

    // Check top pair claim: hero card matches highest board card
    if (/top pair/i.test(fullText)) {
        const maxBoard = Math.max(...boardRanks.map(r => CARD_RANKS[r] || 0));
        const heroHasTop = heroRanks.some(r => (CARD_RANKS[r] || 0) === maxBoard);
        if (!heroHasTop && maxBoard > 0) {
            errors.push(`RANK-01: Claims "top pair" but hero (${heroRanks.join(',')}) doesn't match top board (${boardRanks[0]})`);
        }
    }

    // Check "overpair" claim: hero pair must be higher than all board cards
    if (/overpair/i.test(fullText) && heroRanks[0] === heroRanks[1]) {
        const maxBoard = Math.max(...boardRanks.map(r => CARD_RANKS[r] || 0));
        const heroRank = CARD_RANKS[heroRanks[0]] || 0;
        if (heroRank <= maxBoard) {
            errors.push(`RANK-02: Claims "overpair" but ${heroRanks[0]}${heroRanks[0]} is not over board max ${boardRanks[0]}`);
        }
    }

    // Check "set" claim: hero should have pocket pair matching a board card
    if (/\bset\b/i.test(fullText) && !/set mine|set-mine|set mining/i.test(fullText)) {
        const heroPair = heroRanks[0] === heroRanks[1];
        const matchesBoard = heroPair && boardRanks.includes(heroRanks[0]);
        // Only flag if we're confident about the cards
        if (heroPair && !matchesBoard && boardCards.length >= 3) {
            errors.push(`RANK-03: Claims "set" but pocket ${heroRanks[0]}s don't match any board card`);
        }
    }

    // Check: "flush draw" should require 2 suited cards + 2 board suited
    if (/flush\s*draw/i.test(fullText) && heroCards.length >= 2 && boardCards.length >= 3) {
        const heroSuits = heroCards.map(c => c.length > 1 ? c[1] : '');
        const boardSuits = boardCards.map(c => c.length > 1 ? c[1] : '');
        const heroSuited = heroSuits[0] && heroSuits[0] === heroSuits[1];
        if (heroSuited) {
            const suitCount = boardSuits.filter(s => s === heroSuits[0]).length;
            if (suitCount < 2) {
                errors.push(`RANK-04: Claims "flush draw" but only ${suitCount} board cards match hero suit ${heroSuits[0]}`);
            }
        }
    }

    return errors;
}

function check9_positionOrder(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    // Position hierarchy: SB < BB < UTG < ... < CO < BTN
    // OOP acts first post-flop. IP player can't "check to" OOP

    // Check: "checks to you" or "villain checks" + position info
    const posOrder = { 'SB': 1, 'BB': 2, 'UTG': 3, 'UTG+1': 4, 'UTG+2': 5, 'MP': 6, 'HJ': 7, 'CO': 8, 'BTN': 9 };

    // Only check when hero position is explicitly stated
    const heroPos = fullText.match(/(?:you're?|hero|you are)\s+(?:in\s+(?:the\s+)?|on\s+(?:the\s+)?)?(\bUTG\b|\bMP\b|\bHJ\b|\bCO\b|\bBTN\b|\bSB\b|\bBB\b)/i);
    const villainPos = fullText.match(/(?:villain|opponent)\s+(?:in\s+(?:the\s+)?|on\s+(?:the\s+)?)?(\bUTG\b|\bMP\b|\bHJ\b|\bCO\b|\bBTN\b|\bSB\b|\bBB\b)/i);

    if (heroPos && villainPos) {
        const hPos = posOrder[heroPos[1].toUpperCase()] || 0;
        const vPos = posOrder[villainPos[1].toUpperCase()] || 0;

        // Post-flop: lower position number = acts first (OOP)
        // If villain is OOP (lower number), villain acts first, so "checks to you" is valid
        // If villain is IP (higher number), villain can't "check to" hero
        if (vPos > hPos && /(?:villain|opponent)\s+checks?\s+to\s+(?:you|hero)/i.test(fullText)) {
            errors.push(`POS-01: Villain (${villainPos[1]}) is IP vs Hero (${heroPos[1]}) but "checks to you" — IP can't check to OOP`);
        }
    }

    return errors;
}

function check10_riverLogic(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    const isRiver = /\briver\b|final\s*board|complete\s*board|5th\s*street/i.test(q.question);
    if (!isRiver) return errors;

    // Check for draw/outs mentions in options
    const drawTerms = /\b(draw\s*to|need.*outs|improve.*hand|chase|still\s*draw|hit.*on\s*(?:the\s*)?next|more\s*cards?\s*to\s*come)\b/i;
    if (q.options) {
        q.options.forEach((opt, i) => {
            if (drawTerms.test(opt))
                errors.push(`RIVER-01: Option ${i} mentions drawing on river`);
        });
    }

    // Check explanation for draw language on river
    if (q.explanation && /\b(\d+\s*outs|drawing\s*(?:to|dead))\b/i.test(q.explanation)) {
        // "drawing dead" is acceptable
        if (!/drawing\s*dead/i.test(q.explanation)) {
            errors.push('RIVER-02: Explanation mentions outs/drawing on river');
        }
    }

    return errors;
}

function check11_turnLogic(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`;

    const isTurn = /\bturn\b.*?(card|is|comes?)/i.test(q.question) && !/\briver\b/i.test(q.question);
    if (!isTurn) return errors;

    // No "runner-runner" on turn (only 1 card to come)
    if (/runner[- ]?runner/i.test(fullText)) {
        errors.push('TURN-01: "Runner-runner" mentioned on turn (only 1 card to come)');
    }

    return errors;
}

function check12_shortStack(q) {
    const errors = [];
    if (!STRATEGY_CATS.includes(q.category)) return errors;

    const stackMatch = q.question.match(/(\d+)\s*BB\s*(?:effective|stack)/i);
    if (!stackMatch) return errors;

    const stack = parseInt(stackMatch[1]);
    const correctOpt = (q.options?.[q.correct_index] || '').toLowerCase();

    // At ≤12BB, open-raising (not shoving) is typically wrong
    if (stack <= 12) {
        // Check if correct answer is "raise to XBB" (not shove/fold)
        const isRaiseTo = /raise\s*(?:to\s*)?\d/i.test(correctOpt) && !/shove|all[- ]?in/i.test(correctOpt);
        if (isRaiseTo) {
            // Exception: if it's a blind defense or facing a raise, raising can be valid
            const isFacingAction = /facing|calls?|raises?|opens?|bets?/i.test(q.question) && !/fold\s*to\s*you/i.test(q.question);
            if (!isFacingAction) {
                errors.push(`SHORT-01: At ${stack}BB, correct answer is "raise to X" instead of shove/fold`);
            }
        }
    }

    return errors;
}

function check15_facts(q) {
    const errors = [];
    const fullText = `${q.question} ${q.explanation || ''}`.toLowerCase();

    // Moneymaker bluff hand — the FAMOUS bluff is K♠7♥ vs Q♠9♥ (NOT the final hand)
    if (/moneymaker/i.test(fullText) && /bluff/i.test(fullText)) {
        // Check if they mention wrong cards for the bluff
        if (/5♦4♠|5d4s|five.*four/i.test(fullText)) {
            errors.push('FACT-01: Moneymaker bluff was K♠7♥ vs Q♠9♥, not 5♦4♠ (that was final hand)');
        }
    }

    // Phil Hellmuth bracelets
    if (/hellmuth/i.test(fullText)) {
        const braceletMatch = fullText.match(/(\d+)\s*bracelets?/);
        if (braceletMatch && parseInt(braceletMatch[1]) !== 17)
            errors.push(`FACT-02: Hellmuth has 17 bracelets, not ${braceletMatch[1]}`);
    }

    // Phil Ivey bracelets
    if (/\bivey\b/i.test(fullText)) {
        const braceletMatch = fullText.match(/(\d+)\s*bracelets?/);
        if (braceletMatch && parseInt(braceletMatch[1]) !== 11 && parseInt(braceletMatch[1]) !== 10)
            errors.push(`FACT-03: Ivey has 11 bracelets, not ${braceletMatch[1]}`);
    }

    // Youngest WSOP ME champion
    if (/youngest.*?main event.*?champion/i.test(fullText) || /youngest.*?wsop.*?champion/i.test(fullText)) {
        if (/eastgate|blumstein|gold/i.test(fullText) && !/cada/i.test(fullText))
            errors.push('FACT-04: Youngest WSOP ME champion is Joe Cada (21, 2009)');
    }

    // First WSOP
    if (/first\s*wsop/i.test(fullText) && /(\d{4})/.test(fullText)) {
        const year = fullText.match(/first\s*wsop.*?(\d{4})/i);
        if (year && parseInt(year[1]) !== 1970)
            errors.push(`FACT-05: First WSOP was 1970, not ${year[1]}`);
    }

    // WSOP moved to Rio
    if (/wsop.*?(moved|relocated).*?rio/i.test(fullText)) {
        const yearMatch = fullText.match(/(\d{4})/);
        if (yearMatch && parseInt(yearMatch[1]) !== 2005)
            errors.push(`FACT-06: WSOP moved to Rio in 2005, not ${yearMatch[1]}`);
    }

    // Jeff Lisandro 2009 bracelets
    if (/lisandro/i.test(fullText) && /2009/i.test(fullText)) {
        const braceletMatch = fullText.match(/(\d+)\s*bracelets?/);
        if (braceletMatch && parseInt(braceletMatch[1]) !== 3)
            errors.push(`FACT-07: Lisandro won 3 bracelets in 2009, not ${braceletMatch[1]}`);
    }

    // Super/System author
    if (/super[/ ]?system/i.test(fullText)) {
        if (/sklansky|caro|malmuth/i.test(fullText) && !/brunson/i.test(fullText))
            errors.push('FACT-08: Super/System was written by Doyle Brunson');
    }

    return errors;
}

// ═══════════════════════════════════════════════════════════════════
// MASTER AUDIT ENGINE
// ═══════════════════════════════════════════════════════════════════

async function main() {
    const args = process.argv.slice(2);
    const fixMode = args.includes('--fix');
    const deleteMode = args.includes('--delete');
    const verbose = args.includes('--verbose');

    console.log('═'.repeat(70));
    console.log('AG-1 V12 GOLD STANDARD COMPREHENSIVE AUDIT');
    console.log(`Mode: ${fixMode ? 'FIX' : deleteMode ? 'DELETE' : 'REPORT ONLY'}`);
    console.log('═'.repeat(70));

    const allIssues = [];
    const answerDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const diffDist = {};
    const allQuestions = [];
    let totalScanned = 0;

    for (const cat of CATS) {
        const { data, error } = await s.from('trivia_questions')
            .select('id, question, options, correct_index, explanation, category, difficulty')
            .eq('category', cat);

        if (error || !data) {
            console.error(`Error fetching ${cat}:`, error?.message);
            continue;
        }

        let catIssues = 0;
        const catErrors = {};

        for (const q of data) {
            totalScanned++;
            allQuestions.push(q);

            // Track distributions
            answerDist[q.correct_index] = (answerDist[q.correct_index] || 0) + 1;
            diffDist[q.difficulty] = (diffDist[q.difficulty] || 0) + 1;

            // Run ALL checks
            const errors = [
                ...check1_structure(q),
                ...check2_sync(q),
                ...check3_math(q),
                ...check4_logic(q),
                ...check5_quality(q),
                ...check6_prefix(q),
                ...check7_cardCollision(q),
                ...check8_handRanking(q),
                ...check9_positionOrder(q),
                ...check10_riverLogic(q),
                ...check11_turnLogic(q),
                ...check12_shortStack(q),
                ...check15_facts(q),
            ];

            if (errors.length > 0) {
                catIssues++;
                allIssues.push({ id: q.id, category: cat, question: q.question, errors });
                errors.forEach(e => {
                    const code = e.split(':')[0];
                    catErrors[code] = (catErrors[code] || 0) + 1;
                });

                if (verbose) {
                    console.log(`\n  ❌ ${q.id}`);
                    console.log(`     Q: ${q.question.substring(0, 100)}`);
                    errors.forEach(e => console.log(`     → ${e}`));
                }
            }
        }

        const status = catIssues === 0 ? '✅' : '⚠️ ';
        console.log(`${status} ${cat}: ${data.length} questions (${catIssues} issues)`);
        if (catIssues > 0 && !verbose) {
            Object.entries(catErrors)
                .sort((a, b) => b[1] - a[1])
                .forEach(([code, count]) => console.log(`   ${code}: ${count}`));
        }
    }

    // ═══ CHECK 13: ANSWER DISTRIBUTION ═══
    console.log('\n' + '─'.repeat(70));
    console.log('📊 CHECK 13: ANSWER DISTRIBUTION');
    console.log('─'.repeat(70));
    const total = Object.values(answerDist).reduce((a, b) => a + b, 0);
    const letters = ['A', 'B', 'C', 'D'];
    let distIssues = 0;
    for (let i = 0; i < 4; i++) {
        const pct = ((answerDist[i] / total) * 100).toFixed(1);
        const status = pct >= 20 && pct <= 30 ? '✅' : '⚠️ ';
        console.log(`  ${status} ${letters[i]}: ${answerDist[i]} (${pct}%)`);
        if (pct < 18 || pct > 32) distIssues++;
    }

    // Per-category distribution
    console.log('\n  Per-category distribution:');
    for (const cat of CATS) {
        const catQs = allQuestions.filter(q => q.category === cat);
        const catDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
        catQs.forEach(q => catDist[q.correct_index]++);
        const distStr = letters.map((l, i) => {
            const p = ((catDist[i] / catQs.length) * 100).toFixed(0);
            return `${l}:${p}%`;
        }).join(' ');
        const maxPct = Math.max(...Object.values(catDist).map(v => v / catQs.length * 100));
        const minPct = Math.min(...Object.values(catDist).map(v => v / catQs.length * 100));
        const catStatus = maxPct > 35 || minPct < 15 ? '⚠️ ' : '✅';
        console.log(`  ${catStatus} ${cat}: ${distStr}`);
    }

    // ═══ CHECK 14: DUPLICATE DETECTION ═══
    console.log('\n' + '─'.repeat(70));
    console.log('📊 CHECK 14: DUPLICATE DETECTION');
    console.log('─'.repeat(70));

    const dupes = [];
    // Normalize questions for comparison
    const normalizedQs = allQuestions.map(q => ({
        id: q.id,
        category: q.category,
        normalized: q.question.toLowerCase()
            .replace(/\$[\d,]+/g, '$X')
            .replace(/\d+bb/gi, 'XBB')
            .replace(/[♠♣♥♦]/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        original: q.question,
    }));

    for (let i = 0; i < normalizedQs.length; i++) {
        for (let j = i + 1; j < normalizedQs.length; j++) {
            if (normalizedQs[i].category !== normalizedQs[j].category) continue;

            // Simple similarity: check if 80%+ of words match
            const words1 = normalizedQs[i].normalized.split(' ');
            const words2 = normalizedQs[j].normalized.split(' ');
            const set1 = new Set(words1);
            const set2 = new Set(words2);
            const intersection = [...set1].filter(w => set2.has(w)).length;
            const similarity = intersection / Math.max(set1.size, set2.size);

            if (similarity > 0.85) {
                dupes.push({
                    id1: normalizedQs[i].id,
                    id2: normalizedQs[j].id,
                    category: normalizedQs[i].category,
                    similarity: (similarity * 100).toFixed(0),
                    q1: normalizedQs[i].original.substring(0, 80),
                    q2: normalizedQs[j].original.substring(0, 80),
                });
            }
        }
    }

    if (dupes.length === 0) {
        console.log('  ✅ No near-duplicate questions found');
    } else {
        console.log(`  ⚠️  ${dupes.length} near-duplicate pairs found:`);
        dupes.slice(0, 20).forEach(d => {
            console.log(`\n  [${d.similarity}% similar] ${d.category}`);
            console.log(`    A: ${d.q1}`);
            console.log(`    B: ${d.q2}`);
        });
        if (dupes.length > 20) console.log(`  ... and ${dupes.length - 20} more`);
    }

    // ═══ DIFFICULTY DISTRIBUTION ═══
    console.log('\n' + '─'.repeat(70));
    console.log('📊 DIFFICULTY DISTRIBUTION');
    console.log('─'.repeat(70));
    Object.entries(diffDist).sort().forEach(([d, count]) => {
        console.log(`  ${d}: ${count} (${((count / totalScanned) * 100).toFixed(1)}%)`);
    });

    // ═══ FINAL SUMMARY ═══
    console.log('\n' + '═'.repeat(70));
    console.log(`TOTAL: ${totalScanned} questions scanned`);
    console.log(`ISSUES: ${allIssues.length} questions with errors`);
    console.log(`NEAR-DUPES: ${dupes.length} pairs`);

    // Error breakdown
    if (allIssues.length > 0) {
        const errorCodes = {};
        allIssues.forEach(issue => issue.errors.forEach(e => {
            const code = e.split(':')[0];
            errorCodes[code] = (errorCodes[code] || 0) + 1;
        }));
        console.log('\nError breakdown:');
        Object.entries(errorCodes)
            .sort((a, b) => b[1] - a[1])
            .forEach(([code, count]) => console.log(`  ${code}: ${count}`));
    }

    // ═══ FIX/DELETE MODE ═══
    if ((fixMode || deleteMode) && allIssues.length > 0) {
        const fixableIds = [];
        const deleteIds = [];

        for (const issue of allIssues) {
            const hasPrefixOnly = issue.errors.every(e => e.startsWith('PREFIX'));
            if (hasPrefixOnly && fixMode) {
                fixableIds.push(issue.id);
            } else if (deleteMode) {
                deleteIds.push(issue.id);
            }
        }

        if (fixableIds.length > 0) {
            console.log(`\n🔧 Fixing ${fixableIds.length} prefix-only issues...`);
            for (const id of fixableIds) {
                const { data: q } = await s.from('trivia_questions').select('options').eq('id', id).single();
                if (q) {
                    const fixed = q.options.map(o => o.replace(/^[A-Da-d][.)]\s*/, ''));
                    await s.from('trivia_questions').update({ options: fixed }).eq('id', id);
                }
            }
            console.log('  ✅ Fixed');
        }

        if (deleteIds.length > 0) {
            console.log(`\n🗑️ Deleting ${deleteIds.length} unfixable questions...`);
            for (let i = 0; i < deleteIds.length; i += 20) {
                const batch = deleteIds.slice(i, i + 20);
                await s.from('trivia_questions').delete().in('id', batch);
            }
            console.log('  ✅ Deleted');
        }
    }

    // Print IDs for reference
    if (allIssues.length > 0) {
        console.log('\nAll issue IDs:');
        console.log(JSON.stringify(allIssues.map(i => ({ id: i.id, category: i.category, errors: i.errors })), null, 2));
    }

    console.log('═'.repeat(70));

    const { count: finalCount } = await s.from('trivia_questions').select('*', { count: 'exact', head: true });
    console.log(`Final DB count: ${finalCount}`);

    process.exit(allIssues.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
