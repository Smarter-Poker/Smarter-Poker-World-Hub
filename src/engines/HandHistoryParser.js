/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * HAND HISTORY PARSER — Multi-Site Poker Hand History Parser
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Parses hand history files from major poker sites:
 *   - PokerStars (.txt)
 *   - GGPoker (.txt)
 *   - 888poker (.txt)
 *   - Generic converter to internal format
 *
 * Internal Format (per hand):
 *   - id, site, gameType (NL/PL/FL), stakes, tableSize
 *   - players: [{ seat, name, stack, position }]
 *   - hero: { name, seat, holeCards }
 *   - streets: { preflop, flop, turn, river }
 *   - Each street: { board, actions: [{ player, action, amount }] }
 *   - result: { winners, pot, showdown }
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// ●● Internal Hand Format ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * @typedef {Object} ParsedHand
 * @property {string} id - Hand ID
 * @property {string} site - Poker site
 * @property {string} gameType - 'NL' | 'PL' | 'FL'
 * @property {string} stakes - e.g., '$0.50/$1'
 * @property {number} tableSize - 2-10
 * @property {Array} players - Player info
 * @property {Object} hero - Hero info
 * @property {Object} streets - Street data
 * @property {Object} result - Hand result
 */

// ●● Site Detection ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Detect the poker site from hand history text.
 * @param {string} text - Raw hand history
 * @returns {string} 'pokerstars' | 'ggpoker' | '888poker' | 'unknown'
 */
