/**
 * HandHistoryParser — Parse pasted hand histories from major poker sites
 * Supports: PokerStars (and PokerStars-shaped exports), GGPoker, 888poker
 *
 * Contract:
 *   parseHandHistory(text) ->
 *     { success: true, heroHand: { card1, card2 }, heroPosition, heroStack (in BB),
 *       gameType: 'cash' | 'tournament', board: { flop: [], turn, river },
 *       villains: [{ position, archetype: { id, name }, stack }],
 *       actionHistory: [{ action, player, position, street }] }
 *   | { success: false, error: string }
 *
 * Stacks are always normalized to BIG BLINDS (every consumer — setHeroStack,
 * the analyze API's heroStack — treats them as bb, never as chips/currency).
 * Pot size is intentionally NOT returned: the sandbox derives the pot from
 * actionHistory.
 */

const POSITION_MAP = {
    'UTG': 'UTG', 'UTG+1': 'UTG', 'UTG+2': 'MP', 'UTG+3': 'MP',
    'MP': 'MP', 'MP1': 'MP', 'MP2': 'MP', 'LJ': 'MP', 'Lojack': 'MP', 'HJ': 'MP', 'Hijack': 'MP',
    'CO': 'CO', 'Cutoff': 'CO',
    'BTN': 'BTN', 'Button': 'BTN', 'Dealer': 'BTN', 'BU': 'BTN',
    'SB': 'SB', 'Small Blind': 'SB', 'SmallBlind': 'SB',
    'BB': 'BB', 'Big Blind': 'BB', 'BigBlind': 'BB',
};

const CARD_MAP = {
    'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', 'T': 'T', '10': 'T',
    '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2',
};
const SUIT_MAP_HH = { 's': 's', 'h': 'h', 'd': 'd', 'c': 'c' };

const DEFAULT_ARCHETYPE = { id: 'gto_neutral', name: 'GTO Neutral' };
const MIN_STACK_BB = 1;
const MAX_STACK_BB = 1000;

function parseCard(raw) {
    if (!raw || raw.length < 2) return null;
    // '10d' and 'Td' both land here — rank is everything but the trailing suit.
    const rank = CARD_MAP[raw.slice(0, -1).toUpperCase()];
    const suit = SUIT_MAP_HH[raw.slice(-1).toLowerCase()];
    if (!rank || !suit) return null;
    return `${rank}${suit}`;
}

function parseCards(str) {
    if (!str) return [];
    // Match patterns like [As Kh], [As][Kh], As Kh, [ 10d, 10s ] etc.
    const matches = String(str).match(/(?:10|[AKQJT2-9])[shdc]/gi) || [];
    return matches.map(c => parseCard(c)).filter(Boolean);
}

function normalizePosition(pos) {
    if (!pos) return null;
    const cleaned = String(pos).trim().replace(/[^a-zA-Z0-9+ ]/g, '');
    if (!cleaned) return null;
    return POSITION_MAP[cleaned]
        || POSITION_MAP[cleaned.toUpperCase()]
        || POSITION_MAP[cleaned.replace(/\s+/g, ' ')]
        || null;
}

/**
 * Position labels ordered from the button, sized to the table.
 * Everything collapses into the six buckets the sandbox supports.
 */
function positionLabels(n) {
    if (n <= 2) return ['BTN', 'BB'];              // heads-up: the button IS the SB
    if (n === 3) return ['BTN', 'SB', 'BB'];
    if (n <= 6) return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'].slice(0, n);
    // 7-max and up: extra early seats fold into UTG/MP, extra late seats into CO
    const wide = ['BTN', 'SB', 'BB', 'UTG', 'UTG', 'MP', 'MP', 'CO', 'CO'];
    if (n <= wide.length) return wide.slice(0, n);
    const padded = wide.slice(0, wide.length - 1);
    while (padded.length < n - 1) padded.push('MP');
    padded.push('CO');
    return padded;
}

