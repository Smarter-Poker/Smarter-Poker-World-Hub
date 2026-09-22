/**
 * /learn PREFLOP LESSONS. Every range, percentage and hand list here is
 * read out of the bundled authored corpus (src/config/solverRanges.js)
 * through src/lib/seo/preflopReference.js and src/lib/learn/rangeGrid.js.
 * Nothing in a chart or a range size is typed by hand. Copy is written in
 * plain case and Title Cased by ../lessons.js on export.
 */
import { RFI, BB_DEFENSE, FOUR_BET, RFI_20BB } from '../../../config/solverRanges.js';
import {
  openingRanges,
  defenceRanges,
  fourBetRanges,
  combosFor,
  TOTAL_COMBOS,
} from '../../../lib/seo/preflopReference.js';
import { rangeGrid } from '../../../lib/learn/rangeGrid.js';
import {
  pct,
  num,
  priceOfCall,
  calledThreeBetPot,
  stackToPot,
} from '../../../lib/learn/pokerMath.js';

/** The provenance, word for word as /hub/preflop-charts states it. */
export const PROVENANCE =
  'They Are An Authored Teaching Reference For Six Handed Cash At One Hundred Big Blinds, Not A Solver Export, And No Solve Tree Or Checksum Is Attached To Them.';

export const SEAT_ORDER = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];

/** The seat as the subject of a sentence: "the under the gun seat opens". */
const SEAT_NOUNS = {
  UTG: 'under the gun seat',
  MP: 'middle position seat',
  HJ: 'hijack',
  CO: 'cutoff',
  BTN: 'button',
  SB: 'small blind',
};
export const SEAT_NAMES = {
  UTG: 'Under The Gun',
  MP: 'Middle Position',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small Blind',
};

const OPENS = openingRanges(RFI, SEAT_ORDER);
const DEFENDS = defenceRanges(BB_DEFENSE, ['vs_UTG', 'vs_CO', 'vs_BTN', 'vs_SB']);
const FOUR_BETS = fourBetRanges(FOUR_BET, ['UTG_vs_3bet', 'CO_vs_3bet', 'BTN_vs_3bet']);
const OPENS_20 = openingRanges(RFI_20BB, ['UTG', 'CO', 'BTN', 'SB']);

const open = (seat) => OPENS.find((r) => r.position === seat);
const open20 = (seat) => OPENS_20.find((r) => r.position === seat);
const list = (hands) => hands.join(', ');
const mixedList = (mixed) => mixed.map((m) => `${m.hand} at ${m.frequency}%`).join(', ');
const comboCount = (hands) => hands.reduce((sum, h) => sum + combosFor(h), 0);

const RAISE = [{ key: 'raise', label: 'Raise' }];
const DEFEND = [{ key: 'raise', label: '3-Bet' }, { key: 'call', label: 'Call' }];
const FACE = [{ key: 'raise', label: '4-Bet' }, { key: 'call', label: 'Call' }];

/** The sentence every chart lesson opens its source section with. */
const sourceParagraph = (what) =>
  `The chart is generated from the Smarter.Poker preflop reference, the same ranges the Preflop Range Lab drills. ${PROVENANCE} ${what}`;

const SIZES_EXPLAINED =
  'Two sizes describe a mixed range and they are not the same number. The first counts every hand at the rate it is actually played, so a hand opened half the time counts half. The second counts any hand the range plays at least some of the time, in full.';

function openChart(seat, map = RFI, stack = '100') {
  const r = map === RFI ? open(seat) : open20(seat);
  return {
    caption: `${SEAT_NAMES[seat]} opening range, 6 max, ${stack} big blinds: raise frequency per hand`,
    source: map === RFI ? `RFI.${seat}` : `RFI_20BB.${seat}`,
    grid: rangeGrid(map[seat], RAISE),
    sizes: { percent: r.percent, reach: r.reach },
  };
}

