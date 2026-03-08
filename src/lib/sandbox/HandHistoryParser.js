/**
 * HandHistoryParser — Parse pasted hand histories from major poker sites
 * Supports: PokerStars, GGPoker, 888poker
 * 
 * Returns: { heroHand, heroPosition, board, potSize, actionHistory, gameType, heroStack, villains }
 */

const POSITION_MAP = {
    'UTG': 'UTG', 'UTG+1': 'UTG', 'UTG+2': 'MP',
    'MP': 'MP', 'MP1': 'MP', 'MP2': 'MP', 'HJ': 'MP', 'Hijack': 'MP',
    'CO': 'CO', 'Cutoff': 'CO',
    'BTN': 'BTN', 'Button': 'BTN', 'Dealer': 'BTN', 'BU': 'BTN',
    'SB': 'SB', 'Small Blind': 'SB',
    'BB': 'BB', 'Big Blind': 'BB',
};

const CARD_MAP = {
    'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', 'T': 'T', '10': 'T',
    '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2',
};
const SUIT_MAP_HH = { 's': 's', 'h': 'h', 'd': 'd', 'c': 'c' };

function parseCard(raw) {
    if (!raw || raw.length < 2) return null;
    const rank = CARD_MAP[raw[0]] || CARD_MAP[raw.substring(0, 2)];
    const suit = SUIT_MAP_HH[raw[raw.length - 1].toLowerCase()];
    if (!rank || !suit) return null;
    return `${rank}${suit}`;
}

function parseCards(str) {
    // Match patterns like [As Kh], [As][Kh], As Kh, etc.
    const matches = str.match(/[AKQJT2-9][0shdcSHDC]/g) || [];
    return matches.map(c => parseCard(c)).filter(Boolean);
}

function normalizePosition(pos) {
    if (!pos) return null;
    const cleaned = pos.trim().replace(/[^a-zA-Z0-9+ ]/g, '');
    return POSITION_MAP[cleaned] || POSITION_MAP[cleaned.toUpperCase()] || null;
}

/**
 * Parse a PokerStars hand history
 */
