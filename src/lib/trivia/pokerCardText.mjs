/**
 * Pure poker card & hand tokenizer + structured 3-line scenario parser for
 * Smarter.Poker Trivia.
 *
 * Capabilities:
 *   1. Explicit single & glued cards: "Ah", "Kd", "7c", "10s", "AcKc", "8♠7♠", "Ah-Kd-7c".
 *   2. Suited / offsuit 2-card starting hands: "Q5s", "AKo", "QTs", "72s", "A7o".
 *      Expanded into two real cards whose suits NEVER collide with any card already
 *      appearing on the board (e.g. Q5s on 7c 2d 9d 5d 3h -> Q♠ 5♠).
 *   3. Pocket pairs in explicit hand context ("You hold JJ", "Hero holds 55"):
 *      Expanded into two distinct non-colliding suits (e.g. 55 on 5h 8c Qd Qc 6h -> 5♠ 5♦).
 *   4. Structured 3-line question splitting:
 *      - Line 1 (Setup + Hero Hand): "You Hold [Q♠][5♠] In BB Vs BTN On The River (10BB Effective, Pot 30BB)."
 *      - Line 2 (Board): "The Board Is" + large board cards [7♣][2♦][9♦][5♦][3♥]
 *      - Line 3 (Prompt): "What Is The GTO Play?"
 *
 * Conservative matching: ordinary English words ("As", "Ad", "Ah", "3d", "55%", "22BB")
 * are never falsely converted into cards.
 */

const SUIT_ORDER = ['s', 'h', 'd', 'c'];

const SUIT_META = Object.freeze({
    s: { code: 's', suit: 'spades', symbol: '♠', label: 'Spades' },
    h: { code: 'h', suit: 'hearts', symbol: '♥', label: 'Hearts' },
    d: { code: 'd', suit: 'diamonds', symbol: '♦', label: 'Diamonds' },
    c: { code: 'c', suit: 'clubs', symbol: '♣', label: 'Clubs' },
    '♠': { code: 's', suit: 'spades', symbol: '♠', label: 'Spades' },
    '♥': { code: 'h', suit: 'hearts', symbol: '♥', label: 'Hearts' },
    '♦': { code: 'd', suit: 'diamonds', symbol: '♦', label: 'Diamonds' },
    '♣': { code: 'c', suit: 'clubs', symbol: '♣', label: 'Clubs' },
});

// Single-card tokens that collide with common English words or abbreviations
// when appearing alone (without another adjacent card token).
const AMBIGUOUS_STANDALONE = new Set([
    'As', 'Ad', 'Ah', 'Ac',
    'Ks', 'Kd', 'Kh', 'Kc',
    'Qs', 'Qd', 'Qh', 'Qc',
    'Js', 'Jd', 'Jh', 'Jc',
    'Ts', 'Td', 'Th', 'Tc',
    '2d', '3d', '4d', '5d',
    '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s',
    '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c',
    '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h',
]);

// Matches a single explicit card token like "As", "10h", "K♦".
const SINGLE_CARD_RE = /^(10|[AKQJT2-9])([shdc♠♥♦♣])$/;

// Matches 2 to 5 glued card tokens with no separator, e.g. "AsKh", "AcKc", "10♠9♠", "9♦6♥2♣".
const GLUED_CARDS_RE = /^(?:(?:10|[AKQJT2-9])[shdc♠♥♦♣]){2,5}$/;

// Matches 2-card suited/offsuit starting hand shorthand like "Q5s", "AKo", "QTs", "72s".
const HAND_SHORTHAND_RE = /^([AKQJT2-9])([AKQJT2-9])([so])$/;

// Matches pocket pair shorthand like "AA", "JJ", "TT", "55" (only expanded in hand context).
const POCKET_PAIR_RE = /^([AKQJT2-9])\1$/;

// Context phrase immediately preceding a pocket pair token (e.g. "You hold JJ", "Hero holds 55").
const HAND_CONTEXT_BEFORE_RE = /\b(?:hold|holds|holding|have|having|with|dealt|pocket|hand)\s+$/i;

