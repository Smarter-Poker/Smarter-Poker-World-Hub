/**
 * Hand History Parser v2.0 (Phase 355)
 * ═══════════════════════════════════════════════════════════════════════════
 * Full-featured parser supporting PokerStars, GGPoker, Ignition, 888poker,
 * and WPN/ACR formats. Extracts hero cards, board, pot, villains, positions,
 * street-by-street actions, and converts to GTO training questions.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══ POSITION MAPS ═══
const POSITION_ALIASES = {
    'small blind': 'SB', 'big blind': 'BB', 'under the gun': 'UTG',
    'utg': 'UTG', 'utg+1': 'UTG1', 'utg+2': 'UTG2',
    'lojack': 'LJ', 'hijack': 'HJ', 'cutoff': 'CO',
    'button': 'BTN', 'dealer': 'BTN', 'btn': 'BTN',
    'sb': 'SB', 'bb': 'BB', 'co': 'CO', 'hj': 'HJ', 'lj': 'LJ',
    'mp': 'MP', 'mp1': 'MP', 'mp2': 'MP2', 'mp3': 'MP3',
    'ep': 'UTG', 'ep1': 'UTG', 'ep2': 'UTG1',
};

const CARD_RE = /[2-9TJQKA][shdc]/gi;

// Enforce case standard: "ah" → "Ah"
const fmtCard = (c) => c ? c.charAt(0).toUpperCase() + c.charAt(1).toLowerCase() : null;

/**
 * Detect the hand history format from raw text
 */
export function detectFormat(rawText) {
    if (!rawText) return 'unknown';
    if (rawText.includes('PokerStars')) return 'pokerstars';
    if (rawText.includes('GGPoker') || rawText.includes('GG Network') || rawText.includes('Natural8')) return 'ggpoker';
    if (rawText.includes('Ignition') || rawText.includes('Bovada') || rawText.includes('Bodog')) return 'ignition';
    if (rawText.includes('888poker') || rawText.includes('Pacific Poker')) return '888poker';
    if (rawText.includes('WPN') || rawText.includes('Americas Cardroom') || rawText.includes('ACR')) return 'wpn';
    if (rawText.includes('PartyPoker') || rawText.includes('partypoker')) return 'partypoker';
    if (/Dealt to .+? \[/.test(rawText)) return 'pokerstars'; // generic PS-style
    return 'unknown';
}

/**
 * Parse blinds/stakes from hand history header
 */
function parseBlinds(rawText) {
    // PokerStars: "($0.50/$1.00 USD)" or "(€0.25/€0.50)"
    const psMatch = rawText.match(/\([\$€£]?([\d.]+)\/[\$€£]?([\d.]+)(?:\s*USD)?\)/);
    if (psMatch) return { sb: parseFloat(psMatch[1]), bb: parseFloat(psMatch[2]) };

    // GGPoker: "Blinds $0.50/$1.00" or "NL Hold'em $0.25/$0.50"
    const ggMatch = rawText.match(/[\$€£]([\d.]+)\/[\$€£]([\d.]+)/);
    if (ggMatch) return { sb: parseFloat(ggMatch[1]), bb: parseFloat(ggMatch[2]) };

    // Tournament: "Level X (100/200)"
    const tournMatch = rawText.match(/Level\s+\w+\s*\((\d+)\/(\d+)\)/i);
    if (tournMatch) return { sb: parseInt(tournMatch[1]), bb: parseInt(tournMatch[2]) };

    return { sb: 0.5, bb: 1 }; // default
}

/**
 * Parse player seats and stacks
 */
function parseSeats(rawText, format) {
    const seats = [];

    if (format === 'ggpoker') {
        // GGPoker: "Seat 1: Player123 ($100.50 in chips)"
        const re = /Seat (\d+): (.+?) \([\$€£]?([\d,]+\.?\d*) in chips\)/gi;
        let m;
        while ((m = re.exec(rawText)) !== null) {
            seats.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseFloat(m[3].replace(/,/g, '')) });
        }
    } else {
        // PokerStars/standard: "Seat 1: Player ($100 in chips)"
        const re = /Seat (\d+): (.+?) \([\$€£]?([\d,]+\.?\d*) in chips\)/gi;
        let m;
        while ((m = re.exec(rawText)) !== null) {
            seats.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseFloat(m[3].replace(/,/g, '')) });
        }
    }

    return seats;
}

/**
 * Detect button seat and assign positions
 */
