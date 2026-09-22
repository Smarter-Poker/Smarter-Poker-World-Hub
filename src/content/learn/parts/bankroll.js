/**
 * /learn BANKROLL AND MENTAL GAME LESSONS. Buy in counts are conventions and
 * the copy says so every time; the risk of ruin and variance figures are
 * computed by src/lib/learn/pokerMath.js from assumptions the copy states.
 *
 * Smarter.Poker is play credit only, with no real money gambling. These
 * lessons describe poker bankrolls in general and never imply that the
 * platform takes or pays real money. Copy is written in plain case and
 * Title Cased by ../lessons.js on export.
 */
import { pct, num, riskOfRuin, sampleOutcome } from '../../../lib/learn/pokerMath.js';

/** The assumptions every computed bankroll figure uses, stated in the copy. */
export const BANKROLL_ASSUMPTIONS = { winRate: 5, sd: 100, buyIn: 100 };

/** The platform note every bankroll lesson carries. */
export const PLAY_CREDIT_NOTE =
  'Smarter.Poker itself is free to play with play credit only and no real money gambling, so nothing here is about money on this platform. These are the rules players use for poker bankrolls elsewhere. The Bankroll Manager here is a record of the sessions you enter yourself, wherever you played them, so you can practise the record keeping these rules depend on; it handles no money.';

const { winRate, sd, buyIn } = BANKROLL_ASSUMPTIONS;
const ruinAt = (buyIns) => riskOfRuin(winRate, sd, buyIns * buyIn);

