/**
 * Pure, safe poker playing-card tokenizer for Trivia question prompts.
 *
 * Detects authentic poker hands and boards (e.g. "As Kh", "AcKc", "Qc Jd 2s",
 * "Ah-Kd-7c", "A♠ K♥", "Ks") while strictly avoiding false positives on common
 * English words or dimensions ("As", "Ad", "Ah", "2d", "3d", "In", "At").
 */

const SUIT_META = Object.freeze({
    s: Object.freeze({ suit: 'spades', symbol: '♠' }),
    '♠': Object.freeze({ suit: 'spades', symbol: '♠' }),
    h: Object.freeze({ suit: 'hearts', symbol: '♥' }),
    '♥': Object.freeze({ suit: 'hearts', symbol: '♥' }),
    d: Object.freeze({ suit: 'diamonds', symbol: '♦' }),
    '♦': Object.freeze({ suit: 'diamonds', symbol: '♦' }),
    c: Object.freeze({ suit: 'clubs', symbol: '♣' }),
    '♣': Object.freeze({ suit: 'clubs', symbol: '♣' }),
});

// Ambiguous standalone ASCII tokens that frequently appear in ordinary English prose.
const AMBIGUOUS_STANDALONE = new Set(['As', 'Ad', 'Ah', '2d', '3d', '4d', '5d']);

// Matches a single card token with either explicit Unicode suit or strict ASCII rank + lowercase suit.
const SINGLE_CARD_RE = /^(10|[AKQJT2-9])([shdc♠♥♦♣])$/;

// Matches a contiguous cluster of 2..5 glued cards like "AsKh", "QcJd2s", "A♠K♥".
const GLUED_CARDS_RE = /^(?:(?:10|[AKQJT2-9])[shdc♠♥♦♣]){2,5}$/;

// Splits text while keeping whitespace and punctuation separators intact.
const SEGMENT_RE = /(\s+|[-–/,()[\]{}:;!?."'])/;

function parseSingleCard(token) {
    const match = SINGLE_CARD_RE.exec(token);
    if (!match) return null;
    const rank = match[1];
    const suitChar = match[2];
    const meta = SUIT_META[suitChar];
    if (!meta) return null;
    const isUnicodeSuit = suitChar === '♠' || suitChar === '♥' || suitChar === '♦' || suitChar === '♣';
    return {
        type: 'card',
        rank,
        suit: meta.suit,
        symbol: meta.symbol,
        raw: token,
        isUnicodeSuit,
    };
}

function parseGluedCards(token) {
    if (!GLUED_CARDS_RE.test(token)) return null;
    const cards = [];
    const re = /(10|[AKQJT2-9])([shdc♠♥♦♣])/g;
    let match;
    while ((match = re.exec(token)) !== null) {
        const meta = SUIT_META[match[2]];
        cards.push({
            type: 'card',
            rank: match[1],
            suit: meta.suit,
            symbol: meta.symbol,
            raw: match[0],
            isUnicodeSuit: match[2] === '♠' || match[2] === '♥' || match[2] === '♦' || match[2] === '♣',
        });
    }
    return cards.length >= 2 ? cards : null;
}

function isSimpleCardSeparator(part) {
    return /^(\s+|[-/])$/.test(part);
}

/**
 * Splits a trivia string into ordered `{ type: 'text', value }` and
 * `{ type: 'card', rank, suit, symbol, raw }` tokens.
 */
export function tokenizePokerCardText(text) {
    if (typeof text !== 'string' || text.length === 0) return [];
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
        // Look backward over one simple separator
        if (i >= 2 && isSimpleCardSeparator(classified[i - 1].part)
            && (classified[i - 2].kind === 'single' || classified[i - 2].kind === 'glued')) {
            hasCardNeighbor[i] = true;
            continue;
        }
        // Look forward over one simple separator
        if (i + 2 < classified.length && isSimpleCardSeparator(classified[i + 1].part)
            && (classified[i + 2].kind === 'single' || classified[i + 2].kind === 'glued')) {
            hasCardNeighbor[i] = true;
        }
    }

    const tokens = [];
    const pushText = (value) => {
        if (!value) return;
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
        } else if (item.kind === 'single') {
            const safeStandalone = item.card.isUnicodeSuit || !AMBIGUOUS_STANDALONE.has(item.part);
            if (hasCardNeighbor[i] || safeStandalone) {
                tokens.push(item.card);
            } else {
                pushText(item.part);
            }
        } else {
            pushText(item.part);
        }
    }

    return tokens;
}