// Splits on whitespace and common punctuation boundaries while preserving separators.
const SEGMENT_RE = /(\s+|[,.;:!?()[\]/"'-])/;

// Matches a dedicated board clause in poker scenario questions:
//   "You hold Q5s ... . Board: 7c 2d 9d 5d 3h. What is the GTO play?"
//   "You hold A7o on the flop. The board is Qh Qs Jd. What is the best play?"
const BOARD_CLAUSE_RE = /(?:^|(?<=[.!?]\s+|\s+))(?:the\s+)?board(?:\s+is)?\s*:?\s+((?:(?:10|[AKQJT2-9])[shdc♠♥♦♣](?:[\s,-]+)?){3,5})(?=[.!?;,]|\s|$)/i;

// Matches a clean closing question sentence at the end of a multi-sentence scenario.
const CLOSING_QUESTION_RE = /^([\s\S]+?[.!])\s+([^.!?]+\?)$/;

function canonicalRank(rank) {
    return rank === '10' ? 'T' : String(rank || '').toUpperCase();
}

function cardKey(rank, suitCode) {
    return `${canonicalRank(rank)}${suitCode}`;
}

export function cardImagePath(rank, suit) {
    const fileRank = (rank === 'T' || rank === '10') ? '10' : String(rank || '').toLowerCase();
    const suitName = SUIT_META[suit]?.suit || String(suit || 'spades').toLowerCase();
    return `/cards/optimized/${suitName}_${fileRank}.png`;
}

function makeCardToken(rank, suitCode, raw, isUnicodeSuit = false, group = null) {
    const meta = SUIT_META[suitCode] || SUIT_META.s;
    return {
        type: 'card',
        rank: rank === 'T' ? '10' : rank,
        rankCode: canonicalRank(rank),
        suit: meta.suit,
        suitCode: meta.code,
        symbol: meta.symbol,
        label: meta.label,
        raw,
        isUnicodeSuit,
        group,
    };
}

function parseSingleCard(token) {
    const match = SINGLE_CARD_RE.exec(token);
    if (!match) return null;
    const rank = match[1];
    const suitChar = match[2];
    const meta = SUIT_META[suitChar];
    if (!meta) return null;
    const isUnicodeSuit = suitChar === '♠' || suitChar === '♥' || suitChar === '♦' || suitChar === '♣';
    return makeCardToken(rank, meta.code, token, isUnicodeSuit);
}

function parseGluedCards(token) {
    if (!GLUED_CARDS_RE.test(token)) return null;
    const cards = [];
    const re = /(10|[AKQJT2-9])([shdc♠♥♦♣])/g;
    let match;
    while ((match = re.exec(token)) !== null) {
        const meta = SUIT_META[match[2]];
        const isUnicodeSuit = match[2] === '♠' || match[2] === '♥' || match[2] === '♦' || match[2] === '♣';
        cards.push(makeCardToken(match[1], meta.code, match[0], isUnicodeSuit));
    }
    return cards.length >= 2 ? cards : null;
}

function isSimpleCardSeparator(part) {
    return /^(\s+|[-/])$/.test(part);
}

/**
 * Collects all explicit card keys ("7c", "Td", "As") present in `text` so that
 * expanded hand shorthands (e.g. Q5s, 55) never duplicate a card on the board.
 */
export function collectExplicitCardKeys(text) {
    const used = new Set();
    if (typeof text !== 'string' || !text) return used;
    const rawParts = text.split(SEGMENT_RE).filter((part) => part.length > 0);
    for (const part of rawParts) {
        const single = parseSingleCard(part);
        if (single) {
            used.add(cardKey(single.rankCode, single.suitCode));
            continue;
        }
        const glued = parseGluedCards(part);
        if (glued) {
            for (const c of glued) used.add(cardKey(c.rankCode, c.suitCode));
        }
    }
    return used;
}

/**
 * Expands a 2-card poker hand shorthand ("Q5s", "AKo", "QTs", or pocket pair "JJ"/"55"
 * when `allowPair` is true) into two concrete card tokens whose suits do not collide
 * with `usedCards`.
 */
export function expandPokerHandShorthand(token, usedCards = new Set(), { allowPair = false } = {}) {
    if (typeof token !== 'string') return null;

    const suitedOrOffsuit = HAND_SHORTHAND_RE.exec(token);
    if (suitedOrOffsuit) {
        const [, r1, r2, kind] = suitedOrOffsuit;
        if (r1 === r2) return null; // "AAs" is not valid shorthand
        if (kind === 's') {
            let chosenSuit = SUIT_ORDER.find(
                (s) => !usedCards.has(cardKey(r1, s)) && !usedCards.has(cardKey(r2, s)),
            );
            if (!chosenSuit) chosenSuit = 's';
            usedCards.add(cardKey(r1, chosenSuit));
            usedCards.add(cardKey(r2, chosenSuit));
            return [
                makeCardToken(r1, chosenSuit, `${r1}${chosenSuit}`, false, 'hand'),
                makeCardToken(r2, chosenSuit, `${r2}${chosenSuit}`, false, 'hand'),
            ];
        }
        // Offsuit: two distinct suits avoiding board collisions.
        for (const s1 of SUIT_ORDER) {
            if (usedCards.has(cardKey(r1, s1))) continue;
            for (const s2 of SUIT_ORDER) {
                if (s2 === s1 || usedCards.has(cardKey(r2, s2))) continue;
                usedCards.add(cardKey(r1, s1));
                usedCards.add(cardKey(r2, s2));
                return [
                    makeCardToken(r1, s1, `${r1}${s1}`, false, 'hand'),
                    makeCardToken(r2, s2, `${r2}${s2}`, false, 'hand'),
                ];
            }
        }
        return [
            makeCardToken(r1, 's', `${r1}s`, false, 'hand'),
            makeCardToken(r2, 'h', `${r2}h`, false, 'hand'),
        ];
    }

    if (allowPair) {
        const pairMatch = POCKET_PAIR_RE.exec(token);
        if (pairMatch) {
            const [, r] = pairMatch;
            const available = SUIT_ORDER.filter((s) => !usedCards.has(cardKey(r, s)));
            const s1 = available[0] || 's';
            const s2 = available[1] || (s1 === 's' ? 'h' : 's');
            usedCards.add(cardKey(r, s1));
            usedCards.add(cardKey(r, s2));
            return [
                makeCardToken(r, s1, `${r}${s1}`, false, 'hand'),
                makeCardToken(r, s2, `${r}${s2}`, false, 'hand'),
            ];
        }
    }

    return null;
}

/**
 * Splits a trivia string into ordered `{ type: 'text', value }` and
 * `{ type: 'card', rank, suit, symbol, raw }` tokens.
 */
export function tokenizePokerCardText(text, { expandHands = true, usedCards = null } = {}) {
    if (typeof text !== 'string' || text.length === 0) return [];
    const used = new Set(usedCards ? Array.from(usedCards) : collectExplicitCardKeys(text));
    const rawParts = text.split(SEGMENT_RE).filter((part) => part.length > 0);

    // Pre-classify each raw segment.
    const classified = rawParts.map((part) => {
        const single = parseSingleCard(part);
        if (single) return { kind: 'single', part, card: single };
        const glued = parseGluedCards(part);
        if (glued) return { kind: 'glued', part, cards: glued };
        return { kind: 'other', part };
    });

    // Determine which single-card tokens sit adjacent to another card across a simple separator
    // (space, hyphen, or slash), forming a multi-card poker hand or board (e.g. "As Kh", "As-Kh-2d").
    const hasCardNeighbor = new Array(classified.length).fill(false);
    for (let i = 0; i < classified.length; i += 1) {
        if (classified[i].kind !== 'single') continue;
        if (i >= 2 && isSimpleCardSeparator(classified[i - 1].part)
            && (classified[i - 2].kind === 'single' || classified[i - 2].kind === 'glued')) {
            hasCardNeighbor[i] = true;
            continue;
        }
        if (i + 2 < classified.length && isSimpleCardSeparator(classified[i + 1].part)
            && (classified[i + 2].kind === 'single' || classified[i + 2].kind === 'glued')) {
            hasCardNeighbor[i] = true;
        }
    }

    const tokens = [];
    let recentText = '';
    const pushText = (value) => {
        if (!value) return;
        recentText = (recentText + value).slice(-48);
        const last = tokens[tokens.length - 1];
        if (last && last.type === 'text') {
            last.value += value;
        } else {
            tokens.push({ type: 'text', value });
        }
    };

    for (let i = 0; i < classified.length; i += 1) {
        const item = classified[i];
        if (item.kind === 'glued') {
            for (const card of item.cards) tokens.push(card);
            recentText = '';
        } else if (item.kind === 'single') {
            const safeStandalone = item.card.isUnicodeSuit || !AMBIGUOUS_STANDALONE.has(item.part);
            if (hasCardNeighbor[i] || safeStandalone) {
                tokens.push(item.card);
                recentText = '';
            } else {
                pushText(item.part);
            }
        } else if (expandHands) {
            const allowPair = HAND_CONTEXT_BEFORE_RE.test(recentText);
            const expanded = expandPokerHandShorthand(item.part, used, { allowPair });
            if (expanded) {
                for (const card of expanded) tokens.push(card);
                recentText = '';
            } else {
                pushText(item.part);
            }
        } else {
            pushText(item.part);
        }
    }

    return tokens;
}

/**
 * Parses a poker trivia question into a clean 3-line layout whenever a board
 * clause or multi-sentence scenario + closing question is present:
 *   Line 1 (`setupLine`): Situation & hero hand (e.g. "You hold Q5s ... (10BB effective, pot 30BB).")
 *   Line 2 (`boardCards`): Dedicated visual board row ("The Board Is" + large cards)
 *   Line 3 (`promptLine`): Clean closing question ("What is the GTO play?")
 */
export function parseStructuredTriviaQuestion(text) {
    const raw = String(text ?? '').trim();
    if (!raw) {
        return {
            structured: false,
            raw: '',
            setupLine: '',
            boardLabel: null,
            boardCards: [],
            promptLine: '',
            usedCards: new Set(),
        };
    }

    const usedCards = collectExplicitCardKeys(raw);
    const boardMatch = BOARD_CLAUSE_RE.exec(raw);

    if (boardMatch) {
        const boardRaw = boardMatch[1].trim();
        const boardTokens = tokenizePokerCardText(boardRaw, { expandHands: false, usedCards })
            .filter((t) => t.type === 'card');

        if (boardTokens.length >= 3 && boardTokens.length <= 5) {
            const before = raw.slice(0, boardMatch.index).trim();
            const after = raw
                .slice(boardMatch.index + boardMatch[0].length)
                .replace(/^[.,;:\s]+/, '')
                .trim();

            return {
                structured: true,
                raw,
                setupLine: before,
                boardLabel: 'The Board Is',
                boardCards: boardTokens,
                promptLine: after,
                usedCards,
            };
        }
    }

    // Multi-sentence poker scenarios without an explicit "Board:" prefix:
    // cleanly separate the closing question onto its own bold prompt line so it
    // never runs together with the setup text.
    const closingMatch = CLOSING_QUESTION_RE.exec(raw);
    if (closingMatch && closingMatch[1].trim().length >= 24 && closingMatch[2].trim().length >= 8) {
        return {
            structured: true,
            raw,
            setupLine: closingMatch[1].trim(),
            boardLabel: null,
            boardCards: [],
            promptLine: closingMatch[2].trim(),
            usedCards,
        };
    }

    return {
        structured: false,
        raw,
        setupLine: raw,
        boardLabel: null,
        boardCards: [],
        promptLine: '',
        usedCards,
    };
}
