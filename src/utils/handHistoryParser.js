/**
 * 🔍 Hand History Parser — Parse poker hand histories from major sites
 * ═══════════════════════════════════════════════════════════════════════════
 * Supports: PokerStars, GGPoker, ClubGG, generic formats
 * Extracts: positions, actions, board cards, pot sizes, stack depths
 * ═══════════════════════════════════════════════════════════════════════════
 */

const POSITION_NAMES = ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

// Map seat names to standard positions based on player count
function mapSeatToPosition(seatName, totalPlayers) {
    const name = seatName?.toUpperCase()?.trim();
    if (POSITION_NAMES.includes(name)) return name;

    // Common aliases
    const aliases = {
        'SMALL BLIND': 'SB', 'BIG BLIND': 'BB', 'BUTTON': 'BTN',
        'DEALER': 'BTN', 'CUTOFF': 'CO', 'HIJACK': 'HJ',
        'UNDER THE GUN': 'UTG', 'LOJACK': 'HJ',
    };
    if (aliases[name]) return aliases[name];

    return name || 'UNK';
}

// Parse a PokerStars hand history
function parsePokerStarsHand(text) {
    const hand = {
        site: 'PokerStars',
        handId: null,
        gameType: 'cash', // cash or tournament
        stakes: '',
        players: [],
        heroName: null,
        heroPosition: null,
        heroCards: [],
        board: { flop: [], turn: null, river: null },
        streets: [], // { street, actions: [{ player, action, amount, position }] }
        pot: 0,
        rake: 0,
    };

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let currentStreet = 'preflop';
    let heroSet = false;

    for (const line of lines) {
        // Hand ID
        const handIdMatch = line.match(/Hand #(\d+)/);
        if (handIdMatch) hand.handId = handIdMatch[1];

        // Game type
        if (line.includes('Tournament')) hand.gameType = 'tournament';

        // Stakes
        const stakesMatch = line.match(/\$?([\d.]+)\/\$?([\d.]+)/);
        if (stakesMatch) hand.stakes = `${stakesMatch[1]}/${stakesMatch[2]}`;

        // Seat info
        const seatMatch = line.match(/^Seat (\d+): (.+?) \(\$?([\d,.]+)/);
        if (seatMatch) {
            hand.players.push({
                seat: parseInt(seatMatch[1]),
                name: seatMatch[2].trim(),
                stack: parseFloat(seatMatch[3].replace(',', '')),
            });
        }

        // Button position
        const btnMatch = line.match(/Seat #(\d+) is the button/);
        if (btnMatch) {
            const btnSeat = parseInt(btnMatch[1]);
            // Assign positions based on button placement
            const btnIdx = hand.players.findIndex(p => p.seat === btnSeat);
            if (btnIdx >= 0) {
                const n = hand.players.length;
                const posMap = n <= 3 ? ['BTN', 'SB', 'BB'] :
                    n <= 6 ? ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].slice(6 - n) :
                        ['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB'].slice(9 - n);
                hand.players.forEach((p, i) => {
                    const relIdx = (i - btnIdx + n) % n;
                    // BTN is relIdx 0, SB is 1, BB is 2, etc.
                    const posMapAdjusted = ['BTN', 'SB', 'BB', ...posMap.filter(p => !['BTN', 'SB', 'BB'].includes(p))];
                    p.position = posMapAdjusted[relIdx] || `Seat${p.seat}`;
                });
            }
        }

        // Hero cards
        const holeMatch = line.match(/^Dealt to (.+?) \[(.+?)\]/);
        if (holeMatch) {
            hand.heroName = holeMatch[1].trim();
            hand.heroCards = holeMatch[2].split(' ').map(c => c.trim());
            const heroPlayer = hand.players.find(p => p.name === hand.heroName);
            if (heroPlayer) hand.heroPosition = heroPlayer.position;
            heroSet = true;
        }

        // Street markers
        if (line.startsWith('*** FLOP ***')) {
            currentStreet = 'flop';
            const boardMatch = line.match(/\[(.+?)\]/);
            if (boardMatch) hand.board.flop = boardMatch[1].split(' ').map(c => c.trim());
        } else if (line.startsWith('*** TURN ***')) {
            currentStreet = 'turn';
            const turnMatch = line.match(/\] \[(.+?)\]/);
            if (turnMatch) hand.board.turn = turnMatch[1].trim();
        } else if (line.startsWith('*** RIVER ***')) {
            currentStreet = 'river';
            const riverMatch = line.match(/\] \[(.+?)\]/);
            if (riverMatch) hand.board.river = riverMatch[1].trim();
        }

        // Actions
        const actionMatch = line.match(/^(.+?): (folds|checks|calls|bets|raises)(?: \$?([\d,.]+))?(?: to \$?([\d,.]+))?/);
        if (actionMatch) {
            const playerName = actionMatch[1].trim();
            const actionType = actionMatch[2].toLowerCase();
            const amount = actionMatch[3] ? parseFloat(actionMatch[3].replace(',', '')) : 0;
            const toAmount = actionMatch[4] ? parseFloat(actionMatch[4].replace(',', '')) : 0;
            const player = hand.players.find(p => p.name === playerName);

            const action = {
                player: playerName,
                position: player?.position || 'UNK',
                action: actionType === 'folds' ? 'fold' :
                    actionType === 'checks' ? 'check' :
                        actionType === 'calls' ? 'call' :
                            actionType === 'bets' ? 'bet' :
                                actionType === 'raises' ? 'raise' : actionType,
                amount: toAmount || amount,
                isHero: playerName === hand.heroName,
                street: currentStreet,
            };

            // Find or create street entry
            let streetEntry = hand.streets.find(s => s.street === currentStreet);
            if (!streetEntry) {
                streetEntry = { street: currentStreet, actions: [] };
                hand.streets.push(streetEntry);
            }
            streetEntry.actions.push(action);
        }

        // Pot
        const potMatch = line.match(/Total pot \$?([\d,.]+)/);
        if (potMatch) hand.pot = parseFloat(potMatch[1].replace(',', ''));

        // Rake
        const rakeMatch = line.match(/Rake \$?([\d,.]+)/);
        if (rakeMatch) hand.rake = parseFloat(rakeMatch[1].replace(',', ''));
    }

    return hand;
}

