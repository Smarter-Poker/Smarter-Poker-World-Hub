// Monte Carlo bankroll projection, pure and seedable so it can be tested.
//
// Defects this replaced in /api/bankroll/projection:
// - deposits, withdrawals, expenses and superseded revisions were sampled as
//   "sessions", so a $5,000 deposit read as a winning session;
// - ruin was only checked at week ends, so a run that hit zero mid-week and
//   recovered was never counted;
// - "Avg Max Drawdown" was start-minus-lowest-point, which is zero for any run
//   that dips after first climbing above the start;
// - 30 days simulated 35 (whole weeks), and sessions-per-week was unchecked,
//   so a blank field sent NaN and a huge value pinned the server.

import { SESSION_CATEGORIES } from './ledgerReport.mjs';

export const PROJECTION_PERIODS = Object.freeze([30, 90, 180, 365]);
export const MIN_SESSIONS = 5;
export const SIMULATION_COUNT = 1000;

/** Validated simulation inputs, or an error message. */
export function projectionInputs(body = {}) {
  const sessionsPerWeek = Number(body.sessionsPerWeek);
  const projectionDays = Number(body.projectionDays);
  const currentBankroll = Number(body.currentBankroll ?? 0);
  if (!Number.isInteger(sessionsPerWeek) || sessionsPerWeek < 1 || sessionsPerWeek > 21) {
    return { error: 'Sessions per week must be a whole number from 1 to 21' };
  }
  if (!PROJECTION_PERIODS.includes(projectionDays)) return { error: 'Choose 30, 90, 180 or 365 days' };
  if (!Number.isFinite(currentBankroll)) return { error: 'Current bankroll is not a number' };
  return { sessionsPerWeek, projectionDays, currentBankroll };
}

/** Net result in dollars of each gaming session; other ledger rows are excluded. */
export function sessionResults(entries = []) {
  return entries
    .filter((e) => e && !e.is_revision && SESSION_CATEGORIES.includes(e.category))
    .map((e) => Math.round(((Number(e.gross_out) || 0) - (Number(e.gross_in) || 0)) * 100) / 100);
}

/** Deterministic PRNG (mulberry32) for tests. */
export function seededRandom(seed = 1) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random, mean, sd) {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd + mean;
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

export function runProjection(results, { currentBankroll, sessionsPerWeek, projectionDays }, { random = Math.random, runs = SIMULATION_COUNT } = {}) {
  const n = results.length;
  const mean = results.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(results.reduce((a, r) => a + (r - mean) ** 2, 0) / n);
  const totalSessions = Math.max(1, Math.round((projectionDays / 7) * sessionsPerWeek));

  const finals = [];
  let ruined = 0;
  let drawdownSum = 0;
  for (let run = 0; run < runs; run++) {
    let bankroll = currentBankroll;
    let peak = bankroll;
    let maxDrawdown = 0;
    let hitZero = false;
    for (let s = 0; s < totalSessions; s++) {
      bankroll += gaussian(random, mean, sd);
      if (bankroll > peak) peak = bankroll;
      if (peak - bankroll > maxDrawdown) maxDrawdown = peak - bankroll;
      if (bankroll <= 0) hitZero = true;
    }
    finals.push(bankroll);
    drawdownSum += maxDrawdown;
    if (hitZero) ruined++;
  }
  finals.sort((a, b) => a - b);
  const p50 = percentile(finals, 0.5);
  return {
    projection: {
      timeframe: `${projectionDays} days`,
      sessionsSimulated: totalSessions,
      simulationRuns: runs,
      pessimistic: Math.round(percentile(finals, 0.05)),
      conservative: Math.round(percentile(finals, 0.25)),
      expected: Math.round(p50),
      optimistic: Math.round(percentile(finals, 0.75)),
      bestCase: Math.round(percentile(finals, 0.95)),
      winProbability: Math.round((finals.filter((b) => b > currentBankroll).length / runs) * 100),
      // Risk of ruin needs a bankroll to lose; with none recorded it is not measured.
      ruinProbability: currentBankroll > 0 ? Math.round((ruined / runs) * 100) : null,
      avgMaxDrawdown: Math.round(drawdownSum / runs),
      expectedGain: Math.round(p50 - currentBankroll),
      expectedGainPercent: currentBankroll > 0 ? Math.round(((p50 - currentBankroll) / currentBankroll) * 100) : 0,
    },
    inputs: {
      currentBankroll,
      sessionsPerWeek,
      projectionDays,
      avgSessionResult: Math.round(mean),
      sessionStdDev: Math.round(sd),
      historicalSessions: n,
    },
  };
}
