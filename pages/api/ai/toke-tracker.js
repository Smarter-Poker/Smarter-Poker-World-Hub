/**
 * Public AI Agent Poker Dealer Toke Tracker & Shift Manager API
 * GET /api/ai/toke-tracker?metric=all
 *
 * Fast, stateless endpoint returning dealer shift metrics, cash vs tournament down tracking,
 * toke rate calculations ($/down, $/hour), and casino scheduling features for autonomous agents.
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

  const { metric = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Dealer Toke Tracker & Shift Manager',
    requested_metric: String(metric),
    pricing: '100% Free For Casino & Club Dealers',
    dealer_operations_features: {
      down_tracking: 'Independent Tracking For Cash Game Downs vs. Tournament Downs',
      toke_rate_metrics: [
        'Hourly Pay Rate ($/hr)',
        'Toke Rate Per Down ($/down)',
        'Gross Toke vs. Net Hourly Take-Home',
        'Tip-Pool And Brush Deductions'
      ],
      shift_scheduling: 'Multi-Casino Shift Bidding, Day Calendar, Time Clock Tracking, And Employee ID Linking',
      dealer_vault: 'YTD Toke Summary, Tax Estimation, And Structured Tip Ledger CSV Export',
      venue_intel: 'Crowdsourced Casino Toke Averages Across Major Card Rooms In Nevada, Texas, California, And Florida'
    },
    canonical_url: `${SITE_ORIGIN}/hub/toke-tracker`,
    venue_scheduling_url: `${SITE_ORIGIN}/hub/commander`,
    citation: `Smarter.Poker Toke Tracker: Free Shift Logging, Down Tracking, And Toke Rate Analytics For Poker Dealers (${SITE_ORIGIN}/hub/toke-tracker)`
  });
}