function seatLesson({ seat, slug, title, playersBehind, intro, body, related, glossary, game }) {
  const r = open(seat);
  const alwaysCombos = comboCount(r.always);
  const topMixed = r.mixed.slice().sort((a, b) => b.frequency - a.frequency).slice(0, 6);
  return {
    slug,
    title,
    category: 'Preflop',
    summary: `In the Smarter.Poker 6 max cash reference at 100 big blinds, the ${SEAT_NOUNS[seat]} opens ${r.percent}% of all starting hands by frequency and plays ${r.reach}% of them at least some of the time, with the full chart below.`,
    sections: [
      {
        heading: `The ${SEAT_NAMES[seat]} Opening Chart`,
        paragraphs: [
          sourceParagraph(SIZES_EXPLAINED),
          `Read the table by row and column. Pairs run down the diagonal, suited hands sit above it and offsuit hands below it, and each cell shows how often the hand is raised when the action folds to the ${SEAT_NAMES[seat].toLowerCase()}. A cell at 0% is a fold every time.`,
        ],
        chart: openChart(seat),
      },
      {
        heading: 'What The Range Plays Every Time',
        paragraphs: [
          `${r.always.length} hand classes are opened every time: ${list(r.always)}. Together they are ${alwaysCombos} of the ${TOTAL_COMBOS} possible starting combinations. ${r.mixed.length} more hand classes are opened only part of the time, and the most frequent of those are ${mixedList(topMixed)}.`,
          intro,
        ],
      },
      {
        heading: 'Why This Seat Plays This Way',
        paragraphs: body,
      },
      {
        heading: 'Common Mistakes',
        paragraphs: [
          `The most common leak is treating a mixed hand as a pure one. A hand listed at a frequency below 100% is folded the rest of the time, and turning every one of them into an open adds combinations the reference does not play. With ${playersBehind} still to act behind this seat, every extra weak open is a hand that can be raised off its equity.`,
          'The second is copying a chart to a game it was not built for. These ranges assume six players, 100 big blind stacks and a standard open size. Shorter stacks, antes, a straddle or a very passive table all change the right answer, so use the chart as a baseline and adjust with a reason you can name.',
        ],
      },
    ],
    related,
    glossary,
    train: game,
  };
}

