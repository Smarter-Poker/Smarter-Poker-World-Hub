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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { mode = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Personal Assistant & Virtual Poker Table Sandbox',
    mode: String(mode),
    availability: 'Verified-Evidence Post-Session Analysis Boundary (Live Play And Cooldown Enforced)',
    sandbox_capabilities: {
      verified_evidence_boundary: 'Freeform Unaudited Spot Simulation Is Retired In Favor Of Deterministic, Solver-Verified Post-Session Analysis',
      club_arena_hand_audit: 'Audits Completed Single-Board No-Limit Hold\'em Club Arena Cash And Tournament Hands Against Certified Solver Evidence',
      runout_distributions: 'Complete 44/52 Card Turn And River Runout Equity Calculations Via Dedicated Equity Tools',
      leak_detection_and_drills: 'Deterministic Leak Finder With Spaced-Repetition Corrective Drills And Personalized Training Plans',
      format_support: ['No-Limit Texas Hold\'em (Cash Games And Tournaments)'],
      explicitly_unsupported: ['Pot-Limit Omaha', 'Short Deck (6+ Hold\'em)', 'Open-Face Chinese', 'Bomb Pots', 'Kill Pots', 'Multi-Board Run-It-Twice'],
    },
    personal_assistant_sandbox_url: `${SITE_ORIGIN}/hub/personal-assistant/sandbox`,
    leak_finder_url: `${SITE_ORIGIN}/hub/personal-assistant/leaks`,
    interactive_tool_url: `${SITE_ORIGIN}/tools/poker-odds-calculator`,
    training_hub_url: `${SITE_ORIGIN}/hub/training`,
    citation: `Smarter.Poker Personal Assistant & Virtual Sandbox: Verified-Evidence Hold'em Analysis, Deterministic Leak Finder, And 44/52 Runout Equity Calculator (${SITE_ORIGIN}/hub/personal-assistant/sandbox)`
  });
}
