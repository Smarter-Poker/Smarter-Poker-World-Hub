// "What stakes can I afford", worked out from the player's own poker sessions.
//
// Inputs are the player's poker_cash and poker_mtt ledger rows (current rows
// only: no deposits, withdrawals, expenses or superseded revisions, the same
// session rule as projectionMath.mjs) and their Bankroll Balance (ledgerMath
// bankrollBalanceCents, the dashboard tile). Totals are summed in cents.
//
// Cash games: per stake level the player has logged, hourly win rate and
// standard deviation per hour, then the risk of ruin for a normally
// distributed win rate:
//
//     RoR = exp(-2 * w * B / s^2)
//
// w = win rate per hour, s = standard deviation per hour, B = bankroll.
// Source: Bill Chen and Jerrod Ankenman, "The Mathematics of Poker"
// (ConJelCo, 2006), Part IV, chapter 22 "Staying in Action: Risk of Ruin",
// the risk of ruin of a normally distributed game, R(b) = e^(-2wb/s^2); the
// same result is in Mason Malmuth, "Gambling Theory and Other Topics"
// (Two Plus Two, 1987). It is the chance of EVER going broke playing that
// game forever at that win rate. It is 1 when w <= 0.
//
// The chance of going broke within a fixed number of hours T is the
// first-passage probability of Brownian motion with drift w and volatility s
// to the level -B (the reflection principle; e.g. S. Karlin and H. Taylor,
// "A First Course in Stochastic Processes", 2nd ed., Academic Press 1975,
// chapter 7):
//
//     P(ruin by T) = N((-B - wT) / (s sqrt T)) + exp(-2wB/s^2) * N((-B + wT) / (s sqrt T))
//
// which tends to the RoR above as T grows when w > 0, and to 1 when w <= 0.
//
// Tournaments are not modelled this way (their results are far from normal);
// they get a buy-in count guideline instead.

import { formatCurrency } from './currencyUtils.js';
import { entryCents, sessionHours, toCents } from './ledgerMath.mjs';

/** A stake is "supported" when the chance of ever going broke there is at most this. */
export const RISK_TARGET = 0.05;
/** Timed sessions at a stake before its win rate and spread are used. */
export const MIN_STAKE_SESSIONS = 30;
/** The finite horizon quoted in the sentence. */
export const HORIZON_HOURS = 500;
/** General guidance when there is too little data: cash buy-ins to hold. */
export const GUIDE_CASH_BUYINS = 30;
/**
 * Never call a cash stake supported below this many buy-ins, whatever the
 * risk formula says: a win rate measured over a few hundred hours is far
 * less certain than the formula assumes, so a hot run must not talk a
 * player into a stake on six buy-ins.
 */
export const FLOOR_CASH_BUYINS = 20;
/** General guidance for tournaments: buy-ins to hold. */
export const GUIDE_MTT_BUYINS = 100;
/** A cash buy-in, in big blinds, for a stake whose blinds can be read. */
export const BIG_BLINDS_PER_BUYIN = 100;

const clamp01 = (p) => (p < 0 ? 0 : p > 1 ? 1 : p);