export const BANKROLL_LESSONS = [
  {
    slug: 'cash-game-bankroll',
    title: 'Bankroll Rules For Cash Games',
    category: 'Bankroll',
    summary: `A common guideline for no limit cash games is to keep 20 to 50 buy ins for the stake you play, because even a winning player can lose many buy ins in a row: at the example win rate below, 20 buy ins still carries a ${pct(ruinAt(20))} risk of going broke.`,
    sections: [
      {
        heading: 'The Guideline',
        paragraphs: [
          'A buy in in no limit cash is usually 100 big blinds. The number of buy ins players keep is a convention, not a law, and it ranges from about 20 for a confident winner in a soft game to 50 or more for a player who wants to sleep at night or plays a tougher, higher variance game. Fewer buy ins means a real chance of losing the whole bankroll during an ordinary downswing.',
          PLAY_CREDIT_NOTE,
        ],
      },
      {
        heading: 'What The Numbers Say',
        paragraphs: [
          `The table uses the standard risk of ruin formula with assumptions chosen for the example: a win rate of ${winRate} big blinds per 100 hands and a standard deviation of ${sd} big blinds per 100 hands. Those are illustrative figures for a winning six handed player, not measurements of anyone. Your own numbers can be very different, and a lower win rate or a higher standard deviation raises every risk in the table.`,
        ],
        table: {
          caption: `Risk of ruin at ${winRate} BB per 100 and a standard deviation of ${sd} BB per 100`,
          head: ['Bankroll In Buy Ins', 'Risk Of Ruin'],
          rows: [10, 20, 30, 40, 50].map((b) => [String(b), pct(ruinAt(b), 2)]),
        },
      },
      {
        heading: 'Moving Up And Down',
        paragraphs: [
          'A bankroll rule is only useful if it also says when to move. A common approach is to move up a stake when your bankroll reaches your chosen number of buy ins for the next level, and to move back down when it falls below the number for the level you are on. Deciding the numbers in advance, when you are calm, removes the decision from the moment you are least able to make it well.',
          'Taking a shot at a higher stake is fine if it is planned. Set aside a fixed number of buy ins for the attempt, and if you lose them, return to your normal stake without chasing. The loss is part of the plan, not a disaster.',
          'Keep poker money separate from living expenses. A bankroll that you might need for rent is not a bankroll, and the pressure of needing to win changes how you play, usually for the worse.',
        ],
      },
    ],
    related: ['risk-of-ruin', 'tournament-bankroll', 'variance-and-downswings', 'rake-and-win-rate'],
    glossary: ['variance', 'expected-value', 'rake'],
    train: { game: 'psy-014', tool: '/hub/bankroll-manager' },
  },
  {
    slug: 'tournament-bankroll',
    title: 'Bankroll Rules For Tournaments',
    category: 'Bankroll',
    summary: 'A common guideline for multi table tournaments is to keep at least 100 buy ins, and more for large fields, because most entries finish outside the money and a winning player can go hundreds of tournaments without a big score.',
    sections: [
      {
        heading: 'Why Tournaments Need More',
        paragraphs: [
          'Tournament payouts are top heavy. Only a minority of the field is paid, commonly somewhere around 10 to 15% of entries, and most of the prize pool goes to the final table. A winning player therefore loses their buy in most of the time and makes their profit from rare deep runs. That makes results far more volatile than in a cash game, where a good session can come any day.',
          'The bigger the field, the rarer the deep run, and the larger the bankroll needed to survive the wait between them. A player who plays small fields of a hundred people needs less than a player who plays fields of several thousand at the same buy in.',
          PLAY_CREDIT_NOTE,
        ],
      },
      {
        heading: 'Common Guidelines By Format',
        paragraphs: [
          'The figures in the table are conventions that players and coaches commonly suggest, not computed results. They assume a winning player. A player who is not yet sure they beat the game should keep more, or treat the money as entertainment spending rather than a bankroll.',
        ],
        table: {
          caption: 'Commonly suggested tournament bankrolls, conventions not computations',
          head: ['Format', 'A Common Guideline'],
          rows: [
            ['Small field multi table tournaments', '100 buy ins or more'],
            ['Large field multi table tournaments', '200 buy ins or more'],
            ['Bounty and knockout tournaments', 'As for a multi table field of the same size'],
            ['Mixing buy in levels', 'Count buy ins at your average buy in'],
          ],
        },
      },
      {
        heading: 'Managing A Tournament Bankroll',
        paragraphs: [
          'Measure by average buy in rather than by the most expensive tournament you play. If most of your schedule is at one level with an occasional bigger event, the bigger event should be a small share of your total bankroll.',
          'Expect long losing stretches and plan for them. A player can be playing well and still go months without a significant cash. Track your results over hundreds of tournaments before drawing conclusions, and review your decisions, not your finishes, in the meantime.',
          'Consider satellites and lower buy ins when your bankroll is thin. Winning a seat through a satellite lets you play a bigger event for a fraction of its cost, which is one of the most bankroll friendly ways to take a shot.',
        ],
      },
    ],
    related: ['cash-game-bankroll', 'sit-and-go-and-spin-bankroll', 'satellite-strategy', 'variance-and-downswings'],
    glossary: ['variance', 'icm', 'expected-value'],
    train: { game: 'psy-014', tool: '/hub/bankroll-manager' },
  },
  {
    slug: 'sit-and-go-and-spin-bankroll',
    title: 'Bankroll Rules For Sit And Goes, Spins',
    category: 'Bankroll',
    summary: 'A common guideline for single table sit and goes is 50 to 100 buy ins, and for lottery style spin games with random prize multipliers many players keep 100 or more, because a large share of the prize money sits in multipliers that come up rarely.',
    sections: [
      {
        heading: 'Single Table Sit And Goes',
        paragraphs: [
          'A single table sit and go pays a few places out of one table, so results are much steadier than in a large tournament. A winning player cashes often and the swings are moderate. That is why the common guideline is lower than for multi table events, usually 50 to 100 buy ins depending on the speed of the structure. Faster structures, called turbos and hypers, rely more on short stacked all in play and swing harder, so they sit at the top of that range.',
          PLAY_CREDIT_NOTE,
        ],
      },
      {
        heading: 'Spin Games And Random Multipliers',
        paragraphs: [
          'Spin games are three handed hyper turbos in which the prize is set by a random multiplier revealed when the game starts. Most games pay a small multiple of the buy in, and a small number pay a very large one. Because part of every buy in funds those rare jackpots, the lowest multiplier games pay out less in total than the players put in, and a large share of a regular player\'s results depends on whether they happen to win the big multipliers they land in.',
          'That structure makes variance very high, which is why players commonly keep 100 buy ins or more and judge their results only over thousands of games. The skill edge in spins lives mainly in short stacked play, so preflop and push or fold study pays off more than anywhere else.',
        ],
        table: {
          caption: 'Commonly suggested bankrolls, conventions not computations',
          head: ['Format', 'A Common Guideline'],
          rows: [
            ['Single table sit and go, regular speed', '50 buy ins or more'],
            ['Single table sit and go, turbo or hyper', '75 to 100 buy ins'],
            ['Spin games with random multipliers', '100 buy ins or more'],
          ],
        },
      },
      {
        heading: 'Staying On Plan',
        paragraphs: [
          'The format rewards volume, and volume is where tilt does the most damage. Decide in advance how many games a session will be and what result, good or bad, ends it early. A string of losses in hyper turbos is normal, and chasing it by adding tables or moving up turns an ordinary downswing into a real one.',
          'Record every game, including the multiplier for spins. Without that record it is impossible to tell whether you are running badly on multipliers or playing badly in the games, and those two problems need very different fixes.',
        ],
      },
    ],
    related: ['tournament-bankroll', 'm-ratio-and-short-stacks', 'tilt-control', 'risk-of-ruin'],
    glossary: ['variance', 'icm', 'expected-value'],
    train: { game: 'spins-001', tool: '/hub/bankroll-manager' },
  },
  {
    slug: 'risk-of-ruin',
    title: 'Risk Of Ruin: How Much Bankroll Is Enough',
    category: 'Bankroll',
    summary: `Risk of ruin is the chance of losing a whole bankroll before your edge shows, and it falls fast as the bankroll grows: at the example win rate and standard deviation below it is ${pct(ruinAt(20), 1)} with 20 buy ins and ${pct(ruinAt(50), 2)} with 50.`,
    sections: [
      {
        heading: 'The Formula',
        paragraphs: [
          'The standard approximation says risk of ruin equals e raised to the power of minus two times your win rate times your bankroll, divided by the variance of your results. Win rate, standard deviation and bankroll all have to be measured in the same unit, big blinds here, and win rate and standard deviation over the same number of hands.',
          `The figures below assume a win rate of ${winRate} big blinds per 100 hands, a standard deviation of ${sd} big blinds per 100 hands, and buy ins of ${buyIn} big blinds. They are illustrative assumptions chosen for the example, not typical or measured values. Doubling the bankroll squares the risk of ruin, which is why the numbers shrink so quickly.`,
          PLAY_CREDIT_NOTE,
        ],
        table: {
          caption: `Risk of ruin at ${winRate} BB per 100, standard deviation ${sd} BB per 100`,
          head: ['Buy Ins', 'Big Blinds', 'Risk Of Ruin'],
          rows: [10, 20, 30, 40, 50, 75].map((b) => [String(b), String(b * buyIn), pct(ruinAt(b), 2)]),
        },
      },
      {
        heading: 'What The Formula Assumes',
        paragraphs: [
          'The formula treats your results as a smooth random walk with a win rate that is known exactly and never changes. Neither is true. Your real win rate is an estimate with a wide margin of error unless you have played a very large number of hands, and it changes as you improve, as games change and as you tilt.',
          'Because a real win rate is uncertain, the honest use of the formula is to try several win rates, including a much lower one than you hope for, and to keep a bankroll that is safe against the pessimistic case. A player whose true win rate is zero or negative has a risk of ruin of 100% no matter how large the bankroll is.',
        ],
      },
      {
        heading: 'Using It Well',
        paragraphs: [
          'Pick the risk you can accept first, then work out the bankroll. Many players are comfortable with a risk of a few percent, others want less than one percent. The formula turns that choice into a number of buy ins for your own win rate and variance.',
          'Recalculate as your data grows. After a few hundred thousand hands your estimates will be much tighter, and the right bankroll may move up or down. And remember that a bankroll can be replenished only if you have money outside poker to do it with; if you do not, be more conservative.',
        ],
      },
    ],
    related: ['cash-game-bankroll', 'variance-and-downswings', 'tournament-bankroll', 'expected-value'],
    glossary: ['variance', 'expected-value'],
    train: { game: 'psy-016', tool: '/hub/bankroll-manager' },
  },
];

