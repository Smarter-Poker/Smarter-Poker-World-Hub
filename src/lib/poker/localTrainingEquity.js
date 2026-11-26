import { calcEquity, normalizeEquityVariant, parseCardStr } from './trainingEquity.js';

// Accept the same two-character card notation as the training API. Local
// calculations can run without a session and never create training records.
export function localTrainingEquity({ hands, board, variant, iterations }) {
    const spec = normalizeEquityVariant(variant);
    const players = hands.map((cards, id) => ({ id, holeCards: cards.map(parseCardStr) }));
    const community = board.map(parseCardStr);
    const all = [...players.flatMap(p => p.holeCards), ...community];
    if (players.length < 2 || players.some(p => p.holeCards.length !== spec.holeCount) ||
        community.length > 5 || all.includes(-1)) throw new Error('Check The Selected Cards');
    if (new Set(all).size !== all.length) throw new Error('A Card Appears In More Than One Hand Or On The Board');
    const outcome = calcEquity(players, community, variant, iterations);
    return {
        success: true, boardSize: community.length, totalIterations: outcome.totalRuns,
        results: outcome.players.map((seat, i) => ({ ...seat, hand: hands[i].join('') })),
    };
}