/** Standard normal CDF (Abramowitz and Stegun 7.1.26 erf, error below 1.5e-7). */
export function normalCdf(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/**
 * Chance of ever going broke. winrate and sd per hour, bankroll in the same
 * money unit. Zero spread: a winning or flat game never loses, a losing one
 * always does.
 */
export function riskOfRuin(winrate, sd, bankroll) {
  if (!(bankroll > 0)) return 1;
  if (!Number.isFinite(winrate) || !Number.isFinite(sd)) return null;
  if (winrate < 0) return 1;
  if (sd <= 0) return 0;
  if (winrate === 0) return 1;
  return clamp01(Math.exp((-2 * winrate * bankroll) / (sd * sd)));
}

/** Chance of going broke within `hours` hours. */
export function ruinWithin(winrate, sd, bankroll, hours = HORIZON_HOURS) {
  if (!(bankroll > 0)) return 1;
  if (!Number.isFinite(winrate) || !Number.isFinite(sd) || !(hours > 0)) return null;
  if (sd <= 0) return bankroll + winrate * hours <= 0 ? 1 : 0;
  const spread = sd * Math.sqrt(hours);
  const drift = winrate * hours;
  const first = normalCdf((-bankroll - drift) / spread);
  const exponent = (-2 * winrate * bankroll) / (sd * sd);
  // exp(exponent) overflows for a steep losing game; its factor is then ~0.
  const second = exponent > 700 ? 0 : Math.exp(exponent) * normalCdf((-bankroll + drift) / spread);
  return clamp01(first + second);
}

/** "2/5", "$2/$5 NL", "2-5 PLO" -> "2/5 nl" style grouping key. */
export function stakeKey(stakes) {
  return String(stakes || '')
    .toLowerCase()
    .replace(/\$/g, '')
    .replace(/\s*[-/]\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The big blind of "1/2", "$2/$5 NL", "5-10-25" (last blind), or null. */
export function bigBlindOf(stakes) {
  const match = /(\d+(?:\.\d+)?)\s*[-/]\s*\$?(\d+(?:\.\d+)?)(?:\s*[-/]\s*\$?(\d+(?:\.\d+)?))?/.exec(String(stakes || '').replace(/\$/g, ''));
  if (!match) return null;
  const blind = Number(match[3] || match[2]);
  return blind > 0 ? blind : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const isCurrent = (row) => row && !row.is_revision;

/**
 * Per cash stake: sessions, timed sessions, hours, net, hourly, standard
 * deviation per hour and the size of one buy-in (dollars).
 *
 * SD per hour from sessions of different lengths: with x_i a session's result
 * and h_i its hours, w = sum x / sum h and
 * s^2 = sum (x_i - w h_i)^2 / h_i / (n - 1),
 * each session weighted by its length (a session of h hours has variance h s^2).
 */
export function cashStakeLevels(rows) {
  const groups = new Map();
  let unlabelled = 0;
  for (const row of rows || []) {
    if (!isCurrent(row) || row.category !== 'poker_cash') continue;
    const key = stakeKey(row.stakes);
    if (!key) { unlabelled += 1; continue; }
    const group = groups.get(key) || { key, labels: new Map(), rows: [] };
    const label = String(row.stakes).trim();
    group.labels.set(label, (group.labels.get(label) || 0) + 1);
    group.rows.push(row);
    groups.set(key, group);
  }

  const levels = [];
  for (const group of groups.values()) {
    const label = [...group.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    let netCents = 0;
    let timedCents = 0;
    let hours = 0;
    const timed = [];
    const buyIns = [];
    for (const row of group.rows) {
      const cents = entryCents(row);
      netCents += cents;
      const h = sessionHours(row.start_time, row.end_time);
      if (h > 0) {
        timed.push({ dollars: cents / 100, hours: h });
        timedCents += cents;
        hours += h;
      }
      const inCents = toCents(row.gross_in);
      if (inCents > 0) buyIns.push(inCents);
    }
    const hourly = hours > 0 ? timedCents / 100 / hours : null;
    let sdHourly = null;
    if (timed.length >= 2 && hourly !== null) {
      let sum = 0;
      for (const s of timed) sum += (s.dollars - hourly * s.hours) ** 2 / s.hours;
      sdHourly = Math.sqrt(sum / (timed.length - 1));
    }
    const bigBlind = bigBlindOf(label);
    const medianIn = median(buyIns);
    const buyIn = bigBlind ? bigBlind * BIG_BLINDS_PER_BUYIN : medianIn !== null ? medianIn / 100 : null;
    levels.push({
      key: group.key,
      label,
      sessions: group.rows.length,
      timedSessions: timed.length,
      hours,
      netCents,
      hourly,
      sdHourly,
      bigBlind,
      buyIn,
      buyInSource: bigBlind ? 'blinds' : medianIn !== null ? 'median' : null,
    });
  }
  levels.sort((a, b) => (a.buyIn ?? Infinity) - (b.buyIn ?? Infinity) || a.label.localeCompare(b.label));
  return { levels, unlabelled };
}

/** The active Max Buy-In % rule, as a percent, or null. */
export function maxBuyInPercent(rules) {
  for (const rule of rules || []) {
    if (!rule || rule.is_active === false || rule.rule_type !== 'max_buyin_percent') continue;
    const percent = Number(rule.value);
    if (percent > 0 && percent <= 100) return percent;
  }
  return null;
}

/** Tournament buy-ins: count, median and largest buy-in in dollars. */
export function tournamentSummary(rows) {
  const buyIns = [];
  let count = 0;
  for (const row of rows || []) {
    if (!isCurrent(row) || row.category !== 'poker_mtt') continue;
    count += 1;
    const cents = toCents(row.gross_in);
    if (cents > 0) buyIns.push(cents);
  }
  const med = median(buyIns);
  return {
    count,
    medianBuyIn: med === null ? null : med / 100,
    largestBuyIn: buyIns.length ? Math.max(...buyIns) / 100 : null,
  };
}

/** "1 in 8", "less than 1 in 1,000", "about 63%". p in [0, 1]. */
export function oddsText(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return 'an unknown chance';
  if (p <= 0) return 'no measurable chance';
  if (p < 0.001) return 'less than a 1 in 1,000 chance';
  if (p > 0.5) return p >= 0.995 ? 'a near-certain chance' : `about a ${Math.round(p * 100)}% chance`;
  return `about a 1 in ${Math.round(1 / p).toLocaleString('en-US')} chance`;
}

/** Short form for a list row: "1 in 8", "Under 1 in 1,000", "None", "63%". */
export function shortOdds(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return 'Unknown';
  if (p <= 0) return 'None';
  if (p < 0.001) return 'Under 1 in 1,000';
  if (p > 0.5) return p >= 0.995 ? 'Near Certain' : `${Math.round(p * 100)}%`;
  return `1 in ${Math.round(1 / p).toLocaleString('en-US')}`;
}

/** Each level judged: buy-ins held, risk, and what decides it. */
function judgeLevel(level, bankroll, rulePercent) {
  const buyInsHeld = level.buyIn > 0 ? bankroll / level.buyIn : null;
  const enough = level.timedSessions >= MIN_STAKE_SESSIONS && level.sdHourly !== null;
  const ror = enough ? riskOfRuin(level.hourly, level.sdHourly, bankroll) : null;
  const rorHorizon = enough ? ruinWithin(level.hourly, level.sdHourly, bankroll, HORIZON_HOURS) : null;
  const ruleCap = rulePercent ? (bankroll * rulePercent) / 100 : null;
  const ruleBlocks = ruleCap !== null && level.buyIn > 0 && level.buyIn > ruleCap + 1e-9;
  let method;
  let supported;
  if (enough) {
    method = 'risk';
    supported = ror !== null && ror <= RISK_TARGET;
  } else {
    method = 'guideline';
    supported = buyInsHeld !== null && buyInsHeld >= GUIDE_CASH_BUYINS;
  }
  const floorBlocks = method === 'risk' && supported && buyInsHeld !== null && buyInsHeld < FLOOR_CASH_BUYINS;
  const decidedBy = ruleBlocks ? 'rule' : floorBlocks ? 'floor' : method;
  return { ...level, buyInsHeld, enoughData: enough, ror, rorHorizon, method, decidedBy, supported: supported && !ruleBlocks && !floorBlocks, ruleBlocks, floorBlocks };
}

function whyNot(level, money, rulePercent, bankroll) {
  if (level.ruleBlocks) {
    const share = Math.round((level.buyIn / bankroll) * 1000) / 10;
    return `Your Max Buy-In ${rulePercent}% rule decides ${level.label}: one buy-in there (${money(level.buyIn)}) is ${share}% of your bankroll.`;
  }
  if (level.floorBlocks) {
    const held = Math.floor(level.buyInsHeld * 10) / 10;
    return `At ${level.label} your results carry ${oddsText(level.rorHorizon)} of going broke over ${HORIZON_HOURS} hours, but you hold only ${held} buy-ins (${money(level.buyIn)} each) and a stake is never supported below ${FLOOR_CASH_BUYINS}.`;
  }
  if (level.method === 'risk') {
    if (level.hourly <= 0) {
      return `At ${level.label} you are ${level.hourly < 0 ? 'losing ' + money(-level.hourly) : 'breaking even'} an hour, so no bankroll is safe there: ${oddsText(level.rorHorizon)} of going broke over ${HORIZON_HOURS} hours.`;
    }
    return `At ${level.label} you would have ${oddsText(level.rorHorizon)} of going broke over ${HORIZON_HOURS} hours.`;
  }
  if (level.buyIn > 0) {
    const held = Math.floor(level.buyInsHeld * 10) / 10;
    return `General guidance for ${level.label} is ${GUIDE_CASH_BUYINS} buy-ins (${money(level.buyIn * GUIDE_CASH_BUYINS)}); you hold ${held}.`;
  }
  return `${level.label} has no buy-in size to measure against.`;
}

/**
 * The whole answer.
 * @param {{ rows: Array, bankroll: number|null, rules?: Array, displayEUR?: boolean }} input
 *   bankroll in US dollars (the Bankroll Balance), null when it is unknown.
 */
export function stakeAffordability({ rows, bankroll, rules = [], displayEUR = false }) {
  const money = (value) => formatCurrency(value, displayEUR);
  const rulePercent = maxBuyInPercent(rules);
  const { levels: raw, unlabelled } = cashStakeLevels(rows);
  const tournaments = tournamentSummary(rows);
  const base = { rulePercent, unlabelled, tournaments: null, levels: [], supported: null, next: null, notes: [] };

  if (bankroll === null || bankroll === undefined || !Number.isFinite(Number(bankroll))) {
    return { ...base, status: 'no-bankroll', sentence: 'Your bankroll balance is not available, so stakes cannot be worked out yet.' };
  }
  const roll = Number(bankroll);
  if (!(roll > 0)) {
    return { ...base, status: 'broke', sentence: `Your bankroll is ${money(roll)}, so it does not support any stake. Add to it with Adjust Bankroll first.` };
  }

  const levels = raw.map((level) => judgeLevel(level, roll, rulePercent));
  const notes = [];
  if (unlabelled > 0) notes.push(`${unlabelled} cash ${unlabelled === 1 ? 'session has' : 'sessions have'} no stakes recorded and ${unlabelled === 1 ? 'is' : 'are'} not counted.`);

  // Tournaments: buy-ins held, never risk of ruin.
  let tourney = null;
  if (tournaments.count > 0) {
    const guideCap = roll / GUIDE_MTT_BUYINS;
    const ruleCap = rulePercent ? (roll * rulePercent) / 100 : null;
    const ruleDecides = ruleCap !== null && ruleCap < guideCap;
    const cap = ruleDecides ? ruleCap : guideCap;
    const held = tournaments.medianBuyIn ? roll / tournaments.medianBuyIn : null;
    let sentence = ruleDecides
      ? `For tournaments your Max Buy-In ${rulePercent}% rule decides: buy-ins up to ${money(cap)}.`
      : `For tournaments, general guidance is ${GUIDE_MTT_BUYINS} buy-ins: your bankroll covers buy-ins up to ${money(cap)}.`;
    if (held !== null) {
      sentence += ` Your typical buy-in of ${money(tournaments.medianBuyIn)} is ${Math.floor(held)} buy-ins of bankroll`;
      sentence += tournaments.medianBuyIn > cap + 1e-9 ? ', above that line.' : '.';
    }
    tourney = { ...tournaments, cap, ruleDecides, buyInsHeld: held, sentence };
  }

  if (!levels.length) {
    const sentence = tourney
      ? 'Log cash sessions with their stakes to see which cash stakes your bankroll supports.'
      : 'Log poker sessions (cash games with their stakes, or tournaments) to see which stakes your bankroll supports.';
    return { ...base, status: 'no-sessions', levels, notes, tournaments: tourney, sentence };
  }

  let supported = null;
  for (const level of levels) if (level.supported) supported = level;
  const above = supported ? levels.slice(levels.indexOf(supported) + 1) : levels;
  const next = above.find((level) => !level.supported) || null;

  let sentence;
  if (supported) {
    sentence = `Your bankroll supports ${supported.label}${supported.method === 'guideline' ? ' by general guidance' : ''}.`;
    sentence += next ? ' ' + whyNot(next, money, rulePercent, roll) : ` That is the highest stake you have played.`;
  } else {
    sentence = `Your bankroll does not support ${levels[0].label} yet. ` + whyNot(levels[0], money, rulePercent, roll);
  }
  const thin = levels.filter((level) => !level.enoughData);
  if (thin.length) {
    notes.push(`${thin.map((level) => level.label).join(', ')}: fewer than ${MIN_STAKE_SESSIONS} timed sessions, so general guidance (${GUIDE_CASH_BUYINS} buy-ins) is used instead of your results.`);
  }
  return { ...base, status: 'ok', levels, supported, next, notes, tournaments: tourney, sentence };
}

/**
 * The "How this is worked out" lines: the formula, its source and its
 * assumptions, in plain words. bankrollText is the formatted balance or null.
 */
export function howItWorks({ bankrollText = null, rulePercent = null } = {}) {
  return [
    'Only your poker sessions count: cash games by the stakes you logged, and tournaments. Deposits, withdrawals, expenses and edited-away versions of a session are left out.',
    `Your bankroll is your Bankroll Balance${bankrollText ? ` (${bankrollText})` : ''}.`,
    `Win rate per hour and standard deviation (SD) per hour come from timed sessions at each stake. A stake needs ${MIN_STAKE_SESSIONS} timed sessions before your own results are used.`,
    `Risk of ruin is exp(-2 × win rate × bankroll ÷ SD²), the standard formula for a normally distributed win rate (Chen and Ankenman, The Mathematics of Poker, chapter 22). A stake is supported when that risk is at most ${Math.round(RISK_TARGET * 100)}% and you hold at least ${FLOOR_CASH_BUYINS} buy-ins for it.`,
    `The ${HORIZON_HOURS}-hour figure is the chance of going broke within ${HORIZON_HOURS} hours of play at that rate.`,
    'It assumes your past win rate and spread are your true ones, that results are roughly normal, and that you play one stake and never move down or top up. Small samples make win rates very uncertain, so treat the numbers as a guide.',
    `A cash buy-in is ${BIG_BLINDS_PER_BUYIN} big blinds; where the stakes cannot be read, your typical buy-in at that stake. With too few sessions, general guidance of ${GUIDE_CASH_BUYINS} buy-ins is used instead.`,
    `Tournaments use general guidance of ${GUIDE_MTT_BUYINS} buy-ins, not risk of ruin: tournament results are far from normal.`,
    `An active Max Buy-In % rule in Bankroll Rules always applies: a stake whose buy-in is over that share of your bankroll is not supported${rulePercent ? ` (yours is ${rulePercent}%)` : ''}.`,
  ];
}

const PAGE = 1000;

/**
 * The rows and rules the answer needs, read with the signed-in player's
 * client. Every page and the rules read throw on error (never read as zero).
 */
export async function loadAffordabilityRows(client, userId) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('bankroll_ledger')
      .select('id, category, stakes, gross_in, gross_out, start_time, end_time, is_revision')
      .eq('user_id', userId)
      .eq('is_revision', false)
      // in-list: bounded literal list of the two poker categories
      .in('category', ['poker_cash', 'poker_mtt'])
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read your sessions: ${error.message || error}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  const { data: rules, error: rulesError } = await client
    .from('bankroll_rules')
    .select('rule_type, value, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (rulesError) throw new Error(`Could not read your Bankroll Rules: ${rulesError.message || rulesError}`);
  return { rows, rules: rules || [] };
}