/**
 * Big blind size from the header — used to convert chip/currency stacks to bb.
 * Returns null when no blind level can be found.
 */
function detectBigBlind(text) {
    // Tournament: "Level V (75/150)" / "Level XI (400/800)"
    const levelMatch = text.match(/Level[^(\n]*\((\d[\d,.]*)\/(\d[\d,.]*)/i);
    if (levelMatch) {
        const bb = parseFloat(levelMatch[2].replace(/,/g, ''));
        if (bb > 0) return bb;
    }
    // Cash: "($0.50/$1.00 USD)" or "(50/100)"
    const cashMatch = text.match(/\(\s*\$?(\d[\d,.]*)\s*\/\s*\$?(\d[\d,.]*)/);
    if (cashMatch) {
        const bb = parseFloat(cashMatch[2].replace(/,/g, ''));
        if (bb > 0) return bb;
    }
    // Fallback: "posts big blind $1.00" / "posts big blind 200"
    const postMatch = text.match(/posts (?:the )?big blind[^\d]*(\d[\d,.]*)/i);
    if (postMatch) {
        const bb = parseFloat(postMatch[1].replace(/,/g, ''));
        if (bb > 0) return bb;
    }
    return null;
}

function toBigBlinds(rawStack, bbSize) {
    if (!Number.isFinite(rawStack) || rawStack <= 0) return 100;
    if (!bbSize || bbSize <= 0) return 100; // no blind level found — assume 100bb
    const bb = Math.round(rawStack / bbSize);
    return Math.max(MIN_STACK_BB, Math.min(MAX_STACK_BB, bb || MIN_STACK_BB));
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk EVERY street (preflop through river) collecting player actions.
 * @param {string} text - full hand history
 * @param {Object} positionOf - map of player name -> position label
 */
function parseAllActions(text, positionOf = {}) {
    const actions = [];
    const afterHole = text.split(/\*\*\* HOLE CARDS \*\*\*/i)[1];
    if (!afterHole) return actions;

    // Stop at showdown/summary — those lines are results, not actions.
    const body = afterHole.split(/\*\*\*\s*(?:SHOW ?DOWN|SUMMARY)\s*\*\*\*/i)[0] || '';

    let street = 'preflop';
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        const streetHeader = line.match(/\*\*\*\s*(FLOP|TURN|RIVER)\s*\*\*\*/i);
        if (streetHeader) {
            street = streetHeader[1].toLowerCase();
            continue;
        }
        if (!line.includes(':')) continue;

        const m = line.match(/^(.+?): (folds|checks|calls|bets|raises)\b/i);
        if (!m) continue;

        const player = m[1].trim();
        const verb = m[2].toLowerCase();
        let action = null;
        if (verb === 'folds') action = 'fold';
        else if (verb === 'checks') action = 'check';
        else if (verb === 'calls') action = 'call';
        else action = 'raise'; // bets | raises

        // PokerStars writes all-ins as "raises $X to $Y and is all-in".
        if (/and is all[- ]?in/i.test(line)) action = 'allin';

        actions.push({ action, player, position: positionOf[player] || null, street });
    }

    return actions;
}

/**
 * Build the seat -> position map and hero/villain stacks (in bb).
 * Shared by the PokerStars-shaped and 888 parsers.
 */
function assignSeats(result, seats, btnSeat, heroName, bbSize) {
    const names = Object.keys(seats);
    if (names.length === 0) return {};

    const ordered = Object.entries(seats).sort((a, b) => a[1].seat - b[1].seat);
    const n = ordered.length;
    const labels = positionLabels(n);
    let btnIdx = ordered.findIndex(([, v]) => v.seat === btnSeat);
    if (btnIdx === -1) btnIdx = 0;

    const positionOf = {};
    ordered.forEach(([name, data], i) => {
        const offset = (i - btnIdx + n) % n;
        const pos = labels[offset] || labels[labels.length - 1];
        data.position = pos;
        positionOf[name] = pos;
        if (name === heroName) {
            result.heroPosition = pos;
            result.heroStack = toBigBlinds(data.stack, bbSize);
        }
    });

    result.villains = ordered
        .filter(([name]) => name !== heroName)
        .map(([, data]) => ({
            position: data.position || 'BB',
            archetype: { ...DEFAULT_ARCHETYPE },
            stack: toBigBlinds(data.stack, bbSize),
            range: '',
        }));

    return positionOf;
}

function emptyResult() {
    return {
        heroHand: null,
        heroPosition: null,
        board: { flop: [], turn: null, river: null },
        actionHistory: [],
        gameType: 'cash',
        heroStack: 100,
        villains: [],
    };
}

/**
 * Parse a PokerStars hand history (also used for GGPoker / generic exports)
 */
function parsePokerStars(text) {
    const result = emptyResult();

    // Detect tournament
    if (/Tournament/i.test(text)) result.gameType = 'tournament';

    const bbSize = detectBigBlind(text);

    // Find hero name + hole cards
    const heroMatch = text.match(/Dealt to (.+?) \[(.+?)\]/);
    if (!heroMatch) return null;
    const heroName = heroMatch[1].trim();
    const heroCards = parseCards(heroMatch[2]);
    if (heroCards.length >= 2) {
        result.heroHand = { card1: heroCards[0], card2: heroCards[1] };
    }

    // Parse seats: "Seat 3: Hero ($512.30 in chips)"
    const seatLines = text.match(/Seat \d+: .+/g) || [];
    const seats = {};
    for (const line of seatLines) {
        const m = line.match(/Seat (\d+): (.+?) \(\s*\$?([\d,.]+)/);
        if (m) {
            seats[m[2].trim()] = { seat: parseInt(m[1], 10), stack: parseFloat(m[3].replace(/,/g, '')) };
        }
    }

    // Detect button seat
    const btnMatch = text.match(/Seat #(\d+) is the button/i);
    const btnSeat = btnMatch ? parseInt(btnMatch[1], 10) : null;

    const positionOf = assignSeats(result, seats, btnSeat, heroName, bbSize);

    // Fall back to an explicit position label if the seat math produced nothing
    if (!result.heroPosition) {
        const labelled = text.match(new RegExp(`${escapeRegex(heroName)}\\s*\\(([A-Za-z+ ]{2,12})\\)`));
        result.heroPosition = normalizePosition(labelled?.[1]) || null;
    }

    // Parse board
    const flopMatch = text.match(/\*\*\* FLOP \*\*\*[^[]*\[(.+?)\]/i);
    const turnMatch = text.match(/\*\*\* TURN \*\*\* .+? \[(.+?)\]/i);
    const riverMatch = text.match(/\*\*\* RIVER \*\*\* .+? \[(.+?)\]/i);

    if (flopMatch) result.board.flop = parseCards(flopMatch[1]).slice(0, 3);
    if (turnMatch) result.board.turn = parseCards(turnMatch[1])[0] || null;
    if (riverMatch) result.board.river = parseCards(riverMatch[1])[0] || null;

    // Parse actions on every street
    result.actionHistory = parseAllActions(text, positionOf);

    return result;
}

/**
 * Parse a GGPoker hand history
 */
function parseGGPoker(text) {
    // GGPoker uses the PokerStars layout with minor header differences
    return parsePokerStars(text);
}

/**
 * Parse an 888poker hand history
 */
function parse888(text) {
    const result = emptyResult();

    if (/Tournament/i.test(text)) result.gameType = 'tournament';

    const bbSize = detectBigBlind(text);

    // 888poker: "Dealt to hero [ 10d, Kh ]"
    const heroMatch = text.match(/Dealt to (.+?) \[(.+?)\]/);
    if (!heroMatch) return null;
    const heroName = heroMatch[1].trim();
    const heroCards = parseCards(heroMatch[2]);
    if (heroCards.length >= 2) {
        result.heroHand = { card1: heroCards[0], card2: heroCards[1] };
    }

    // 888 seat lines: "Seat 4: PlayerName ( $124.50 )"
    const seats = {};
    const seatLines = text.match(/Seat \d+: .+/g) || [];
    for (const line of seatLines) {
        const m = line.match(/Seat (\d+): (.+?) \(\s*\$?([\d,.]+)/);
        if (m) {
            seats[m[2].trim()] = { seat: parseInt(m[1], 10), stack: parseFloat(m[3].replace(/,/g, '')) };
        }
    }

    // 888 marks the button as "Seat 4 is the button"
    const btnMatch = text.match(/Seat (\d+) is the button/i);
    const btnSeat = btnMatch ? parseInt(btnMatch[1], 10) : null;

    const positionOf = assignSeats(result, seats, btnSeat, heroName, bbSize);

    // Board — 888 uses "** Dealing flop ** [ 10d, Kh, 2c ]"
    const boardMatch = text.match(/\*\* Dealing flop \*\*[^[]*\[(.+?)\]/i);
    const turnMatch = text.match(/\*\* Dealing turn \*\*[^[]*\[(.+?)\]/i);
    const riverMatch = text.match(/\*\* Dealing river \*\*[^[]*\[(.+?)\]/i);
    if (boardMatch) result.board.flop = parseCards(boardMatch[1]).slice(0, 3);
    if (turnMatch) result.board.turn = parseCards(turnMatch[1])[0] || null;
    if (riverMatch) result.board.river = parseCards(riverMatch[1])[0] || null;

    // Actions — 888 writes "PlayerName folds" (no colon), so normalize the
    // street markers into PokerStars shape and parse line by line.
    result.actionHistory = parse888Actions(text, positionOf);

    if (!result.heroPosition) result.heroPosition = 'BTN';
    return result;
}

function parse888Actions(text, positionOf = {}) {
    const actions = [];
    const afterHole = text.split(/\*\* Dealing down cards \*\*/i)[1] || text;
    const body = afterHole.split(/\*\* Summary \*\*/i)[0] || '';

    let street = 'preflop';
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        const streetHeader = line.match(/\*\* Dealing (flop|turn|river) \*\*/i);
        if (streetHeader) {
            street = streetHeader[1].toLowerCase();
            continue;
        }

        const m = line.match(/^(.+?)\s+(folds|checks|calls|bets|raises)\b/i);
        if (!m) continue;

        const player = m[1].replace(/:$/, '').trim();
        const verb = m[2].toLowerCase();
        let action = null;
        if (verb === 'folds') action = 'fold';
        else if (verb === 'checks') action = 'check';
        else if (verb === 'calls') action = 'call';
        else action = 'raise';

        if (/all[- ]?in/i.test(line)) action = 'allin';

        actions.push({ action, player, position: positionOf[player] || null, street });
    }

    return actions;
}

/**
 * Main parser — auto-detects site format.
 * Always returns a { success } envelope so callers can surface a real reason.
 */
export function parseHandHistory(text) {
    if (!text || String(text).trim().length < 20) {
        return { success: false, error: 'Hand history is too short to parse.' };
    }

    const raw = String(text);

    try {
        let result = null;
        if (/PokerStars/i.test(raw)) result = parsePokerStars(raw);
        else if (/GGPoker|GG Network|Poker Hand #/i.test(raw)) result = parseGGPoker(raw);
        else if (/888poker|Pacific Poker|\*\* Dealing down cards \*\*/i.test(raw)) result = parse888(raw);
        else result = parsePokerStars(raw); // generic — most sites share this layout

        if (!result || !result.heroHand) {
            return { success: false, error: 'Could not detect a supported hand history format.' };
        }

        return { success: true, ...result };
    } catch (e) {
        console.warn('[HH Parser] Error:', e);
        return { success: false, error: 'Failed to parse hand history.' };
    }
}

export default parseHandHistory;
