/**
 * /learn POSTFLOP AND THEORY LESSONS. Numbers are computed by
 * src/lib/learn/pokerMath.js or read from the bundled corpus; sizing advice
 * that is a convention says so. Copy is written in plain case and Title
 * Cased by ../lessons.js on export.
 */
import { RFI } from '../../../config/solverRanges.js';
import {
  pct,
  num,
  bluffBreakEven,
  minimumDefenseFrequency,
  indifferentBluffShare,
  stackToPot,
  calledThreeBetPot,
  choose,
  combosWithDead,
} from '../../../lib/learn/pokerMath.js';

/** The flush arithmetic the board texture lesson prints. */
export function monotoneFlopFlushes() {
  const suitLeft = 13 - 3;
  const unseen = 52 - 3;
  return { suitLeft, unseen, made: choose(suitLeft, 2), all: choose(unseen, 2), share: choose(suitLeft, 2) / choose(unseen, 2) };
}

/** SPR at 100 big blinds for the three common preflop pot types. */
export function sprExamples() {
  const single = { pot: 2.5 + 2.5 + 0.5, behind: 100 - 2.5 }; // open 2.5, big blind calls, small blind folded
  const threeBet = { pot: calledThreeBetPot(7.5, 1.5), behind: 100 - 7.5 };
  const fourBet = { pot: calledThreeBetPot(20, 1.5), behind: 100 - 20 };
  return [
    { label: 'Single raised pot', ...single, spr: stackToPot(single.behind, single.pot) },
    { label: 'Three bet pot', ...threeBet, spr: stackToPot(threeBet.behind, threeBet.pot) },
    { label: 'Four bet pot', ...fourBet, spr: stackToPot(fourBet.behind, fourBet.pot) },
  ];
}

const CBET_SIZES = [
  { label: 'One third pot', bet: 1 / 3 },
  { label: 'Half pot', bet: 0.5 },
  { label: 'Three quarters pot', bet: 0.75 },
  { label: 'Pot', bet: 1 },
];

const SPR = sprExamples();
const FLUSHES = monotoneFlopFlushes();

