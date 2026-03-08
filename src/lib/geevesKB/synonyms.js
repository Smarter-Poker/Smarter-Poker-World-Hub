/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES SYNONYM ENGINE — Strategy 4
   Domain-specific synonym groups for Smarter.Poker.
   Any word in a group is treated as equivalent during scoring.
   Reduces Grok fallback by dramatically improving local KB hit rates.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SYNONYM_GROUPS = [
    // ── AI / Poker Strategy terms ──
    ['gto', 'game theory optimal', 'solver', 'solver analysis', 'equilibrium strategy', 'optimal strategy'],
    ['ev', 'expected value', 'expectation', 'equity value'],
    ['equity', 'hand equity', 'fold equity'],
    ['range', 'hand range', 'range of hands', 'holding range'],
    ['position', 'positional advantage', 'in position', 'ip', 'out of position', 'oop'],
    ['pot odds', 'pot equity', 'break evens', 'calling odds'],
    ['implied odds', 'reverse implied odds', 'implied equity'],
    ['cbetting', 'continuation bet', 'cbet', 'c-bet'],
    ['3bet', '3-bet', 'three bet', 'reraising', 'reraise'],
    ['4bet', '4-bet', 'four bet'],
    ['check raise', 'check-raise', 'checkraise'],
    ['polarized', 'polar range', 'polarised'],
    ['bluff', 'bluffing', 'semi-bluff'],
    ['nuts', 'nut hand', 'best possible hand'],
    ['fold', 'folding', 'muck'],
    ['call', 'calling', 'flat call', 'flat'],
    ['raise', 'raising', 'open raise', 'open'],
    ['all in', 'all-in', 'shove', 'jam', 'push'],
    ['icm', 'independent chip model', 'icm pressure', 'icm spot'],
    ['spr', 'stack to pot ratio', 'stack-to-pot'],
    ['mtt', 'multi table tournament', 'multi-table tournament', 'tournament poker'],
    ['sng', 'sit and go', 'sit-and-go', 'sitngo'],
    ['hh', 'hand history', 'hand histories'],
    ['bb', 'big blind', 'big blinds'],
    ['sb', 'small blind'],
    ['utg', 'under the gun', 'first to act'],
    ['btn', 'button', 'dealer button', 'on the button'],
    ['co', 'cutoff', 'cut off'],
    ['hi-jack', 'hj', 'hijack'],
    ['mp', 'middle position'],
    ['ep', 'early position'],
    ['rfi', 'raise first in', 'open raising range'],
    ['pot', 'pot size', 'main pot', 'side pot'],
    ['board', 'community cards', 'board texture'],
    ['flop', 'the flop'],
    ['turn', 'the turn', 'fourth street'],
    ['river', 'the river', 'fifth street'],
    ['preflop', 'pre-flop', 'pre flop', 'before the flop'],
    ['showdown', 'show down', 'showdown equity'],
    ['runout', 'run out', 'remaining cards'],

    // ── Dealer / Toke Tracker terms ──
    ['ehr', 'effective hourly rate', 'hourly rate', 'effective rate', 'hourly earnings'],
    ['down', 'dealer down', 'dealing down', 'table down'],
    ['toke', 'tip', 'dealer tip', 'gratuity', 'tokes'],
    ['vault', 'dealer vault', 'earnings history', 'past earnings'],
    ['shift', 'dealer shift', 'work shift'],
    ['session', 'dealing session', 'work session'],

    // ── Bankroll ──
    ['roi', 'return on investment', 'return rate', 'win percentage'],
    ['win rate', 'win-rate', 'winrate', 'hourly win rate', 'hourly'],
    ['bankroll', 'bank roll', 'poker bankroll', 'funds'],
    ['leak', 'leaks', 'losing spot', 'costly pattern', 'expensive mistake'],
    ['stake', 'stakes', 'limits', 'blind levels', 'game size'],

    // ── Club Commander ──
    ['td', 'tournament director', 'tournament manager', 'floor director'],
    ['check in', 'check-in', 'checkin', 'player check-in'],
    ['floor call', 'ruling', 'floor decision', 'dispute'],
    ['comp', 'comps', 'comp points', 'complimentary'],
    ['must move', 'must-move', 'mustmove'],
    ['high hand', 'high-hand', 'best hand of the hour'],
    ['bad beat', 'bad-beat', 'bad beat jackpot', 'bbj'],
    ['table break', 'table-break', 'breaking a table'],
    ['waitlist', 'wait list', 'waiting list', 'waiting queue'],

    // ── Club Arena ──
    ['chips', 'chip balance', 'club chips', 'virtual chips', 'club currency'],
    ['deposit', 'add chips', 'load chips', 'buy chips'],
    ['withdraw', 'cash out chips', 'take out chips'],
    ['union', 'club union', 'poker union'],
    ['club agent', 'agent', 'referral agent'],
    ['hand history', 'hand replay', 'hand review'],

    // ── Diamond Economy ──
    ['diamond', 'diamonds', 'diamond balance', 'gem', 'gems'],
    ['vip', 'vip membership', 'premium membership', 'premium'],
    ['elite', 'elite tier', 'elite vip'],
    ['pro', 'pro tier', 'pro membership', 'pro vip'],
    ['basic', 'basic tier', 'basic membership'],
    ['free tier', 'free account', 'free user'],
    ['spin', 'prize wheel', 'prize spin', 'daily spin'],

    // ── Training ──
    ['gto academy', 'gto training', 'training academy', 'training hub'],
    ['scenario', 'hand scenario', 'training scenario', 'gto scenario'],
    ['drill', 'training drill', 'practice drill'],
    ['accuracy', 'training accuracy', 'decision accuracy', 'gto accuracy'],
    ['hot cold', 'hot and cold', 'warm or cold', 'hot cold drill'],

    // ── General Platform ──
    ['smarter poker', 'smarterpoker', 'smarter.poker', 'the app', 'the platform'],
    ['world hub', 'hub', 'main hub', 'home'],
    ['orb', 'orbs', 'portal', 'portals', 'feature orb'],
    ['pwa', 'progressive web app', 'web app', 'app', 'mobile app'],
    ['avatar', 'profile picture', 'profile photo', 'profile image', 'character'],
    ['leaderboard', 'rankings', 'top players', 'standings'],
    ['achievement', 'achievements', 'badge', 'trophy'],
    ['streak', 'daily streak', 'login streak', 'training streak'],
];

/**
 * Build a fast lookup: word → canonical synonym group index
 * Used by the scorer to expand keywords at match time.
 */
export function buildSynonymIndex() {
    const index = new Map();
    SYNONYM_GROUPS.forEach((group, groupIdx) => {
        group.forEach(term => {
            const normalized = term.toLowerCase().trim();
            index.set(normalized, groupIdx);
        });
    });
    return index;
}
