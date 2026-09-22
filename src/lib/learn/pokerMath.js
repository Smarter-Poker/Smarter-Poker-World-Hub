/**
 * THE NUMBERS A LESSON QUOTES, COMPUTED (AEO section 3.7, 2026-09-22).
 *
 * Every figure the /learn corpus prints in prose, a pot odds percentage, a
 * defence frequency, an ICM equity, a risk of ruin, is produced by a
 * function in this file and interpolated into the lesson, never typed by
 * hand. An engine will quote these numbers as fact, so a number that is
 * typed is a number that can drift from the arithmetic behind it.
 *
 * __tests__/every-lesson-answers-first.law.test.mjs checks each function
 * against values derived independently by hand, so a wrong formula fails
 * the build rather than publishing.
 *
 * Plain JavaScript, no JSX and no imports, so a law can run it under node.
 */

/** A fraction as a percentage string: 0.25 -> "25%", 0.28571 -> "28.6%". */
export function pct(fraction, digits = 1) {
  const scale = 10 ** digits;
  const value = Math.round(Number(fraction) * 100 * scale) / scale;
  return `${Number.isInteger(value) ? value : value.toFixed(digits)}%`;
}

/** A number with at most `digits` decimals and no trailing zeros. */
export function num(value, digits = 1) {
  const scale = 10 ** digits;
  const rounded = Math.round(Number(value) * scale) / scale;
  return String(rounded);
}

// ─── Pot odds, defence and bluffing ─────────────────────────────────────────

/**
 * Equity a call needs to break even. A bet of `bet` into a pot of `pot`
 * (the pot before the bet) asks you to put in `bet` to win pot + bet, so the
 * price is bet / (pot + 2 * bet).
 */
export function requiredEquity(bet, pot) {
  return bet / (pot + 2 * bet);
}

/**
 * The same price stated from the caller's side: `call` more chips into a
 * pot that already holds `potBeforeCall` (every chip in the middle,
 * including the bet or raise being called).
 */
export function priceOfCall(call, potBeforeCall) {
  return call / (potBeforeCall + call);
}

/**
 * Minimum defence frequency: how much of a range must continue so that a
 * pure bluff of `bet` into `pot` does not profit automatically.
 */
export function minimumDefenseFrequency(bet, pot) {
  return pot / (pot + bet);
}

/** Alpha: how often a pure bluff of `bet` into `pot` must work to break even. */
export function bluffBreakEven(bet, pot) {
  return bet / (pot + bet);
}

/**
 * The share of a polarised river betting range that can be bluffs while a
 * bluff catcher stays indifferent between calling and folding. It is the
 * same fraction as the caller's required equity, which is the point.
 */
export function indifferentBluffShare(bet, pot) {
  return bet / (pot + 2 * bet);
}

// ─── Outs ───────────────────────────────────────────────────────────────────

/** Unseen cards on the flop from one player's view: 52 - 2 hole - 3 board. */
export const UNSEEN_ON_FLOP = 47;
/** Unseen cards on the turn: one fewer. */
export const UNSEEN_ON_TURN = 46;

/** Chance of hitting one of `outs` on the next card from the flop. */
export function hitOnTurn(outs) {
  return outs / UNSEEN_ON_FLOP;
}

/** Chance of hitting one of `outs` on the river card from the turn. */
export function hitOnRiver(outs) {
  return outs / UNSEEN_ON_TURN;
}

/** Chance of hitting at least one of `outs` by the river, seen from the flop. */
export function hitByRiver(outs) {
  const miss = ((UNSEEN_ON_FLOP - outs) / UNSEEN_ON_FLOP) * ((UNSEEN_ON_TURN - outs) / UNSEEN_ON_TURN);
  return 1 - miss;
}

/** The rule of 4 (two cards to come) and the rule of 2 (one card). */
export function ruleOfFour(outs) {
  return (outs * 4) / 100;
}
export function ruleOfTwo(outs) {
  return (outs * 2) / 100;
}

// ─── Combinations ───────────────────────────────────────────────────────────

const SUITS = ['s', 'h', 'd', 'c'];

/**
 * How many combinations of a starting hand class remain once some cards are
 * known to be elsewhere (on the board or in your own hand). `hand` is "AKs",
 * "AKo", "AK" (both) or "QQ"; `dead` is a list like ["As", "Kd"].
 */
export function combosWithDead(hand, dead = []) {
  const deadSet = new Set(dead.map((c) => c[0].toUpperCase() + c[1].toLowerCase()));
  const a = hand[0];
  const b = hand[1];
  const kind = hand.length > 2 ? hand[2] : a === b ? 'pair' : 'any';
  let count = 0;
  for (let i = 0; i < SUITS.length; i += 1) {
    for (let j = 0; j < SUITS.length; j += 1) {
      if (a === b && j <= i) continue; // a pair: each unordered suit pair once
      const first = a + SUITS[i];
      const second = b + SUITS[j];
      if (first === second) continue;
      const suited = SUITS[i] === SUITS[j];
      if (kind === 's' && !suited) continue;
      if (kind === 'o' && suited) continue;
      if (deadSet.has(first) || deadSet.has(second)) continue;
      count += 1;
    }
  }
  return count;
}

/** n choose k. */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

// ─── Expected value, implied odds and SPR ───────────────────────────────────