export const PREFLOP_LESSONS = [
  {
    slug: 'preflop-ranges-by-position',
    title: 'Preflop Opening Ranges By Position',
    category: 'Preflop',
    summary: `In 6 max cash at 100 big blinds, opening ranges widen as the seat moves toward the button: in the Smarter.Poker reference the under the gun seat opens ${open('UTG').percent}% of hands by frequency and the button opens ${open('BTN').percent}%.`,
    sections: [
      {
        heading: 'Every Seat At A Glance',
        paragraphs: [
          sourceParagraph(SIZES_EXPLAINED),
          'The table lists each seat in the order it acts before the flop, with both sizes of its raise first in range. Each seat has its own lesson with the full 13 by 13 chart.',
        ],
        table: {
          caption: 'Raise first in range by seat, 6 max cash, 100 big blinds',
          head: ['Seat', 'Opens By Frequency', 'Plays At Least Sometimes', 'Hand Classes Always Opened'],
          rows: OPENS.map((r) => [SEAT_NAMES[r.position], `${r.percent}%`, `${r.reach}%`, String(r.always.length)]),
        },
      },
      {
        heading: 'Why Ranges Widen Toward The Button',
        paragraphs: [
          'Two things change as the seat moves clockwise. Fewer players are left to act behind you, so there is less chance one of them holds a hand strong enough to raise or call. And the later seats are more likely to play the rest of the hand in position, acting after the opponent on the flop, turn and river, which lets a wider set of hands realise more of their equity.',
          `The reference reflects both. Under the gun has five players behind and opens ${open('UTG').percent}% of hands by frequency. The cutoff has three players behind and opens ${open('CO').percent}%. The button has only the blinds behind and opens ${open('BTN').percent}%, the widest range at the table. The small blind is a special case: it has only the big blind behind but will be out of position after the flop, so its raising range of ${open('SB').percent}% is narrower than the button's.`,
        ],
      },
      {
        heading: 'How To Use The Charts',
        paragraphs: [
          'Start with the hands that are opened every time, because they are the backbone of the range and the easiest to memorise. Then learn the mixed hands as a group, noticing which ones appear in every seat, such as suited aces and suited connectors, and which ones only join from the later seats, such as weaker offsuit broadways.',
          'A mixed frequency is not an instruction to flip a coin at the table forever. It says the hand is close in value between raising and folding, which means small edges decide it: a weak player in the big blind, a tight table behind you, or your own read. When nothing points either way, playing the hand at roughly the listed rate keeps your range balanced.',
          'Do not stretch these ranges to a game they were not built for. Nine handed games, short stacks and tournaments with antes need their own charts, and the 20 big blind lesson in this series shows how much the same reference changes at a shorter depth.',
        ],
      },
    ],
    related: ['utg-opening-range', 'button-opening-range', 'big-blind-defense', '20bb-opening-ranges'],
    glossary: ['rfi', 'range', 'in-position', 'frequency', 'mixed-strategy'],
    train: { game: 'cash-001', tool: '/hub/preflop-charts' },
  },
  seatLesson({
    seat: 'UTG',
    slug: 'utg-opening-range',
    title: 'UTG Opening Range In 6 Max Cash',
    playersBehind: 'five players',
    intro: 'Under the gun is the first seat to act before the flop, so its range is built to hold up against five players who have not acted yet. That is why the always list is mostly pairs, strong suited aces and big broadway hands.',
    body: [
      'Five opponents behind you means five chances that someone wakes up with a hand strong enough to three bet or call and outplay you in position. A hand that would be a comfortable open on the button, such as a weak offsuit king, becomes a liability here because it is dominated by the hands that continue against an early open.',
      'The mixed section is where the craft lives. Suited aces such as A5s and A4s appear because they make the nut flush, block the strongest aces and can make a wheel straight, so they play well when they are three bet and have to decide whether to four bet. Suited connectors appear at low frequencies for balance, so the range is not made only of high cards and the board cannot be read too easily.',
      'Offsuit hands are the first to go. AJo and KQo are opened only part of the time here, because when they are called they are often behind a better ace or king, and they do not make flushes to escape with. From later seats both of them become regular opens.',
    ],
    related: ['preflop-ranges-by-position', 'middle-position-opening-range', 'facing-a-3-bet', 'counting-combos'],
    glossary: ['rfi', 'range', 'out-of-position', 'blocker'],
    game: { game: 'cash-001', tool: '/hub/preflop-charts' },
  }),
  seatLesson({
    seat: 'MP',
    slug: 'middle-position-opening-range',
    title: 'Middle Position Opening Range, 6 Max',
    playersBehind: 'several players',
    intro: 'Strictly, a six handed table has five seats that can open before the big blind: under the gun, the hijack, the cutoff, the button and the small blind. The reference also carries a middle position range for the step between under the gun and the hijack, which is what the second seat to act looks like at a slightly larger table. With one fewer player behind than under the gun, the range adds more pairs, more suited aces and more offsuit broadway hands than the seat before it.',
    body: [
      'Every seat that folds before you is one less player who can hold a premium hand, so the range can take on hands that are slightly worse on average. The additions are not random: they are the hands that were closest to the line from under the gun, such as the middle pairs, ATs and KTs, which move from mixed toward always.',
      'The hijack, the cutoff, the button and both blinds are still to act, and the blinds will usually be out of position against you after the flop. That helps a little. The cutoff and the button are the real threats, because they can call and play the rest of the hand with position, or three bet and put you in a difficult spot with a marginal hand.',
      'The practical lesson is to treat middle position as a slightly wider version of under the gun, not as a late seat. Hands such as weak suited kings and offsuit queens still belong mostly in the fold column here, and they only become profitable opens once the cutoff and the button are no longer behind you.',
    ],
    related: ['utg-opening-range', 'hijack-opening-range', 'preflop-ranges-by-position', '3-bet-sizing'],
    glossary: ['rfi', 'range', 'in-position', 'frequency'],
    game: { game: 'cash-006', tool: '/hub/preflop-charts' },
  }),
  seatLesson({
    seat: 'HJ',
    slug: 'hijack-opening-range',
    title: 'Hijack Opening Range In 6 Max Cash',
    playersBehind: 'four players',
    intro: 'The hijack is the seat two to the right of the button. Four players remain behind it, the cutoff, the button and both blinds, and the range reflects that by opening more pairs and a wider band of suited hands.',
    body: [
      'Four players behind is the point where a range starts to feel wide. Smaller pairs such as 66 and 55 join at low frequencies because they are cheap to play and, when they flop a set, they win big pots from opponents who hold overpairs or top pair. Suited connectors and suited one gappers climb in frequency because they flop strong draws often enough to keep betting.',
      'The hijack is also the first seat that can open with an eye on stealing the blinds. When the cutoff and the button fold, which happens often, the pot is contested only by the blinds, both of whom are out of position. That extra fold equity pays for some hands that would lose money if they were always called.',
      'The danger is the cutoff and the button, who will three bet the hijack more often than they would three bet an early seat because the hijack range is wider. Know in advance which of your opens you will continue with against a three bet and which you will fold, so that you are not guessing when it happens.',
    ],
    related: ['middle-position-opening-range', 'cutoff-opening-range', 'facing-a-3-bet', 'board-texture'],
    glossary: ['rfi', 'fold-equity', 'semi-bluff', 'range'],
    game: { game: 'cash-006', tool: '/hub/preflop-charts' },
  }),
  seatLesson({
    seat: 'CO',
    slug: 'cutoff-opening-range',
    title: 'Cutoff Opening Range In 6 Max Cash',
    playersBehind: 'three players',
    intro: 'The cutoff sits directly to the right of the button. With only the button and the blinds behind it, the cutoff range adds more suited kings and queens, more offsuit broadways and pairs down to 44.',
    body: [
      'Only one player, the button, can hold position on you after the flop. If the button folds, you are guaranteed to be in position against whichever blind calls. That is why the cutoff range takes such a large step from the hijack: most of the hands it adds play far better in position than out of it.',
      'The cutoff is a stealing seat. When everyone behind folds you win the blinds without a flop, and a wider range gives the blinds a harder time guessing what you hold. Hands such as K9s, Q9s and the weaker suited aces are opened because the combination of fold equity and positional advantage makes them profitable, not because they are strong in a vacuum.',
      'The button is the player to respect. A button that knows your range is wide can three bet you often, and it will have position for the rest of the hand. If the button is aggressive, open slightly tighter and plan to four bet or call with the hands in your range that can stand the pressure.',
    ],
    related: ['hijack-opening-range', 'button-opening-range', 'facing-a-3-bet', '3-bet-sizing'],
    glossary: ['rfi', 'in-position', 'fold-equity', 'range'],
    game: { game: 'mtt-018', tool: '/hub/preflop-charts' },
  }),
  seatLesson({
    seat: 'BTN',
    slug: 'button-opening-range',
    title: 'Button Opening Range In 6 Max Cash',
    playersBehind: 'two players',
    intro: 'The button acts last on every street after the flop, which makes it the most profitable seat at the table and the widest opening range in the reference. Only the two blinds are left behind it, and both of them will be out of position.',
    body: [
      'Position is worth more than card strength at the margins. Acting last means you see what the blind does before you decide, so you can take free cards, bet when they show weakness and fold cheaply when they show strength. That information lets hands such as weak suited kings, suited gappers and offsuit connectors show a profit that they could never show from an early seat.',
      'The button also has the most fold equity. Two players remain, both have already put chips in, and both must defend out of position. Every time they fold the button collects one and a half big blinds without a flop, and that is a large part of why the range is as wide as it is.',
      'The small blind and the big blind know this, so they defend and three bet more against the button than against any other seat. Expect more resistance and prepare for it: your widest opens are the first hands to fold to a three bet, while your strongest hands and a few suited blockers are the ones that continue.',
    ],
    related: ['cutoff-opening-range', 'small-blind-opening-range', 'big-blind-defense', 'continuation-betting'],
    glossary: ['rfi', 'dealer-button', 'in-position', 'fold-equity'],
    game: { game: 'mtt-018', tool: '/hub/preflop-charts' },
  }),
  seatLesson({
    seat: 'SB',
    slug: 'small-blind-opening-range',
    title: 'Small Blind Opening Range, 6 Max',
    playersBehind: 'one player',
    intro: 'The small blind opens when everyone else has folded and only the big blind is left. This chart is the raising range. The same reference also keeps a separate small blind limping strategy, which is not shown here.',
    body: [
      'The small blind faces only one opponent, which argues for a wide range, but it will be out of position on every street after the flop, which argues for a narrower one. The result sits between the cutoff and the button: wide enough to attack a big blind who has only one big blind invested, tight enough to avoid playing weak hands out of position.',
      'The big blind gets a good price to call a small blind raise, because it already has a full blind in the pot. Expect it to defend often and to three bet a fair share of the time. That is why many strong small blind strategies mix raises with limps, keeping some medium hands in a cheaper line rather than raising and being forced to fold them.',
      'A common guideline is to open larger from the small blind than from the other seats, often around three big blinds, because you will play the hand out of position and a larger raise gives the big blind a worse price. Treat that as a starting point and adjust to how your opponent in the big blind actually defends.',
    ],
    related: ['button-opening-range', 'big-blind-defense', '3-bet-sizing', 'pot-odds'],
    glossary: ['rfi', 'blinds', 'out-of-position', 'range'],
    game: { game: 'cash-018', tool: '/hub/preflop-charts' },
  }),
  (() => {
    const btn = DEFENDS.find((d) => d.versus === 'BTN');
    // BB versus a 2.5 big blind button open, small blind folded: 1.5 more
    // to call into 2.5 + 0.5 + 1 = 4 big blinds.
    const price = priceOfCall(1.5, 4);
    return {
      slug: 'big-blind-defense',
      title: 'How To Defend The Big Blind',
      category: 'Preflop',
      summary: `Against a 2.5 big blind button open the big blind needs only ${pct(price)} equity to call, and the Smarter.Poker reference defends by three betting ${btn.threeBet.percent}% of hands and calling ${btn.call.percent}%, with the full chart below.`,
      sections: [
        {
          heading: 'The Big Blind Defending Chart Against The Button',
          paragraphs: [
            sourceParagraph(SIZES_EXPLAINED),
            'Each cell shows how often the hand three bets and how often it calls when the button opens and the small blind folds. What is left over is a fold.',
          ],
          chart: {
            caption: 'Big blind versus a button open, 6 max, 100 big blinds: three bet and call frequency per hand',
            source: 'BB_DEFENSE.vs_BTN',
            grid: rangeGrid(BB_DEFENSE.vs_BTN, DEFEND),
            sizes: { percent: num(btn.threeBet.percent + btn.call.percent), reach: null },
          },
        },
        {
          heading: 'Why The Big Blind Defends So Often',
          paragraphs: [
            `The big blind has already put one big blind in the pot, so it is closing the action at a discount. When the button opens to 2.5 big blinds and the small blind folds, the big blind calls 1.5 more to play for a pot of 5.5, which means a call needs only ${pct(price)} equity to break even before the flop. Many hands that would be clear folds in any other seat clear that bar.`,
            'The cost is position. The big blind acts first on every street after the flop, so it realises less of its raw equity than the numbers suggest. The reference answers that by calling with hands that make strong pairs, draws and suited holdings, and by three betting a mix of premium hands and suited hands that block the button\'s strongest continues.',
          ],
        },
        {
          heading: 'Defence Against Every Seat',
          paragraphs: [
            'The earlier the opener, the stronger its range and the tighter the big blind defends. The table shows both parts of the defence against each seat in the reference.',
            'Published solver solutions for common open sizes defend the big blind considerably wider than this teaching reference does, so treat these numbers as a conservative floor while you learn the structure, not as a ceiling. The shape is what transfers: defend wider against later seats, three bet the hands that play badly as calls, and fold the offsuit hands that are dominated.',
          ],
          table: {
            caption: 'Big blind defence by opener, 6 max cash, 100 big blinds, frequency weighted',
            head: ['Opener', 'Three Bets', 'Calls', 'Defends In Total'],
            rows: DEFENDS.map((d) => [
              SEAT_NAMES[d.versus] || d.versus,
              `${d.threeBet.percent}%`,
              `${d.call.percent}%`,
              `${num(d.threeBet.percent + d.call.percent)}%`,
            ]),
          },
        },
      ],
      related: ['button-opening-range', 'pot-odds', 'minimum-defense-frequency', 'small-blind-opening-range'],
      glossary: ['blinds', 'pot-odds', 'out-of-position', '3-bet', 'under-defense'],
      train: { game: 'cash-003', tool: '/hub/preflop-charts' },
    };
  })(),
  (() => {
    const btn = FOUR_BETS.find((f) => f.position === 'BTN');
    const utg = FOUR_BETS.find((f) => f.position === 'UTG');
    return {
      slug: 'facing-a-3-bet',
      title: 'What To Do When You Face A 3-Bet',
      category: 'Preflop',
      summary: `Facing a three bet after opening, most of an opening range folds: in the Smarter.Poker reference a button opener four bets ${btn.fourBet.percent}% of all starting hands and calls ${btn.call.percent}%, and an under the gun opener four bets ${utg.fourBet.percent}% and calls ${utg.call.percent}%.`,
      sections: [
        {
          heading: 'The Button Chart Facing A Three Bet',
          paragraphs: [
            sourceParagraph(SIZES_EXPLAINED),
            'Each cell shows how often the button four bets and how often it calls after opening and facing a three bet. Every hand the button opened that does not appear here is folded.',
          ],
          chart: {
            caption: 'Button facing a three bet after opening, 6 max, 100 big blinds: four bet and call frequency per hand',
            source: 'FOUR_BET.BTN_vs_3bet',
            grid: rangeGrid(FOUR_BET.BTN_vs_3bet, FACE),
            sizes: { percent: num(btn.fourBet.percent + btn.call.percent), reach: null },
          },
        },
        {
          heading: 'Why Most Opens Fold',
          paragraphs: [
            `An opening range is built to win the blinds or play a single raised pot. A three bet changes the question: the pot is bigger, the stacks behind are smaller relative to it, and the three bettor's range is much stronger than a calling range. The button opens ${open('BTN').percent}% of hands in the reference but continues against a three bet with only about ${num(btn.fourBet.percent + btn.call.percent)}% of all hands, which means the large majority of its opens are released.`,
            'The hands that continue are the ones that can stand the pressure. Premium pairs and AK four bet for value. A few suited aces four bet as bluffs, because the ace blocks the three bettor\'s strongest hands. Strong but not premium hands such as medium pairs and suited broadways call, especially in position, where they can realise their equity.',
          ],
        },
        {
          heading: 'Four Bets And Calls By Seat',
          paragraphs: [
            'The earlier you opened, the stronger your range already is, and yet the continuing range is still small, because an early three bet from a player who knows your range is strong is itself very strong. The table shows the reference for each opening seat it covers.',
            'The most common mistake is calling too much out of position. A hand that is fine to call on the button can be a losing call from under the gun, where you will face another bet on a board you cannot see coming. When in doubt out of position, prefer a four bet with your best hands and a fold with the rest.',
          ],
          table: {
            caption: 'Opener facing a three bet, 6 max cash, 100 big blinds, frequency weighted',
            head: ['Opener', 'Four Bets', 'Calls', 'Continues In Total'],
            rows: FOUR_BETS.map((f) => [
              SEAT_NAMES[f.position] || f.position,
              `${f.fourBet.percent}%`,
              `${f.call.percent}%`,
              `${num(f.fourBet.percent + f.call.percent)}%`,
            ]),
          },
        },
      ],
      related: ['3-bet-sizing', 'button-opening-range', 'blockers', 'stack-to-pot-ratio'],
      glossary: ['3-bet', '4-bet', 'blocker', 'polarized-range'],
      train: { game: 'cash-008', tool: '/hub/preflop-charts' },
    };
  })(),
  (() => {
    // Conventions the lesson labels as such, and the pots they produce.
    const ipPot = calledThreeBetPot(7.5, 1.5); // CO opens 2.5, BTN 3-bets to 7.5, blinds fold
    const ipSpr = stackToPot(100 - 7.5, ipPot);
    const oopPot = calledThreeBetPot(10, 0.5); // BTN opens 2.5, BB 3-bets to 10, SB folded
    const oopSpr = stackToPot(100 - 10, oopPot);
    return {
      slug: '3-bet-sizing',
      title: '3-Bet Sizing In Position And Out',
      category: 'Preflop',
      summary: 'A common guideline is to three bet to about three times the open when you will have position after the flop and about four times when you will not, because the player out of position needs a bigger pot to make up for acting first.',
      sections: [
        {
          heading: 'The Guideline And Why It Exists',
          paragraphs: [
            'Three bet sizes are conventions, not laws, and different solvers and coaches settle on slightly different numbers. The shape they agree on is the one above: smaller in position, larger out of position, and larger again against a player who calls too much.',
            'The reason is realisation. The player in position will see every decision the opponent makes before acting, so they can win with a smaller pot and a wider range. The player out of position is at an informational disadvantage for the rest of the hand, so they prefer a bigger raise that forces more folds right away and leaves a smaller stack behind to play for later.',
          ],
        },
        {
          heading: 'What The Sizes Do To The Pot',
          paragraphs: [
            `Take a cutoff open to 2.5 big blinds and a button three bet to 7.5, three times the open. If the blinds fold and the cutoff calls, the pot on the flop is ${num(ipPot)} big blinds with ${num(100 - 7.5)} behind, a stack to pot ratio of ${num(ipSpr)}.`,
            `Now take a button open to 2.5 and a big blind three bet to 10, four times the open. If the button calls, the pot is ${num(oopPot)} big blinds with ${num(100 - 10)} behind, a stack to pot ratio of ${num(oopSpr)}. The larger size makes the pot bigger and the remaining stacks relatively smaller, which simplifies the out of position player's decisions after the flop.`,
          ],
          table: {
            caption: 'Called three bet pots at 100 big blinds, from the examples above',
            head: ['Spot', 'Three Bet To', 'Pot On The Flop', 'Behind', 'Stack To Pot Ratio'],
            rows: [
              ['Button over a cutoff open', '7.5 BB', `${num(ipPot)} BB`, `${num(100 - 7.5)} BB`, num(ipSpr)],
              ['Big blind over a button open', '10 BB', `${num(oopPot)} BB`, `${num(100 - 10)} BB`, num(oopSpr)],
            ],
          },
        },
        {
          heading: 'Adjusting To The Table',
          paragraphs: [
            'Go larger against players who call three bets too often, because your value hands win more and your bluffs lose little extra against a player who was never folding. Go smaller against players who fold too much, because a smaller bluff risks less to win the same pot.',
            'A common guideline is to add roughly one open size for every player who has already called the open, because each caller adds dead money and makes a squeeze more attractive to the players behind you. And keep your sizing the same for value hands and bluffs in any one spot, so that the size itself tells an observant opponent nothing about which you hold.',
          ],
        },
      ],
      related: ['facing-a-3-bet', 'stack-to-pot-ratio', 'big-blind-defense', 'cutoff-opening-range'],
      glossary: ['3-bet', 'squeeze', 'spr', 'in-position', 'out-of-position'],
      train: { game: 'cash-007' },
    };
  })(),
  (() => {
    const pairs = ['UTG', 'CO', 'BTN', 'SB'].map((seat) => ({ seat, at100: open(seat), at20: open20(seat) }));
    const utg = pairs[0];
    const btn = pairs[2];
    const sb = pairs[3];
    return {
      slug: '20bb-opening-ranges',
      title: 'Opening Ranges With 20 Big Blinds',
      category: 'Preflop',
      summary: `With 20 big blinds the Smarter.Poker reference opens the button with ${btn.at20.percent}% of hands by frequency, against ${btn.at100.percent}% at 100 big blinds, and the chart below shows every hand.`,
      sections: [
        {
          heading: 'The Button Chart At 20 Big Blinds',
          paragraphs: [
            `This chart comes from the stack depth variants in the same Smarter.Poker preflop reference, which adjust the 100 big blind ranges for shorter stacks. ${PROVENANCE} The 20 big blind variant is an authored adjustment of that reference, not a separate solve. ${SIZES_EXPLAINED}`,
          ],
          chart: openChart('BTN', RFI_20BB, '20'),
        },
        {
          heading: 'What Changes At 20 Big Blinds',
          paragraphs: [
            'Short stacks change which hands make money. With 20 big blinds, a raise and a call before the flop already commit a large share of the stack, so there is little room to outplay anyone after the flop. Hands that win by making big pairs and strong aces gain value, and hands that win by making disguised draws and implied odds lose it, because there is not enough money behind to be paid off.',
            `The reference does not simply shrink every range. Under the gun opens ${utg.at20.percent}% at 20 big blinds against ${utg.at100.percent}% at 100, the button ${btn.at20.percent}% against ${btn.at100.percent}%, and the small blind ${sb.at20.percent}% against ${sb.at100.percent}%. The mix of hands shifts toward high cards and pairs even where the total stays close.`,
          ],
          table: {
            caption: 'Raise first in range, 20 big blinds against 100 big blinds, frequency weighted',
            head: ['Seat', 'At 20 BB', 'At 100 BB'],
            rows: pairs.map((p) => [SEAT_NAMES[p.seat], `${p.at20.percent}%`, `${p.at100.percent}%`]),
          },
        },
        {
          heading: 'Using It In Tournaments',
          paragraphs: [
            'Twenty big blinds is a stack you meet constantly in tournaments, where antes add dead money to every pot and make stealing more attractive than it is in a cash game. This reference is built for a six handed game without antes, so in a tournament treat it as the shape of a short stack range rather than the exact numbers, and widen your steals when antes are in play.',
            'A common guideline is that below about 15 big blinds a player switches from opening with a raise to moving all in or folding, because a small raise that is re-raised leaves no good option. The lesson on M ratio and short stacks explains how to measure that point with M and big blinds.',
          ],
        },
      ],
      related: ['m-ratio-and-short-stacks', 'button-opening-range', 'preflop-ranges-by-position', 'icm-basics'],
      glossary: ['effective-stack', 'rfi', 'implied-odds', 'fold-equity'],
      train: { game: 'mtt-008', tool: '/hub/preflop-charts' },
    };
  })(),
];
