/**
 * /learn TOURNAMENT AND CASH GAME LESSONS. Every ICM figure is computed with
 * the Malmuth-Harville model in src/lib/learn/pokerMath.js; the stacks and
 * payouts are worked examples and are labelled as such in the copy. Copy is
 * written in plain case and Title Cased by ../lessons.js on export.
 */
import {
  pct,
  num,
  icmEquities,
  icmCallThreshold,
  mRatio,
  bountyRequiredEquity,
  priceOfCall,
  rakeFor,
  depthIn,
} from '../../../lib/learn/pokerMath.js';

const share = (stack, stacks) => stack / stacks.reduce((a, b) => a + b, 0);
const money = (value) => `${num(value, 2)}%`;

/** ICM basics: three players, 50/30/20 payouts. */
export const ICM_BASICS = { stacks: [5000, 3000, 2000], payouts: [50, 30, 20] };
/** The bubble: four players, three paid. */
export const BUBBLE = { stacks: [4000, 3000, 2000, 1000], payouts: [50, 30, 20] };
/** A six handed final table with a worked example payout ladder. */
export const FINAL_TABLE = { stacks: [40, 25, 15, 10, 6, 4], payouts: [35, 22, 15, 11, 9, 8] };
/** A satellite: five players, four identical seats. */
export const SATELLITE = { stacks: [40, 30, 20, 6, 4], payouts: [1, 1, 1, 1] };

