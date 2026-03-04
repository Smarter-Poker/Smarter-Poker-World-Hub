const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const Brain = require('../HorsePokerBrain');

const BOARDS = {
    preflop: [],
    flop_wet: [{ rank: 10, suit: 0 }, { rank: 9, suit: 0 }, { rank: 2, suit: 0 }],
    flop_dry: [{ rank: 7, suit: 0 }, { rank: 3, suit: 1 }, { rank: 2, suit: 2 }],
    turn: [{ rank: 10, suit: 0 }, { rank: 9, suit: 0 }, { rank: 2, suit: 0 }, { rank: 4, suit: 1 }],
    river: [{ rank: 10, suit: 0 }, { rank: 9, suit: 0 }, { rank: 2, suit: 0 }, { rank: 4, suit: 1 }, { rank: 6, suit: 3 }],
    mono_flop: [{ rank: 14, suit: 0 }, { rank: 10, suit: 0 }, { rank: 5, suit: 0 }],
    paired_board: [{ rank: 7, suit: 0 }, { rank: 7, suit: 1 }, { rank: 3, suit: 2 }],
};
const NUT = [{ rank: 14, suit: 0 }, { rank: 14, suit: 1 }, { rank: 13, suit: 0 }, { rank: 13, suit: 1 }];
const DRAW = [{ rank: 5, suit: 1 }, { rank: 6, suit: 2 }, { rank: 7, suit: 1 }, { rank: 8, suit: 2 }];
const WEAK = [{ rank: 3, suit: 1 }, { rank: 5, suit: 2 }, { rank: 8, suit: 3 }, { rank: 13, suit: 1 }];
const TRASH = [{ rank: 2, suit: 0 }, { rank: 4, suit: 1 }, { rank: 6, suit: 2 }, { rank: 9, suit: 3 }];
const HR = 'aaaaaaaa-0000-0000-0000-000000000001';
const HU1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const TABLE = 'diag-table';

(async () => {
    const horses = await Brain.loadHorseIds();
    horses.add(HR);

    const boardKeys = Object.keys(BOARDS);
    const allHands = [NUT, DRAW, WEAK, TRASH];
    const positions = ['btn', 'bb', 'sb', 'co', 'ep', 'mp'];
    let issues = 0;

    for (let i = 0; i < 50; i++) {
        const board = BOARDS[boardKeys[i % boardKeys.length]];
        const hand = allHands[i % 4];
        const pot = Math.max(2, (i * 7) % 200);
        const toCall = i % 3 === 0 ? 0 : Math.max(1, (i * 3) % 50);
        const stack = Math.max(2, (i * 11) % 500);
        const pos = positions[i % 6];

        const legal = toCall > 0 ? [
            { type: 'fold' },
            { type: 'call', amount: Math.min(toCall, stack) },
            { type: 'raise', minAmount: Math.min(toCall * 2, stack), maxAmount: stack }
        ] : [
            { type: 'check' },
            { type: 'bet', minAmount: 1, maxAmount: stack }
        ];

        try {
            const r = await Brain.getDecision(HR, {
                tableId: TABLE,
                players: [
                    { id: HR, holeCards: hand, stack, position: pos, folded: false, invested: toCall > 0 ? 0 : 2 },
                    { id: HU1, stack, position: 'bb', folded: false, invested: toCall > 0 ? pot / 2 : 2 }
                ],
                communityCards: board,
                phase: board.length === 0 ? 'preflop' : board.length === 3 ? 'flop' : board.length === 4 ? 'turn' : 'river',
                potTotal: pot, currentBet: toCall, variant: 'plo4'
            }, legal, { bigBlind: 2, variant: 'plo4' });

            if (!r.action || !r.action.type) {
                issues++;
                console.error('UNDEFINED at i=' + i);
                console.error('  board=' + boardKeys[i % boardKeys.length] + ' hand=' + ['NUT', 'DRAW', 'WEAK', 'TRASH'][i % 4]);
                console.error('  pot=' + pot + ' toCall=' + toCall + ' stack=' + stack + ' pos=' + pos);
                console.error('  full result:', JSON.stringify(r, null, 2));
            }
        } catch (e) {
            issues++;
            console.error('CRASH at i=' + i + ': ' + e.message);
            console.error('  board=' + boardKeys[i % boardKeys.length] + ' hand=' + ['NUT', 'DRAW', 'WEAK', 'TRASH'][i % 4]);
            console.error('  pot=' + pot + ' toCall=' + toCall + ' stack=' + stack + ' pos=' + pos);
        }
    }
    console.log('Total issues: ' + issues);
})();