const SAMPLE = sampleOutcome(winRate, sd, 10000);
const LONG = sampleOutcome(winRate, sd, 100000);

export const MENTAL_LESSONS = [
  {
    slug: 'tilt-control',
    title: 'How To Control Tilt At The Poker Table',
    category: 'Mental Game',
    summary: 'Tilt is any emotional state that makes you play worse than you know how to, and the most reliable control is a plan decided before the session: warning signs you watch for, a break you take when they appear, and a stop rule you do not argue with.',
    sections: [
      {
        heading: 'What Tilt Is',
        paragraphs: [
          'Tilt is usually pictured as anger after a bad beat, but it is broader than that. Frustration at a run of cards, the need to win back a loss, boredom after hours of folding, overconfidence after a big win and fear of losing a stack can all push you away from the decisions you would make with a clear head.',
          'The common thread is that the emotion changes the decision. You call because you want to see the hand, not because the price is right. You bluff because you feel you are owed a pot. You play a hand you would fold because you are tired of waiting.',
        ],
      },
      {
        heading: 'Spotting It Early',
        paragraphs: [
          'Tilt is easiest to stop before it takes hold. Learn your own warning signs: playing faster than usual, replaying a hand in your head while the next one is dealt, raising the stakes or the number of tables, a tight chest, or talking to the screen. Write them down, because they are hard to notice from the inside once they start.',
          'A useful habit is a short check after every big pot, win or lose. Are you still thinking about the last hand? Are you about to change how you play because of it? If the answer is yes, take a break before the next decision rather than after the next mistake.',
        ],
      },
      {
        heading: 'A Plan That Works',
        paragraphs: [
          'Decide your stop rules before you sit down, when you are calm. A common guideline is a stop loss of a fixed number of buy ins for the session, often two or three in cash games, and a time limit, because focus fades whatever the result. When a rule triggers, end the session. The rule only works if it is not up for debate in the moment.',
          'Separate results from decisions in how you review. After a session, look at the hands where you felt the strongest emotion and ask whether the decision was right given what you knew. A good decision that lost is not a mistake, and treating it as one is the fastest way to start tilting again next time.',
          'Look after the basics. Sleep, food, and not playing when you are already upset about something else make a larger difference than any technique. And when a downswing goes on long enough to wear you down, drop in stakes or take a few days off; the games will still be there.',
        ],
      },
    ],
    related: ['variance-and-downswings', 'results-oriented-thinking', 'cash-game-bankroll', 'expected-value'],
    glossary: ['tilt', 'variance', 'expected-value'],
    train: { game: 'psy-001', tool: '/hub/training/tilt-guard' },
  },
  {
    slug: 'variance-and-downswings',
    title: 'Poker Variance And How To Survive It',
    category: 'Mental Game',
    summary: `Variance is the gap between what your decisions earn on average and what actually happens, and it is large: at the example win rate below, a winning player still finishes 10,000 hands behind about ${pct(SAMPLE.chanceBehind, 0)} of the time.`,
    sections: [
      {
        heading: 'How Big The Swings Are',
        paragraphs: [
          `Suppose a player truly wins ${winRate} big blinds per 100 hands with a standard deviation of ${sd} big blinds per 100 hands. Those are illustrative figures for the example, not a measurement of anyone. Over 10,000 hands that player expects to win ${num(SAMPLE.mean, 0)} big blinds, but the standard deviation of the result is ${num(SAMPLE.sd, 0)} big blinds. Ninety five times in a hundred the result lands somewhere between ${num(SAMPLE.low, 0)} and ${num(SAMPLE.high, 0)} big blinds, and about ${pct(SAMPLE.chanceBehind, 0)} of the time it is a loss.`,
          `Over 100,000 hands the expected result is ${num(LONG.mean, 0)} big blinds and the chance of finishing behind falls to about ${pct(LONG.chanceBehind, 1)}. Time is the only thing that separates skill from luck, and it takes much more of it than most players expect.`,
        ],
        table: {
          caption: `Results at ${winRate} BB per 100 and a standard deviation of ${sd} BB per 100`,
          head: ['Hands', 'Expected Result', '95% Range', 'Chance Of Being Behind'],
          rows: [1000, 10000, 50000, 100000].map((h) => {
            const o = sampleOutcome(winRate, sd, h);
            return [String(h), `${num(o.mean, 0)} BB`, `${num(o.low, 0)} to ${num(o.high, 0)} BB`, pct(o.chanceBehind, 1)];
          }),
        },
      },
      {
        heading: 'What This Means For You',
        paragraphs: [
          'A losing month does not prove you are a losing player, and a winning month does not prove you are a winning one. Samples of a few thousand hands say very little about your true win rate. Judge your game by the quality of your decisions, reviewed honestly, and by very large samples when you have them.',
          'Downswings are a normal part of a winning player\'s results, not a sign that something has broken. The numbers above describe a player who is winning the whole time, and they still include long stretches of losing.',
        ],
      },
      {
        heading: 'Surviving A Downswing',
        paragraphs: [
          'Keep enough bankroll that a normal downswing does not force you to change stakes in a panic. Review a sample of your biggest losing hands with a study partner or a training tool, looking for real mistakes rather than bad luck. If you find leaks, fix them. If you do not, keep playing your game.',
          'Protect your mental state. Shorter sessions, more breaks and a drop in stakes can all help during a long downswing, not because the cards will change but because your decisions will stay better. Variance cannot be avoided, but tilt caused by variance can.',
        ],
      },
    ],
    related: ['risk-of-ruin', 'tilt-control', 'results-oriented-thinking', 'expected-value'],
    glossary: ['variance', 'expected-value', 'tilt'],
    train: { game: 'psy-016' },
  },
  {
    slug: 'results-oriented-thinking',
    title: 'Results Oriented Thinking In Poker',
    category: 'Mental Game',
    summary: `Results oriented thinking is judging a decision by how the hand turned out rather than by whether it was right, and it teaches bad lessons: a player who gets all in with 80% equity still loses ${pct(1 - 0.8, 0)} of the time and should make that play every time.`,
    sections: [
      {
        heading: 'The Mistake',
        paragraphs: [
          'Poker gives feedback that is honest in the long run and misleading in the short run. A good decision can lose and a bad one can win, and a single hand does not tell you which you made. Judging by the result feels natural, because the result is what you see and feel, but it trains you to repeat lucky mistakes and to abandon unlucky good plays.',
          'The classic example is a strong hand all in before the flop against a weaker one. The strong hand might win four times in five. When it loses, nothing about the decision was wrong. When a weak hand calls and wins, nothing about that decision was right.',
        ],
      },
      {
        heading: 'Thinking In Decisions',
        paragraphs: [
          'The fix is to evaluate the decision with the information you had at the time. What range did your opponent likely hold? What price were you getting? What were your alternatives, and what was each worth on average? If the answer holds up, the decision was good, whatever happened next.',
          'Expected value is the tool for this. Every choice has an average outcome over all the ways the hand could have gone, and that average is what your skill controls. The single outcome you saw is one draw from that set, and on its own it tells you almost nothing.',
          'A useful habit is to write the decision down before you know the result, when reviewing hands. Hide the river card and the showdown, decide what you would do and why, and only then reveal how the hand ended. It removes the pull of the result from your judgement.',
        ],
      },
      {
        heading: 'Where Results Do Matter',
        paragraphs: [
          'Results still matter in large numbers. Over tens of thousands of hands, your results converge on the sum of your decisions, and a sustained gap between what you expect and what you get is worth investigating. The skill is in knowing how large a sample needs to be before it means anything, and the variance lesson in this series puts numbers on that.',
          'Results also carry information about opponents. A player who shows down a surprising hand has told you something about their range, and that is worth remembering. The trick is to learn from what the hand revealed, not from who won it.',
        ],
      },
    ],
    related: ['expected-value', 'variance-and-downswings', 'tilt-control', 'pot-odds'],
    glossary: ['expected-value', 'variance', 'equity'],
    train: { game: 'psy-007' },
  },
];