function assignPositions(seats, rawText, numPlayers) {
    // Find button
    let btnSeat = -1;
    const btnMatch = rawText.match(/Seat #?(\d+) is the button/i)
        || rawText.match(/(\w+) has the dealer button/i);

    if (btnMatch) {
        if (/^\d+$/.test(btnMatch[1])) {
            btnSeat = parseInt(btnMatch[1]);
        } else {
            const btnPlayer = seats.find(s => s.name === btnMatch[1]);
            if (btnPlayer) btnSeat = btnPlayer.seat;
        }
    }

    // Sort seats by seat number
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    const btnIdx = sorted.findIndex(s => s.seat === btnSeat);

    // Assign positions based on number of players
    const posOrder2 = ['BTN', 'BB'];
    const posOrder3 = ['BTN', 'SB', 'BB'];
    const posOrder4 = ['BTN', 'SB', 'BB', 'UTG'];
    const posOrder5 = ['BTN', 'SB', 'BB', 'UTG', 'CO'];
    const posOrder6 = ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'];
    const posOrder7 = ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'MP', 'CO'];
    const posOrder8 = ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'MP', 'HJ', 'CO'];
    const posOrder9 = ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'MP', 'HJ', 'CO'];

    const orders = { 2: posOrder2, 3: posOrder3, 4: posOrder4, 5: posOrder5, 6: posOrder6, 7: posOrder7, 8: posOrder8, 9: posOrder9 };
    const posOrder = orders[Math.min(sorted.length, 9)] || posOrder6;

    if (btnIdx >= 0) {
        sorted.forEach((s, i) => {
            const offset = (i - btnIdx + sorted.length) % sorted.length;
            s.position = posOrder[offset] || 'MP';
        });
    } else {
        sorted.forEach((s, i) => {
            s.position = posOrder[i] || 'MP';
        });
    }

    return sorted;
}

/**
 * Parse street actions from raw text
 */
function parseStreetActions(rawText, heroName, bbSize) {
    const streets = { preflop: [], flop: [], turn: [], river: [] };
    let currentStreet = 'preflop';

    const lines = rawText.split('\n').map(l => l.trim());

    for (const line of lines) {
        // Detect street changes
        if (/\*\*\* FLOP \*\*\*/i.test(line) || /--- FLOP ---/i.test(line)) { currentStreet = 'flop'; continue; }
        if (/\*\*\* TURN \*\*\*/i.test(line) || /--- TURN ---/i.test(line)) { currentStreet = 'turn'; continue; }
        if (/\*\*\* RIVER \*\*\*/i.test(line) || /--- RIVER ---/i.test(line)) { currentStreet = 'river'; continue; }
        if (/\*\*\* (SHOW DOWN|SUMMARY) \*\*\*/i.test(line)) break;

        // Parse actions
        const foldMatch = line.match(/^(.+?):\s*folds/i);
        if (foldMatch) {
            streets[currentStreet].push({ player: foldMatch[1].trim(), action: 'fold', amount: 0 });
            continue;
        }

        const checkMatch = line.match(/^(.+?):\s*checks/i);
        if (checkMatch) {
            streets[currentStreet].push({ player: checkMatch[1].trim(), action: 'check', amount: 0 });
            continue;
        }

        const callMatch = line.match(/^(.+?):\s*calls\s+[\$€£]?([\d,]+\.?\d*)/i);
        if (callMatch) {
            streets[currentStreet].push({ player: callMatch[1].trim(), action: 'call', amount: parseFloat(callMatch[2].replace(/,/g, '')) });
            continue;
        }

        const betMatch = line.match(/^(.+?):\s*bets\s+[\$€£]?([\d,]+\.?\d*)/i);
        if (betMatch) {
            streets[currentStreet].push({ player: betMatch[1].trim(), action: 'bet', amount: parseFloat(betMatch[2].replace(/,/g, '')) });
            continue;
        }

        const raiseMatch = line.match(/^(.+?):\s*raises\s+[\$€£]?([\d,]+\.?\d*)\s+to\s+[\$€£]?([\d,]+\.?\d*)/i);
        if (raiseMatch) {
            streets[currentStreet].push({ player: raiseMatch[1].trim(), action: 'raise', amount: parseFloat(raiseMatch[3].replace(/,/g, '')) });
            continue;
        }

        // GGPoker "Raises" with different format
        const ggRaiseMatch = line.match(/^(.+?):\s*Raises?\s+[\$€£]?([\d,]+\.?\d*)\s+to\s+[\$€£]?([\d,]+\.?\d*)/i);
        if (ggRaiseMatch) {
            streets[currentStreet].push({ player: ggRaiseMatch[1].trim(), action: 'raise', amount: parseFloat(ggRaiseMatch[3].replace(/,/g, '')) });
            continue;
        }

        // All-in
        const allinMatch = line.match(/^(.+?):\s*(?:bets|raises|calls).*?and is all-in/i);
        if (allinMatch) {
            const existingAction = streets[currentStreet].find(a => a.player === allinMatch[1].trim());
            if (existingAction) existingAction.allIn = true;
            continue;
        }

        // Posts blind
        const blindMatch = line.match(/^(.+?):\s*posts\s+(?:small|big)?\s*blind\s+[\$€£]?([\d,]+\.?\d*)/i);
        if (blindMatch) {
            streets[currentStreet].push({ player: blindMatch[1].trim(), action: 'blind', amount: parseFloat(blindMatch[2].replace(/,/g, '')) });
        }
    }

    return streets;
}

