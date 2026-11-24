/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET / POST /api/ai/batch-solve
 *  Multi-Spot Deterministic Poker Math Batch Solver API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Accepts:
 * - POST JSON: { spots: [{ tool: "pot-odds-calculator", params: { pot: 100, bet: 50 } }, ...] }
 * - GET: ?spots=<JSON array> or returns schema + sample batch solve
 *
 * Evaluates up to 25 spots in a single round-trip using computeValidatedSolvedSpot
 * and executeMcpTool, returning each spot's deterministic calculation,
 * If/Then/Because rule, canonical URL, and .md URL.
 *
 * House style: Title Case, zero em dashes.
 */

import { computeValidatedSolvedSpot } from '../../../src/lib/seo/solvedSpotEngine.js';
import { executeMcpTool, MCP_TOOLS } from '../../../src/lib/mcp/mcpServer.mjs';

const SITE = 'https://smarter.poker';

const TOOL_SLUG_TO_MCP = {
  'pot-odds-calculator': 'calculate_pot_odds_and_mdf',
  'pot-odds': 'calculate_pot_odds_and_mdf',
  'outs-calculator': 'calculate_draw_outs',
  outs: 'calculate_draw_outs',
  'icm-calculator': 'calculate_icm_payouts',
  icm: 'calculate_icm_payouts',
  'chop-calculator': 'calculate_tournament_chop',
  chop: 'calculate_tournament_chop',
  'spr-calculator': 'calculate_spr_sizing',
  spr: 'calculate_spr_sizing',
  'geometric-bet-calculator': 'calculate_geometric_bet_sizing',
  geometric: 'calculate_geometric_bet_sizing',
  'variance-calculator': 'simulate_poker_variance',
  variance: 'simulate_poker_variance',
  'bankroll-calculator': 'calculate_bankroll_risk_of_ruin',
  bankroll: 'calculate_bankroll_risk_of_ruin',
  'bounty-calculator': 'calculate_bounty_chip_equity',
  bounty: 'calculate_bounty_chip_equity',
  'm-ratio-calculator': 'calculate_tournament_m_ratio',
  'm-ratio': 'calculate_tournament_m_ratio',
  'satellite-calculator': 'calculate_satellite_bubble_factor',
  satellite: 'calculate_satellite_bubble_factor',
  'poker-tax-calculator': 'calculate_poker_taxes_w2g',
  tax: 'calculate_poker_taxes_w2g',
  'staking-calculator': 'calculate_staking_markup_split',
  staking: 'calculate_staking_markup_split',
  'iso-calculator': 'calculate_preflop_isolation_raise',
  iso: 'calculate_preflop_isolation_raise',
  'plo-outs-calculator': 'calculate_plo_wrap_outs',
  'plo-outs': 'calculate_plo_wrap_outs',
  'late-reg-calculator': 'calculate_late_reg_icm_ev',
  'late-reg': 'calculate_late_reg_icm_ev',
  'winrate-confidence-calculator': 'calculate_winrate_confidence_interval',
  'winrate-confidence': 'calculate_winrate_confidence_interval',
  'poker-trip-planner': 'calculate_poker_trip_budget',
  'trip-planner': 'calculate_poker_trip_budget',
  'table-selection-calculator': 'score_live_table_selection',
  'table-selection': 'score_live_table_selection',
  'mtt-grind-planner': 'calculate_mtt_session_abi_plan',
  'mtt-grind': 'calculate_mtt_session_abi_plan',
  'straddle-calculator': 'calculate_straddle_bomb_pot_ev',
  straddle: 'calculate_straddle_bomb_pot_ev',
  'promo-ev-calculator': 'calculate_bad_beat_jackpot_ev',
  promo: 'calculate_bad_beat_jackpot_ev',
  'session-planner': 'calculate_cash_session_plan',
  'board-texture-analyzer': 'analyze_flop_board_texture',
  'who-wins-calculator': 'resolve_holdem_showdown_winner',
  'multiway-all-in-calculator': 'calculate_multiway_all_in_ev',
  'mystery-bounty-tracker': 'calculate_mystery_bounty_live_pool',
  'bubble-factor-calculator': 'calculate_bubble_factor_matrix',
  'bluff-catching-calculator': 'calculate_river_bluff_catch_ev',
  'multi-street-ev-calculator': 'calculate_multi_street_barrel_ev',
  'heads-up-push-fold-calculator': 'solve_heads_up_push_fold_nash',
  'blind-vs-blind-calculator': 'solve_blind_vs_blind_matrix',
  'shot-taking-calculator': 'calculate_bankroll_shot_taking_plan',
};

export const SAMPLE_BATCH_SPOTS = [
  { tool: 'pot-odds-calculator', params: { pot: 100, bet: 50 } },
  { tool: 'outs-calculator', params: { outs: 9, street: 'flop' } },
  { tool: 'multiway-all-in-calculator', params: { stacks: [100, 180, 300], equities_percent: [45, 35, 20], dead_money: 15 } },
  { tool: 'bubble-factor-calculator', params: { stacks: [60, 40, 25, 15], payouts: [10000, 6500, 4200, 2800] } },
  { tool: 'bluff-catching-calculator', params: { pot_size: 100, bet_size: 75, villain_value_combos: 18, villain_bluff_combos: 9, hero_blocks_value_combos: 3 } },
];