export const TOURNAMENT_LESSONS = [
  (() => {
    const { stacks, payouts } = ICM_BASICS;
    const eq = icmEquities(stacks, payouts);
    return {
      slug: 'icm-basics',
      title: 'ICM Basics: Chips Are Not Money',
      category: 'Tournaments',
      summary: `The Independent Chip Model converts tournament chips into shares of the prize pool, and it shows that chips are not worth their face value: with half the chips in play and three players left, a 50/30/20 payout gives the chip leader ${money(eq[0])} of the prize pool, not 50%.`,
      sections: [
        {
          heading: 'Why Chips Are Not Money',
          paragraphs: [
            'In a cash game a chip is worth its face value, because you can leave with it. In a tournament you cannot. You are paid by where you finish, and the prize for finishing first is a fixed amount no matter how many chips you win it with. That is why each extra chip is worth a little less than the one before it, and each chip you lose costs more than a chip you win is worth.',
            'The Independent Chip Model, usually called ICM, puts a number on that. It estimates how often each player finishes in each paid place from their share of the chips, and multiplies those chances by the payouts.',
          ],
        },
        {
          heading: 'A Worked Example',
          paragraphs: [
            `Take three players with ${stacks.join(', ')} chips and payouts of ${payouts.join(', ')} percent of the prize pool. The Malmuth-Harville version of ICM says each player wins first place in proportion to their chips, so the chip leader wins ${pct(share(stacks[0], stacks))} of the time. Given who finished first, each remaining player finishes second in proportion to the chips that are left, and so on.`,
            `Run through every order and the chip leader's equity is ${money(eq[0])} of the prize pool, the middle stack's is ${money(eq[1])} and the short stack's is ${money(eq[2])}. The leader holds half the chips but less than half the money. The short stack holds a fifth of the chips and more than a fifth of the money, because it is already guaranteed a share of third place and can still move up.`,
          ],
          table: {
            caption: 'ICM equity, three players, 50/30/20 payouts, Malmuth-Harville',
            head: ['Player', 'Chips', 'Chip Share', 'Prize Equity'],
            rows: stacks.map((s, i) => [`Player ${i + 1}`, String(s), pct(share(s, stacks)), money(eq[i])]),
          },
        },
        {
          heading: 'What ICM Changes At The Table',
          paragraphs: [
            'Because losing chips costs more than winning them gains, calling an all in needs more equity near the money than a chip count alone suggests. Players who cover their opponents can apply pressure, because the short stacks have more to lose by calling. Short and medium stacks should avoid marginal confrontations with the chip leader.',
            'ICM has limits. It looks only at chip counts and payouts, not at position, blinds, skill or who is about to be forced all in. It is most accurate close to the money and at final tables, and less useful early in a tournament when the payouts are far away. Treat it as a strong guide to how much a chip is worth, not as a complete strategy.',
          ],
        },
      ],
      related: ['bubble-play', 'final-table-icm', 'satellite-strategy', 'pot-odds'],
      glossary: ['icm', 'equity', 'effective-stack', 'variance'],
      train: { game: 'mtt-002', tool: '/hub/training/icm-calculator' },
    };
  })(),
  (() => {
    const { stacks, payouts } = BUBBLE;
    const call = icmCallThreshold(stacks, payouts, 1, 0);
    const shortCall = icmCallThreshold(stacks, payouts, 3, 0);
    const eq = icmEquities(stacks, payouts);
    return {
      slug: 'bubble-play',
      title: 'Bubble Play In Poker Tournaments',
      category: 'Tournaments',
      summary: `On the bubble, calling an all in needs much more than 50% equity because busting costs your whole prize equity: in the worked example below a player with ${stacks[1]} chips needs ${pct(call.icm)} equity to call the chip leader's shove.`,
      sections: [
        {
          heading: 'The Bubble In Numbers',
          paragraphs: [
            `The bubble is the point where one more elimination puts everyone left in the money. Take four players with ${stacks.join(', ')} chips and three places paid at ${payouts.join(', ')} percent of the prize pool. Today the four players hold ${eq.map((e) => money(e)).join(', ')} of the prize pool under Malmuth-Harville ICM.`,
            `Now the chip leader moves all in and the ${stacks[1]} stack must decide. Ignoring the blinds, a call risks ${stacks[1]} chips to win ${stacks[1]}, so on chips alone it needs 50% equity. Under ICM the picture is different. If the call wins, the player's equity rises from ${money(call.now)} to ${money(call.win)} of the prize pool. If it loses, the player finishes fourth and wins nothing. Balancing those two outcomes, the call needs ${pct(call.icm)} equity to break even.`,
          ],
          table: {
            caption: 'Equity needed to call the chip leader\'s shove, bubble example',
            head: ['Caller', 'Chips', 'Chip EV Needs', 'ICM Needs'],
            rows: [
              ['Second in chips', String(stacks[1]), pct(call.chipEV), pct(call.icm)],
              ['Shortest stack', String(stacks[3]), pct(shortCall.chipEV), pct(shortCall.icm)],
            ],
          },
        },
        {
          heading: 'Who Should Do What',
          paragraphs: [
            'The gap between chip EV and ICM is the risk premium, and it is the whole strategy of the bubble. Large stacks can move in with a wide range, because the players they cover have to fold hands they would happily call with in a cash game. Medium stacks are under the most pressure, since they have a large share of the prize pool to lose and are not yet desperate.',
            'The shortest stack is the exception worth studying. It has the least to lose, because its equity is already small, and it is the most likely to bust anyway. In the example its threshold is lower than the medium stack\'s, which is why short stacks can still take a stand while a medium stack folds hands it would happily call with in a cash game.',
          ],
        },
        {
          heading: 'Playing The Bubble Well',
          paragraphs: [
            'With a big stack, open and shove more often, especially into medium stacks, and avoid confrontations with the one player who can bust you. With a medium stack, tighten your calling ranges far more than your opening ranges, since opening still wins the blinds when others fold. With a short stack, look for spots where you are first in, because moving all in yourself gives you fold equity that calling never does.',
            'Remember what the model leaves out. It ignores the blinds and the order of play, and in real tournaments a player about to post a big blind with a tiny stack changes everyone\'s incentives. Use ICM to understand the direction and size of the pressure, then adjust for the table in front of you.',
          ],
        },
      ],
      related: ['icm-basics', 'final-table-icm', 'm-ratio-and-short-stacks', 'satellite-strategy'],
      glossary: ['icm', 'fold-equity', 'effective-stack', 'equity'],
      train: { game: 'mtt-003', tool: '/hub/training/icm-calculator' },
    };
  })(),
  (() => {
    const { stacks, payouts } = FINAL_TABLE;
    const eq = icmEquities(stacks, payouts);
    return {
      slug: 'final-table-icm',
      title: 'Final Table ICM Strategy',
      category: 'Tournaments',
      summary: `At a final table every pay jump turns chips into money unevenly: in the six handed example below the chip leader holds ${pct(share(stacks[0], stacks))} of the chips but ${money(eq[0])} of the prize money left, and the shortest stack holds ${pct(share(stacks[5], stacks))} of the chips and ${money(eq[5])} of the money.`,
      sections: [
        {
          heading: 'The Example Table',
          paragraphs: [
            `The table below is a worked example, not a real tournament: six players with ${stacks.join(', ')} thousand chips, and a payout ladder of ${payouts.join(', ')} percent of the remaining prize money for first through sixth. Every figure is computed with the Malmuth-Harville model.`,
          ],
          table: {
            caption: 'Six handed final table, chip share against ICM equity',
            head: ['Seat', 'Chips', 'Chip Share', 'Prize Equity'],
            rows: stacks.map((s, i) => [`Player ${i + 1}`, `${s}k`, pct(share(s, stacks)), money(eq[i])]),
          },
        },
        {
          heading: 'Reading The Table',
          paragraphs: [
            'Every player finishes sixth or better, so the bottom of the ladder is already locked in and even the shortest stack is guaranteed a share of it. That floor is why the short stacks are worth more than their chips and the chip leader is worth less. The gap grows as the ladder gets flatter and shrinks as it gets steeper toward first place.',
            'This is why final tables reward patience from medium stacks. Each time a shorter stack busts, everyone left moves up a pay jump without risking a chip. A medium stack that gambles against the leader can lose all of that for a gain that ICM says is modest.',
          ],
        },
        {
          heading: 'How To Play Each Stack',
          paragraphs: [
            'The chip leader should pressure the stacks it covers, especially the medium stacks, which cannot call without large risk. It should avoid marginal spots against the second biggest stack, the one player who can take a large share of its chips back.',
            'Medium stacks should tighten their calls and look for opens and three bet shoves against players who cannot easily call. The shortest stacks should take their best spots before the blinds erode them, because a stack that is too small to make anyone fold loses the fold equity it needs to survive.',
            'Deals are common at final tables and ICM is often used to price them. An ICM based deal pays each player their equity from a table like the one above, which is fair to the model but ignores skill, so a stronger player may reasonably ask for more than ICM gives them.',
          ],
        },
      ],
      related: ['icm-basics', 'bubble-play', 'm-ratio-and-short-stacks', 'bounty-tournaments'],
      glossary: ['icm', 'equity', 'fold-equity', 'effective-stack'],
      train: { game: 'mtt-004', tool: '/hub/training/icm-calculator' },
    };
  })(),
  (() => {
    const stack = 12000;
    const m = mRatio(stack, 400, 800, 800);
    const bbs = stack / 800;
    return {
      slug: 'm-ratio-and-short-stacks',
      title: 'M Ratio And Short Stack Play',
      category: 'Tournaments',
      summary: `M measures how many orbits a stack can survive without playing a hand: a stack of 12,000 with blinds of 400 and 800 and an 800 big blind ante has an M of ${num(m)}, which is ${num(bbs)} big blinds and short enough to play push or fold.`,
      sections: [
        {
          heading: 'Measuring A Stack',
          paragraphs: [
            `M, popularised by Dan Harrington, is your stack divided by the cost of one full orbit: the small blind, the big blind and all the antes. In the example the orbit costs 400 plus 800 plus 800, so M is ${stack} divided by ${400 + 800 + 800}, which is ${num(m)}. Counting in big blinds gives ${num(bbs)}. Most players today talk in big blinds, and M is most useful when antes make the orbit much more expensive than the blinds alone.`,
            'A common framework, from Harrington, groups stacks into zones. An M of 20 or more leaves room for all of poker. Between 10 and 20 you should avoid speculative hands. Between 6 and 10 you should look for spots to move all in first. Below 6 you are close to push or fold, and below 1 you are all in with almost anything the first time the action folds to you.',
          ],
          table: {
            caption: 'Harrington\'s stack zones, a common framework',
            head: ['M', 'Zone', 'What It Allows'],
            rows: [
              ['20 or more', 'Green', 'Full range of plays, including speculative hands'],
              ['10 to 20', 'Yellow', 'Fewer speculative hands, more raising first in'],
              ['6 to 10', 'Orange', 'Moving all in first becomes the main weapon'],
              ['1 to 6', 'Red', 'Push or fold'],
              ['Below 1', 'Dead', 'All in at the first chance'],
            ],
          },
        },
        {
          heading: 'Why Short Stacks Push Instead Of Raise',
          paragraphs: [
            'With a short stack, a standard raise commits so much of your stack that you cannot fold to a re-raise, and a re-raise tells your opponent exactly when to put you all in. Moving all in yourself removes that problem. It wins the blinds and antes whenever everyone folds, and when you are called you still have your equity in the hand.',
            'That fold equity is why the first player in has a large edge over the player who calls. A hand strong enough to shove may be far too weak to call a shove with, because the caller has no fold equity at all and must simply be ahead often enough.',
          ],
        },
        {
          heading: 'Practical Tips',
          paragraphs: [
            'Act before the blinds make the decision for you. A stack at 10 big blinds that waits for a premium hand can easily be at 6 by the time it arrives, and a 6 big blind shove folds out far fewer hands than a 10 big blind one.',
            'Wider is right from late position, where fewer players are left to wake up with a hand. Near the money bubble, ICM makes every call more expensive for the players you shove into, which works in your favour, and makes every elimination more expensive for you, so weigh both before you move in.',
          ],
        },
      ],
      related: ['20bb-opening-ranges', 'bubble-play', 'icm-basics', 'bounty-tournaments'],
      glossary: ['effective-stack', 'fold-equity', 'blinds', 'icm'],
      train: { game: 'mtt-001', tool: '/hub/training/icm-calculator' },
    };
  })(),
  (() => {
    const pot = 21.5;
    const call = 20;
    const plain = priceOfCall(call, pot);
    const withBounty = (chips) => bountyRequiredEquity(call, pot, chips);
    return {
      slug: 'bounty-tournaments',
      title: 'Bounty And PKO Tournament Strategy',
      category: 'Tournaments',
      summary: `A bounty lowers the equity you need to call an all in, because busting the player wins you the bounty as well as the pot: calling 20 big blinds into 21.5 needs ${pct(plain)} equity alone, and ${pct(withBounty(10))} if you value the bounty at 10 big blinds.`,
      sections: [
        {
          heading: 'How Bounties Work',
          paragraphs: [
            'In a bounty tournament part of every buy in goes to a bounty on each player, paid to whoever eliminates them. In a progressive knockout, or PKO, part of each bounty you win is paid to you immediately and the rest is added to your own bounty, so the players who have busted others carry the biggest prices on their heads. A half and half split is common.',
            'That structure changes the math of every all in against a player you cover. You are no longer playing only for the chips in the middle. You are also playing for the bounty, which is worth something only if you win the hand and the player is out.',
          ],
        },
        {
          heading: 'The Math Of Calling',
          paragraphs: [
            `Suppose an opponent moves all in for 20 big blinds, you cover them, and you must call 20 into a pot of 21.5 that already includes their shove and the blinds. Without a bounty the call needs ${pct(plain)} equity. If you value the bounty at 10 big blinds worth of chips, the call needs ${pct(withBounty(10))}. At 20 big blinds it needs ${pct(withBounty(20))}.`,
            'The hard part is valuing the bounty in chips. It depends on how much of it is paid immediately, how much of the tournament is left and how much of the prize pool sits in bounties rather than in the payouts. Early in a progressive knockout a bounty is worth relatively little compared to the stacks; late in one, when bounties have grown, it can be worth more than the pot itself.',
          ],
          table: {
            caption: 'Equity needed to call 20 into 21.5, by the value you put on the bounty',
            head: ['Bounty Value In Big Blinds', 'Equity Needed'],
            rows: [0, 5, 10, 20, 30].map((b) => [String(b), pct(withBounty(b))]),
          },
        },
        {
          heading: 'Strategy Adjustments',
          paragraphs: [
            'Call wider against players you cover, especially short stacks with large bounties. Be more careful against players who cover you, because you are not winning their bounty if you win the hand. Expect opponents to call your shoves wider for the same reason, so shove a little tighter when your own bounty is large.',
            'Bounties also change multiway pots. Two players may call a short stack\'s shove because both want the bounty, which means the player who is all in faces worse odds and the callers must think about each other\'s ranges as well as the shover\'s.',
          ],
        },
      ],
      related: ['pot-odds', 'm-ratio-and-short-stacks', 'icm-basics', 'final-table-icm'],
      glossary: ['equity', 'pot-odds', 'effective-stack', 'fold-equity'],
      train: { game: 'mtt-005' },
    };
  })(),
  (() => {
    const { stacks, payouts } = SATELLITE;
    const eq = icmEquities(stacks, payouts);
    const flip = icmCallThreshold(stacks, payouts, 0, 2);
    return {
      slug: 'satellite-strategy',
      title: 'Satellite Tournament Strategy',
      category: 'Tournaments',
      summary: `In a satellite every seat pays the same, so once you have enough chips extra chips are worth almost nothing: in the example below the chip leader already has a ${pct(eq[0])} chance of a seat and would need ${pct(flip.icm)} equity to call an all in from the third stack.`,
      sections: [
        {
          heading: 'Why Satellites Are Different',
          paragraphs: [
            'A satellite awards a fixed number of identical prizes, usually seats in a bigger event. Finishing first pays exactly the same as finishing last among the winners. That makes the payout structure as flat as it can be, and a flat structure is where ICM pressure is strongest.',
            `Take five players with ${stacks.join(', ')} thousand chips and four seats to give away. Under Malmuth-Harville ICM the players' chances of a seat are ${eq.map((e) => pct(e)).join(', ')}. The chip leader is already very close to certain, so every chip it wins adds almost nothing, while every chip it loses risks the seat.`,
          ],
          table: {
            caption: 'Chance of a seat, five players, four seats, Malmuth-Harville',
            head: ['Player', 'Chips', 'Chance Of A Seat'],
            rows: stacks.map((s, i) => [`Player ${i + 1}`, `${s}k`, pct(eq[i])]),
          },
        },
        {
          heading: 'The Cost Of Calling',
          paragraphs: [
            `If the third stack moves all in on the chip leader, the leader risks ${stacks[2]} thousand chips to win ${stacks[2]} thousand. On chips alone that is a 50% decision. Under ICM, winning moves the leader from ${pct(flip.now)} to ${pct(flip.win)} of a seat, while losing drops it to ${pct(flip.lose)}. The call needs ${pct(flip.icm)} equity, which only the very strongest starting hands have against a typical shoving range.`,
            'This is why satellite experts fold hands that would be automatic calls in any other format, including very strong pairs, once their seat is nearly secure. The folding is not timid. It is the correct price of a chip when extra chips cannot buy anything.',
          ],
        },
        {
          heading: 'Playing For A Seat',
          paragraphs: [
            'Build a stack early, when the seats are far away and chips still have close to normal value. As the bubble approaches, work out roughly how many chips a seat needs, and once you have them, stop taking risks and let the shorter stacks fight.',
            'If you are short, you need chips, and you need them before the blinds take them. Look for spots where you are first in and the players behind you are the big stacks who cannot call. They should fold, and in a well played satellite they usually will.',
          ],
        },
      ],
      related: ['icm-basics', 'bubble-play', 'm-ratio-and-short-stacks', 'final-table-icm'],
      glossary: ['icm', 'fold-equity', 'equity', 'variance'],
      train: { game: 'mtt-006', tool: '/hub/training/icm-calculator' },
    };
  })(),
];