/**
 * EV of a call: win `win` (what is in the middle before you call) with
 * probability `equity`, lose `risk` (your call) otherwise.
 */
export function callEV(equity, win, risk) {
  return equity * win - (1 - equity) * risk;
}

/**
 * Implied odds: the extra chips you must win later, when you hit, for a
 * call of `call` into `pot` (the pot including the bet you face) to break
 * even, given you win only when you hit with probability `equity`.
 */
export function impliedOddsNeeded(call, pot, equity) {
  return (call * (1 - equity)) / equity - pot;
}

/** Stack to pot ratio: effective stack behind divided by the pot. */
export function stackToPot(effectiveStack, pot) {
  return effectiveStack / pot;
}

/**
 * A called three bet: both players put in the three bet size, plus any dead
 * blind money from players who folded.
 */
export function calledThreeBetPot(threeBetTo, deadMoney) {
  return 2 * threeBetTo + deadMoney;
}

// ─── Tournaments ────────────────────────────────────────────────────────────

/**
 * Malmuth-Harville ICM. The chance a player finishes first is their share of
 * the chips; given who finished first, the chance of finishing second is
 * their share of the chips that remain, and so on down the payouts.
 * Returns each player's prize equity in the units of `payouts`.
 */
export function icmEquities(stacks, payouts) {
  const n = stacks.length;
  const equity = new Array(n).fill(0);
  const places = Math.min(payouts.length, n);
  function walk(remaining, place, probability) {
    if (place >= places || probability === 0) return;
    const total = remaining.reduce((sum, i) => sum + stacks[i], 0);
    if (total <= 0) return;
    for (const i of remaining) {
      const p = probability * (stacks[i] / total);
      if (p === 0) continue;
      equity[i] += p * payouts[place];
      walk(remaining.filter((j) => j !== i), place + 1, p);
    }
  }
  walk(
    stacks.map((_, i) => i).filter((i) => stacks[i] > 0),
    0,
    1,
  );
  // A player with no chips has already finished; tournaments pay the
  // eliminated nothing more, so their equity stays at zero.
  return equity;
}

/**
 * The equity a player needs to call an all in under ICM, ignoring blinds:
 * `hero` and `villain` are indexes into `stacks`, and the smaller of their
 * two stacks is what changes hands. Returns { chipEV, icm, now, win, lose }
 * where chipEV is the 50% a chip count alone would ask for.
 */
export function icmCallThreshold(stacks, payouts, hero, villain) {
  const risk = Math.min(stacks[hero], stacks[villain]);
  const now = icmEquities(stacks, payouts)[hero];
  const won = [...stacks];
  won[hero] += risk;
  won[villain] -= risk;
  const lost = [...stacks];
  lost[hero] -= risk;
  lost[villain] += risk;
  const win = icmEquities(won, payouts)[hero];
  const lose = lost[hero] > 0 ? icmEquities(lost, payouts)[hero] : bustedPrize(lost, payouts, hero);
  return {
    chipEV: 0.5,
    icm: (now - lose) / (win - lose),
    now,
    win,
    lose,
  };
}

/** A player who busts now finishes behind everyone still holding chips. */
function bustedPrize(stacks, payouts, hero) {
  const alive = stacks.filter((s, i) => s > 0 && i !== hero).length;
  return payouts[alive] || 0;
}

/** Harrington's M: stack divided by the cost of one orbit. */
export function mRatio(stack, smallBlind, bigBlind, antesPerOrbit) {
  return stack / (smallBlind + bigBlind + antesPerOrbit);
}

/**
 * Required equity to call an all in when a bounty is also won: the bounty,
 * valued in chips by the caller, is added to what the call can win.
 */
export function bountyRequiredEquity(call, pot, bountyChips) {
  return call / (pot + call + bountyChips);
}

// ─── Cash games ─────────────────────────────────────────────────────────────

/** Rake taken from a pot at `rate` up to `cap`. */
export function rakeFor(pot, rate, cap) {
  return Math.min(pot * rate, cap);
}

/** Stack depth measured in the biggest forced bet at the table. */
export function depthIn(stack, forcedBet) {
  return stack / forcedBet;
}

// ─── Bankroll and variance ──────────────────────────────────────────────────

/**
 * Risk of ruin under the standard diffusion approximation:
 * exp(-2 * winRate * bankroll / variance), with win rate and standard
 * deviation measured per the same number of hands (per 100 here) and the
 * bankroll in the same unit (big blinds). It assumes the win rate is known
 * exactly and never changes, which a real player's never is.
 */
export function riskOfRuin(winRatePer100, sdPer100, bankroll) {
  if (winRatePer100 <= 0) return 1;
  return Math.exp((-2 * winRatePer100 * bankroll) / (sdPer100 * sdPer100));
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26). */
export function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Over `hands` hands at a win rate and standard deviation per 100 hands:
 * the expected result, its standard deviation, the 95% range and the chance
 * of finishing behind, all in big blinds.
 */
export function sampleOutcome(winRatePer100, sdPer100, hands) {
  const blocks = hands / 100;
  const mean = winRatePer100 * blocks;
  const sd = sdPer100 * Math.sqrt(blocks);
  return {
    mean,
    sd,
    low: mean - 1.96 * sd,
    high: mean + 1.96 * sd,
    chanceBehind: normalCdf(-mean / sd),
  };
}
