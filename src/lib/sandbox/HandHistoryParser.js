/**
 * HandHistoryParser - Parse pasted hand histories from major poker sites
 * Supports: PokerStars (and PokerStars-shaped exports), GGPoker, Club Arena,
 * ClubGG, ACR / Winning Poker Network, 888poker, and generic text layouts.
 *
 * Variant honesty: the sandbox solves No-Limit Hold'em only. A hand positively
 * identified as PLO/Omaha (any hero hand of 4+ cards), Omaha Hi-Lo, Short Deck,
 * or limit / pot-limit Hold'em returns { success: false, unsupportedVariant }
 * instead of silently importing its first two cards as an NLHE hand.
 *
 * Contract:
 *   parseHandHistory(text) ->
 *     { success: true, heroHand: { card1, card2 }, heroPosition, heroStack (in BB),
 *       gameType: 'cash' | 'tournament', board: { flop: [], turn, river },
 *       villains: [{ position, archetype: { id, name }, stack, range, name }],
 *       blinds: { sb, bb, ante, straddle, sbRaw, bbRaw, anteRaw, straddleRaw, totalForcedPot, totalForcedPotRaw },
 *       ante, straddle, pot, potBase, bbSize, wagerSizesExact, preflopPosts,
 *       actionHistory: [{
 *         action, label, player, position, isHero, isVillain, seatIndex, street,
 *         amount, raiseTo, amountRaw, raiseToRaw, allIn, pot, potRaw
 *       }] }
 *   | { success: false, error: string }
 *
 * Stacks and wager amounts are normalized to BIG BLINDS (every sandbox consumer
 * treats them as bb, never as raw currency), while raw chip/currency values are
 * preserved alongside as *Raw fields.
 */

import { classifyGameVariant, detectSite as detectEngineSite } from '../../engines/HandHistoryParser.js';

export function detectSite(text) {
    if (!text) return 'unknown';
    const raw = String(text);
    const head = raw.slice(0, 600);
    if (/club\s*arena|smarter\.?poker\s*club/i.test(head)) return 'club_arena';
    return detectEngineSite(raw);
}

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

