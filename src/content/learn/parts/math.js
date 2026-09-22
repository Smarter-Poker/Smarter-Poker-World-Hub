/**
 * /learn MATH LESSONS. Every number is computed by src/lib/learn/pokerMath.js
 * and interpolated; none is typed. Copy is written in plain case and Title
 * Cased by ../lessons.js on export.
 */
import {
  pct,
  num,
  requiredEquity,
  minimumDefenseFrequency,
  bluffBreakEven,
  indifferentBluffShare,
  hitOnTurn,
  hitOnRiver,
  hitByRiver,
  ruleOfFour,
  ruleOfTwo,
  combosWithDead,
  choose,
  callEV,
  impliedOddsNeeded,
  UNSEEN_ON_FLOP,
  UNSEEN_ON_TURN,
} from '../../../lib/learn/pokerMath.js';
import { TOTAL_COMBOS } from '../../../lib/seo/preflopReference.js';

/** Bet sizes as a fraction of the pot, the ones a player meets most. */
export const SIZES = [
  { label: 'One third pot', bet: 1 / 3 },
  { label: 'Half pot', bet: 0.5 },
  { label: 'Two thirds pot', bet: 2 / 3 },
  { label: 'Three quarters pot', bet: 0.75 },
  { label: 'Pot', bet: 1 },
  { label: 'Twice pot', bet: 2 },
];

/** The draws the outs lesson prints. */
export const DRAWS = [
  { label: 'Flush draw', outs: 9 },
  { label: 'Open ended straight draw', outs: 8 },
  { label: 'Two overcards', outs: 6 },
  { label: 'Gutshot straight draw', outs: 4 },
  { label: 'Flush draw plus open ender', outs: 15 },
];