export const POSTFLOP_LESSONS = [
  {
    slug: 'continuation-betting',
    title: 'Continuation Betting: When To C-Bet',
    category: 'Postflop',
    summary: `A continuation bet is a bet on the flop by the player who raised before it, and it works best on boards that favour the raiser's range: a one third pot c-bet needs to win the pot only ${pct(bluffBreakEven(1 / 3, 1))} of the time to profit as a pure bluff.`,
    sections: [
      {
        heading: 'Why The Preflop Raiser Bets',
        paragraphs: [
          'The player who raised before the flop usually holds the stronger range, because they raised while the caller only called. On many flops that advantage is large, especially on high card boards where the raiser has more big pairs and strong aces. A continuation bet uses that advantage: it wins the pot immediately when the caller has missed, and it builds the pot when the raiser has a strong hand.',
          'The price of a bluff is low when the bet is small. The table shows how often a pure bluff at each size must win the pot straight away to break even. Small bets need fewer folds, which is why a small c-bet with a large part of the range is a common strategy on dry boards.',
        ],
        table: {
          caption: 'How often a c-bet must win immediately, and how often the caller must defend',
          head: ['C-Bet Size', 'Needs Folds', 'Caller Defends At Least'],
          rows: CBET_SIZES.map((s) => [s.label, pct(bluffBreakEven(s.bet, 1)), pct(minimumDefenseFrequency(s.bet, 1))]),
        },
      },
      {
        heading: 'Which Boards To Bet',
        paragraphs: [
          'A common guideline is to bet small and often on dry, high card boards such as ace high or king high flops with no draws, where the raiser\'s range dominates and the caller has few strong hands. On these flops even hands with little showdown value can bet, because the caller will fold much of their range.',
          'On wet, connected boards such as 9 8 7 with two of a suit, the caller has many more strong hands and draws, and the raiser\'s advantage shrinks or disappears. Here a common approach is to bet less often and larger, concentrating on strong hands and good draws, and to check many hands that would have bet on a dry board.',
          'Position matters too. A raiser in position can check behind and see a free card, so it can afford to check more marginal hands. A raiser out of position who checks gives the caller the chance to bet, so it tends to bet or check with a clear plan for facing a bet.',
        ],
      },
      {
        heading: 'Common Mistakes',
        paragraphs: [
          'The first mistake is betting every flop out of habit. Against opponents who have learned to call or raise small c-bets, betting every flop loses money on the boards where your range is weakest. Build a reason for each bet: value, protection, or a bluff with a realistic chance of folding out better hands or improving.',
          'The second is giving up too easily after a called c-bet. The turn is where many pots are won, and a range that bets the flop should have a plan for which turn cards to keep betting and which to check. The third is using a different size for strong hands than for bluffs, which gives observant opponents an easy read.',
        ],
      },
    ],
    related: ['board-texture', 'bluff-break-even-percentage', 'check-raising', 'button-opening-range'],
    glossary: ['c-bet', 'range-advantage', 'board-texture', 'barrel', 'wet-board'],
    train: { game: 'cash-002' },
  },
  (() => {
    const pot = 100;
    const bet = 33;
    const raiseTo = 110;
    const alpha = bluffBreakEven(raiseTo, pot + bet);
    return {
      slug: 'check-raising',
      title: 'How To Check-Raise In Poker',
      category: 'Postflop',
      summary: `A check-raise is checking and then raising when your opponent bets, and it is one of the most powerful lines available to the player out of position: raising a one third pot bet to ${raiseTo} into ${pot} needs to work ${pct(alpha)} of the time as a pure bluff.`,
      sections: [
        {
          heading: 'Why Check-Raise',
          paragraphs: [
            'The player out of position acts first, which is a disadvantage on most streets. The check-raise turns it into a weapon. By checking, you let an aggressive opponent bet with a wide range, then raise to punish the bluffs and build a big pot with your strong hands. It is how an out of position player fights back against an opponent who bets too often.',
            'A check-raising range needs both kinds of hands. Strong made hands, such as sets and two pair, raise for value. Draws with good equity, such as flush draws and open ended straight draws, raise as semi bluffs, because they can win when the opponent folds and still improve when called. A range made only of strong hands is easy to fold against; a range made only of draws is easy to call against.',
          ],
        },
        {
          heading: 'The Price Of A Check-Raise',
          paragraphs: [
            `Suppose the pot is ${pot}, your opponent bets ${bet} and you raise to ${raiseTo}. You are risking ${raiseTo} to win the ${pot + bet} already in the middle, so as a pure bluff the raise must work ${pct(alpha)} of the time. That is a lot more than a small bet needs, which is why check-raise bluffs work best with hands that have backup equity when called.`,
            'The size of the raise is a choice. Larger raises need more folds as bluffs but charge draws more and build bigger pots for your value hands. Smaller raises risk less but give the bettor a better price to continue. Whatever size you choose, use it for your value hands and your semi bluffs alike.',
          ],
        },
        {
          heading: 'When To Do It',
          paragraphs: [
            'Check-raise more against opponents who continuation bet too often, and on boards that hit the checking player\'s range well, such as low, connected boards that a big blind defending range contains more of than a preflop raiser\'s range does. Check-raise bluff less against opponents who rarely bet without a strong hand, since your bluffs will run into hands that do not fold.',
            'Think about what happens next. After a check-raise is called, the pot is large and the stack to pot ratio is low, so plan which turn cards you will keep betting and which you will check. A check-raise with no plan for the turn often loses more than it wins.',
          ],
        },
      ],
      related: ['continuation-betting', 'big-blind-defense', 'bluff-break-even-percentage', 'board-texture'],
      glossary: ['semi-bluff', 'out-of-position', 'c-bet', 'fold-equity'],
      train: { game: 'cash-014' },
    };
  })(),
  {
    slug: 'board-texture',
    title: 'How To Read Board Texture',
    category: 'Postflop',
    summary: `Board texture describes how connected and suited the community cards are, and it decides which ranges the flop favours: a dry board such as K 7 2 of three suits changes little from street to street, while a monotone flop already gives ${FLUSHES.made} of the ${FLUSHES.all} possible two card hands a made flush.`,
    sections: [
      {
        heading: 'Dry And Wet Boards',
        paragraphs: [
          'A dry board has few ways to make strong hands or draws: unconnected ranks of different suits, such as K 7 2 with three suits. Few turn cards change which hand is best. A wet board has many: connected ranks, two or three of a suit, or both, such as 9 8 6 with two hearts. Many turn cards can change which hand is best.',
          'Texture matters because it decides how much protection a made hand needs and how much equity a draw has. On a dry board a hand such as top pair is fairly safe and can bet small or check. On a wet board the same hand faces many draws and often wants to bet larger to charge them.',
        ],
      },
      {
        heading: 'Counting What A Board Makes',
        paragraphs: [
          `Monotone boards show the arithmetic clearly. When all three flop cards share a suit, ${FLUSHES.suitLeft} cards of that suit remain among the ${FLUSHES.unseen} you cannot see on the board, so ${FLUSHES.made} of the ${FLUSHES.all} two card combinations are made flushes, ${pct(FLUSHES.share)} of all possible hands before anyone's range is considered. Real ranges contain more suited hands than random ones, so the share in a real range is higher.`,
          'Paired boards work the other way. A board such as 8 8 3 makes trips only for the few hands that hold an eight, so it is hard for either player to have a strong hand, and small bets and bluffs gain value.',
        ],
        table: {
          caption: 'Board types and what they usually favour',
          head: ['Board', 'Example', 'What It Tends To Favour'],
          rows: [
            ['Dry, high card', 'K 7 2 of three suits', 'The preflop raiser, small bets'],
            ['Wet, connected', '9 8 6 with two of a suit', 'The caller more than a dry board does, larger bets'],
            ['Monotone', 'Three cards of one suit', 'Players holding the high card of the suit'],
            ['Paired', '8 8 3', 'Small bets, hands that block the trips'],
            ['Low, connected', '6 5 4', 'The big blind defending range'],
          ],
        },
      },
      {
        heading: 'Range Advantage And Nut Advantage',
        paragraphs: [
          'Two questions about any board help more than any single rule. Which player has more strong hands on average, the range advantage? And which player has more of the very best hands, the nut advantage? The player with the range advantage can bet often. The player with the nut advantage can bet large.',
          'Ask both before the flop is even dealt. A preflop raiser from an early seat has more big pairs and strong broadway hands, so ace and king high boards favour them. A big blind that defended with many suited connectors and small pairs has more two pair and straight combinations on low, connected boards, and may take the betting lead there with a check-raise.',
        ],
      },
    ],
    related: ['continuation-betting', 'check-raising', 'counting-outs', 'blockers'],
    glossary: ['board-texture', 'wet-board', 'range-advantage', 'nut-advantage', 'backdoor-draw'],
    train: { game: 'cash-022' },
  },
  {
    slug: 'stack-to-pot-ratio',
    title: 'Stack To Pot Ratio (SPR) Explained',
    category: 'Postflop',
    summary: `Stack to pot ratio is the effective stack behind divided by the pot on the flop, and it tells you how committed a hand is: at 100 big blinds a single raised pot starts the flop near an SPR of ${num(SPR[0].spr)}, a three bet pot near ${num(SPR[1].spr)} and a four bet pot near ${num(SPR[2].spr)}.`,
    sections: [
      {
        heading: 'Working It Out',
        paragraphs: [
          'Divide the smaller of the two stacks still in the hand by the size of the pot when the flop is dealt. The table works through the three common preflop pot types at 100 big blinds, using an open to 2.5 big blinds, a three bet to 7.5 and a four bet to 20, with the blinds folding in the three and four bet pots and the big blind calling in the single raised pot.',
        ],
        table: {
          caption: 'SPR at 100 big blinds by preflop pot type',
          head: ['Pot Type', 'Pot On The Flop', 'Behind', 'SPR'],
          rows: SPR.map((s) => [s.label, `${num(s.pot)} BB`, `${num(s.behind)} BB`, num(s.spr)]),
        },
      },
      {
        heading: 'What SPR Tells You',
        paragraphs: [
          'A low SPR means the stacks can go in with a normal bet on each street, so strong one pair hands such as top pair with a good kicker are often worth committing with. A high SPR means there is room for several large bets, so one pair hands become harder to play for stacks and hands that make very strong holdings, such as sets and straights, gain value.',
          'A common guideline is that with an SPR below about 4, top pair is usually a hand to get all in with, and with an SPR above about 10 it usually is not, with the range in between depending on the board and the opponent. Treat the thresholds as rough markers rather than rules.',
        ],
      },
      {
        heading: 'Using SPR To Plan',
        paragraphs: [
          'SPR is most useful before the flop, as a planning tool. If you three bet and are called, you know the flop SPR will be low, so hands such as big pairs and strong aces play well. If you call an open with a small pair, you are hoping for a high SPR, because you need deep stacks behind to be paid when you flop a set.',
          'It also explains why the same hand plays differently in different formats. Tournament stacks are often shallow and SPRs low, so hands with high card strength gain value. Deep cash games create high SPRs, where speculative hands and position matter more. And straddles and antes shrink the effective SPR for everyone at the table.',
        ],
      },
    ],
    related: ['3-bet-sizing', 'implied-odds', 'straddle-games', 'facing-a-3-bet'],
    glossary: ['spr', 'effective-stack', 'implied-odds', '3-bet'],
    train: { game: 'adv-011' },
  },
];