export function detectSite(text) {
    if (!text) return 'unknown';
    const firstLines = text.substring(0, 500).toLowerCase();

    if (firstLines.includes('pokerstars')) return 'pokerstars';
    if (firstLines.includes('ggpoker') || firstLines.includes('gg poker')) return 'ggpoker';
    if (firstLines.includes('888poker') || firstLines.includes('pacific poker')) return '888poker';
    if (firstLines.includes('winamax')) return 'winamax';
    if (firstLines.includes('partypoker')) return 'partypoker';

    return 'unknown';
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MASTER PARSER — Route to site-specific parser
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Parse a hand history file into internal format.
 * Automatically detects the site and uses the correct parser.
 *
 * @param {string} text - Raw hand history text
 * @param {string} [heroName] - Hero's screen name (optional, auto-detected if possible)
 * @returns {Array<ParsedHand>} Array of parsed hands
 */
export function parseHandHistory(text, heroName) {
    if (!text || text.trim().length === 0) return [];

    const site = detectSite(text);

    switch (site) {
        case 'pokerstars':
            return parsePokerStars(text, heroName);
        case 'ggpoker':
            return parseGGPoker(text, heroName);
        case '888poker':
            return parse888Poker(text, heroName);
        default:
            // Try PokerStars format as fallback (most common)
            return parsePokerStars(text, heroName);
    }
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// POKERSTARS PARSER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function parsePokerStars(text, heroName) {
    const hands = [];
    // Split into individual hands (separated by double newlines or hand headers)
    const handBlocks = text.split(/\n\n+(?=PokerStars)/i).filter(b => b.trim());

    for (const block of handBlocks) {
        try {
            const hand = _parsePSHand(block, heroName);
            if (hand) hands.push(hand);
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }

    return hands;
}

function _parsePSHand(block, heroName) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 5) return null;

    // Parse header: "PokerStars Hand #123456789: ..."
    const headerMatch = lines[0].match(/Hand\s*#(\d+).*?(Hold'em|Omaha)\s*(No Limit|Pot Limit|Limit)/i);
    if (!headerMatch) return null;

    const hand = {
        id: headerMatch[1],
        site: 'pokerstars',
        gameType: headerMatch[3].includes('No') ? 'NL' : headerMatch[3].includes('Pot') ? 'PL' : 'FL',
        stakes: '',
        tableSize: 0,
        players: [],
        hero: null,
        streets: { preflop: { actions: [] }, flop: null, turn: null, river: null },
        result: { winners: [], pot: 0, showdown: false },
    };

    // Parse stakes
    const stakesMatch = lines[0].match(/\(?\$?([\d.]+)\/\$?([\d.]+)/);
    if (stakesMatch) hand.stakes = `$${stakesMatch[1]}/$${stakesMatch[2]}`;

    // Parse seats and players
    let currentStreet = 'preflop';

    for (const line of lines) {
        // Seat line: "Seat 1: PlayerName ($100.50 in chips)"
        const seatMatch = line.match(/^Seat\s+(\d+):\s+(.+?)\s+\(\$?([\d.]+)/);
        if (seatMatch) {
            hand.players.push({
                seat: parseInt(seatMatch[1]),
                name: seatMatch[2],
                stack: parseFloat(seatMatch[3]),
                position: '', // Assigned later
            });
            continue;
        }

        // Hero detection: "Dealt to HeroName [As Kh]"
        const dealtMatch = line.match(/^Dealt to\s+(.+?)\s+\[(.+?)\]/);
        if (dealtMatch) {
            heroName = heroName || dealtMatch[1];
            hand.hero = {
                name: dealtMatch[1],
                holeCards: dealtMatch[2].split(/\s+/).map(_normalizeCard),
            };
            continue;
        }

        // Street markers
        if (line.startsWith('*** FLOP ***')) {
            currentStreet = 'flop';
            const boardMatch = line.match(/\[(.+?)\]/);
            hand.streets.flop = {
                board: boardMatch ? boardMatch[1].split(/\s+/).map(_normalizeCard) : [],
                actions: [],
            };
            continue;
        }
        if (line.startsWith('*** TURN ***')) {
            currentStreet = 'turn';
            const boardMatch = line.match(/\]\s*\[(.+?)\]/);
            hand.streets.turn = {
                card: boardMatch ? _normalizeCard(boardMatch[1].trim()) : '',
                actions: [],
            };
            continue;
        }
        if (line.startsWith('*** RIVER ***')) {
            currentStreet = 'river';
            const boardMatch = line.match(/\]\s*\[(.+?)\]/);
            hand.streets.river = {
                card: boardMatch ? _normalizeCard(boardMatch[1].trim()) : '',
                actions: [],
            };
            continue;
        }
        if (line.startsWith('*** SHOW DOWN ***')) {
            hand.result.showdown = true;
            continue;
        }

        // Action lines: "PlayerName: raises $5 to $7"
        const actionMatch = line.match(/^(.+?):\s+(folds|checks|calls|bets|raises)\s*\$?([\d.]*)/);
        if (actionMatch && hand.streets[currentStreet]) {
            hand.streets[currentStreet].actions.push({
                player: actionMatch[1],
                action: _normalizeAction(actionMatch[2]),
                amount: parseFloat(actionMatch[3]) || 0,
                isHero: actionMatch[1] === heroName,
            });
            continue;
        }

        // Result: "PlayerName collected $15.50 from pot"
        const winMatch = line.match(/^(.+?)\s+collected\s+\$?([\d.]+)/);
        if (winMatch) {
            hand.result.winners.push({ name: winMatch[1], amount: parseFloat(winMatch[2]) });
            hand.result.pot = Math.max(hand.result.pot, parseFloat(winMatch[2]));
        }

        // Total pot
        const potMatch = line.match(/^Total pot\s+\$?([\d.]+)/);
        if (potMatch) hand.result.pot = parseFloat(potMatch[1]);
    }

    hand.tableSize = hand.players.length;
    _assignPositions(hand);

    return hand;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// GGPOKER PARSER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function parseGGPoker(text, heroName) {
    const hands = [];
    const handBlocks = text.split(/\n\n+(?=Poker Hand)/i).filter(b => b.trim());

    for (const block of handBlocks) {
        try {
            const hand = _parseGGHand(block, heroName);
            if (hand) hands.push(hand);
        } catch (e) {
            console.warn('Failed to parse GG hand:', e.message);
        }
    }
    return hands;
}

function _parseGGHand(block, heroName) {
    // GGPoker format is similar to PokerStars with minor differences
    // Reuse PS parser with adaptations
    const adapted = block
        .replace(/Poker Hand #/gi, 'PokerStars Hand #')
        .replace(/Hero/g, heroName || 'Hero');

    return _parsePSHand(adapted, heroName);
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// 888POKER PARSER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function parse888Poker(text, heroName) {
    const hands = [];
    const handBlocks = text.split(/\n\n+(?=\*\*\*\*\*)/i).filter(b => b.trim());

    for (const block of handBlocks) {
        try {
            const hand = _parse888Hand(block, heroName);
            if (hand) hands.push(hand);
        } catch (e) {
            console.warn('Failed to parse 888 hand:', e.message);
        }
    }
    return hands;
}

function _parse888Hand(block, heroName) {
    // 888 format differs more, but core structure is similar
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 5) return null;

    const hand = {
        id: `888_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        site: '888poker',
        gameType: 'NL',
        stakes: '',
        tableSize: 0,
        players: [],
        hero: null,
        streets: { preflop: { actions: [] }, flop: null, turn: null, river: null },
        result: { winners: [], pot: 0, showdown: false },
    };

    let currentStreet = 'preflop';

    for (const line of lines) {
        const seatMatch = line.match(/^Seat\s+(\d+):\s+(.+?)\s+\(\s*\$?([\d.]+)/);
        if (seatMatch) {
            hand.players.push({
                seat: parseInt(seatMatch[1]),
                name: seatMatch[2],
                stack: parseFloat(seatMatch[3]),
                position: '',
            });
        }

        const dealtMatch = line.match(/^Dealt\s+to\s+(.+?)\s+\[(.+?)\]/);
        if (dealtMatch) {
            hand.hero = {
                name: dealtMatch[1],
                holeCards: dealtMatch[2].split(/[\s,]+/).map(_normalizeCard),
            };
        }

        if (line.includes('** Flop **') || line.includes('*** FLOP ***')) {
            currentStreet = 'flop';
            const boardMatch = line.match(/\[(.+?)\]/);
            hand.streets.flop = { board: boardMatch ? boardMatch[1].split(/\s+/).map(_normalizeCard) : [], actions: [] };
        }
        if (line.includes('** Turn **') || line.includes('*** TURN ***')) {
            currentStreet = 'turn';
            const cardMatch = line.match(/\[(.+?)\]\s*\[(.+?)\]/);
            hand.streets.turn = { card: cardMatch ? _normalizeCard(cardMatch[2]) : '', actions: [] };
        }
        if (line.includes('** River **') || line.includes('*** RIVER ***')) {
            currentStreet = 'river';
            const cardMatch = line.match(/\[(.+?)\]\s*\[(.+?)\]/);
            hand.streets.river = { card: cardMatch ? _normalizeCard(cardMatch[2]) : '', actions: [] };
        }

        const actionMatch = line.match(/^(.+?)\s+(folds|checks|calls|bets|raises)\s*\[?\$?([\d.]*)/i);
        if (actionMatch && hand.streets[currentStreet] && !line.startsWith('Seat') && !line.startsWith('**')) {
            hand.streets[currentStreet].actions.push({
                player: actionMatch[1].trim(),
                action: _normalizeAction(actionMatch[2]),
                amount: parseFloat(actionMatch[3]) || 0,
                isHero: actionMatch[1].trim() === (hand.hero?.name || heroName),
            });
        }

        const winMatch = line.match(/^(.+?)\s+(collected|wins)\s+\$?([\d.]+)/);
        if (winMatch) {
            hand.result.winners.push({ name: winMatch[1], amount: parseFloat(winMatch[3]) });
        }
    }

    hand.tableSize = hand.players.length;
    _assignPositions(hand);
    return hand;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// UTILITIES
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Normalize a card string to our internal format (e.g., "As", "Kh").
 */
function _normalizeCard(card) {
    if (!card) return '';
    card = card.trim();
    // Already in our format
    if (card.length === 2 && /^[AKQJT98765432][shdc]$/.test(card)) return card;
    // PokerStars uses same format usually
    // Handle "10s" -> "Ts"
    card = card.replace(/10/, 'T');
    return card;
}

/**
 * Normalize action strings.
 */
function _normalizeAction(action) {
    action = action.toLowerCase().trim();
    if (action.startsWith('fold')) return 'fold';
    if (action.startsWith('check')) return 'check';
    if (action.startsWith('call')) return 'call';
    if (action.startsWith('bet')) return 'bet';
    if (action.startsWith('raise')) return 'raise';
    if (action.startsWith('all')) return 'allin';
    return action;
}

/**
 * Assign positions to players based on seat arrangement and button.
 */
function _assignPositions(hand) {
    if (!hand.players || hand.players.length === 0) return;

    const n = hand.players.length;
    const positions = n === 2 ? ['BTN', 'BB']
        : n === 3 ? ['BTN', 'SB', 'BB']
        : n === 4 ? ['CO', 'BTN', 'SB', 'BB']
        : n === 5 ? ['MP', 'CO', 'BTN', 'SB', 'BB']
        : ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

    // Simple assignment by seat order (button detection would require more context)
    for (let i = 0; i < Math.min(hand.players.length, positions.length); i++) {
        hand.players[i].position = positions[i];
    }

    // Set hero position
    if (hand.hero) {
        const heroPlayer = hand.players.find(p => p.name === hand.hero.name);
        if (heroPlayer) hand.hero.position = heroPlayer.position;
    }
}

/**
 * Get the complete board at each street from a parsed hand.
 */
export function getBoardAtStreet(hand, street) {
    const board = [];
    if (hand.streets.flop) board.push(...hand.streets.flop.board);
    if (street === 'flop') return board;
    if (hand.streets.turn && hand.streets.turn.card) board.push(hand.streets.turn.card);
    if (street === 'turn') return board;
    if (hand.streets.river && hand.streets.river.card) board.push(hand.streets.river.card);
    return board;
}

/**
 * Get all hero decision points from a parsed hand.
 */
export function getHeroDecisionPoints(hand) {
    if (!hand.hero) return [];

    const points = [];
    const streets = ['preflop', 'flop', 'turn', 'river'];

    for (const streetName of streets) {
        const streetData = hand.streets[streetName];
        if (!streetData) continue;

        for (const action of streetData.actions) {
            if (action.isHero) {
                points.push({
                    street: streetName,
                    board: getBoardAtStreet(hand, streetName),
                    holeCards: hand.hero.holeCards,
                    action: action.action,
                    amount: action.amount,
                    position: hand.hero.position,
                });
            }
        }
    }

    return points;
}

export default {
    parseHandHistory,
    detectSite,
    parsePokerStars,
    parseGGPoker,
    parse888Poker,
    getBoardAtStreet,
    getHeroDecisionPoints,
};
