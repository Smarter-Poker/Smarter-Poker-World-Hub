/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Solved-Spot Permalink & Validated Calculation Engine
 *  src/lib/seo/solvedSpotEngine.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Deterministic input validation & calculation reproduction for calculator
 *    permalinks and dynamic OpenGraph preview cards (/api/og/tool-card).
 * 2. Preview results NEVER trust caller-supplied ?result= or ?statValue=
 *    strings; every metric is computed from validated numeric/enum inputs
 *    using the maintained poker math formulas with accurate units & rounding.
 * 3. Provides `useSolvedSpotUrlSync` React hook so reopening a shared link
 *    restores calculator inputs and reproduces the exact calculation, while
 *    input changes sync back to `window.history.replaceState`.
 *
 * House style: Title Case, zero em dashes.
 */

import { useEffect, useRef } from 'react';

export const TOOL_OG_PRESETS = Object.freeze({
  'pot-odds-calculator': {
    tool: 'pot-odds-calculator',
    badge: 'POT ODDS & MDF SOLVER',
    title: 'Poker Pot Odds, Required Equity & MDF Calculator',
    subtitle: 'Break-Even Calling Equity, Minimum Defense Frequency & Hypergeometric Draw Outs',
    statLabel: 'GTO MATH ENGINE',
    statValue: 'POT ODDS & MDF',
  },
  'pot-odds': {
    tool: 'pot-odds-calculator',
    badge: 'POT ODDS & MDF SOLVER',
    title: 'Poker Pot Odds, Required Equity & MDF Calculator',
    subtitle: 'Break-Even Calling Equity, Minimum Defense Frequency & Hypergeometric Draw Outs',
    statLabel: 'GTO MATH ENGINE',
    statValue: 'POT ODDS & MDF',
  },
  'outs-calculator': {
    tool: 'outs-calculator',
    badge: 'HYPERGEOMETRIC OUTS SOLVER',
    title: 'Poker Outs & Exact Draw Probability Calculator',
    subtitle: '47-Card Turn, 46-Card River & Flop-To-River Equity Vs. Rule Of 4 And 2 Error',
    statLabel: 'COMBINATORIAL ENGINE',
    statValue: '1 TO 21 OUTS',
  },
  outs: {
    tool: 'outs-calculator',
    badge: 'HYPERGEOMETRIC OUTS SOLVER',
    title: 'Poker Outs & Exact Draw Probability Calculator',
    subtitle: '47-Card Turn, 46-Card River & Flop-To-River Equity Vs. Rule Of 4 And 2 Error',
    statLabel: 'COMBINATORIAL ENGINE',
    statValue: '1 TO 21 OUTS',
  },
  'icm-calculator': {
    tool: 'icm-calculator',
    badge: 'ICM PAYOUT SOLVER',
    title: 'Malmuth-Harville Tournament ICM Calculator',
    subtitle: 'Exact Recursive Final-Table Prize Pool Equity & Bubble Factor Analysis',
    statLabel: 'TOURNAMENT SOLVER',
    statValue: 'EXACT ICM EQUITY',
  },
  icm: {
    tool: 'icm-calculator',
    badge: 'ICM PAYOUT SOLVER',
    title: 'Malmuth-Harville Tournament ICM Calculator',
    subtitle: 'Exact Recursive Final-Table Prize Pool Equity & Bubble Factor Analysis',
    statLabel: 'TOURNAMENT SOLVER',
    statValue: 'EXACT ICM EQUITY',
  },
  'chop-calculator': {
    tool: 'chop-calculator',
    badge: 'FINAL TABLE DEAL SOLVER',
    title: 'Final Table ICM Chop Vs. Chip Chop Calculator',
    subtitle: 'Compare Exact Malmuth-Harville ICM Deals, Linear Chip Chops & Trophy Saves',
    statLabel: 'DEAL NEGOTIATION',
    statValue: 'ICM VS CHIP CHOP',
  },
  chop: {
    tool: 'chop-calculator',
    badge: 'FINAL TABLE DEAL SOLVER',
    title: 'Final Table ICM Chop Vs. Chip Chop Calculator',
    subtitle: 'Compare Exact Malmuth-Harville ICM Deals, Linear Chip Chops & Trophy Saves',
    statLabel: 'DEAL NEGOTIATION',
    statValue: 'ICM VS CHIP CHOP',
  },
  'spr-calculator': {
    tool: 'spr-calculator',
    badge: 'SPR & GEOMETRIC SIZING',
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Calculator',
    subtitle: 'Exact 1-Street, 2-Street & 3-Street Geometric Bet Sizing & Commitment Thresholds',
    statLabel: 'POSTFLOP ENGINE',
    statValue: 'GEOMETRIC SIZING',
  },
  spr: {
    tool: 'spr-calculator',
    badge: 'SPR & GEOMETRIC SIZING',
    title: 'Stack-To-Pot Ratio (SPR) & Geometric Bet Calculator',
    subtitle: 'Exact 1-Street, 2-Street & 3-Street Geometric Bet Sizing & Commitment Thresholds',
    statLabel: 'POSTFLOP ENGINE',
    statValue: 'GEOMETRIC SIZING',
  },
  'variance-calculator': {
    tool: 'variance-calculator',
    badge: 'VARIANCE & CONFIDENCE',
    title: 'Poker Winrate Variance & Downswing Simulator',
    subtitle: '95% Confidence Intervals, Brownian Drawdown Risk & Minimum Sample Proof',
    statLabel: 'STATISTICAL ENGINE',
    statValue: '95% CONFIDENCE',
  },
  variance: {
    tool: 'variance-calculator',
    badge: 'VARIANCE & CONFIDENCE',
    title: 'Poker Winrate Variance & Downswing Simulator',
    subtitle: '95% Confidence Intervals, Brownian Drawdown Risk & Minimum Sample Proof',
    statLabel: 'STATISTICAL ENGINE',
    statValue: '95% CONFIDENCE',
  },
  'plo-bet-calculator': {
    tool: 'plo-bet-calculator',
    badge: 'PLO 3X+POT SOLVER',
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    subtitle: 'Dealer 3x+Pot Shortcut Math, Multi-Way Trail Calls & Double-Board Quartering',
    statLabel: 'OMAHA ENGINE',
    statValue: '3X + POT + TRAIL',
  },
  plo: {
    tool: 'plo-bet-calculator',
    badge: 'PLO 3X+POT SOLVER',
    title: 'Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    subtitle: 'Dealer 3x+Pot Shortcut Math, Multi-Way Trail Calls & Double-Board Quartering',
    statLabel: 'OMAHA ENGINE',
    statValue: '3X + POT + TRAIL',
  },
  'rake-calculator': {
    tool: 'rake-calculator',
    badge: 'LIVE CASH RAKE SOLVER',
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    subtitle: 'Compare Percentage Pot Drops Vs. Half-Hour Seat Charges In Dollars/Hr & BB/100',
    statLabel: 'CARDROOM ECONOMICS',
    statValue: 'POT DROP VS TIME',
  },
  rake: {
    tool: 'rake-calculator',
    badge: 'LIVE CASH RAKE SOLVER',
    title: 'Live Cash Game Rake & Time-Charge Calculator',
    subtitle: 'Compare Percentage Pot Drops Vs. Half-Hour Seat Charges In Dollars/Hr & BB/100',
    statLabel: 'CARDROOM ECONOMICS',
    statValue: 'POT DROP VS TIME',
  },
  'poker-tax-calculator': {
    tool: 'poker-tax-calculator',
    badge: 'IRS FORM W-2G & TAX',
    title: 'US Poker Tax & IRS Form W-2G Calculator',
    subtitle: 'IRC Section 165(d) Loss Deductions, $5,000 W-2G Withholding & Schedule C Math',
    statLabel: 'TAX ESTIMATOR',
    statValue: 'IRC SEC 165(D)',
  },
  tax: {
    tool: 'poker-tax-calculator',
    badge: 'IRS FORM W-2G & TAX',
    title: 'US Poker Tax & IRS Form W-2G Calculator',
    subtitle: 'IRC Section 165(d) Loss Deductions, $5,000 W-2G Withholding & Schedule C Math',
    statLabel: 'TAX ESTIMATOR',
    statValue: 'IRC SEC 165(D)',
  },
  'staking-calculator': {
    tool: 'staking-calculator',
    badge: 'STAKING & MARKUP SOLVER',
    title: 'Tournament Staking, Markup & Payout Split Calculator',
    subtitle: 'Package Cost Per 1%, Required Break-Even ROI & Investor Settlement Splits',
    statLabel: 'BACKING ENGINE',
    statValue: 'MARKUP & PAYOUTS',
  },
  staking: {
    tool: 'staking-calculator',
    badge: 'STAKING & MARKUP SOLVER',
    title: 'Tournament Staking, Markup & Payout Split Calculator',
    subtitle: 'Package Cost Per 1%, Required Break-Even ROI & Investor Settlement Splits',
    statLabel: 'BACKING ENGINE',
    statValue: 'MARKUP & PAYOUTS',
  },
  'iso-calculator': {
    tool: 'iso-calculator',
    badge: 'PREFLOP ISO SIZING',
    title: 'Preflop Isolation Raise Sizing & SPR Calculator',
    subtitle: 'Optimal 3x/4x Base + 1x Per Limper + OOP Tax Sizing & Resulting Flop SPR',
    statLabel: 'PREFLOP ENGINE',
    statValue: 'ISO RAISE & SPR',
  },
  iso: {
    tool: 'iso-calculator',
    badge: 'PREFLOP ISO SIZING',
    title: 'Preflop Isolation Raise Sizing & SPR Calculator',
    subtitle: 'Optimal 3x/4x Base + 1x Per Limper + OOP Tax Sizing & Resulting Flop SPR',
    statLabel: 'PREFLOP ENGINE',
    statValue: 'ISO RAISE & SPR',
  },
  'bounty-calculator': {
    tool: 'bounty-calculator',
    badge: 'PKO & MYSTERY BOUNTY',
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    subtitle: 'Convert Knockout Dollar Bounties Into Tournament Chips & Adjusted Pot Odds',
    statLabel: 'BOUNTY ENGINE',
    statValue: '33.3% POWER FACTOR',
  },
  bounty: {
    tool: 'bounty-calculator',
    badge: 'PKO & MYSTERY BOUNTY',
    title: 'PKO & Mystery Bounty Chip Equity Calculator',
    subtitle: 'Convert Knockout Dollar Bounties Into Tournament Chips & Adjusted Pot Odds',
    statLabel: 'BOUNTY ENGINE',
    statValue: '33.3% POWER FACTOR',
  },
});