const A5S_UTG = Math.round((RFI.UTG?.A5s?.raise || 0) * 100);
const OTHER_SPADES = 13 - 3 - 1; // three spades on the board, the ace in your hand

export const THEORY_LESSONS = [
  {
    slug: 'gto-vs-exploitative',
    title: 'GTO Versus Exploitative Poker',
    category: 'Theory',
    summary: 'A game theory optimal strategy is one no opponent can beat in the long run, and an exploitative strategy deliberately departs from it to win more against a specific opponent\'s mistakes; strong players learn the first as a baseline and use the second in practice.',
    sections: [
      {
        heading: 'What GTO Means',
        paragraphs: [
          'In game theory, an equilibrium is a pair of strategies where neither player can gain by changing theirs alone. In poker, a strategy that belongs to such an equilibrium is called game theory optimal, or GTO. In a two player game, played perfectly, it cannot lose against any opponent over the long run, and at best an opponent breaks even by also playing optimally. With three or more players that guarantee no longer strictly holds, although equilibrium strategies remain very hard to beat.',
          'No one plays real poker exactly at equilibrium. The game is far too large to solve completely, and solvers work on simplified versions with limited bet sizes. What players call GTO in practice is the output of those simplified models, a very strong approximation rather than a perfect answer.',
        ],
      },
      {
        heading: 'What Exploitative Play Means',
        paragraphs: [
          'An exploitative strategy starts from what a specific opponent does wrong. If a player folds too often to three bets, you three bet them more. If a player never bluffs the river, you fold your bluff catchers against their bets. Each adjustment wins more than the equilibrium strategy would against that opponent.',
          'The cost is exposure. Every adjustment moves you away from the strategy that cannot be beaten, so an opponent who notices can counter it. Against a player who does not adjust, that cost never arrives, which is why exploitative play earns most of the money at most tables.',
        ],
      },
      {
        heading: 'How To Use Both',
        paragraphs: [
          'Learn the baseline first. Knowing roughly what a balanced strategy does in common spots, how wide to open, how often to defend, how to size bets, tells you what normal looks like. Without that baseline you cannot tell whether an opponent is making a mistake or simply playing well.',
          'Then deviate for a reason. Gather evidence about an opponent, form a clear read, and make the adjustment that read calls for. Be ready to move back toward the baseline when you have no read, against strong players, or when you suspect you are being countered.',
          'The two approaches are not rivals. Equilibrium play protects you when you know little, and exploitative play pays you when you know a lot. The skill is knowing which situation you are in.',
        ],
      },
    ],
    related: ['mixed-strategies', 'minimum-defense-frequency', 'blockers', 'preflop-ranges-by-position'],
    glossary: ['gto', 'exploitative-play', 'nash-equilibrium', 'nodelocking'],
    train: { game: 'adv-001' },
  },
  {
    slug: 'mixed-strategies',
    title: 'Mixed Strategies And Frequencies',
    category: 'Theory',
    summary: `A mixed strategy plays the same hand in more than one way at set frequencies, so that opponents cannot tell which action a hand will take: in the Smarter.Poker preflop reference, for example, A5s is opened from under the gun ${A5S_UTG}% of the time and folded the rest.`,
    sections: [
      {
        heading: 'Why Mix',
        paragraphs: [
          'At equilibrium, some hands are exactly indifferent between two actions. Raising them and folding them win the same amount on average. For those hands the precise split does not change their own value, but it changes the value of every other hand in the range, because it decides how many hands your opponent has to worry about in each line.',
          'If you always take the same action with every hand of a type, an observant opponent can read your range from your action. Mixing keeps each line supplied with a believable number of strong hands and bluffs, so no line can be attacked cheaply.',
        ],
      },
      {
        heading: 'The Indifference Principle',
        paragraphs: [
          `The key idea is that a balanced bettor makes the caller indifferent, and a balanced caller makes the bettor indifferent. On the river, a polarised pot sized bet should contain bluffs ${pct(indifferentBluffShare(1, 1))} of the time, so a bluff catcher gains nothing by calling or folding. A half pot bet should contain bluffs ${pct(indifferentBluffShare(0.5, 1))} of the time. Against those frequencies no single response is better than any other, which is exactly the goal.`,
          `The same logic sets the caller's frequency. Facing a pot sized bet, a defender who continues ${pct(minimumDefenseFrequency(1, 1))} of the time leaves a pure bluff with no profit, and the bettor is then indifferent between bluffing and giving up.`,
        ],
      },
      {
        heading: 'Mixing In Practice',
        paragraphs: [
          'You cannot randomise perfectly at a table, and you do not need to. A common approach is to use something that varies but that you cannot control, such as the second hand of a clock or the suits of your cards, to decide the rare mixed spots. For most hands, the mix matters far less than getting the overall range right.',
          'Frequencies are also where exploitative adjustments live. If an opponent over folds, shift your mixed hands toward aggression. If they over call, shift your mixed bluffs toward checking. Knowing which of your hands are close enough to mix tells you which ones can be moved without costing much when the read is wrong.',
          'The preflop charts in this series show this directly: every cell below 100% is a mixed hand. Those are the hands where your read of the table should make the decision, and the listed frequency is where to start when you have no read.',
        ],
      },
    ],
    related: ['gto-vs-exploitative', 'bluff-break-even-percentage', 'utg-opening-range', 'minimum-defense-frequency'],
    glossary: ['mixed-strategy', 'frequency', 'gto', 'polarized-range'],
    train: { game: 'mixed-strategy-lab' },
  },
  {
    slug: 'blockers',
    title: 'Blockers: How Your Cards Change Theirs',
    category: 'Theory',
    summary: `A blocker is a card in your hand that makes certain hands impossible or less likely for your opponent: holding one ace cuts your opponent's ace king combinations from ${combosWithDead('AK')} to ${combosWithDead('AK', ['Ah'])}, which makes some bluffs and calls better than they look.`,
    sections: [
      {
        heading: 'How Blocking Works',
        paragraphs: [
          `Each card exists once in the deck. If it is in your hand, it cannot be in your opponent's. Ace king can be dealt ${combosWithDead('AK')} ways; if you hold an ace, your opponent can hold it only ${combosWithDead('AK', ['Ah'])} ways, and if you hold an ace and a king, only ${combosWithDead('AK', ['Ah', 'Kd'])}. Pocket aces can be dealt ${combosWithDead('AA')} ways, and only ${combosWithDead('AA', ['Ah'])} if you hold one ace.`,
          `The effect is sharpest with flushes. On a board with three spades, a player holding the ace of spades knows the opponent cannot hold the ace high flush, and removes all ${OTHER_SPADES} combinations of the ace of spades with another spade from their range.`,
        ],
        table: {
          caption: 'Opponent combinations left by the cards you hold',
          head: ['Opponent Hand', 'You Hold', 'Combinations Left'],
          rows: [
            ['AK', 'Nothing relevant', String(combosWithDead('AK'))],
            ['AK', 'One ace', String(combosWithDead('AK', ['Ah']))],
            ['AK', 'An ace and a king', String(combosWithDead('AK', ['Ah', 'Kd']))],
            ['AA', 'One ace', String(combosWithDead('AA', ['Ah']))],
            ['KK', 'One king', String(combosWithDead('KK', ['Kd']))],
          ],
        },
      },
      {
        heading: 'Choosing Bluffs With Blockers',
        paragraphs: [
          'A good bluff blocks the hands that would call it and does not block the hands that would fold. On a river where a flush completed, bluffing with the ace of the suit is attractive, because it removes the strongest flushes from your opponent\'s range, while hands with no card of the suit leave all of them in.',
          'Before the flop, the same logic makes suited aces such as A5s and A4s popular four bet bluffs. The ace blocks pocket aces and ace king, the hands that continue most strongly against a four bet, and the suit and the wheel give the hand some equity when it is called.',
        ],
      },
      {
        heading: 'Calling With Blockers',
        paragraphs: [
          'A good bluff catcher blocks the value hands and does not block the bluffs. If your opponent would bet the river with sets and a missed flush draw, a hand that holds one of the board pair or a set card makes their value hands less likely, while a hand holding a card of the missed flush suit makes their bluffs less likely and should be more careful.',
          'Keep the effect in proportion. Blockers change a range by a few combinations, which is decisive only in close spots. They are a tiebreaker between hands of similar strength, not a reason to call with a hand that is beaten by everything your opponent bets for value.',
        ],
      },
    ],
    related: ['counting-combos', 'facing-a-3-bet', 'bluff-break-even-percentage', 'mixed-strategies'],
    glossary: ['blocker', 'combo', 'polarized-range', '4-bet'],
    train: { game: 'adv-002' },
  },
];
