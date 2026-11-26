/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * HAND HISTORY PARSER — Multi-Site Poker Hand History Parser
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * Parses hand history files from major poker sites:
 *   - PokerStars (.txt)
 *   - GGPoker (.txt)
 *   - 888poker (.txt)
 *   - ACR / Winning Poker Network (.txt)
 *   - ClubGG (.txt)
 *   - Generic converter to internal format
 *
 * Internal Format (per hand):
 *   - id, site, gameType (NL/PL/FL), stakes, tableSize
 *   - players: [{ seat, name, stack, position }]
 *   - hero: { name, seat, holeCards }
 *   - streets: { preflop, flop, turn, river }
 *   - Each street: { board, actions: [{ player, action, amount }] }
 *   - result: { winners, pot, showdown }
 *   - variant honesty: variant, gameVariant, bettingStructure, supported,
 *     unsupportedReason. ONLY No-Limit Hold'em is `supported: true`; PLO4/5/6,
 *     Omaha Hi-Lo, Short Deck and limit/pot-limit Hold'em are tagged
 *     unsupported so no consumer can grade them against NLHE solver data.
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
    const source = String(text);
    const firstLines = source.substring(0, 500).toLowerCase();

    if (firstLines.includes('pokerstars')) return 'pokerstars';
    if (firstLines.includes('clubgg') || firstLines.includes('club gg')) return 'clubgg';
    if (firstLines.includes('ggpoker') || firstLines.includes('gg poker')) return 'ggpoker';
    if (/^\s*poker hand #(?:hd|tm|rc|om|sg|zm)\d+/im.test(source.substring(0, 1000))) return 'ggpoker';
    if (firstLines.includes('888poker') || firstLines.includes('pacific poker')) return '888poker';
    if (firstLines.includes('winamax')) return 'winamax';
    if (firstLines.includes('partypoker')) return 'partypoker';
    // ACR / Winning Poker Network: named, or the structural header
    // "Hand #123 - Holdem(No Limit) - $0.05/$0.10 - 2026/11/25 ..." that carries no brand.
    if (/americas?\s*cardroom|winning\s*poker\s*network|\bacr\s*poker\b|\bwpn\b/i.test(source.substring(0, 1000))) return 'acr';
    if (/^\s*(?:game\s+)?hand\s*#\d+\s*-\s*(?:tournament\s*#\d+\s*,?\s*-?\s*)?(?:holdem|hold'em|omaha)/im.test(source.substring(0, 1000))) return 'acr';

    return 'unknown';
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// VARIANT HONESTY
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Classify the game from a header line (any site) and the hero hole-card count.
 * Only No-Limit Hold'em returns `supported: true`. Everything else is tagged
 * with an explicit unsupported reason so the leak engine can never fabricate an
 * NLHE solver grade for it. A header that says Hold'em but a hero holding 4-6
 * cards is treated as the Omaha family (the cards are the harder evidence).
 *
 * @param {string} headerText
 * @param {number} [holeCount] hero hole cards seen (0 when unknown)
 * @param {{defaultBetting?: 'NL'|'PL'|'FL'|null}} [options]
 */
export function classifyGameVariant(headerText, holeCount = 0, options = {}) {
    const t = String(headerText || '');
    const cards = Number.isFinite(Number(holeCount)) ? Number(holeCount) : 0;
    const shortDeck = /short[\s-]*deck|6\s*\+|six[\s-]*plus/i.test(t);
    const omahaText = /omaha/i.test(t);
    const holdemText = /hold'?\s*em/i.test(t);
    const hiLo = /\bhi[\s\/-]*lo\b|\bhilo\b|\bh\/l\b|8[\s-]*or[\s-]*better/i.test(t);
    const betting = /no[\s-]*limit/i.test(t) ? 'NL'
        : /pot[\s-]*limit/i.test(t) ? 'PL'
        : /fixed[\s-]*limit|\blimit\b/i.test(t) ? 'FL'
        : (options?.defaultBetting || null);
    const base = { bettingStructure: betting };

    if (shortDeck) {
        return { ...base, variant: 'short_deck', gameVariant: 'short_deck', supported: false, unsupportedReason: 'short_deck_is_not_nlhe' };
    }
    if (omahaText || cards >= 4) {
        // A Hold'em header over a 4-6 card hand is a mislabelled pot-limit Omaha table.
        const potLimit = betting === 'PL' || betting === null || !omahaText;
        const gameVariant = hiLo ? 'omaha_hilo'
            : !potLimit ? 'omaha_non_pot_limit'
            : cards >= 6 ? 'plo6' : cards === 5 ? 'plo5' : 'plo4';
        return {
            ...base,
            variant: 'omaha',
            gameVariant,
            supported: false,
            unsupportedReason: hiLo ? 'omaha_hilo_is_not_nlhe' : 'omaha_family_is_not_nlhe',
        };
    }
    if (holdemText) {
        if (betting === 'NL') return { ...base, variant: 'holdem', gameVariant: 'nlhe', supported: true, unsupportedReason: null };
        if (betting === 'PL') return { ...base, variant: 'pot_limit_holdem', gameVariant: 'pot_limit_holdem', supported: false, unsupportedReason: 'pot_limit_holdem_is_not_nlhe' };
        if (betting === 'FL') return { ...base, variant: 'limit_holdem', gameVariant: 'limit_holdem', supported: false, unsupportedReason: 'limit_holdem_is_not_nlhe' };
        return { ...base, variant: 'holdem_unknown_structure', gameVariant: 'unknown', supported: false, unsupportedReason: 'betting_structure_unknown' };
    }
    return { ...base, variant: 'unknown', gameVariant: 'unknown', supported: false, unsupportedReason: 'unrecognized_game_variant' };
}

const _BETTING_TO_GAME_TYPE = { NL: 'NL', PL: 'PL', FL: 'FL' };

function _applyVariantInfo(hand, headerText, options = {}) {
    const info = classifyGameVariant(headerText, hand.hero?.holeCards?.length || 0, options);
    hand.variant = info.variant;
    hand.gameVariant = info.gameVariant;
    hand.bettingStructure = info.bettingStructure;
    hand.supported = info.supported;
    hand.unsupportedReason = info.unsupportedReason;
    if (info.bettingStructure && _BETTING_TO_GAME_TYPE[info.bettingStructure]) {
        hand.gameType = _BETTING_TO_GAME_TYPE[info.bettingStructure];
    }
    return hand;
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
        case 'acr':
            return parseACR(text, heroName);
        case 'clubgg':
            return parseClubGG(text, heroName);
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

function _parsePSHeader(line) {
    const idMatch = line.match(/Hand\s*#([A-Za-z]{0,3}\d+)/i);
    if (!idMatch) return null;
    // Game + betting structure must both be named (Hold'em / Omaha [Hi-Lo] ...).
    if (!/(Hold'?\s*em|Omaha)/i.test(line)) return null;
    if (!/(No[\s-]*Limit|Pot[\s-]*Limit|Limit)/i.test(line)) return null;
    return { id: idMatch[1], headerText: line };
}

function _stakesFromHeader(line) {
    // Strip dates first so "2026/11/25" can never be mistaken for blinds.
    const cleaned = String(line).replace(/\d{4}\/\d{1,2}\/\d{1,2}/g, ' ');
    const stakesMatch = cleaned.match(/\(?[$€£]?([\d.]+)\/[$€£]?([\d.]+)/);
    return stakesMatch ? `$${stakesMatch[1]}/$${stakesMatch[2]}` : '';
}

function _parsePSHand(block, heroName, opts = {}) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 5) return null;

    // Parse header: "PokerStars Hand #123456789: ..." (or an adapted site header)
    const header = opts.header || _parsePSHeader(lines[0]);
    if (!header) return null;
    const headerText = header.headerText || lines[0];
    const preliminary = classifyGameVariant(headerText, 0);

    const hand = {
        id: header.id,
        site: opts.site || 'pokerstars',
        variant: preliminary.variant,
        gameType: _BETTING_TO_GAME_TYPE[preliminary.bettingStructure] || 'FL',
        format: /(?:tournament|tourney|freeroll|sit\s*&\s*go|mtt|level\s+[ivx0-9]+)/i.test(headerText) ? 'tournament' : 'cash',
        stakes: '',
        tableSize: 0,
        buttonSeat: null,
        players: [],
        hero: null,
        streets: { preflop: { actions: [] }, flop: null, turn: null, river: null },
        result: { winners: [], pot: 0, showdown: false },
    };

    // Parse stakes
    hand.stakes = _stakesFromHeader(lines[0]);

    // Parse seats and players
    let currentStreet = 'preflop';
    let inSummary = false;

    for (const line of lines) {
        const buttonMatch = line.match(/Seat\s+#?(\d+)\s+is the button/i);
        if (buttonMatch) {
            hand.buttonSeat = parseInt(buttonMatch[1], 10);
            continue;
        }
        if (/^\*\*\*\s*SUMMARY\s*\*\*\*/i.test(line)) inSummary = true;
        // Seat line: "Seat 1: Player (2) (€1,000.50 in chips)". Anchor to the
        // trailing "(<currency><stack> ...)" group so parentheses inside a
        // player's name never truncate the name or corrupt the stack.
        const seatMatch = inSummary
            ? null
            : line.match(/^Seat\s+(\d+):\s+(.+?)\s+\(\s*[$€£]?([\d,]+(?:\.\d+)?)(?:\s+in chips)?[^()]*\)\s*$/i)
              || line.match(/^Seat\s+(\d+):\s+(.+?)\s+\(\s*[$€£]?([\d,]+(?:\.\d+)?)/);
        if (seatMatch) {
            hand.players.push({
                seat: parseInt(seatMatch[1], 10),
                name: seatMatch[2].trim(),
                stack: parseFloat(seatMatch[3].replace(/,/g, '')),
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
            const boardMatch = line.match(/\]\s*\[(.+?)\]/) || line.match(/\[(.+?)\]/);
            hand.streets.turn = {
                card: boardMatch ? _normalizeCard(boardMatch[1].trim()) : '',
                actions: [],
            };
            continue;
        }
        if (line.startsWith('*** RIVER ***')) {
            currentStreet = 'river';
            const boardMatch = line.match(/\]\s*\[(.+?)\]/) || line.match(/\[(.+?)\]/);
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

        // Action lines: "PlayerName: raises €5 to €1,000.50"
        const actionMatch = line.match(/^(.+?):\s+(folds|checks|calls|bets|raises)(?:\s+[$€£]?([\d,]+(?:\.\d+)?))?(?:\s+to\s+[$€£]?([\d,]+(?:\.\d+)?))?/i);
        if (actionMatch && hand.streets[currentStreet]) {
            const rawAmt = actionMatch[4] || actionMatch[3];
            hand.streets[currentStreet].actions.push({
                player: actionMatch[1],
                action: _normalizeAction(actionMatch[2]),
                amount: rawAmt ? parseFloat(rawAmt.replace(/,/g, '')) || 0 : 0,
                isHero: actionMatch[1] === heroName,
            });
            continue;
        }

        // Result: "PlayerName collected €1,015.50 from pot"
        const winMatch = line.match(/^(.+?)\s+collected\s+[$€£]?([\d,]+(?:\.\d+)?)/);
        if (winMatch) {
            const winAmt = parseFloat(winMatch[2].replace(/,/g, '')) || 0;
            hand.result.winners.push({ name: winMatch[1], amount: winAmt });
            hand.result.pot = Math.max(hand.result.pot, winAmt);
        }

        // Total pot
        const potMatch = line.match(/^Total pot\s+[$€£]?([\d,]+(?:\.\d+)?)/);
        if (potMatch) hand.result.pot = parseFloat(potMatch[1].replace(/,/g, '')) || 0;
    }

    hand.tableSize = hand.players.length;
    _assignPositions(hand);
    // Variant honesty needs the hero card count, so it is settled last.
    _applyVariantInfo(hand, headerText);

    return hand;
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// GGPOKER PARSER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function parseGGPoker(text, heroName) {
    const hands = [];
    const handBlocks = text.split(/\n\s*\n+(?=Poker Hand)/i).filter(b => b.trim());

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

    return _parsePSHand(adapted, heroName, { site: 'ggpoker' });
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// ACR / WINNING POKER NETWORK + CLUBGG PARSERS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
//
// Both sites write the PokerStars layout (Seat lines, *** HOLE CARDS ***,
// Dealt to Hero [Ah Kd]) but ACR/WPN omits the colon after the player name
// ("Villain raises to $0.30") and both may use thousands separators. The block
// is normalized into the PokerStars action shape using the names read from the
// Seat lines (names may contain spaces), then parsed by the SAME canonical
// parser so every site yields the identical hand object.

function _normalizeColonlessBlock(block) {
    const text = String(block).replace(/\r/g, '').replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
    const rawLines = text.split('\n');
    const names = [];
    for (const line of rawLines) {
        const m = line.trim().match(/^Seat\s+\d+:\s+(.+?)\s+\(\s*[$€£]?[\d.]+(?:\s+in chips)?[^()]*\)\s*$/i)
            || line.trim().match(/^Seat\s+\d+:\s+(.+?)\s+\(\s*[$€£]?[\d.]+/);
        if (m && !names.includes(m[1].trim())) names.push(m[1].trim());
    }
    names.sort((a, b) => b.length - a.length);

    let inSummary = false;
    const out = rawLines.map(line => {
        const t = line.trim();
        if (/^\*\*\*\s*SUMMARY/i.test(t)) inSummary = true;
        // Anchor structural lines strictly so player names like "Boardman",
        // "TableTennis", or "Seaton" are never dropped as system lines.
        if (
            !t
            || inSummary
            || t.startsWith('***')
            || /^(?:Seat\s+\d+:|Table\s+'|Dealt to\s+|Total pot\s+|Board\s+\[|Uncalled bet\s+\()/i.test(t)
        ) return line;
        const name = names.find(n => t.startsWith(`${n} `));
        if (!name) return line; // already "Name: action", a header, or an unknown line
        const rest = t.slice(name.length).trim();
        if (/^(?:folds|checks|calls|bets|raises)\b/i.test(rest)) return `${name}: ${rest}`;
        const win = rest.match(/^(?:collected|wins)\b[^\d]*([\d.]+)/i);
        if (win) return `${name} collected $${win[1]} from pot`;
        return line;
    });
    return out.join('\n');
}

function _parseWpnStyleHeader(line) {
    if (!line) return null;
    const idMatch = line.match(/Hand\s*#([A-Za-z]{0,3}\d+)/i);
    if (!idMatch) return null;
    if (!/(Hold'?\s*em|Omaha)/i.test(line)) return null;
    return { id: idMatch[1], headerText: line };
}

function _parseWpnStyleHands(text, heroName, { site, splitter }) {
    const hands = [];
    const blocks = String(text).replace(/\r/g, '').split(splitter).filter(b => b.trim());
    for (const block of blocks) {
        try {
            const normalized = _normalizeColonlessBlock(block);
            const firstLine = normalized.split('\n').map(l => l.trim()).find(Boolean);
            const header = _parseWpnStyleHeader(firstLine);
            if (!header) continue;
            const hand = _parsePSHand(normalized, heroName, { site, header });
            if (hand) hands.push(hand);
        } catch (e) {
            console.warn(`Failed to parse ${site} hand:`, e?.message || e);
        }
    }
    return hands;
}

/** ACR / Winning Poker Network: "Hand #123 - Holdem(No Limit) - $0.05/$0.10 - 2026/11/25 ..." */
export function parseACR(text, heroName) {
    return _parseWpnStyleHands(text, heroName, {
        site: 'acr',
        splitter: /\n\s*\n+(?=(?:Game\s+)?Hand\s*#)/i,
    });
}

/** ClubGG: "ClubGG Hand #123: Hold'em No Limit ($0.50/$1.00) - ..." */
export function parseClubGG(text, heroName) {
    return _parseWpnStyleHands(text, heroName, {
        site: 'clubgg',
        splitter: /\n\s*\n+(?=(?:ClubGG\s+)?(?:Poker\s+)?Hand\s*#)/i,
    });
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
        variant: /omaha/i.test(block) ? 'omaha' : 'holdem',
        gameType: 'NL',
        format: /tournament|sit\s*&?\s*go/i.test(block) ? 'tournament' : 'cash',
        stakes: '',
        tableSize: 0,
        buttonSeat: null,
        players: [],
        hero: null,
        streets: { preflop: { actions: [] }, flop: null, turn: null, river: null },
        result: { winners: [], pot: 0, showdown: false },
    };

    let currentStreet = 'preflop';

    for (const line of lines) {
        const buttonMatch = line.match(/Seat\s+#?(\d+)\s+is the button/i);
        if (buttonMatch) hand.buttonSeat = parseInt(buttonMatch[1], 10);
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

        const actionMatch = line.match(/^(.+?)\s+(folds|checks|calls|bets|raises)(?:\s*\[?\$?([\d.]+)\]?)?(?:\s+to\s+\$?([\d.]+))?/i);
        if (actionMatch && hand.streets[currentStreet] && !line.startsWith('Seat') && !line.startsWith('**')) {
            hand.streets[currentStreet].actions.push({
                player: actionMatch[1].trim(),
                action: _normalizeAction(actionMatch[2]),
                amount: parseFloat(actionMatch[4] || actionMatch[3]) || 0,
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
    // 888 prints "No Limit Holdem" / "Pot Limit Omaha" in the table header; absent
    // an explicit structure the legacy 888 default (No Limit) is kept.
    _applyVariantInfo(hand, block.slice(0, 600), { defaultBetting: 'NL' });
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
    const fromButton = n === 2 ? ['BTN', 'BB']
        : n === 3 ? ['BTN', 'SB', 'BB']
        : n === 4 ? ['BTN', 'SB', 'BB', 'CO']
        : n === 5 ? ['BTN', 'SB', 'BB', 'UTG', 'CO']
        : n === 6 ? ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO']
        : n === 7 ? ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'HJ', 'CO']
        : n === 8 ? ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO']
        : ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'];

    const ordered = [...hand.players].sort((a, b) => a.seat - b.seat);
    const buttonIndex = ordered.findIndex(p => Number(p.seat) === Number(hand.buttonSeat));
    if (buttonIndex < 0) {
        // Seat order without the actual button is not a poker position. Leave
        // it unknown so downstream solver matching cannot grade the wrong node.
        for (const player of hand.players) player.position = '';
    } else {
        const clockwise = [...ordered.slice(buttonIndex), ...ordered.slice(0, buttonIndex)];
        for (let i = 0; i < clockwise.length; i++) {
            clockwise[i].position = fromButton[i] || '';
        }
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
    // Variant honesty: a hand explicitly tagged unsupported (PLO, Omaha Hi-Lo,
    // Short Deck, limit/pot-limit Hold'em) has no No-Limit Hold'em decision
    // points. Returning none keeps the audit from grading it against NLHE data.
    if (hand.supported === false) return [];

    const points = [];
    const streets = ['preflop', 'flop', 'turn', 'river'];
    const heroIdPresent = hand.hero.id !== null && hand.hero.id !== undefined && String(hand.hero.id) !== '';
    const heroNameLower = String(hand.hero.name || '').trim().toLowerCase();
    const opponents = (hand.players || []).filter(player => {
        if (heroIdPresent && player?.id !== null && player?.id !== undefined && String(player.id) !== '') {
            return String(player.id) !== String(hand.hero.id);
        }
        if (heroNameLower && player?.name) {
            return String(player.name).trim().toLowerCase() !== heroNameLower;
        }
        return true;
    });
    const foldedKeys = new Set();
    const completedActions = [];

    const playerKey = (entry) => {
        if (entry?.playerId !== null && entry?.playerId !== undefined && String(entry.playerId) !== '') {
            return `id:${String(entry.playerId)}`;
        }
        if (entry?.id !== null && entry?.id !== undefined && String(entry.id) !== '') {
            return `id:${String(entry.id)}`;
        }
        if (entry?.position) return `pos:${String(entry.position).toUpperCase()}`;
        if (entry?.player || entry?.name) return `name:${String(entry.player || entry.name).trim().toLowerCase()}`;
        return null;
    };

    for (const streetName of streets) {
        const streetData = hand.streets[streetName];
        if (!streetData) continue;

        for (let actionIndex = 0; actionIndex < streetData.actions.length; actionIndex++) {
            const action = streetData.actions[actionIndex];
            if (!action.isHero && action.action === 'fold') {
                const key = playerKey(action);
                if (key) foldedKeys.add(key);
                if (action.position) foldedKeys.add(`pos:${String(action.position).toUpperCase()}`);
                continue;
            }
            if (action.isHero) {
                const activeOpponents = opponents.filter(opp => {
                    const idKey = opp?.id !== null && opp?.id !== undefined && String(opp.id) !== ''
                        ? `id:${String(opp.id)}`
                        : null;
                    const posKey = opp?.position ? `pos:${String(opp.position).toUpperCase()}` : null;
                    const nameKey = opp?.name ? `name:${String(opp.name).trim().toLowerCase()}` : null;
                    return !(
                        (idKey && foldedKeys.has(idKey))
                        || (posKey && foldedKeys.has(posKey))
                        || (nameKey && foldedKeys.has(nameKey))
                    );
                });
                const prior = streetData.actions.slice(0, actionIndex);
                const isAggro = (a) => a.action === 'raise' || a.action === 'bet' || a.action === 'allin';
                const priorRaises = prior.filter(isAggro);
                const heroPriorRaises = priorRaises.filter(a => a.isHero);
                const callsAfterRaise = priorRaises.length > 0
                    ? prior.slice(prior.lastIndexOf(priorRaises[priorRaises.length - 1]) + 1)
                        .filter(a => a.action === 'call' && !a.isHero).length
                    : 0;
                let nodeClass;
                if (streetName === 'preflop') {
                    if (priorRaises.length === 0) nodeClass = 'preflop_open';
                    else if (heroPriorRaises.length > 0) nodeClass = 'preflop_4bet';
                    else if (callsAfterRaise > 0) nodeClass = 'preflop_squeeze';
                    else nodeClass = 'preflop_facing_raise';
                } else {
                    const lastHeroIndex = prior.map(a => a.isHero).lastIndexOf(true);
                    const sinceHero = prior.slice(lastHeroIndex + 1);
                    nodeClass = sinceHero.some(a => !a.isHero && isAggro(a))
                        ? 'hero_faces_bet'
                        : 'hero_bets_or_checks';
                }
                points.push({
                    street: streetName,
                    board: getBoardAtStreet(hand, streetName),
                    holeCards: hand.hero.holeCards,
                    action: action.action,
                    amount: action.amount,
                    amountBB: action.amountBB,
                    potBeforeBB: action.potBeforeBB,
                    sizingPct: action.sizingPct,
                    position: hand.hero.position,
                    nodeClass,
                    villainPosition: [...prior].reverse()
                        .find(a => !a.isHero && isAggro(a))?.position
                        || (activeOpponents.length === 1 ? activeOpponents[0].position : '')
                        || '',
                    priorActions: [...completedActions, ...prior].map(priorAction => ({
                        street: priorAction.street || streetName,
                        position: priorAction.position,
                        action: priorAction.action,
                        sizingPct: priorAction.sizingPct,
                    })),
                });
            }
        }
        completedActions.push(...streetData.actions.map(streetAction => ({
            ...streetAction,
            street: streetName,
        })));
    }

    return points;
}

export default {
    parseHandHistory,
    detectSite,
    parsePokerStars,
    parseGGPoker,
    parse888Poker,
    parseACR,
    parseClubGG,
    classifyGameVariant,
    getBoardAtStreet,
    getHeroDecisionPoints,
};
