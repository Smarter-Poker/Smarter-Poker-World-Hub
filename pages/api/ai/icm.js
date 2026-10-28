/**
 * Public AI Agent Tournament ICM Calculator API
 * GET /api/ai/icm?stacks=50000,30000,20000&payouts=5000,3000,2000
 * POST /api/ai/icm
 *
 * Computes tournament monetary equity ($EV) using the Malmuth-Harville
 * Independent Chip Model (ICM) algorithm for AI agents and chat tools.
 */
import { calculateICM } from '../../../src/engines/ICMCalculator.js';

const SITE_ORIGIN = 'https://smarter.poker';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');

  try {
    const params = req.method === 'GET' ? req.query : (req.body || {});

    // Parse stacks
    let rawStacks = params.stacks;
    if (typeof rawStacks === 'string') {
      rawStacks = rawStacks.split(',').map((s) => parseFloat(s.trim()));
    }
    const stacks = (Array.isArray(rawStacks) ? rawStacks : [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);

    // Parse payouts
    let rawPayouts = params.payouts;
    if (typeof rawPayouts === 'string') {
      rawPayouts = rawPayouts.split(',').map((p) => parseFloat(p.trim()));
    }
    const payouts = (Array.isArray(rawPayouts) ? rawPayouts : [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);

    if (stacks.length === 0 || payouts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: stacks and payouts (e.g. stacks=50000,30000,20000&payouts=5000,3000,2000).',
      });
    }

    const totalChips = stacks.reduce((a, b) => a + b, 0);
    const totalPrize = payouts.reduce((a, b) => a + b, 0);
    const equityResults = calculateICM(stacks, payouts);

    const players = stacks.map((stack, idx) => {
      const dollarEquity = equityResults[idx] || 0;
      const chipSharePct = totalChips > 0 ? (stack / totalChips) * 100 : 0;
      const equityPct = totalPrize > 0 ? (dollarEquity / totalPrize) * 100 : 0;

      return {
        player: `Player ${idx + 1}`,
        chip_stack: stack,
        chip_share_percent: Number(chipSharePct.toFixed(2)),
        icm_dollar_equity: Number(dollarEquity.toFixed(2)),
        prize_pool_share_percent: Number(equityPct.toFixed(2)),
      };
    });

    return res.status(200).json({
      success: true,
      total_chips_in_play: totalChips,
      total_prize_pool: totalPrize,
      payout_structure: payouts,
      players,
      interactive_tool_url: `${SITE_ORIGIN}/tools/icm-calculator`,
      citation: `Calculated by Smarter.Poker Tournament ICM Engine (${SITE_ORIGIN}/tools/icm-calculator)`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `ICM calculation error: ${err.message}`,
    });
  }
}