function round2(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function parseNumericAmount(raw) {
    if (raw == null) return null;
    const cleaned = String(raw).replace(/[$€£¥,\s]/g, '').replace(/bb$/i, '');
    if (!cleaned) return null;
    const num = parseFloat(cleaned);
    return Number.isFinite(num) && num >= 0 ? num : null;
}

function toBbAmount(rawAmount, bbSize, isExplicitBb = false) {
    if (!Number.isFinite(rawAmount) || rawAmount < 0) return null;
    if (isExplicitBb) return round2(rawAmount);
    if (!bbSize || bbSize <= 0) return round2(rawAmount);
    return round2(rawAmount / bbSize);
}

function parseCard(raw) {
    if (!raw || raw.length < 2) return null;
    // '10d' and 'Td' both land here - rank is everything but the trailing suit.
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
 * Detect small blind, big blind, and optional header ante from the hand header or post lines.
 */
function detectStakes(text) {
    const raw = String(text || '');
    let sbRaw = null;
    let bbRaw = null;
    let headerAnteRaw = null;

    // Tournament: "Level V (75/150)" or "Level XI (400/800 - Ante 100)" or "(50/100/10)"
    const levelMatch = raw.match(/Level[^(\n]*\(\s*[$€£¥]?(\d[\d,.]*)\s*\/\s*[$€£¥]?(\d[\d,.]*)(?:\s*\/\s*[$€£¥]?(\d[\d,.]*))?/i);
    if (levelMatch) {
        const sb = parseNumericAmount(levelMatch[1]);
        const bb = parseNumericAmount(levelMatch[2]);
        const ante = parseNumericAmount(levelMatch[3]);
        if (bb > 0) {
            sbRaw = sb;
            bbRaw = bb;
            if (ante > 0) headerAnteRaw = ante;
        }
    }

    // Cash: "($0.50/$1.00 USD)" or "(€0.50/€1.00 EUR)" or "(1/2/4)" or "(50/100)"
    // Exclude date headers like "(2026/11/24 ...)" by requiring no 4-digit year and no trailing "/DD".
    if (!bbRaw) {
        const parenRe = /\(\s*[$€£¥]?(\d[\d,.]*)\s*\/\s*[$€£¥]?(\d[\d,.]*)(?!\s*\/\s*\d{2}\b)/g;
        for (const m of raw.matchAll(parenRe)) {
            if (m[1].length === 4 && Number(m[1]) >= 1990 && Number(m[1]) <= 2100) continue;
            const sb = parseNumericAmount(m[1]);
            const bb = parseNumericAmount(m[2]);
            if (bb > 0) {
                sbRaw = sb;
                bbRaw = bb;
                break;
            }
        }
    }

    // ACR / Winning Poker Network or Club Arena dash-delimited stakes:
    // "Hand #123 - Holdem(No Limit) - $0.05/$0.10 - 2026/11/25 ..."
    if (!bbRaw) {
        const wpnMatch = raw.match(/-\s*[$€£¥]?(\d[\d,.]*)\s*\/\s*[$€£¥]?(\d[\d,.]*)\s*(?:-|USD|EUR|GBP|\n|$)/i);
        if (wpnMatch) {
            const sb = parseNumericAmount(wpnMatch[1]);
            const bb = parseNumericAmount(wpnMatch[2]);
            if (bb > 0) {
                sbRaw = sb;
                bbRaw = bb;
            }
        }
    }

    // Fallback: "posts small blind $1" / "posts big blind $2"
    if (!sbRaw) {
        const sbPost = raw.match(/posts?\s+(?:the\s+)?(?:small\s+blind|sb)\s*[:\s]*[$€£¥]?(\d[\d,.]*)/i);
        if (sbPost) {
            const v = parseNumericAmount(sbPost[1]);
            if (v > 0) sbRaw = v;
        }
    }
    if (!bbRaw) {
        const bbPost = raw.match(/posts?\s+(?:the\s+)?(?:big\s+blind|bb)\s*[:\s]*[$€£¥]?(\d[\d,.]*)/i);
        if (bbPost) {
            const v = parseNumericAmount(bbPost[1]);
            if (v > 0) bbRaw = v;
        }
    }

    return { sbRaw, bbRaw, headerAnteRaw };
}

function toBigBlinds(rawStack, bbSize) {
    if (!Number.isFinite(rawStack) || rawStack <= 0) return 100;
    if (!bbSize || bbSize <= 0) return 100; // no blind level found - assume 100bb
    const bb = Math.round(rawStack / bbSize);
    return Math.max(MIN_STACK_BB, Math.min(MAX_STACK_BB, bb || MIN_STACK_BB));
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatActionLabel(action, amountBb, raiseToBb, allIn) {
    const fmt = (n) => {
        if (!Number.isFinite(n) || n <= 0) return '';
        return Number.isInteger(n) ? `${n} BB` : `${round2(n)} BB`;
    };
    if (action === 'fold') return 'Fold';
    if (action === 'check') return 'Check';
    if (action === 'allin' || allIn) {
        const size = fmt(raiseToBb || amountBb);
        return size ? `All-In ${size}` : 'All-In';
    }
    if (action === 'raise') {
        const size = fmt(raiseToBb || amountBb);
        return size ? `Raise ${size}` : 'Raise';
    }
    if (action === 'bet') {
        const size = fmt(amountBb);
        return size ? `Bet ${size}` : 'Bet';
    }
    if (action === 'call') {
        const size = fmt(amountBb);
        return size ? `Call ${size}` : 'Call';
    }
    return action;
}

/**
 * Parse forced preflop posts (blinds, antes, straddles) from the pre-action section
 * and also return live street-in commitments per player.
 */
function parseForcedPosts(text, positionOf = {}, bbSize = null, fallbackStakes = {}) {
    const raw = String(text || '');
    const beforeFlop = raw.split(/\*\*\*\s*(?:FIRST\s+)?FLOP\s*\*\*\*|\*\*\s*Dealing flop\s*\*\*/i)[0] || raw;
    const knownNames = Object.keys(positionOf).sort((a, b) => b.length - a.length);

    const posts = [];
    const liveStreetInRaw = {};
    let sbRaw = null;
    let bbRaw = null;
    let totalAnteRaw = 0;
    let totalStraddleRaw = 0;
    let totalForcedPotRaw = 0;

    for (const rawLine of beforeFlop.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/^(?:Seat \d+:|Table |Dealt to |\*\*\*|\*\*)/i.test(line)) continue;

        let player = null;
        let rest = null;
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
            player = line.slice(0, colonIdx).trim();
            rest = line.slice(colonIdx + 1).trim();
        } else {
            const name = knownNames.find(candidate => line.startsWith(`${candidate} `));
            if (name) {
                player = name;
                rest = line.slice(name.length).trim();
            } else {
                const m = line.match(/^(.+?)\s+(posts?\b.+)$/i);
                if (m) {
                    player = m[1].trim();
                    rest = m[2].trim();
                }
            }
        }
        if (!player || !rest) continue;
        if (!/^posts?\b/i.test(rest)) continue;

        // Match: posts small blind $1 / posts big blind $2 / posts the ante $0.25 / posts straddle $4 / posts small & big blinds $3
        const sbAndBb = rest.match(/posts?\s+(?:the\s+)?small\s*(?:&|and)\s*big\s*blinds?\s*[$€£¥]?(\d[\d,.]*)(?:\s*bb)?/i);
        const sbMatch = !sbAndBb && rest.match(/posts?\s+(?:the\s+)?(?:small\s+blind|sb)\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        const bbAnteMatch = rest.match(/posts?\s+(?:the\s+)?(?:big\s+blind\s+ante|bba)\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        const bbMatch = !sbAndBb && !bbAnteMatch && rest.match(/posts?\s+(?:the\s+)?(?:big\s+blind|bb)\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        const anteMatch = !bbAnteMatch && rest.match(/posts?\s+(?:the\s+)?(?:dead\s+)?ante\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        const straddleMatch = rest.match(/posts?\s+(?:a\s+|the\s+|live\s+|utg\s+|mississippi\s+|button\s+)?straddle\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);

        if (sbAndBb) {
            const val = parseNumericAmount(sbAndBb[1]);
            if (val != null && val > 0) {
                const livePortion = bbSize && val >= bbSize ? bbSize : val;
                liveStreetInRaw[player] = (liveStreetInRaw[player] || 0) + livePortion;
                totalForcedPotRaw += val;
                posts.push({ player, position: positionOf[player] || null, type: 'dead_blind', amountRaw: val, amount: toBbAmount(val, bbSize) });
            }
            continue;
        }
        if (sbMatch) {
            const val = parseNumericAmount(sbMatch[1]);
            if (val != null && val > 0) {
                if (sbRaw == null) sbRaw = val;
                liveStreetInRaw[player] = (liveStreetInRaw[player] || 0) + val;
                totalForcedPotRaw += val;
                posts.push({ player, position: positionOf[player] || null, type: 'sb', amountRaw: val, amount: toBbAmount(val, bbSize) });
            }
            continue;
        }
        if (bbAnteMatch) {
            const val = parseNumericAmount(bbAnteMatch[1]);
            if (val != null && val > 0) {
                totalAnteRaw += val;
                totalForcedPotRaw += val;
                posts.push({ player, position: positionOf[player] || null, type: 'ante', amountRaw: val, amount: toBbAmount(val, bbSize) });
            }
            continue;
        }
        if (bbMatch) {
            const val = parseNumericAmount(bbMatch[1]);
            if (val != null && val > 0) {
                if (bbRaw == null) bbRaw = val;
                liveStreetInRaw[player] = (liveStreetInRaw[player] || 0) + val;
                totalForcedPotRaw += val;
                posts.push({ player, position: positionOf[player] || null, type: 'bb', amountRaw: val, amount: toBbAmount(val, bbSize) });
            }
            continue;
        }
        if (anteMatch) {
            const val = parseNumericAmount(anteMatch[1]);
            if (val != null && val > 0) {
                totalAnteRaw += val;
                totalForcedPotRaw += val;
                posts.push({ player, position: positionOf[player] || null, type: 'ante', amountRaw: val, amount: toBbAmount(val, bbSize) });
            }
            continue;
        }
        if (straddleMatch) {
            const val = parseNumericAmount(straddleMatch[1]);
            if (val != null && val > 0) {
                totalStraddleRaw += val;
                liveStreetInRaw[player] = (liveStreetInRaw[player] || 0) + val;
                totalForcedPotRaw += val;
                posts.push({ player, position: positionOf[player] || null, type: 'straddle', amountRaw: val, amount: toBbAmount(val, bbSize) });
            }
        }
    }

    const effectiveBbRaw = bbRaw || fallbackStakes.bbRaw || bbSize || null;
    const effectiveSbRaw = sbRaw || fallbackStakes.sbRaw || (effectiveBbRaw ? effectiveBbRaw / 2 : null);

    // If no post lines existed at all, infer standard SB + BB starting pot from header blinds (or 1.5 BB default).
    if (posts.length === 0) {
        if (effectiveBbRaw) {
            totalForcedPotRaw = (effectiveSbRaw || effectiveBbRaw / 2) + effectiveBbRaw;
        } else {
            totalForcedPotRaw = 1.5;
        }
    }

    const bbDivisor = effectiveBbRaw || 1;
    const blinds = {
        sb: effectiveSbRaw != null ? round2(effectiveSbRaw / bbDivisor) : 0.5,
        bb: effectiveBbRaw != null ? round2(effectiveBbRaw / bbDivisor) : 1,
        ante: round2(totalAnteRaw / bbDivisor),
        straddle: round2(totalStraddleRaw / bbDivisor),
        sbRaw: effectiveSbRaw,
        bbRaw: effectiveBbRaw,
        anteRaw: round2(totalAnteRaw),
        straddleRaw: round2(totalStraddleRaw),
        totalForcedPot: round2(totalForcedPotRaw / bbDivisor),
        totalForcedPotRaw: round2(totalForcedPotRaw),
    };

    return { posts, liveStreetInRaw, blinds, bbDivisor };
}

/**
 * Extract exact wager numbers from an action line remainder (after player name).
 */
function extractWagerDetails(rest, verb, bbDivisor) {
    const allIn = /\band\s+is\s+all[- ]?in\b|\ball[- ]?in\b|\bshoves?\b/i.test(rest);
    const explicitBb = /\d[\d,.]*\s*bb\b/i.test(rest);

    let amountRaw = null;
    let raiseToRaw = null;

    if (verb === 'raises') {
        // "raises $4 to $6" | "raises 400 to 600" | "raises to $6" | "raises [$6]"
        const incAndTo = rest.match(/raises?\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?\s+to\s+(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        if (incAndTo) {
            amountRaw = parseNumericAmount(incAndTo[1]);
            raiseToRaw = parseNumericAmount(incAndTo[2]);
        } else {
            const toOnly = rest.match(/raises?\s+to\s+(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
            if (toOnly) {
                raiseToRaw = parseNumericAmount(toOnly[1]);
            } else {
                const single = rest.match(/raises?\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
                if (single) {
                    raiseToRaw = parseNumericAmount(single[1]);
                }
            }
        }
    } else if (verb === 'bets') {
        const m = rest.match(/bets?\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        if (m) amountRaw = parseNumericAmount(m[1]);
    } else if (verb === 'calls') {
        const m = rest.match(/calls?\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        if (m) amountRaw = parseNumericAmount(m[1]);
    } else if (verb === 'allin' || verb === 'shoves' || verb === 'goes') {
        const toM = rest.match(/\bto\s+(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
        if (toM) {
            raiseToRaw = parseNumericAmount(toM[1]);
        } else {
            const m = rest.match(/(?:all[- ]?in|shoves?)(?:\s+for)?\s*(?:\[)?[$€£¥]?(\d[\d,.]*)(?:\s*bb)?(?:\])?/i);
            if (m) amountRaw = parseNumericAmount(m[1]);
        }
    }

    // If explicitly marked in BB (e.g. "bets 3.5bb"), convert back to bbDivisor raw units for consistent running pot math.
    const rawScale = explicitBb && bbDivisor ? bbDivisor : 1;
    if (amountRaw != null && explicitBb) amountRaw = round2(amountRaw * rawScale);
    if (raiseToRaw != null && explicitBb) raiseToRaw = round2(raiseToRaw * rawScale);

    return { amountRaw, raiseToRaw, allIn };
}

/**
 * Walk EVERY street (preflop through river) collecting player actions with
 * exact wager sizes and running pot tracking.
 */
function parseAllActions(text, {
    positionOf = {},
    seatIndexOf = {},
    heroName = null,
    liveStreetInRaw = {},
    initialPotRaw = 0,
    bbDivisor = 1,
    is888 = false,
} = {}) {
    const actions = [];
    const holeSplitRe = is888 ? /\*\* Dealing down cards \*\*/i : /\*\*\*\s*HOLE CARDS\s*\*\*\*/i;
    const afterHole = text.split(holeSplitRe)[1];
    if (!afterHole) {
        return { actions, finalPotRaw: initialPotRaw, wagerSizesExact: false, uncalledReturnedRaw: 0 };
    }

    // Stop at showdown/summary - those lines are results, not actions.
    const endRe = is888 ? /\*\*\s*Summary\s*\*\*/i : /\*\*\*\s*(?:SHOW ?DOWN|SUMMARY)\s*\*\*\*/i;
    const body = afterHole.split(endRe)[0] || '';
    // Longest names first so "Big Fish Jr" is never read as "Big Fish".
    const knownNames = Object.keys(positionOf).sort((a, b) => b.length - a.length);

    let street = 'preflop';
    let runningPotRaw = Number.isFinite(initialPotRaw) ? initialPotRaw : 0;
    let streetInRaw = { ...liveStreetInRaw };
    let uncalledReturnedRaw = 0;
    let wagerActionsSeen = 0;
    let wagerActionsWithExactSize = 0;

    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;

        const streetHeader = is888
            ? line.match(/\*\* Dealing (flop|turn|river) \*\*/i)
            : line.match(/\*\*\*\s*(?:FIRST\s+)?(FLOP|TURN|RIVER)\s*\*\*\*/i);
        if (streetHeader) {
            street = streetHeader[1].toLowerCase();
            streetInRaw = {};
            continue;
        }

        // Handle "Uncalled bet ($4.00) returned to Hero"
        const uncalled = line.match(/Uncalled\s+bet\s*\(\s*[$€£¥]?(\d[\d,.]*)\s*\)\s*returned\s+to\s+(.+)/i);
        if (uncalled) {
            const ret = parseNumericAmount(uncalled[1]);
            if (ret != null && ret > 0) {
                uncalledReturnedRaw += ret;
                runningPotRaw = Math.max(0, runningPotRaw - ret);
            }
            continue;
        }

        let player = null;
        let verb = null;
        let rest = '';
        const colon = line.includes(':')
            ? line.match(/^(.+?):\s*(folds?|checks?|calls?|bets?|raises?|goes\s+all[- ]?in|all[- ]?in|shoves?)\b(.*)$/i)
            : null;
        if (colon) {
            player = colon[1].trim();
            verb = colon[2].toLowerCase();
            rest = `${colon[2]}${colon[3] || ''}`.trim();
        } else {
            // ACR / Winning Poker Network / 888 omit the colon: "Villain raises to $0.30".
            const name = knownNames.find(candidate => line.startsWith(`${candidate} `));
            const candidateRest = name ? line.slice(name.length).trim() : '';
            const m = name
                ? candidateRest.match(/^(folds?|checks?|calls?|bets?|raises?|goes\s+all[- ]?in|all[- ]?in|shoves?)\b(.*)$/i)
                : line.match(/^(.+?)\s+(folds?|checks?|calls?|bets?|raises?|goes\s+all[- ]?in|all[- ]?in|shoves?)\b(.*)$/i);
            if (!m) continue;
            if (name) {
                player = name;
                verb = m[1].toLowerCase();
                rest = candidateRest;
            } else {
                player = m[1].replace(/:$/, '').trim();
                verb = m[2].toLowerCase();
                rest = `${m[2]}${m[3] || ''}`.trim();
            }
        }

        const normVerb = verb.startsWith('fold') ? 'folds'
            : verb.startsWith('check') ? 'checks'
            : verb.startsWith('call') ? 'calls'
            : verb.startsWith('bet') ? 'bets'
            : verb.startsWith('raise') ? 'raises'
            : 'allin';

        const { amountRaw: parsedAmountRaw, raiseToRaw: parsedRaiseToRaw, allIn } = extractWagerDetails(rest, normVerb, bbDivisor);

        let action = null;
        if (normVerb === 'folds') action = 'fold';
        else if (normVerb === 'checks') action = 'check';
        else if (normVerb === 'calls') action = 'call';
        else if (normVerb === 'bets') action = 'bet';
        else if (normVerb === 'raises') action = 'raise';
        else action = 'allin';

        if (allIn) action = 'allin';

        const prevPlayerIn = streetInRaw[player] || 0;
        let addedRaw = 0;
        let raiseToRaw = parsedRaiseToRaw;

        if (action === 'fold' || action === 'check') {
            addedRaw = 0;
            raiseToRaw = null;
        } else {
            wagerActionsSeen += 1;
            const hasExplicit = parsedAmountRaw != null || parsedRaiseToRaw != null;
            if (hasExplicit) wagerActionsWithExactSize += 1;

            if (normVerb === 'raises' || (raiseToRaw != null && raiseToRaw > 0)) {
                if (raiseToRaw != null) {
                    addedRaw = Math.max(0, raiseToRaw - prevPlayerIn);
                } else if (parsedAmountRaw != null) {
                    addedRaw = parsedAmountRaw;
                    raiseToRaw = prevPlayerIn + parsedAmountRaw;
                }
            } else if (parsedAmountRaw != null) {
                addedRaw = parsedAmountRaw;
                if (action === 'allin' && prevPlayerIn > 0) {
                    raiseToRaw = prevPlayerIn + parsedAmountRaw;
                }
            }

            if (addedRaw > 0) {
                streetInRaw[player] = prevPlayerIn + addedRaw;
                runningPotRaw += addedRaw;
            }
        }

        const amountBb = toBbAmount(addedRaw, bbDivisor);
        const raiseToBb = raiseToRaw != null ? toBbAmount(raiseToRaw, bbDivisor) : null;
        const potBb = toBbAmount(runningPotRaw, bbDivisor);
        const isHero = heroName != null && player === heroName;

        actions.push({
            action,
            label: formatActionLabel(action, amountBb, raiseToBb, allIn),
            player,
            position: positionOf[player] || null,
            isHero,
            isVillain: !isHero,
            seatIndex: seatIndexOf[player] ?? (isHero ? 0 : 1),
            street,
            amount: amountBb,
            raiseTo: raiseToBb,
            amountRaw: round2(addedRaw),
            raiseToRaw: raiseToRaw != null ? round2(raiseToRaw) : null,
            allIn,
            pot: potBb,
            potRaw: round2(runningPotRaw),
        });
    }

    const wagerSizesExact = wagerActionsSeen === 0
        ? actions.length > 0
        : wagerActionsWithExactSize === wagerActionsSeen;

    return {
        actions,
        finalPotRaw: round2(runningPotRaw),
        wagerSizesExact,
        uncalledReturnedRaw: round2(uncalledReturnedRaw),
    };
}

/**
 * Build the seat -> position map, seatIndex map, and hero/villain stacks (in bb).
 * Shared by the PokerStars-shaped, Club Arena, GGPoker, and 888 parsers.
 */
function assignSeats(result, seats, btnSeat, heroName, bbSize) {
    const names = Object.keys(seats);
    if (names.length === 0) return { positionOf: {}, seatIndexOf: {} };

    const ordered = Object.entries(seats).sort((a, b) => a[1].seat - b[1].seat);
    const n = ordered.length;
    const labels = positionLabels(n);
    let btnIdx = ordered.findIndex(([, v]) => v.seat === btnSeat);
    if (btnIdx === -1) btnIdx = 0;

    const positionOf = {};
    const seatIndexOf = {};
    ordered.forEach(([name, data], i) => {
        const offset = (i - btnIdx + n) % n;
        const pos = labels[offset] || labels[labels.length - 1];
        data.position = pos;
        positionOf[name] = pos;
        if (name === heroName) {
            result.heroPosition = pos;
            result.heroStack = toBigBlinds(data.stack, bbSize);
            seatIndexOf[name] = 0;
        }
    });

    let villainCounter = 1;
    result.villains = ordered
        .filter(([name]) => name !== heroName)
        .map(([name, data], idx) => {
            seatIndexOf[name] = villainCounter++;
            return {
                id: idx,
                name,
                position: data.position || 'BB',
                archetype: { ...DEFAULT_ARCHETYPE },
                stack: toBigBlinds(data.stack, bbSize),
                range: '',
            };
        });

    return { positionOf, seatIndexOf };
}

const POSITIVELY_UNSUPPORTED_VARIANTS = new Set(['short_deck', 'omaha', 'limit_holdem', 'pot_limit_holdem']);

function headerLineOf(text) {
    return String(text).split('\n').find(line => /Hand\s*#/i.test(line)) || '';
}

/**
 * Settle site + variant honesty for a parsed hand. `supported` is true for
 * No-Limit Hold'em, false for a positively identified other game, and null when
 * the pasted text carries no game header (kept importable, as before).
 */
function applyVariant(result, text, heroCardCount, defaultBetting = null) {
    const info = classifyGameVariant(headerLineOf(text), heroCardCount, { defaultBetting });
    result.site = detectSite(text);
    result.variant = info.variant;
    result.gameVariant = info.gameVariant;
    result.supported = info.supported ? true
        : POSITIVELY_UNSUPPORTED_VARIANTS.has(info.variant) ? false : null;
    result.unsupportedReason = result.supported === false ? info.unsupportedReason : null;
    return result;
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
        blinds: {
            sb: 0.5, bb: 1, ante: 0, straddle: 0,
            sbRaw: null, bbRaw: null, anteRaw: 0, straddleRaw: 0,
            totalForcedPot: 1.5, totalForcedPotRaw: 1.5,
        },
        ante: 0,
        straddle: 0,
        pot: 1.5,
        potBase: 1.5,
        bbSize: null,
        wagerSizesExact: false,
        preflopPosts: [],
    };
}

/**
 * Parse a PokerStars / GGPoker / Club Arena / ACR / generic hand history.
 */
function parsePokerStars(text) {
    const result = emptyResult();

    // Detect tournament
    if (/Tournament/i.test(text)) result.gameType = 'tournament';

    const stakes = detectStakes(text);
    const bbSize = stakes.bbRaw;
    result.bbSize = bbSize;

    // Find hero name + hole cards
    const heroMatch = text.match(/Dealt to (.+?) \[(.+?)\]/);
    if (!heroMatch) return null;
    const heroName = heroMatch[1].trim();
    const heroCards = parseCards(heroMatch[2]);
    if (heroCards.length >= 2) {
        result.heroHand = { card1: heroCards[0], card2: heroCards[1] };
    }
    applyVariant(result, text, heroCards.length);

    // Parse seats ONLY from the header before HOLE CARDS / SUMMARY so
    // "*** SUMMARY *** Seat 3: Hero (button) showed [Ah Kd] and won ($15)"
    // never creates phantom seats or overwrites starting stacks.
    const seatSection = text.split(/\*\*\*\s*(?:HOLE CARDS|SUMMARY)\s*\*\*\*/i)[0] || text;
    const seatLines = seatSection.match(/Seat \d+: .+/g) || [];
    const seats = {};
    for (const line of seatLines) {
        const m = line.match(/Seat (\d+): (.+?) \(\s*[$€£¥]?([\d,.]+)/);
        if (m) {
            seats[m[2].trim()] = { seat: parseInt(m[1], 10), stack: parseFloat(m[3].replace(/,/g, '')) };
        }
    }

    // Detect button seat
    const btnMatch = seatSection.match(/Seat #?(\d+) is the button/i);
    const btnSeat = btnMatch ? parseInt(btnMatch[1], 10) : null;

    const { positionOf, seatIndexOf } = assignSeats(result, seats, btnSeat, heroName, bbSize);

    // Fall back to an explicit position label if the seat math produced nothing
    if (!result.heroPosition) {
        const labelled = text.match(new RegExp(`${escapeRegex(heroName)}\\s*\\(([A-Za-z+ ]{2,12})\\)`));
        result.heroPosition = normalizePosition(labelled?.[1]) || null;
    }

    // Parse board (supports standard PokerStars, single-bracket turn/river, and GGPoker FIRST FLOP/TURN/RIVER)
    const flopMatch = text.match(/\*\*\*\s*(?:FIRST\s+)?FLOP\s*\*\*\*[^[\n]*\[([^\]]+)\]/i);
    const turnMatch = text.match(/\*\*\*\s*(?:FIRST\s+)?TURN\s*\*\*\*[^[\n]*(?:\[[^\]]+\]\s*)?\[([^\]]+)\]/i);
    const riverMatch = text.match(/\*\*\*\s*(?:FIRST\s+)?RIVER\s*\*\*\*[^[\n]*(?:\[[^\]]+\]\s*)?\[([^\]]+)\]/i);

    if (flopMatch) result.board.flop = parseCards(flopMatch[1]).slice(0, 3);
    if (turnMatch) result.board.turn = parseCards(turnMatch[1])[0] || null;
    if (riverMatch) result.board.river = parseCards(riverMatch[1])[0] || null;

    // Parse forced posts (blinds, antes, straddles)
    const forced = parseForcedPosts(text, positionOf, bbSize, stakes);
    result.blinds = forced.blinds;
    result.ante = forced.blinds.ante;
    result.straddle = forced.blinds.straddle;
    result.potBase = forced.blinds.totalForcedPot;
    result.preflopPosts = forced.posts;

    // Parse actions on every street with exact wager sizes and running pot
    const parsedActions = parseAllActions(text, {
        positionOf,
        seatIndexOf,
        heroName,
        liveStreetInRaw: forced.liveStreetInRaw,
        initialPotRaw: forced.blinds.totalForcedPotRaw,
        bbDivisor: forced.bbDivisor,
        is888: false,
    });
    result.actionHistory = parsedActions.actions;
    result.pot = toBbAmount(parsedActions.finalPotRaw, forced.bbDivisor);
    result.wagerSizesExact = parsedActions.wagerSizesExact;
    result.uncalledReturned = toBbAmount(parsedActions.uncalledReturnedRaw, forced.bbDivisor);

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

    const stakes = detectStakes(text);
    const bbSize = stakes.bbRaw;
    result.bbSize = bbSize;

    // 888poker: "Dealt to hero [ 10d, Kh ]"
    const heroMatch = text.match(/Dealt to (.+?) \[(.+?)\]/);
    if (!heroMatch) return null;
    const heroName = heroMatch[1].trim();
    const heroCards = parseCards(heroMatch[2]);
    if (heroCards.length >= 2) {
        result.heroHand = { card1: heroCards[0], card2: heroCards[1] };
    }
    // 888 headers rarely name the betting structure; its legacy default is No Limit.
    applyVariant(result, text, heroCards.length, 'NL');

    // 888 seat lines: "Seat 4: PlayerName ( $124.50 )" - header only (exclude summary)
    const seats = {};
    const seatSection = text.split(/\*\*\s*(?:Dealing down cards|Summary)\s*\*\*/i)[0] || text;
    const seatLines = seatSection.match(/Seat \d+: .+/g) || [];
    for (const line of seatLines) {
        const m = line.match(/Seat (\d+): (.+?) \(\s*[$€£¥]?([\d,.]+)/);
        if (m) {
            seats[m[2].trim()] = { seat: parseInt(m[1], 10), stack: parseFloat(m[3].replace(/,/g, '')) };
        }
    }

    // 888 marks the button as "Seat 4 is the button"
    const btnMatch = text.match(/Seat #?(\d+) is the button/i);
    const btnSeat = btnMatch ? parseInt(btnMatch[1], 10) : null;

    const { positionOf, seatIndexOf } = assignSeats(result, seats, btnSeat, heroName, bbSize);

    // Board - 888 uses "** Dealing flop ** [ 10d, Kh, 2c ]"
    const boardMatch = text.match(/\*\* Dealing flop \*\*[^[]*\[(.+?)\]/i);
    const turnMatch = text.match(/\*\* Dealing turn \*\*[^[]*\[(.+?)\]/i);
    const riverMatch = text.match(/\*\* Dealing river \*\*[^[]*\[(.+?)\]/i);
    if (boardMatch) result.board.flop = parseCards(boardMatch[1]).slice(0, 3);
    if (turnMatch) result.board.turn = parseCards(turnMatch[1])[0] || null;
    if (riverMatch) result.board.river = parseCards(riverMatch[1])[0] || null;

    const forced = parseForcedPosts(text, positionOf, bbSize, stakes);
    result.blinds = forced.blinds;
    result.ante = forced.blinds.ante;
    result.straddle = forced.blinds.straddle;
    result.potBase = forced.blinds.totalForcedPot;
    result.preflopPosts = forced.posts;

    const parsedActions = parseAllActions(text, {
        positionOf,
        seatIndexOf,
        heroName,
        liveStreetInRaw: forced.liveStreetInRaw,
        initialPotRaw: forced.blinds.totalForcedPotRaw,
        bbDivisor: forced.bbDivisor,
        is888: true,
    });
    result.actionHistory = parsedActions.actions;
    result.pot = toBbAmount(parsedActions.finalPotRaw, forced.bbDivisor);
    result.wagerSizesExact = parsedActions.wagerSizesExact;
    result.uncalledReturned = toBbAmount(parsedActions.uncalledReturnedRaw, forced.bbDivisor);

    return result;
}

/**
 * Main parser - auto-detects site format.
 * Always returns a { success } envelope so callers can surface a real reason.
 */
export function parseHandHistory(text) {
    if (!text || String(text).trim().length < 20) {
        return { success: false, error: 'Hand history is too short to parse.' };
    }

    const raw = String(text).replace(/\r\n?/g, '\n');

    try {
        let result = null;
        if (/PokerStars/i.test(raw)) result = parsePokerStars(raw);
        else if (/Club\s*Arena|Smarter\.?Poker\s*Club/i.test(raw)) result = parsePokerStars(raw);
        else if (/ClubGG|Club GG/i.test(raw)) result = parsePokerStars(raw);
        else if (/GGPoker|GG Network|Poker Hand #/i.test(raw)) result = parseGGPoker(raw);
        else if (/888poker|Pacific Poker|\*\* Dealing down cards \*\*/i.test(raw)) result = parse888(raw);
        else result = parsePokerStars(raw); // ACR / WPN and generic exports share this layout

        if (!result || !result.heroHand) {
            return { success: false, error: 'Could not detect a supported hand history format.' };
        }

        if (result.supported === false) {
            return {
                success: false,
                error: `Unsupported game variant (${result.gameVariant}). The sandbox solves No-Limit Hold'em only, so this hand was not imported.`,
                unsupportedVariant: result.gameVariant,
                unsupportedReason: result.unsupportedReason,
                site: result.site,
            };
        }

        return { success: true, ...result };
    } catch (e) {
        console.warn('[HH Parser] Error:', e);
        return { success: false, error: 'Failed to parse hand history.' };
    }
}

export default parseHandHistory;
