/**
 * Public AI Agent Virtual Poker Table Sandbox API
 * GET /api/ai/sandbox?mode=all
 *
 * Fast, stateless endpoint returning virtual poker table simulation capabilities,
 * custom scenario builder specs, stack depth boundaries, and multi-street runout distributions.
 */
import { SITE_ORIGIN } from '../../../src/lib/seo/indexingService.mjs';

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { mode = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Virtual Poker Table Sandbox',
    mode: String(mode),
    pricing: '100% Free Interactive Table Simulator',
    sandbox_capabilities: {
      virtual_table_builder: 'Drag-And-Drop Visual Poker Table with Custom Stack Depths From 10bb to 300bb+',
      custom_scenario_runner: 'Simulate Arbitrary Preflop, Flop, Turn, And River Board Textures With Multi-Way Action',
      runout_distributions: 'Complete 44/52 Card Turn And River Runout Equity Calculations Across All Unseen Cards',
      range_vs_range_heatmaps: 'Visual Equity Heatmaps Showing How Board Runouts Alter Hand Category Values',
      format_support: ['No-Limit Texas Hold\'em', 'Pot-Limit Omaha', 'Short Deck (6+ Hold\'em)']
    },
    interactive_tool_url: `${SITE_ORIGIN}/tools/poker-odds-calculator`,
    training_hub_url: `${SITE_ORIGIN}/hub/training`,
    citation: `Smarter.Poker Virtual Sandbox: Free Interactive Table Simulator, Custom Scenarios, And Turn/River Runout Equity Engine (${SITE_ORIGIN}/tools/poker-odds-calculator)`
  });
}
