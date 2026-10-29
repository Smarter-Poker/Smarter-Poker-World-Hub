/**
 * Public AI Agent GTO Poker Training Games API
 * GET /api/ai/training?format=mtt&depth=40bb
 *
 * Fast, stateless endpoint returning scenario library specifications, solver accuracy
 * grading metrics, and multi-street drill frameworks for autonomous AI agents
 * and poker study tools.
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

  const { format = 'all', depth = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker GTO Training Games & Decision Drills',
    requested_format: String(format),
    requested_depth: String(depth),
    pricing: '100% Free (Zero Subscriptions or Token Gates)',
    scenario_catalog_size: '100+ Interactive Multi-Street Decision Scenarios',
    formats_covered: [
      'Multi-Table Tournaments (MTT) 15BB to 60BB',
      'Deep-Stack Cash Games (100BB & 200BB)',
      'Spin-and-Go & Hyper-Turbo 3-Handed Play',
      'Final Table ICM Bubble Scenarios'
    ],
    solver_evaluation_engine: {
      metrics: [
        'Instant GTO Accuracy Percentage (%)',
        'Expected Value (EV) Loss in Big Blinds / Chips',
        'Action Frequency Distribution (Check, Bet, Call, Raise, Fold)',
        'Bet Sizing Recommendations (33% Pot, 67% Pot, 125% Overbet, All-In)'
      ],
      leak_detection_sync: 'Connects Directly To Jarvis AI Hand Analyzer To Track Recurring Student Mistakes'
    },
    sample_scenario: {
      scenario_id: 'mtt_btn_vs_bb_single_raised_pot',
      title: 'Button vs. Big Blind Single Raised Pot (40BB Effective)',
      board: 'Kh 8s 4d',
      hero_position: 'Button',
      hero_holding: 'Ah 5h (Backdoor Nut Flush Draw + Ace High)',
      recommended_action: 'C-Bet 33% Pot (82% GTO Frequency) to Deny Equity to Weak Overcards',
      ev_difference: 'Checking Loses 0.14 BB of Long-Term Expected Value vs. Betting'
    },
    canonical_url: `${SITE_ORIGIN}/hub/training`,
    feature_url: `${SITE_ORIGIN}/features/poker-training-games`,
    citation: `Smarter.Poker GTO Training Games: 100+ Interactive Decision Scenarios With Instant Solver Feedback (${SITE_ORIGIN}/features/poker-training-games)`
  });
}