// Parse multiple hands from a text block
export function parseHandHistories(text) {
    if (!text || text.trim().length === 0) return [];

    // Split by hand markers
    const handBlocks = text.split(/(?=PokerStars|Hand #|888poker|GGPoker)/g)
        .filter(b => b.trim().length > 50);

    const hands = [];
    for (const block of handBlocks) {
        try {
            const parsed = parsePokerStarsHand(block);
            if (parsed.handId && parsed.heroCards.length >= 2) {
                hands.push(parsed);
            }
        } catch (e) {
            console.warn('[Parser] Failed to parse hand block:', e.message);
        }
    }

    return hands;
}

// Convert hero cards to hand notation (e.g., ["As", "Kh"] → "AKo")
export function cardsToNotation(cards) {
    if (!cards || cards.length < 2) return null;
    const r1 = cards[0][0].toUpperCase();
    const r2 = cards[1][0].toUpperCase();
    const s1 = cards[0][1];
    const s2 = cards[1][1];
    const ranks = 'AKQJT98765432';
    const i1 = ranks.indexOf(r1);
    const i2 = ranks.indexOf(r2);
    if (i1 < 0 || i2 < 0) return null;

    if (r1 === r2) return r1 + r2; // Pair
    if (s1 === s2) return (i1 < i2 ? r1 + r2 : r2 + r1) + 's';
    return (i1 < i2 ? r1 + r2 : r2 + r1) + 'o';
}

// Get hero decisions for GTO comparison
export function getHeroDecisions(hand) {
    const decisions = [];
    for (const streetEntry of hand.streets) {
        const heroActions = streetEntry.actions.filter(a => a.isHero);
        for (const action of heroActions) {
            decisions.push({
                street: streetEntry.street,
                action: action.action,
                amount: action.amount,
                position: hand.heroPosition,
                board: streetEntry.street === 'preflop' ? [] :
                    streetEntry.street === 'flop' ? [...hand.board.flop] :
                        streetEntry.street === 'turn' ? [...hand.board.flop, hand.board.turn] :
                            [...hand.board.flop, hand.board.turn, hand.board.river].filter(Boolean),
                heroCards: hand.heroCards,
                handNotation: cardsToNotation(hand.heroCards),
            });
        }
    }
    return decisions;
}
