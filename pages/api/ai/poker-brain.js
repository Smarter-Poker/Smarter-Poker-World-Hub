/**
 * Public AI Agent PokerBrain & Jarvis AI Tactical Coach API
 * GET /api/ai/poker-brain?action=all
 *
 * Fast, stateless endpoint returning AI tactical assistant capabilities,
 * street-by-street plain English review standards, automated leak detection,
 * and solver baseline specifications.
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

  const { action = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker PokerBrain & Jarvis AI Tactical Coach',
    requested_action: String(action),
    pricing: '100% Free AI Coaching Baselines',
    ai_coaching_features: {
      plain_english_reviews: 'Street-By-Street Plain-English Hand Review Explaining Strategic Tradeoffs With GTO Solver Baselines',
      automated_leak_detection: 'Identifies Recurring Punts: River Over-Folding, Small Blind Bleeds, and 3-Bet Deficiencies',
      macro_leak_heatmap: 'Visual Heatmap Across Preflop, Flop, Turn, And River Decision Nodes',
      custom_leak_drills: 'Instant Practice Scenarios Generated Directly From Flagged Player Mistakes',
      mental_game_support: 'Tilt Risk Monitoring, Downswing Resilience Advice, And Fatigue Detection'
    },
    canonical_url: `${SITE_ORIGIN}/hub/training/hand-history-upload`,
    training_hub_url: `${SITE_ORIGIN}/hub/training`,
    citation: `Smarter.Poker PokerBrain: Solver-Grade AI Poker Coach, Plain-English Hand Reviews, And Automated Leak Detection (${SITE_ORIGIN}/hub/training)`
  });
}