export const MATH_LESSONS = [
  {
    slug: 'pot-odds',
    title: 'Pot Odds: How To Know If A Call Pays',
    category: 'Math',
    summary: `Pot odds compare the price of a call with what it can win: facing a half pot bet you must put in one unit to win three, so a call needs ${pct(requiredEquity(0.5, 1))} equity to break even.`,
    sections: [
      {
        heading: 'The Formula',
        paragraphs: [
          'Required equity is the amount you must call divided by the total pot after your call. If the pot is 100 and your opponent bets 50, the pot becomes 150 and your call of 50 makes it 200, so you need 50 divided by 200, which is ' + pct(requiredEquity(50, 100)) + '. If your hand wins at least that often, calling makes money over time. If it wins less often, folding does.',
          'The same idea is often stated as a ratio. Facing that half pot bet you are risking 50 to win 150, odds of ' + num(150 / 50) + ' to 1, which break even at one win in every ' + num(1 / requiredEquity(50, 100)) + ' tries. Ratios and percentages describe the same price; percentages are easier to compare with your equity.',
        ],
      },
      {
        heading: 'The Price Of Every Common Bet Size',
        paragraphs: [
          'The table shows the equity a call needs against each common size. The bigger the bet relative to the pot, the more equity you need, but the price never reaches 50%, because the pot you are playing for always includes money that was already in the middle.',
        ],
        table: {
          caption: 'Equity a call needs to break even, by bet size',
          head: ['Bet Size', 'You Call', 'To Win', 'Equity Needed'],
          rows: SIZES.map((s) => [s.label, num(s.bet * 100), num(100 + s.bet * 100), pct(requiredEquity(s.bet, 1))]),
        },
      },
      {
        heading: 'Using It At The Table',
        paragraphs: [
          'Pot odds tell you the price. They do not tell you your equity, which you have to estimate from your hand and your opponent\'s likely range. A flush draw on the turn, for example, hits ' + pct(hitOnRiver(9)) + ' of the time by the river, about one time in five, so it can call a small bet but not a large one unless something else pays for the call.',
          'Two things change the simple answer. Implied odds are the extra money you expect to win on later streets when you hit, which makes some calls that fail the pot odds test profitable. Reverse implied odds are the money you lose on later streets when you hit and are still behind, which makes some calls that pass the test worse than they look.',
          'Before the flop the same arithmetic explains why the big blind defends so widely: it already has a blind in the pot, so it is offered a much better price than any other seat. After the flop, work out the price first, then ask whether your hand clears it against the range you are facing, not against the single hand you fear most.',
          'Practise the arithmetic until the common sizes are automatic. A third pot bet asks for ' + pct(requiredEquity(1 / 3, 1)) + ', a pot sized bet asks for ' + pct(requiredEquity(1, 1)) + ', and every other size falls between them or beyond. Knowing those anchors lets you spend your thinking time on the range question, which is where most of the difficulty is.',
        ],
      },
    ],
    related: ['counting-outs', 'implied-odds', 'minimum-defense-frequency', 'expected-value'],
    glossary: ['pot-odds', 'equity', 'implied-odds', 'reverse-implied-odds'],
    train: { game: 'adv-006', tool: '/hub/training/equity-calculator' },
  },
  {
    slug: 'minimum-defense-frequency',
    title: 'Minimum Defense Frequency (MDF)',
    category: 'Math',
    summary: `Minimum defense frequency is the share of your range you must continue with so a bluff cannot profit automatically: against a pot sized bet it is ${pct(minimumDefenseFrequency(1, 1))}, and against a half pot bet it is ${pct(minimumDefenseFrequency(0.5, 1))}.`,
    sections: [
      {
        heading: 'The Formula',
        paragraphs: [
          'MDF is the pot divided by the pot plus the bet. A bettor who risks the size of the bet to win the pot shows an automatic profit with any two cards if you fold more often than the bet size relative to the new pot. Defending at least the MDF removes that automatic profit.',
          `If the pot is 100 and the bet is 50, MDF is 100 divided by 150, which is ${pct(minimumDefenseFrequency(50, 100))}. If the bet is 100, MDF is 100 divided by 200, which is ${pct(minimumDefenseFrequency(100, 100))}. The larger the bet, the more of your range you are allowed to fold.`,
        ],
        table: {
          caption: 'Minimum defense frequency by bet size',
          head: ['Bet Size', 'Defend At Least', 'Fold At Most'],
          rows: SIZES.map((s) => [s.label, pct(minimumDefenseFrequency(s.bet, 1)), pct(1 - minimumDefenseFrequency(s.bet, 1))]),
        },
      },
      {
        heading: 'What MDF Is And Is Not',
        paragraphs: [
          'MDF is a benchmark built on one assumption: that the bettor could be bluffing with any hand. Against a balanced opponent it is a useful guide to how often a range should continue. Against a real opponent it is only a starting point, because real opponents do not bluff at the rate a benchmark assumes.',
          'If a player rarely bluffs, defending at the MDF means calling with hands that are simply beaten, and folding more is correct. If a player bluffs too much, defending more than the MDF wins money. The number tells you where the line sits, not which side of it your opponent lives on.',
          'MDF also says nothing about which hands to defend. It is a quantity for the whole range. The hands that should continue are the ones with the most equity and the best chance of improving or catching a bluff, and the ones that should fold are the ones that would lose to every value bet and beat no bluffs.',
        ],
      },
      {
        heading: 'MDF Across Streets',
        paragraphs: [
          `Applying MDF on every street compounds. If you defend two thirds of your range on the flop, two thirds of what remains on the turn and two thirds again on the river, you end the hand with ${pct((2 / 3) ** 3)} of the hands you started with. That is expected and correct: a range that faces three bets should be much narrower by the end.`,
          'The mistake to avoid is under defending early, folding so often on the flop that an opponent profits by betting any two cards, and then over defending on the river with hands that should have been released. MDF is most useful as a check on the first of those two leaks.',
        ],
      },
    ],
    related: ['bluff-break-even-percentage', 'pot-odds', 'big-blind-defense', 'mixed-strategies'],
    glossary: ['mdf', 'under-defense', 'range', 'frequency'],
    train: { game: 'adv-012' },
  },
  {
    slug: 'bluff-break-even-percentage',
    title: 'How Often A Bluff Must Work',
    category: 'Math',
    summary: `A pure bluff breaks even when it works as often as the bet divided by the pot plus the bet: a half pot bluff needs ${pct(bluffBreakEven(0.5, 1))} folds and a pot sized bluff needs ${pct(bluffBreakEven(1, 1))}.`,
    sections: [
      {
        heading: 'The Formula',
        paragraphs: [
          `A bluff risks the bet to win the pot. It breaks even when the chance of a fold equals the risk divided by the risk plus the reward, which is the bet divided by the pot plus the bet. This number is often called alpha. With 100 in the pot, a bluff of 50 needs a fold ${pct(bluffBreakEven(50, 100))} of the time, and a bluff of 100 needs a fold ${pct(bluffBreakEven(100, 100))} of the time.`,
          'Alpha and minimum defense frequency are two sides of one equation. Alpha is how often the bluff must work, MDF is how often the defender must continue to stop it working, and the two always add up to 100%.',
        ],
        table: {
          caption: 'How often a pure bluff must work, by bet size',
          head: ['Bet Size', 'Needs Folds', 'Bluff Share A Caller Is Indifferent To'],
          rows: SIZES.map((s) => [s.label, pct(bluffBreakEven(s.bet, 1)), pct(indifferentBluffShare(s.bet, 1))]),
        },
      },
      {
        heading: 'How Many Bluffs A Balanced Range Holds',
        paragraphs: [
          `The last column answers a different question. On the river, a bettor with a polarised range of strong hands and bluffs wants a caller holding a bluff catcher to be indifferent between calling and folding. That happens when bluffs make up the bet divided by the pot plus twice the bet of the betting range. For a pot sized bet that is ${pct(indifferentBluffShare(1, 1))}, about one bluff for every two value hands. For a half pot bet it is ${pct(indifferentBluffShare(0.5, 1))}, one bluff for every three value hands.`,
          `It is the same fraction as the caller's pot odds, which is not a coincidence. A caller who needs ${pct(requiredEquity(1, 1))} equity against a pot sized bet is exactly indifferent when that share of the hands that bet are bluffs.`,
        ],
      },
      {
        heading: 'Using It Against Real Opponents',
        paragraphs: [
          'Against a player who folds too often, bluffs work more than alpha requires and you should bluff more, often with smaller sizes that risk less. Against a player who never folds, even a well chosen bluff loses, so bluff less and value bet thinner instead.',
          'Choose bluffs that have something going for them besides fold equity. Hands that block your opponent\'s strongest calls, and hands that can still improve if called before the river, make better bluffs than hands that are dead when called. On the river, where no card is left to come, the blocker question matters most.',
          'Keep track of what the table sees. A player who shows down bluffs often will get called more, and a player who has not been caught for an hour may get more folds than the math expects. Neither changes the formula; both change your estimate of how often this opponent will fold.',
        ],
      },
    ],
    related: ['minimum-defense-frequency', 'blockers', 'pot-odds', 'check-raising'],
    glossary: ['fold-equity', 'polarized-range', 'blocker', 'value-bet'],
    train: { game: 'cash-005' },
  },
  {
    slug: 'counting-outs',
    title: 'Counting Outs And The Rule Of 2 And 4',
    category: 'Math',
    summary: `An out is a card that improves your hand to the likely winner; from the flop, 9 outs hit by the river ${pct(hitByRiver(9))} of the time, and the rule of 4 estimates that as ${pct(ruleOfFour(9))}.`,
    sections: [
      {
        heading: 'Exact Odds For Common Draws',
        paragraphs: [
          `On the flop you can see your two cards and three on the board, so ${UNSEEN_ON_FLOP} cards are unseen. On the turn ${UNSEEN_ON_TURN} are unseen. The chance of hitting on the next card is your outs divided by the unseen cards, and the chance of hitting by the river from the flop is one minus the chance of missing twice in a row.`,
        ],
        table: {
          caption: 'Chance of hitting, exact, against the rule of 2 and 4',
          head: ['Draw', 'Outs', 'Next Card', 'By The River', 'Rule Of 2', 'Rule Of 4'],
          rows: DRAWS.map((d) => [
            d.label,
            String(d.outs),
            pct(hitOnTurn(d.outs)),
            pct(hitByRiver(d.outs)),
            pct(ruleOfTwo(d.outs)),
            pct(ruleOfFour(d.outs)),
          ]),
        },
      },
      {
        heading: 'The Rule Of 2 And 4',
        paragraphs: [
          `The rule is a shortcut for the table. Multiply your outs by 2 for one card to come and by 4 for two cards to come. For a flush draw on the turn it gives ${pct(ruleOfTwo(9))} against an exact ${pct(hitOnRiver(9))}. For a flush draw on the flop with two cards to come it gives ${pct(ruleOfFour(9))} against an exact ${pct(hitByRiver(9))}.`,
          `It overstates big draws. A flush draw with an open ended straight draw has 15 outs, and the rule of 4 says ${pct(ruleOfFour(15))} when the exact figure is ${pct(hitByRiver(15))}. With many outs, subtract a little from the rule of 4, or use the exact table above.`,
          'Remember that the rule of 4 assumes you will see both cards. If your opponent can bet again on the turn, you may have to pay twice or fold before the river, so for a call on the flop the one card figure is often the honest one to compare with your pot odds.',
        ],
      },
      {
        heading: 'Counting Outs Honestly',
        paragraphs: [
          'Not every out is clean. A card that completes your straight but also puts a fourth card of one suit on the board may give an opponent a flush. A card that pairs your overcard may still lose to two pair. Discount outs that could make a better hand for your opponent, and count only the ones that are likely to win.',
          'Also count the outs your opponent has against you. A made hand facing a draw is often less far ahead than it feels, and the same table tells you how often the draw gets there.',
          'Then turn the percentage into a decision. Compare the chance of hitting with the price of the call, add any money you expect to win later when you hit, and subtract the money you might lose when you hit and are still behind. Outs are the start of the calculation, not the end of it.',
        ],
      },
    ],
    related: ['pot-odds', 'implied-odds', 'counting-combos', 'board-texture'],
    glossary: ['outs', 'equity', 'backdoor-draw', 'semi-bluff'],
    train: { game: 'adv-005', tool: '/hub/training/equity-calculator' },
  },
  {
    slug: 'counting-combos',
    title: 'Counting Poker Hand Combinations',
    category: 'Math',
    summary: `Every pocket pair has ${combosWithDead('QQ')} combinations, every suited hand ${combosWithDead('AKs')} and every offsuit hand ${combosWithDead('AKo')}, for ${TOTAL_COMBOS} starting hands in all, and cards you can see remove combinations from your opponent's range.`,
    sections: [
      {
        heading: 'The Basic Counts',
        paragraphs: [
          `A deck has 52 cards, so there are ${choose(52, 2)} ways to deal two of them. A pair such as queens can be made from any two of the four queens, which is ${choose(4, 2)} ways. A suited hand such as ace king suited has one combination per suit, ${combosWithDead('AKs')} in all. An offsuit hand has four choices of suit for each card minus the four suited ones, ${combosWithDead('AKo')} in all, so ace king of any kind is ${combosWithDead('AK')} combinations.`,
          'These numbers are why charts count combinations, not hand classes. Folding one offsuit hand removes three times as many combinations from a range as folding one suited hand of the same ranks.',
        ],
      },
      {
        heading: 'Card Removal',
        paragraphs: [
          'Every card you can see, in your hand or on the board, is a card your opponent cannot hold. The table shows how much a single visible card changes the count.',
          `If the board shows one ace, ace king drops from ${combosWithDead('AK')} to ${combosWithDead('AK', ['Ah'])} combinations. If you hold an ace and a king yourself, your opponent can hold ace king only ${combosWithDead('AK', ['Ah', 'Kd'])} ways. If the board shows one queen, your opponent has only ${combosWithDead('QQ', ['Qs'])} ways to hold pocket queens, and each of them is a set.`,
        ],
        table: {
          caption: 'Combinations left after cards are seen',
          head: ['Hand', 'Cards Seen', 'Combinations'],
          rows: [
            ['AK, any', 'None', String(combosWithDead('AK'))],
            ['AK, any', 'One ace', String(combosWithDead('AK', ['Ah']))],
            ['AK, any', 'One ace and one king', String(combosWithDead('AK', ['Ah', 'Kd']))],
            ['QQ', 'None', String(combosWithDead('QQ'))],
            ['QQ', 'One queen', String(combosWithDead('QQ', ['Qs']))],
            ['QQ', 'Two queens', String(combosWithDead('QQ', ['Qs', 'Qh']))],
            ['AKs', 'The ace of spades', String(combosWithDead('AKs', ['As']))],
          ],
        },
      },
      {
        heading: 'Putting Combos To Work',
        paragraphs: [
          'Counting combos turns a vague read into a number. Suppose an opponent\'s river bet represents either a set or a missed draw. Count the sets that are still possible after card removal, count the draws that missed, and compare. If the draws outnumber the sets by more than the pot odds require, a bluff catcher can call.',
          'The same counting explains blockers. Holding a card that appears in your opponent\'s strongest hands removes some of those hands from their range, which makes a bluff more likely to work and a call more likely to be good. The effect is real but modest, usually a few combinations, so use it to break close decisions rather than to justify big ones.',
          'Practise on hands you have played. Write down the range you put an opponent on at each street, count the combinations, and see how the count changes as the board runs out. After a few dozen hands the common counts become automatic.',
        ],
      },
    ],
    related: ['blockers', 'bluff-break-even-percentage', 'utg-opening-range', 'counting-outs'],
    glossary: ['combo', 'blocker', 'range', 'villain'],
    train: { game: 'adv-013' },
  },
  (() => {
    // Pot 100, opponent bets 50: 150 in the middle, you call 50.
    const good = callEV(0.3, 150, 50);
    const bad = callEV(0.2, 150, 50);
    const breakEven = requiredEquity(50, 100);
    return {
      slug: 'expected-value',
      title: 'Expected Value (EV) In Poker',
      category: 'Math',
      summary: `Expected value is the average result of a decision if you could repeat it forever: calling 50 to win 150 with 30% equity is worth ${num(good)} chips a time on average, even though it loses most of the times you make it.`,
      sections: [
        {
          heading: 'The Formula',
          paragraphs: [
            'EV multiplies each possible outcome by its probability and adds them up. For a call, that is your chance of winning times what you win, minus your chance of losing times what you lose. Chips already in the pot are not a cost of the call; they are part of what you are playing for.',
            `Take a pot of 100 and a bet of 50, so 150 is in the middle and you must call 50. With 30% equity you win 150 three times in ten and lose 50 seven times in ten. The EV is 0.3 times 150 minus 0.7 times 50, which is ${num(good)} chips per call. With 20% equity the same call is worth ${num(bad)} chips, a losing play. The break even point is ${pct(breakEven)}, the pot odds price.`,
          ],
          table: {
            caption: 'EV of calling 50 to win 150 at different equities',
            head: ['Equity', 'EV Per Call'],
            rows: [0.15, 0.2, 0.25, 0.3, 0.4].map((e) => [pct(e), num(callEV(e, 150, 50))]),
          },
        },
        {
          heading: 'Decisions Not Results',
          paragraphs: [
            'EV is the reason a good decision can lose and a bad one can win. The 30% call above loses seven times out of ten, and it is still the right call, because the three wins pay more than the seven losses cost. Judging the call by whether it won that time would teach you to fold a profitable spot.',
            'This is the core of results oriented thinking and why avoiding it matters. Over a small sample, luck dominates. Over thousands of hands, the sum of your EV decisions dominates, and that is the only part of the game you control.',
          ],
        },
        {
          heading: 'EV Beyond A Single Call',
          paragraphs: [
            'Every option has an EV, and the best play is the one with the highest, not merely one that is positive. A call can be profitable and still be worse than a raise that wins the pot more often, or worse than a fold that saves chips for a better spot.',
            'For bets and raises, EV includes the times your opponent folds. A semi bluff with a draw has two ways to win: an immediate fold, and hitting when called. That is why a draw can be a profitable bet even when it is not strong enough to call a bet of the same size.',
            'Real EV estimates are only as good as the inputs. Your opponent\'s range, their tendencies and how the rest of the hand is likely to play all feed the numbers. The formula is exact; your assumptions are not, which is why reviewing hands against honest ranges improves your EV more than memorising results.',
          ],
        },
      ],
      related: ['pot-odds', 'results-oriented-thinking', 'implied-odds', 'variance-and-downswings'],
      glossary: ['expected-value', 'equity', 'variance', 'semi-bluff'],
      train: { game: 'adv-006', tool: '/hub/training/equity-calculator' },
    };
  })(),
  (() => {
    const outs = 9;
    const equity = hitOnRiver(outs);
    const needed = impliedOddsNeeded(50, 150, equity);
    const direct = requiredEquity(50, 100);
    return {
      slug: 'implied-odds',
      title: 'Implied Odds: When A Draw Can Call',
      category: 'Math',
      summary: `Implied odds are the chips you expect to win on later streets when your draw hits: a flush draw on the turn facing a half pot bet needs about ${num(needed, 0)} more chips from later betting, per 100 in the pot, to make the call break even.`,
      sections: [
        {
          heading: 'Why Pot Odds Are Not Enough',
          paragraphs: [
            `With one card to come, a flush draw hits ${pct(equity)} of the time. Facing a half pot bet, pot odds ask for ${pct(direct)}. On pot odds alone the call loses. But when the flush arrives you will often win more than what is in the pot now, because your opponent may call a bet or bet again on the river. Those future chips are the implied odds.`,
          ],
        },
        {
          heading: 'How Much You Need To Win Later',
          paragraphs: [
            `The formula is the call times the chance of missing, divided by the chance of hitting, minus what is already in the middle. With a pot of 100, a bet of 50 and a flush draw on the turn, the answer is ${num(needed)} chips. You need to win about that much more, on average, on the river when you hit, for the call to break even.`,
            'That is more than half the size of the original pot. It is realistic only when stacks are deep enough for that bet to happen, when your opponent\'s hand is strong enough to pay it, and when your flush is not obvious. A draw that completes on a board where everyone can see it rarely gets paid in full.',
          ],
          table: {
            caption: 'Extra chips needed on the river to call a bet of 50 into 100, one card to come',
            head: ['Draw', 'Outs', 'Hits', 'Extra Needed'],
            rows: DRAWS.slice(0, 4).map((d) => [d.label, String(d.outs), pct(hitOnRiver(d.outs)), num(impliedOddsNeeded(50, 150, hitOnRiver(d.outs)))]),
          },
        },
        {
          heading: 'What Makes Implied Odds Good Or Bad',
          paragraphs: [
            'Deep stacks, a disguised draw and an opponent who cannot let go of a strong hand make implied odds large. Small pairs hoping to flop a set and suited connectors hoping to make a straight rely on exactly this, which is why they are better hands in deep cash games than in short stacked tournaments.',
            'Shallow stacks, an obvious draw and a cautious opponent make implied odds small. So do draws to hands that are not the best, such as a low flush draw when a higher flush is possible. Those draws carry reverse implied odds: when they hit and lose, they lose a big pot.',
            'Use the table as a sanity check. If the extra you need is larger than your opponent could plausibly pay, fold. If it is well within what they will pay when they have a strong hand, the call can be right even when the pot odds say no.',
          ],
        },
      ],
      related: ['pot-odds', 'counting-outs', 'stack-to-pot-ratio', 'expected-value'],
      glossary: ['implied-odds', 'reverse-implied-odds', 'outs', 'effective-stack'],
      train: { game: 'cash-009', tool: '/hub/training/equity-calculator' },
    };
  })(),
];
