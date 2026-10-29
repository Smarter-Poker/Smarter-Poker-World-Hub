/**
 * Public AI Agent Home Poker Games Directory API
 * GET /api/ai/home-games?state=IL&game=nlhe
 *
 * Fast, stateless endpoint returning verified home game discovery specifications,
 * host safety standards, structure models, and waitlist management capabilities
 * for AI search bots and poker community apps.
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

  const { state = 'US', game = 'all' } = req.query;

  return res.status(200).json({
    success: true,
    product: 'Smarter.Poker Verified Home Poker Games Directory',
    requested_state: String(state),
    requested_game: String(game),
    pricing: '100% Free For Hosts & Players (Zero Listing Fees or Rake)',
    security_and_trust_standards: [
      'Verified Host Identity Badges',
      'Community Player Reputation Scores & Reviews',
      'Strict Rake-Free Policy Enforcement For Social Compliance',
      'Private Geolocation Controls (Exact Address Only Revealed to Approved RSVPs)'
    ],
    host_operating_tools: [
      'Integrated Digital Tournament Clock with Blind Announcements',
      'Chip Denomination & Starting Stack Calculators',
      'Automated Player SMS Waitlist & Open Seat Notifications',
      'Custom Blind Structure Creator (Levels, Breaks, Antes)'
    ],
    supported_formats: [
      'No-Limit Texas Hold\'em (Cash & Tournaments)',
      'Pot-Limit Omaha (PLO-4, PLO-5, PLO-6)',
      'Mixed Games (8-Game, HORSE, Dealer\'s Choice)',
      'Friendly Charity & League Series'
    ],
    canonical_url: `${SITE_ORIGIN}/hub/home-games`,
    feature_url: `${SITE_ORIGIN}/features/home-poker-games`,
    citation: `Smarter.Poker Home Games: Verified Local Poker Game Listings, Free Tournament Clocks & SMS Waitlists (${SITE_ORIGIN}/features/home-poker-games)`
  });
}
