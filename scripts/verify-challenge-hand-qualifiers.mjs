/**
 * Verifies the qualifying logic for the two skill-based challenge types.
 *
 * These are driven by `handRank` and `potSize`, which arrive from the engine as
 * free-form values -- 'Full House', 'full_house' and 'FULL HOUSE' have all been
 * observed. A challenge whose qualifier silently never matches is worse than not
 * shipping it, because the player sees a bar that can never move.
 *
 * Mirrors isStrongHand / BIG_POT_MIN in
 * Smarter-Poker-Club-Arena/src/services/DailyChallengeService.ts
 *
 * Run: node scripts/verify-challenge-hand-qualifiers.mjs
 */

const BIG_POT_MIN = 500;

function isStrongHand(handRank) {
    if (!handRank) return false;
    const n = handRank.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    return (
        n.includes('straight') ||
        n.includes('flush') ||
        n.includes('full house') ||
        n.includes('four of a kind') ||
        n.includes('quads') ||
        n.includes('royal')
    );
}

/** Mirrors the bump payload built in AchievementTriggerService.onHandComplete. */
function qualifiers(handData) {
    return {
        ...(handData.won && (handData.potSize || 0) >= BIG_POT_MIN ? { big_pots: 1 } : {}),
        ...(isStrongHand(handData.handRank) ? { strong_hands: 1 } : {}),
    };
}

let failures = 0;
const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) { failures++; console.log(`  FAIL ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
    else console.log(`  ok   ${name}`);
};

console.log('Strong hands -- every casing/format the engine has produced:');
for (const r of [
    'Straight', 'straight', 'STRAIGHT',
    'Full House', 'full_house', 'FULL HOUSE', 'full-house',
    'Four of a Kind', 'four_of_a_kind', 'Quads',
    'Flush', 'flush', 'Straight Flush', 'straight_flush',
    'Royal Flush', 'royal_flush',
]) {
    check(`"${r}" qualifies`, isStrongHand(r), true);
}

console.log('\nWeak hands must NOT qualify:');
for (const r of [
    'High Card', 'high_card', 'Pair', 'One Pair', 'one_pair',
    'Two Pair', 'two_pair', 'Three of a Kind', 'three_of_a_kind', 'Trips', 'Set',
]) {
    check(`"${r}" does not qualify`, isStrongHand(r), false);
}

console.log('\nMissing/blank hand rank is not a qualifier:');
check('undefined', isStrongHand(undefined), false);
check('empty string', isStrongHand(''), false);
check('null', isStrongHand(null), false);

console.log('\nBig pots -- must be WON, and at or above the threshold:');
check('won 500 exactly', qualifiers({ won: true, potSize: 500 }), { big_pots: 1 });
check('won 5000', qualifiers({ won: true, potSize: 5000 }), { big_pots: 1 });
check('won 499 (below)', qualifiers({ won: true, potSize: 499 }), {});
check('LOST a 5000 pot', qualifiers({ won: false, potSize: 5000 }), {});
check('won, no potSize', qualifiers({ won: true }), {});

console.log('\nBoth qualifiers can fire on one hand:');
check('won big with a full house',
    qualifiers({ won: true, potSize: 900, handRank: 'Full House' }),
    { big_pots: 1, strong_hands: 1 });

console.log('\nA strong hand counts even when the pot was lost:');
check('lost with a straight',
    qualifiers({ won: false, potSize: 20, handRank: 'Straight' }),
    { strong_hands: 1 });

console.log(failures === 0 ? '\nPASS: qualifiers behave correctly' : `\nFAIL: ${failures} case(s)`);
process.exit(failures === 0 ? 0 : 1);
