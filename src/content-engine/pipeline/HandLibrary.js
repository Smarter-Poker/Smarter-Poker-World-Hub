/**
 * 🃏 HAND HISTORY LIBRARY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Collection of interesting poker hands for horses to share.
 * Formatted as text-based hand replays with analysis.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Hand categories
export const HAND_CATEGORIES = {
    HERO_CALL: 'hero_call',
    SICK_BLUFF: 'sick_bluff',
    COOLER: 'cooler',
    BAD_BEAT: 'bad_beat',
    BIG_POT: 'big_pot',
    FOLD_EQUITY: 'fold_equity',
    VALUE_TOWN: 'value_town'
};

// Sample hands formatted as shareable text
export const HAND_LIBRARY = [
    {
        id: 'hand_hero_call_1',
        category: 'hero_call',
        stakes: '$2/$5',
        title: 'Hero Call with Third Pair',
        hand: `$2/$5 Live
Hero (BTN): $1,200
Villain (CO): $800

Preflop: Villain raises $20, Hero calls with 8♠8♦

Flop ($47): K♣ T♥ 4♠
Villain bets $35, Hero calls

Turn ($117): 2♦
Villain bets $85, Hero calls

River ($287): 7♣
Villain shoves $660

Hero tanks... and calls.
Villain shows A♠Q♣ (air)

💰 Hero wins $1,607`,
        analysis: 'Villain's line screams missed AQ/ AJ.The overbet shove is desperation.Trust your read.'
    },
{
    id: 'hand_sick_bluff_1',
        category: 'sick_bluff',
            stakes: '$5/$10',
                title: 'Triple Barrel Bluff',
                    hand: `$5/$10 Live
Hero (SB): $2,500
Villain (BTN): $3,000

Preflop: BTN raises $30, Hero 3-bets to $110 with 6♠5♠, BTN calls

Flop ($220): A♥ K♦ 9♣
Hero bets $145, Villain calls

Turn ($510): 3♥
Hero bets $340, Villain calls

River ($1,190): Q♠
Hero shoves $1,905

Villain tanks for 3 minutes... folds TT face up

😤 Hero takes the pot`,
                        analysis: 'Representing the nuts on a scary board. When they tank-call twice, a third barrel can push them off medium strength.'
},
{
    id: 'hand_cooler_1',
        category: 'cooler',
            stakes: '$1/$3',
                title: 'Set Over Set',
                    hand: `$1/$3 Live
Hero (MP): $500
Villain (BB): $400

Preflop: Hero raises $12 with 7♠7♦, Villain calls

Flop ($27): 7♣ 5♥ 2♦
Villain checks, Hero bets $20, Villain raises to $65, Hero calls

Turn ($157): K♠
Villain bets $100, Hero raises to $275, Villain shoves $323

Hero snap-calls

Villain shows 5♦5♣

🎰 Just a cooler. Nothing you can do.`,
                        analysis: 'Classic cooler. Bottom set vs middle set. Get it in and pray they don\'t have top set.'
},
{
    id: 'hand_bad_beat_1',
        category: 'bad_beat',
            stakes: '$2/$5',
                title: 'One-Outer on the River',
                    hand: `$2/$5 Live
Hero (UTG): $1,000
Villain (BTN): $850

Preflop: Hero raises $20 with A♥A♠, Villain 3-bets $65, Hero 4-bets $180, Villain calls

Flop ($365): Q♥ 8♣ 3♦
Hero bets $200, Villain calls

Turn ($765): 7♠
Hero shoves $620, Villain snap-calls with Q♣Q♦

Board: Q♥ 8♣ 3♦ 7♠

River: Q♠

😱 One-outer. Quads over full house.

That's poker.`,
                        analysis: 'Nothing you could have done differently. Ship it in and accept the result.'
},
{
    id: 'hand_big_pot_1',
        category: 'big_pot',
            stakes: '$5/$10/$25',
                title: '$15K Pot at Commerce',
                    hand: `$5/$10/$25 ($50 straddle)
Hero: $8,000
Villain 1: $12,000
Villain 2: $6,000

Preflop: V1 raises $150, V2 calls, Hero 3-bets $600 with K♠K♦, V1 calls, V2 calls

Flop ($1,850): K♥ 9♦ 4♣
Hero bets $900, V1 raises to $2,500, V2 folds, Hero 3-bets to $5,500, V1 shoves

Hero calls

V1 shows 9♣9♠ (middle set)

Turn: 2♥
River: J♠

💰 Hero drags $15,200`,
                        analysis: 'Top set vs middle set. Dream flop. Get maximum value when you flop the nuts.'
},
{
    id: 'hand_value_town_1',
        category: 'value_town',
            stakes: '$1/$2',
                title: 'Max Value with Top Two',
                    hand: `$1/$2 Live
Hero (CO): $350
Villain (BB): $280

Preflop: Hero raises $8 with A♦K♣, BB calls

Flop ($17): A♥ K♦ 5♠
BB checks, Hero bets $12, BB calls

Turn ($41): 8♣
BB checks, Hero bets $30, BB calls

River ($101): 3♠
BB checks, Hero bets $85, BB tank-calls

BB shows A♠8♦ (two pair, worse)

💰 Hero wins $271`,
                        analysis: 'Don\'t be afraid to go for three streets of value with a strong hand. They\'ll call with worse.'
},
{
    id: 'hand_fold_equity_1',
        category: 'fold_equity',
            stakes: '$2/$5',
                title: 'Semi-Bluff Shove',
                    hand: `$2/$5 Live
Hero (BTN): $600
Villain (MP): $800

Preflop: MP raises $15, Hero calls with 9♠8♠

Flop ($37): 7♠ 6♣ 2♠
MP bets $25, Hero raises to $75, MP calls

Turn ($187): K♦
MP checks, Hero shoves $510

MP tanks... folds J♠J♥ face up

🎯 Fold equity realized`,
                        analysis: '15 outs (flush + straight) plus fold equity = print money. Make them make tough decisions.'
}
];

// Get random hand
export function getRandomHand(category = null) {
    let candidates = [...HAND_LIBRARY];

    if (category) {
        candidates = candidates.filter(h => h.category === category);
    }

    if (candidates.length === 0) {
        candidates = HAND_LIBRARY;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
}

// Format hand for social post
export function formatHandForPost(hand, includeAnalysis = true) {
    let content = `📋 ${hand.title}\n\n${hand.hand}`;

    if (includeAnalysis && hand.analysis) {
        content += `\n\n💡 ${hand.analysis}`;
    }

    return content;
}

export default {
    HAND_CATEGORIES,
    HAND_LIBRARY,
    getRandomHand,
    formatHandForPost
};