function clampNum(val, min, max, fallback = null) {
  if (val === undefined || val === null || String(val).trim() === '') return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function computeMalmuthHarvilleIcm(stacks = [], payouts = []) {
  const n = stacks.length;
  const totalChips = stacks.reduce((a, b) => a + b, 0);
  if (totalChips <= 0 || n === 0) return stacks.map(() => 0);

  const equities = new Array(n).fill(0);

  function recurse(activeMask, remainingTotal, placeIdx, probPrefix) {
    if (placeIdx >= n || placeIdx >= payouts.length || probPrefix < 1e-10) return;
    const prize = payouts[placeIdx] || 0;
    for (let i = 0; i < n; i += 1) {
      if ((activeMask & (1 << i)) === 0) continue;
      const stack = stacks[i];
      if (stack <= 0) continue;
      const pWinPlace = remainingTotal > 0 ? stack / remainingTotal : 0;
      const branchProb = probPrefix * pWinPlace;
      equities[i] += branchProb * prize;
      if (placeIdx + 1 < n && placeIdx + 1 < payouts.length) {
        recurse(activeMask ^ (1 << i), remainingTotal - stack, placeIdx + 1, branchProb);
      }
    }
  }

  recurse((1 << n) - 1, totalChips, 0, 1);
  return equities;
}

/**
 * Validates raw query parameters for a calculator and reproduces the exact
 * calculation from maintained formulas. Caller-supplied ?result= or ?statValue=
 * strings are never used.
 */
export function computeValidatedSolvedSpot(toolKey = '', rawQuery = {}) {
  const key = String(toolKey || '').trim().toLowerCase();
  const q = rawQuery && typeof rawQuery === 'object' ? rawQuery : {};

  // 1. Pot Odds & MDF Calculator
  if (key === 'pot-odds-calculator' || key === 'pot-odds' || (key === 'gto' && q.pot !== undefined && q.bet !== undefined)) {
    const pot = clampNum(q.pot, 1, 10000000, null);
    const bet = clampNum(q.bet, 1, 10000000, null);
    if (pot !== null && bet !== null) {
      const outs = clampNum(q.outs, 0, 25, 9);
      const totalPotBeforeCall = pot + bet;
      const finalPotAfterCall = pot + bet * 2;
      const reqEquity = (bet / finalPotAfterCall) * 100;
      const mdf = (pot / totalPotBeforeCall) * 100;
      const potOddsRatio = totalPotBeforeCall / bet;
      const flopToRiverExact = (1 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'pot-odds-calculator',
        statLabel: `SOLVED POT ODDS ($${Math.round(pot)} POT / $${Math.round(bet)} BET)`,
        statValue: `${reqEquity.toFixed(1)}% Eq • ${mdf.toFixed(1)}% MDF (${potOddsRatio.toFixed(2)}:1)`,
        summaryText: `Pot $${Math.round(pot)} Facing $${Math.round(bet)} Bet: ${reqEquity.toFixed(1)}% Required Equity (${potOddsRatio.toFixed(2)}:1 Odds), ${mdf.toFixed(1)}% Minimum Defense Frequency, ${flopToRiverExact.toFixed(1)}% Flop-To-River Draw Equity (${Math.round(outs)} Outs).`,
        normalizedQuery: { pot: Math.round(pot), bet: Math.round(bet), outs: Math.round(outs) },
      };
    }
  }

  // 2. Hypergeometric Outs Calculator
  if (key === 'outs-calculator' || key === 'outs') {
    const outs = clampNum(q.outs, 1, 21, null);
    if (outs !== null) {
      const safeOuts = Math.round(outs);
      const street = String(q.street || 'flop').toLowerCase() === 'turn' ? 'turn' : 'flop';
      const pot = clampNum(q.pot, 1, 10000000, 100);
      const call = clampNum(q.call, 0, 10000000, 50);
      const turnPct = (safeOuts / 47) * 100;
      const riverPct = (safeOuts / 46) * 100;
      const flopToRiverPct = (1 - ((47 - safeOuts) / 47) * ((46 - safeOuts) / 46)) * 100;
      const activePct = street === 'turn' ? riverPct : flopToRiverPct;
      const rulePct = street === 'turn' ? safeOuts * 2 : safeOuts * 4;
      const ruleErr = rulePct - activePct;
      return {
        hasValidatedSpot: true,
        tool: 'outs-calculator',
        statLabel: `SOLVED DRAW EQUITY (${safeOuts} OUTS ON ${street.toUpperCase()})`,
        statValue:
          street === 'turn'
            ? `${riverPct.toFixed(2)}% River Hit (Rule Err ${ruleErr >= 0 ? '+' : ''}${ruleErr.toFixed(2)}%)`
            : `${flopToRiverPct.toFixed(2)}% By River (${turnPct.toFixed(2)}% Turn)`,
        summaryText: `${safeOuts} Clean Outs On The ${street === 'turn' ? 'Turn (46 Unseen Cards)' : 'Flop (47 Unseen Cards)'}: Exact Hit Probability ${activePct.toFixed(2)}% Vs. Rule Of ${street === 'turn' ? '2' : '4'} Estimate ${rulePct.toFixed(1)}% (${ruleErr >= 0 ? '+' : ''}${ruleErr.toFixed(2)}% Error).`,
        normalizedQuery: { outs: safeOuts, street, pot: Math.round(pot), call: Math.round(call) },
      };
    }
  }

  // 3. Final Table Chop & ICM Calculator
  if (key === 'chop-calculator' || key === 'chop' || key === 'icm-calculator' || key === 'icm') {
    if (q.stacks && q.payouts) {
      const stacks = String(q.stacks)
        .split(',')
        .map((v) => clampNum(v, 1, 1000000000, null))
        .filter((v) => v !== null)
        .slice(0, 6);
      const payouts = String(q.payouts)
        .split(',')
        .map((v) => clampNum(v, 0, 1000000000, null))
        .filter((v) => v !== null)
        .slice(0, 6);
      if (stacks.length >= 2 && payouts.length >= 2) {
        const count = Math.min(stacks.length, payouts.length);
        const activeStacks = stacks.slice(0, count);
        const activePayouts = payouts.slice(0, count);
        const totalPool = activePayouts.reduce((a, b) => a + b, 0);
        const minPrize = activePayouts[count - 1] || 0;
        const maxSave = Math.max(0, totalPool - minPrize * count);
        const save = clampNum(q.save, 0, maxSave, 0);
        const scale = totalPool > minPrize * count ? (totalPool - save - minPrize * count) / (totalPool - minPrize * count) : 1;
        const scaledPayouts = activePayouts.map((p) => minPrize + (p - minPrize) * scale);
        const icm = computeMalmuthHarvilleIcm(activeStacks, save > 0 ? scaledPayouts : activePayouts);
        const totalChips = activeStacks.reduce((a, b) => a + b, 0);
        const distributePool = Math.max(0, totalPool - save - minPrize * count);
        const chipChop = activeStacks.map((s) => minPrize + distributePool * (s / totalChips));
        return {
          hasValidatedSpot: true,
          tool: key.includes('icm') ? 'icm-calculator' : 'chop-calculator',
          statLabel: `SOLVED ${count}-HANDED ICM ($${Math.round(totalPool).toLocaleString('en-US')} POOL)`,
          statValue: `P1 $${icm[0].toFixed(2)} • P2 $${icm[1].toFixed(2)}${count >= 3 ? ` • P3 $${icm[2].toFixed(2)}` : ''}`,
          summaryText: `${count}-Handed Malmuth-Harville ICM (${activeStacks.join(' / ')} Chips, $${Math.round(totalPool).toLocaleString('en-US')} Pool${save > 0 ? `, $${Math.round(save)} Save` : ''}): P1 ICM $${icm[0].toFixed(2)} (Chip Chop $${chipChop[0].toFixed(2)}), P2 ICM $${icm[1].toFixed(2)} (Chip Chop $${chipChop[1].toFixed(2)}).`,
          normalizedQuery: {
            stacks: activeStacks.join(','),
            payouts: activePayouts.join(','),
            ...(save > 0 ? { save: Math.round(save) } : {}),
          },
        };
      }
    }
  }

  // 4. SPR & Geometric Bet Sizing Calculator
  if (key === 'spr-calculator' || key === 'spr') {
    const pot = clampNum(q.pot, 1, 10000000, null);
    const stack = clampNum(q.stack, 1, 10000000, null);
    if (pot !== null && stack !== null) {
      const spr = stack / pot;
      const geo2 = ((Math.pow(1 + 2 * spr, 1 / 2) - 1) / 2) * 100;
      const geo3 = ((Math.pow(1 + 2 * spr, 1 / 3) - 1) / 2) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'spr-calculator',
        statLabel: `SOLVED SPR ($${Math.round(stack)} STACK / $${Math.round(pot)} POT)`,
        statValue: `${spr.toFixed(2)} SPR • ${geo3.toFixed(1)}% 3-St Geo`,
        summaryText: `Effective Stack $${Math.round(stack)} Into $${Math.round(pot)} Pot = ${spr.toFixed(2)} SPR: 3-Street Geometric Sizing ${geo3.toFixed(1)}% Pot ($${Math.round(pot * (geo3 / 100))} Flop Bet), 2-Street Geometric Sizing ${geo2.toFixed(1)}% Pot.`,
        normalizedQuery: { pot: Math.round(pot), stack: Math.round(stack) },
      };
    }
  }

  // 5. Variance & Confidence Interval Calculator
  if (key === 'variance-calculator' || key === 'variance') {
    const wr = clampNum(q.wr ?? q.winrate, -50, 50, null);
    const sd = clampNum(q.sd ?? q.stdDev, 20, 300, null);
    const hands = clampNum(q.hands, 1000, 10000000, null);
    if (wr !== null && sd !== null && hands !== null) {
      const safeHands = Math.round(hands);
      const nBlocks = safeHands / 100;
      const evBb = nBlocks * wr;
      const totalSdBb = Math.sqrt(nBlocks) * sd;
      const ciLow = Math.round(evBb - 1.96 * totalSdBb);
      const ciHigh = Math.round(evBb + 1.96 * totalSdBb);
      const minHands95 = wr > 0 ? Math.round(Math.pow((1.96 * sd) / wr, 2) * 100) : null;
      return {
        hasValidatedSpot: true,
        tool: 'variance-calculator',
        statLabel: `SOLVED 95% CI (${safeHands.toLocaleString('en-US')} HANDS @ ${wr.toFixed(1)} BB/100)`,
        statValue: `${evBb >= 0 ? '+' : ''}${Math.round(evBb)} BB ([${ciLow}, +${ciHigh}] BB)`,
        summaryText: `${wr.toFixed(1)} BB/100 Winrate With ${sd.toFixed(0)} BB/100 Std Dev Over ${safeHands.toLocaleString('en-US')} Hands: Expected EV ${evBb >= 0 ? '+' : ''}${Math.round(evBb)} BB, 95% Confidence Interval [${ciLow} BB, +${ciHigh} BB]${minHands95 ? `, ${minHands95.toLocaleString('en-US')} Hands Needed For 95% Proof` : ''}.`,
        normalizedQuery: { wr, sd, hands: safeHands },
      };
    }
  }

  // 6. PLO Max Bet Calculator
  if (key === 'plo-bet-calculator' || key === 'plo') {
    const pot = clampNum(q.pot, 1, 10000000, null);
    const bet = clampNum(q.bet ?? q.call, 0, 10000000, null);
    if (pot !== null && bet !== null) {
      const trail = clampNum(q.trail ?? q.dead, 0, 10000000, 0);
      const maxBet = 3 * bet + trail + pot;
      const resultingPot = pot + bet + trail + maxBet;
      return {
        hasValidatedSpot: true,
        tool: 'plo-bet-calculator',
        statLabel: `SOLVED PLO 3X+POT ($${Math.round(pot)} POT / $${Math.round(bet)} BET)`,
        statValue: `Max Bet $${Math.round(maxBet)} (Pot $${Math.round(resultingPot)})`,
        summaryText: `PLO 3x Shortcut: 3 x $${Math.round(bet)} Last Bet + $${Math.round(trail)} Trail Calls + $${Math.round(pot)} Previous Pot = $${Math.round(maxBet)} Max Pot Raise (Resulting Pot $${Math.round(resultingPot)}).`,
        normalizedQuery: { pot: Math.round(pot), bet: Math.round(bet), trail: Math.round(trail) },
      };
    }
  }

  // 7. Live Cash Game Rake Calculator
  if (key === 'rake-calculator' || key === 'rake') {
    const bb = clampNum(q.bb, 1, 1000, null);
    const cap = clampNum(q.cap, 0, 100, null);
    if (bb !== null && cap !== null) {
      const promo = clampNum(q.promo, 0, 20, 2);
      const hph = clampNum(q.hph, 10, 500, 28);
      const potsWon = clampNum(q.pots, 0.5, 25, 3.5);
      const halfHour = clampNum(q.time, 0, 100, 7);
      const avgRakePerPot = cap * 0.82 + promo;
      const hourlyPotRake = potsWon * avgRakePerPot;
      const potRakeBb100 = ((hourlyPotRake / bb) / hph) * 100;
      const hourlyTime = halfHour * 2;
      return {
        hasValidatedSpot: true,
        tool: 'rake-calculator',
        statLabel: `SOLVED LIVE RAKE ($${cap} CAP + $${promo} DROP @ $${bb} BB)`,
        statValue: `$${hourlyPotRake.toFixed(2)}/Hr (${potRakeBb100.toFixed(2)} BB/100)`,
        summaryText: `Live $${bb} BB Cash Game ($${cap} Cap + $${promo} Promo Drop, ${potsWon} Pots Won/Hr): $${hourlyPotRake.toFixed(2)}/Hr Pot Rake (${potRakeBb100.toFixed(2)} BB/100) Vs. $${hourlyTime.toFixed(2)}/Hr Timed Seat Charge.`,
        normalizedQuery: { bb, cap, promo, hph: Math.round(hph), pots: potsWon, time: halfHour },
      };
    }
  }

  // 8. US Poker Tax & W-2G Calculator
  if (key === 'poker-tax-calculator' || key === 'tax') {
    const wins = clampNum(q.wins, 0, 100000000, null);
    const losses = clampNum(q.losses, 0, 100000000, null);
    if (wins !== null && losses !== null) {
      const status = String(q.status || 'recreational').toLowerCase() === 'pro' ? 'pro' : 'recreational';
      const expenses = status === 'pro' ? clampNum(q.expenses, 0, 10000000, 0) : 0;
      const tourney = clampNum(q.tourney, 0, 100000000, 0);
      const deductible = Math.min(wins, losses + expenses);
      const netProfit = Math.max(0, wins - deductible);
      const w2g = tourney > 5000;
      return {
        hasValidatedSpot: true,
        tool: 'poker-tax-calculator',
        statLabel: `SOLVED POKER TAX (${status.toUpperCase()} FILING)`,
        statValue: `$${Math.round(netProfit).toLocaleString('en-US')} Net (${w2g ? 'W-2G Required' : 'No W-2G'})`,
        summaryText: `IRC Sec 165(d) Tax Summary ($${Math.round(wins).toLocaleString('en-US')} Gross Wins, $${Math.round(losses).toLocaleString('en-US')} Losses): $${Math.round(netProfit).toLocaleString('en-US')} Net Taxable Gambling Income (${w2g ? 'Form W-2G Triggered On >$5,000 Tournament Net' : 'Below $5,000 Form W-2G Threshold'}).`,
        normalizedQuery: { wins: Math.round(wins), losses: Math.round(losses), status, tourney: Math.round(tourney) },
      };
    }
  }

  // 9. Tournament Staking & Markup Calculator
  if (key === 'staking-calculator' || key === 'staking') {
    const pkg = clampNum(q.package, 100, 10000000, null);
    const markup = clampNum(q.markup, 1.0, 2.0, null);
    if (pkg !== null && markup !== null) {
      const sold = clampNum(q.sold, 1, 95, 50);
      const share = clampNum(q.share, 1, 95, 10);
      const cashes = clampNum(q.cashes, 0, 100000000, 0);
      const shareCost = pkg * (share / 100) * markup;
      const sharePayout = cashes * (share / 100);
      const breakevenRoi = (markup - 1) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'staking-calculator',
        statLabel: `SOLVED STAKING ($${Math.round(pkg).toLocaleString('en-US')} @ ${markup.toFixed(2)}X MARKUP)`,
        statValue: `${share}% Cost $${Math.round(shareCost).toLocaleString('en-US')} • Payout $${Math.round(sharePayout).toLocaleString('en-US')}`,
        summaryText: `$${Math.round(pkg).toLocaleString('en-US')} Package At ${markup.toFixed(2)}x Markup (${breakevenRoi.toFixed(1)}% Break-Even ROI): ${share}% Investor Share Costs $${Math.round(shareCost).toLocaleString('en-US')} And Receives $${Math.round(sharePayout).toLocaleString('en-US')} On $${Math.round(cashes).toLocaleString('en-US')} Cashes.`,
        normalizedQuery: { package: Math.round(pkg), markup, sold: Math.round(sold), share: Math.round(share), cashes: Math.round(cashes) },
      };
    }
  }

  // 10. Preflop Isolation Raise Calculator
  if (key === 'iso-calculator' || key === 'iso') {
    const limpers = clampNum(q.limpers, 1, 8, null);
    const stack = clampNum(q.stack, 20, 500, null);
    if (limpers !== null && stack !== null) {
      const safeLimpers = Math.round(limpers);
      const pos = String(q.pos || 'IP').toUpperCase() === 'OOP' ? 'OOP' : 'IP';
      const env = String(q.env || 'live').toLowerCase() === 'online' ? 'online' : 'live';
      const bb = clampNum(q.bb, 0.1, 1000, 5);
      const baseBb = env === 'live' ? 4.0 : 3.0;
      const oopBb = pos === 'IP' ? 0 : env === 'live' ? 1.5 : 1.0;
      const deepBb = stack >= 150 ? 0.5 : 0;
      const isoBb = Math.min(stack, Math.round((baseBb + safeLimpers + oopBb + deepBb) * 2) / 2);
      const deadBb = (pos === 'IP' ? 1.5 : 0.5) + (safeLimpers - 1);
      const flopPotBb = isoBb * 2 + deadBb;
      const spr = flopPotBb > 0 ? Math.max(0, stack - isoBb) / flopPotBb : 0;
      return {
        hasValidatedSpot: true,
        tool: 'iso-calculator',
        statLabel: `SOLVED ISO RAISE (${safeLimpers} LIMPERS, ${pos}, ${Math.round(stack)} BB)`,
        statValue: `${isoBb.toFixed(1)} BB ($${Math.round(isoBb * bb)}) • ${spr.toFixed(2)} SPR`,
        summaryText: `Preflop Isolation Over ${safeLimpers} Limper(s) (${pos}, ${env === 'live' ? 'Live' : 'Online'}, ${Math.round(stack)} BB Stack): Optimal Iso Size ${isoBb.toFixed(1)} BB ($${Math.round(isoBb * bb)}), Heads-Up Flop Pot ${flopPotBb.toFixed(1)} BB, Resulting Flop SPR ${spr.toFixed(2)}.`,
        normalizedQuery: { bb, limpers: safeLimpers, pos, stack: Math.round(stack), env },
      };
    }
  }

  // 11. PKO & Mystery Bounty Calculator
  if (key === 'bounty-calculator' || key === 'bounty') {
    const startStack = clampNum(q.startStack, 1000, 10000000, null);
    const startBounty = clampNum(q.startBounty, 1, 1000000, null);
    const targetBounty = clampNum(q.targetBounty, 1, 1000000, null);
    if (startStack !== null && startBounty !== null && targetBounty !== null) {
      const pot = clampNum(q.pot, 100, 100000000, 12000);
      const call = clampNum(q.call, 100, 100000000, 8000);
      const oneStartBountyChips = startStack / 3;
      const chipEq = Math.round(oneStartBountyChips * (targetBounty / startBounty));
      const adjReqEq = (call / (pot + call + chipEq)) * 100;
      return {
        hasValidatedSpot: true,
        tool: 'bounty-calculator',
        statLabel: `SOLVED BOUNTY ($${targetBounty} TARGET / ${Math.round(startStack).toLocaleString('en-US')} START)`,
        statValue: `+${chipEq.toLocaleString('en-US')} Chips • ${adjReqEq.toFixed(1)}% Req Eq`,
        summaryText: `$${targetBounty} Knockout Bounty (Starting Stack ${Math.round(startStack).toLocaleString('en-US')}, Starting Bounty $${startBounty}): Worth +${chipEq.toLocaleString('en-US')} Tournament Chips (33.3% Power Factor), Reducing Required All-In Calling Equity To ${adjReqEq.toFixed(1)}%.`,
        normalizedQuery: {
          startStack: Math.round(startStack),
          startBounty,
          targetBounty,
          pot: Math.round(pot),
          call: Math.round(call),
        },
      };
    }
  }

  // 12. 3-Bet & 4-Bet Calculator
  if (key === '3bet-calculator' || key === '3bet') {
    const open = clampNum(q.open, 2.0, 15.0, null);
    const stack = clampNum(q.stack, 15, 500, null);
    if (open !== null && stack !== null) {
      const callers = Math.round(clampNum(q.callers, 0, 7, 0));
      const pos = String(q.pos || 'IP').toUpperCase() === 'OOP' ? 'OOP' : 'IP';
      const deepBonus = stack >= 140 ? 0.5 : 0;
      const baseMult = (pos === 'IP' ? 3.0 : 4.0) + callers * 1.0 + deepBonus;
      const threeBetBb = Math.min(stack, Math.round(open * baseMult * 2) / 2);
      const potBefore = 1.5 + open * (1 + callers);
      const villainMdf = 100 - (threeBetBb / (threeBetBb + potBefore)) * 100;
      return {
        hasValidatedSpot: true,
        tool: '3bet-calculator',
        statLabel: `SOLVED 3-BET (${open.toFixed(1)} BB OPEN, ${callers} CALLERS, ${pos})`,
        statValue: `${threeBetBb.toFixed(1)} BB 3-Bet • ${villainMdf.toFixed(1)}% Villain MDF`,
        summaryText: `Facing ${open.toFixed(1)} BB Open With ${callers} Caller(s) (${pos}, ${Math.round(stack)} BB Deep): Optimal 3-Bet Size ${threeBetBb.toFixed(1)} BB, Villain Minimum Defense Frequency ${villainMdf.toFixed(1)}%.`,
        normalizedQuery: { open, callers, stack: Math.round(stack), pos },
      };
    }
  }

  // 13. Bankroll & Risk-Of-Ruin Calculator
  if (key === 'bankroll-calculator' || key === 'bankroll') {
    const wr = clampNum(q.wr, 0.5, 40, null);
    const sd = clampNum(q.sd, 20, 250, null);
    if (wr !== null && sd !== null) {
      const bi = Math.round(clampNum(q.bi, 5, 500, 30));
      const dollars = Math.round(clampNum(q.dollars, 10, 100000, 300));
      const bankrollBb = bi * 100;
      const rorPct = Math.min(100, Math.max(0.01, Math.exp((-2 * wr * bankrollBb) / (sd * sd)) * 100));
      const onePctBi = Math.ceil((4.60517 * sd * sd) / (2 * wr * 100));
      return {
        hasValidatedSpot: true,
        tool: 'bankroll-calculator',
        statLabel: `SOLVED RISK OF RUIN (${wr.toFixed(1)} BB/100, ${Math.round(sd)} SD, ${bi} BI)`,
        statValue: `${rorPct < 0.05 ? '<0.05' : rorPct.toFixed(2)}% RoR • ${onePctBi} BI For <1% RoR`,
        summaryText: `Bankroll Risk Of Ruin At ${wr.toFixed(1)} BB/100 Winrate (${Math.round(sd)} BB/100 SD, ${bi} Buy-Ins = $${(bi * dollars).toLocaleString('en-US')}): ${rorPct < 0.05 ? '<0.05' : rorPct.toFixed(2)}% RoR (${onePctBi} Buy-Ins Required For <1% RoR).`,
        normalizedQuery: { wr, sd: Math.round(sd), bi, dollars },
      };
    }
  }

  // 14. Push/Fold Nash Calculator
  if (key === 'push-fold-calculator' || key === 'push-fold') {
    const stack = clampNum(q.stack, 2, 25, null);
    if (stack !== null) {
      const posMap = { UTG: 19.4, MP: 23.5, HJ: 29.1, CO: 37.4, BTN: 48.2, SB: 64.8 };
      const pos = posMap[String(q.pos || 'BTN').toUpperCase()] ? String(q.pos || 'BTN').toUpperCase() : 'BTN';
      const ante = clampNum(q.ante, 0, 25, 12.5);
      const shovePct = Math.min(96.0, Math.max(5.0, posMap[pos] * Math.pow(10 / stack, 0.58) * (0.85 + (ante / 12.5) * 0.15)));
      const deadBb = 1.5 + (ante / 12.5) * 1.0;
      const mRatio = stack / deadBb;
      return {
        hasValidatedSpot: true,
        tool: 'push-fold-calculator',
        statLabel: `SOLVED PUSH/FOLD (${stack.toFixed(1)} BB FROM ${pos}, ${ante.toFixed(1)}% ANTE)`,
        statValue: `Shove ${shovePct.toFixed(1)}% • M-Ratio ${mRatio.toFixed(2)}`,
        summaryText: `Short-Stack Push/Fold At ${stack.toFixed(1)} BB From ${pos} (${ante.toFixed(1)}% Ante): Unexploitable Nash Open-Shove Frequency ${shovePct.toFixed(1)}% (${Math.round((shovePct / 100) * 1326)} Combos), M-Ratio ${mRatio.toFixed(2)}.`,
        normalizedQuery: { stack, pos, ante },
      };
    }
  }

  // 15. Poker Winrate Calculator
  if (key === 'poker-winrate-calculator' || key === 'winrate') {
    const profit = clampNum(q.profit, -10000000, 10000000, null);
    const bb = clampNum(q.bb, 0.05, 10000, null);
    const hours = clampNum(q.hours, 1, 100000, null);
    if (profit !== null && bb !== null && hours !== null) {
      const hph = Math.round(clampNum(q.hph, 10, 1500, 28));
      const totalHands = Math.max(1, Math.round(hours * hph));
      const bbPer100 = ((profit / bb) / totalHands) * 100;
      const hourlyDollars = profit / hours;
      return {
        hasValidatedSpot: true,
        tool: 'poker-winrate-calculator',
        statLabel: `SOLVED WINRATE ($${Math.round(profit).toLocaleString('en-US')} OVER ${Math.round(hours)} HRS @ $${bb} BB)`,
        statValue: `${bbPer100.toFixed(2)} BB/100 • $${hourlyDollars.toFixed(2)}/Hr`,
        summaryText: `$${Math.round(profit).toLocaleString('en-US')} Net Profit Over ${Math.round(hours)} Hours (${totalHands.toLocaleString('en-US')} Hands At $${bb} BB): ${bbPer100.toFixed(2)} BB/100 Winrate And $${hourlyDollars.toFixed(2)}/Hr Hourly Earn.`,
        normalizedQuery: { profit: Math.round(profit), bb, hours: Math.round(hours), hph },
      };
    }
  }

  return {
    hasValidatedSpot: false,
    tool: key || 'tool',
    statLabel: null,
    statValue: null,
    summaryText: null,
    normalizedQuery: {},
  };
}

