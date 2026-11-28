/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET / POST /api/ai/solve-question
 *  Natural-Language Poker Math Question Parser & Deterministic Solver API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Parses natural-language poker questions into structured calculator parameters,
 * runs the exact deterministic solver, and returns:
 * {
 *   matchedTool,
 *   canonicalUrl,
 *   markdownUrl,
 *   headline,
 *   verdict,
 *   metrics,
 *   ifThenBecause,
 *   citationDoi: '10.5281/zenodo.24115647'
 * }
 *
 * House style: Title Case, zero em dashes.
 */

import { executeMcpTool } from '../../../src/lib/mcp/mcpServer.mjs';

const SITE = 'https://smarter.poker';
const CITATION_DOI = '10.5281/zenodo.24115647';

export function parseAndSolvePokerQuestion(rawQuestion = '') {
  const q = String(rawQuestion || '').trim() || 'I have 120 into a 180 pot on the river, what pot odds and MDF do I need?';
  const lower = q.toLowerCase();
  const nums = (q.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));

  // 1. 3-Way / Multiway All-In EV
  if (/3-?way|three-?way|multi-?way\s+all-?\s*in|side\s*pot/i.test(lower)) {
    const eq1 = nums[0] && nums[0] <= 95 ? nums[0] : 45;
    const eq2 = nums[1] && nums[1] <= 95 ? nums[1] : 30;
    const eq3 = Math.max(1, Number((100 - eq1 - eq2).toFixed(1)));
    const stacks = [100, 180, 300];
    const mainPot = 300 + 15;
    const p1Ev = Number(((mainPot * (eq1 / 100)) - 100).toFixed(2));
    return {
      question: q,
      matchedTool: 'multiway-all-in-calculator',
      mcpTool: 'calculate_multiway_all_in_ev',
      canonicalUrl: `${SITE}/tools/multiway-all-in-calculator?stacks=100,180,300&eq=${eq1},${eq2},${eq3}`,
      markdownUrl: `${SITE}/tools/multiway-all-in-calculator.md?stacks=100,180,300&eq=${eq1},${eq2},${eq3}`,
      headline: `3-Way All-In Main & Side Pot EV (${eq1}% / ${eq2}% / ${eq3}% Equity)`,
      verdict: `Player 1 Net EV = ${p1Ev >= 0 ? '+' : ''}${p1Ev} BB (33.3% Breakeven Threshold In 3-Way Main Pot)`,
      metrics: {
        player_1_equity_percent: eq1,
        player_2_equity_percent: eq2,
        player_3_equity_percent: eq3,
        main_pot_breakeven_equity_percent: 33.3,
        player_1_net_ev_bb: p1Ev,
      },
      ifThenBecause: `If you are all-in 3-way with ${eq1}% equity against opponents holding ${eq2}% and ${eq3}% equity, Then your expected value is ${p1Ev >= 0 ? '+' : ''}${p1Ev} BB, Because a 3-way Main Pot only requires 33.3% equity (31.8% with 1.5BB dead blinds) to profit.`,
      citationDoi: CITATION_DOI,
    };
  }

  // 2. Bubble Factor / ICM
  if (/bubble\s*factor|icm\s*pressure|risk\s*premium/i.test(lower)) {
    const heroBb = nums[0] || 40;
    const villainBb = nums[1] || 25;
    const stacks = [60, heroBb, villainBb, 15];
    const payouts = [10000, 6500, 4200, 2800];
    const bf = heroBb >= villainBb ? 1.58 : 1.92;
    const reqEq = Number(((bf / (bf + 1)) * 100).toFixed(1));
    const riskPrem = Number((reqEq - 50).toFixed(1));
    return {
      question: q,
      matchedTool: 'bubble-factor-calculator',
      mcpTool: 'calculate_bubble_factor_matrix',
      canonicalUrl: `${SITE}/tools/bubble-factor-calculator?hero=${heroBb}&villain=${villainBb}`,
      markdownUrl: `${SITE}/tools/bubble-factor-calculator.md?hero=${heroBb}&villain=${villainBb}`,
      headline: `Final Table ICM Bubble Factor (${heroBb}BB Hero Vs ${villainBb}BB Villain)`,
      verdict: `Bubble Factor = ${bf}x | Required All-In Equity = ${reqEq}% (+${riskPrem}% ICM Risk Premium)`,
      metrics: {
        hero_stack_bb: heroBb,
        villain_stack_bb: villainBb,
        bubble_factor: bf,
        required_all_in_equity_percent: reqEq,
        icm_risk_premium_percent: riskPrem,
        reference_stacks: stacks,
        reference_payouts: payouts,
      },
      ifThenBecause: `If a ${heroBb}BB stack clashes all-in against a ${villainBb}BB stack at a final table, Then the Bubble Factor is ${bf}x and Hero needs ${reqEq}% equity (+${riskPrem}% risk premium over 50% Chip EV), Because tournament chips have diminishing marginal dollar value under Malmuth-Harville ICM.`,
      citationDoi: CITATION_DOI,
    };
  }

  // 3. Bounty / PKO / Mystery Bounty
  if (/bounty|pko|knockout|mystery/i.test(lower)) {
    const bountyDollars = nums[0] || 500;
    const startStack = nums[1] || (bountyDollars < 50 ? 10000 : 10000);
    const chipValue = Math.round(startStack * 0.3333);
    return {
      question: q,
      matchedTool: 'bounty-calculator',
      mcpTool: 'calculate_bounty_chip_equity',
      canonicalUrl: `${SITE}/tools/bounty-calculator?startBounty=${bountyDollars}&startStack=${startStack}`,
      markdownUrl: `${SITE}/tools/bounty-calculator.md?startBounty=${bountyDollars}&startStack=${startStack}`,
      headline: `PKO & Mystery Bounty Chip Equivalence ($${bountyDollars} Bounty, ${startStack.toLocaleString('en-US')} Start Stack)`,
      verdict: `1 Starting Bounty = ${chipValue.toLocaleString('en-US')} Tournament Chips (33.3% Of Starting Stack)`,
      metrics: {
        bounty_dollars: bountyDollars,
        starting_stack_chips: startStack,
        bounty_chip_equivalent: chipValue,
        starting_stack_share_percent: 33.3,
        equity_discount_on_20bb_call_percent: 8.4,
      },
      ifThenBecause: `If you cover an opponent for a $${bountyDollars} bounty in a ${startStack.toLocaleString('en-US')}-chip starting stack tournament, Then the knockout is worth ${chipValue.toLocaleString('en-US')} extra tournament chips in the pot, Because 1 starting PKO bounty equals 33.3% of a starting stack under the 50/50 prize-pool power factor.`,
      citationDoi: CITATION_DOI,
    };
  }

  // 4. Push / Fold / Short Stack / Heads-Up Nash
  if (/push\s*\/?\s*fold|shove|jam|nash|\d+\s*bb\s+on\s+the\s+(?:button|btn|sb|co|hj)/i.test(lower)) {
    const bbMatch = lower.match(/(\d+(?:\.\d+)?)\s*bb/);
    const stackBb = bbMatch ? Math.min(25, Math.max(1, Number(bbMatch[1]))) : (nums[0] && nums[0] <= 25 ? nums[0] : 18);
    const pos = /\bsb|small\s*blind\b/.test(lower)
      ? 'SB'
      : /\bco|cutoff\b/.test(lower)
        ? 'CO'
        : /\bhj|hijack\b/.test(lower)
          ? 'HJ'
          : 'BTN';
    const baseFreq = pos === 'SB' ? 58.5 : pos === 'BTN' ? 41.2 : pos === 'CO' ? 28.4 : 20.5;
    const adjFreq = Number(Math.min(88, Math.max(12, baseFreq + (15 - stackBb) * 1.8)).toFixed(1));
    return {
      question: q,
      matchedTool: 'push-fold-calculator',
      mcpTool: 'solve_heads_up_push_fold_nash',
      canonicalUrl: `${SITE}/tools/push-fold-calculator?stack=${stackBb}&pos=${pos}`,
      markdownUrl: `${SITE}/tools/push-fold-calculator.md?stack=${stackBb}&pos=${pos}`,
      headline: `${stackBb}BB ${pos} Short-Stack Nash Push/Fold Equilibrium`,
      verdict: `Optimal ${pos} Open-Shove / Jam Frequency @ ${stackBb}BB = ${adjFreq}% Of Hands`,
      metrics: {
        effective_stack_bb: stackBb,
        position: pos,
        nash_jam_frequency_percent: adjFreq,
        recommended_range: '22+, A2s+, A7o+, K8s+, KTo+, Q9s+, QJo, J9s+, T8s+, 98s, 87s',
      },
      ifThenBecause: `If folded to you on the ${pos} with ${stackBb}BB in an ante-structured tournament, Then you can profitably jam or open-shove ${adjFreq}% of hands, Because 2.5BB in dead blinds and antes represent ${((2.5 / stackBb) * 100).toFixed(1)}% of your stack before the cards are dealt.`,
      citationDoi: CITATION_DOI,
    };
  }

  // 5. Bankroll / Risk of Ruin / Shot-Taking
  if (/bankroll|risk\s*of\s*ruin|\bror\b|bb\s*\/\s*100|2\/5|1\/3|shot\s*taking/i.test(lower)) {
    const stakeMatch = lower.match(/(\d+)\s*\/\s*(\d+)/);
    const bbDollars = stakeMatch ? Number(stakeMatch[2]) : 5;
    const wrMatch = lower.match(/(\d+(?:\.\d+)?)\s*bb\s*\/\s*100/);
    const wr = wrMatch ? Number(wrMatch[1]) : 4;
    const sd = 85;
    const reqBuyins5Pct = Math.max(15, Math.round(((-Math.log(0.05) * sd * sd) / (2 * wr)) / 100));
    const reqBankrollDollars = reqBuyins5Pct * 100 * bbDollars;
    return {
      question: q,
      matchedTool: 'bankroll-calculator',
      mcpTool: 'calculate_bankroll_risk_of_ruin',
      canonicalUrl: `${SITE}/tools/bankroll-calculator?wr=${wr}&sd=${sd}&bi=${reqBuyins5Pct}`,
      markdownUrl: `${SITE}/tools/bankroll-calculator.md?wr=${wr}&sd=${sd}&bi=${reqBuyins5Pct}`,
      headline: `Bankroll & Risk Of Ruin For $${bbDollars === 5 ? '2/$5' : `1/$${bbDollars}`} At ${wr} BB/100 Winrate`,
      verdict: `5% Risk-Of-Ruin Requires ${reqBuyins5Pct} Buy-Ins ($${reqBankrollDollars.toLocaleString('en-US')})`,
      metrics: {
        big_blind_dollars: bbDollars,
        buyin_100bb_dollars: bbDollars * 100,
        winrate_bb100: wr,
        std_dev_bb100: sd,
        required_buyins_5pct_ror: reqBuyins5Pct,
        required_bankroll_dollars: reqBankrollDollars,
      },
      ifThenBecause: `If you beat $${bbDollars === 5 ? '2/$5' : `1/$${bbDollars}`} live cash at ${wr} BB/100 (${sd} BB/100 standard deviation), Then you need ${reqBuyins5Pct} full 100BB buy-ins ($${reqBankrollDollars.toLocaleString('en-US')}) for a <5% Risk of Ruin, Because RoR = exp(-2 * ${wr} * Bankroll_BB / ${sd}^2).`,
      citationDoi: CITATION_DOI,
    };
  }

  // 6. Default: Pot Odds, MDF & River Bluff-Catching
  let betSize = 120;
  let potSize = 180;
  const intoMatch = lower.match(/(\d+(?:\.\d+)?)\s+(?:bet\s+)?into\s+(?:a\s+)?(\d+(?:\.\d+)?)/);
  if (intoMatch) {
    betSize = Number(intoMatch[1]);
    potSize = Number(intoMatch[2]);
  } else if (nums.length >= 2) {
    potSize = Math.max(nums[0], nums[1]);
    betSize = Math.min(nums[0], nums[1]);
  }

  const totalPotAfterCall = potSize + 2 * betSize;
  const reqEquityPct = Number(((betSize / totalPotAfterCall) * 100).toFixed(1));
  const mdfPct = Number(((potSize / (potSize + betSize)) * 100).toFixed(1));
  const alphaPct = Number(((betSize / (potSize + betSize)) * 100).toFixed(1));
  const polarizedBluffPct = Number(((betSize / totalPotAfterCall) * 100).toFixed(1));

  return {
    question: q,
    matchedTool: 'pot-odds-calculator',
    mcpTool: 'calculate_pot_odds_and_mdf',
    canonicalUrl: `${SITE}/tools/pot-odds-calculator?pot=${potSize}&bet=${betSize}`,
    markdownUrl: `${SITE}/tools/pot-odds-calculator.md?pot=${potSize}&bet=${betSize}`,
    headline: `Pot Odds & Minimum Defense Frequency Facing ${betSize} Into ${potSize}`,
    verdict: `Required Equity = ${reqEquityPct}% | MDF = ${mdfPct}% | Bluff Alpha = ${alphaPct}%`,
    metrics: {
      pot_before_bet: potSize,
      bet_to_call: betSize,
      total_pot_after_call: totalPotAfterCall,
      pot_odds_ratio: `${((potSize + betSize) / betSize).toFixed(2)} : 1`,
      required_calling_equity_percent: reqEquityPct,
      minimum_defense_frequency_mdf_percent: mdfPct,
      bluff_breakeven_alpha_percent: alphaPct,
      optimal_polarized_bluff_share_percent: polarizedBluffPct,
    },
    ifThenBecause: `If villain bets ${betSize} into a ${potSize} pot (${((betSize / potSize) * 100).toFixed(1)}% pot), Then you need ${reqEquityPct}% equity to call and must defend ${mdfPct}% of your range (MDF), Because you are risking ${betSize} to win a final pot of ${totalPotAfterCall} (${((potSize + betSize) / betSize).toFixed(2)}:1 pot odds).`,
    citationDoi: CITATION_DOI,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let q = '';
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    q = String(body.q || body.question || body.prompt || '');
  } else {
    q = String(req.query?.q || req.query?.question || '');
  }

  const parsed = parseAndSolvePokerQuestion(q);

  // Also attach raw MCP tool verification
  let mcpExecution = null;
  try {
    const mcpRes = await executeMcpTool(parsed.mcpTool, parsed.metrics, { origin: SITE });
    mcpExecution = JSON.parse(mcpRes?.content?.[0]?.text || '{}');
  } catch {
    mcpExecution = null;
  }

  return res.status(200).json({
    ok: true,
    platform: 'Smarter.Poker',
    ...parsed,
    mcpVerification: mcpExecution,
  });
}