/** A worked example rake structure, stated as such in the copy. */
export const RAKE_EXAMPLE = { rate: 0.05, cap: 3, pots: [4, 10, 20, 40, 60, 100] };

export const CASH_LESSONS = [
  (() => {
    const { rate, cap, pots } = RAKE_EXAMPLE;
    const at = (p) => rakeFor(p, rate, cap);
    return {
      slug: 'rake-and-win-rate',
      title: 'How Rake Affects Your Win Rate',
      category: 'Cash',
      summary: `Rake is the fee a cash game takes from each pot, and because it is capped it costs small pots the most: in an example structure of ${pct(rate)} capped at ${cap} big blinds, a 10 big blind pot pays ${num(at(10))} big blinds and a 100 big blind pot pays only ${num(at(100))}, which is ${pct(at(100) / 100)}.`,
      sections: [
        {
          heading: 'How Rake Is Taken',
          paragraphs: [
            `Most cash games take a percentage of each pot up to a cap. Many also follow a rule often called no flop no drop, where a pot that ends before the flop pays no rake. The structure varies by room and stake, so always read the one you are playing. The figures below use an example of ${pct(rate)} capped at ${cap} big blinds to show the shape, not any particular room.`,
          ],
          table: {
            caption: `Rake by pot size, example structure of ${pct(rate)} capped at ${cap} big blinds`,
            head: ['Pot', 'Rake', 'Effective Rate'],
            rows: pots.map((p) => [`${p} BB`, `${num(at(p), 2)} BB`, pct(at(p) / p)]),
          },
        },
        {
          heading: 'What Rake Does To Strategy',
          paragraphs: [
            `Because the cap only bites in large pots, small and medium pots pay the full rate. In the example, every pot up to ${num(cap / rate)} big blinds pays the full ${pct(rate)}, and only the largest pots pay less. A player who wins many small pots pays far more rake per big blind won than a player who wins fewer, larger ones.`,
            'That pushes good strategy in a clear direction. Limping and calling to see cheap flops is expensive, because those small pots are raked at the highest effective rate. Raising first in and winning the blinds before the flop is cheap, because under no flop no drop those pots are not raked at all. The higher the rake, the more a tight aggressive opening strategy is rewarded.',
          ],
        },
        {
          heading: 'Measuring Rake Against Your Results',
          paragraphs: [
            'Win rates in cash games are usually measured in big blinds won per 100 hands. Rake comes straight out of that number, so the same player can be a winner in a lightly raked game and a loser in a heavily raked one. Track what you pay, not only what you win, and compare it with your win rate.',
            'Rakeback and loyalty programmes return part of the rake to players, and in heavily raked games they can be the difference between winning and losing. Factor them into any comparison between games. Smarter.Poker itself uses play credit only, with no real money gambling, so this lesson describes cash games you may play elsewhere; you can practise the preflop discipline that rake rewards in the training games here.',
          ],
        },
      ],
      related: ['cash-game-bankroll', 'preflop-ranges-by-position', 'straddle-games', 'expected-value'],
      glossary: ['rake', 'rakeback', 'rfi', 'expected-value'],
      train: { game: 'cash-017' },
    };
  })(),
  (() => {
    const deep = depthIn(100, 2);
    return {
      slug: 'straddle-games',
      title: 'How To Play In Straddle Games',
      category: 'Cash',
      summary: `A straddle is a voluntary blind raise before the cards are dealt, usually twice the big blind, and it makes every stack effectively shallower: 100 big blinds facing a 2 big blind straddle is only ${num(deep)} straddles deep.`,
      sections: [
        {
          heading: 'What A Straddle Is',
          paragraphs: [
            'In most games that allow it, the player to the left of the big blind may post a straddle of twice the big blind before the cards are dealt. The straddle acts like a third blind: action starts with the player to its left, and the straddler acts last before the flop. Some rooms allow a straddle from other seats, most often the button, and the order of action changes with it. House rules differ, so check them before you play.',
            'The straddle doubles the size of the blinds without changing anyone\'s stack. Measured against the biggest forced bet, everyone is now half as deep.',
          ],
        },
        {
          heading: 'How Stack Depth Changes',
          paragraphs: [
            `A 100 big blind stack is ${num(deep)} straddles deep. Standard open sizes and three bet sizes are usually scaled from the straddle rather than the big blind, so a straddled game plays like a game with half the stacks. Hands that rely on deep stacks and implied odds, such as small pairs and suited connectors, lose value, and hands with high card strength gain it.`,
          ],
          table: {
            caption: 'Effective depth measured in straddles, 2 big blind straddle',
            head: ['Stack In Big Blinds', 'Depth In Straddles'],
            rows: [50, 100, 200, 300].map((s) => [String(s), num(depthIn(s, 2))]),
          },
        },
        {
          heading: 'Adjusting Your Strategy',
          paragraphs: [
            'Tighten your opening ranges from the first seats after the straddle, because one more player who has already invested, the straddler, is left to act behind you with a discount to defend. Open larger, scaling the usual size to the straddle. Treat the straddler like a big blind with a wider defending range, because they have already put in the largest forced bet.',
            'Straddled games often play looser and more multiway than normal games, because the straddle creates a bigger pot before anyone has looked at their cards. Value bet more and bluff less into several opponents, and remember that the stack to pot ratio after the flop will be lower than you are used to, so top pair is more often a hand to commit with.',
            'If you are the straddler, you have posted a blind you did not have to post and will play the rest of the hand out of position against most of the table. That is a cost you choose to pay, so straddle for a reason you can name rather than by habit.',
          ],
        },
      ],
      related: ['stack-to-pot-ratio', 'rake-and-win-rate', '3-bet-sizing', 'preflop-ranges-by-position'],
      glossary: ['straddle', 'effective-stack', 'spr', 'blinds'],
      train: { game: 'cash-019' },
    };
  })(),
];