/**
 * Builds the canonical /api/og/tool-card URL for a calculator page, forwarding
 * only validated query parameters so social previews reproduce the calculation.
 */
export function buildSolvedSpotOgImageUrl(pathname = '', query = {}) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/tools/')) return undefined;
  const slug = pathname.replace(/^\/tools\//, '').replace(/\/$/, '');
  const preset = TOOL_OG_PRESETS[slug];
  if (!preset) return undefined;

  const solved = computeValidatedSolvedSpot(slug, query);
  const params = new URLSearchParams();
  params.set('tool', preset.tool);
  if (solved.hasValidatedSpot) {
    Object.entries(solved.normalizedQuery).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        params.set(k, String(v));
      }
    });
  }
  return `https://smarter.poker/api/og/tool-card?${params.toString()}`;
}

/**
 * React hook that:
 * 1. Restores URL query parameters into calculator state on mount so reopening
 *    a shared permalink reproduces the exact calculation.
 * 2. Syncs calculator state changes back to `window.history.replaceState` and
 *    notifies `CitationBacklinkBox` via the `smarterpoker:urlchange` event.
 */
export function useSolvedSpotUrlSync(stateParams = {}, restoreHandlers = {}) {
  const hydratedRef = useRef(false);
  const restoreRef = useRef(restoreHandlers);
  restoreRef.current = restoreHandlers;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    const handlers = restoreRef.current || {};
    Object.keys(handlers).forEach((key) => {
      if (params.has(key) && typeof handlers[key] === 'function') {
        handlers[key](params.get(key));
      }
    });
    hydratedRef.current = true;
  }, []);

  const serializedState = JSON.stringify(stateParams || {});

  useEffect(() => {
    if (typeof window === 'undefined' || !hydratedRef.current) return;
    const currentParams = new URLSearchParams(window.location.search || '');
    if (currentParams.get('embed') === 'true') return;

    const nextParams = new URLSearchParams();
    const parsed = JSON.parse(serializedState);
    Object.entries(parsed).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        nextParams.set(k, String(v));
      }
    });
    const qs = nextParams.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash || ''}`) {
      window.history.replaceState(null, '', nextUrl);
      window.dispatchEvent(new CustomEvent('smarterpoker:urlchange', { detail: { search: qs ? `?${qs}` : '' } }));
    }
  }, [serializedState]);
}