function parsePokerStars(text) {
    const result = { heroHand: null, heroPosition: null, board: { flop: [], turn: null, river: null }, actionHistory: [], gameType: 'cash', heroStack: 100, villains: [] };

    // Detect tournament
    if (/Tournament/i.test(text)) result.gameType = 'tournament';

    // Find hero name
    const heroMatch = text.match(/Dealt to (.+?) \[(.+?)\]/);
    if (!heroMatch) return null;
    const heroName = heroMatch[1].trim();
    const heroCards = parseCards(heroMatch[2]);
    if (heroCards.length >= 2) {
        result.heroHand = { card1: heroCards[0], card2: heroCards[1] };
    }

    // Find hero seat/position
    const seatLines = text.match(/Seat \d+: .+/g) || [];
    const positionSection = text.split('*** HOLE CARDS ***')[0] || '';

    // Try to find position from action order
    const preflopSection = text.split('*** HOLE CARDS ***')[1]?.split('***')[0] || '';
    const actionOrder = preflopSection.match(new RegExp(`${heroName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (\\w+)`, 'i'));

    // Parse positions from seat descriptions
    const positions = {};
    for (const line of seatLines) {
        const m = line.match(/Seat (\d+): (.+?) \((\$?[\d,.]+)/);
        if (m) {
            positions[m[2].trim()] = { seat: parseInt(m[1]), stack: parseFloat(m[3].replace(/[$,]/g, '')) };
        }
    }

    // Detect button seat
    const btnMatch = text.match(/Seat #(\d+) is the button/);
    const btnSeat = btnMatch ? parseInt(btnMatch[1]) : null;

    // Assign positions based on seat ordering relative to button
    if (btnSeat && Object.keys(positions).length > 0) {
        const seatNums = Object.entries(positions).sort((a, b) => a[1].seat - b[1].seat);
        const btnIdx = seatNums.findIndex(([, v]) => v.seat === btnSeat);
        const posLabels = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
        const n = seatNums.length;
        seatNums.forEach(([name, data], i) => {
            const offset = (i - btnIdx + n) % n;
            const pos = posLabels[Math.min(offset, posLabels.length - 1)];
            data.position = pos;
            if (name === heroName) {
                result.heroPosition = pos;
                result.heroStack = Math.round(data.stack);
            }
        });

        // Build villains
        result.villains = seatNums
            .filter(([name]) => name !== heroName)
            .map(([, data]) => ({
                position: data.position || 'BB',
                archetype: { id: 'gto_neutral', name: 'GTO Neutral' },
                stack: Math.round(data.stack),
            }));
    }

    // Parse board
    const flopMatch = text.match(/\*\*\* FLOP \*\*\* \[(.+?)\]/);
    const turnMatch = text.match(/\*\*\* TURN \*\*\* .+? \[(.+?)\]/);
    const riverMatch = text.match(/\*\*\* RIVER \*\*\* .+? \[(.+?)\]/);

    if (flopMatch) result.board.flop = parseCards(flopMatch[1]).slice(0, 3);
    if (turnMatch) result.board.turn = parseCards(turnMatch[1])[0] || null;
    if (riverMatch) result.board.river = parseCards(riverMatch[1])[0] || null;

    // Parse actions (simplified)
    const actionSections = text.split(/\*\*\* (?:FLOP|TURN|RIVER|SHOW DOWN) \*\*\*/);
    const preflopActions = actionSections[0]?.split('*** HOLE CARDS ***')[1] || '';
    const lines = preflopActions.split('\n').filter(l => l.includes(':'));
    for (const line of lines) {
        const m = line.match(/(.+?): (folds|checks|calls|bets|raises|all-in)/i);
        if (m) {
            const action = m[2].toLowerCase();
            if (action === 'folds') result.actionHistory.push({ action: 'fold', player: m[1].trim() });
            else if (action === 'checks') result.actionHistory.push({ action: 'check', player: m[1].trim() });
            else if (action === 'calls') result.actionHistory.push({ action: 'call', player: m[1].trim() });
            else if (action === 'bets' || action === 'raises') result.actionHistory.push({ action: 'raise', player: m[1].trim() });
            else if (action === 'all-in') result.actionHistory.push({ action: 'allin', player: m[1].trim() });
        }
    }

    return result;
}

/**
 * Parse a GGPoker hand history  
 */
function parseGGPoker(text) {
    // GGPoker uses similar format to PokerStars with minor differences
    return parsePokerStars(text); // Shares enough structure
}

/**
 * Parse an 888poker hand history
 */
function parse888(text) {
    const result = { heroHand: null, heroPosition: null, board: { flop: [], turn: null, river: null }, actionHistory: [], gameType: 'cash', heroStack: 100, villains: [] };

    if (/Tournament/i.test(text)) result.gameType = 'tournament';

    // 888poker: "Dealt to hero [As Kh]"
    const heroMatch = text.match(/Dealt to (.+?) \[(.+?)\]/);
    if (!heroMatch) return null;
    const heroCards = parseCards(heroMatch[2]);
    if (heroCards.length >= 2) {
        result.heroHand = { card1: heroCards[0], card2: heroCards[1] };
    }

    // Board
    const boardMatch = text.match(/\*\* Dealing flop \*\* \[(.+?)\]/);
    const turnMatch = text.match(/\*\* Dealing turn \*\* \[(.+?)\]/);
    const riverMatch = text.match(/\*\* Dealing river \*\* \[(.+?)\]/);
    if (boardMatch) result.board.flop = parseCards(boardMatch[1]).slice(0, 3);
    if (turnMatch) result.board.turn = parseCards(turnMatch[1])[0] || null;
    if (riverMatch) result.board.river = parseCards(riverMatch[1])[0] || null;

    result.heroPosition = 'BTN'; // fallback
    return result;
}

/**
 * Main parser — auto-detects site format
 */
export function parseHandHistory(text) {
    if (!text || text.length < 20) return null;

    try {
        if (/PokerStars/i.test(text)) return parsePokerStars(text);
        if (/GGPoker|GG Network/i.test(text)) return parseGGPoker(text);
        if (/888poker|Pacific Poker/i.test(text)) return parse888(text);

        // Try generic parsing (most sites use similar format)
        const result = parsePokerStars(text);
        if (result?.heroHand) return result;
    } catch (e) {
        console.warn('[HH Parser] Error:', e);
    }

    return null;
}

export default parseHandHistory;