/**
 * Main parser: extracts full hand data from raw text
 */
export function parseHandHistory(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const format = detectFormat(rawText);

    const result = {
        format,
        heroHand: { card1: null, card2: null },
        heroCards: [],
        board: { flop: [], turn: null, river: null },
        allBoardCards: [],
        potSize: 0,
        villains: [],
        heroPosition: 'UNK',
        villainPosition: 'UNK',
        heroStack: 100,
        blinds: { sb: 0.5, bb: 1 },
        seats: [],
        streetActions: { preflop: [], flop: [], turn: [], river: [] },
        numPlayers: 0,
        isTournament: false,
        success: false,
        error: null,
    };

    try {
        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        let heroName = 'Hero';

        // Detect tournament
        result.isTournament = /tournament/i.test(rawText) || /tourney/i.test(rawText);

        // Parse blinds
        result.blinds = parseBlinds(rawText);
        const bbSize = result.blinds.bb || 1;

        // Parse seats
        result.seats = parseSeats(rawText, format);
        result.numPlayers = result.seats.length || 6;

        // Assign positions
        if (result.seats.length > 0) {
            result.seats = assignPositions(result.seats, rawText, result.numPlayers);
        }

        // ═══ 1. Find Hero Cards ═══

        // PokerStars: "Dealt to HeroName [Ah Kd]"
        const dealtMatch = rawText.match(/Dealt to (.*?) \[([2-9TJQKA][shdc]) ([2-9TJQKA][shdc])\]/i);
        if (dealtMatch) {
            heroName = dealtMatch[1].trim();
            result.heroHand.card1 = fmtCard(dealtMatch[2]);
            result.heroHand.card2 = fmtCard(dealtMatch[3]);
        }

        // GGPoker: "Dealt to Hero [Ah Kd]" (same format typically)
        if (!result.heroHand.card1 && format === 'ggpoker') {
            const ggDealt = rawText.match(/Dealt to (.+?) \[([2-9TJQKA][shdc])\s+([2-9TJQKA][shdc])\]/i);
            if (ggDealt) {
                heroName = ggDealt[1].trim();
                result.heroHand.card1 = fmtCard(ggDealt[2]);
                result.heroHand.card2 = fmtCard(ggDealt[3]);
            }
        }

        // Ignition/Bovada: anonymous, "Hero [Ah Kd]" or "Me [Ah Kd]"
        if (!result.heroHand.card1) {
            const ignMatch = rawText.match(/(?:Hero|Me|You) \[([2-9TJQKA][shdc])\s+([2-9TJQKA][shdc])\]/i);
            if (ignMatch) {
                result.heroHand.card1 = fmtCard(ignMatch[1]);
                result.heroHand.card2 = fmtCard(ignMatch[2]);
            }
        }

        // 888poker: "Dealt to HeroName [ Ah, Kd ]"
        if (!result.heroHand.card1 && format === '888poker') {
            const eightMatch = rawText.match(/Dealt to (.+?) \[\s*([2-9TJQKA][shdc]),?\s*([2-9TJQKA][shdc])\s*\]/i);
            if (eightMatch) {
                heroName = eightMatch[1].trim();
                result.heroHand.card1 = fmtCard(eightMatch[2]);
                result.heroHand.card2 = fmtCard(eightMatch[3]);
            }
        }

        result.heroCards = [result.heroHand.card1, result.heroHand.card2].filter(Boolean);

        // ═══ 2. Find Board Cards ═══

        // PokerStars/GG: "*** FLOP *** [7h 2c 5d]"
        const flopMatch = rawText.match(/\*\*\* FLOP \*\*\* \[([2-9TJQKA][shdc])\s+([2-9TJQKA][shdc])\s+([2-9TJQKA][shdc])\]/i)
            || rawText.match(/Flop:\s*\[([2-9TJQKA][shdc]),?\s*([2-9TJQKA][shdc]),?\s*([2-9TJQKA][shdc])\]/i)
            || rawText.match(/FLOP\s*\[([2-9TJQKA][shdc])\s+([2-9TJQKA][shdc])\s+([2-9TJQKA][shdc])\]/i);
        if (flopMatch) {
            result.board.flop = [fmtCard(flopMatch[1]), fmtCard(flopMatch[2]), fmtCard(flopMatch[3])];
        }

        const turnMatch = rawText.match(/\*\*\* TURN \*\*\*.*?\[([2-9TJQKA][shdc])\]\s*$/im)
            || rawText.match(/\*\*\* TURN \*\*\*.*\[.*?\]\s*\[([2-9TJQKA][shdc])\]/i)
            || rawText.match(/Turn:\s*.*?\[([2-9TJQKA][shdc])\]/i);
        if (turnMatch) {
            result.board.turn = fmtCard(turnMatch[1]);
        }

        const riverMatch = rawText.match(/\*\*\* RIVER \*\*\*.*?\[([2-9TJQKA][shdc])\]\s*$/im)
            || rawText.match(/\*\*\* RIVER \*\*\*.*\[.*?\]\s*\[([2-9TJQKA][shdc])\]/i)
            || rawText.match(/River:\s*.*?\[([2-9TJQKA][shdc])\]/i);
        if (riverMatch) {
            result.board.river = fmtCard(riverMatch[1]);
        }

        // Build allBoardCards
        result.allBoardCards = [...result.board.flop];
        if (result.board.turn) result.allBoardCards.push(result.board.turn);
        if (result.board.river) result.allBoardCards.push(result.board.river);

        // ═══ 3. Pot Size ═══
        const potMatch = rawText.match(/Total pot [\$€£]?([\d,]+\.?\d*)/i)
            || rawText.match(/Total Pot:\s*[\$€£]?([\d,]+\.?\d*)/i)
            || rawText.match(/Pot:\s*[\$€£]?([\d,]+\.?\d*)/i);
        if (potMatch) {
            result.potSize = parseFloat((parseFloat(potMatch[1].replace(/,/g, '')) / bbSize).toFixed(1));
        }

        // ═══ 4. Hero Position ═══
        const heroSeat = result.seats.find(s => s.name === heroName);
        if (heroSeat?.position) {
            result.heroPosition = heroSeat.position;
            result.heroStack = Math.round((heroSeat.stack || 100) / bbSize);
        }

        // Fallback position detection
        if (result.heroPosition === 'UNK') {
            // Check for position labels in text
            for (const [alias, pos] of Object.entries(POSITION_ALIASES)) {
                const re = new RegExp(`${heroName}.*?\\(${alias}\\)`, 'i');
                if (re.test(rawText)) { result.heroPosition = pos; break; }
            }
        }

        // ═══ 5. Villains ═══
        result.seats.forEach(s => {
            if (s.name !== heroName) {
                result.villains.push({
                    id: `v_${s.seat}`,
                    name: s.name,
                    position: s.position || 'VIL',
                    stack: Math.round((s.stack || 100) / bbSize),
                    range: 'GTO Core',
                    nodeLock: 'None',
                    color: '#ef4444',
                });
            }
        });

        if (result.villains.length === 0) {
            result.villains.push({ id: 'v_0', position: 'VIL', range: 'GTO Core', nodeLock: 'None', color: '#ef4444' });
        }

        // Find primary villain (last aggressor or opponent in heads-up)
        if (result.villains.length === 1) {
            result.villainPosition = result.villains[0].position;
        } else {
            // Default to BB if hero is BTN, or BTN if hero is blind
            if (['BTN', 'CO', 'HJ', 'MP', 'LJ'].includes(result.heroPosition)) {
                result.villainPosition = 'BB';
            } else {
                result.villainPosition = 'BTN';
            }
        }

        // ═══ 6. Street Actions ═══
        result.streetActions = parseStreetActions(rawText, heroName, bbSize);

        // ═══ 7. Success check ═══
        result.success = !!(result.heroHand.card1 || result.board.flop.length > 0);
        if (!result.success) result.error = 'Could not parse hole cards or board from text.';

        return result;

    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Convert parsed hand history to a GTO training question format
 * Compatible with GodModeArena / useGTOTrainer
 */
export function convertToTrainingQuestion(parsed, targetStreet) {
    if (!parsed || !parsed.success) return null;

    // Determine which street to create the question for
    const street = targetStreet || (parsed.board.river ? 'river' : parsed.board.turn ? 'turn' : 'flop');

    // Build board for the target street
    let boardCards = [...parsed.board.flop];
    if ((street === 'turn' || street === 'river') && parsed.board.turn) {
        boardCards.push(parsed.board.turn);
    }
    if (street === 'river' && parsed.board.river) {
        boardCards.push(parsed.board.river);
    }

    // Calculate pot at target street from actions
    let pot = parsed.blinds.sb + parsed.blinds.bb;
    const bbSize = parsed.blinds.bb || 1;

    // Sum preflop action to get flop pot
    for (const action of (parsed.streetActions.preflop || [])) {
        if (action.action === 'call' || action.action === 'raise' || action.action === 'bet') {
            pot += action.amount;
        }
    }

    // Add flop actions if targeting turn/river
    if (street === 'turn' || street === 'river') {
        for (const action of (parsed.streetActions.flop || [])) {
            if (action.action === 'call' || action.action === 'raise' || action.action === 'bet') {
                pot += action.amount;
            }
        }
    }

    // Add turn actions if targeting river
    if (street === 'river') {
        for (const action of (parsed.streetActions.turn || [])) {
            if (action.action === 'call' || action.action === 'raise' || action.action === 'bet') {
                pot += action.amount;
            }
        }
    }

    const potBB = Math.round(pot / bbSize);

    // Build hero hand notation (e.g., "AKs" or "AKo")
    let heroHandNotation = '';
    if (parsed.heroHand.card1 && parsed.heroHand.card2) {
        const r1 = parsed.heroHand.card1[0];
        const r2 = parsed.heroHand.card2[0];
        const s1 = parsed.heroHand.card1[1];
        const s2 = parsed.heroHand.card2[1];

        if (r1 === r2) {
            heroHandNotation = `${r1}${r2}`;
        } else {
            const RANK_ORDER = 'AKQJT98765432';
            const idx1 = RANK_ORDER.indexOf(r1);
            const idx2 = RANK_ORDER.indexOf(r2);
            const hi = idx1 < idx2 ? r1 : r2;
            const lo = idx1 < idx2 ? r2 : r1;
            heroHandNotation = s1 === s2 ? `${hi}${lo}s` : `${hi}${lo}o`;
        }
    }

    return {
        id: `hh_import_${Date.now()}`,
        source: 'hand_history_import',
        heroHand: heroHandNotation,
        heroCards: parsed.heroCards,
        scenario: {
            gameType: parsed.numPlayers <= 2 ? 'hu_cash' : parsed.numPlayers <= 4 ? 'short_cash' : 'cash_6max',
            street,
            board: boardCards.join(' '),
            boardCards,
            pot: potBB,
            heroPosition: parsed.heroPosition,
            villainPosition: parsed.villainPosition,
            heroStack: parsed.heroStack || 100,
            villainStack: parsed.villains[0]?.stack || 100,
            stackDepth: parsed.heroStack || 100,
            isImported: true,
            importFormat: parsed.format,
        },
        // Placeholder GTO frequencies (will be overridden by solver data if available)
        gtoFrequencies: {},
        actions: [],
    };
}

/**
 * Parse multiple hands from a bulk hand history file
 * Splits on hand boundaries and returns array of parsed results
 */
export function parseMultipleHands(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    // Split on hand boundaries
    const handBoundaries = [
        /(?=PokerStars Hand #)/g,
        /(?=\*\*\*\*\* Hand History)/g,
        /(?=Hand #\d+)/g,
        /(?=Ignition Hand #)/g,
    ];

    let hands = [rawText]; // fallback: single hand

    for (const boundary of handBoundaries) {
        const split = rawText.split(boundary).filter(h => h.trim().length > 50);
        if (split.length > 1) {
            hands = split;
            break;
        }
    }

    return hands.map(h => parseHandHistory(h)).filter(p => p && p.success);
}