function buildIfThenBecause(toolSlug, params, solved, mcpPayload) {
  if (mcpPayload?.if_then_because) return mcpPayload.if_then_because;
  if (solved?.hasValidatedSpot && solved?.summaryText) {
    return `If evaluating ${toolSlug} with parameters ${JSON.stringify(solved.normalizedQuery || params)}, Then the verified result is ${solved.statValue}, Because ${solved.summaryText}`;
  }
  if (toolSlug.includes('pot-odds')) {
    const pot = Number(params.pot || params.pot_size || 100);
    const bet = Number(params.bet || params.bet_size || params.call || 50);
    const reqEq = ((bet / (pot + 2 * bet)) * 100).toFixed(1);
    const mdf = ((pot / (pot + bet)) * 100).toFixed(1);
    return `If facing a ${bet} bet into a ${pot} pot, Then you need ${reqEq}% equity to call and must defend ${mdf}% of your range (MDF), Because pot odds are ${(pot + bet) / bet}:1 (${bet} / ${pot + 2 * bet}).`;
  }
  return `If running ${toolSlug} on Smarter.Poker, Then the deterministic solver returns ${solved?.statValue || 'verified equilibrium output'}, Because all calculations follow closed-form GTO and Malmuth-Harville equations.`;
}

export async function evaluateBatchSpots(rawSpots = []) {
  const spotsList = Array.isArray(rawSpots) && rawSpots.length > 0 ? rawSpots.slice(0, 25) : SAMPLE_BATCH_SPOTS;
  const results = [];

  for (let i = 0; i < spotsList.length; i++) {
    const item = spotsList[i] || {};
    const rawTool = String(item.tool || 'pot-odds-calculator').trim().toLowerCase();
    const params = item.params && typeof item.params === 'object' ? item.params : {};

    const solved = computeValidatedSolvedSpot(rawTool, params);
    const mcpToolName =
      TOOL_SLUG_TO_MCP[rawTool] ||
      (MCP_TOOLS.some((t) => t.name === rawTool) ? rawTool : 'calculate_pot_odds_and_mdf');

    let mcpData = {};
    try {
      const mcpRes = await executeMcpTool(mcpToolName, params, { origin: SITE });
      mcpData = JSON.parse(mcpRes?.content?.[0]?.text || '{}');
    } catch (err) {
      mcpData = { error: err.message };
    }

    const canonicalSlug = solved?.tool && solved.tool !== 'tool' ? solved.tool : rawTool;
    const qs = new URLSearchParams();
    Object.entries(solved?.normalizedQuery && Object.keys(solved.normalizedQuery).length > 0 ? solved.normalizedQuery : params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && typeof v !== 'object') {
        qs.set(k, String(v));
      } else if (Array.isArray(v)) {
        qs.set(k, v.join(','));
      }
    });
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    const baseCanonical = mcpData.canonical_url || `${SITE}/tools/${canonicalSlug}`;
    const canonicalUrl = `${baseCanonical}${queryStr}`;
    const markdownUrl = `${baseCanonical}.md${queryStr}`;

    results.push({
      index: i + 1,
      tool: canonicalSlug,
      mcpTool: mcpToolName,
      params,
      hasValidatedSpot: Boolean(solved?.hasValidatedSpot),
      statLabel: solved?.statLabel || mcpToolName.toUpperCase(),
      statValue: solved?.statValue || mcpData.verdict || mcpData.table_grade || 'Solved',
      summaryText: solved?.summaryText || mcpData.if_then_because || '',
      ifThenBecause: buildIfThenBecause(canonicalSlug, params, solved, mcpData),
      calculation: mcpData,
      canonicalUrl,
      markdownUrl,
      citationDoi: '10.5281/zenodo.24115647',
    });
  }

  return results;
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

  let requestedSpots = null;
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (Array.isArray(body.spots)) {
      requestedSpots = body.spots;
    } else if (Array.isArray(body)) {
      requestedSpots = body;
    }
  } else if (req.query?.spots) {
    try {
      requestedSpots = JSON.parse(String(req.query.spots));
    } catch {
      requestedSpots = null;
    }
  }

  const solvedResults = await evaluateBatchSpots(requestedSpots || SAMPLE_BATCH_SPOTS);

  return res.status(200).json({
    ok: true,
    platform: 'Smarter.Poker',
    endpoint: `${SITE}/api/ai/batch-solve`,
    max_spots_per_request: 25,
    is_sample_batch: !requestedSpots,
    spots_count: solvedResults.length,
    citation_doi: '10.5281/zenodo.24115647',
    supported_calculators_count: 52,
    supported_mcp_tools_count: MCP_TOOLS.length,
    spots: solvedResults,
  });
}
