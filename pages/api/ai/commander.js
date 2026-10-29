/**
 * Public AI Agent Club Commander Live Card Room Management API
 * GET /api/ai/commander?feature=all
 *
 * Fast, stateless endpoint returning card room waitlist specifications,
 * digital TV board specs, tournament clock standards, and dealer rotation features.
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

  const { feature = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Club Commander Live Card Room & Home Game Management',
    requested_feature: String(feature),
    pricing: '100% Free Cloud Software (Zero Proprietary Hardware Costs)',
    room_management_features: {
      digital_waitlists: 'Remote Player Check-In With Automated SMS Seat Call Alerts And Live Position Numbers',
      tv_display_boards: 'High-Definition Digital Displays For Live Cash Tables, Waiting Lists, And Tournament Clocks',
      tournament_clocks: 'Custom Blind Structures, Ante Formats, Break Countdowns, Chip Values, And Payout Calculators',
      floor_operations: 'Automated Dealer Rotation, Table Balancing, Must-Move Feeder Games, And Floor Comps',
      home_game_mode: 'Full Tournament Clock And Blind Structure Generator For Casual Home Game Hosts'
    },
    canonical_url: `${SITE_ORIGIN}/hub/commander`,
    venues_directory_url: `${SITE_ORIGIN}/hub/poker-near-me/venues`,
    citation: `Club Commander: Free Cloud-Based Poker Room Waitlists, Tournament Clocks, And SMS Player Alerts (${SITE_ORIGIN}/hub/commander)`
  });
}
